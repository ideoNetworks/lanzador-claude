---
name: ideo-readme-es
description: Escribe o mejora ficheros README.md en español con una estructura estándar. Úsala cuando se pida crear, revisar o actualizar la documentación principal de un proyecto.
---

# README en español

Antes de escribir, lee el código, `package.json` / `Cargo.toml` / equivalentes y los scripts disponibles. No inventes funcionalidades: documenta solo lo que existe.

## Estructura estándar

1. **Título y lema**: nombre del proyecto y una frase que diga qué hace.
2. **Insignias** (opcional): CI, licencia, versión.
3. **Qué es y para quién**: 2 o 3 frases, sin jerga innecesaria.
4. **Características**: lista breve de lo más importante.
5. **Requisitos**: versiones mínimas de runtimes y herramientas.
6. **Instalación**: pasos numerados y comandos copiables.
7. **Uso**: ejemplo mínimo que funcione y, si procede, captura.
8. **Configuración**: variables de entorno y ficheros, con valores por defecto.
9. **Desarrollo**: cómo compilar, probar y ejecutar en local.
10. **Contribuir**: enlace a `CONTRIBUTING.md`.
11. **Licencia**: nombre de la licencia y enlace a `LICENSE`.

## Estilo

- Español neutro de España, tono cercano y claro; trata de "tú".
- Frases cortas; un bloque de código por cada comando o conjunto de comandos.
- Indica el lenguaje en los bloques de código (bash, powershell, json).
- Los nombres de ficheros, comandos y variables van entre comillas invertidas.
- Si el proyecto es multilingüe, enlaza las demás versiones al principio.

## Revisión final

- Cada comando del README se ha ejecutado o comprobado contra el código.
- Los enlaces relativos apuntan a ficheros existentes.
- No quedan marcadores como `TODO` ni texto de plantilla.
