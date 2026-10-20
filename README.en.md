# Lanzador Claude

[Español](README.md) · **English** · [简体中文](README.zh-CN.md)

> Originally developed by iDeo (https://ideonetworks.com) — "Desarrollado originalmente por iDeo (https://ideonetworks.com)"

Lanzador Claude ("Claude Launcher") is a Windows desktop application that acts as a **launcher for Claude Code**. Pick a folder, choose how Claude should start (command-line flags and environment variables) and press **Iniciar** (Start): a terminal opens in that folder with everything already configured. It also creates new projects (folder, `CLAUDE.md` and skills).

It was born in iDeo's **IT Maintenance** department and developed by iDeo's **Software Development** department, with one goal: **to make life more pleasant for everyone who uses Claude Code**.

## Features

- Folder tree (defaults to `C:\Desarrollo`, browsable across the whole disk), with recents and favorites.
- Folder card: Claude sessions, git branch, `CLAUDE.md`, skills; **Continue last** and **Resume…** buttons.
- Flags and environment variables with a **two-checkbox** design: purple (pin, remembered) and blue (enable). Every option has an explanation in a tooltip.
- Exact preview of the command that will run, with copy and open in VS Code.
- Profiles (Safe, Autonomous, PowerShell + Opus and your own) and a history with one-click relaunch.
- New-project wizard: folder, `CLAUDE.md` from a template, skills, `git init` and an end-of-task notification.
- Your own skills repository (template included in [`skills-repo-template/`](skills-repo-template/)).
- Tray icon, global shortcut **Ctrl+Alt+I**, start with Windows and an Explorer "Open with Claude" menu.
- Interface in Spanish, English and Simplified Chinese; light and dark themes; customizable branding.
- NSIS and MSI installers with first-run options, and signed automatic updates.
- **No telemetry** (see [PRIVACY.md](PRIVACY.md)).

## How it is built

It uses **Tauri 2**: a **Rust** engine and a web interface (**React + TypeScript + Vite**) running in WebView2. We chose it because:

- Installers are small (around 10 MB) compared with hundreds of MB for an Electron app.
- The Rust engine is memory-safe and lightweight.
- A web UI is easy to theme and for third parties to maintain.

## Installation

1. Download the installer (NSIS `.exe` or `.msi`) from [Releases](https://github.com/ideonetworks/lanzador-claude/releases).
2. Run it. Because the installer is **not code-signed yet**, Windows SmartScreen may show a warning: click **More info → Run anyway** ("Más información → Ejecutar de todas formas"). See [docs/firma-de-codigo.md](docs/firma-de-codigo.md) (Spanish).

### Requirements

- Windows 10 or 11.
- Claude Code installed.
- Windows Terminal (recommended).
- `git`, if you use the skills repository.

## Build from source

You need Node 20 or later, stable Rust and the Visual Studio Build Tools with the C++ workload.

```powershell
npm ci
npm run tauri dev      # development
npm run tauri build    # installers
```

Run `cargo` from PowerShell, not from Git Bash (Git Bash's `link.exe` conflicts with the MSVC linker).

## Origin

Lanzador Claude was built with *vibe coding* by iDeo staff using Claude Code. The source code was reviewed and retouched by people using Microsoft Visual Studio.

Made with love from [Madrid](https://www.google.com/maps/search/?api=1&query=Avenida%20Madrid%2C%203%2C%20Madrid%2C%20Espa%C3%B1a) by [iDeo](https://ideonetworks.com). Product page: https://ideonetworks.com/software/lanzador-claude

## License

[GNU GPLv3](LICENSE) with the **additional term under section 7(b)** described in [NOTICE](NOTICE): modified versions must preserve, in the About screen, the notice "Desarrollado originalmente por iDeo (https://ideonetworks.com)". The iDeo name and logos are **not** covered by the license (see [TRADEMARKS.md](TRADEMARKS.md)).

## More information

[CONTRIBUTING.md](CONTRIBUTING.md) · [PRIVACY.md](PRIVACY.md) · [TRADEMARKS.md](TRADEMARKS.md) · [Code signing](docs/firma-de-codigo.md) · [Updates](docs/actualizaciones.md)
