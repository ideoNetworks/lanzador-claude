# Lanzador Claude

[Español](README.md) · [English](README.en.md) · **简体中文**

> 最初由 iDeo 开发 (https://ideonetworks.com) —— "Desarrollado originalmente por iDeo (https://ideonetworks.com)"

Lanzador Claude（"Claude 启动器"）是一款 Windows 桌面应用，用作 **Claude Code 的启动器**。选择一个文件夹，勾选希望 Claude 如何启动（命令行参数和环境变量），然后点击 **Iniciar**（启动）：系统会在该文件夹中打开终端，并已完成全部配置。它还可以创建新项目（文件夹、`CLAUDE.md` 和 skills）。

它诞生于 iDeo 的**信息技术维护**部门，由 iDeo 的**软件开发**部门开发，目标只有一个：**让所有使用 Claude Code 的人过得更愉快**。

## 功能

- 文件夹树（默认 `C:\Desarrollo`，可浏览整个磁盘），带最近使用和收藏。
- 文件夹信息卡：Claude 会话、git 分支、`CLAUDE.md`、skills；提供 **继续上次** 和 **恢复…** 按钮。
- 参数和环境变量采用**双复选框**设计：紫色（固定，会被记住）和蓝色（启用）。每个选项都有提示框说明。
- 精确预览将要执行的命令，可复制并在 VS Code 中打开。
- 配置档案（安全、自主、PowerShell + Opus 以及自定义档案）和历史记录，一键重新启动。
- 新项目向导：文件夹、基于模板的 `CLAUDE.md`、skills、`git init` 以及任务结束通知。
- 自有 skills 仓库（模板见 [`skills-repo-template/`](skills-repo-template/)）。
- 托盘图标、全局快捷键 **Ctrl+Alt+I**、开机自启以及资源管理器"用 Claude 打开"菜单。
- 界面支持西班牙语、英语和简体中文；浅色和深色主题；可自定义品牌。
- 提供 NSIS 和 MSI 安装程序（含首次运行选项），以及带签名的自动更新。
- **无遥测**（参见 [PRIVACY.md](PRIVACY.md)）。

## 技术实现

采用 **Tauri 2**：**Rust** 引擎加上运行于 WebView2 的 Web 界面（**React + TypeScript + Vite**）。选择它的原因：

- 安装包很小（约 10 MB），而 Electron 应用通常有数百 MB。
- Rust 引擎内存安全且占用资源少。
- Web 界面易于定制主题，也便于第三方维护。

## 安装

1. 从 [Releases](https://github.com/ideonetworks/lanzador-claude/releases) 下载安装程序（NSIS `.exe` 或 `.msi`）。
2. 运行它。由于安装程序**尚未进行代码签名**，Windows SmartScreen 可能会显示警告：点击**更多信息 → 仍要运行**（"Más información → Ejecutar de todas formas"）。详见 [docs/firma-de-codigo.md](docs/firma-de-codigo.md)（西班牙语）。

### 系统要求

- Windows 10 或 11。
- 已安装 Claude Code。
- Windows Terminal（推荐）。
- 如需使用 skills 仓库，需要 `git`。

## 从源代码构建

需要 Node 22.22 或更高版本（推荐 24）、稳定版 Rust，以及包含 C++ 工作负载的 Visual Studio Build Tools。

```powershell
npm ci
npm run tauri dev      # 开发
npm run tauri build    # 生成安装程序
```

请在 PowerShell 中运行 `cargo`，不要在 Git Bash 中运行（Git Bash 的 `link.exe` 会与 MSVC 链接器冲突）。

## 起源

Lanzador Claude 由 iDeo 员工使用 Claude Code 通过 *vibe coding* 构建。源代码由人工使用 Microsoft Visual Studio 审查并润色。

由 [iDeo](https://ideonetworks.com) 在[马德里](https://www.google.com/maps/search/?api=1&query=Avenida%20Madrid%2C%203%2C%20Madrid%2C%20Espa%C3%B1a)怀着热爱开发。产品页面：https://ideonetworks.com/software/lanzador-claude

## 许可证

[GNU GPLv3](LICENSE)，并附带 [NOTICE](NOTICE) 中所述的 **7(b) 条附加条款**：修改后的版本必须在"关于"界面中保留声明"Desarrollado originalmente por iDeo (https://ideonetworks.com)"。iDeo 的名称和徽标**不**在许可证涵盖范围内（参见 [TRADEMARKS.md](TRADEMARKS.md)）。

## 更多信息

[CONTRIBUTING.md](CONTRIBUTING.md) · [PRIVACY.md](PRIVACY.md) · [TRADEMARKS.md](TRADEMARKS.md) · [代码签名](docs/firma-de-codigo.md) · [更新](docs/actualizaciones.md)
