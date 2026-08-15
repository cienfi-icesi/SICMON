/* ============================================================================
   config.js — Configuración institucional, roles y usuarios.

   VERSIÓN PRELIMINAR (MVP). La autenticación de esta versión es local y las
   contraseñas están en texto plano dentro de este archivo, por lo que la
   aplicación NO debe publicarse en internet tal como está.

   Para migrar a una autenticación real más adelante basta con reemplazar la
   función APP_CONFIG.autenticar() por una llamada al servicio de identidad;
   el resto de la aplicación solo usa el objeto de sesión que ella devuelve y
   no conoce nada sobre contraseñas.
   ========================================================================== */
(function () {
  'use strict';

  // --- Roles -----------------------------------------------------------------
  // diligenciador : realiza encuestas.
  // coordinador   : panel de seguimiento y descargas.
  // admin         : lo mismo que coordinador.
  //
  // Los perfiles de coordinación ven la operación completa. Antes se separaban
  // por Secretaría; al retirarse esa figura, no queda criterio por el cual
  // limitar a uno frente a otro.
  var ROLES = {
    diligenciador: {
      etiqueta: 'Diligenciador',
      descripcion: 'Realiza encuestas en campo',
      puedeDiligenciar: true,
      puedeConsultar: false,
      alcance: 'propio'
    },
    coordinador: {
      etiqueta: 'Coordinador',
      descripcion: 'Seguimiento y descarga de la información',
      puedeDiligenciar: false,
      puedeConsultar: true,
      alcance: 'todas'
    },
    admin: {
      etiqueta: 'Coordinación general',
      descripcion: 'Seguimiento y descarga de la información',
      puedeDiligenciar: false,
      puedeConsultar: true,
      alcance: 'todas'
    }
  };

  // --- Usuarios habilitados --------------------------------------------------
  // "alias" permite escribir el usuario de varias formas (con o sin espacio).
  // La comparación se hace sin tildes, sin espacios y sin distinguir mayúsculas.
  var USUARIOS = [
    /* Coordinación del proyecto: una sola cuenta administradora. Reemplaza a
       las tres cuentas "Eduard" de la etapa de pruebas, que tras retirarse
       la Secretaría eran idénticas entre sí. */
    {
      usuario: 'administrador',
      alias: ['admin', 'administradora'],
      nombre: 'Administrador',
      rol: 'admin',
      password: '123456789'
    },
    /* Diligenciadores en campo.
       `datos` son los del profesional que realiza la inspección: la
       aplicación los escribe sola en cada encuesta nueva, para que no haya
       que teclear el nombre y la cédula una y otra vez. Quedan editables por
       si alguien diligencia en nombre de otra persona. Los campos que se
       rellenan son los marcados con `autoUsuario` en los esquemas de los
       formularios (js/form-vivienda.js y js/form-personas.js). */
    {
      usuario: 'claudia',
      alias: ['claudia rincon', 'claudiarincon'],
      nombre: 'Claudia Rincón',
      rol: 'diligenciador',
      password: '66920212',
      datos: {
        nombre: 'Claudia Rincón',
        cedula: '66920212',
        // Los usa el registro de afectaciones. Se completan cuando el
        // equipo confirme el correo y el organismo de cada persona.
        correo: '',
        organismo: ''
      }
    },
    {
      usuario: 'daniel',
      alias: ['daniel giraldo', 'danielgiraldo'],
      nombre: 'Daniel Giraldo',
      rol: 'diligenciador',
      password: '1144096855',
      datos: {
        nombre: 'Daniel Giraldo',
        cedula: '1144096855',
        // Los usa el registro de afectaciones. Se completan cuando el
        // equipo confirme el correo y el organismo de cada persona.
        correo: '',
        organismo: ''
      }
    }
  ];

  /** Normaliza un nombre de usuario: minúsculas, sin tildes y sin espacios. */
  function normalizar(texto) {
    return String(texto || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '');
  }

  /**
   * Punto único de autenticación.
   * Devuelve el usuario (sin la contraseña) o null si las credenciales fallan.
   * Al migrar a autenticación real, este es el único cuerpo que cambia.
   */
  function autenticar(usuario, password) {
    var buscado = normalizar(usuario);
    var encontrado = null;

    USUARIOS.forEach(function (u) {
      if (encontrado) return;
      var nombres = [u.usuario].concat(u.alias || []).map(normalizar);
      if (nombres.indexOf(buscado) !== -1) encontrado = u;
    });

    if (!encontrado) return null;
    if (String(password) !== String(encontrado.password)) return null;

    return {
      usuario: encontrado.usuario,
      nombre: encontrado.nombre,
      rol: encontrado.rol,
      // Datos del profesional, para prellenar el formulario. Los perfiles de
      // coordinación no los tienen: no diligencian en campo.
      datos: encontrado.datos || null
    };
  }

  window.APP_CONFIG = {
    /* Versión de la aplicación. Se muestra en el pie de página y sirve para
       saber, sin adivinar, si un equipo quedó trabajando con una copia vieja
       guardada en el caché del navegador: se le pide a la persona que mire el
       pie y diga qué número ve.

       AL PUBLICAR UNA VERSIÓN NUEVA HAY QUE SUBIR ESTE NÚMERO Y TAMBIÉN EL
       "?v=" de los <script> y <link> de index.html. Los dos deben coincidir;
       si no, la aplicación lo avisa sola en la consola al arrancar. */
    appVersion: '2.1.5',
    appNombre: 'Registro de información',
    appSubtitulo: 'Emergencia por sismo — Santiago de Cali',
    entidades: [
      { src: 'assets/logo-alcaldia.png', alt: 'Alcaldía de Santiago de Cali' },
      { src: 'assets/logo-icesi.png', alt: 'Universidad Icesi' },
      { src: 'assets/logo-cienfi.png', alt: 'CIENFI' }
    ],
    roles: ROLES,
    usuarios: USUARIOS,
    autenticar: autenticar,
    normalizar: normalizar
  };
})();
