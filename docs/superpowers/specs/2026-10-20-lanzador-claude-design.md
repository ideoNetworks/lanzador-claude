# Lanzador Claude — Documento de diseño

Fecha: 2026-10-20 · Autoría: Antonio Tarazona (iDeo) con Claude Code
Maqueta aprobada: https://claude.ai/artifact/CjuxR3q2XPcp7UUe53WeyN (también como referencia visual en `docs/reference/maqueta.html`)

## 1. Intención

Aplicación de escritorio para Windows que sirve de **lanzador de Claude Code**. El usuario elige una carpeta (por defecto bajo `C:\Desarrollo`, navegable por todo el disco), marca cómo quiere que arranque Claude (parámetros CLI y variables de entorno) y pulsa **Iniciar**: se abre un terminal en esa carpeta con todo ya configurado. También crea proyectos nuevos (carpeta + `CLAUDE.md` + skills). Proyecto **público, GPLv3**, nacido en el departamento de Mantenimiento Informático de iDeo y desarrollado por el departamento de Desarrollo de Software de iDeo. Voluntad: hacer la vida más agradable a quien usa Claude Code.

## 2. Objetivos / no objetivos / anti-objetivos

Objetivos: todo lo listado en §4.
No objetivos: detección/instalación de requisitos (Claude, Git, Windows Terminal); gestor de múltiples repositorios de skills; publicación en winget (aparcado); certificado de pago; telemetría.
Anti-objetivos: que la app lance un comando distinto del que muestra la vista previa; que una opción "fijada" no se recuerde; que el instalador pida dinero o cuentas; que el código suba datos del usuario a ningún sitio (salvo `git clone/pull` del repo de skills configurado y la comprobación de actualizaciones).

## 3. Tecnología (decidido)

- **Tauri 2**: motor en **Rust** + interfaz web (**React 18 + TypeScript + Vite**) en WebView2.
- Instaladores **NSIS (.exe)** y **WiX (.msi)** generados por `tauri build`.
- Plugins Tauri: `autostart`, `global-shortcut`, `single-instance`, `updater`, `opener`, `notification`, `dialog`, `process`.
- Sin firma de código al principio; documentar SignPath Foundation (gratis OSS) como paso posterior. Las actualizaciones se firman con la clave propia de Tauri (Ed25519).
- Licencia **GPLv3** con término adicional 7(b): conservar en la interfaz la atribución "Desarrollado originalmente por iDeo (https://ideonetworks.com)". Logos y nombre iDeo excluidos de la licencia (marca).

## 4. Funcionalidad

### 4.1 Pantalla principal (distribución A con menú contraíble)
- Barra superior color primario **#006EB3**: logo (personalizable), nombre "Lanzador Claude", buscador (Ctrl+K) de carpetas/proyectos, selector de idioma, botón tema claro/oscuro.
- Menú lateral: Iniciar · Proyecto nuevo · Perfiles · Skills · Historial · (separador) Ajustes · Acerca de · botón contraer. Contraído = solo iconos con tooltip; estado recordado.
- Columna árbol: "Recientes y favoritos" (chips, estrella para favoritos), "Carpetas" con raíz configurable (por defecto `C:\Desarrollo`, botón "Cambiar raíz") y nodo "Este equipo" con todas las unidades (incluidas de red mapeadas). Carga perezosa. Opción mostrar/ocultar carpetas ocultas. Clic derecho: añadir/quitar favorito, abrir en Explorador.
- Ficha de carpeta: ruta, última sesión y nº de sesiones de Claude (leído de `%USERPROFILE%\.claude\projects\<ruta-codificada>\*.jsonl`, codificación = cada carácter no alfanumérico → `-`), rama git, si existe `CLAUDE.md`, nº de skills en `.claude/skills`, botones **Continuar última** (`--continue`) y **Reanudar…** (lista de sesiones → `--resume <id>`).
- Pestañas **Parámetros** y **Variables de entorno** con contador de activos; selector **Abrir en**: Windows Terminal · PowerShell / PowerShell / Windows Terminal · WSL.
- Selector de **Perfil** + "Guardar como perfil…".
- Lista agrupada (Modelo y sesión, Permisos, Contexto y herramientas, Depuración, Otros). Cada fila: casilla **morada** (fijar) a la izquierda, casilla **azul** (activa), nombre del parámetro (tooltip con explicación en el idioma activo), descripción corta, control de valor si el parámetro lleva valor (desplegable o texto). Parámetros peligrosos en color de aviso.
- Pie: vista previa exacta del comando, Copiar, VS Code (`code <ruta>`), **Iniciar**.
- Barra de estado inferior: punto + "Conectado al motor" / "Motor no disponible" (heartbeat al comando `ping` del backend cada 5 s), versión.

