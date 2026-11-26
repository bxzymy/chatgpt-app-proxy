# Windows assistant development

User guides: [简体中文](../docs/windows.zh-CN.md) · [English](../docs/windows.md).

The assistant targets .NET Framework 4.8 and C# 5, using the compiler bundled with Windows. No NuGet packages, SDK, browser engine, service, installer, Node.js, or Python are needed.

| File | Responsibility |
| --- | --- |
| `ProxyAssistant/Core.cs` | Validated settings, atomic persistence, process/configuration identity, state, rotating logs. |
| `ProxyAssistant/Services.cs` | Hidden PowerShell helper, exact executable/process discovery, window controls, graceful restart, single-instance signal, opt-in HKCU login startup. |
| `ProxyAssistant/UI.cs` | Native tray, panel, settings, diagnostics, asynchronous operations. |
| `ProxyAssistant/Program.cs` | GUI entry point and optional `--background` / `--data-dir <directory>` arguments. |
| `../Launch-ChatGPT.ps1` | Shared launcher, embedded during compilation. `-InspectOnly` is read-only; `-LaunchReportPath` optionally records an observed new process. Existing CLI defaults remain available. |
| `build.ps1` | Built-in compiler discovery, code-drawn icon, staged compilation, single EXE output. |
| `tests/` | Configuration/process tests, hidden helper tests, loopback/fixture lifecycle tests, native UI rendering, tray event loop. |

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\windows\build.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\windows\tests\Run-Tests.ps1
```

The PowerShell helper receives process-scoped proxy variables. It uses `UseShellExecute = false`, `CreateNoWindow = true`, and a bounded lifetime. Only a stuck helper created by the assistant may be terminated; normal target restart never force-kills the target. Target windows are enumerated by PID and title rather than trusting `Process.MainWindowHandle`, which may identify an input-method overlay.

The test runner creates fixture applications under a new `.build/windows/tests-*/` directory. Package commands are replaced only in test helper processes. Fixtures capture arguments and environment variables, accept a normal close, and have a bounded fallback lifetime. Cleanup may stop only the exact fixture executable within that test directory. Tests never invoke the real app's launch/quit or modify login startup; HKCU startup is checked before and after.

Offscreen images under each test run's `previews/` folder are native control previews with example data, not screenshots or real-app network validation. Build output and private test artifacts are ignored by Git. The macOS implementation remains separate.
