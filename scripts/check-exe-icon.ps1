param (
    [Parameter(Mandatory = $true)]
    [string]$Path
)

# Fails when the exe carries no embedded icon resource. A binary built with a
# plain `go build` (instead of `wails build`) has none, and Windows then shows
# the generic blank-window icon in Start search, the taskbar and shortcuts.

if (-not (Test-Path -LiteralPath $Path)) {
    Write-Host "FAILED: $Path does not exist" -ForegroundColor Red
    exit 1
}

Add-Type -Namespace Zentro -Name IconProbe -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("shell32.dll", CharSet = System.Runtime.InteropServices.CharSet.Unicode)]
public static extern uint ExtractIconEx(string file, int index, System.IntPtr[] large, System.IntPtr[] small, uint count);
'@

# index -1 with null arrays returns the number of icons in the file.
$count = [Zentro.IconProbe]::ExtractIconEx((Resolve-Path -LiteralPath $Path).Path, -1, $null, $null, 0)
if ($count -lt 1) {
    Write-Host "FAILED: $Path has no embedded icon (was it built with 'wails build'?)" -ForegroundColor Red
    exit 1
}

Write-Host "OK: $Path embeds $count icon group(s)" -ForegroundColor Green
exit 0
