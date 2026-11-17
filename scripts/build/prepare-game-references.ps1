[CmdletBinding()]
param([string]$TmlRoot = $env:TML_REFERENCE_ROOT)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$references = Join-Path $repoRoot 'build/game-references'
$configuration = Join-Path $references 'source.txt'
if (-not $TmlRoot -and (Test-Path -LiteralPath $configuration)) {
    $TmlRoot = [IO.File]::ReadAllText($configuration).Trim()
}
if (-not $TmlRoot -or -not (Test-Path -LiteralPath (Join-Path $TmlRoot 'tMLMod.targets'))) {
    throw 'Set TML_REFERENCE_ROOT to an installed, precompiled tModLoader release, or run prepare-game-references.ps1 -TmlRoot <release>. No game sources are compiled.'
}
$TmlRoot = (Resolve-Path -LiteralPath $TmlRoot).Path
New-Item -ItemType Directory -Path $references -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $TmlRoot 'tModLoader.dll') -Destination $references -Force
foreach ($name in @('FNA', 'ReLogic', 'TerrariaHooks', 'Newtonsoft.Json', 'log4net')) {
    $matches = @(Get-ChildItem -LiteralPath (Join-Path $TmlRoot 'Libraries') -Recurse -File -Filter "$name.dll" |
        Where-Object { $_.FullName -notmatch '[\\/](runtime[^\\/]*|BuildHost-netcore)[\\/]' })
    if ($matches.Count -ne 1) { throw "Expected one precompiled reference for $name; found $($matches.Count)" }
    Copy-Item -LiteralPath $matches[0].FullName -Destination $references -Force
}
[IO.File]::WriteAllText($configuration, $TmlRoot)
Write-Output "Prepared local compile-only references from $TmlRoot (not packaged in the APK)."
