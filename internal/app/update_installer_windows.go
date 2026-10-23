// SPDX-License-Identifier: GPL-3.0-only

//go:build windows

package app

import (
	"bytes"
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

// updateCacheDirName mirrors the install-folder naming from build_zentro.ps1's
// -Nightly variant, so a nightly install staging an update never collides
// with a stable install's staged file/marker on the same machine.
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

// UpdateCacheDir exposes updateCacheDir for logging purposes (e.g. so
// zentro.log can point at where update-helper.log/update-result.json live)
// without every caller needing a Windows build tag of its own.
func (s *UpdateService) UpdateCacheDir() (string, error) {
	return updateCacheDir()
}

// psSingleQuoted wraps s in a PowerShell single-quoted literal, escaping any
// embedded quote by doubling it. Single-quoted strings suppress every kind
// of PS expansion ($, `, subexpressions), so a path is passed through byte
// for byte.
func psSingleQuoted(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "''") + "'"
}

// Sidecar files the detached update helper writes into the updates cache dir.
// The script is a real .ps1 (not a fragile -Command one-liner) so quoting is
// predictable and `-File` works under a Restricted execution policy; the log
// is the only breadcrumb we get when a run fails on a user's machine, and
// updateResultName is how the *next* launch of this app finds out whether the
// help succeeded, since the process that ran it is long gone by then.
const (
	updateHelperScriptName = "update-helper.ps1"
	updateHelperLogName    = "update-helper.log"
	updateResultName       = "update-result.json"
)

