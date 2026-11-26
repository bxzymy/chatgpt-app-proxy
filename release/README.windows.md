# App Proxy for Windows

[简体中文](README.zh-CN.md)

This package contains a native tray assistant for the installed Microsoft Store ChatGPT app. It uses your existing local HTTP/Mixed proxy; it does not provide a proxy server or change the system proxy/TUN.

## Start

1. Extract the ZIP into a stable folder. Keep `App Proxy.exe` there.
2. Start your proxy client and check its HTTP/Mixed port.
3. Double-click `App Proxy.exe`. Open **代理设置** (proxy settings) to change the default port `7890`.
4. Completely quit ChatGPT before applying this configuration for the first time, then click **启动 ChatGPT** (launch).
5. Verify actual app requests in your proxy client's connections view.

Requirements: Windows 10 1903+ / Windows 11, .NET Framework 4.8+ and Windows PowerShell 5.1 (included), and the installed official Microsoft Store ChatGPT app. No installer, SDK, Node.js, or Python is needed. The interface currently uses Chinese labels.

Left-click the tray icon to open the panel; right-click for actions. Windows may hide the icon under its tray overflow menu. Closing the panel leaves the assistant running; quitting the assistant leaves ChatGPT running. Automatic ChatGPT launch and login startup are independent and off by default.

Restart requests a normal close. If ChatGPT keeps running in the background, quit it from its own menu and click launch again. The assistant does not force-kill it. A port check or process record does not establish proxy routing for every app component.

## Files and data

The executable is unsigned. `BUILD-INFO.json` identifies the version and source commit; `APP_SHA256SUMS.txt` hashes the EXE. Public release archive hashes are in the release's `SHA256SUMS.txt`.

Settings and rotating logs live in `%LOCALAPPDATA%\AppProxyAssistant\`. To move/delete the EXE, first disable login startup in its settings and quit the assistant. The MIT license is included in `LICENSE`.

[Full Windows guide](https://github.com/bxzymy/chatgpt-app-proxy/blob/main/docs/windows.md) · [Project source](https://github.com/bxzymy/chatgpt-app-proxy)
