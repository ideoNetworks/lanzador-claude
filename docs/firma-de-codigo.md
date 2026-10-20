# Firma de código

## Situación actual: sin firmar

Los instaladores de Lanzador Claude **no están firmados con un certificado de código** todavía. Un certificado de pago (OV/EV) cuesta dinero cada año y el proyecto es gratuito y de código abierto. Por eso Windows SmartScreen muestra un aviso al ejecutarlo: el usuario debe pulsar **Más información → Ejecutar de todas formas**.

Las **actualizaciones** sí están protegidas: se firman con la clave propia de Tauri (ver [actualizaciones.md](actualizaciones.md)), independiente de la firma de Windows.

## Plan: SignPath Foundation

[SignPath Foundation](https://signpath.org/) ofrece firma de código **gratuita** para proyectos de código abierto.

### Requisitos

- Licencia de código abierto aprobada por la OSI (GPLv3 lo es).
- Repositorio público.
- Compilación reproducible en CI (GitHub Actions) desde el repositorio público; SignPath firma los artefactos construidos allí.
- Proyecto activo y con documentación de lo que hace (README, política de privacidad).
- Sin software malicioso ni funciones de telemetría ocultas.

### Pasos

1. Publica el repositorio con una primera release funcional.
2. Solicita la adhesión en https://signpath.org/ (formulario para proyectos OSS) indicando el repositorio, la licencia y el flujo de release.
3. Una vez aprobado, crea en SignPath el proyecto (`lanzador-claude`), la política de firma (`release-signing`) y el token de API.
4. Guarda en GitHub: secreto `SIGNPATH_API_TOKEN` y variable `SIGNPATH_ORGANIZATION_ID`.
5. Añade el paso de firma a `.github/workflows/release.yml` (ver abajo).
6. Documenta en el README el nombre del publicador firmante.

### Integración en `release.yml`

El workflow incluye un bloque comentado. Esquema de la integración (el flujo exacto depende de cómo SignPath te pida subir los artefactos):

```yaml
      # 1. Compilar sin publicar y subir el instalador como artefacto de GitHub
      - uses: actions/upload-artifact@v4
        id: upload-unsigned
        with:
          name: instalador-sin-firmar
          path: src-tauri/target/${{ matrix.target }}/release/bundle/nsis/*.exe

      # 2. Pedir la firma a SignPath
      - uses: signpath/github-action-submit-signing-request@v1
        with:
          api-token: ${{ secrets.SIGNPATH_API_TOKEN }}
          organization-id: ${{ vars.SIGNPATH_ORGANIZATION_ID }}
          project-slug: lanzador-claude
          signing-policy-slug: release-signing
          github-artifact-id: ${{ steps.upload-unsigned.outputs.artifact-id }}
          wait-for-completion: true
          output-artifact-directory: signed

      # 3. Adjuntar los instaladores firmados a la release (PLACEHOLDER)
```

Atención: si se re-firma el instalador después de generar la firma del updater, hay que volver a generar `latest.json` y la firma `.sig` del instalador firmado. Plánalo al integrar SignPath.

## Por qué un certificado autofirmado no sirve

Un certificado autofirmado **no es de confianza para SmartScreen** ni para Windows: el aviso seguiría apareciendo. Para que dejara de salir, cada usuario tendría que importar tu certificado raíz en su almacén de confianza, lo cual es **peor que no firmar**: es un paso complejo y entrena a la gente a confiar en certificados arbitrarios. No lo recomendamos.

## Alternativa de pago

Si SignPath Foundation no fuera posible, existen certificados OV o EV de autoridades comerciales, o servicios de firma en la nube. Son una alternativa válida, pero con coste anual, y un OV todavía necesita acumular reputación en SmartScreen.
