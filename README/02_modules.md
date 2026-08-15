# 02 · Los módulos

Registro declarativo: [`portal/modulos.js`](../portal/modulos.js).

| id | Nombre | Estado | Carpeta |
|---|---|---|---|
| `edan` | Registro de afectaciones (EDAN) | Disponible | `modules/edan/` |
| `copernicus` | Observación satelital — Copernicus | Próximamente | `modules/copernicus/` |
| `seguimiento` | Registro y seguimiento de atención | Próximamente | `modules/seguimiento/` |

> **No hay módulo de análisis, y es una decisión del proyecto.** Esta etapa se
> limita a *recolectar → almacenar → respaldar → consultar*. No se muestran
> tableros, indicadores derivados, gráficos, cruces de variables ni reportes
> analíticos sobre las encuestas. Si más adelante se necesita una herramienta
> de análisis, será un desarrollo independiente que entrará como un módulo más
> de esta lista.

Los dos estados posibles, tal como los define el diseño del portal:

| Estado | Significa | Insignia |
|---|---|---|
| `disponible` | Operativo, se puede entrar y usar | Verde |
| `proximamente` | Anunciado; su página explica qué contendrá | Gris |

---

## 1. Registro de afectaciones (EDAN)

**Estado: disponible.** Es el aplicativo de captura en campo, incorporado
completo. Documentación detallada en [03_edan.md](03_edan.md) y en
`modules/edan/README/`.

Qué contiene:

- Formulario de **Vivienda** (formato VOL-10, 9 secciones, 102 preguntas
  codificadas V001–V102).
- Formulario de **Personas / Familia** (formato VOL-3 · EDAN, secciones
  repetibles por persona, P001–P025).
- **Login con roles**: diligenciador, coordinador y coordinación general.
- **Secretarías**: Gestión del Riesgo y Vivienda.
- **Dirección estructurada** con nomenclatura colombiana, **mapa** (Leaflet +
  OpenStreetMap), **GPS** y geocodificación.
- **Panel de seguimiento** con indicadores y avance por diligenciador.
- **Exportación** a cinco archivos CSV y respaldo JSON.
- Guardado automático en el navegador, funcionamiento sin conexión y diseño
  adaptado a celular.

---

## 2. Observación satelital — Copernicus

**Estado: próximamente.** La interfaz existe; **no hay integración real de datos**.

Es una **fuente de información** para la atención de la emergencia, no una
herramienta de análisis de las encuestas: no cruza ni interpreta lo recolectado
en campo.

La pantalla declara explícitamente que es un módulo preliminar y deja un espacio
reservado, deliberadamente vacío, donde irá el visor geoespacial. No se muestra
un mapa ni imágenes de ejemplo, para que nada pueda confundirse con información
real de la emergencia.

Alcance previsto según la pantalla del módulo:

- Imágenes satelitales de la zona afectada, con fecha de captura y comparación
  antes/después.
- Capas geoespaciales de apoyo (perímetro urbano, comunas, barrios).
- Datos derivados para delimitar y cuantificar áreas afectadas.

Qué falta para ponerlo en operación: definir la fuente y sus condiciones de
acceso, definir qué productos se muestran y con qué periodicidad, e implementar
el visor.

Archivos: `modules/copernicus/index.html`, `modulo.css`, `README.md`.

---

## 3. Registro y seguimiento de atención

**Estado: próximamente.** Es el módulo que demuestra cómo crecerá la
plataforma: la carpeta, el punto de entrada y el enlace desde el portal ya
existen; el contenido se desarrollará después.

La pantalla indica que el módulo está en etapa de preparación, describe el
alcance posible —instrumentos de registro adicionales, seguimiento de la
atención por hogar, consulta del estado de un caso por código de hogar— y
ofrece un atajo al módulo EDAN, que sí está disponible.

El nombre es deliberadamente genérico e institucional para que pueda
especializarse más adelante sin quedar desactualizado.

Archivos: `modules/seguimiento/index.html`, `modulo.css`, `README.md`.

---

## 4. Futuros módulos

La arquitectura está pensada para incorporar:

- Formularios adicionales
- Bases de datos y herramientas de consulta
- Fuentes geoespaciales
- Aplicativos externos (basta con que el `ruta` del registro apunte a otra
  dirección)
- Sistemas de seguimiento

Una eventual herramienta de análisis entraría por esta misma vía, como un
desarrollo independiente, cuando el proyecto decida abordarla.

El procedimiento está en [01_architecture.md](01_architecture.md) y en
[04_development.md](04_development.md). Punto de partida:
`modules/_plantilla/`.
