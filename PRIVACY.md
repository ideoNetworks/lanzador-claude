# Privacidad

**Lanzador Claude no incluye telemetría.** No recoge estadísticas de uso, no envía informes de errores y no tiene cuentas de usuario.

## Qué hace la aplicación en tu equipo

- Guarda su configuración, perfiles e historial en local: `%APPDATA%\iDeo\LanzadorClaude\config.json`.
- Lee (solo lectura) `%USERPROFILE%\.claude\projects\` para mostrar el número y la fecha de tus sesiones de Claude.
- Guarda los secretos (clave de API, token del repositorio de skills) en el **Administrador de credenciales de Windows**, nunca en texto plano.

## Conexiones de red

La aplicación solo se conecta a Internet en estos dos casos:

1. **Repositorio de skills:** `git clone` / `git pull` de la URL que tú configures en Ajustes (vacía por defecto).
2. **Comprobación de actualizaciones:** descarga de `latest.json` desde las Releases de GitHub del proyecto (configurable; puedes desactivarla en Ajustes). Las actualizaciones se verifican con una firma criptográfica.

Ningún dato de tus carpetas, comandos o sesiones se envía a iDeo ni a terceros.

Claude Code es un producto independiente de Anthropic con su propia política de privacidad. Lanzador Claude solo lo inicia; los parámetros `DISABLE_TELEMETRY` y similares del catálogo te permiten controlar el comportamiento de Claude Code.
