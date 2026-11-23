# ChatGPT Windows 应用级代理启动器（PowerShell）

[English](README.md)

这是一个可阅读、可修改的最小 PowerShell 启动器，尝试使 **Microsoft Store 版 Windows ChatGPT 桌面应用**通过已有的本地 HTTP/Mixed 代理连接，无需打开系统代理或 TUN 模式。

> Windows 应用更新可能影响启动方式；检测到 App 进程不等于全部流量已走代理。建议配置代理规则，如果没有。

## 使用方法

1. 启动 Clash Verge Rev / Mihomo 等本地代理软件，选择 **Rule** 模式，关闭系统代理和 TUN。
2. 确认本地 **HTTP 或 Mixed 端口**为 `7890`。https://github.com/bxzymy/chatgpt-app-proxy/blob/main/README.zh-CN.md
3. 完全退出已运行的 ChatGPT（包括可能存在的后台进程）。
4. 双击 `Launch-ChatGPT.cmd`。
5. 在 Clash Verge 的**连接**页面检查 ChatGPT 相关域名及命中的代理规则。

如果端口不是 7890，可在 PowerShell 运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Launch-ChatGPT.ps1 -Port 7897
```

如果 App 已在运行，请先正常退出，再重新运行。可选 `-ForceRestart` 会强制结束旧进程，可能丢失未保存的工作。

## 原理

```text
ChatGPT 桌面应用
    └── 启动参数 --proxy-server=http://127.0.0.1:7890
          └── 本地 HTTP/Mixed 代理入口
                └── Clash / Mihomo 的 Rule 匹配
                      ├── PROXY
                      └── DIRECT
```

Clash 的 Rule 仅负责处理**已经进入代理**的流量；它本身不会拦截 Windows 程序的网络请求。本脚本通过 Chromium 代理启动参数，以及被部分网络客户端识别的代理环境变量，尝试实现单应用代理。**无法保证 App 的所有原生网络子系统都支持这些设置。**

## 文件说明

- `Launch-ChatGPT.cmd`：双击用的启动器。
- `Launch-ChatGPT.ps1`：主要代码，可审查、可修改，默认端口 `7890`。
- `docs/clash-rules.md`：Clash Rule 配置示例及验证方法。
- `LICENSE`：MIT 开源许可证，发布前请填写版权人信息。

## 故障排查

- **7890 无法连接**：检查 Clash 的实际 HTTP/Mixed 监听端口和内核运行状态。
- **找不到 App**：需要事先安装 Microsoft Store 版 ChatGPT。
- **App 已在运行**：先正常退出 ChatGPT，避免旧实例忽略新的参数。
- **App 无法启动或提示缺少包身份**：某些 MSIX 版本可能不支持直接运行 EXE；包上下文回退不保证适用于所有版本。
- **App 能打开但依然无法联网**：检查 Clash「连接」中是否出现相应请求。如果没有，说明程序未必接受代理参数。
- **仅部分功能可用**：不同网络子模块可能使用不同协议栈；本项目不是系统级透明代理工具。

## 安全与免责声明

脚本没有下载远程代码、安装驱动、修改系统代理或开启 TUN；也不会主动收集遥测。`.cmd` 使用的 `-ExecutionPolicy Bypass` 只作用于启动的 PowerShell 进程，不修改系统全局策略。
