# 01 · Estructura del proyecto

> Estado actual de la carpeta del proyecto. Solo se documentan los elementos
> relevantes para entender el funcionamiento.

---

## 1. Árbol completo

```
app_damage_alcaldia/
│
├── index.html                      Todas las pantallas (SPA de una sola página)
├── styles.css                      Hoja de estilos única (identidad + responsive)
├── README.md                       Manual previo del proyecto (raíz)
├── .gitignore                      Excluye datos recolectados y CSV
├── .gitlab-ci.yml                  Publicación manual en GitLab Pages
│
├── js/
│   ├── config.js                   Secretarías, roles, usuarios, autenticación
│   ├── codigos.js                  Códigos estables de pregunta (V###, P###)
│   ├── campo-direccion.js          Widget de dirección estructurada + mapa
│   ├── ayuda-nivel-dano.js         Anexo 1 (criterios técnicos) como ayuda
│   ├── form-vivienda.js            Esquema del formulario VOL-10
│   ├── form-personas.js            Esquema del formulario VOL-3 / EDAN
│   ├── storage.js                  Persistencia en localStorage + estadísticas
│   ├── export.js                   Generación y descarga de los CSV
│   └── app.js                      Orquestación: render, navegación, panel
│
├── assets/
│   ├── logo-alcaldia.png           Logo Alcaldía de Santiago de Cali
│   ├── logo-icesi.png              Logo Universidad Icesi
│   ├── logo-cienfi.png             Logo CIENFI
│   └── leaflet/                    Leaflet 1.9.4 alojado localmente
│       ├── leaflet.js
│       ├── leaflet.css
│       └── images/                 marker-icon, marker-shadow, layers…
│
├── input/                          Insumos originales (fuente de verdad)
│   ├── formularios/
│   │   ├── vol10_viviendas.docx                              TRANSCRIPT Vivienda
│   │   ├── vol3_personas.docx                                TRANSCRIPT Personas
│   │   ├── VOL-10-Formato-Inspeccion-de-vivienda-Octubre-26.xlsx   Formato Excel original
│   │   └── VOL-3-Formato-EDAN.xlsx                           Formato Excel original
│   └── logos/
│       ├── logo-alcaldia-cali.png
│       ├── ICESI_logo_prin_descriptor_RGB_POSITIVO_0924.png
│       └── CIENFI - Azul.png
│
├── app_output/                     Destino sugerido para los CSV descargados
│   ├── viviendas_20260812_2326.csv
│   ├── personas_20260812_2326.csv
│   ├── personas_hogares_20260812_2326.csv
│   ├── indice_encuestas_20260812_2326.csv
│   └── diccionario_variables_20260812_2326.csv
│
├── App_damage.pptx                 Presentación del aplicativo (no rastreada en git)
├── App_damage.pdf                  La misma presentación en PDF (no rastreada)
│
├── .claude/launch.json             Config local del servidor de desarrollo
└── README/                         Esta documentación
```

---

## 2. Carpetas principales y para qué sirven

| Carpeta | Función |
|---|---|
| **raíz** | Contiene la aplicación servible: `index.html` + `styles.css` + `js/` + `assets/`. Es exactamente lo que el job `pages` de `.gitlab-ci.yml` copia al publicar. |
| **`js/`** | Toda la lógica. Nueve archivos sin build ni bundler; se cargan como `<script>` en orden desde `index.html`. |
| **`assets/`** | Recursos que la aplicación sirve al navegador: los tres logos y la copia local de Leaflet. |
| **`input/`** | Insumos de origen. **No los consume la aplicación en tiempo de ejecución**: son la referencia documental desde la que se escribieron los esquemas. `README.md` raíz los marca como «NO modificar». |
| **`app_output/`** | Carpeta a la que se sugiere mover los CSV descargados por el navegador. Está en `.gitignore` (los datos recolectados nunca se suben al repositorio). |
| **`.claude/`** | Configuración local de herramienta (`launch.json`). Está en `.gitignore`. |
| **`README/`** | Esta documentación. |

---

## 3. Archivos importantes, uno por uno

### 3.1 `index.html` (~290 líneas)

