[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$SdlSourcePath
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$javaRoot = Join-Path $repoRoot 'android/app/src/main/java/org/libsdl/app'
$versionHeader = [IO.File]::ReadAllText((Join-Path $SdlSourcePath 'include/SDL3/SDL_version.h'))
$activity = [IO.File]::ReadAllText((Join-Path $javaRoot 'SDLActivity.java'))
$nativeVersion = @()
$javaVersion = @()
foreach ($part in @('MAJOR', 'MINOR', 'MICRO')) {
    $nativeValue = [regex]::Match($versionHeader, "(?m)^#define\s+SDL_${part}_VERSION\s+(\d+)")
    $javaValue = [regex]::Match($activity, "\bSDL_${part}_VERSION\s*=\s*(\d+)")
    if (-not $nativeValue.Success -or -not $javaValue.Success) { throw "SDL $part version is missing from native or Java source" }
    $nativeVersion += $nativeValue.Groups[1].Value
    $javaVersion += $javaValue.Groups[1].Value
}
if (($nativeVersion -join '.') -ne ($javaVersion -join '.')) {
    throw "SDL native/Java version mismatch: native=$($nativeVersion -join '.'), Java=$($javaVersion -join '.')"
}

function Get-JniType([string]$Name) {
    $array = ''
    while ($Name.EndsWith('[]')) {
        $array += '['
        $Name = $Name.Substring(0, $Name.Length - 2)
    }
    $descriptor = switch ($Name) {
        'void' { 'V' }
        'boolean' { 'Z' }
        'byte' { 'B' }
        'char' { 'C' }
        'short' { 'S' }
        'int' { 'I' }
        'long' { 'J' }
        'float' { 'F' }
        'double' { 'D' }
        'String' { 'Ljava/lang/String;' }
        'Object' { 'Ljava/lang/Object;' }
        default { throw "Unsupported SDL JNI Java type '$Name'; extend the compatibility check" }
    }
    return $array + $descriptor
}

$missing = [Collections.Generic.List[string]]::new()
$classes = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
$count = 0
foreach ($relative in @('src/core/android/SDL_android.c', 'src/hidapi/android/hid.cpp')) {
    $native = [IO.File]::ReadAllText((Join-Path $SdlSourcePath $relative))
    $tables = [regex]::Matches($native, '(?s)JNINativeMethod\s+(\w+)_tab\s*\[[^\]]*\]\s*=\s*\{(.*?)\n\s*\};')
    if ($tables.Count -eq 0) { throw "SDL JNI registration tables not found in $relative" }
    foreach ($table in $tables) {
        $className = $table.Groups[1].Value
        [void]$classes.Add($className)
        $java = [IO.File]::ReadAllText((Join-Path $javaRoot "$className.java"))
        $java = [regex]::Replace($java, '(?s)/\*.*?\*/|(?m)//[^\r\n]*', '')
        $declarations = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
        foreach ($method in [regex]::Matches($java, '\bnative\s+([\w.\[\]]+)\s+(\w+)\s*\(([^)]*)\)\s*;')) {
            $signature = '('
            foreach ($parameter in ($method.Groups[3].Value -split ',')) {
                if ([string]::IsNullOrWhiteSpace($parameter)) { continue }
                $parameterType = (($parameter.Trim() -replace '^final\s+', '') -split '\s+')[0]
                $signature += Get-JniType $parameterType
            }
            $signature += ')' + (Get-JniType $method.Groups[1].Value)
            [void]$declarations.Add($method.Groups[2].Value + $signature)
        }
        $entries = [regex]::Matches($table.Groups[2].Value, '\{\s*"([^"]+)"\s*,\s*"([^"]+)"')
        if ($entries.Count -eq 0) { throw "SDL JNI registration table is empty: $className" }
        foreach ($entry in $entries) {
            $key = $entry.Groups[1].Value + $entry.Groups[2].Value
            $count++
            if (-not $declarations.Contains($key)) { $missing.Add("$className.$key") }
        }
    }
}
foreach ($required in @('SDLActivity', 'SDLInputConnection', 'SDLAudioManager', 'SDLControllerManager', 'HIDDeviceManager')) {
    if (-not $classes.Contains($required)) { throw "SDL JNI registration table not checked: $required" }
}
if ($missing.Count -gt 0) {
    throw "SDL native/Java JNI mismatch (would fail RegisterNatives on device):`n$($missing -join "`n")"
}
Write-Output "PASS: SDL $($nativeVersion -join '.') and $count JNI registrations match Java declarations across $($classes.Count) classes"
