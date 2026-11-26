# App Proxy for macOS

[简体中文](README.zh-CN.md)

This package contains a native menu bar assistant for the installed official ChatGPT.app. It uses your existing HTTP/Mixed proxy; it does not provide a proxy server or change the system proxy/TUN.

## Start

1. Extract the ZIP using Finder / Archive Utility.
2. Move `App Proxy.app` into `/Applications` or another stable folder.
3. Start your existing proxy client and open `App Proxy.app`.
4. Click the network menu bar icon, select ChatGPT.app in proxy settings, and save the actual HTTP/Mixed address, such as `http://127.0.0.1:7890`.
5. Launch ChatGPT from the assistant and verify actual requests in your proxy client's connections view. Use the restart action to apply settings to an existing instance.

Requirements: macOS 13+ for the assistant, a compatible installed ChatGPT.app, and an HTTP/Mixed listener. The app includes Apple Silicon and Intel executable slices. No Xcode, Node.js, Python, or installer is required. The interface currently uses Chinese labels.

This build is ad-hoc signed, without an Apple Developer ID or Apple notarization. If the first launch is blocked, verify that the package came from this project, then follow **System Settings → Privacy & Security → Open Anyway**. See [Apple's instructions](https://support.apple.com/en-us/102445). The assistant does not disable Gatekeeper or remove quarantine automatically.

## Behavior and data

The assistant uses a menu bar icon instead of a Dock icon. Login startup, automatic ChatGPT launch, and the optional shortcut are separate settings, all off by default. Restart requests a normal quit; it never force-kills ChatGPT. Quitting the assistant leaves ChatGPT running. A port check or launch record does not verify all actual app traffic.

Settings, backups, and rotating logs live in `~/Library/Application Support/AppProxyAssistant/`. Disable login startup before moving/deleting the app. `BUILD-INFO.json` identifies the version and source commit. Archive hashes are in the release's `SHA256SUMS.txt`; the MIT license is in `LICENSE`.

[Full macOS guide](https://github.com/bxzymy/chatgpt-app-proxy/blob/main/docs/macos.md) · [Project source](https://github.com/bxzymy/chatgpt-app-proxy)
