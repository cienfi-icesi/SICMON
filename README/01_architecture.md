# 01 · Arquitectura

## Principio

```
Portal central  →  presenta y dirige
Módulos         →  hacen el trabajo, y son independientes entre sí
```

El portal no conoce el funcionamiento de ningún módulo. Un módulo no conoce el
portal salvo por un enlace de regreso. Lo único compartido es la identidad
visual (`assets/`).

## Tecnología

Sitio **estático**: HTML + CSS + JavaScript plano. Sin framework, sin build, sin
gestor de paquetes, sin backend. Es la misma tecnología del aplicativo EDAN, y
se mantuvo a propósito: permite servir la plataforma desde cualquier sitio y
copiar el módulo EDAN sin adaptarlo.

## Estructura de carpetas

```
web_damage_cali/
│
├── index.html               ← PORTAL PRINCIPAL (punto de entrada)
│
├── portal/                  Lo que hace funcionar la portada
│   ├── modulos.js           ← REGISTRO DE MÓDULOS (única fuente de verdad)
│   ├── portal.js            Dibuja las tarjetas recorriendo el registro
│   └── portal.css           Estilos propios de la portada
│
├── assets/                  Identidad visual COMPARTIDA por todo el sitio
│   ├── shared.css           Paleta, encabezado, botones, píldoras, pie
│   └── logos/               Logos institucionales
│       ├── logo-alcaldia.png
│       ├── logo-icesi.png
│       └── logo-cienfi.png
│
├── modules/                 UN MÓDULO = UNA CARPETA
│   ├── edan/                Aplicativo EDAN completo (operativo)
│   ├── copernicus/          Observación satelital (próximamente)
│   ├── seguimiento/         Registro y seguimiento (próximamente)
│   └── _plantilla/          Punto de partida para módulos nuevos
│
├── servir.bat               Levanta el portal (doble clic)
├── tools/servir.ps1         El servidor estático
│
└── README/                  Documentación del portal
```

## Cómo funciona la portada

```
index.html
   ├── carga portal/modulos.js   →  define window.PORTAL_MODULOS = [ … ]
   └── carga portal/portal.js    →  recorre ese array y dibuja una tarjeta por módulo
```

`index.html` **no contiene ninguna tarjeta escrita a mano**: tiene un contenedor
vacío (`#lista-modulos`) que se llena en tiempo de ejecución. Por eso agregar un
módulo no obliga a editar el HTML.

Cada entrada del registro declara:

```js
{
  id: 'copernicus',                        // = nombre de la carpeta en modules/
  nombre: 'Información satelital — Copernicus',
  resumen: 'Descripción corta para la tarjeta…',
  icono: '🛰️',
  ruta: 'modules/copernicus/index.html',   // punto de entrada
  estado: 'preliminar',                    // operativo | preliminar | preparacion
  etiquetaEstado: 'Módulo preliminar',
  detalles: ['…', '…'],                    // viñetas de la tarjeta
  textoBoton: 'Ingresar al módulo'
}
```

El campo `estado` no es decorativo: colorea la franja superior de la tarjeta y
la píldora, de modo que se distinga de un vistazo lo que está en operación de lo
que todavía es demostrativo.

## Cómo se agrega un módulo nuevo

Tres pasos, sin tocar el portal:

1. **Copiar la plantilla:**
   `modules/_plantilla/` → `modules/<id-del-modulo>/`
2. **Escribir el módulo** dentro de esa carpeta. Puede ser una página estática o
   un aplicativo completo con sus propios scripts, como EDAN.
3. **Registrarlo:** agregar una entrada al array de `portal/modulos.js`.

No hay que modificar `index.html`, ni `portal.js`, ni ninguna hoja de estilo, ni
los demás módulos.

## Reglas de un módulo

| Regla | Por qué |
|---|---|
| Su punto de entrada es `modules/<id>/index.html` | Es lo que el registro apunta |
| Enlaza `../../assets/shared.css` | Hereda la identidad visual sin escribir CSS |
| Incluye un enlace visible a `../../index.html` | El usuario nunca queda atrapado dentro de un módulo |
| Sus rutas internas son relativas a su propia carpeta | El módulo se puede mover o servir aparte |
| No escribe fuera de su carpeta | Los módulos no se pisan entre sí |
| Trae su propio `README.md` | Cada módulo se explica solo |

Un módulo **puede** traer sus propios `assets/`, sus propias librerías y su
propio CSS completo. El módulo EDAN es el caso extremo: trae su hoja de estilos
íntegra, su copia de Leaflet y sus nueve archivos JavaScript, y no usa
`shared.css` para nada salvo el enlace de regreso.

### Cuando un módulo necesita datos de otro

Los módulos son independientes, pero un módulo futuro **podría leer** lo que
otro produce: los archivos del EDAN que solo declaran datos —`config.js`, los
dos esquemas de formulario y `storage.js`— se pueden cargar desde otra página
del mismo origen para consultar las encuestas guardadas.

```html
<script src="../edan/js/storage.js"></script>   <!-- window.Almacen -->
```

Dos condiciones para que eso no se vuelva frágil:

- **Cargar solo archivos que declaren datos**, nunca el que arranca el
  aplicativo (`js/app.js` en el caso del EDAN).
- **Leer, no escribir.** El módulo dueño de los datos sigue siendo el único que
  los modifica.

Hoy ningún módulo lo hace: el EDAN es el único que maneja datos.

## Identidad visual

El portal usa el sistema de diseño del mockup: azul `#395CE0`, tipografías Plus
Jakarta Sans e IBM Plex Mono, definido en `portal/portal.css`.

`assets/shared.css` define una paleta y unos componentes comunes para los
módulos que quieran heredarlos, con el azul del aplicativo EDAN (`#5454E9`).
Los dos son azules institucionales sobre fondo claro; ver la nota sobre por qué
no se unificaron en [06_integracion.md](06_integracion.md), sección 2.

Componentes disponibles al enlazar esa hoja:

| Clase | Qué es |
|---|---|
| `.barra-institucional`, `.barra-marca`, `.barra-logos`, `.barra-acciones` | Encabezado con logos y acciones |
| `.contenido` | Contenedor central con ancho máximo |
| `.panel`, `.panel-hero`, `.panel-header` | Tarjetas de contenido |
| `.btn`, `.btn-primario`, `.btn-secundario`, `.btn-primario-linea`, `.btn-bloque` | Botones (funcionan en `<button>` y en `<a>`) |
| `.pill`, `.pill-ok`, `.pill-atencion`, `.pill-suave` | Píldoras de estado |
| `.aviso`, `.aviso-info` | Recuadros de advertencia |
| `.lista-marcada` | Listas con viñeta circular |
| `.pie`, `.pie-logos` | Pie de página |
| `.eyebrow`, `.subtitle`, `.hint` | Jerarquía tipográfica |

## Navegación

```
index.html  ──►  modules/<id>/index.html  ──►  ../../index.html
   portal            módulo                      regreso al portal
```

Todo por enlaces relativos: no hay enrutador ni estado de navegación
compartido. El regreso al portal está siempre visible en el encabezado de cada
módulo y repetido en el pie.

## Responsive

Todas las páginas se adaptan a computador, tableta y celular. Puntos de quiebre
del portal: **820 px** y **620 px**. Reglas heredadas del EDAN que se
mantuvieron:

- Los controles de escritura nunca bajan de 16 px (por debajo, Safari en iPhone
  hace zoom automático al enfocar un campo).
- Ninguna área de toque baja de 44 px.
- Nunca se desactiva el zoom del usuario.
- La página nunca desplaza en horizontal.
