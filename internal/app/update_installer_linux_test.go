// SPDX-License-Identifier: GPL-3.0-only

//go:build linux

package app

import (
	"os"
	"strings"
	"testing"
)

func TestShSingleQuoted(t *testing.T) {
	if got := shSingleQuoted("/home/a b/x.AppImage"); got != `'/home/a b/x.AppImage'` {
		t.Errorf("plain path: got %q", got)
	}
	if got := shSingleQuoted(`/home/o'brien/x.AppImage`); got != `'/home/o'\''brien/x.AppImage'` {
		t.Errorf("embedded quote must use the '\\'' escape: got %q", got)
	}
}

func TestBuildUpdateHelperScript(t *testing.T) {
	const (
		pid        = 4242
		appimage   = `/home/o'brien/Applications/zentro-1.2.3.AppImage`
		updateTool = "/tmp/.mount_zentroABC123/usr/bin/appimageupdatetool"
		version    = "1.2.3"
		logPath    = "/home/o'brien/.cache/Zentro/updates/update-helper.log"
		resultPth  = "/home/o'brien/.cache/Zentro/updates/update-result.json"
	)
	script := buildUpdateHelperScript(pid, appimage, updateTool, version, logPath, resultPth)

	// Must wait on the app's old pid before touching anything.
	if !strings.Contains(script, "target_pid=4242") {
		t.Error("script must set target_pid to the given pid")
	}
	if !strings.Contains(script, `kill -0 "$target_pid"`) {
		t.Error("script must wait on the app's old pid via kill -0")
	}

	// appimageupdatetool must actually be invoked against the running image.
	if !strings.Contains(script, `"$update_tool" "$appimage"`) {
		t.Error("expected the update tool to be invoked with the AppImage path")
	}

	// Relaunch + result-writing must be unconditional (inside finish, called
	// on every exit path - tool missing, tool failure, tool success) so a
	// broken update never strands the user with no running app.
	finishIdx := strings.Index(script, "finish() {")
	relaunchIdx := strings.Index(script, `nohup "$appimage"`)
	if finishIdx < 0 || relaunchIdx < 0 || relaunchIdx < finishIdx {
		t.Fatal("expected the app relaunch to live inside the finish function")
	}
	for _, want := range []string{
		"finish false 'update tool missing'",
		"finish false 'appimageupdatetool failed - see update-helper.log'",
		"finish true ''",
	} {
		if !strings.Contains(script, want) {
			t.Errorf("expected a call site %q so every exit path relaunches and reports", want)
		}
	}

	// Values must be single-quote-escaped in, not interpolated raw.
	for _, want := range []string{
		`o'\''brien`,
		updateTool,
		version,
	} {
		if !strings.Contains(script, want) {
			t.Errorf("expected script to contain %q:\n%s", want, script)
		}
	}
}

func TestConsumeLastUpdateResult_ReadsAndDeletesFile(t *testing.T) {
	dir, err := updateCacheDir()
	if err != nil {
		t.Fatalf("updateCacheDir: %v", err)
	}
	p := dir + "/" + updateResultName
	body := []byte(`{"ok":false,"version":"1.2.3","error":"appimageupdatetool failed - see update-helper.log"}`)
	if err := os.WriteFile(p, body, 0o644); err != nil {
		t.Fatalf("write result file: %v", err)
	}

	svc := &UpdateService{}
	result, ok := svc.ConsumeLastUpdateResult()
	if !ok {
		t.Fatal("expected a result to be found")
	}
	if result.OK || result.Version != "1.2.3" || result.Error != "appimageupdatetool failed - see update-helper.log" {
		t.Errorf("unexpected result: %+v", result)
	}

	if _, statErr := os.Stat(p); statErr == nil {
		t.Error("expected the result file to be removed after being consumed")
	}

	if _, ok := svc.ConsumeLastUpdateResult(); ok {
		t.Error("expected no result on a second consume - it should only be reported once")
	}
}
