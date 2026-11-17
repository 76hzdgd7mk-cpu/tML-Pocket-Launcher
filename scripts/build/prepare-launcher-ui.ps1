[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$uiRoot = Join-Path $repoRoot 'ui/launcher'
$assetRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot 'android/app/src/main/assets/ui'))
if (-not $assetRoot.StartsWith($repoRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'UI asset output must remain inside the checkout'
}
Push-Location $uiRoot
try {
    # Use Node directly so Windows PowerShell npm execution policies do not affect builds.
    $node = (Get-Command node -ErrorAction Stop).Source
    if (-not (Test-Path -LiteralPath 'node_modules/vite/bin/vite.js')) {
        & npm.cmd ci
        if ($LASTEXITCODE -ne 0) { throw 'UI dependency installation failed' }
    }
    & $node 'node_modules/typescript/lib/tsc.js' --noEmit
    if ($LASTEXITCODE -ne 0) { throw 'UI type check failed' }
    & $node 'node_modules/vite/bin/vite.js' build
    if ($LASTEXITCODE -ne 0) { throw 'UI build failed' }
    if (Test-Path -LiteralPath $assetRoot) { Remove-Item -LiteralPath $assetRoot -Recurse -Force }
    New-Item -ItemType Directory -Path $assetRoot -Force | Out-Null
    Copy-Item -Path 'dist/*' -Destination $assetRoot -Recurse -Force
    # Development previews and source maps are not production entry points.
    Get-ChildItem -LiteralPath $assetRoot -Recurse -File -Filter '*.map' | Remove-Item -Force
    $preview = Join-Path $assetRoot 'preview.html'
    if (Test-Path -LiteralPath $preview) { Remove-Item -LiteralPath $preview -Force }
} finally { Pop-Location }
Write-Output 'Prepared offline production launcher UI.'
