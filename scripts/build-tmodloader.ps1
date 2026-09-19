[CmdletBinding()]
param(
    [ValidateSet('Debug', 'Release')]
    [string]$Configuration = 'Release',
    [switch]$Restore,
    [switch]$Clean,
    [string]$GeneratedSourceRoot = $env:TML_GENERATED_SOURCE_ROOT
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$prepare = Join-Path $repoRoot 'scripts/prepare-tmodloader-source.ps1'
$sourceRoot = Join-Path $repoRoot 'build/tmodloader-src'
$outputRoot = Join-Path $repoRoot 'build/tmodloader-output'
$project = Join-Path $sourceRoot 'src/TModLoader/Terraria/Terraria.csproj'
$builtOutput = Join-Path $sourceRoot "src/TModLoader/Terraria/bin/$Configuration/net8.0"

if ($Clean -and (Test-Path $outputRoot)) {
    $fullOutput = [IO.Path]::GetFullPath($outputRoot)
    $buildRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot 'build'))
    if (-not $fullOutput.StartsWith($buildRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to remove output outside build/: $fullOutput"
    }
    Remove-Item -LiteralPath $outputRoot -Recurse -Force
}

& $prepare -Clean:$Clean -GeneratedSourceRoot $GeneratedSourceRoot
if ($LASTEXITCODE -ne 0) { throw 'tModLoader source preparation failed' }

$arguments = @('build', $project, '-c', $Configuration, '-p:TmlAndroid=true', "-p:TmlAndroidOutputRoot=$outputRoot")
$assetsFile = Join-Path $sourceRoot 'src/TModLoader/Terraria/obj/project.assets.json'
if (-not $Restore -and (Test-Path $assetsFile)) { $arguments += '--no-restore' }
& dotnet @arguments
if ($LASTEXITCODE -ne 0) { throw "tModLoader build failed with exit code $LASTEXITCODE" }

$builtAssembly = Join-Path $builtOutput 'tModLoader.dll'
if (-not (Test-Path $builtAssembly)) { throw "Missing tModLoader build output: $builtAssembly" }

if (Test-Path $outputRoot) {
    $fullOutput = [IO.Path]::GetFullPath($outputRoot)
    $buildRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot 'build'))
    if (-not $fullOutput.StartsWith($buildRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to remove output outside build/: $fullOutput"
    }
    Remove-Item -LiteralPath $outputRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
Get-ChildItem -LiteralPath $builtOutput -Recurse -Force -File |
    Where-Object {
        [IO.File]::Exists($_.FullName) -and
        $_.FullName -notlike '*\Libraries\microsoft.codeanalysis.workspaces.msbuild\*\BuildHost-netcore\*'
    } |
    ForEach-Object {
        $relativePath = $_.FullName.Substring($builtOutput.Length).TrimStart('\', '/')
        $destination = Join-Path $outputRoot $relativePath
        New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($destination)) -Force | Out-Null
        Copy-Item -LiteralPath $_.FullName -Destination $destination -Force
    }

$assembly = Join-Path $outputRoot 'tModLoader.dll'
$runtimeConfig = Join-Path $outputRoot 'tModLoader.runtimeconfig.json'
if (-not (Test-Path $assembly)) { throw "Missing tModLoader assembly: $assembly" }
if (-not (Test-Path $runtimeConfig)) { throw "Missing tModLoader runtime configuration: $runtimeConfig" }
Write-Host "Built $assembly"
