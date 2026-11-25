# macOS 助手开发说明

用户操作、三个原生界面预览、代理边界和本地数据说明见 [macOS 使用指南](../docs/macos.zh-CN.md)（[English](../docs/macos.md)）。

本目录是 macOS 平台的独立实现，不调用或改写根目录的 Windows 启动器。

## 构建

从仓库根目录运行：

```bash
bash macos/build.sh
```

输出为 `dist/App Proxy.app`。构建只使用系统自带的 `osacompile`、`PlistBuddy` 和 `codesign`，不需要 Xcode、Node.js 或 Python。应用采用原生 AppKit 控件，通过 JXA/Cocoa 调用，使用 Launch Services 向目标应用传入参数和进程级环境变量；不配置系统代理、TUN 或全局环境。

构建先在临时目录完成编译、资源复制和签名验证，再替换旧输出；不会覆盖其他 bundle ID 的同名应用。图标资源已随源码保存，普通构建不需要重新渲染图标。

## 代码结构

| 路径 | 职责 |
| --- | --- |
| `ProxyAssistant/Core.js` | 配置校验、代理入口、适配器注册、启动计划及状态识别；无系统副作用，可直接用 Node 测试。 |
| `ProxyAssistant/Platform.js` | Cocoa 文件和进程服务、配置与日志持久化、连接检查和系统权限接口。 |
| `ProxyAssistant/App.js` | 原生菜单栏面板、设置与诊断窗口、正常退出和重启流程。 |
| `Resources/AppProxy.icns` | 自绘矢量网络图标的打包资源。 |
| `create-icon.js` | 使用 AppKit 重建图标资源的开发脚本。 |
| `tests/` | 模型测试、隔离应用生命周期测试及打包入口测试。 |

应用配置与代理入口分开保存。适配器注册表当前仅启用 `chatgpt`；Claude 等未来适配器需要独立验证。修改一个共享入口时，会为当前应用建立独立副本，避免改变其他应用配置。启动记录同时检查 PID、进程启动时间、路径和配置标识，避免 PID 复用造成误判。

## 验证

模型测试只需要 Node.js：

```bash
node --test macos/tests/core.test.js
```

在允许本机回环监听和窗口服务的 macOS 开发环境中运行全部测试：

```bash
node --test macos/tests/*.test.js
```

原生测试只操作临时模拟应用和回环 HTTP 代理，覆盖 Cocoa 按钮与定时器事件、参数和环境变量传递、重复打开、正常重启、代理失效时保留旧实例、日志轮转及真实应用包入口。不会控制真实 ChatGPT、注册登录项或启用全局快捷键。

`.github/workflows/macos-assistant.yml` 只针对 macOS 源码和相关文档执行模型测试与构建，不改动 Windows 启动方式，也不依赖 GUI 集成测试。

## 重建文档界面预览

截图是原生控件的离屏渲染，使用独立示例配置；生成过程不启动真实 ChatGPT。

```bash
mkdir -p .build
cat macos/ProxyAssistant/Core.js macos/ProxyAssistant/Platform.js macos/ProxyAssistant/App.js > .build/assistant-preview.js
osascript -l JavaScript .build/assistant-preview.js --ui-self-test --data-dir "$PWD/.build/preview-profile" --render-preview "$PWD/docs/images/macos"
```

## 扩展范围

首版只向兼容的网络组件传入代理参数和环境变量，不能保证全流量覆盖。后续新增应用时，应分别验证登录、聊天、上传、语音及工具功能；不能把同为 Electron 或支持环境变量当作已兼容的证据。代理客户端仍负责实际出口和规则。

登录项与辅助功能授权由用户在设置中选择；本地签名的应用没有 Apple 公证，公开分发需另行处理签名与公证。
