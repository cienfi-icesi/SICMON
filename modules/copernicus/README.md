# Módulo · Información satelital — Copernicus

**Estado:** preliminar · **Punto de entrada:** `index.html`

Espacio destinado a reunir información satelital y geoespacial que apoye la
evaluación de la emergencia.

## Importante

**No hay ninguna fuente de datos conectada.** Este módulo tiene la interfaz y la
estructura, pero no muestra imágenes, capas ni indicadores reales. El espacio
del visor se dejó deliberadamente vacío: no se puso un mapa de ejemplo para que
nada pueda confundirse con información real de la emergencia.

## Alcance previsto

- Imágenes satelitales de la zona afectada, con fecha de captura y comparación
  antes/después del sismo.
- Capas geoespaciales de apoyo: perímetro urbano, comunas, barrios.
- Datos derivados para delimitar y cuantificar las áreas afectadas.
- Cruce con la información de campo del módulo EDAN, usando las coordenadas
  registradas en cada vivienda.

## Qué falta para ponerlo en operación

1. Definir la fuente de información satelital y sus condiciones de acceso.
2. Definir qué productos concretos se muestran y con qué periodicidad se
   actualizan.
3. Implementar el visor y la descarga de los datos que correspondan.

## Estructura

```
copernicus/
├── index.html     Pantalla del módulo
├── modulo.css     Estilos propios (encabezado y espacio reservado del visor)
└── README.md      Este archivo
```

La identidad visual viene de `../../assets/shared.css`.

## Nota técnica

Si más adelante se incorpora un visor de mapas, el módulo EDAN ya trae una copia
local de **Leaflet 1.9.4** en `../edan/assets/leaflet/`. Conviene decidir
entonces si se mueve a `assets/` como recurso compartido o si este módulo trae
la suya propia.
