# Windows Tray Launcher Implementation Plan

> Implementation is authorized by the user's request to build the native tray launcher. Execute the steps in this workspace and verify the result before delivery.

**Goal:** Ship a small, single-file Windows tray assistant without an SDK, browser engine, installer, or additional runtime installation on Windows 10 1903+ / Windows 11.

**Architecture:** A C# 5 / .NET Framework 4.8 WinForms executable owns the tray UI, settings, process identity, and normal restart workflow. It embeds the existing PowerShell launcher and invokes Windows PowerShell only for package discovery and launching. The existing command-line entry point keeps its default behavior.

**Tech Stack:** Windows Forms, built-in .NET Framework compiler, Windows PowerShell 5.1, JSON files under LocalAppData, HKCU login startup only when explicitly selected in the UI.

---

### Task 1: Shared launcher integration

- Modify `Launch-ChatGPT.ps1` to add read-only package inspection and an optional structured launch report.
- Bound the TCP connection wait. Preserve the existing port and explicit force-restart options.
- Verify inspection does not need a proxy and launch reports describe a live process at the expected executable path.

### Task 2: Native assistant

- Add `windows/ProxyAssistant/Core.cs`, `Services.cs`, `UI.cs`, and `Program.cs`.
- Persist validated port/preferences and PID + process start time + executable path + configuration records. Preserve unreadable or future-version settings.
- Add a single-instance tray UI, launch/show, normal restart, settings, port check, and bounded rotating logs.
- Login startup and automatic ChatGPT launch are independent, off by default. Quitting the assistant leaves the target application running.
- Distinguish a recorded launch request from unconfirmed existing processes; no UI state establishes actual proxy traffic.

### Task 3: Dependency-free build and verification

- Add `windows/build.ps1`, a GUI application manifest, and a code-drawn icon. Embed the script in `dist/App Proxy.exe`.
- Add `windows/tests/Run-Tests.ps1` and C# tests with temporary fixture applications and loopback listeners.
- Verify configuration preservation, process identity, failed-proxy restart behavior, hidden script execution, environment/argument propagation, graceful restart, and actual WinForms rendering.
- Tests must not close/restart real ChatGPT, register startup, or alter system proxy/TUN.

### Task 4: Documentation and CI

- Add English/Chinese Windows guides and update both root README platform entries.
- Add a Windows workflow that builds and runs the isolated tests.
- Report the produced executable size, test results, and any real-app validation that remains unverified.

## Verification completed

- Built `dist/App Proxy.exe` with the Windows .NET Framework compiler and warnings treated as errors; final size: 57,344 bytes (56 KiB).
- All 14 isolated test groups passed. The native fixture tests verified proxy arguments/environment, process records, a failed-proxy restart preserving the old process, normal restart, and the package-context fallback.
- Rendered and inspected the native panel, settings, and diagnostics controls; illustrative previews are included in the Windows guides.
- Ran the final standalone EXE with a fresh project-local profile: its GUI subsystem, hidden read-only package discovery, and readable diagnostics passed. It correctly discovered the installed Microsoft Store ChatGPT package without launching or closing real ChatGPT.
- Root command-line package inspection and `git diff --check` passed. Initial local verification did not include remote CI; subsequent release verification is recorded by the repository's GitHub Actions runs.
- Real ChatGPT proxy routing and feature coverage remain unverified and require the proxy client's connections view. No login startup was enabled during verification.
