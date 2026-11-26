[CmdletBinding()]
param([string] $OutputDirectory, [string] $ExecutablePath)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$version = [IO.File]::ReadAllText((Join-Path $root 'VERSION')).Trim()
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid VERSION.' }
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $root "dist\releases\v$version" }
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
$executable = $ExecutablePath
if (-not $executable) { $executable = Join-Path $root 'dist\App Proxy.exe' }
$executable = [IO.Path]::GetFullPath($executable)
if (-not (Test-Path -LiteralPath $executable)) { throw 'Build the Windows assistant before packaging.' }
if ([Diagnostics.FileVersionInfo]::GetVersionInfo($executable).FileVersion -ne "$version.0") {
    throw 'The executable version does not match VERSION. Rebuild it first.'
}
$name = "AppProxy-$version-Windows"
$archive = Join-Path $OutputDirectory "$name.zip"
if (Test-Path -LiteralPath $archive) { throw "Refusing to overwrite an existing release archive: $archive" }
$staging = Join-Path $root ('.build\release-' + [Guid]::NewGuid().ToString('N'))
$package = Join-Path $staging $name
New-Item -ItemType Directory -Path $package -Force | Out-Null
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
Copy-Item -LiteralPath $executable -Destination (Join-Path $package 'App Proxy.exe')
Copy-Item -LiteralPath (Join-Path $root 'release\README.windows.md') -Destination (Join-Path $package 'README.md')
Copy-Item -LiteralPath (Join-Path $root 'release\README.windows.zh-CN.md') -Destination (Join-Path $package 'README.zh-CN.md')
Copy-Item -LiteralPath (Join-Path $root 'LICENSE') -Destination (Join-Path $package 'LICENSE')
$commit = (& git -C $root rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Cannot identify the source commit.' }
$dirty = [bool] (& git -C $root status --porcelain --untracked-files=normal)
$metadata = [ordered]@{ version = $version; platform = 'Windows'; architecture = 'AnyCPU'; sourceCommit = $commit;
    sourceDirty = $dirty; builtAtUtc = [DateTime]::UtcNow.ToString('o'); signature = 'unsigned' }
[IO.File]::WriteAllText((Join-Path $package 'BUILD-INFO.json'), ($metadata | ConvertTo-Json), (New-Object Text.UTF8Encoding($false)))
$binaryHash = (Get-FileHash -LiteralPath $executable -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText((Join-Path $package 'APP_SHA256SUMS.txt'), ($binaryHash + '  App Proxy.exe' + "`n"), (New-Object Text.UTF8Encoding($false)))
Compress-Archive -LiteralPath $package -DestinationPath $archive -CompressionLevel Optimal
# Verify the actual ZIP, including the embedded executable, rather than only the staging folder.
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead($archive)
try {
    $entries = @($zip.Entries | ForEach-Object { $_.FullName.Replace('\', '/') })
    foreach ($required in @('App Proxy.exe', 'README.md', 'README.zh-CN.md', 'LICENSE', 'BUILD-INFO.json', 'APP_SHA256SUMS.txt')) {
        if ($entries -notcontains "$name/$required") { throw "Release archive is missing $required" }
    }
    $entry = $zip.Entries | Where-Object { $_.FullName.Replace('\', '/') -eq "$name/App Proxy.exe" } | Select-Object -First 1
    $entryStream = $entry.Open()
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
        $archivedHash = [BitConverter]::ToString($sha.ComputeHash($entryStream)).Replace('-', '').ToLowerInvariant()
        if ($archivedHash -ne $binaryHash) { throw 'Archived executable does not match the built executable.' }
    }
    finally { $sha.Dispose(); $entryStream.Dispose() }
}
finally { $zip.Dispose() }
Write-Host ('Packaged and verified: ' + $archive)
