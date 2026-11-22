[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string]$OutputPath,
    [string]$ArchivePath
)

$ErrorActionPreference = 'Stop'
$version = '2026.09.3.1'
$sha256 = '5AAED81B245044286C3ADE200F8BAC9162EF932EE8FF11A31E05DA49A186C07B'
$output = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath)
$parent = Split-Path -Parent $output
[IO.Directory]::CreateDirectory($parent) | Out-Null
$temporary = Join-Path $parent (".tmodloader-" + [Guid]::NewGuid() + ".tmp")
try {
    if ($ArchivePath) {
        Copy-Item -LiteralPath $ArchivePath -Destination $temporary
    } else {
        $url = "https://github.com/tModLoader/tModLoader/releases/download/v$version/tModLoader.zip"
        & curl.exe --fail --location --silent --show-error --retry 2 --output $temporary $url
        if ($LASTEXITCODE -ne 0) { throw "Could not download tModLoader $version." }
    }
    $stream = [IO.File]::OpenRead($temporary)
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try {
        $hash = [BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '')
    } finally {
        $algorithm.Dispose()
        $stream.Dispose()
    }
    if ($hash -ne $sha256) {
        throw "tModLoader $version archive does not match the official release SHA-256."
    }
    Move-Item -LiteralPath $temporary -Destination $output -Force
    Write-Output "Prepared tModLoader $version at $output"
} finally {
    if ([IO.File]::Exists($temporary)) { [IO.File]::Delete($temporary) }
}
