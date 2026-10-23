// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"fmt"
	"os"
	"os/exec"
	"runtime/debug"
	"strings"
	"time"

	"zentro/internal/utils"
)

// About/update facade — build metadata and update checks (update_service.go).

// Version is set at build time via -ldflags "-X 'zentro/internal/app.Version=v0.8.0'".
// When left empty, main.go fills it from the embedded wails.json (ApplyWailsProductVersion).
var Version = ""

// BuildCommit and BuildDate are set at build time via
// -ldflags "-X 'zentro/internal/app.BuildCommit=<sha>' -X 'zentro/internal/app.BuildDate=<RFC3339 UTC>'".
// Wails passes -buildvcs=false to go build, so Go's own VCS stamp is never
// present in wails-built binaries; the build scripts and CI supply these.
var (
	BuildCommit = ""
	BuildDate   = ""
)

type AboutInfo struct {
	Version       string `json:"version"`
	Commit        string `json:"commit"`
	Date          string `json:"date"`
	OS            string `json:"os"`
	Channel       string `json:"channel"`
	CanAutoUpdate bool   `json:"canAutoUpdate"`
}

func (a *App) GetAboutInfo() AboutInfo {
	info := AboutInfo{
		Version:       Version,
		Commit:        "unknown",
		Date:          "unknown",
		OS:            osArchLabel(),
		Channel:       utils.Channel,
		CanAutoUpdate: canAutoUpdateThisInstall(),
	}

	if value := strings.TrimSpace(BuildCommit); value != "" {
		info.Commit = value
	}
	if value := strings.TrimSpace(BuildDate); value != "" {
		info.Date = value
	}

	buildInfo, ok := debug.ReadBuildInfo()
	if ok {
		for _, setting := range buildInfo.Settings {
			switch setting.Key {
			case "vcs.revision":
				if value := strings.TrimSpace(setting.Value); value != "" && info.Commit == "unknown" {
					info.Commit = value
				}
			case "vcs.time":
				if value := strings.TrimSpace(setting.Value); value != "" && info.Date == "unknown" {
					if t, err := time.Parse(time.RFC3339, value); err == nil {
						info.Date = t.UTC().Format(time.RFC3339)
					} else {
						info.Date = value
					}
				}
			}
		}
	}

	if info.Commit == "unknown" {
		if output, err := gitOutput("rev-parse", "HEAD"); err == nil {
			info.Commit = strings.TrimSpace(string(output))
		}
	}

	if info.Date == "unknown" {
		if output, err := gitOutput("log", "-1", "--format=%cI"); err == nil {
			info.Date = strings.TrimSpace(string(output))
		}
	}

	return info
}

// gitOutput shells out to git the same way exec.Command("git", args...).Output()
// would, but suppresses the console window Windows would otherwise flash for
// this child process (see hideWindow) - this fallback runs on every app
// launch/reload and every About/Feedback open when the binary lacks VCS stamp
// info, so an unsuppressed console here is very noticeable.
func gitOutput(args ...string) ([]byte, error) {
	cmd := exec.Command("git", args...)
	hideWindow(cmd)
	return cmd.Output()
}

func (a *App) GetCurrentVersion() string {
	return Version
}

// WindowTitle returns the app window/taskbar title, distinguishing a nightly
// build so it never gets mistaken for the stable install running alongside
// it (VSCode/Insiders-style side-by-side installs).
func WindowTitle() string {
	if utils.Channel == "nightly" {
		return "Zentro Nightly"
	}
	return "Zentro"
}

// ExportProfilePackage opens a native OS save dialog and writes the given
// JSON profile-package content to the chosen file, instead of the browser
// Blob-download fallback (which saves through the webview, not a native
// dialog). Returns the saved path, or "" if the user cancelled.
func (a *App) ExportProfilePackage(jsonContent string, defaultFileName string) (string, error) {
	filePath, err := a.saveJSONFileDialog("Export Zentro Profile", defaultFileName)
	if err != nil {
		return "", fmt.Errorf("export profile: dialog: %w", err)
	}
	if filePath == "" {
		return "", nil
	}
	if err := os.WriteFile(filePath, []byte(jsonContent), 0o644); err != nil {
		return "", fmt.Errorf("export profile: write file: %w", err)
	}
	return filePath, nil
}

func (a *App) CheckForUpdates() (*UpdateInfo, error) {
	return a.svc.Update.CheckForUpdates(a.GetCurrentVersion())
}

// RestartAndUpdate applies the release described by info: spawns a detached
// helper (Windows only - see update_installer_windows.go) that shows its own
// small window + tray icon and owns the whole download -> verify -> install
// -> relaunch sequence, then quits this instance immediately so the helper
// can replace its binary. The frontend has already shown its own transition
// before calling this - once this returns nil, the app is on its way out.
//
// This is the last point at which anything about the update is observable in
// zentro.log - once ForceQuit runs, the helper's own update-helper.log next
// to it in the same cache dir is the only record until ConsumeLastUpdateResult
// reports back on the next launch.
func (a *App) RestartAndUpdate(info UpdateInfo) error {
	cacheDir, _ := a.svc.Update.UpdateCacheDir()
	if a.logger != nil {
		a.logger.Info("restart-and-update: spawning update helper",
			"version", info.LatestVersion, "downloadUrl", info.DownloadURL, "cacheDir", cacheDir)
	}
	if err := a.svc.Update.SpawnUpdateHelper(info, WindowTitle()); err != nil {
		if a.logger != nil {
			a.logger.Warn("restart-and-update: failed to spawn update helper", "err", err)
		}
		return err
	}
	if a.logger != nil {
		a.logger.Info("restart-and-update: helper spawned - quitting so it can apply the update", "cacheDir", cacheDir)
	}
	a.ForceQuit()
	return nil
}

// LastUpdateResult mirrors UpdateResult across the Wails binding boundary.
type LastUpdateResult struct {
	OK      bool   `json:"ok"`
	Version string `json:"version"`
	Error   string `json:"error"`
}

// ConsumeLastUpdateResult reports whether the update helper that (maybe)
// relaunched this process actually succeeded, so the frontend can surface
// the outcome once on startup - this is the only place that outcome is
// observable, since nothing about the download/install was visible to this
// app (it had already quit while the helper ran). ok=false means there's
// nothing to report (no update was applied since the last time this was
// called).
func (a *App) ConsumeLastUpdateResult() (*LastUpdateResult, bool) {
	result, ok := a.svc.Update.ConsumeLastUpdateResult()
	if !ok {
		return nil, false
	}
	if a.logger != nil {
		if result.OK {
			a.logger.Info("update helper reported success", "version", result.Version)
		} else {
			a.logger.Warn("update helper reported failure", "version", result.Version, "err", result.Error)
		}
	}
	return &LastUpdateResult{OK: result.OK, Version: result.Version, Error: result.Error}, true
}