Una sola página que contiene **todas** las pantallas, ocultas con la clase
`.oculto`. Estructura:

| Bloque | id | Contenido |
|---|---|---|
| Login | `#vista-login` | Card con los tres logos, campos usuario/contraseña, `#form-login` |
| Shell | `#app-shell` | Envuelve todo lo demás cuando hay sesión |
| ├ Topbar | `.topbar` | Logo, título dinámico `#topbar-titulo`, botón `#btn-menu`, píldoras de usuario/secretaría, botones Inicio / Descargar respaldo / Restaurar respaldo / Salir |
| ├ Secretaría | `#vista-secretaria` | «Paso 1 de 2», contenedor `#lista-secretarias` que se llena por JS |
| ├ Menú | `#vista-menu` | «Paso 2 de 2», `#lista-formularios`, `#lista-encuestas-propias`, `#menu-resumen` |
| ├ Formulario | `#vista-formulario` | Cabecera de progreso (`#form-pasos`, `#form-progreso`), aviso de vínculo `#form-vinculo`, contenedor `#form-campos`, errores `#form-errores`, acciones secundarias (Guardar y salir / Eliminar) y barra inferior (`#btn-anterior`, `#btn-siguiente`, `#btn-finalizar`) |
| ├ Final | `#vista-final` | Confirmación, `#final-id`, `#final-hogar`, `#final-opciones` |
| ├ Panel | `#vista-panel` | Indicadores, avance por tipo, tablas de diligenciadores y secretarías, filtros de descarga, botones `[data-descargar]`, tabla de registros |
| └ Pie | `.pie` | Tres logos + `#pie-version` |
| Toast | `#toast` | Mensajes flotantes (`role="status"`) |

Al final del `<body>` se cargan los scripts **en este orden** (el orden importa
porque cada uno publica globales que el siguiente usa):

```
assets/leaflet/leaflet.js
js/config.js  →  js/codigos.js  →  js/campo-direccion.js  →  js/ayuda-nivel-dano.js
js/form-vivienda.js  →  js/form-personas.js
js/storage.js  →  js/export.js  →  js/app.js
```

### 3.2 `styles.css` (~975 líneas)

Hoja única. Organización interna por bloques comentados: variables `:root`,
login, estructura general, botones, píldoras, tarjetas de opción, indicadores,
tablas, campos de formulario, campo de dirección con mapa, grupo repetible,
progreso, finalización, listas y filtros, mensajes, y al final los bloques
`@media` (1100, 900, 820, 620, 380 px, landscape bajo, `print`,
`prefers-reduced-motion`).

Detalle de la paleta y las decisiones visuales en [07_assets.md](07_assets.md).

### 3.3 Archivos de `js/`

| Archivo | Tamaño aprox. | Publica en `window` | Función |
|---|---|---|---|
| [`config.js`](../js/config.js) | 5 KB | `APP_CONFIG` | Lista de Secretarías, definición de los 3 roles, lista de usuarios con contraseña en texto plano, función `autenticar()`, helpers `secretaria()`, `nombreSecretaria()`, `normalizar()`, y metadatos de la app (`appVersion`, logos). |
| [`codigos.js`](../js/codigos.js) | 8 KB | `CODIGOS` | Tabla `id_campo → código` para los dos formularios (V001–V102, P001–P025). Helpers `CODIGOS.de()` y `CODIGOS.numeroOpcion()`. Los códigos están declarados como **congelados**. |
| [`campo-direccion.js`](../js/campo-direccion.js) | 38 KB | `CampoDireccion` | Widget compuesto: casillas de nomenclatura colombiana, composición automática de la dirección, mapa Leaflet, GPS, geocodificación directa e inversa con Nominatim, confirmación de ubicación. Expone `SUBCAMPOS`, `render()`, `montar()`, `desmontar()`, `componer()`, `parsearVia()`, `parsearNumeroCasa()`, `columnas()`. |
| [`ayuda-nivel-dano.js`](../js/ayuda-nivel-dano.js) | 8 KB | `AYUDA_NIVEL_DANO` | Textos del Anexo 1 del VOL-10: `[sistema][elemento][nivel] = criterio`. Se muestran como ayuda desplegable; **no se almacenan ni se exportan**. |
| [`form-vivienda.js`](../js/form-vivienda.js) | 25 KB | `FORM_VIVIENDA` | Esquema declarativo del formulario de Vivienda: 9 secciones y sus campos. |
| [`form-personas.js`](../js/form-personas.js) | 10 KB | `FORM_PERSONAS` | Esquema declarativo del formulario de Personas/Familia: 2 secciones (una repetible por persona + datos finales). |
| [`storage.js`](../js/storage.js) | 12 KB | `Almacen` | Lectura/escritura en `localStorage`, generación de identificadores, `listar/obtener/crear/guardar/finalizar/eliminar/hermanas`, sesión, borrador activo, `estadisticas()`, `exportarRespaldo()`, `importarRespaldo()`. |
| [`export.js`](../js/export.js) | 17 KB | `Exportador` | Derivación de columnas desde los esquemas, construcción del texto CSV, descarga vía `Blob`, 5 generadores de archivo, `conteos()`. |
| [`app.js`](../js/app.js) | 61 KB | *(nada)* | Orquestación completa: cacheo del DOM, eventos, sesión, navegación entre vistas, motor de render de formularios, condicionales, progreso, validación, finalización, panel de coordinación, descargas y respaldo. |

