# Preparing a release / 准备发布

`VERSION` is the version authority for both native applications and package names. Current release notes are in [`releases/v1.0.0.md`](releases/v1.0.0.md). Platform package instructions are maintained under [`release/`](../release/).

## GitHub Actions

After committing and pushing a clean source tree, run:

```powershell
gh workflow run release.yml --ref main -f version=1.0.0
gh run list --workflow release.yml
# After the selected run succeeds:
gh run download <RUN_ID> --name release-v1.0.0 --dir dist/releases/v1.0.0
```

The workflow builds/tests on Windows and macOS, verifies the actual ZIP contents, checks the extracted macOS signature and both CPU slices, and collects packages from the same exact source commit. It then produces:

```text
AppProxy-1.0.0-Windows.zip
AppProxy-1.0.0-macOS-universal.zip
SHA256SUMS.txt
RELEASE_NOTES.md
```

Each ZIP includes its application, `README.md`, `README.zh-CN.md`, `LICENSE`, and `BUILD-INFO.json`. The Windows ZIP also includes the EXE hash. `BUILD-INFO.json` must identify a clean tree at the workflow commit before the final artifact is assembled. Test reports are separate artifacts; private logs and settings are excluded.

Creating a reviewable GitHub draft is a separate, explicit step. The workflow does not publish a release:

```powershell
gh release create v1.0.0 --draft --target <FULL_COMMIT_SHA> --title "App Proxy v1.0.0 - Windows / macOS" --notes-file dist/releases/v1.0.0/RELEASE_NOTES.md dist/releases/v1.0.0/AppProxy-1.0.0-Windows.zip dist/releases/v1.0.0/AppProxy-1.0.0-macOS-universal.zip dist/releases/v1.0.0/SHA256SUMS.txt dist/releases/v1.0.0/RELEASE_NOTES.md
```

Review the draft, both assets, hashes, and signing limitations before selecting **Publish release**. Existing archives/releases are not automatically overwritten. No release signing credentials are stored in this repository. The macOS package uses ad-hoc signing without notarization, and the Windows EXE is unsigned.

## Local packaging

On Windows:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\windows\tests\Run-Tests.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\windows\package-release.ps1
```

On macOS:

```bash
node --test macos/tests/*.test.js
bash macos/build.sh
bash macos/package-release.sh
```

The macOS build and package scripts use built-in OS tools. Node.js is needed only for developer tests, and the Linux assembly job uses its preinstalled Python standard library. End-user applications do not require either runtime.

If the Windows assistant is already running from `dist`, either quit it before rebuilding or pass `-BuildOutputDirectory <other-folder>` to the test runner. The packager accepts `-ExecutablePath <built-exe>` to package that isolated build without interrupting the running assistant.

Windows cannot produce a verified native macOS app bundle. Use the macOS job rather than renaming a source ZIP as an application release.

## 中文说明

先提交并推送完整源码，再手动运行 `release.yml`，版本必须与 `VERSION` 一致。Windows 和 macOS 各自在原生系统上构建与测试；最终收集任务校验两端包内的版本、源码提交、干净状态、ZIP 完整性和所需文件，生成两个 ZIP、中英文发布说明及 SHA-256 校验表。

下载成功任务的 `release-v1.0.0` 附件后，使用上面的 `gh release create --draft` 命令准备 GitHub 草稿。准备草稿与公开发布是两个步骤；工作流不会自动公开发布。程序包需要说明 Windows 未签名，以及 macOS 为 ad-hoc 签名、未 Apple 公证。真实 ChatGPT 的代理路由由使用者在代理客户端中验证。
