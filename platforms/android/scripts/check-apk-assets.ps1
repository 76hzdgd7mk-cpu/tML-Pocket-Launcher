[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ApkPath
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $ApkPath)) { throw "APK not found: $ApkPath" }

$jarCommand = Get-Command jar -ErrorAction SilentlyContinue
if ($null -ne $jarCommand) {
    $entries = @(& $jarCommand.Source tf $ApkPath)
    if ($LASTEXITCODE -ne 0) { throw 'jar could not inspect the APK' }
} else {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $ApkPath))
    try {
        $entries = @($archive.Entries | ForEach-Object { $_.FullName })
    } finally {
        $archive.Dispose()
    }
}

foreach ($required in @(
    'lib/arm64-v8a/libmain.so',
    'lib/arm64-v8a/libSDL2.so',
    'assets/runtime/dotnet.tar.xz',
    'assets/game/manifest.json',
    'assets/game/FnaTemplate.dll'
)) {
    if (-not ($entries -contains $required)) { throw "APK is missing $required" }
    Write-Output "Found $required"
}
