/* ============================================================
   SICMON · Configuración
   ------------------------------------------------------------
   DESTINOS DE LOS TRES ACCESOS
   Escribe aquí la URL de cada aplicativo cuando esté disponible.
   Mientras el valor sea "" (cadena vacía), el botón correspondiente
   se muestra inactivo y no enlaza a ninguna parte.
   Ejemplo: url: "https://dominio-del-aplicativo.gov.co/"
   ============================================================ */

window.CONFIG = {
  accesos: {
    // 01 · Captura de información
    // Abre el aplicativo de captura: tras el ingreso se presentan los tres
    // registros (edificaciones, afectaciones, personas y familias).
    // Misma pestaña: los enlaces «Volver al portal principal» del aplicativo
    // regresan a esta página.
    registro: {
      url: "modules/edan/index.html",
      nuevaPestana: false
    },
    // 02 · Consulta de información
    // Consulta ciudadana por cédula + acceso administrativo a las tres bases.
    // Los datos (modules/consulta/js/datos.js) los regenera el pipeline de
    // consolidacion/ en cada corrida.
    consulta: {
      url: "modules/consulta/index.html",
      nuevaPestana: false
    },
    // 03 · Visualización de información
    // Tablero de indicadores de la operación de registro. Sus datos
    // (modules/tablero/js/datos_tablero.js) también los regenera el pipeline
    // de consolidacion/, leyendo la misma base oficial.
    tableros: {
      url: "modules/tablero/index.html",
      nuevaPestana: false
    }
  },

  /* Texto del atributo title cuando un destino aún no está configurado. */
  textoPendiente: "Acceso en preparación"
};
