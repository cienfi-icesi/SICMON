/* ============================================================================
   config-sync.js — Conexión con la hoja de cálculo de CIENFI.

   AQUÍ SOLO VAN DOS DATOS, Y NINGUNO ES UNA CREDENCIAL DE GOOGLE.

   La contraseña de la cuenta de CIENFI, sus permisos y el acceso al Drive
   NUNCA pasan por aquí ni por el repositorio. El programa que escribe en la
   hoja vive dentro de la cuenta de Google (Apps Script) y se ejecuta con la
   identidad de CIENFI; esta aplicación solo le manda los datos a una
   dirección.

   SOBRE EL TOKEN, CON FRANQUEZA
   -----------------------------
   Este archivo se descarga al navegador de quien abra la aplicación, así que
   el token se puede leer viendo el código fuente. NO es un secreto: sirve
   para que un envío accidental o un robot no escriba en la hoja, no para
   detener a alguien decidido.

   Lo que sí lo acota:
     · La dirección solo permite ESCRIBIR. No existe forma de leer encuestas
       desde afuera.
     · Los envíos son idempotentes por id_encuesta: nadie puede duplicar filas.
     · Todo queda registrado en la pestaña _bitacora de la hoja.
     · Si alguna vez se filtra, se cambia el token en dos lugares (aquí y en
       las Propiedades del script) y las escrituras viejas dejan de funcionar.

   SI ESTOS CAMPOS QUEDAN VACÍOS la aplicación funciona igual que siempre:
   guarda en el equipo y permite descargar CSV. Solo no envía a la hoja.
   ========================================================================== */
(function () {
  'use strict';

  window.CONFIG_SYNC = {

    // Dirección de la implementación del Apps Script. Termina en /exec
    // Si algún día se crea una implementación nueva, se cambia aquí.
    url: 'https://script.google.com/macros/s/AKfycbwHuGE5olZBzOskJoQh0bBo0YqcVSvEiIA0Vhbw1UrW_2bFJqEruqgAUsJG8patB5etxA/exec',

    // La misma cadena que está en la propiedad TOKEN del script de Google.
    // Si se cambia aquí, hay que cambiarla también allá, y al revés.
    token: 'sismo_2026_01234567891011121314',

    /* Token ADICIONAL para las consultas que devuelven datos (avance central
       y recuperación de encuestas). Solo hace falta si en el script de
       Google se crea la propiedad TOKEN_LECTURA; en ese caso, escribir aquí
       la misma cadena EN CADA EQUIPO y NO subir este valor a GitLab: es la
       diferencia entre que cualquiera con la URL pueda leer los datos o
       solo los equipos de la operación. Vacío = consultas con el token
       general (adecuado mientras el sitio no sea público). */
    tokenLectura: '',

    // Nombre de la hoja, solo para mostrarlo en pantalla.
    nombreDestino: 'Google Drive de CIENFI — registro_afectados',

    // Cada cuánto reintenta si hay encuestas pendientes (milisegundos).
    intervaloReintento: 90000,

    // Cuánto espera una respuesta antes de darla por fallida (milisegundos).
    // El script espera hasta 45 s por el turno de escritura, así que este
    // valor debe ser mayor.
    tiempoLimite: 60000
  };
})();
