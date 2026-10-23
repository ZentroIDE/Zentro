$envLoader = Join-Path $PSScriptRoot 'scripts/load-dotenv.ps1'
& $envLoader

# Same output name build_zentro.ps1 -Dev produces: build\bin\zentro-v<version>-dev.exe
$version = (Get-Content -Raw (Join-Path $PSScriptRoot 'wails.json') | ConvertFrom-Json).info.productVersion
$processName = "zentro-v$version-dev"
$exePath = Join-Path $PSScriptRoot "build\bin\$processName.exe"

$process = Get-Process -Name $processName -ErrorAction SilentlyContinue
if ($process) {
    Write-Host "Stopping running instance..." -ForegroundColor Yellow
    Stop-Process -Name $processName -Force
    Start-Sleep -Seconds 1
}

# Zentro is a Wails app: a plain `go build` has no frontend and no Wails build
# tags, so build through the same pipeline as `npm run build:dev`. The dev build
# carries the `dev` tag (ZENTRO_DEV_TIER override, debug tools).
Write-Host "Building Zentro (dev)..." -ForegroundColor Cyan
& (Join-Path $PSScriptRoot 'build_zentro.ps1') -Dev -NoInstaller

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host "Starting Zentro..." -ForegroundColor Green
& $exePath
