param(
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

function Test-IsAdministrator {
    $currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentIdentity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Add-NsisToPath {
    $nsisBin = "C:\Program Files (x86)\NSIS\Bin"
    if (-not (Test-Path $nsisBin)) {
        return
    }

    $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    if ($machinePath -notlike "*$nsisBin*") {
        [Environment]::SetEnvironmentVariable('Path', "$machinePath;$nsisBin", 'Machine')
        Write-Host "Added NSIS to machine PATH: $nsisBin" -ForegroundColor Yellow
    }

    if ($env:Path -notlike "*$nsisBin*") {
        $env:Path = "$nsisBin;$env:Path"
    }
}

if (-not (Test-IsAdministrator)) {
    Write-Host "This script must be run in an elevated PowerShell window." -ForegroundColor Red
    Write-Host "Open PowerShell with 'Run as Administrator', then run:" -ForegroundColor Yellow
    Write-Host "  powershell -ExecutionPolicy Bypass -File .\scripts\install-nsis.ps1" -ForegroundColor Cyan
    exit 1
}

if (-not (Get-Command choco.exe -ErrorAction SilentlyContinue)) {
    Write-Host "Chocolatey was not found on this machine." -ForegroundColor Red
    Write-Host "Install Chocolatey first, then rerun this script." -ForegroundColor Yellow
    exit 1
}

$existing = Get-Command makensis.exe -ErrorAction SilentlyContinue
if ($existing -and -not $Force) {
    Write-Host "NSIS is already installed:" -ForegroundColor Green
    Write-Host "  $($existing.Source)" -ForegroundColor Cyan
    & $existing.Source /VERSION
    exit 0
}

Write-Host "Installing NSIS via Chocolatey..." -ForegroundColor Yellow
choco install nsis --yes --no-progress

Add-NsisToPath

$makensis = Get-Command makensis.exe -ErrorAction SilentlyContinue
if (-not $makensis) {
    throw "NSIS install finished but makensis.exe was not found on PATH."
}

Write-Host "NSIS installed successfully:" -ForegroundColor Green
Write-Host "  $($makensis.Source)" -ForegroundColor Cyan
& $makensis.Source /VERSION
