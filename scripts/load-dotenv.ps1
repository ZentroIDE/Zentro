param(
    [string[]]$Paths = @(
        (Join-Path $PSScriptRoot '..\.env'),
        (Join-Path $PSScriptRoot '..\.env.txt')
    )
)

foreach ($path in $Paths) {
    if (-not (Test-Path $path)) {
        continue
    }

    Get-Content $path | ForEach-Object {
        $line = $_.Trim()
        if ($line -eq '' -or $line.StartsWith('#')) {
            return
        }

        if ($line -notmatch '^\s*([^=]+?)\s*=\s*(.*)\s*$') {
            return
        }

        $name = $matches[1].Trim()
        $value = $matches[2].Trim()

        if (
            ($value.StartsWith('"') -and $value.EndsWith('"')) -or
            ($value.StartsWith("'") -and $value.EndsWith("'"))
        ) {
            $value = $value.Substring(1, $value.Length - 2)
        }

        Set-Item -Path "Env:$name" -Value $value
    }

    break
}
