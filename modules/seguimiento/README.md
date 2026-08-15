# Módulo · Registro y seguimiento de atención

**Estado:** en preparación · **Punto de entrada:** `index.html`

Espacio destinado a futuros instrumentos de registro, seguimiento y atención de
los hogares afectados por la emergencia.

## Importante

**Este módulo no tiene funcionalidad todavía.** Su propósito actual es
demostrativo: muestra que la plataforma puede incorporar nuevos aplicativos sin
rehacerse. La carpeta, el punto de entrada, el enlace desde el portal y la
identidad visual ya existen; el contenido se desarrollará después.

El nombre es deliberadamente genérico e institucional para que pueda
especializarse más adelante sin quedar desactualizado.

## Alcance posible

Lo que aparece en la pantalla describe **posibilidades, no compromisos**. El
alcance real se definirá con el equipo responsable.

- Instrumentos de registro adicionales a los formatos EDAN ya implementados.
- Seguimiento de la atención prestada a cada hogar, con su estado y sus fechas.
- Consulta del estado de un caso a partir del código de hogar (`id_hogar`) que
  genera el módulo EDAN.
- Reportes de avance de la atención por Secretaría y por territorio.

## Estructura

```
seguimiento/
├── index.html     Pantalla del módulo
├── modulo.css     Estilos propios
└── README.md      Este archivo
```

La identidad visual viene de `../../assets/shared.css`.

## Al desarrollarlo

Cuando este módulo tenga contenido real, hay que actualizar su entrada en
`../../portal/modulos.js`: cambiar `estado` a `'operativo'`, ajustar
`etiquetaEstado`, y actualizar `resumen` y `detalles`.
