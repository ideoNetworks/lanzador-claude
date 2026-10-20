---
name: ideo-commit-style
description: Redacta mensajes de commit en español siguiendo Conventional Commits. Úsala siempre que vayas a crear un commit o a proponer un mensaje de commit.
---

# Estilo de commits (Conventional Commits en español)

## Formato

```
<tipo>(<ámbito opcional>): <resumen en imperativo, minúscula, sin punto final>

<cuerpo opcional: qué cambia y por qué, no cómo>

<pie opcional: BREAKING CHANGE, Refs #123>
```

## Tipos permitidos

| Tipo | Uso |
| --- | --- |
| `feat` | Funcionalidad nueva para el usuario |
| `fix` | Corrección de un error |
| `docs` | Solo documentación |
| `style` | Formato, sin cambio de lógica |
| `refactor` | Cambio interno sin alterar el comportamiento |
| `perf` | Mejora de rendimiento |
| `test` | Añadir o corregir pruebas |
| `build` | Sistema de compilación o dependencias |
| `ci` | Integración continua |
| `chore` | Tareas de mantenimiento |

## Reglas

1. El resumen tiene como máximo 72 caracteres, va en español y en imperativo (`añade`, `corrige`, `elimina`).
2. Un commit = un cambio lógico. Si el diff mezcla varias cosas, propón dividirlo.
3. El cuerpo explica el motivo del cambio; se separa del resumen con una línea en blanco y se ajusta a 100 columnas.
4. Los cambios incompatibles llevan `!` tras el tipo (`feat!: ...`) y un pie `BREAKING CHANGE: ...`.
5. Nunca incluyas secretos, rutas personales ni datos de clientes en el mensaje.

## Antes de commitear

- Revisa `git status` y `git diff --staged`.
- Añade solo los ficheros relacionados con el cambio.
- No uses `--no-verify` salvo petición expresa del usuario.

## Ejemplos

```
feat(perfiles): añade el perfil "Autónomo" predefinido
fix(lanzador): escapa las comillas en rutas con espacios
docs: actualiza la guía de instalación
refactor(catalogo)!: renombra el campo `tooltip` a `help`

BREAKING CHANGE: los catálogos personalizados deben usar `help`.
```
