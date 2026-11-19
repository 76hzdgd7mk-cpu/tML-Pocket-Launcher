[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
& (Join-Path $PSScriptRoot '../build/prepare-game-references.ps1')
dotnet build (Join-Path $repoRoot 'external/tML-Pocket-Mods/MobileJoystick/MobileJoystick.csproj') -c Release --nologo -p:LauncherRoot=$repoRoot
if ($LASTEXITCODE -ne 0) { throw 'Touch-mod fixture build failed' }
dotnet run --project (Join-Path $repoRoot 'managed/tests/MobileLauncher.Patches.RuntimeHarness') -c Release
if ($LASTEXITCODE -ne 0) { throw 'Real-assembly touch/frame runtime checks failed' }
