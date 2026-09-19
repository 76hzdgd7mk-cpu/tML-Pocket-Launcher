[CmdletBinding()]
param(
    [string]$GeneratedSourceRoot = $env:TML_GENERATED_SOURCE_ROOT
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$defaultGeneratedSourceRoot = 'D:\tModLoader\src'
if ([string]::IsNullOrWhiteSpace($GeneratedSourceRoot) -and
    (Test-Path -LiteralPath (Join-Path $defaultGeneratedSourceRoot 'WorkspaceInfo.targets'))) {
    $GeneratedSourceRoot = $defaultGeneratedSourceRoot
}
$tmlBuild = Join-Path $repoRoot 'scripts/build-tmodloader.ps1'
$tmlOutput = Join-Path $repoRoot 'build/tmodloader-output'
$hostProject = Join-Path $repoRoot 'src/android/TmlAndroidHost/TmlAndroidHost.csproj'
$hostPublish = Join-Path $repoRoot 'src/android/TmlAndroidHost/bin/Release/net10.0/linux-arm64/publish'
$assetRoot = Join-Path $repoRoot 'platforms/android/app/src/main/assets/game'

& $tmlBuild -Configuration Release -Restore -GeneratedSourceRoot $GeneratedSourceRoot
if ($LASTEXITCODE -ne 0) { throw "tModLoader build failed with exit code $LASTEXITCODE" }

dotnet publish $hostProject -c Release -r linux-arm64 --self-contained false --no-restore
if ($LASTEXITCODE -ne 0) { throw "Android host publish failed with exit code $LASTEXITCODE" }

if (Test-Path -LiteralPath $assetRoot) {
    Get-ChildItem -LiteralPath $assetRoot -Force | Remove-Item -Recurse -Force
} else {
    New-Item -ItemType Directory -Path $assetRoot -Force | Out-Null
}

Copy-Item -Path (Join-Path $hostPublish '*') -Destination $assetRoot -Recurse -Force
Copy-Item -Path (Join-Path $tmlOutput '*') -Destination $assetRoot -Recurse -Force
@"
{
  "formatVersion": 1,
  "assembly": "TmlAndroidHost.dll",
  "runtime": "10.0.4"
}
"@ | Set-Content -LiteralPath (Join-Path $assetRoot 'manifest.json') -Encoding utf8

foreach ($required in @('TmlAndroidHost.dll', 'tModLoader.dll', 'tModLoader.runtimeconfig.json')) {
    if (-not (Test-Path -LiteralPath (Join-Path $assetRoot $required))) {
        throw "$required was not prepared in APK game assets"
    }
}
