[CmdletBinding()]
param(
    [switch]$Clean,
    [string]$GeneratedSourceRoot = $env:TML_GENERATED_SOURCE_ROOT
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$sourceInput = Join-Path $repoRoot 'third_party/tModLoader'
$stagedSource = Join-Path $repoRoot 'build/tmodloader-src'
$overlayRoot = Join-Path $repoRoot 'platforms/android/overlay'
$manifestPath = Join-Path $stagedSource 'source-manifest.json'

function Assert-GeneratedPath([string]$path) {
    $root = [IO.Path]::GetFullPath((Join-Path $repoRoot 'build'))
    $full = [IO.Path]::GetFullPath($path)
    if (-not $full.StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to modify a path outside the generated build directory: $full"
    }
}

function Remove-GeneratedDirectory([string]$path) {
    if (-not (Test-Path -LiteralPath $path)) {
        return
    }

    try {
        [IO.Directory]::Delete([IO.Path]::GetFullPath($path), $true)
    }
    catch {
        # MSBuild can leave a stale directory entry for a generated runtimeconfig file.
        # Delete files through the extended path namespace before removing parent folders.
        $files = @(Get-ChildItem -LiteralPath $path -Recurse -Force -File -ErrorAction SilentlyContinue)
        foreach ($file in $files) {
            $extendedFilePath = '\\?\' + $file.FullName
            if ([IO.File]::Exists($extendedFilePath)) {
                [IO.File]::SetAttributes($extendedFilePath, [IO.FileAttributes]::Normal)
                [IO.File]::Delete($extendedFilePath)
            }
        }

        $directories = @(Get-ChildItem -LiteralPath $path -Recurse -Force -Directory -ErrorAction SilentlyContinue |
            Sort-Object { $_.FullName.Length } -Descending)
        foreach ($directory in $directories) {
            [IO.Directory]::Delete('\\?\' + $directory.FullName, $false)
        }
        [IO.Directory]::Delete('\\?\' + [IO.Path]::GetFullPath($path), $false)
    }

    if (Test-Path -LiteralPath $path) {
        throw "Generated directory could not be removed: $path"
    }
}

if (-not (Test-Path (Join-Path $sourceInput '.git')) -and -not (Test-Path (Join-Path $sourceInput '.git') -PathType Leaf)) {
    throw "tModLoader submodule is missing or not initialized: $sourceInput"
}

Assert-GeneratedPath $stagedSource
if ($Clean -and (Test-Path $stagedSource)) {
    Remove-GeneratedDirectory $stagedSource
}

if (Test-Path $stagedSource) {
    Remove-GeneratedDirectory $stagedSource
}

New-Item -ItemType Directory -Path $stagedSource -Force | Out-Null
Get-ChildItem -LiteralPath $sourceInput -Force | Where-Object { $_.Name -ne '.git' } |
    Copy-Item -Destination $stagedSource -Recurse -Force

if ([string]::IsNullOrWhiteSpace($GeneratedSourceRoot)) {
    $GeneratedSourceRoot = Join-Path $sourceInput 'src'
}
if (-not (Test-Path (Join-Path $GeneratedSourceRoot 'WorkspaceInfo.targets'))) {
    throw "Generated tModLoader source is missing. Provide -GeneratedSourceRoot pointing to a prepared src directory; commercial Terraria source is never committed."
}
$stagedGeneratedSource = Join-Path $stagedSource 'src'
New-Item -ItemType Directory -Path $stagedGeneratedSource -Force | Out-Null
Get-ChildItem -LiteralPath $GeneratedSourceRoot -Force |
    Where-Object { $_.Name -notin @('bin', 'obj') } |
    Copy-Item -Destination $stagedGeneratedSource -Recurse -Force

@(Get-ChildItem -LiteralPath $stagedGeneratedSource -Recurse -Force -Directory |
    Where-Object { $_.Name -in @('bin', 'obj') } |
    Sort-Object { $_.FullName.Length } -Descending) |
    ForEach-Object { Remove-GeneratedDirectory $_.FullName }

Get-ChildItem -LiteralPath $stagedSource -Recurse -Force -Filter '.git' -ErrorAction SilentlyContinue |
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

Copy-Item (Join-Path $repoRoot 'Directory.Build.props') (Join-Path $stagedSource 'Directory.Build.props') -Force
Copy-Item (Join-Path $repoRoot 'platforms/android/Directory.Build.targets') (Join-Path $stagedSource 'Directory.Build.targets') -Force
Copy-Item (Join-Path $repoRoot 'platforms/android/AndroidBuild.props') (Join-Path $stagedSource 'AndroidBuild.props') -Force

Push-Location $stagedSource
try {
    git init --quiet
    git add -A
    git commit --quiet -m 'generated tModLoader source baseline'

    $patches = Get-ChildItem (Join-Path $repoRoot 'patches/android') -Filter '*.patch' | Sort-Object Name
    foreach ($patch in $patches) {
        git apply --check --recount --whitespace=error $patch.FullName
        if ($LASTEXITCODE -ne 0) { throw "Patch validation failed: $($patch.Name)" }
        git apply --recount --whitespace=error $patch.FullName
        if ($LASTEXITCODE -ne 0) { throw "Patch application failed: $($patch.Name)" }
    }
}
finally {
    Pop-Location
}

$patchFiles = @(Get-ChildItem (Join-Path $repoRoot 'patches/android') -Filter '*.patch' | Sort-Object Name)
$overlayManifest = @{
    sourceRevision = (git -C $sourceInput rev-parse HEAD).Trim()
    generatedSourceRoot = [IO.Path]::GetFullPath($GeneratedSourceRoot)
    generatedAtUtc = [DateTime]::UtcNow.ToString('O')
    patchFiles = @($patchFiles | ForEach-Object { $_.Name })
    stagedPath = $stagedSource
}
$overlayManifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
Write-Host "Prepared tModLoader source at $stagedSource"
