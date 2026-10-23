# build_zentro.ps1
# Usage:
#   .\build_zentro.ps1        (Production build with installer)
#   .\build_zentro.ps1 -Dev   (Dev build)
#   .\build_zentro.ps1 -NoInstaller (Build only exe, no installer)
#   .\build_zentro.ps1 -Nightly (Nightly channel - separate side-by-side app, see below)

param (
    [switch]$Dev,
    [switch]$NoInstaller,
    [switch]$Nightly
)

& (Join-Path $PSScriptRoot 'scripts/load-dotenv.ps1')

# Read version from wails.json
if (!(Test-Path "wails.json")) {
    Write-Host "Error: wails.json not found!" -ForegroundColor Red
    exit 1
}

$wailsJson = Get-Content -Raw "wails.json" | ConvertFrom-Json
$version = $wailsJson.info.productVersion

if (!$version) {
    Write-Host "Error: Could not find version in wails.json" -ForegroundColor Red
    exit 1
}

$suffix = if ($Dev) { "-dev" } elseif ($Nightly) { "-nightly" } else { "" }
$outputName = "zentro-v$version$suffix.exe"

Write-Host "--- Zentro Build Pipeline ---" -ForegroundColor Cyan
Write-Host "Version: $version"
Write-Host "Suffix:  $suffix"
Write-Host "Output:  $outputName"
Write-Host "Installer: $(-not $NoInstaller)"
Write-Host "Channel: $(if ($Nightly) { 'nightly' } else { 'stable' })"
Write-Host "-----------------------------"

# Format backend before build so generated artifacts come from normalized Go sources.
Write-Host "Formatting backend Go files..." -ForegroundColor Yellow
npm run format:backend
if ($LASTEXITCODE -ne 0) {
    Write-Host "FAILED: Backend formatting failed with exit code $LASTEXITCODE" -ForegroundColor Red
    exit $LASTEXITCODE
}

# Backend guardrails — must pass before we waste time invoking wails build.
# (Frontend guardrails + feature boundaries + design-system contract run
#  inside `wails build` via frontend/package.json's `build` script.)
Write-Host "Running backend guardrails..." -ForegroundColor Yellow
node scripts/check-be-guardrails.mjs
if ($LASTEXITCODE -ne 0) {
    Write-Host "FAILED: Backend guardrails failed with exit code $LASTEXITCODE" -ForegroundColor Red
    exit $LASTEXITCODE
}

# The UI's fallback entitlement matrix is generated from the Go feature registry;
# a stale copy would make the UI and the backend disagree about a plan.
Write-Host "Checking entitlement matrix..." -ForegroundColor Yellow
node scripts/gen-entitlement-matrix.mjs --check
if ($LASTEXITCODE -ne 0) {
    Write-Host "FAILED: entitlementMatrix.ts is out of date (run: npm run gen:entitlements)" -ForegroundColor Red
    exit $LASTEXITCODE
}

# Build flags
$ldflags = "-s -w -H windowsgui"

# Embed the entitlement-signing public key so the release binary can verify
# signed license responses without a .env file (release artifacts don't ship
# with one). Without this, every install rejects Pro/EA entitlements with
# "unknown key id (configured keys: none)".
if ($env:ZENTRO_LICENSE_PUBLIC_KEY) {
    $keyID = if ($env:ZENTRO_LICENSE_PUBLIC_KEY_ID) { $env:ZENTRO_LICENSE_PUBLIC_KEY_ID } else { "entitlement-v1" }
    $ldflags += " -X 'zentro/internal/extensions/license.embeddedPublicKey=$($env:ZENTRO_LICENSE_PUBLIC_KEY)' -X 'zentro/internal/extensions/license.embeddedPublicKeyID=$keyID'"
    Write-Host "Embedding entitlement public key (key id: $keyID)" -ForegroundColor Yellow
} else {
    Write-Host "WARNING: ZENTRO_LICENSE_PUBLIC_KEY not set in .env - this build will ship WITHOUT an embedded signing key, and entitlement verification will fail for all users." -ForegroundColor Red
}

