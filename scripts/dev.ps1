# Load env from frontend/.env first, then root .env / .env.txt
$repoRoot    = Split-Path $PSScriptRoot -Parent
$frontendDir = Join-Path $repoRoot 'frontend'

& (Join-Path $PSScriptRoot 'load-dotenv.ps1') -Paths @(
    (Join-Path $frontendDir '.env'),
    (Join-Path $repoRoot '.env'),
    (Join-Path $repoRoot '.env.txt')
)

$port     = [int]$env:VITE_PORT
$vitePort = if ($port -gt 0) { $port } else { 5173 }

# Kill any leftover process still holding the Vite port from a previous session
Get-NetTCPConnection -LocalPort $vitePort -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    Where-Object { $_ -ne 0 } |
    ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }

# Start Vite before Wails so the proxy has something to connect to on first hit
Write-Host "Starting Vite on :$vitePort ..."
$viteProc = Start-Process cmd -ArgumentList '/c', 'npm run dev' `
    -WorkingDirectory $frontendDir -NoNewWindow -PassThru

# TCP-poll until Vite accepts connections (max 30 s)
$deadline = [DateTime]::Now.AddSeconds(30)
$ready    = $false
while (-not $ready -and [DateTime]::Now -lt $deadline) {
    Start-Sleep -Milliseconds 400
    try {
        $c = New-Object System.Net.Sockets.TcpClient
        $c.Connect('127.0.0.1', $vitePort)
        $c.Dispose()
        $ready = $true
    } catch {}
}

if ($ready) { Write-Host "Vite ready, starting Wails..." }
else        { Write-Warning "Vite did not respond within 30 s, continuing anyway..." }

# -frontenddevserverurl tells Wails to use this URL and skip spawning frontend:dev:watcher
try {
    wails dev -tags dev -frontenddevserverurl "http://localhost:$vitePort"
} finally {
    # Kill the Vite process tree when Wails exits (Ctrl+C or normal exit)
    if ($viteProc -and -not $viteProc.HasExited) {
        taskkill /T /F /PID $viteProc.Id | Out-Null
    }
}
