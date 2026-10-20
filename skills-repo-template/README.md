# Repositorio de skills para Lanzador Claude

Plantilla de repositorio de skills, plantillas de `CLAUDE.md` y configuraciones MCP que [Lanzador Claude](https://github.com/ideonetworks/lanzador-claude) puede clonar y usar. Es también compatible con los *marketplaces* de plugins de Claude Code.

## Estructura

```
.claude-plugin/marketplace.json   # compatibilidad con marketplaces de plugins
skills/<nombre>/SKILL.md          # una skill por carpeta (más los archivos que necesite)
templates/claude-md/<nombre>.md   # plantillas de CLAUDE.md para proyectos nuevos
mcp/<nombre>.json                 # plantillas de .mcp.json
```

### Skills

Cada skill es una carpeta con un `SKILL.md` que empieza con un bloque YAML:

```markdown
---
name: mi-skill
description: Cuándo debe usarla Claude, en una o dos frases.
---

Instrucciones en Markdown...
```

Incluidas como ejemplo: `ideo-commit-style` (Conventional Commits en español) e `ideo-readme-es` (README en español con estructura estándar).

### Plantillas de CLAUDE.md

Ficheros `.md` con estos marcadores, que el asistente de proyecto nuevo sustituye:

| Marcador | Valor |
| --- | --- |
| `{{name}}` | Nombre del proyecto |
| `{{description}}` | Descripción |
| `{{stack}}` | Tecnologías |
| `{{date}}` | Fecha de creación |

Incluidas: `default.md` y `web.md`.

### Plantillas MCP

`mcp/<nombre>.json` tiene el formato de un `.mcp.json` de proyecto (`mcpServers`). `example.json` es un ejemplo inofensivo.

## Cómo usarlo

1. Crea un repositorio en tu GitHub y sube el contenido de esta carpeta:
   ```bash
   git init
   git add .
   git commit -m "feat: repositorio inicial de skills"
   git branch -M main
   git remote add origin https://github.com/<tu-usuario>/<tu-repo>.git
   git push -u origin main
   ```
2. En Lanzador Claude abre **Ajustes** y pega la URL del repositorio en *Repositorio de skills*.
3. Si el repositorio es privado, indica también un token de acceso. Se guarda en el Administrador de credenciales de Windows, nunca en texto plano.
4. Abre la vista **Skills** para ver, instalar y actualizar las skills. Necesitas `git` instalado.

## Uso como marketplace de plugins

Edita `.claude-plugin/marketplace.json` (nombre, propietario y lista de plugins) y, en Claude Code:

```
/plugin marketplace add <tu-usuario>/<tu-repo>
```

Los ejemplos se ofrecen sin garantía; adapta la licencia de este contenido a tus necesidades.