# Embed the real product version — without this, About always shows the
# hardcoded fallback baked into app.Version regardless of what wails.json
# actually says.
$ldflags += " -X 'zentro/internal/app.Version=v$version'"

# Wails builds with -buildvcs=false, so Go never stamps the commit/time itself;
# About would show "unknown" for both without these.
$buildCommit = (git rev-parse HEAD 2>$null)
if ($LASTEXITCODE -eq 0 -and $buildCommit) {
    $buildDate = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    $ldflags += " -X 'zentro/internal/app.BuildCommit=$buildCommit' -X 'zentro/internal/app.BuildDate=$buildDate'"
} else {
    Write-Host "WARNING: git rev-parse failed - About will show an unknown commit/date." -ForegroundColor Yellow
}

if ($Nightly) {
    # Marks this binary as nightly at runtime (About/update-check/config &
    # update-cache path separation - see internal/utils/channel.go).
    $ldflags += " -X 'zentro/internal/utils.Channel=nightly'"
}

$buildFlags = @(
    "build",
    "-clean",
    "-platform", "windows/amd64",
    "-ldflags", $ldflags,
    "-o", $outputName
)

if ($Dev) {
    # Dev builds include the dev-only license override (ZENTRO_DEV_TIER) and
    # debug tools. Production builds intentionally omit this tag.
    $buildFlags += "-tags", "dev"
}

# Add NSIS installer if not disabled
if (-not $NoInstaller) {
    $buildFlags += "-nsis"
}

# Nightly is a genuinely separate, side-by-side installable app (VSCode /
# Insiders style) - not stable rebuilt with a flag flipped. That identity
# (install folder, Start Menu/Desktop shortcut, exe name, WebView2 data
# folder - all derived by project.nsi from wails.json) has to come from
# wails.json itself, so we temporarily swap in a nightly-flavored copy for
# the duration of the build and always restore the original afterward.
$wailsJsonPath = Join-Path $PSScriptRoot "wails.json"
$utf8NoBom = New-Object System.Text.UTF8Encoding $false

$originalWailsJsonRaw = $null
if ($Nightly) {
    Write-Host "Building NIGHTLY variant (separate install identity)" -ForegroundColor Magenta
    $originalWailsJsonRaw = Get-Content -Raw "wails.json"
    $nightlyWailsJson = $originalWailsJsonRaw | ConvertFrom-Json
    $nightlyWailsJson.name = "zentro-nightly"
    $nightlyWailsJson.outputfilename = "zentro-nightly"
    $nightlyWailsJson.info.productName = "Zentro Nightly"
    # Windows PowerShell 5.1's Set-Content -Encoding utf8 always writes a
    # BOM, which the Wails CLI's JSON parser chokes on ("invalid character
    # 'ï'" - the first BOM byte). Write BOM-less UTF-8 directly instead.
    $nightlyJsonText = $nightlyWailsJson | ConvertTo-Json -Depth 10
    [System.IO.File]::WriteAllText($wailsJsonPath, $nightlyJsonText, $utf8NoBom)
}

try {
    # Run wails build
    wails @buildFlags
    $buildExitCode = $LASTEXITCODE
} finally {
    if ($null -ne $originalWailsJsonRaw) {
        [System.IO.File]::WriteAllText($wailsJsonPath, $originalWailsJsonRaw, $utf8NoBom)
    }
}

if ($buildExitCode -eq 0) {
    & (Join-Path $PSScriptRoot "scripts\check-exe-icon.ps1") -Path (Join-Path $PSScriptRoot "build\bin\$outputName")
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
    Write-Host "OK: Build successful!" -ForegroundColor Green
    Write-Host "  Executable: build\bin\$outputName" -ForegroundColor Cyan
    if (-not $NoInstaller) {
        $installerName = if ($Nightly) { "zentro-nightly-amd64-installer.exe" } else { "zentro-amd64-installer.exe" }
        Write-Host "  Installer:  build\bin\$installerName" -ForegroundColor Cyan
    }
} else {
    Write-Host "FAILED: Build failed with exit code $buildExitCode" -ForegroundColor Red
    exit $buildExitCode
}
