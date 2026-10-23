// SPDX-License-Identifier: GPL-3.0-only

package main

import (
	"embed"
	"os"
	"strings"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"

	zentroapp "zentro/internal/app"
	"zentro/internal/core"
	msdriver "zentro/internal/driver/mssql"
	mydriver "zentro/internal/driver/mysql"
	pgdriver "zentro/internal/driver/postgres"
	sqdriver "zentro/internal/driver/sqlite"
	"zentro/internal/netmeter"
	"zentro/internal/sshtunnel"
	"zentro/internal/utils"

	// sql driver side-effect registrations
	_ "github.com/jackc/pgx/v5/stdlib"
	_ "github.com/microsoft/go-mssqldb"
)

//go:embed all:frontend/dist
var assets embed.FS

// wails.json is the source of truth for the product version.
//
//go:embed wails.json
var wailsConfig []byte

func main() {
	zentroapp.ApplyWailsProductVersion(wailsConfig)
	loadDotEnv(".env.txt")
	loadDotEnv(".env")
	// Pattern: Plugin/Module — register drivers here, decoupled from db/ and ui/.
	// Pattern: Factory Method — each New() returns a DatabaseDriver interface.
	//
	// Pattern: Strategy — the SSH tunnel manager plugs into the network
	// drivers as a dial provider, so they never import SSH themselves.
	knownHostsPath, err := utils.SSHKnownHostsPath()
	if err != nil {
		println("Warning: SSH tunnels will fail:", err.Error())
	}
	tunnels := sshtunnel.NewManager(knownHostsPath)
	defer tunnels.Close()
	// Pattern: Decorator — the meter wraps whatever dialer a profile gets
	// (tunnel or direct), so the status bar counts real wire traffic.
	meter := &netmeter.Meter{}
	dial := meter.Wrap(tunnels.DialProvider())
	core.Register(pgdriver.New().WithDialProvider(dial))
	core.Register(msdriver.New().WithDialProvider(dial))
	core.Register(mydriver.New().WithDialProvider(dial))
	core.Register(sqdriver.New())

	// Pattern: Singleton — one App instance for the lifetime of the process.
	app := zentroapp.NewApp(
		zentroapp.WithTrafficMeter(meter),
		zentroapp.WithSSHTunnels(tunnels),
	)
	if projectID := parseLaunchProjectFlag(os.Args[1:]); projectID != "" {
		app.SetLaunchProjectID(projectID)
	}

	err = wails.Run(&options.App{
		Title:     zentroapp.WindowTitle(),
		Width:     1280,
		Height:    800,
		MinWidth:  1224,
		MinHeight: 700,
		Frameless: framelessDefault,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 18, G: 18, B: 18, A: 1},
		OnStartup:        app.Startup,
		OnBeforeClose:    app.OnBeforeClose,
		Mac: &mac.Options{
			TitleBar:             mac.TitleBarHiddenInset(),
			WebviewIsTransparent: true,
			WindowIsTranslucent:  false,
			Appearance:           mac.NSAppearanceNameDarkAqua,
		},
		Bind: []interface{}{
			app,
		},
	})
	if err != nil {
		println("Error:", err.Error())
	}
}

// parseLaunchProjectFlag looks for --project=<id> among the process args.
// Used by "Open in new window" (project_launch.go) to spawn a window
// pointed at a specific project instead of auto-opening the last one.
func parseLaunchProjectFlag(args []string) string {
	const prefix = "--project="
	for _, arg := range args {
		if strings.HasPrefix(arg, prefix) {
			return strings.TrimPrefix(arg, prefix)
		}
	}
	return ""
}

func loadDotEnv(filename string) {
	data, err := os.ReadFile(filename)
	if err != nil {
		return
	}

	for _, rawLine := range strings.Split(string(data), "\n") {
		line := strings.TrimSpace(rawLine)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		key, value, found := strings.Cut(line, "=")
		if !found {
			continue
		}

		name := strings.TrimSpace(key)
		if name == "" {
			continue
		}

		trimmedValue := strings.TrimSpace(value)
		if len(trimmedValue) >= 2 {
			if (strings.HasPrefix(trimmedValue, "\"") && strings.HasSuffix(trimmedValue, "\"")) ||
				(strings.HasPrefix(trimmedValue, "'") && strings.HasSuffix(trimmedValue, "'")) {
				trimmedValue = trimmedValue[1 : len(trimmedValue)-1]
			}
		}

		_ = os.Setenv(name, trimmedValue)
	}
}
