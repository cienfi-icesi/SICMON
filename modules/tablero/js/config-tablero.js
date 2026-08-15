/* ============================================================================
   config-tablero.js — De dónde saca los datos el tablero de control.

   ANTES: el pipeline escribía js/datos_tablero.js y el tablero lo leía como
   archivo estático. Para actualizar el sitio publicado había que hacer commit,
   y como nadie hace un commit cada diez minutos, el tablero vivía desfasado.
   Peor: ese archivo estuvo dentro del repositorio, que es público.

   AHORA: el volcado se queda en la hoja de Google —pestaña c_tablero, que
   escribe 06_publicar_hoja.R— y esta página lo pide por fetch. El repositorio
   no lleva ningún dato.

   POR QUÉ EL TABLERO PIDE CONTRASEÑA, SI ANTES NO PEDÍA
   Porque lo que muestra sí es dato personal, aunque no se vea a simple vista.
   El volcado trae, fila por fila, el estado de salud de cada persona, las
   coordenadas de cada vivienda y —en la tabla de duplicados— la dirección.
   No hay nombres ni cédulas, pero con coordenada y estado de salud se
   identifica a un hogar sin ningún esfuerzo.

   Mientras el archivo era estático y local, eso lo protegía el disco. Servido
   por internet no lo protege nada, así que entra por la MISMA puerta que la
   consulta del equipo: la acción consulta_completa del Apps Script, que exige
   TOKEN_LECTURA. La contraseña no está en este archivo ni en ningún otro del
   sitio; vive en las Propiedades del script de Google.

   SOBRE EL TOKEN DE ABAJO
   No es un secreto y no puede serlo: viaja al navegador de cualquiera que abra
   esta página. Solo evita que la dirección del receptor quede abierta a todo
   internet. Lo que protege los datos es la contraseña.
   ========================================================================== */

(function () {
  'use strict';

  window.CONFIG_TABLERO = {

    // Dirección de la implementación del Apps Script. Termina en /exec
    // Es la MISMA de la consulta (../consulta/js/config-consulta.js) y de la
    // aplicación de campo (../edan/js/config-sync.js). Si se publica una
    // implementación nueva hay que cambiarla en los TRES archivos y en
    // URL_HOJA de consolidacion/config/parameters.R.
    url: 'https://script.google.com/macros/s/AKfycbwwJQIDHiG0n2x8nbMvpxJsiqDvFGvRzqhMRkbkz29wFoDNgbFfdiIhkGzBBUEn4xCaeg/exec',

    // La misma cadena que está en la propiedad TOKEN del script de Google.
    token: 'sismo_2026_01234567891011121314',

    // Cuánto se espera una respuesta antes de darla por fallida (milisegundos).
    tiempoLimite: 60000,

    // Filas por página al traer c_tablero. Cada fila es un trozo de 40.000
    // caracteres del volcado; con 200 caben ocho millones de caracteres por
    // petición, de sobra. Debe ser <= FILAS_POR_PAGINA_MAX del Apps Script.
    filasPorPagina: 200,

    /* Quiénes pueden entrar. Aquí van los NOMBRES DE USUARIO, que no son
       secretos; la contraseña la valida Google, no este código. Es la misma
       lista y la misma contraseña que la consulta: quien puede ver la base
       puede ver el tablero. */
    usuarios: [
      { usuario: 'administrador', nombre: 'Administrador' }
    ]
  };
})();