### 3.4 Archivos de configuración y despliegue

| Archivo | Qué hace |
|---|---|
| `.gitignore` | Excluye `app_output/`, todos los `*.csv`, los `respaldo_encuestas_*.json`, la carpeta `.claude/` y basura de Windows/macOS/Dropbox. El motivo declarado: los datos recolectados contienen nombres, cédulas, teléfonos, direcciones y coordenadas. |
| `.gitlab-ci.yml` | Un job `pages` que copia `index.html`, `styles.css`, `js/` y `assets/` a `public/`. Está configurado como **`when: manual`** y solo en la rama por defecto. `README.md` e `input/` no se publican. |
| `.claude/launch.json` | Servidor de desarrollo local: `python -m http.server 8791`. La ruta al ejecutable de Python apunta a `C:\Users\Angela\...`, es decir, a otro equipo. |

### 3.5 Archivos que no forman parte del aplicativo

| Archivo | Nota |
|---|---|
| `App_damage.pptx` / `App_damage.pdf` | Presentación del aplicativo. Están en la raíz pero **sin rastrear en git** (aparecen como `??` en `git status`). No los usa la aplicación. |
| `input/formularios/*.xlsx` | Los formatos originales en Excel. Ver [02_forms.md](02_forms.md). |
| `app_output/*.csv` | Ejemplos de exportación generados el 2026-08-12 a las 23:26. Contienen datos de prueba, no de campo. |

---

## 4. Dependencias entre archivos

```
                       index.html
                            │ carga en orden
   ┌────────────────────────┼───────────────────────────────┐
   ▼                        ▼                               ▼
leaflet.js            config.js ─► codigos.js ─► campo-direccion.js
   │                                  │  ▲              │  ▲
   │ usado por                        │  └──────────────┘  │ usa CODIGOS.de()
   └──────────────────────────────────┼────────────────────┘
                                      ▼
                       form-vivienda.js  form-personas.js
                                      │
                                      ▼
                       storage.js ──► export.js ──► app.js
                                          ▲            │
                       usa FORM_*, CODIGOS,           usa todo lo anterior
                       CampoDireccion.columnas()
```

Puntos de acoplamiento que conviene tener presentes:

- `export.js` llama a `window.CampoDireccion.columnas()` y a
  `window.CampoDireccion.SUBCAMPOS` para armar las columnas de dirección
  ([js/export.js:129](../js/export.js#L129) y [js/export.js:341](../js/export.js#L341)).
- `campo-direccion.js` llama a `window.CODIGOS.de()` para mostrar el código de
  cada subcampo junto a su casilla ([js/campo-direccion.js:266](../js/campo-direccion.js#L266)).
- `app.js` conoce los dos formularios por el objeto `FORMULARIOS`
  (`{vivienda: FORM_VIVIENDA, personas: FORM_PERSONAS}`,
  [js/app.js:20](../js/app.js#L20)) y decide todo lo demás a partir del esquema.
