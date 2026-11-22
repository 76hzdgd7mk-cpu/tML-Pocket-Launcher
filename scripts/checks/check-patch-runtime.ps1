[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
& (Join-Path $PSScriptRoot '../build/prepare-game-references.ps1')
$buildProps = Join-Path $repoRoot 'managed/Directory.Build.props'
dotnet run --project (Join-Path $repoRoot 'managed/tests/MobileLauncher.Patches.RuntimeHarness') -c Release "-p:DirectoryBuildPropsPath=$buildProps"
if ($LASTEXITCODE -ne 0) { throw 'Real-assembly touch/frame runtime checks failed' }
