[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
& (Join-Path $PSScriptRoot 'prepare-game-references.ps1')
$tmlRoot = [IO.File]::ReadAllText((Join-Path $repoRoot 'build/game-references/source.txt')).Trim()
$modRoot = Join-Path $repoRoot 'managed/mods/MobileJoystick'
$buildData = Join-Path $repoRoot 'build/mod-packaging-userdata'
dotnet build (Join-Path $modRoot 'MobileJoystick.csproj') -c Release --nologo
if ($LASTEXITCODE -ne 0) { throw 'MobileJoystick compile failed' }
# tML's own packager converts textures and creates the signed-format container.
# Its user data is isolated from both the developer's and the phone's saves.
Push-Location $tmlRoot
try {
    dotnet tModLoader.dll -server -tmlsavedirectory $buildData -build $modRoot -eac (Join-Path $modRoot 'bin/Release/net10.0/MobileJoystick.dll')
    if ($LASTEXITCODE -ne 0) { throw 'MobileJoystick packaging failed' }
} finally { Pop-Location }
$package = Join-Path $buildData 'Mods/MobileJoystick.tmod'
if (-not (Test-Path -LiteralPath $package)) { throw "Missing packaged mod: $package" }
$destination = Join-Path $repoRoot 'build/builtin-mods'
New-Item -ItemType Directory -Path $destination -Force | Out-Null
Copy-Item -LiteralPath $package -Destination $destination -Force
Write-Output 'Packaged launcher-owned MobileJoystick; tML/FNA remain external imports.'
