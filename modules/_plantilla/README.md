# Plantilla de módulo

**Esta carpeta no es un módulo:** es el punto de partida para crear uno. No está
registrada en `portal/modulos.js` y no aparece en el portal.

## Cómo usarla

**1. Copiar la carpeta**

```
modules/_plantilla/  →  modules/mi-modulo/
```

**2. Editar `index.html`**

- Cambiar el `<title>`.
- Cambiar el `<h1>` del encabezado y la píldora de estado.
- Escribir el contenido dentro de `<main class="contenido">`.
- **No quitar** el enlace `← Portal principal` ni el del pie.

**3. Registrar el módulo** en `portal/modulos.js`:

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

**4. Reemplazar este README** por el del módulo.

## Qué trae la plantilla

| Archivo | Contenido |
|---|---|
| `index.html` | Encabezado institucional con logos, enlace de regreso, contenido de ejemplo y pie |
| `modulo.css` | Vacío, con la lista de variables CSS disponibles |

La identidad visual completa (paleta, botones, píldoras, paneles, pie,
responsive) viene de `../../assets/shared.css`, que la plantilla ya enlaza.

## A partir de ahí, el módulo es libre

Puede ser una página estática, un formulario, un tablero o un aplicativo
completo con sus propios scripts y librerías. El módulo EDAN es el ejemplo del
extremo grande: trae su propia hoja de estilos, su copia de Leaflet y nueve
archivos JavaScript.

Lo único que la plataforma exige está en `README/01_architecture.md`, sección
«Reglas de un módulo».
