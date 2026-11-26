[CmdletBinding()]
param([string] $OutputDirectory)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$version = [IO.File]::ReadAllText((Join-Path $root 'VERSION')).Trim()
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'VERSION must contain a numeric major.minor.patch version.' }
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $root 'dist' }
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
$framework = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319'
if (-not (Test-Path -LiteralPath (Join-Path $framework 'csc.exe'))) {
    $framework = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319'
}
$compiler = Join-Path $framework 'csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { throw 'The built-in .NET Framework compiler was not found.' }
$release = (Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full' -ErrorAction Stop).Release
if ($release -lt 528040) { throw '.NET Framework 4.8 or later is required (included with Windows 10 1903+ and Windows 11).' }

$staging = Join-Path $root ('.build\windows\build-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $staging -Force | Out-Null
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$iconHelper = Join-Path $staging 'CreateIcon.exe'
$icon = Join-Path $staging 'AppProxy.ico'
& $compiler /nologo /target:winexe /optimize+ "/out:$iconHelper" /reference:System.Drawing.dll (Join-Path $PSScriptRoot 'Create-Icon.cs')
if ($LASTEXITCODE -ne 0) { throw 'Icon helper compilation failed.' }
$iconProcess = Start-Process -FilePath $iconHelper -ArgumentList ('"' + $icon + '"') -WindowStyle Hidden -Wait -PassThru
if ($iconProcess.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $icon)) { throw 'Icon generation failed.' }

$candidate = Join-Path $staging 'App Proxy.exe'
$sources = @('Core.cs', 'Services.cs', 'UI.cs', 'Program.cs') | ForEach-Object { Join-Path $PSScriptRoot "ProxyAssistant\$_" }
$versionSource = Join-Path $staging 'VersionInfo.cs'
[IO.File]::WriteAllText($versionSource, ('[assembly: System.Reflection.AssemblyVersion("' + $version + '.0")]' + [Environment]::NewLine +
    '[assembly: System.Reflection.AssemblyFileVersion("' + $version + '.0")]' + [Environment]::NewLine +
    '[assembly: System.Reflection.AssemblyInformationalVersion("' + $version + '")]'), (New-Object Text.UTF8Encoding($false)))
$sources += $versionSource
$manifestPath = Join-Path $staging 'app.manifest'
[xml] $manifest = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'app.manifest'))
$manifest.assembly.assemblyIdentity.version = $version + '.0'
$manifest.Save($manifestPath)
$options = @(
    '/nologo', '/target:winexe', '/platform:anycpu', '/optimize+', '/codepage:65001', '/warn:4', '/warnaserror+',
    "/out:$candidate", "/win32icon:$icon", "/win32manifest:$manifestPath",
    '/reference:System.Windows.Forms.dll', '/reference:System.Drawing.dll', '/reference:System.Web.Extensions.dll',
    "/resource:$(Join-Path $root 'Launch-ChatGPT.ps1'),AppProxy.Launcher.ps1"
)
& $compiler @options @sources
if ($LASTEXITCODE -ne 0) { throw 'Assistant compilation failed.' }
$destination = Join-Path $OutputDirectory 'App Proxy.exe'
if (Test-Path -LiteralPath $destination) {
    if ([Reflection.AssemblyName]::GetAssemblyName($destination).Name -ne 'App Proxy') {
        throw "Refusing to replace an unrelated executable: $destination"
    }
}
Copy-Item -LiteralPath $candidate -Destination $destination -Force
$built = Get-Item -LiteralPath $destination
Write-Host ('Built: ' + $built.FullName)
Write-Host ('Size: ' + $built.Length + ' bytes. Single EXE; no SDK, Node, Python, or installer needed to run.')
