# 00 · Visión general del proyecto

> Documento de comprensión del **estado actual** del aplicativo, a fecha de esta
> revisión. Describe lo que existe hoy en el repositorio; no propone cambios.

---

## 1. Qué es el proyecto

**Registro de Afectaciones — Santiago de Cali** es una aplicación web para la
recolección de información en campo sobre afectaciones causadas por un sismo en
Cali. La desarrollan Universidad Icesi · CIENFI · Alcaldía de Santiago de Cali.

El repositorio se identifica a sí mismo como una **versión preliminar (MVP)
funcional** (`README.md` raíz, `js/config.js`). La versión declarada en código es
`1.0.0` (`APP_CONFIG.appVersion` en [js/config.js:156](../js/config.js#L156)).

La aplicación digitaliza dos formatos en papel:

| Formulario en la app | Formato original | Fuente |
|---|---|---|
| Formulario de Vivienda | **VOL-10** — «Formato de inspección de viviendas afectadas» | `input/formularios/vol10_viviendas.docx` |
| Formulario de Personas / Familia | **VOL-3** — EDAN, código FR-1703-SMD-08 v01 | `input/formularios/vol3_personas.docx` |

---

## 2. Tecnología

No hay framework, ni build, ni gestor de paquetes, ni backend.

| Aspecto | Qué usa actualmente |
|---|---|
| **Framework** | Ninguno. HTML + CSS + JavaScript plano («vanilla»). |
| **Lenguaje** | JavaScript ES5-ish (`var`, `function`, IIFE con `'use strict'`). Usa algunos métodos modernos: `Object.assign`, `padStart`, `Array.some/every`, `fetch`, `closest`, `normalize('NFD')`, template-free string concat. |
| **Módulos** | No hay `import`/`export`. Cada archivo es una IIFE que publica un objeto en `window` (`APP_CONFIG`, `CODIGOS`, `CampoDireccion`, `AYUDA_NIVEL_DANO`, `FORM_VIVIENDA`, `FORM_PERSONAS`, `Almacen`, `Exportador`). `app.js` no publica nada. |
| **Dependencias externas** | Una sola: **Leaflet 1.9.4**, alojado dentro del proyecto en `assets/leaflet/` (no CDN). No hay `package.json` ni `node_modules`. |
| **Estilos** | Un único archivo CSS a mano, [styles.css](../styles.css), con variables CSS en `:root`. Sin preprocesador, sin framework CSS, sin clases utilitarias. |
| **Rutas** | No hay enrutador ni URLs. La navegación es por **mostrar/ocultar secciones** del mismo `index.html` con la clase `.oculto` (función `mostrarVista()` en [js/app.js:332](../js/app.js#L332)). No hay hash, ni History API, ni recarga de página. |
| **Manejo de estado** | Variables de módulo dentro de la IIFE de `app.js`: `sesion`, `registro`, `formActivo`, `indiceSeccion`, `condicionantes`, `ayudasAbiertas`. No hay librería de estado. |
| **Almacenamiento** | `localStorage` del navegador. Tres claves. Ver [03_data.md](03_data.md). |
| **Formularios** | Sin librería. Motor propio declarativo: los formularios son objetos JavaScript y `app.js` los renderiza. Ver [02_forms.md](02_forms.md). |
| **Mapas / GPS** | Leaflet + mosaicos de OpenStreetMap; geocodificación directa e inversa con **Nominatim**; ubicación del dispositivo con `navigator.geolocation`. Ver [05_location.md](05_location.md). |
| **Exportación** | CSV generados en el navegador con `Blob` + enlace de descarga. Ver [06_export.md](06_export.md). |
| **Despliegue** | Sitio estático. `.gitlab-ci.yml` define un job `pages` de GitLab Pages **manual** (no automático). Localmente se sirve con `python -m http.server` (ver `.claude/launch.json` y `README.md` raíz). |

---

## 3. Cómo está organizado

```
app_damage_alcaldia/
├── index.html          Todas las pantallas de la aplicación (una sola página)
├── styles.css          Identidad visual y adaptación a móvil
├── js/                 Toda la lógica (9 archivos, sin build)
├── assets/             Logos institucionales + Leaflet alojado localmente
├── input/              Insumos originales: transcripts y logos de origen
├── app_output/         Destino sugerido para los CSV descargados
├── README.md           Manual de uso y decisiones (documento previo, en la raíz)
└── README/             Esta documentación
```

Detalle completo en [01_structure.md](01_structure.md).

### Separación de responsabilidades entre los archivos `js/`

```
config.js ──────► quién puede entrar, con qué rol, a qué Secretaría
codigos.js ─────► códigos estables de pregunta (V001…, P001…)
form-vivienda.js ─┐
form-personas.js ─┴► QUÉ se pregunta (esquemas declarativos)
ayuda-nivel-dano.js► textos del Anexo 1 mostrados como ayuda
campo-direccion.js► widget compuesto de dirección + mapa
storage.js ─────► cómo se guarda y se lee en localStorage
export.js ──────► cómo se convierte a CSV
app.js ─────────► CÓMO se muestra: render, navegación, validación, panel
```

El principio explícito del código (comentario de cabecera de
[js/app.js:13](../js/app.js#L13)) es que **el motor no conoce ninguna pregunta**:
todo sale del esquema, y las columnas del CSV se derivan del mismo esquema.

---

## 4. Flujo general de la aplicación

### 4.1 Pantallas existentes

Todas viven en [index.html](../index.html). Son cinco vistas dentro del
contenedor `#app-shell`, más la pantalla de login que está fuera de él.

| # | Pantalla | Elemento HTML | Controlada por |
|---|---|---|---|
| 0 | Inicio de sesión | `#vista-login` | `mostrarLogin()` / `alIniciarSesion()` — [js/app.js:246](../js/app.js#L246) |
| 1 | Selección de Secretaría | `#vista-secretaria` | `mostrarSelectorSecretaria()` / `alElegirSecretaria()` — [js/app.js:356](../js/app.js#L356) |
| 2 | Menú de formularios + «Mis encuestas recientes» | `#vista-menu` | `mostrarMenu()` / `renderEncuestasPropias()` — [js/app.js:379](../js/app.js#L379) |
| 3 | Formulario por secciones | `#vista-formulario` | `abrirEncuesta()` / `renderSeccion()` — [js/app.js:542](../js/app.js#L542) |
| 4 | Finalización | `#vista-final` | `mostrarPantallaFinal()` — [js/app.js:1155](../js/app.js#L1155) |
| 5 | Panel de coordinación y descargas | `#vista-panel` | `prepararPanel()` / `renderPanel()` — [js/app.js:1207](../js/app.js#L1207) |

### 4.2 Recorrido de un diligenciador

```
  Login
    │  (CFG.autenticar → sesión guardada en localStorage)
    ▼
  Selección de Secretaría          ← solo si sesion.secretaria es null
    │  (queda en sesion.secretaria y se copia a cada encuesta)
    ▼
  Menú de formularios ────────────────────────────────┐
    │  Vivienda 🏠   ó   Personas/Familia 👪           │  «Continuar» sobre
    ▼                                                  │  un borrador propio
  Formulario (secciones, ← Anterior / Siguiente →)     │
    │  guardado automático a los 400 ms de cada cambio │
    ▼                                                  │
  Finalizar encuesta                                   │
    │  (valida obligatorios de TODAS las secciones     │
    │   visibles; estado pasa a 'finalizada')          │
    ▼                                                  │
  Pantalla final ──► «Continuar con el otro formulario» (mismo id_hogar)
                 ──► «Diligenciar otro …» (hogar nuevo)
                 ──► «Finalizar y volver al inicio» ───┘
```

### 4.3 Recorrido de un coordinador / coordinación general

```
  Login
    │  rol con puedeConsultar = true
    ▼
  Panel de seguimiento (directo, sin pasar por Secretaría ni formularios)
    ├─ Indicadores (finalizadas, por tipo, personas, hogares completos, borradores)
    ├─ Avance por tipo de formulario
    ├─ Avance por diligenciador
    ├─ Avance por Secretaría        ← solo rol admin
    ├─ Descarga de información      ← 5 CSV + «Descargar todos»
    └─ Tabla de registros recolectados (200 más recientes)
```

### 4.4 Qué se conserva al navegar

| Dato | Dónde vive | Sobrevive a… |
|---|---|---|
| Sesión (`usuario`, `nombre`, `rol`, `secretaria`) | `localStorage['damage_cali_sesion_v1']` + variable `sesion` | recargar la página y cerrar el navegador (se restaura sin volver a pedir clave, [js/app.js:46](../js/app.js#L46)) |
| Encuesta en edición | variable `registro` + `localStorage['damage_cali_encuestas_v1']` | recargar (el dato queda), pero la variable `registro` se pierde: hay que reabrir la encuesta desde «Mis encuestas recientes» |
| Borrador activo | `localStorage['damage_cali_borrador_activo_v1']` | se escribe al abrir una encuesta y se limpia al finalizar o al ir al Inicio |
| Sección actual (`indiceSeccion`) | solo en memoria | no sobrevive a una recarga |
| Vínculo entre formularios | `id_hogar` dentro de cada registro | siempre; es el dato que une las dos encuestas de un mismo hogar |

Detalle del flujo de navegación, del motor de render y de la validación en
[08_navigation.md](08_navigation.md).

---

## 5. Índice de esta documentación

| Archivo | Contenido |
|---|---|
| [00_overview.md](00_overview.md) | Este documento: qué es, con qué está hecho, cómo se organiza, flujo general |
| [01_structure.md](01_structure.md) | Estructura de carpetas y función de cada archivo |
| [02_forms.md](02_forms.md) | Los dos formularios, sus secciones, preguntas, condicionales y transcripts |
| [03_data.md](03_data.md) | Almacenamiento, estructura del registro, identificadores, respaldo |
| [04_users.md](04_users.md) | Login, usuarios, roles, sesiones, Secretarías |
| [05_location.md](05_location.md) | Dirección estructurada, mapa, GPS, geocodificación |
| [06_export.md](06_export.md) | Exportación CSV: archivos, columnas, origen de los datos |
| [07_assets.md](07_assets.md) | Logos, imágenes, íconos, fuentes, recursos visuales |
| [08_navigation.md](08_navigation.md) | Motor de formularios: render, condicionales, progreso, validación, guardado |
