# 07 · Recursos visuales

> Dónde están hoy los logos, imágenes, íconos y tipografías, y cómo se usan.

---

## 1. Logos institucionales

### 1.1 Los que usa la aplicación — `assets/`

| Archivo | Entidad | Peso |
|---|---|---|
| `assets/logo-alcaldia.png` | Alcaldía de Santiago de Cali | 61 KB |
| `assets/logo-icesi.png` | Universidad Icesi | 24 KB |
| `assets/logo-cienfi.png` | CIENFI | 22 KB |

Están declarados también en `APP_CONFIG.entidades`
([js/config.js:159](../js/config.js#L159)), como lista de `{src, alt}`. Ese array
existe en la configuración, pero **hoy los logos se escriben directamente en el
HTML**: `app.js` no lo lee para dibujarlos.

### 1.2 Los originales — `input/logos/`

| Archivo | Corresponde a |
|---|---|
| `input/logos/logo-alcaldia-cali.png` | `assets/logo-alcaldia.png` |
| `input/logos/ICESI_logo_prin_descriptor_RGB_POSITIVO_0924.png` | `assets/logo-icesi.png` |
| `input/logos/CIENFI - Azul.png` | `assets/logo-cienfi.png` |

Los tres pares tienen exactamente el mismo peso en bytes: los de `assets/` son
copias renombradas de los de `input/logos/`. La carpeta `input/` no se publica
(ver `.gitlab-ci.yml`).

### 1.3 Dónde aparecen los logos

| Lugar | Marcado | Tamaño en pantalla |
|---|---|---|
| **Tarjeta de login** | `.login-logos` — los tres, [index.html:21](../index.html#L21) | Alcaldía 46 px · Icesi 34 px · CIENFI 24 px de alto (38/28/20 px por debajo de 620 px) |
| **Barra superior** | `.logo-topbar` — solo Alcaldía, [index.html:51](../index.html#L51) | 42 px de alto (34 px por debajo de 820 px) |
| **Pie de página** | `.pie-logos` — los tres, [index.html:268](../index.html#L268) | 26 px de alto, CIENFI 16 px, opacidad 0.75 |

El CSS fija una **altura distinta a cada logo** en lugar de una común. El motivo
está comentado en [styles.css:122](../styles.css#L122): las proporciones son muy
distintas (el de CIENFI es una marca horizontal de 6.4:1) y así quedan
ópticamente equilibrados sin deformar ninguno. Todos llevan
`width: auto; object-fit: contain`.

La selección se hace por el atributo `alt`, no por clase:

```css
.login-logos img[alt="CIENFI"] { height: 24px; }
.login-logos img[alt="Universidad Icesi"] { height: 34px; }
```

Es decir, **el texto del `alt` es funcional**: cambiarlo altera el tamaño con que
se muestra el logo.

---

## 2. Otras imágenes

Las únicas imágenes adicionales del proyecto son las de **Leaflet**, en
`assets/leaflet/images/`:

| Archivo | Uso |
|---|---|
| `marker-icon.png` / `marker-icon-2x.png` | El pin azul del punto en el mapa |
| `marker-shadow.png` | Su sombra |
| `layers.png` / `layers-2x.png` | Ícono del control de capas (Leaflet lo trae; la app no usa control de capas) |

Los referencia `assets/leaflet/leaflet.css` por ruta relativa; la aplicación no
los nombra directamente.

**No hay favicon**, ni imágenes de marca propias, ni fotografías, ni ilustraciones,
ni SVG en archivos sueltos.

---

## 3. Íconos

No hay librería de iconos (ni Font Awesome, ni Material Icons, ni sprites SVG).
Todos los íconos son **emojis escritos directamente en el texto**:

| Emoji | Dónde | Origen |
|---|---|---|
| 🏠 | Tarjeta y listas del Formulario de Vivienda | `FORM_VIVIENDA.icono`, [js/form-vivienda.js:93](../js/form-vivienda.js#L93) |
| 👪 | Tarjeta y listas del Formulario de Personas / Familia | `FORM_PERSONAS.icono`, [js/form-personas.js:35](../js/form-personas.js#L35) |
| 📍 | Botón «Usar mi ubicación actual» | [js/campo-direccion.js:358](../js/campo-direccion.js#L358) |
| 🔎 | Botón «Buscar la dirección en el mapa» | [js/campo-direccion.js:359](../js/campo-direccion.js#L359) |
| ✓ | Píldora «Guardado ✓», botón «✓ Ubicación confirmada», ícono de éxito de la pantalla final | `app.js`, `campo-direccion.js`, [index.html:160](../index.html#L160) |
| ☰ / ✕ | Botón de menú de la barra superior (alterna entre «☰ Menú» y «✕ Cerrar») | [js/app.js:141](../js/app.js#L141) |
| ← / → | Botones «Anterior» y «Siguiente» | [index.html:150](../index.html#L150) |
| + | Botones «+ Agregar otra persona», «+ Vivienda», «+ Personas / Familia» | `app.js` |

Hay además un **SVG embebido como data-URI** en el CSS: la flechita de los
`<select>`, para que todos los desplegables tengan el mismo alto en cualquier
navegador ([styles.css:334](../styles.css#L334)).

---

## 4. Tipografías

**No hay ningún archivo de fuente en el proyecto**: no existe carpeta `fonts/`,
ni `@font-face`, ni enlace a Google Fonts (coherente con que la aplicación deba
cargar sin internet).

Se usan dos pilas de fuentes del sistema, declaradas en
[styles.css:46](../styles.css#L46) y en varios bloques puntuales:

```css
/* General, en :root */
font-family: Inter, ui-sans-serif, system-ui, -apple-system,
             "Segoe UI", Roboto, sans-serif;

/* Monoespaciada, para datos que se leen carácter a carácter */
font-family: ui-monospace, Consolas, monospace;
```

`Inter` se usa **solo si el equipo ya la tiene instalada**; si no, se cae a la
fuente del sistema.

La pila monoespaciada se aplica a:

| Elemento | Por qué |
|---|---|
| `.codigo-pregunta` — las píldoras `V046`, `P003` | Códigos de pregunta |
| `.dir-geo-estado strong` — las coordenadas | Latitud y longitud |
| `.exito-datos strong` — `id_encuesta` e `id_hogar` en la pantalla final | Identificadores que se dictan o transcriben |

Tamaño base del `body`: **16 px**. Los controles de escritura tienen
`font-size: 16px` **exactos y fijos**, con esta regla comentada en el CSS: por
debajo de 16 px, Safari en iPhone hace zoom automático al enfocar un campo
([styles.css:325](../styles.css#L325)).

---

## 5. Paleta y sistema visual

Variables CSS en `:root`, [styles.css:22](../styles.css#L22):

| Variable | Valor | Uso |
|---|---|---|
| `--azul` | `#5454E9` | Color principal. Es el azul de Universidad Icesi / CIENFI, presente en el logotipo de CIENFI. También es el `theme-color` de la pestaña del navegador. |
| `--azul-oscuro` | `#3B3BC4` | Hover / estados activos |
| `--morado` | `#865CF0` | Acento |
| `--naranja` | `#E9683B` | Segunda barra del panel (Personas / Familia) |
| `--fondo` | `#f4f6fb` | Fondo de la aplicación |
| `--superficie` | `#ffffff` | Paneles y tarjetas |
| `--superficie-suave` | `#f1f3ff` | Subtítulos de sección, píldoras de código |
| `--tinta` | `#1b2235` | Texto principal |
| `--tinta-suave` | `#5b6780` | Texto secundario, ayudas |
| `--linea` | `#dde2ee` | Bordes |
| `--peligro` | `#c0392b` | Errores, obligatorios, «Eliminar». El rojo toma como referencia el escudo de la Alcaldía. |
| `--exito` | `#157a45` | Confirmaciones |
| `--alerta` | `#926a06` | Avisos |
| `--radio` | `16px` | Radio de esquina estándar |
| `--sombra` | `0 10px 30px rgba(24,32,58,.07)` | Sombra de paneles |
| `--pad-vista` | `22px` | Margen lateral de las vistas (la barra fija inferior lo usa en negativo) |

No hay modo oscuro: no existe ningún bloque `prefers-color-scheme` en el CSS.

Sí existen bloques `@media print` (oculta barras y botones al imprimir) y
`@media (prefers-reduced-motion: reduce)`.

---

## 6. Reglas visuales pensadas para campo

Declaradas en el encabezado de [styles.css:12](../styles.css#L12) como reglas que
no se deben romper al editar el archivo:

- Los controles de escritura nunca bajan de **16 px** de tipografía.
- Ninguna área de toque baja de **48 px** de alto en celular (botones, opciones y
  campos; en las preguntas de opción se puede tocar toda la fila, y el círculo
  del radio se agrandó a 22 px).
- **Nunca se desactiva el zoom del usuario** (el `<meta viewport>` no lleva
  `user-scalable=no` ni `maximum-scale`).
- Todo bloque ancho (tablas, tira de pasos) desplaza dentro de su propio
  contenedor; la página nunca desplaza en horizontal (`body { overflow-x: hidden }`).

Puntos de quiebre existentes: **1100, 900, 820, 620 y 380 px**, más uno para
pantalla baja en horizontal (`max-height: 480px and orientation: landscape`).

---

## 7. Resumen de ubicaciones

```
assets/
├── logo-alcaldia.png        ← topbar, login, pie
├── logo-icesi.png           ← login, pie
├── logo-cienfi.png          ← login, pie
└── leaflet/
    ├── leaflet.css          ← cargado en <head> de index.html
    ├── leaflet.js           ← cargado antes que los scripts propios
    └── images/              ← pin del mapa, sombra, control de capas

input/logos/                 ← originales de los tres logos (no se publican)

styles.css                   ← paleta, tipografía, SVG de la flecha del select
index.html                   ← las tres apariciones de los logos
js/config.js                 ← APP_CONFIG.entidades (declarado, no usado para render)
js/form-vivienda.js          ← icono 🏠
js/form-personas.js          ← icono 👪
```
