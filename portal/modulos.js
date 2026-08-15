/* ============================================================================
   modulos.js — REGISTRO DE MÓDULOS Y CONFIGURACIÓN DEL PORTAL.

   Este archivo es la ÚNICA fuente de verdad sobre qué contiene el portal.
   Ninguna tarjeta está escrita a mano en el HTML: todas se dibujan recorriendo
   estas listas.

   ESTRUCTURA DEL PORTAL
   ---------------------
   Inicio
     ├── Registro de información   → tres formularios (lista `registro`)
     ├── Consulta de información   → búsqueda por persona (en preparación)
     └── Tablero de control        → indicadores (en preparación)

   PARA AGREGAR UN FORMULARIO NUEVO:
     1. Cree la carpeta  modules/<id>/  con su propio index.html
        (puede partir de modules/_plantilla/index.html).
     2. Agregue una entrada al arreglo `registro`.
     3. Listo. No hay que tocar index.html, portal.js ni las hojas de estilo.
   ========================================================================== */
(function () {
  'use strict';

  window.CONFIG = {

    /* ======================================================================
       MÓDULOS DE REGISTRO
       Son los tres procesos que aparecen dentro de «Registro de información».

       estado: 'disponible'   → operativo, se puede diligenciar
               'preparacion'  → la entrada existe, el formulario aún no

       url: ruta relativa a la raíz del portal.

       Dos de ellos —edificaciones (formato VOL-10) y familia (VOL-3 EDAN)—
       abren el mismo aplicativo de captura, porque comparten toda la base
       técnica: almacenamiento local, cola de envío a la hoja de CIENFI,
       exportación y panel de coordinación. Al entrar se elige allí cuál de
       los dos se va a diligenciar. Ver modules/edan/js/app.js.

       El de afectaciones —la visita oficial posterior— también vive en el
       aplicativo de captura (agregado el 2026-08-15, a partir del formulario
       de Google de la Alcaldía). Los tres se eligen allí tras el ingreso.
       ====================================================================== */
    registro: [
      {
        id: 'edificaciones',
        nombre: 'Registro de edificaciones',
        descripcion: 'Inspección y evaluación de la vivienda o edificación.',
        estado: 'disponible',
        url: 'modules/edan/index.html',
        icono: 'edificacion'
      },
      {
        id: 'afectaciones',
        nombre: 'Registro de afectaciones',
        descripcion: 'Visita oficial que confirma la edificación y caracteriza la afectación, con soportes fotográficos.',
        estado: 'disponible',
        url: 'modules/edan/index.html',
        icono: 'informacion'
      },
      {
        id: 'familia',
        nombre: 'Registro de personas y familias',
        descripcion: 'Información de las personas que integran el hogar.',
        estado: 'disponible',
        url: 'modules/edan/index.html',
        icono: 'familia'
      }
    ],

    /* ======================================================================
       MÓDULOS RETIRADOS DE LA NAVEGACIÓN
       No se muestran al usuario, pero su código sigue en el proyecto y sus
       carpetas quedan intactas. Para volver a publicarlos basta con moverlos
       al arreglo de arriba: no hay nada más que reconstruir.
       ====================================================================== */
    archivados: [
      {
        id: 'copernicus',
        nombre: 'Observación satelital',
        url: 'modules/copernicus/index.html',
        motivo: 'Fuera del alcance de esta primera versión.'
      },
      {
        id: 'seguimiento',
        nombre: 'Registro y seguimiento de atención',
        url: 'modules/seguimiento/index.html',
        motivo: 'Fuera del alcance de esta primera versión.'
      }
    ],

    /* ======================================================================
       TABLERO DE CONTROL
       Vive en modules/tablero/ como un módulo más del portal.

       Sus indicadores NO se calculan aquí ni en el navegador: el pipeline de
       consolidación (consolidacion/) regenera modules/tablero/js/datos_tablero.js
       en cada corrida, leyendo la base oficial. Si ese archivo no existe
       —repositorio recién clonado, pipeline sin correr— el tablero abre
       vacío, no con datos inventados.

         modo 'iframe' → se embebe dentro del portal
         modo 'enlace' → se abre en otra pestaña
       ====================================================================== */
    tablero: {
      urlTablero: 'modules/tablero/index.html',
      modo: 'iframe',
      altura: 720
    },

    /* ---- Iconografía lineal (SVG en línea, trazo simple) ---- */
    iconos: {
      edificacion: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20V6.5L12 3l8 3.5V20"/><path d="M3 20h18"/><path d="M9 20v-5h6v5"/><path d="M8 10h2M14 10h2"/></svg>',
      informacion: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3.5"/></svg>',
      familia: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8.5" cy="8" r="2.6"/><circle cx="16" cy="9.5" r="2.1"/><path d="M3.5 19v-1.4A3.6 3.6 0 0 1 7 14h3a3.6 3.6 0 0 1 3.5 3.6V19"/><path d="M15 14h1.6A3.4 3.4 0 0 1 20 17.4V19"/></svg>',
      consulta: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l4.5 4.5"/></svg>',
      tablero: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19V11M9.3 19V5M14.7 19v-6M20 19V8"/></svg>'
    }
  };

  /* Compatibilidad con código y documentación previos, que se referían al
     registro de módulos como PORTAL_MODULOS. */
  window.PORTAL_MODULOS = window.CONFIG.registro;
})();
