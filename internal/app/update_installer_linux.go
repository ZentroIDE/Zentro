// SPDX-License-Identifier: GPL-3.0-only

//go:build linux

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

// updateCacheDirName mirrors update_installer_windows.go's naming so a
// nightly install staging an update never collides with a stable install's
// staged marker on the same machine.
func updateCacheDirName() string {
	if utils.Channel == "nightly" {
		return "Zentro Nightly"
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
// Windows file.
func (s *UpdateService) UpdateCacheDir() (string, error) {
	return updateCacheDir()
}

const (
	updateHelperScriptName = "update-helper.sh"
	updateHelperLogName    = "update-helper.log"
	updateResultName       = "update-result.json"
)

// updateHelperScriptSource is a small POSIX sh script (sh, not bash, is
// guaranteed on every distro an AppImage can even run on) that owns the
// entire post-quit sequence: wait for the old PID to exit, run
// appimageupdatetool (bundled at $APPDIR/usr/bin at build time - see
// scripts/build-appimage.sh - so this needs no network fetch or PATH lookup
// of its own), and relaunch. appimageupdatetool is itself shipped upstream
// as an AppImage, so it needs the same FUSE support the user's system
// already provided to launch our own AppImage in the first place - no extra
// requirement beyond what's already true for this process to be running.
//
// Unlike the Windows PowerShell helper this has no GUI: appimageupdatetool
// does the zsync delta-download, digest verification, and atomic in-place
// replace of the AppImage itself, so there's nothing left here to show
// progress for.
//
// Placeholders are @@TOKEN@@, matching update_installer_windows.go's
// convention, and for the same reason: paths can contain characters ('$',
// quotes) that would otherwise need careful shell-escaping throughout the
// whole script rather than once, at substitution time.
//
// Finish always writes the result file and always relaunches the app, on
// every exit path (tool missing, tool fails, tool succeeds) - a broken update
// must never strand the user with no running app.
const updateHelperScriptSource = `#!/bin/sh
set -u

target_pid=@@PID@@
log=@@LOG@@
result_path=@@RESULT@@
appimage=@@APPIMAGE@@
update_tool=@@TOOL@@
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
    nohup "$appimage" >/dev/null 2>&1 &
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

if [ ! -x "$update_tool" ]; then
    write_log "update tool not found or not executable: $update_tool"
    finish false 'update tool missing'
    exit 0
fi

write_log "running $update_tool $appimage"
if "$update_tool" "$appimage" >> "$log" 2>&1; then
    write_log 'appimageupdatetool succeeded'
    finish true ''
else
    write_log "appimageupdatetool exited with status $?"
    finish false 'appimageupdatetool failed - see update-helper.log'
fi
`

// buildUpdateHelperScript renders updateHelperScriptSource with its inputs
// substituted in. Kept as a pure function so it's unit-testable without
// spawning anything or touching the filesystem, mirroring
// update_installer_windows.go's buildUpdateHelperScript.
func buildUpdateHelperScript(pid int, appimagePath, updateToolPath, version, logPath, resultPath string) string {
	replacer := strings.NewReplacer(
		"@@PID@@", strconv.Itoa(pid),
		"@@LOG@@", shSingleQuoted(logPath),
		"@@RESULT@@", shSingleQuoted(resultPath),
		"@@APPIMAGE@@", shSingleQuoted(appimagePath),
		"@@TOOL@@", shSingleQuoted(updateToolPath),
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

// SpawnUpdateHelper writes update-helper.sh into the updates cache dir and
// launches it detached. Call this and then quit immediately after - from
// that point on, the wait-for-exit -> appimageupdatetool -> relaunch
// sequence is the helper's responsibility and independent of this process.
//
// Only functional when running from a mounted AppImage - every other Linux
// packaging (rpm, tar.gz, raw binary) has no artifact appimageupdatetool can
// apply, so those keep the existing check-and-open-a-link flow.
func (s *UpdateService) SpawnUpdateHelper(info UpdateInfo, productName string) error {
	if !runningAsAppImage() {
		return ErrAutoUpdateUnsupported
	}
	appimagePath := strings.TrimSpace(os.Getenv("APPIMAGE"))
	appDir := strings.TrimSpace(os.Getenv("APPDIR"))
	if appimagePath == "" || appDir == "" {
		return fmt.Errorf("resolve running AppImage: $APPIMAGE or $APPDIR not set")
	}
	updateTool := filepath.Join(appDir, "usr", "bin", "appimageupdatetool")

	dir, err := updateCacheDir()
	if err != nil {
		return err
	}

	scriptPath := filepath.Join(dir, updateHelperScriptName)
	logPath := filepath.Join(dir, updateHelperLogName)
	resultPath := filepath.Join(dir, updateResultName)
	os.Remove(resultPath) // fresh result file per attempt

	script := buildUpdateHelperScript(os.Getpid(), appimagePath, updateTool, info.LatestVersion, logPath, resultPath)
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
