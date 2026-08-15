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
    /* Diligenciadores en campo — UNA LÍNEA POR PERSONA.

       El nombre de usuario es «nombre-apellido», sin tildes y en minúsculas
       (claudia-rincon), y lo arma solo el ayudante diligenciador() a partir
       del nombre completo. Al entrar da igual cómo se escriba: «Claudia
       Rincón», «claudia-rincon», «CLAUDIA RINCON» o «ClaudiaRincon» son la
       misma cuenta (ver normalizar()).

       `datos` son los del profesional que realiza la inspección: la
       aplicación los escribe sola en cada encuesta nueva (campos marcados con
       `autoUsuario` en los formularios); quedan editables.

       Opciones del tercer parámetro:
         password    contraseña; si no se indica, es la cédula
         correo, organismo   se prellenan en el registro de afectaciones
         alias       otras formas de escribir el usuario que también entran
         anteriores  nombres de usuario que la persona usó ANTES: las
                     encuestas grabadas con ellos siguen siendo suyas
                     («Mis encuestas», recuperación entre equipos, panel).
       Para agregar a alguien: copiar una línea, cambiar nombre y cédula, y
       publicar de nuevo. */
    diligenciador('Claudia Rincón', '66920212', { alias: ['claudia'], anteriores: ['claudia'] }),
    diligenciador('Daniel Giraldo', '1144096855', { alias: ['daniel'], anteriores: ['daniel'] })
  ];

  /** Arma la ficha de un diligenciador a partir de su nombre completo. */
  function diligenciador(nombreCompleto, cedula, extra) {
    extra = extra || {};
    var usuario = String(nombreCompleto || '').trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');
    return {
      usuario: usuario,
      alias: extra.alias || [],
      anteriores: extra.anteriores || [],
      nombre: nombreCompleto,
      rol: 'diligenciador',
      password: extra.password || String(cedula),
      datos: {
        nombre: nombreCompleto,
        cedula: String(cedula),
        correo: extra.correo || '',
        organismo: extra.organismo || ''
      }
    };
  }

  /** Normaliza un nombre de usuario: minúsculas, sin tildes, sin espacios ni guiones. */
  function normalizar(texto) {
    return String(texto || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[\s_-]+/g, '');
  }

  /** Ficha del usuario al que corresponde un nombre (canónico, alias o anterior), o null. */
  function fichaDe(nombre) {
    var buscado = normalizar(nombre);
    if (!buscado) return null;
    var hallado = null;
    USUARIOS.forEach(function (u) {
      if (hallado) return;
      var nombres = [u.usuario].concat(u.alias || [], u.anteriores || []).map(normalizar);
      if (nombres.indexOf(buscado) !== -1) hallado = u;
    });
    return hallado;
  }

  /** Nombre de usuario canónico de cualquier forma conocida (o el mismo texto si no se conoce). */
  function canonicoDe(nombre) {
    var f = fichaDe(nombre);
    return f ? f.usuario : String(nombre || '');
  }

  /** Todos los nombres con los que ese usuario pudo haber grabado encuestas: canónico + anteriores. */
  function equivalentesDe(nombre) {
    var f = fichaDe(nombre);
    return f ? [f.usuario].concat(f.anteriores || []) : [String(nombre || '')];
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
      var nombres = [u.usuario].concat(u.alias || [], u.anteriores || []).map(normalizar);
      if (nombres.indexOf(buscado) !== -1) encontrado = u;
    });

    if (!encontrado) return null;
    if (String(password) !== String(encontrado.password)) return null;

    return {
      usuario: encontrado.usuario,
      // Nombres con los que esta persona pudo haber grabado encuestas antes.
      equivalentes: [encontrado.usuario].concat(encontrado.anteriores || []),
      nombre: encontrado.nombre,
      rol: encontrado.rol,
      // Datos del profesional, para prellenar el formulario. Los perfiles de
      // coordinación no los tienen: no diligencian en campo.
      datos: encontrado.datos || null
    };
  }

  window.APP_CONFIG = {
    /* Equivalencias de nombres de usuario (para que las encuestas grabadas
       con un nombre anterior sigan siendo de la misma persona). */
    canonicoDe: canonicoDe,
    equivalentesDe: equivalentesDe,
    /* Versión de la aplicación. Se muestra en el pie de página y sirve para
       saber, sin adivinar, si un equipo quedó trabajando con una copia vieja
       guardada en el caché del navegador: se le pide a la persona que mire el
       pie y diga qué número ve.

       AL PUBLICAR UNA VERSIÓN NUEVA HAY QUE SUBIR ESTE NÚMERO Y TAMBIÉN EL
       "?v=" de los <script> y <link> de index.html. Los dos deben coincidir;
       si no, la aplicación lo avisa sola en la consola al arrancar. */
    appVersion: '2.3.0',
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
