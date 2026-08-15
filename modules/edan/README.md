# Módulo · Evaluación de Viviendas y Familias — EDAN

**Estado:** operativo · **Punto de entrada:** `index.html`

Aplicativo de recolección en campo de la evaluación de daños y análisis de
necesidades posteriores al sismo. Digitaliza dos formatos en papel:

| Formulario | Formato original |
|---|---|
| Vivienda | **VOL-10** — Formato de inspección de viviendas afectadas |
| Personas / Familia | **VOL-3** — EDAN, código FR-1703-SMD-08 v01 |

## Qué incluye

- Login con tres roles: diligenciador, coordinador y coordinación general.
- Dos Secretarías: Gestión del Riesgo y Vivienda.
- Formularios por secciones, con lógica condicional, validación de obligatorios,
  barra de progreso y guardado automático.
- Dirección estructurada con nomenclatura colombiana, mapa (Leaflet +
  OpenStreetMap), GPS y geocodificación.
- Panel de seguimiento con indicadores y avance por diligenciador.
- Exportación a cinco archivos CSV y respaldo JSON restaurable.
- Funciona sin conexión (salvo los mosaicos del mapa) y está adaptado a celular.

## Estructura

```
edan/
├── index.html                 Todas las pantallas
├── styles.css                 Identidad visual del aplicativo
├── integracion-portal.css     Enlace de regreso al portal (añadido al integrarlo)
├── js/                        9 archivos: config, formularios, storage, export, app
├── assets/                    Logos + Leaflet 1.9.4 local
├── input/                     Transcripts y formatos originales (referencia)
└── README/                    Documentación completa (9 documentos)
```

## Cómo cambiar una pregunta

El motor no conoce ninguna pregunta: todo sale de los esquemas declarativos. Se
edita `js/form-vivienda.js` o `js/form-personas.js` y se recarga la página. Las
columnas del CSV se recalculan solas. **No hay que tocar `app.js`.**

Los códigos de pregunta (`V001`…`V102`, `P001`…`P025`) están **congelados** en
`js/codigos.js`: una pregunta nueva recibe el siguiente número libre, y nunca se
renumera lo existente.

## Advertencias

1. **La autenticación es preliminar.** Las contraseñas están en texto plano en
   `js/config.js` (todas son `123`). No publicar en internet sin cambiarlas.
2. **El GPS exige HTTPS** o `localhost`.
3. **El mapa necesita conexión** para cargar los mosaicos; el GPS no.
4. Los datos viven en el navegador de cada equipo y **no se sincronizan solos**:
   la consolidación se hace con los CSV o con «Descargar respaldo».

## Documentación

Completa en `README/`, desde la estructura del proyecto hasta cada pregunta de
cada formulario. Ver también `../../README/03_edan.md` para cómo se incorporó
este aplicativo al portal.
