// SPDX-License-Identifier: GPL-3.0-only

//go:build darwin

package app

import (
	"os"
	"strings"
	"testing"
)

func TestShSingleQuoted(t *testing.T) {
	if got := shSingleQuoted("/Users/a b/x.pkg"); got != `'/Users/a b/x.pkg'` {
		t.Errorf("plain path: got %q", got)
	}
	if got := shSingleQuoted(`/Users/o'brien/x.pkg`); got != `'/Users/o'\''brien/x.pkg'` {
		t.Errorf("embedded quote must use the '\\'' escape: got %q", got)
	}
}

func TestBuildUpdateHelperScript(t *testing.T) {
	const (
		pid           = 4242
		appPath       = "/Applications/Zentro.app"
		installScript = "/Users/o'brien/Library/Caches/Zentro/updates/install-pkg.sh"
		elevateScript = "/Users/o'brien/Library/Caches/Zentro/updates/elevate.applescript"
		url           = "https://cdn.example.com/zentro-1.2.3-installer.pkg"
		checksum      = "deadbeef"
		destPath      = "/Users/o'brien/Library/Caches/Zentro/updates/zentro-1.2.3-installer.pkg"
		version       = "1.2.3"
		logPath       = "/Users/o'brien/Library/Caches/Zentro/updates/update-helper.log"
		resultPth     = "/Users/o'brien/Library/Caches/Zentro/updates/update-result.json"
	)
	script := buildUpdateHelperScript(pid, appPath, installScript, elevateScript, url, checksum, destPath, version, logPath, resultPth)

	if !strings.Contains(script, "target_pid=4242") {
		t.Error("script must set target_pid to the given pid")
	}
	if !strings.Contains(script, `kill -0 "$target_pid"`) {
		t.Error("script must wait on the app's old pid via kill -0")
	}

	// Checksum verification must happen before the elevated install ever
	// runs - use the LAST "osascript" occurrence (the actual call site)
	// rather than any earlier mention.
	verifyIdx := strings.Index(script, "shasum -a 256")
	installCallIdx := strings.LastIndex(script, `osascript "$elevate_script"`)
	if verifyIdx < 0 {
		t.Fatal("expected checksum verification via shasum")
	}
	if installCallIdx < 0 || installCallIdx < verifyIdx {
		t.Error("expected the elevated install to run only after the checksum check, not before")
	}

	// The elevated install must go through osascript (native admin-consent
	// prompt), not a raw sudo/installer call with no user consent.
	if !strings.Contains(script, `osascript "$elevate_script" "$install_script" "$dest_path"`) {
		t.Error("expected the install to be invoked via elevate.applescript through osascript")
	}

	// Relaunch + result-writing must be unconditional (inside finish, called
	// on every exit path) so a broken update never strands the user with no
	// running app.
	finishIdx := strings.Index(script, "finish() {")
	relaunchIdx := strings.Index(script, `open "$app_path"`)
	if finishIdx < 0 || relaunchIdx < 0 || relaunchIdx < finishIdx {
		t.Fatal("expected the app relaunch to live inside the finish function")
	}
	for _, want := range []string{
		"finish false 'download failed'",
		"finish false 'checksum verification failed'",
		"finish false 'installer failed or the admin prompt was cancelled'",
		"finish true ''",
	} {
		if !strings.Contains(script, want) {
			t.Errorf("expected a call site %q so every exit path relaunches and reports", want)
		}
	}

	// Values must be single-quote-escaped in, not interpolated raw.
	for _, want := range []string{
		`o'\''brien`,
		url,
		version,
		appPath,
	} {
		if !strings.Contains(script, want) {
			t.Errorf("expected script to contain %q:\n%s", want, script)
		}
	}
}

func TestElevateScriptSource_UsesQuotedFormForBothArgs(t *testing.T) {
	// AppleScript's `quoted form of` does all the shell-escaping for us at
	// runtime (spaces, quotes, whatever) - this is precisely why the script
	// content itself never needs any per-run templating. Regression-guard
	// that both argv items actually go through it.
	if !strings.Contains(elevateScriptSource, "quoted form of theScript") {
		t.Error("expected the install script path to go through `quoted form of`")
	}
	if !strings.Contains(elevateScriptSource, "quoted form of thePkg") {
		t.Error("expected the .pkg path to go through `quoted form of`")
	}
	if !strings.Contains(elevateScriptSource, "with administrator privileges") {
		t.Error("expected the install to request admin elevation")
	}
}

func TestInstallScriptSource_RunsInstallerAgainstArgument(t *testing.T) {
	if !strings.Contains(installScriptSource, `installer -pkg "$1" -target /`) {
		t.Error("expected install-pkg.sh to run the installer against its first argument")
	}
}

func TestRunningAppBundlePath_RejectsNonAppExecutablePath(t *testing.T) {
	// os.Executable() in a `go test` binary won't live inside a .app bundle,
	// so this should fail closed rather than silently returning a bogus path.
	if _, err := runningAppBundlePath(); err == nil {
		t.Error("expected an error when not running from inside a .app bundle")
	}
}

func TestConsumeLastUpdateResult_ReadsAndDeletesFile(t *testing.T) {
	dir, err := updateCacheDir()
	if err != nil {
		t.Fatalf("updateCacheDir: %v", err)
	}
	p := dir + "/" + updateResultName
	body := []byte(`{"ok":false,"version":"1.2.3","error":"checksum verification failed"}`)
	if err := os.WriteFile(p, body, 0o644); err != nil {
		t.Fatalf("write result file: %v", err)
	}

	svc := &UpdateService{}
	result, ok := svc.ConsumeLastUpdateResult()
	if !ok {
		t.Fatal("expected a result to be found")
	}
	if result.OK || result.Version != "1.2.3" || result.Error != "checksum verification failed" {
		t.Errorf("unexpected result: %+v", result)
	}

	if _, statErr := os.Stat(p); statErr == nil {
		t.Error("expected the result file to be removed after being consumed")
	}

	if _, ok := svc.ConsumeLastUpdateResult(); ok {
		t.Error("expected no result on a second consume - it should only be reported once")
	}
}
