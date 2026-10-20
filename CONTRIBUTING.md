# Contribuir a Lanzador Claude

¡Gracias por tu interés! Las contribuciones son bienvenidas.

## Antes de empezar

- Abre un issue (usa las plantillas de error o de mejora) para comentar cambios grandes antes de programarlos.
- Al contribuir aceptas que tu código se publique bajo GPLv3 con el término adicional descrito en [NOTICE](NOTICE).
- No incluyas el nombre ni los logos de iDeo en tus aportaciones salvo lo ya existente (ver [TRADEMARKS.md](TRADEMARKS.md)).

## Entorno de desarrollo

Necesitas Node 22.22+ (recomendado 24), Rust estable y las Visual Studio Build Tools (C++). Ejecuta `cargo` desde PowerShell, no desde Git Bash.

```powershell
npm ci
npm run tauri dev
```

## Comprobaciones antes de abrir una PR

```powershell
npm test
npm run typecheck
cd src-tauri
cargo test
cargo clippy --all-targets -- -D warnings
```

La integración continua ejecuta las mismas comprobaciones en `windows-latest`.

## Convenciones

- Commits con [Conventional Commits](https://www.conventionalcommits.org/es/) en español (`feat:`, `fix:`, `docs:`...).
- Las cadenas de interfaz van en los tres diccionarios (es, en, zh-CN); un test comprueba que tienen las mismas claves.
- La vista previa del comando y lo que se ejecuta deben salir siempre de la misma función.
- Ningún cambio puede añadir telemetría ni enviar datos del usuario (ver [PRIVACY.md](PRIVACY.md)).
- Añade pruebas para la lógica nueva.
