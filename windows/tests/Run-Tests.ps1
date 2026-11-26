[CmdletBinding()]
param([switch] $SkipBuild, [string] $BuildOutputDirectory)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not $BuildOutputDirectory) { $BuildOutputDirectory = Join-Path $root 'dist' }
$BuildOutputDirectory = [IO.Path]::GetFullPath($BuildOutputDirectory)
if (-not $SkipBuild) { & (Join-Path $root 'windows\build.ps1') -OutputDirectory $BuildOutputDirectory }
$framework = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319'
if (-not (Test-Path -LiteralPath (Join-Path $framework 'csc.exe'))) { $framework = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319' }
$compiler = Join-Path $framework 'csc.exe'
$run = Join-Path $root ('.build\windows\tests-' + [Guid]::NewGuid().ToString('N'))
$fixtureDirectory = Join-Path $run "fixture space's unicode\app"
New-Item -ItemType Directory -Path $fixtureDirectory -Force | Out-Null
$fixture = Join-Path $fixtureDirectory 'ChatGPT.exe'
& $compiler /nologo /target:winexe /optimize+ /codepage:65001 "/out:$fixture" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll (Join-Path $PSScriptRoot 'FixtureApp.cs')
if ($LASTEXITCODE -ne 0) { throw 'Fixture compilation failed.' }
$testExecutable = Join-Path $run 'App Proxy.Tests.exe'
$iconPath = Join-Path $run 'AppProxy.ico'
Add-Type -AssemblyName System.Drawing
$appIcon = [Drawing.Icon]::ExtractAssociatedIcon((Join-Path $BuildOutputDirectory 'App Proxy.exe'))
try {
    $stream = [IO.File]::Create($iconPath)
    try { $appIcon.Save($stream) } finally { $stream.Dispose() }
}
finally { $appIcon.Dispose() }
$sources = @('Core.cs', 'Services.cs', 'UI.cs') | ForEach-Object { Join-Path $root "windows\ProxyAssistant\$_" }
$options = @('/nologo', '/target:exe', '/platform:anycpu', '/optimize+', '/codepage:65001', '/warn:4', '/warnaserror+',
    "/out:$testExecutable", "/win32icon:$iconPath", "/win32manifest:$(Join-Path $root 'windows\app.manifest')",
    '/reference:System.Windows.Forms.dll', '/reference:System.Drawing.dll', '/reference:System.Web.Extensions.dll',
    "/resource:$(Join-Path $root 'Launch-ChatGPT.ps1'),AppProxy.Launcher.ps1")
& $compiler @options @sources (Join-Path $PSScriptRoot 'AssistantTests.cs')
if ($LASTEXITCODE -ne 0) { throw 'Test compilation failed.' }
# Use redirected pipes: no console window is created for test helper processes.
$start = New-Object Diagnostics.ProcessStartInfo
$start.FileName = $testExecutable
$start.Arguments = '"' + $run + '" "' + $fixture + '"'
$start.UseShellExecute = $false
$start.CreateNoWindow = $true
$start.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
$start.RedirectStandardOutput = $true
$start.RedirectStandardError = $true
$start.StandardOutputEncoding = New-Object Text.UTF8Encoding($false)
$start.StandardErrorEncoding = New-Object Text.UTF8Encoding($false)
$process = New-Object Diagnostics.Process
$process.StartInfo = $start
$process.Start() | Out-Null
$outputTask = $process.StandardOutput.ReadToEndAsync()
$errorTask = $process.StandardError.ReadToEndAsync()
if (-not $process.WaitForExit(55000)) {
    $process.Kill()
    throw "Tests exceeded 55 seconds. Inspect $run"
}
Write-Host $outputTask.Result
if ($errorTask.Result) { Write-Host $errorTask.Result }
$testExitCode = $process.ExitCode
$process.Dispose()
Write-Host ('Test artifacts: ' + $run)
if ($testExitCode -ne 0) { throw 'Windows assistant tests failed.' }
