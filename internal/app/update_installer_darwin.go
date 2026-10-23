// SPDX-License-Identifier: GPL-3.0-only

//go:build darwin

package app

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"

	"zentro/internal/utils"
)

// updateCacheDirName mirrors update_installer_windows.go's naming, but
// without the space Windows/Linux use for the nightly variant ("Zentro
// Nightly") - kept space-free here so every path this package hands to
// osascript/AppleScript's argv stays simple, even though the elevate.applescript
// below also handles spaces correctly via `quoted form of`. Purely internal,
// never shown to the user, so the naming divergence is harmless.
func updateCacheDirName() string {
	if utils.Channel == "nightly" {
		return "ZentroNightly"
	}
	return "Zentro"
}

func updateCacheDir() (string, error) {
	base, err := os.UserCacheDir()
	if err != nil {
		return "", fmt.Errorf("resolve cache dir: %w", err)
	}
	dir := filepath.Join(base, updateCacheDirName(), "updates")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", fmt.Errorf("create updates cache dir: %w", err)
	}
	return dir, nil
}

// UpdateCacheDir exposes updateCacheDir for logging purposes, mirroring the
// Windows/Linux files.
func (s *UpdateService) UpdateCacheDir() (string, error) {
	return updateCacheDir()
}

const (
	updateHelperScriptName = "update-helper.sh"
	installScriptName      = "install-pkg.sh"
	elevateScriptName      = "elevate.applescript"
	updateHelperLogName    = "update-helper.log"
	updateResultName       = "update-result.json"
)

// installScriptSource is deliberately static (no per-run templating): it
// takes the .pkg path as its one argument, so nothing dynamic ever needs
// escaping into this file's contents.
const installScriptSource = `#!/bin/sh
exec installer -pkg "$1" -target /
`

// elevateScriptSource asks the user for admin authorization (Touch ID or
// password - the same kind of native OS consent prompt Windows' existing
// "-Verb RunAs" UAC elevation already requires, so this isn't a UX
// regression from what Windows already does) and runs install-pkg.sh
// elevated. Also static: AppleScript's `quoted form of` does all the shell
// escaping for both argv items at runtime, so paths with spaces (e.g. a
// differently-named update cache dir, or an app moved somewhere odd) are
// handled correctly without any manual escaping on the Go side.
const elevateScriptSource = `on run argv
    set theScript to item 1 of argv
    set thePkg to item 2 of argv
    do shell script "sh " & quoted form of theScript & " " & quoted form of thePkg with administrator privileges
end run
`

// updateHelperScriptSource is a small POSIX sh script that owns the entire
// post-quit sequence: wait for the old PID to exit, download the new .pkg
// and verify its checksum (there's no macOS equivalent of Linux's
// appimageupdatetool that does this for us), run it elevated via
// elevate.applescript, and relaunch. Placeholders are @@TOKEN@@, matching
// update_installer_windows.go/update_installer_linux.go's convention.
//
// finish always writes the result file and always relaunches the app, on
// every exit path (download failure, checksum mismatch, install failure or
// cancelled auth prompt, install success) - a broken update must never
// strand the user with no running app.
const updateHelperScriptSource = `#!/bin/sh
set -u

target_pid=@@PID@@
log=@@LOG@@
result_path=@@RESULT@@
app_path=@@APP@@
install_script=@@INSTALL@@
elevate_script=@@ELEVATE@@
download_url=@@URL@@
expected_sha256=@@SHA256@@
dest_path=@@DEST@@
version=@@VERSION@@

write_log() {
    printf '%s %s\n' "$(date '+%Y-%m-%dT%H:%M:%S')" "$1" >> "$log" 2>/dev/null || true
}

write_result() {
    printf '{"ok":%s,"version":"%s","error":"%s"}' "$1" "$version" "$2" > "$result_path" 2>/dev/null || true
}

finish() {
    write_result "$1" "$2"
    if [ -n "$2" ]; then write_log "ERROR: $2"; fi
    write_log 'relaunching app'
    open "$app_path" >/dev/null 2>&1 &
    disown 2>/dev/null || true
    write_log 'update helper finished'
}

write_log 'update helper started'

i=0
while kill -0 "$target_pid" 2>/dev/null; do
    i=$((i + 1))
    if [ "$i" -gt 40 ]; then break; fi
    sleep 0.5
done

write_log "downloading $download_url"
if ! curl -fsSL -o "$dest_path" "$download_url" >> "$log" 2>&1; then
    finish false 'download failed'
    exit 0
fi

if [ -n "$expected_sha256" ]; then
    actual_sha256=$(shasum -a 256 "$dest_path" | awk '{print $1}')
    if [ "$actual_sha256" != "$expected_sha256" ]; then
        write_log "checksum mismatch: expected $expected_sha256 got $actual_sha256"
        rm -f "$dest_path"
        finish false 'checksum verification failed'
        exit 0
    fi
    write_log 'checksum verified'
fi

write_log 'installing package (elevated)'
if osascript "$elevate_script" "$install_script" "$dest_path" >> "$log" 2>&1; then
    write_log 'installer succeeded'
    finish true ''
else
    write_log 'installer failed or the admin prompt was cancelled'
    finish false 'installer failed or the admin prompt was cancelled'
fi
`

