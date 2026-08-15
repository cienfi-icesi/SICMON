# 04 · Guía de desarrollo

## Cómo levantar el proyecto

**Doble clic en `servir.bat`** (en la raíz del proyecto). Se abre el portal en
el navegador.

No hay dependencias que instalar, ni compilación, ni `package.json`.

### Por qué hace falta un servidor

El portal es estático, pero **no se puede abrir con doble clic sobre
`index.html`** (`file://`): el módulo EDAN guarda las encuestas en el
almacenamiento local del navegador y varios navegadores lo bloquean en ese modo.
Hay que servirlo por HTTP.

### Por qué PowerShell y no Python

PowerShell viene de fábrica en todo Windows, así que cualquier persona del
equipo levanta el portal sin instalar nada ni configurar rutas propias de su
equipo. El proyecto anterior dependía de una ruta de Python fija
(`C:\Users\Angela\...\python.exe`) que no existía en los demás equipos, y por eso
no arrancaba.

`servir.bat` invoca `tools/servir.ps1` con `-ExecutionPolicy Bypass`, que aplica
**solo a esa ejecución**: no cambia ninguna configuración del equipo.

### Qué hace el servidor

| Comportamiento | Detalle |
|---|---|
| Puerto | 8801; si está ocupado prueba los siguientes, hasta 15 |
| Alcance | Solo `localhost`. Ejecutándolo **como administrador** escucha también en la red local y muestra la IP |
| Caché | Envía `Cache-Control: no-store`, así recargar siempre muestra el último cambio |
| Seguridad | No sirve archivos fuera de la carpeta del proyecto |
| Registro | Imprime cada petición con su código (200 / 404) |
| Detener | Ctrl+C o cerrar la ventana |

Opciones:

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File tools\servir.ps1 -Puerto 9000 -NoAbrirNavegador
```

### En macOS o Linux

El script es de Windows. En macOS y Linux, `python3` viene preinstalado:

```bash
python3 -m http.server 8801
```

### Sobre el acceso desde un celular

Servir en la red local sirve para revisar el diseño, pero **el botón «Usar mi
ubicación actual» del EDAN no funcionará** por `http://`: los navegadores solo
entregan la ubicación en páginas `https://` o en `localhost`. Para probar el GPS
en campo hay que publicar el sitio en un dominio con HTTPS.

## Dónde trabajar según lo que se necesite

| Necesito… | Trabajo en… |
|---|---|
| Agregar un módulo nuevo | `modules/<id-nuevo>/` + una entrada en `portal/modulos.js` |
| Cambiar el texto o el orden de una tarjeta del portal | `portal/modulos.js` |
| Cambiar el diseño de la portada | `portal/portal.css` |
| Cambiar cómo se dibujan las tarjetas | `portal/portal.js` |
| Cambiar la identidad visual de TODA la plataforma | `assets/shared.css` |
| Cambiar algo del aplicativo EDAN | `modules/edan/` (ver su propia documentación) |
| Cambiar el encabezado o el pie de un módulo | El `index.html` de ese módulo |

Regla práctica: **si el cambio afecta a un solo módulo, no debería salir de la
carpeta de ese módulo.**

## Agregar un módulo, paso a paso

**1. Copiar la plantilla**

```
modules/_plantilla/  →  modules/mi-modulo/
```

Trae `index.html` con el encabezado institucional, el enlace de regreso y el
pie ya montados, y un `modulo.css` vacío con la lista de variables disponibles.

**2. Registrarlo** en `portal/modulos.js`:

```js
{
  id: 'mi-modulo',
  nombre: 'Nombre visible del módulo',
  resumen: 'Una o dos líneas describiendo qué hace.',
  icono: '📊',
  ruta: 'modules/mi-modulo/index.html',
  estado: 'preparacion',
  etiquetaEstado: 'En preparación',
  detalles: ['Primer punto', 'Segundo punto'],
  textoBoton: 'Ingresar al módulo'
}
```

**3. Desarrollar** dentro de `modules/mi-modulo/`. A partir de ahí el módulo es
libre: puede ser una página, un formulario o un aplicativo completo con sus
propios scripts y librerías.

**4. Documentarlo** en `modules/mi-modulo/README.md`.

No hay que tocar `index.html`, `portal.js`, `shared.css` ni los otros módulos.

## Convenciones

| Aspecto | Convención |
|---|---|
| Idioma | Todo en español: interfaz, nombres de archivo, comentarios, identificadores |
| `id` de módulo | Minúsculas, sin tildes, sin espacios. Coincide con el nombre de la carpeta. Es estable: no se renombra ni se reutiliza |
| Punto de entrada | Siempre `index.html` en la raíz del módulo |
| Rutas dentro de un módulo | Relativas a su propia carpeta. Lo compartido se referencia como `../../assets/…` |
| Estilos | Lo institucional viene de `shared.css`; lo propio del módulo va en su `modulo.css` |
| Íconos | Emojis. La plataforma no usa librerías de iconos |
| JavaScript | Plano, en una IIFE con `'use strict'`, sin dependencias externas salvo que el módulo las traiga consigo |
| Comentarios | Explican **por qué**, no qué hace la línea |

## Reglas que no se deben romper

Vienen del aplicativo EDAN y aplican a toda la plataforma, porque se usa en
campo desde celulares:

- Los controles de escritura nunca bajan de **16 px** de tipografía: por debajo,
  Safari en iPhone hace zoom automático al enfocar un campo.
- Ninguna área de toque baja de **44 px** de alto.
- **Nunca** se desactiva el zoom del usuario.
- La página **nunca** desplaza en horizontal; los bloques anchos desplazan
  dentro de su propio contenedor.
- Todo módulo debe tener una vía de regreso al portal **visible**, también en
  celular.

## Antes de dar por terminado un módulo

- [ ] Se ve bien en 375 px, 768 px y 1280 px de ancho.
- [ ] No hay desplazamiento horizontal en ningún ancho.
- [ ] El enlace de regreso al portal funciona y se ve.
- [ ] Los logos institucionales cargan (rutas `../../assets/logos/…`).
- [ ] La consola del navegador no muestra errores.
- [ ] Está registrado en `portal/modulos.js` con el `estado` correcto.
- [ ] Tiene su `README.md`.

## Datos y privacidad

El módulo EDAN guarda información personal (nombres, cédulas, teléfonos,
direcciones y coordenadas de familias afectadas) en el navegador de cada equipo.

- Los datos recolectados y los archivos exportados **no se suben al
  repositorio**: `.gitignore` excluye los `*.csv` y los
  `respaldo_encuestas_*.json`.
- Cualquier módulo nuevo que maneje datos personales debe seguir el mismo
  criterio.