### 4.2 Lógica de las dos casillas (exacta)
- Marcar morada → morada y azul marcadas.
- Desmarcar morada → ambas desmarcadas.
- Desmarcar azul → ambas desmarcadas.
- Marcar azul con morada desmarcada → solo azul (no persiste).
- Al abrir el programa: activas = fijadas. Valores de las fijadas se recuerdan.
- Cambiar el valor de un parámetro lo activa (azul).

### 4.3 Catálogo de parámetros y variables
- Catálogo embebido (`catalog.json`) con id, flag, grupo, tipo de valor (none/select/text/multi), opciones, peligroso, descripción corta y tooltip en es/en/zh. Basado en `docs/reference/claude-help.txt`; excluye los que solo funcionan con `--print`.
- Al arrancar se ejecuta `claude --help` y se añaden al grupo "Otros" los flags no catalogados (texto en inglés de la ayuda).
- Variables de entorno catalogadas, mínimo: `CLAUDE_CODE_USE_POWERSHELL_TOOL=1`, `ANTHROPIC_MODEL`, `MAX_THINKING_TOKENS`, `CLAUDE_CODE_MAX_OUTPUT_TOKENS`, `BASH_DEFAULT_TIMEOUT_MS`, `BASH_MAX_TIMEOUT_MS`, `DISABLE_TELEMETRY=1`, `DISABLE_AUTOUPDATER=1`, `DISABLE_ERROR_REPORTING=1`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`, `HTTPS_PROXY`, `HTTP_PROXY`, `NO_PROXY`, `ANTHROPIC_API_KEY` (valor guardado en Administrador de credenciales de Windows, nunca en texto plano ni en la vista previa: se muestra `••••`).

### 4.4 Lanzamiento
- Windows Terminal: `wt.exe -d "<ruta>" pwsh -NoExit -Command "<envs>; claude <flags>"` (si no hay `pwsh`, `powershell`).
- PowerShell: nueva ventana `pwsh -NoExit -WorkingDirectory "<ruta>" -Command ...`.
- WSL: `wt.exe -d "<ruta>" wsl.exe --cd "<ruta>" -- env K=V ... claude <flags>`.
- Las comillas/escapes los genera un constructor puro testeado; la vista previa y lo ejecutado salen de la misma función.
- Cada lanzamiento se añade al **Historial** (fecha, carpeta, perfil, comando) y a recientes. Desde Historial se relanza con un clic.

### 4.5 Perfiles
Conjunto con nombre de {activos, valores, destino}. Predefinidos: "Seguro" (`--permission-mode manual`), "Autónomo" (`--permission-mode auto`), "PowerShell + Opus" (`CLAUDE_CODE_USE_POWERSHELL_TOOL=1`, `--model opus`). Crear, renombrar, borrar, aplicar. Opcional: perfil recordado por carpeta.

### 4.6 Proyecto nuevo (asistente)
Pasos: nombre + carpeta padre (por defecto la raíz) → plantilla de `CLAUDE.md` (del repo de skills o la integrada) con campos {nombre, descripción, stack} → skills con casillas (instalar en proyecto `.claude/skills/` o global `~/.claude/skills/`) → opciones: `git init`, `.gitignore`, hook de aviso de fin de tarea → Crear → opción "Abrir con Claude ahora".

### 4.7 Skills
- **Un único repositorio** de skills configurable por URL en Ajustes (vacío por defecto) + token opcional para repos privados (Administrador de credenciales). Se clona/actualiza con `git` en `%APPDATA%\iDeo\LanzadorClaude\skills-repo`.
- Formato del repo: `skills/<nombre>/SKILL.md` (+archivos), `templates/claude-md/<nombre>.md`, `mcp/<nombre>.json` (plantillas `.mcp.json`). Compatible con plugin marketplace (`.claude-plugin/marketplace.json`).
- Vista Skills: lista del repo, instaladas por proyecto seleccionado, aviso de "actualización disponible" comparando hash de contenido, botón actualizar.
- El proyecto incluye `skills-repo-template/` con ejemplos para que el usuario lo suba a su GitHub.

### 4.8 Ajustes
Idioma, tema (sistema/claro/oscuro), carpeta raíz, mostrar ocultas, cerrar a bandeja, arrancar con Windows, atajo global (por defecto **Ctrl+Alt+I**; si el registro falla, aviso y permitir otro), URL repo skills + token, destino por defecto, menú contextual del Explorador "Abrir con Claude" (HKCU, activable), comprobación de actualizaciones (auto/avisar/manual) y URL de actualizaciones, **marca** (logo, icono de bandeja, color primario), exportar/importar configuración (JSON).

### 4.9 Acerca de (fijo, no personalizable)
Logo iDeo, "Lanzador Claude", versión, "Desarrollado con amor desde [Madrid](https://www.google.com/maps/search/?api=1&query=Avenida%20Madrid%2C%203%2C%20Madrid%2C%20Espa%C3%B1a) por [iDeo](https://ideonetworks.com)", web https://ideonetworks.com/software/lanzador-claude (clicable), teléfono +34 911 29 29 39 (copiable), WhatsApp Business "Próximamente" (campo configurable en código), "Licencia GPLv3 · Código abierto", texto de origen (Mantenimiento Informático / Desarrollo de Software, vibe coding con Claude Code, revisado por personas con Microsoft Visual Studio).

### 4.10 Integración con Windows
- Icono en bandeja (personalizable). Menú: Abrir · Recientes ▸ · Proyecto nuevo · Arrancar con Windows ✓ · Idioma ▸ · Acerca de · Salir. Clic izquierdo abre la ventana.
- Instancia única; segunda ejecución enfoca la ventana (y procesa argumentos `--open <ruta>`, `--notify <texto>`).
- Atajo global Ctrl+Alt+I muestra/oculta.
- Autoarranque (minimizado a bandeja).
- Notificación de Windows cuando Claude termina (hook `Stop` en `.claude/settings.json` del proyecto que ejecuta `"<exe>" --notify "<proyecto>: Claude ha terminado"`).
- Menú contextual "Abrir con Claude" en carpetas.

### 4.11 Idiomas
es, en, zh-CN. Detectar idioma del sistema (`sys-locale`): `es*`→es, `zh*`→zh, resto→en. Selector en barra superior y en bandeja. Todas las cadenas de UI en diccionarios; test que verifica que los tres tienen las mismas claves.

### 4.12 Instalador
- NSIS: página propia con "Arrancar con Windows", perfil inicial (radio: Ninguno/Seguro/Autónomo/PowerShell + Opus) y ajuste fino (casillas de ~8 opciones comunes: `--model opus`, `--continue`, `--permission-mode auto`, `--ide`, `--verbose`, `CLAUDE_CODE_USE_POWERSHELL_TOOL`, `DISABLE_TELEMETRY`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`). Escribe `HKCU\Software\iDeo\LanzadorClaude\Seed` (`Autostart` DWORD, `Profile` SZ, `Pinned` SZ lista separada por `;`).
- MSI: mismas propiedades públicas `AUTOSTART`, `PROFILE`, `PINNED` → mismas claves de registro (para despliegues silenciosos).
- En el primer arranque (no existe config) la app lee la semilla y la convierte en configuración.