// buildUpdateHelperScript renders updateHelperScriptSource with its inputs
// substituted in. Kept as a pure function so it's unit-testable without
// spawning anything or touching the filesystem, mirroring
// update_installer_windows.go/update_installer_linux.go's buildUpdateHelperScript.
func buildUpdateHelperScript(pid int, appPath, installScriptPath, elevateScriptPath, downloadURL, checksumSHA256, destPath, version, logPath, resultPath string) string {
	replacer := strings.NewReplacer(
		"@@PID@@", strconv.Itoa(pid),
		"@@LOG@@", shSingleQuoted(logPath),
		"@@RESULT@@", shSingleQuoted(resultPath),
		"@@APP@@", shSingleQuoted(appPath),
		"@@INSTALL@@", shSingleQuoted(installScriptPath),
		"@@ELEVATE@@", shSingleQuoted(elevateScriptPath),
		"@@URL@@", shSingleQuoted(downloadURL),
		"@@SHA256@@", shSingleQuoted(checksumSHA256),
		"@@DEST@@", shSingleQuoted(destPath),
		"@@VERSION@@", shSingleQuoted(version),
	)
	return replacer.Replace(updateHelperScriptSource)
}

// shSingleQuoted wraps s in a POSIX sh single-quoted literal, escaping any
// embedded single quote with the standard '\” trick (close the quote,
// escape a literal quote, reopen). Single-quoted strings suppress every kind
// of shell expansion, so a path is passed through byte for byte.
func shSingleQuoted(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}

// runningAppBundlePath resolves the .app bundle this process is running
// from by walking up from the executable path
// (.../Zentro.app/Contents/MacOS/zentro), rather than hardcoding
// /Applications/Zentro.app - so a user who moved the app still gets it
// relaunched from the right place.
func runningAppBundlePath() (string, error) {
	exePath, err := os.Executable()
	if err != nil {
		return "", fmt.Errorf("resolve current executable: %w", err)
	}
	// .../Zentro.app/Contents/MacOS/zentro -> .../Zentro.app
	appPath := filepath.Dir(filepath.Dir(filepath.Dir(exePath)))
	if filepath.Ext(appPath) != ".app" {
		return "", fmt.Errorf("could not resolve .app bundle from executable path %q", exePath)
	}
	return appPath, nil
}

// SpawnUpdateHelper writes update-helper.sh (plus its two static
// dependencies, install-pkg.sh and elevate.applescript) into the updates
// cache dir and launches it detached. Call this and then quit immediately
// after - from that point on, the wait-for-exit -> download -> verify ->
// elevated-install -> relaunch sequence is the helper's responsibility and
// independent of this process.
func (s *UpdateService) SpawnUpdateHelper(info UpdateInfo, productName string) error {
	if info.DownloadURL == "" {
		return fmt.Errorf("no download URL for this release")
	}
	appPath, err := runningAppBundlePath()
	if err != nil {
		return err
	}

	dir, err := updateCacheDir()
	if err != nil {
		return err
	}

	scriptPath := filepath.Join(dir, updateHelperScriptName)
	installScriptPath := filepath.Join(dir, installScriptName)
	elevateScriptPath := filepath.Join(dir, elevateScriptName)
	logPath := filepath.Join(dir, updateHelperLogName)
	resultPath := filepath.Join(dir, updateResultName)
	destPath := filepath.Join(dir, fmt.Sprintf("zentro-%s-installer.pkg", info.LatestVersion))
	os.Remove(resultPath) // fresh result file per attempt

	if err := os.WriteFile(installScriptPath, []byte(installScriptSource), 0o755); err != nil {
		return fmt.Errorf("write install-pkg script: %w", err)
	}
	if err := os.WriteFile(elevateScriptPath, []byte(elevateScriptSource), 0o644); err != nil {
		return fmt.Errorf("write elevate script: %w", err)
	}

	script := buildUpdateHelperScript(
		os.Getpid(), appPath, installScriptPath, elevateScriptPath,
		info.DownloadURL, info.ChecksumSHA256, destPath, info.LatestVersion,
		logPath, resultPath,
	)
	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		return fmt.Errorf("write update-helper script: %w", err)
	}

	cmd := exec.Command("/bin/sh", scriptPath)
	// New session so the helper survives this process exiting (it must
	// outlive the app it's waiting on, the way the Windows helper's
	// CREATE_BREAKAWAY_FROM_JOB does for the same reason).
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	cmd.Stdin = nil
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("spawn update helper: %w", err)
	}
	return nil
}

// ConsumeLastUpdateResult returns and clears the outcome the update helper
// recorded on its last run, if any - so the app's next launch (which is the
// helper relaunching it) can tell the user whether the update actually took.
func (s *UpdateService) ConsumeLastUpdateResult() (*UpdateResult, bool) {
	dir, err := updateCacheDir()
	if err != nil {
		return nil, false
	}
	p := filepath.Join(dir, updateResultName)
	data, err := os.ReadFile(p)
	if err != nil {
		return nil, false
	}
	os.Remove(p)
	var result UpdateResult
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, false
	}
	return &result, true
}
