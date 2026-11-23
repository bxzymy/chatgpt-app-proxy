@echo off
setlocal EnableExtensions
rem Double-click this file to launch ChatGPT using the proxy configured in the PowerShell script.
rem ExecutionPolicy Bypass affects only this PowerShell process, not the system policy.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Launch-ChatGPT.ps1" %*
if errorlevel 1 (
    echo.
    echo Launch failed. Review the error above and README.md.
    pause
    exit /b 1
)
exit /b 0
