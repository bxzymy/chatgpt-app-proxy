# macOS 应用代理助手

[English](README.md)

这是为已安装的官方 ChatGPT.app 提供的原生菜单栏助手，使用你已有的 HTTP / Mixed 代理。

## 使用方法

1. 用 Finder / 归档实用工具解压 ZIP。
2. 把 `App Proxy.app` 放进「应用程序」或其他固定目录。
3. 启动已有的代理客户端，打开 `App Proxy.app`。
4. 点击菜单栏网络图标，在代理配置中选择 ChatGPT.app，填写实际 HTTP / Mixed 地址，例如 `http://127.0.0.1:7890`，保存后启动。
5. ChatGPT 已运行时，用助手的重启操作应用代理；在代理客户端的连接页面验证实际请求。

助手要求 macOS 13+、与你的系统兼容的已安装 ChatGPT.app，以及 HTTP / Mixed 监听入口。程序包含 Apple Silicon 和 Intel 两种架构，不需要安装 Xcode、Node.js、Python 或安装器。

本构建采用 ad-hoc 签名，没有 Apple Developer ID 签名与 Apple 公证。首次打开如被系统阻止，请确认发布包来自本项目后，在「系统设置 → 隐私与安全性 → 仍要打开」中按系统提示操作，参见 [Apple 官方说明](https://support.apple.com/en-us/102445)。助手不会自动关闭 Gatekeeper 或移除隔离属性。

## 行为与本地数据

助手只在菜单栏驻留，不占用 Dock 图标。登录自启动、自动启动 ChatGPT、可选全局快捷键均默认关闭。重启仅请求正常退出；退出助手后 ChatGPT 保持运行。端口连通和启动记录都不等于所有流量已走代理。助手不提供代理服务器，不修改系统代理或 TUN。

设置、备份和轮转日志位于 `~/Library/Application Support/AppProxyAssistant/`。移动或删除应用前请先关闭登录自启动。`BUILD-INFO.json` 记录版本与源码提交，整体发布包校验值见 Release 的 `SHA256SUMS.txt`，MIT 许可证见随附 `LICENSE`。

[完整 macOS 指南](https://github.com/bxzymy/chatgpt-app-proxy/blob/main/docs/macos.zh-CN.md) · [项目源码](https://github.com/bxzymy/chatgpt-app-proxy)
