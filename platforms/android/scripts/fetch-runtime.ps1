[CmdletBinding()]
param(
    [string]$ArchivePath = 'platforms/android/app/src/main/assets/runtime/dotnet.tar.xz'
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$archive = Join-Path $repoRoot $ArchivePath
if (-not (Test-Path -LiteralPath $archive)) {
    throw "Runtime archive not found: $archive"
}

$entries = tar -tf $archive
if ($LASTEXITCODE -ne 0) { throw 'tar could not read the runtime archive' }
foreach ($required in @(
    'dotnet/host/fxr/10.0.4/libhostfxr.so',
    'dotnet/shared/Microsoft.NETCore.App/10.0.4/libcoreclr.so'
)) {
    if (-not ($entries -contains $required)) {
        throw "Runtime archive is missing $required"
    }
}
Write-Output "Runtime archive verified: $archive"
