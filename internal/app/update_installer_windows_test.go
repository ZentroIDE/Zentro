// SPDX-License-Identifier: GPL-3.0-only

//go:build windows

package app

import (
	"os"
	"strings"
	"testing"
)

func TestPsSingleQuoted(t *testing.T) {
	if got := psSingleQuoted(`C:\Users\a b\x.exe`); got != `'C:\Users\a b\x.exe'` {
		t.Errorf("plain path: got %q", got)
	}
	if got := psSingleQuoted(`C:\Users\o'brien\x.exe`); got != `'C:\Users\o''brien\x.exe'` {
		t.Errorf("embedded quote must be doubled: got %q", got)
	}
}

func TestBuildUpdateHelperScript(t *testing.T) {
	const (
		pid       = 4242
		url       = "https://cdn.example.com/zentro-1.2.3-installer.exe"
		checksum  = "deadbeef"
		version   = "1.2.3"
		exe       = `C:\Program Files\Zentro\Zentro\zentro.exe`
		dest      = `C:\Users\o'brien\AppData\Local\Zentro\updates\zentro-1.2.3-installer.exe`
		logPath   = `C:\Users\o'brien\AppData\Local\Zentro\updates\update-helper.log`
		resultPth = `C:\Users\o'brien\AppData\Local\Zentro\updates\update-result.json`
		product   = "Zentro"
	)
	script := buildUpdateHelperScript(pid, url, checksum, version, exe, dest, logPath, resultPth, product)

	// The installer must be run elevated - it's built RequestExecutionLevel
	// admin - and silent, or the update can't apply without a full UI.
	if !strings.Contains(script, "-Verb RunAs") {
		t.Error("installer launch must elevate via -Verb RunAs")
	}
	if !strings.Contains(script, "-ArgumentList '/S'") {
		t.Error("installer launch must pass the NSIS /S silent flag")
	}

	// This is a visible GUI, not a headless script - the whole point of this
	// design is a window + tray icon covering the gap while the app is gone.
	for _, want := range []string{
		"System.Windows.Forms",
		"New-Object System.Windows.Forms.Form",
		"System.Windows.Forms.NotifyIcon",
		"[System.Windows.Forms.Application]::Run($form)",
	} {
		if !strings.Contains(script, want) {
			t.Errorf("expected script to contain %q (must be a real WinForms window+tray, not headless)", want)
		}
	}

	// Download must go through WebClient's async+events (not a blocking
	// synchronous call), or the window can't show real progress nor stay
	// responsive.
	if !strings.Contains(script, "DownloadFileAsync") {
		t.Error("expected an async download so the window stays responsive and reports real progress")
	}
	if !strings.Contains(script, "DownloadProgressChanged") {
		t.Error("expected a download-progress handler driving the progress bar")
	}

	// Checksum verification must happen before the installer ever runs. Use
	// the LAST "Start-Install" occurrence (the call site inside the download
	// completion handler) rather than the first (its function definition,
	// which necessarily precedes everything that calls it).
	verifyIdx := strings.Index(script, "Get-FileHash")
	installCallIdx := strings.LastIndex(script, "Start-Install")
	if verifyIdx < 0 {
		t.Fatal("expected checksum verification via Get-FileHash")
	}
	if installCallIdx < 0 || installCallIdx < verifyIdx {
		t.Error("expected the installer to be invoked only after the checksum check, not before")
	}

	// Relaunch must be unconditional (inside Finish, called on every exit
	// path - success, download failure, checksum mismatch, install failure,
	// and the safety timeout) so a broken update never strands the user.
	finishIdx := strings.Index(script, "function Finish(")
	relaunchIdx := strings.Index(script, "Start-Process -FilePath $exePath")
	if finishIdx < 0 || relaunchIdx < 0 || relaunchIdx < finishIdx {
		t.Fatal("expected the app relaunch to live inside the Finish function")
	}
	failureCallsites := []string{
		"Finish $false 'download cancelled'",
		"Finish $false $e.Error.Message",
		"Finish $false 'checksum verification failed'",
		"Finish $false $_.Exception.Message",
		"Finish $false 'timed out waiting for the update to finish'",
	}
	for _, want := range failureCallsites {
		if !strings.Contains(script, want) {
			t.Errorf("expected a failure path to call %q so the app still relaunches", want)
		}
	}
	if !strings.Contains(script, "Finish $true $null") {
		t.Error("expected a success path to call Finish with ok=true")
	}

	// A 10-minute safety valve must exist so a stuck UAC prompt can't orphan
	// the tray icon / leave the user stuck forever.
	if !strings.Contains(script, "10 * 60 * 1000") {
		t.Error("expected a bounded safety timeout")
	}

	// Values must be single-quote-escaped in, not interpolated raw - a
	// username with a quote in it (real path above) must not break the
	// script, and the download URL/version/exe path must actually appear.
	for _, want := range []string{
		"o''brien",
		url,
		version,
		exe,
	} {
		if !strings.Contains(script, want) {
			t.Errorf("expected script to contain %q:\n%s", want, script)
		}
	}
	if !strings.Contains(script, "Wait-Process -Id $targetPid") || !strings.Contains(script, "$targetPid = 4242") {
		t.Error("script must wait on the app's old pid")
	}

	// Regression test for a real bug: Start-Install is a function, and its
	// poll timer's Add_Tick fires later as a .NET delegate callback, well
	// after Start-Install has already returned. A plain local variable
	// referenced there reads back as $null (confirmed empirically - it's
	// not the normal PS scope chain a synchronous call would see), which
	// crashed Get-Process -Name $installerName with a parameter-binding
	// error that -ErrorAction SilentlyContinue can't suppress. Every
	// variable the poll Tick handler touches must be $script:-scoped.
	pollTickStart := strings.Index(script, "$pollTimer.Add_Tick(")
	pollTickEnd := strings.Index(script, "$pollTimer.Start()")
	if pollTickStart < 0 || pollTickEnd < 0 || pollTickEnd < pollTickStart {
		t.Fatal("expected a poll timer Add_Tick block before Start()")
	}
	pollTickBody := script[pollTickStart:pollTickEnd]
	for _, want := range []string{
		"$script:installerElapsedMs",
		"$script:pollTimer",
		"$script:installerProc",
		"$script:installerName",
	} {
		if !strings.Contains(pollTickBody, want) {
			t.Errorf("poll timer Tick handler must reference %q as $script:-scoped, not a Start-Install local:\n%s", want, pollTickBody)
		}
	}
}

func TestBuildUpdateHelperScript_NoChecksumSkipsVerification(t *testing.T) {
	script := buildUpdateHelperScript(1, "https://example.com/x.exe", "", "1.0.0", `C:\a\zentro.exe`, `C:\a\x.exe`, `C:\a\log.log`, `C:\a\result.json`, "Zentro")
	// $expectedSha256 is guarded by `if ($expectedSha256) { ... }` - an empty
	// checksum from the release API must not block the install behind a
	// verification step that can never pass.
	if !strings.Contains(script, "if ($expectedSha256) {") {
		t.Error("expected verification to be conditional on a non-empty checksum")
	}
}

func TestConsumeLastUpdateResult_StripsBOMAndDeletesFile(t *testing.T) {
	dir, err := updateCacheDir()
	if err != nil {
		t.Fatalf("updateCacheDir: %v", err)
	}
	p := dir + `\` + updateResultName
	// PowerShell's default UTF-8 write carries a BOM; simulate that.
	bom := []byte{0xEF, 0xBB, 0xBF}
	body := []byte(`{"ok":false,"version":"1.2.3","error":"checksum verification failed"}`)
	if err := os.WriteFile(p, append(bom, body...), 0o644); err != nil {
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
