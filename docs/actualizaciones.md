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
