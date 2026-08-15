/* ============================================================================
   config-consulta.js — De dónde saca los datos el aplicativo de consulta.

   ANTES: el pipeline escribía js/datos.js dentro del repositorio y esta página
   lo leía como archivo estático. Eso ponía cédulas, direcciones y estado de
   salud en un repositorio público, y obligaba a hacer un commit para que el
   sitio publicado se actualizara. Como nadie hace un commit cada diez minutos,
   la consulta vivía desactualizada.

   AHORA: los datos se quedan en la hoja de Google y esta página los pide por
   fetch al Apps Script. El repositorio no lleva ni un registro personal y la
   actualización no depende de git.

   SOBRE EL TOKEN DE ABAJO, CON FRANQUEZA
   No es un secreto y no puede serlo: viaja al navegador de cualquiera que abra
   esta página. Sirve para que la dirección del receptor no quede abierta a
   todo internet, no para proteger datos.

   Lo que SÍ protege los datos son las otras dos puertas del Apps Script:
     · La consulta ciudadana devuelve UN registro, el de la cédula exacta que
       se preguntó. Nunca una lista.
     · Las tablas completas exigen TOKEN_LECTURA, que es la contraseña que el
       funcionario teclea al entrar y que NO está escrita en ningún archivo de
       este sitio. Se cambia en las Propiedades del script de Google.
   ========================================================================== */

(function () {
  'use strict';

  window.CONFIG_CONSULTA = {

    // Dirección de la implementación del Apps Script. Termina en /exec
    // Es la MISMA que usa la aplicación de campo (../edan/js/config-sync.js).
    // Si algún día se publica una implementación nueva, hay que cambiarla en
    // los dos archivos y en URL_HOJA de consolidacion/config/parameters.R.
    url: 'https://script.google.com/macros/s/AKfycbwHuGE5olZBzOskJoQh0bBo0YqcVSvEiIA0Vhbw1UrW_2bFJqEruqgAUsJG8patB5etxA/exec',

    // La misma cadena que está en la propiedad TOKEN del script de Google.
    token: 'sismo_2026_01234567891011121314',

    // Cuánto se espera una respuesta antes de darla por fallida (milisegundos).
    // Una tabla grande puede tardar: el script lee la hoja entera para armarla.
    tiempoLimite: 60000,

    // Filas por página al traer las tablas completas del equipo. Debe ser
    // <= FILAS_POR_PAGINA_MAX del Apps Script (2000).
    filasPorPagina: 2000
  };
})();
