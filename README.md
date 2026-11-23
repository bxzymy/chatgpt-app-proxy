# ChatGPT App Proxy Launcher (PowerShell)

[简体中文](README.zh-CN.md)

A minimal, auditable PowerShell launcher for the **Microsoft Store ChatGPT desktop app on Windows**. It attempts to send app network requests through an existing local HTTP/Mixed proxy **without enabling a system-wide proxy or TUN mode**.

> **Unofficial and experimental.** Not affiliated with OpenAI, Microsoft or Clash Verge. The app is not bundled. Windows/MSIX updates may change launch behavior. A successful process launch does not prove that all app traffic uses the proxy.

## What it does

- Checks the local HTTP/Mixed proxy listener (default `127.0.0.1:7890`).
- Locates the currently installed Microsoft Store ChatGPT package (`OpenAI.Codex`, with a legacy fallback).
- Attempts to start the app with `--proxy-server`, `--proxy-bypass-list`, and `--disable-quic` flags.
- Supplies `HTTP_PROXY`, `HTTPS_PROXY`, and `ALL_PROXY` environment variables to compatible child processes.
- Does **not** modify the Windows system proxy, enable TUN, install drivers, inject DLLs or provide proxy servers.

## Requirements

- Windows 10/11 and the Microsoft Store version of ChatGPT installed.
- Windows PowerShell 5.1 and an existing local HTTP/Mixed proxy (e.g., Clash Verge Rev or Mihomo).
- The configured local proxy port must be reachable. **Port reachability alone does not verify proxy routing.**

## Quick start

1. Start your proxy client in **Rule** mode. Leave **System Proxy** and **TUN** disabled.
2. Verify the client's **HTTP or Mixed Port** is `7890` (or supply a different port below).
3. Completely exit ChatGPT if it is already running.
4. Double-click [`Launch-ChatGPT.cmd`](Launch-ChatGPT.cmd).
5. In Clash Verge, open **Connections** and verify that ChatGPT-related requests actually appear and match the intended rules.

For another port, run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Launch-ChatGPT.ps1 -Port 7897
```

If the app is already running, quit it normally first. `-ForceRestart` is available, but forcibly closing processes can discard unsaved work.

## Traffic flow

```text
ChatGPT.exe --proxy-server=http://127.0.0.1:7890
     -> local HTTP/Mixed proxy listener
     -> Clash/Mihomo Rule evaluation
     -> PROXY or DIRECT
```

**Rules do not capture traffic by themselves.** The app must first send its requests to the proxy listener. This project attempts to configure that explicitly; it cannot guarantee that every native subsystem honors the proxy settings.

For rule examples see [docs/clash-rules.md](docs/clash-rules.md).

## Troubleshooting

- **Port connection fails:** Start your proxy client and check its actual HTTP/Mixed Port.
- **Package not found:** Install the official Microsoft Store app; this project does not install ChatGPT.
- **App already running:** Completely quit ChatGPT and rerun the launcher.
- **'Missing package identity' or app exits immediately:** MSIX app activation may have changed. The fallback is experimental; please file an issue including Windows and app versions.
- **App opens but does not connect:** Inspect Clash Verge > Connections. If no app requests appear, the launch arguments or environment variables may not be honored.
- **Only some app features work:** Different components may use different network stacks. This launcher is not a transparent proxy.

## Security and privacy

The scripts use built-in Windows PowerShell commands. No remote scripts are downloaded and no telemetry is collected by this launcher. Check the source before executing it. The `.cmd` uses `-ExecutionPolicy Bypass` **for its child PowerShell process only**; it does not change machine-wide policy. Administrator rights should not be necessary.

Never publish proxy subscriptions, node credentials, ChatGPT tokens, session files, or private diagnostic logs.

## Known limitations and compatibility

This project has **not been verified on every Windows/ChatGPT version**. The release package should be tested on a real Windows installation before labeling it stable. `Invoke-CommandInDesktopPackage` is primarily a Microsoft debugging tool and does not guarantee normal app activation.

Please report working and non-working combinations of Windows version, installed ChatGPT package/version, local proxy software and port, and whether requests appear in the proxy client's Connections view.

## License

MIT; before publication replace `[Your Name]` in [LICENSE](LICENSE) with your preferred copyright holder.
