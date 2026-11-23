# Launch the Microsoft Store ChatGPT desktop app with a local HTTP/Mixed proxy.
# Unofficial community project. No changes are made to system proxy settings or TUN.
[CmdletBinding()]
param(
    [ValidateRange(1, 65535)]
    [int] $Port = 7890,

    # Force-close an existing ChatGPT instance so the new startup flags take effect.
    [switch] $ForceRestart
)

$ErrorActionPreference = 'Stop'
$proxy = "http://127.0.0.1:$Port"

try {
    Write-Host "Checking local proxy listener: $proxy"
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $client.Connect('127.0.0.1', $Port)
    }
    finally {
        $client.Dispose()
    }

    $packages = @(
        foreach ($name in @('OpenAI.Codex', 'OpenAI.ChatGPT-Desktop')) {
            Get-AppxPackage -Name $name -ErrorAction SilentlyContinue
        }
    )
    $package = $packages | Sort-Object Version -Descending | Select-Object -First 1
    if (-not $package) {
        throw 'Microsoft Store ChatGPT package not found. Install the official Windows application first.'
    }

    # Prefer the executable path reported by the installed Appx manifest.
    $executable = $null
    $appId = $null
    try {
        $manifest = Get-AppxPackageManifest -Package $package.PackageFullName
        $app = @($manifest.Package.Applications.Application) |
            Where-Object { $_.Executable -match '(?i)(ChatGPT|Codex)\.exe$' } |
            Select-Object -First 1
        if ($app) {
            $appId = [string] $app.Id
            $executable = Join-Path $package.InstallLocation ([string] $app.Executable)
        }
    }
    catch {
        Write-Warning "Could not inspect the application manifest: $($_.Exception.Message)"
    }

    if (-not $executable -or -not (Test-Path -LiteralPath $executable -PathType Leaf)) {
        $executable = @('app\ChatGPT.exe', 'ChatGPT.exe', 'app\Codex.exe', 'Codex.exe') |
            ForEach-Object { Join-Path $package.InstallLocation $_ } |
            Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
            Select-Object -First 1
    }
    if (-not $executable) {
        throw "App executable not found under $($package.InstallLocation)."
    }

    $processName = [System.IO.Path]::GetFileNameWithoutExtension($executable)
    $existing = @(Get-Process -Name $processName -ErrorAction SilentlyContinue)
    if ($existing.Count -gt 0) {
        if (-not $ForceRestart) {
            throw "A $processName process is running. Quit the app completely, then retry; or run with -ForceRestart (may discard unsaved work)."
        }
        Write-Warning "Force-closing $($existing.Count) existing $processName process(es)."
        $existing | Stop-Process -Force -ErrorAction Stop
        Start-Sleep -Milliseconds 800
    }

    # These process-scoped variables are inherited only by child processes that support them.
    foreach ($name in @('HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy')) {
        [Environment]::SetEnvironmentVariable($name, $proxy, 'Process')
    }
    foreach ($name in @('NO_PROXY', 'no_proxy')) {
        [Environment]::SetEnvironmentVariable($name, 'localhost,127.0.0.1,::1', 'Process')
    }

    $flags = @(
        "--proxy-server=$proxy",
        '--proxy-bypass-list=localhost;127.0.0.1;[::1]',
        '--disable-quic'
    )

    Write-Host "Launching $($package.Name) with $proxy"
    $started = $false
    try {
        Start-Process -FilePath $executable -ArgumentList $flags -ErrorAction Stop | Out-Null
        Start-Sleep -Seconds 2
        $started = [bool] (Get-Process -Name $processName -ErrorAction SilentlyContinue)
    }
    catch {
        Write-Warning "Direct launch failed: $($_.Exception.Message)"
    }

    # Debugging-oriented fallback; not guaranteed to work across MSIX releases.
    if (-not $started -and $appId -and (Get-Command Invoke-CommandInDesktopPackage -ErrorAction SilentlyContinue)) {
        Write-Warning 'Trying Microsoft Store package-context launch. This method is version-dependent.'
        Invoke-CommandInDesktopPackage -PackageFamilyName $package.PackageFamilyName `
            -AppId $appId -Command $executable -Args ($flags -join ' ') -ErrorAction Stop | Out-Null
        Start-Sleep -Seconds 2
        $started = [bool] (Get-Process -Name $processName -ErrorAction SilentlyContinue)
    }

    if (-not $started) {
        throw 'ChatGPT did not remain running. The installed package may require a different activation method.'
    }

    Write-Host ''
    Write-Host "ChatGPT process detected. Proxy target: $proxy" -ForegroundColor Green
    Write-Host 'System proxy and TUN settings were not modified.' -ForegroundColor Green
    Write-Host 'IMPORTANT: Verify ChatGPT connections in Clash Verge > Connections.'
}
catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