// updateHelperScriptSource is a Windows Forms PowerShell GUI, not a headless
// background script: the whole point of moving here (rather than the app
// downloading silently before quitting) is that the user asked to see a
// small window + tray icon covering the entire download -> verify -> install
// -> relaunch sequence, since the main app is gone for that whole window.
//
// Placeholders are @@TOKEN@@ (not text/template or fmt verbs - this script is
// already dense with literal '{', '}', '$' and '%'-free PowerShell, so a
// plain string replace on unique tokens is the least error-prone way to
// inject values into it).
//
// Contract, all of which is exercised with the app already gone:
//   - wait (bounded) for the app's old PID to exit,
//   - show a small window + tray icon for the duration,
//   - download the release with real progress (WebClient - marshals its
//     events back to this UI thread automatically once the Form exists),
//   - verify its SHA-256 against what the release API published,
//   - run the NSIS installer elevated + silent (it's built
//     RequestExecutionLevel admin into $PROGRAMFILES64) - polled via a
//     WinForms Timer rather than a blocking -Wait, so the window stays
//     responsive and the marquee bar actually animates,
//   - ALWAYS relaunch the app and write updateResultName, even on failure -
//     including an exception anywhere during window/tray-icon setup itself,
//     not just the expected download/verify/install failure points - so the
//     user is never stranded with no app and the next launch can report what
//     happened. This is why Write-Log/Write-Result/Finish are all defined,
//     and the safety timer started, *before* a single GUI object is created:
//     everything from the Form onward runs inside one outer try/catch whose
//     catch can always reach a working Finish.
//   - a 10-minute safety valve in case a UAC prompt is never answered, so the
//     tray icon can't be orphaned forever.
const updateHelperScriptSource = `$ErrorActionPreference = 'Stop'

$targetPid = @@PID@@
$log = @@LOG@@
$resultPath = @@RESULT@@
$downloadUrl = @@URL@@
$expectedSha256 = @@SHA256@@
$destPath = @@DEST@@
$exePath = @@EXE@@
$version = @@VERSION@@
$productName = @@PRODUCT@@

function Write-Log($m) {
    try { Add-Content -LiteralPath $log -Value ((Get-Date).ToString('s') + ' ' + $m) } catch {}
}

function Write-Result($ok, $err) {
    try {
        $payload = [pscustomobject]@{ ok = $ok; version = $version; error = $err } | ConvertTo-Json -Compress
        [System.IO.File]::WriteAllText($resultPath, $payload, (New-Object System.Text.UTF8Encoding($false)))
    } catch {
        Write-Log ('write-result failed: ' + $_.Exception.Message)
    }
}

# Guarded against every referenced object ($notifyIcon, $form) possibly not
# existing yet - this can be called from the outer catch below before window
# setup got anywhere near finishing, and must still relaunch the app.
$finished = $false
function Finish($ok, $err) {
    if ($finished) { return }
    $script:finished = $true
    Write-Result $ok $err
    if ($err) { Write-Log ('ERROR: ' + $err) }
    Write-Log 'relaunching app'
    $relaunched = $false
    try {
        Start-Process -FilePath $exePath
        $relaunched = $true
    } catch {
        Write-Log ('relaunch via Start-Process failed: ' + $_.Exception.Message)
    }
    if (-not $relaunched) {
        try {
            Start-Process -FilePath 'explorer.exe' -ArgumentList $exePath
            Write-Log 'relaunched via explorer.exe fallback'
        } catch {
            Write-Log ('relaunch via explorer.exe also failed: ' + $_.Exception.Message)
        }
    }
    try { $notifyIcon.Visible = $false; $notifyIcon.Dispose() } catch {}
    try { $form.Close() } catch {}
    Write-Log 'update helper finished'
}

Write-Log 'update helper started'

try { Wait-Process -Id $targetPid -Timeout 60 -ErrorAction Stop } catch { Write-Log ('wait-process: ' + $_.Exception.Message) }
for ($i = 0; $i -lt 40; $i++) {
    if (-not (Get-Process -Id $targetPid -ErrorAction SilentlyContinue)) { break }
    Start-Sleep -Milliseconds 500
}

# Everything from here on - loading WinForms, building the window/tray icon,
# wiring the download, running the message loop - is one exception away from
# silently killing the script under $ErrorActionPreference = 'Stop'. Wrapping
# it all means ANY such failure still logs, still writes a result, and still
# relaunches the app via Finish, instead of leaving the user with no window,
# no tray icon and no app.
try {
    Write-Log 'loading Windows Forms'
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing

    Write-Log 'building update window'
    $form = New-Object System.Windows.Forms.Form
    $form.Text = "$productName Update"
    $form.FormBorderStyle = 'FixedDialog'
    $form.ControlBox = $false
    $form.MinimizeBox = $false
    $form.MaximizeBox = $false
    $form.StartPosition = 'CenterScreen'
    $form.ClientSize = New-Object System.Drawing.Size(360, 112)
    $form.TopMost = $true
    try { $form.Icon = [System.Drawing.Icon]::ExtractAssociatedIcon($exePath) } catch { Write-Log ('icon extract failed: ' + $_.Exception.Message) }

    $statusLabel = New-Object System.Windows.Forms.Label
    $statusLabel.Text = 'Preparing update...'
    $statusLabel.AutoSize = $false
    $statusLabel.Location = New-Object System.Drawing.Point(16, 16)
    $statusLabel.Size = New-Object System.Drawing.Size(328, 20)
    $form.Controls.Add($statusLabel)

    $versionLabel = New-Object System.Windows.Forms.Label
    $versionLabel.Text = "Version $version"
    $versionLabel.ForeColor = [System.Drawing.Color]::Gray
    $versionLabel.AutoSize = $false
    $versionLabel.Location = New-Object System.Drawing.Point(16, 38)
    $versionLabel.Size = New-Object System.Drawing.Size(328, 16)
    $form.Controls.Add($versionLabel)

    $bar = New-Object System.Windows.Forms.ProgressBar
    $bar.Location = New-Object System.Drawing.Point(16, 64)
    $bar.Size = New-Object System.Drawing.Size(328, 18)
    $bar.Minimum = 0
    $bar.Maximum = 100
    $bar.Style = 'Continuous'
    $form.Controls.Add($bar)

    $notifyIcon = New-Object System.Windows.Forms.NotifyIcon
    try { $notifyIcon.Icon = $form.Icon } catch { $notifyIcon.Icon = [System.Drawing.SystemIcons]::Application }
    $notifyIcon.Text = "$productName is updating..."
    $notifyIcon.Visible = $true
    Write-Log 'window + tray icon ready'

    function Set-Status($text) {
        $statusLabel.Text = $text
        $trimmed = $text
        if ($trimmed.Length -gt 63) { $trimmed = $trimmed.Substring(0, 63) }
        try { $notifyIcon.Text = $trimmed } catch {}
    }

    # Safety valve: a UAC prompt nobody answers, or a hung installer, must
    # never leave the tray icon orphaned and the user stuck with no app.
    $safetyTimer = New-Object System.Windows.Forms.Timer
    $safetyTimer.Interval = 10 * 60 * 1000
    $safetyTimer.Add_Tick({
        $safetyTimer.Stop()
        Write-Log 'safety timeout reached (10 min) - giving up and relaunching'
        Finish $false 'timed out waiting for the update to finish'
    })
    $safetyTimer.Start()

    function Start-Install {
        Set-Status 'Installing update...'
        $bar.Style = 'Marquee'
        $bar.MarqueeAnimationSpeed = 30
        Write-Log 'launching installer (elevated, silent)'
        # These MUST be $script: scoped, not local to this function: the poll
        # timer's Add_Tick scriptblock below is a real .NET delegate that
        # fires later, on the message loop, well after Start-Install has
        # already returned and its local scope is gone - a plain local
        # variable read back as $null there (silently, since this is a
        # closure over a dead call frame, not the normal scope chain a
        # synchronous call would see). That produced exactly this bug:
        # Get-Process -Name $installerName blew up with $installerName = $null.
        $script:installerProc = $null
        try {
            $script:installerProc = Start-Process -FilePath $destPath -ArgumentList '/S' -Verb RunAs -PassThru
        } catch {
            Write-Log ('installer launch failed: ' + $_.Exception.Message)
            $safetyTimer.Stop()
            Finish $false $_.Exception.Message
            return
        }
        # -PassThru's process handle can come back unusable across the
        # elevation broker on some PowerShell 5.1 builds, so poll by name as
        # a fallback rather than trusting -Wait (which would block this UI
        # thread and freeze the window/marquee for however long install takes).
        $script:installerName = [System.IO.Path]::GetFileNameWithoutExtension($destPath)
        $script:installerElapsedMs = 0
        $script:pollTimer = New-Object System.Windows.Forms.Timer
        $pollTimer.Interval = 400
        $pollTimer.Add_Tick({
            $script:installerElapsedMs += $script:pollTimer.Interval
            $stillRunning = $false
            if ($script:installerProc) {
                try { $stillRunning = -not $script:installerProc.HasExited } catch { $stillRunning = $false }
            } elseif ($script:installerName) {
                $stillRunning = [bool](Get-Process -Name $script:installerName -ErrorAction SilentlyContinue)
            }
            if (-not $stillRunning -or $script:installerElapsedMs -gt 120000) {
                $script:pollTimer.Stop()
                $safetyTimer.Stop()
                Write-Log 'installer step done (exited or poll gave up after 120s)'
                Finish $true $null
            }
        })
        $pollTimer.Start()
    }

    $webClient = New-Object System.Net.WebClient
    $webClient.add_DownloadProgressChanged({
        param($eventSender, $e)
        if ($e.TotalBytesToReceive -gt 0) {
            $bar.Value = [Math]::Max(0, [Math]::Min(100, $e.ProgressPercentage))
            Set-Status ('Downloading update... ' + $e.ProgressPercentage + '%')
        } else {
            Set-Status ('Downloading update... ' + [Math]::Round($e.BytesReceived / 1MB, 1) + ' MB')
        }
    })
    $webClient.add_DownloadFileCompleted({
        param($eventSender, $e)
        if ($e.Cancelled) {
            Write-Log 'download cancelled'
            $safetyTimer.Stop()
            Finish $false 'download cancelled'
            return
        }
        if ($e.Error) {
            Write-Log ('download failed: ' + $e.Error.Message)
            $safetyTimer.Stop()
            Finish $false $e.Error.Message
            return
        }
        if ($expectedSha256) {
            Set-Status 'Verifying update...'
            try {
                $actual = (Get-FileHash -LiteralPath $destPath -Algorithm SHA256).Hash
            } catch {
                Write-Log ('hash computation failed: ' + $_.Exception.Message)
                $safetyTimer.Stop()
                Finish $false ('could not verify download: ' + $_.Exception.Message)
                return
            }
            if ($actual -ne $expectedSha256) {
                Write-Log ("checksum mismatch: expected $expectedSha256 got $actual")
                try { Remove-Item -LiteralPath $destPath -Force -ErrorAction SilentlyContinue } catch {}
                $safetyTimer.Stop()
                Finish $false 'checksum verification failed'
                return
            }
            Write-Log 'checksum verified'
        }
        Start-Install
    })

    $form.Add_Shown({
        Write-Log ('downloading update from ' + $downloadUrl)
        Set-Status 'Downloading update...'
        try {
            $webClient.DownloadFileAsync([Uri]$downloadUrl, $destPath)
        } catch {
            Write-Log ('download start failed: ' + $_.Exception.Message)
            $safetyTimer.Stop()
            Finish $false $_.Exception.Message
        }
    })

    Write-Log 'entering message loop'
    [System.Windows.Forms.Application]::Run($form)
} catch {
    Write-Log ('FATAL (window/download/install setup): ' + $_.Exception.Message)
    Finish $false $_.Exception.Message
}
`

