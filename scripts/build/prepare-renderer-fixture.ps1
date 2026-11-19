param(
    [Parameter(Mandatory = $true)]
    [string]$LibraryDirectory
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$source = (Resolve-Path $LibraryDirectory).Path
$target = Join-Path $root "build/renderer-plugin-fixture-assets/tml-renderer/arm64-v8a"
New-Item -ItemType Directory -Force -Path $target | Out-Null

$libraries = @("libGL_gl4es.so", "libEGL_gl4es.so")
$entries = foreach ($name in $libraries) {
    $input = Join-Path $source $name
    if (-not (Test-Path -LiteralPath $input -PathType Leaf)) {
        throw "Required GL4ES library not found: $input"
    }
    $output = Join-Path $target $name
    Copy-Item -LiteralPath $input -Destination $output -Force
    $hash = (Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash.ToLowerInvariant()
    [ordered]@{
        fileName = $name
        assetPath = "tml-renderer/arm64-v8a/$name"
        sha256 = $hash
    }
}

$manifest = [ordered]@{
    protocolVersion = 1
    renderers = @([ordered]@{
        id = "gl4es"
        displayName = "GL4ES Fixture"
        description = "Local GL4ES renderer verification fixture"
        backend = "gl4es"
        minAndroidApi = 28
        abis = @("arm64-v8a")
        libraries = @($entries)
    })
}
$jsonPath = Join-Path $root "build/renderer-plugin-fixture-assets/tml-renderer/manifest.json"
[System.IO.File]::WriteAllText(
    $jsonPath,
    ($manifest | ConvertTo-Json -Depth 8),
    [System.Text.UTF8Encoding]::new($false)
)
Write-Host "Prepared GL4ES fixture assets: $jsonPath"
