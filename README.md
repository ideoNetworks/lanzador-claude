# Lanzador Claude

**Español** · [English](README.en.md) · [简体中文](README.zh-CN.md)

> Desarrollado originalmente por iDeo (https://ideonetworks.com)

Lanzador Claude es una aplicación de escritorio para Windows que sirve de **lanzador de Claude Code**. Eliges una carpeta, marcas cómo quieres que arranque Claude (parámetros de línea de comandos y variables de entorno) y pulsas **Iniciar**: se abre un terminal en esa carpeta con todo ya configurado. También crea proyectos nuevos (carpeta, `CLAUDE.md` y skills).

Nació en el departamento de **Mantenimiento Informático** de iDeo y lo ha desarrollado el departamento de **Desarrollo de Software** de iDeo, con un objetivo: **hacer la vida más agradable a todas las personas que usan Claude Code**.

## Características

- Árbol de carpetas (por defecto `C:\Desarrollo`, navegable por todo el disco), con recientes y favoritos. Los **proyectos** (con `CLAUDE.md`, `.claude`, `.git`, `package.json`, `*.sln`…) llevan su propio icono y no se despliegan al elegirlos: sus subcarpetas se abren con el botón **+**.
- Ficha de carpeta: sesiones de Claude, rama git, `CLAUDE.md`, skills; botones **Continuar última** y **Reanudar…**.
- Parámetros y variables de entorno con **doble casilla**: morada (fijar, se recuerda) y azul (activar). Quitar la azul de una opción fijada la desactiva **solo esta vez**. Cada opción tiene su explicación en un tooltip, en el idioma de la interfaz.
- **Opciones por proyecto**: cada proyecto recuerda las suyas (las subcarpetas heredan las de su proyecto) y hay unas **por defecto** para el resto. Las que tienen equivalente en Claude Code (modelo, modo de permisos, herramientas, carpetas extra, variables de entorno) se leen y se guardan en `.claude/settings.local.json` del proyecto; también se muestran las de `.claude/settings.json` (equipo) y `~/.claude/settings.json` (usuario).
- Vista previa exacta del comando que se va a ejecutar, con copiar y abrir en VS Code.
- Perfiles (Seguro, Autónomo, PowerShell + Opus y los tuyos) e historial con relanzamiento en un clic.
- Asistente de proyecto nuevo: carpeta, `CLAUDE.md` desde plantilla, skills, `git init` y aviso de fin de tarea.
- Repositorio de skills propio (plantilla incluida en [`skills-repo-template/`](skills-repo-template/)).
- Icono en bandeja, atajo global **Ctrl+Alt+I**, arranque con Windows y menú del Explorador "Abrir con Claude".
- Interfaz en español, inglés y chino simplificado; tema claro y oscuro; marca personalizable.
- Instaladores NSIS y MSI con opciones de primer arranque, y actualizaciones automáticas firmadas.
- **Sin telemetría** (ver [PRIVACY.md](PRIVACY.md)).

## Cómo está hecho

Usa **Tauri 2**: un motor en **Rust** y una interfaz web (**React + TypeScript + Vite**) dentro de WebView2. Elegimos esta tecnología porque:

- Los instaladores son pequeños (unos 10 MB), frente a los cientos de MB de una aplicación Electron.
- El motor en Rust es seguro en memoria y consume poco.
- La interfaz web es fácil de adaptar y de mantener por terceros.

## Instalación

1. Descarga el instalador (`.exe` NSIS o `.msi`) desde [Releases](https://github.com/ideonetworks/lanzador-claude/releases).
2. Ejecútalo. Como el instalador **aún no está firmado**, Windows SmartScreen puede mostrar un aviso: pulsa **Más información → Ejecutar de todas formas**. Más detalles en [docs/firma-de-codigo.md](docs/firma-de-codigo.md).

### Requisitos

- Windows 10 u 11.
- Claude Code instalado.
- Windows Terminal (recomendado).
- `git`, si vas a usar el repositorio de skills.

## Compilar desde el código fuente

Necesitas Node 22.22 o superior (recomendado 24), Rust estable y las Visual Studio Build Tools con el componente de C++.

```powershell
npm ci
npm run tauri dev      # desarrollo
npm run tauri build    # instaladores
```

Ejecuta `cargo` desde PowerShell, no desde Git Bash (el `link.exe` de Git Bash interfiere con el del compilador de MSVC).

## Origen

Lanzador Claude se ha construido con *vibe coding* por personal de iDeo usando Claude Code. El código fuente ha sido revisado y retocado por personas con Microsoft Visual Studio.

Desarrollado con amor desde [Madrid](https://www.google.com/maps/search/?api=1&query=Avenida%20Madrid%2C%203%2C%20Madrid%2C%20Espa%C3%B1a) por [iDeo](https://ideonetworks.com). Producto: https://ideonetworks.com/software/lanzador-claude

## Licencia

[GNU GPLv3](LICENSE) con el **término adicional del apartado 7(b)** descrito en [NOTICE](NOTICE): las versiones modificadas deben conservar en la pantalla "Acerca de" la atribución "Desarrollado originalmente por iDeo (https://ideonetworks.com)". El nombre y los logos de iDeo **no** están cubiertos por la licencia (ver [TRADEMARKS.md](TRADEMARKS.md)).

## Más información

[CONTRIBUTING.md](CONTRIBUTING.md) · [PRIVACY.md](PRIVACY.md) · [TRADEMARKS.md](TRADEMARKS.md) · [Firma de código](docs/firma-de-codigo.md) · [Actualizaciones](docs/actualizaciones.md)
