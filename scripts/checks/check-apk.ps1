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
    'lib/arm64-v8a/libdotnethost.so',
    'lib/arm64-v8a/libSDL3.so',
    'lib/arm64-v8a/libSDL2_compat.so',
    'lib/arm64-v8a/libFNA3D_sdl3.so',
    'lib/arm64-v8a/libFAudio_sdl3.so',
    'lib/arm64-v8a/libc++_shared.so',
    'assets/runtime/dotnet.tar.xz',
    'assets/launcher/manifest.json',
    'assets/launcher/MobileLauncher.Host.dll',
    'assets/launcher/MobileLauncher.Host.runtimeconfig.json',
    'assets/launcher/MobileLauncher.Bootstrap.dll',
    'assets/launcher/MobileLauncher.Patches.dll',
    'assets/launcher/RotatingartLauncher-LICENSE.txt',
    'assets/launcher/BuiltinMods/MobileJoystick.tmod',
    'assets/launcher/Stores/MobileLauncher.Stores.dll',
    'assets/launcher/Stores/MobileLauncher.Stores.runtimeconfig.json',
    'assets/launcher/Stores/SteamKit2.dll',
    'assets/ui/index.html',
    'assets/ui/icons.svg',
    'assets/ui/animate-ui-license.txt',
    'assets/ui/inspira-ui-license.txt',
    'assets/ui/steamkit-license.txt'
)) {
    if (-not ($entries -contains $required)) { throw "APK is missing $required" }
    Write-Output "Found $required"
}

$gameEntries = @($entries | Where-Object {
    $_ -like 'assets/game/*' -or
    $_ -match '(?i)(^|/)(tModLoader|FNA)\.dll$' -or
    $_ -match '(?i)^assets/(launcher/)?Content/'
})
if ($gameEntries.Count -gt 0) {
    throw "APK must contain only launcher/runtime files, but includes: $($gameEntries -join ', ')"
}
Write-Output 'Verified launcher-only APK: no game assemblies, managed FNA, or game Content'
if ($entries -contains 'assets/ui/preview.html' -or @($entries | Where-Object { $_ -like 'assets/ui/*.map' -or $_ -like 'assets/ui/assets/*.map' }).Count -gt 0) {
    throw 'Production UI must not contain development previews or source maps'
}
