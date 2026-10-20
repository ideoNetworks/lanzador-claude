# Actualizaciones

Lanzador Claude usa `tauri-plugin-updater`. Cada actualización se firma con una clave Ed25519 propia del proyecto; la aplicación solo instala versiones cuya firma coincide con la clave pública incluida en ella.

## 1. Generar la clave del updater

```powershell
npm run tauri signer generate -- -w ~/.tauri/lanzador.key
```

Se crean dos ficheros: la clave **privada** (`lanzador.key`) y la **pública** (`lanzador.key.pub`). Elige una contraseña y guárdala en tu gestor de contraseñas.

> **Nunca** subas el `.key` al repositorio. El `.gitignore` ya excluye `*.key`. Si se pierde, los usuarios existentes no podrán actualizarse automáticamente.

## 2. Poner la clave pública en la configuración

Copia el contenido de `lanzador.key.pub` en `src-tauri/tauri.conf.json`:

```json
{
  "plugins": {
    "updater": {
      "pubkey": "CONTENIDO_DE_LANZADOR.KEY.PUB",
      "endpoints": [
        "https://github.com/ideonetworks/lanzador-claude/releases/latest/download/latest.json"
      ]
    }
  }
}
```

## 3. Secretos de GitHub

En el repositorio: **Settings → Secrets and variables → Actions → New repository secret**.

| Secreto | Contenido |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | Contenido del fichero `lanzador.key` (o su ruta, si usas un runner propio) |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | La contraseña elegida |

## 4. Publicar una versión

1. Actualiza la versión en `package.json`, `src-tauri/Cargo.toml` y `src-tauri/tauri.conf.json`.
2. Haz commit y crea la etiqueta:
   ```powershell
   git tag v1.2.3
   git push origin v1.2.3
   ```
3. El workflow `release.yml` compila x64 y ARM64 y crea una release **en borrador** con los instaladores y `latest.json`.
4. Revisa la release en GitHub y pulsa **Publish release**. Desde ese momento el endpoint `.../releases/latest/download/latest.json` sirve la versión nueva.

## Cambiar owner/repo (forks)

Si haces un fork, edita el endpoint en `src-tauri/tauri.conf.json` (`plugins.updater.endpoints`) sustituyendo `ideonetworks/lanzador-claude` por tu `owner/repo`, y genera tu propia clave (pasos 1 a 3): no puedes usar la clave de iDeo. El usuario también puede cambiar la URL de actualizaciones en **Ajustes**.

## Compilar instaladores en local (`createUpdaterArtifacts`)

`bundle.createUpdaterArtifacts` está en `true`: al empaquetar, Tauri genera los `.sig` de cada instalador y **necesita la clave privada** en ese momento. Sin ella `npm run tauri build` falla al firmar.

Con la clave (PowerShell, contraseña vacía en la clave de desarrollo `~/.tauri/lanzador-claude.key`):

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -Raw $env:USERPROFILE\.tauri\lanzador-claude.key
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
npm run tauri build
```

Sin la clave (instaladores sin `.sig`, válidos solo para pruebas locales, no para publicar):

```powershell
npm run tauri build -- --config '{"bundle":{"createUpdaterArtifacts":false}}'
```

Nunca subas el fichero de la clave al repositorio.

Salidas en `src-tauri/target/release/bundle/`: `nsis/Lanzador Claude_0.1.0_x64-setup.exe` y `msi/Lanzador Claude_0.1.0_x64_{es-ES,en-US,zh-CN}.msi` (un MSI por idioma).

## Instaladores y semilla de primer arranque

El instalador escribe `HKCU\Software\iDeo\LanzadorClaude\Seed` (`Autostart` DWORD, `Profile` SZ, `Pinned` SZ con `id[=value];...`). En el primer arranque, si no existe `config.json`, la app convierte la semilla en configuración (y, con `Autostart=1`, activa el arranque con Windows).

**NSIS (`setup.exe`)**, instalación por usuario:

- Con interfaz: página "Opciones iniciales" tras elegir la carpeta (arranque con Windows, perfil inicial y 8 opciones fijadas).
- Silenciosa (`/S`): no hay página; se escribe una semilla por defecto (`Autostart=0`, `Profile=""`, `Pinned=""`). Se puede sobrescribir (valores sin espacios):

  ```powershell
  .\Lanzador*-setup.exe /S /AUTOSTART=1 /PROFILE=ps-opus /PINNED="flag.verbose;env.DISABLE_TELEMETRY=1"
  ```
- Las actualizaciones (`/UPDATE`) no tocan la semilla.
- Al desinstalar se borran la semilla, las claves del menú del Explorador (`Directory\shell\LanzadorClaude` y `Directory\Background\shell\LanzadorClaude`) y el valor de autoarranque. `%APPDATA%\iDeo\LanzadorClaude` (configuración) se conserva.
- La plantilla `src-tauri/windows/nsis/installer.nsi` es la de `tauri-bundler` 2.12.3 con un único bloque añadido (marcado `LANZADOR CLAUDE`) para insertar la página. Al subir de versión de Tauri, vuelve a copiar la plantilla upstream y reaplica ese bloque.

**MSI (WiX)**, para despliegues:

```powershell
msiexec /i "Lanzador Claude_0.1.0_x64_es-ES.msi" AUTOSTART=1 PROFILE=ps-opus PINNED="flag.verbose;env.DISABLE_TELEMETRY=1" /qn
```

La plantilla WiX de Tauri es `perMachine` (requiere elevación; instala en Archivos de programa). El registro `HKCU` de la semilla se escribe en el perfil del usuario que ejecuta la instalación (el administrador elevado), así que en despliegues con otra cuenta (SCCM/Intune como SYSTEM) la semilla no llega al usuario final; usa el instalador NSIS por usuario en ese caso. Al desinstalar el MSI se borra la semilla, pero no las claves del menú del Explorador.
