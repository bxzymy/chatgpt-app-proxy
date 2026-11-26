# Windows 应用代理助手

[English](README.md)

这是为已安装的 Microsoft Store 版 ChatGPT 提供的原生托盘助手，使用你已有的本地 HTTP / Mixed 代理。

## 使用方法

1. 解压 ZIP 到固定目录，保留其中的 `App Proxy.exe`。
2. 启动代理客户端，确认 HTTP / Mixed 监听端口。
3. 双击 `App Proxy.exe`，在「代理设置」中修改端口，默认 `7890`。
4. 首次应用代理前，从 ChatGPT 自身菜单完全退出，再点击「启动 ChatGPT」。
5. 在代理客户端的连接页面确认真实请求与规则命中。

要求 Windows 10 1903+ / Windows 11、系统自带的 .NET Framework 4.8+ 与 Windows PowerShell 5.1，以及已安装的官方 Microsoft Store ChatGPT。没有安装器，日常无需 SDK、Node.js 或 Python。

左键点击托盘图标打开面板，右键显示菜单；图标可能位于隐藏图标区域。关闭面板后助手继续驻留；退出助手后 ChatGPT 保持运行。登录自启动和助手启动时自动启动 ChatGPT 是独立选项，默认均关闭。

重启仅请求正常关闭。ChatGPT 若继续驻留后台，请从其自身菜单完全退出后再启动。端口可连接、进程已启动，都不能证明应用所有组件的流量已走代理。本助手不提供代理服务器，不修改系统代理或 TUN。

## 文件与本地数据

EXE 未进行代码签名。`BUILD-INFO.json` 记录版本和源码提交，`APP_SHA256SUMS.txt` 记录 EXE 校验值；发布包的整体校验值在 Release 的 `SHA256SUMS.txt` 中。

配置与轮转日志保存在 `%LOCALAPPDATA%\AppProxyAssistant\`。移动或删除 EXE 前，请先在设置中关闭登录自启动并退出助手。MIT 许可证见随附 `LICENSE`。

[完整 Windows 指南](https://github.com/bxzymy/chatgpt-app-proxy/blob/main/docs/windows.zh-CN.md) · [项目源码](https://github.com/bxzymy/chatgpt-app-proxy)
