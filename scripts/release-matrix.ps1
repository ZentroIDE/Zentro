param (
    [switch]$NoInstaller
)

$platforms = @(
    "windows/amd64",
    "darwin/universal",
    "linux/amd64"
)

foreach ($platform in $platforms) {
    Write-Host "Building $platform..." -ForegroundColor Cyan

    $releaseVersion = (Get-Content package.json -Raw | ConvertFrom-Json).version
    $buildCommit = (git rev-parse HEAD)
    $buildDate = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    $args = @(
        "build",
        "-clean",
        "-platform", $platform,
        "-ldflags", "-X 'zentro/internal/app.Version=v$releaseVersion' -X 'zentro/internal/app.BuildCommit=$buildCommit' -X 'zentro/internal/app.BuildDate=$buildDate'"
    )

    if ($platform -eq "windows/amd64" -and -not $NoInstaller) {
        $args += "-nsis"
    }

    wails @args
    if ($LASTEXITCODE -ne 0) {
        throw "Build failed for $platform with exit code $LASTEXITCODE"
    }
}

Write-Host "Release matrix build complete." -ForegroundColor Green

