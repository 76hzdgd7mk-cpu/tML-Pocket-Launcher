[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$project = Join-Path $repoRoot 'FnaTemplate.csproj'
$publish = Join-Path $repoRoot 'bin/Release/net10.0/linux-arm64/publish'
$assetRoot = Join-Path $repoRoot 'platforms/android/app/src/main/assets/game'

dotnet publish $project -c Release -r linux-arm64 --self-contained false
if ($LASTEXITCODE -ne 0) { throw "dotnet publish failed with exit code $LASTEXITCODE" }

if (Test-Path -LiteralPath $assetRoot) {
    Get-ChildItem -LiteralPath $assetRoot -Force | Remove-Item -Recurse -Force
} else {
    New-Item -ItemType Directory -Path $assetRoot -Force | Out-Null
}

Copy-Item -Path (Join-Path $publish '*') -Destination $assetRoot -Recurse -Force
@"
{
  "formatVersion": 1,
  "assembly": "FnaTemplate.dll",
  "runtime": "10.0.4"
}
"@ | Set-Content -LiteralPath (Join-Path $assetRoot 'manifest.json') -Encoding utf8

if (-not (Test-Path -LiteralPath (Join-Path $assetRoot 'FnaTemplate.dll'))) {
    throw 'FnaTemplate.dll was not published into APK game assets'
}