### 4.13 Actualizaciones
`tauri-plugin-updater` contra `https://github.com/<owner>/<repo>/releases/latest/download/latest.json` (owner/repo configurables en `tauri.conf.json` y sobreescribibles en Ajustes). Aviso "Hay una versión nueva" → descargar, verificar firma, instalar (modo pasivo) y reiniciar. GitHub Actions (`tauri-action`) compila x64 y ARM64 al subir una etiqueta `v*` y publica release + `latest.json`.

### 4.14 Proyecto público
README en es/en/zh, CONTRIBUTING, plantillas de issues, LICENSE (GPLv3), `NOTICE`/términos adicionales 7(b), `TRADEMARKS.md`, declaración sin telemetría, documentación de firma (SignPath) y de la clave del updater. `.superpowers/` en `.gitignore`.

## 5. Visual
Tokens de la maqueta: primario #006EB3 (oscuro #2b8fd6), morado fijar #7B3FE4 (oscuro #9a6bff), fuentes Roboto / Roboto Mono (empaquetadas localmente, sin CDN). Tema claro y oscuro. Estilo Docker Desktop.

## 6. Decisiones tomadas por Claude (revisables)
React en vez de Svelte (ecosistema y mantenimiento por terceros); configuración en `%APPDATA%\iDeo\LanzadorClaude\config.json`; heartbeat 5 s; opciones del instalador limitadas a ~8 casillas comunes + perfiles; hook de aviso vía el propio exe; repo de skills de ejemplo dentro del proyecto.
