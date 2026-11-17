[CmdletBinding()]
param(
    [string]$ArchivePath = 'android/app/src/main/assets/runtime/dotnet.tar.xz'
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$archive = Join-Path $repoRoot $ArchivePath
if (-not (Test-Path -LiteralPath $archive)) {
    throw "Runtime archive not found: $archive"
}

$entries = tar -tf $archive
if ($LASTEXITCODE -ne 0) { throw 'tar could not read the runtime archive' }
$entries = @($entries | ForEach-Object { $_ -replace '^\./', '' -replace '^dotnet/', '' })
$version = [IO.File]::ReadAllText((Join-Path $repoRoot 'android/runtime/runtime-version.txt')).Trim()
foreach ($required in @(
    "host/fxr/$version/libhostfxr.so",
    "shared/Microsoft.NETCore.App/$version/libcoreclr.so"
)) {
    if (-not ($entries -contains $required)) {
        throw "Runtime archive is missing $required"
    }
}
Write-Output "Runtime archive verified: $archive"