// buildUpdateHelperScript renders updateHelperScriptSource with its inputs
// substituted in. Kept as a pure function so it's unit-testable without
// spawning anything or touching the filesystem.
func buildUpdateHelperScript(pid int, downloadURL, checksumSHA256, version, exePath, destPath, logPath, resultPath, productName string) string {
	replacer := strings.NewReplacer(
		"@@PID@@", strconv.Itoa(pid),
		"@@LOG@@", psSingleQuoted(logPath),
		"@@RESULT@@", psSingleQuoted(resultPath),
		"@@URL@@", psSingleQuoted(downloadURL),
		"@@SHA256@@", psSingleQuoted(checksumSHA256),
		"@@DEST@@", psSingleQuoted(destPath),
		"@@EXE@@", psSingleQuoted(exePath),
		"@@VERSION@@", psSingleQuoted(version),
		"@@PRODUCT@@", psSingleQuoted(productName),
	)
	return replacer.Replace(updateHelperScriptSource)
}

// SpawnUpdateHelper writes update-helper.ps1 into the updates cache dir and
// launches it detached. Call this and then quit immediately after - from
// that point on, the entire download -> verify -> install -> relaunch
// sequence (with its own small window + tray icon) is the helper's
// responsibility and is independent of this process.
func (s *UpdateService) SpawnUpdateHelper(info UpdateInfo, productName string) error {
	if info.DownloadURL == "" {
		return fmt.Errorf("no download URL for this release")
	}
	exePath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("resolve current executable: %w", err)
	}
	dir, err := updateCacheDir()
	if err != nil {
		return err
	}

	// Best-effort cleanup of any installer staged by a previous attempt -
	// nothing reuses these across runs anymore now that download happens
	// entirely in the helper, so don't let them pile up.
	if matches, globErr := filepath.Glob(filepath.Join(dir, "zentro-*-installer.exe")); globErr == nil {
		for _, m := range matches {
			os.Remove(m)
		}
	}

	scriptPath := filepath.Join(dir, updateHelperScriptName)
	logPath := filepath.Join(dir, updateHelperLogName)
	resultPath := filepath.Join(dir, updateResultName)
	destPath := filepath.Join(dir, fmt.Sprintf("zentro-%s-installer.exe", info.LatestVersion))
	os.Remove(resultPath) // fresh result file per attempt

	script := buildUpdateHelperScript(
		os.Getpid(), info.DownloadURL, info.ChecksumSHA256, info.LatestVersion,
		exePath, destPath, logPath, resultPath, productName,
	)
	if err := os.WriteFile(scriptPath, []byte(script), 0o644); err != nil {
		return fmt.Errorf("write update-helper script: %w", err)
	}

	args := []string{
		"-NoProfile", "-NonInteractive",
		"-ExecutionPolicy", "Bypass",
		"-WindowStyle", "Hidden",
		"-File", scriptPath,
	}

	// CREATE_NO_WINDOW(0x8000000) | CREATE_NEW_PROCESS_GROUP(0x200) | CREATE_BREAKAWAY_FROM_JOB(0x1000000).
	//
	// CREATE_NO_WINDOW, not DETACHED_PROCESS: powershell.exe is a console
	// (not GUI) subsystem executable, and DETACHED_PROCESS gives it no
	// console handle at all to initialize against - verified empirically
	// (not just per Windows docs) that with DETACHED_PROCESS the process is
	// created (CreateProcess/cmd.Start succeed with no error) but never
	// executes a single line of the script: no log entry, no window, no
	// relaunch, completely silent. CREATE_NO_WINDOW instead creates a real
	// (just hidden) console for it, which is the documented, correct flag
	// for "run a console app with no visible window" and lets PowerShell's
	// host initialize normally; the WinForms window this script shows is a
	// separate top-level GUI window regardless of the hidden console.
	//
	// This helper must also outlive the app process it's waiting on,
	// including surviving if Wails/WebView2 has this process in a job
	// object that kills children on exit - breakaway ensures it isn't
	// caught by that.
	const flagsWithBreakaway = 0x08000000 | 0x00000200 | 0x01000000
	const flagsNoBreakaway = 0x08000000 | 0x00000200

	start := func(flags uint32) error {
		cmd := exec.Command("powershell", args...)
		cmd.SysProcAttr = &syscall.SysProcAttr{CreationFlags: flags}
		return cmd.Start()
	}

	if err := start(flagsWithBreakaway); err != nil {
		// A job object that doesn't grant JOB_OBJECT_LIMIT_BREAKAWAY_OK makes
		// CreateProcess reject CREATE_BREAKAWAY_FROM_JOB outright. Retrying
		// without it still gives a detached helper - it only loses the
		// guarantee of surviving a kill-on-job-close parent, which most
		// launch contexts don't impose.
		if err2 := start(flagsNoBreakaway); err2 != nil {
			return fmt.Errorf("spawn update helper: %v (breakaway retry: %w)", err, err2)
		}
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
	// PowerShell's default UTF-8 write can carry a BOM; encoding/json chokes
	// on a leading BOM, so strip it before unmarshaling.
	data = bytes.TrimPrefix(data, []byte{0xEF, 0xBB, 0xBF})
	var result UpdateResult
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, false
	}
	return &result, true
}
