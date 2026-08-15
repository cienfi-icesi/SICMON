/* ============================================================================
   portal.js — Lógica del portal.

   Navegación entre las cuatro vistas (Inicio, Registro, Consulta y
   Tablero), menú móvil y render de las tarjetas de cada vista.

   El portal no conoce ningún formulario: los tres módulos de registro salen
   de portal/modulos.js -> CONFIG.registro. Agregar uno no obliga a tocar
   este archivo.

   Sin dependencias: JavaScript estándar.

   El portal no conoce ningún módulo: todo sale de portal/modulos.js. Agregar
   un módulo nuevo no obliga a tocar este archivo.

   Se conservan renderMapa() y el contacto flotante aunque el HTML actual ya
   no los use: ambos comprueban que su elemento exista y no hacen nada si
   falta, de modo que volver a incorporarlos es solo cuestión de añadir el
   elemento al HTML.
   ========================================================================== */
(function () {
  'use strict';

  var VISTAS = ['inicio', 'registro', 'consulta', 'tablero'];
  var cfg = window.CONFIG;

  /* Las tres operaciones del inicio. Se declaran aquí y no en modulos.js
     porque no son módulos: son las secciones del propio portal. */
  var OPCIONES_INICIO = [
    {
      vista: 'registro',
      nombre: 'Registro de información',
      descripcion: 'Diligenciar los formularios de registro.',
      icono: 'informacion',
      estado: 'disponible'
    },
    {
      vista: 'consulta',
      nombre: 'Consulta de información',
      descripcion: 'Buscar una persona y ver sus registros.',
      icono: 'consulta',
      estado: 'preparacion'
    },
    {
      vista: 'tablero',
      nombre: 'Tablero de control',
      descripcion: 'Indicadores de seguimiento de la operación.',
      icono: 'tablero',
      estado: 'preparacion'
    }
  ];

  /* ---------------- Navegación ---------------- */
  function mostrarVista(vista, desplazar) {
    if (VISTAS.indexOf(vista) === -1) vista = 'inicio';

    VISTAS.forEach(function (v) {
      var seccion = document.getElementById('vista-' + v);
      if (seccion) seccion.classList.toggle('oculto', v !== vista);
    });

    document.querySelectorAll('[data-ir]').forEach(function (enlace) {
      if (enlace.classList.contains('nav__enlace')) {
        if (enlace.getAttribute('data-ir') === vista) {
          enlace.setAttribute('aria-current', 'page');
        } else {
          enlace.removeAttribute('aria-current');
        }
      }
    });

    cerrarMenu();
    if (desplazar !== false) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function vistaDesdeHash() {
    return (window.location.hash || '').replace('#', '');
  }

  function cerrarMenu() {
    var menu = document.getElementById('nav-movil');
    var boton = document.getElementById('menu-boton');
    if (menu) menu.classList.remove('abierto');
    if (boton) boton.setAttribute('aria-expanded', 'false');
  }

  function iniciarNavegacion() {
    document.addEventListener('click', function (ev) {
      var enlace = ev.target.closest('[data-ir]');
      if (!enlace) return;
      ev.preventDefault();
      var vista = enlace.getAttribute('data-ir');
      if (history.replaceState) history.replaceState(null, '', '#' + vista);
      else window.location.hash = vista;
      mostrarVista(vista);
    });

    var boton = document.getElementById('menu-boton');
    if (boton) {
      boton.addEventListener('click', function () {
        var menu = document.getElementById('nav-movil');
        var abierto = menu.classList.toggle('abierto');
        boton.setAttribute('aria-expanded', abierto ? 'true' : 'false');
      });
    }

    window.addEventListener('hashchange', function () {
      mostrarVista(vistaDesdeHash());
    });

    mostrarVista(vistaDesdeHash(), false);
  }

  /* ---------------- Tarjetas de opción ----------------
     Se usan tanto en el inicio (tres operaciones) como dentro de «Registro de
     información» (tres formularios). Toda la tarjeta es un enlace: entrar
     cuesta un solo clic, en cualquier punto de ella. */

  var ESTADOS = {
    disponible:  { etiqueta: '',                clase: '' },
    preparacion: { etiqueta: 'En preparación',  clase: 'insignia--proximamente' }
  };

  /**
   * Dibuja una tarjeta. `destino` puede ser:
   *   { vista: 'registro' }  → navega dentro del portal
   *   { url: 'modules/...' } → abre un módulo
   */
  function tarjetaOpcion(op) {
    var est = ESTADOS[op.estado] || ESTADOS.disponible;
    var interno = !!op.vista;
    var href = interno ? '#' + op.vista : (op.url || '#');
    var attrIr = interno ? ' data-ir="' + esc(op.vista) + '"' : '';
    var insignia = est.etiqueta
      ? '<span class="insignia ' + est.clase + '">' + est.etiqueta + '</span>'
      : '';

    return '' +
      '<a class="opcion' + (op.estado === 'preparacion' ? ' opcion--preparacion' : '') + '" ' +
         'href="' + esc(href) + '"' + attrIr + '>' +
        '<span class="opcion__icono" aria-hidden="true">' + (cfg.iconos[op.icono] || '') + '</span>' +
        '<span class="opcion__cuerpo">' +
          '<span class="opcion__tope">' +
            '<span class="opcion__nombre">' + esc(op.nombre) + '</span>' +
            insignia +
          '</span>' +
          '<span class="opcion__texto">' + esc(op.descripcion) + '</span>' +
        '</span>' +
        '<span class="opcion__flecha" aria-hidden="true">&rarr;</span>' +
      '</a>';
  }

  function renderInicio() {
    var cont = document.getElementById('opciones-inicio');
    if (!cont) return;
    cont.innerHTML = OPCIONES_INICIO.map(tarjetaOpcion).join('');
  }

  function renderRegistro() {
    var cont = document.getElementById('opciones-registro');
    if (!cont) return;
    cont.innerHTML = (cfg.registro || []).map(tarjetaOpcion).join('');
  }

  /* ---------------- Tablero de control ----------------
     Mientras CONFIG.tablero.urlTablero sea null se muestra el espacio
     preparado. Al escribir una dirección, el tablero se embebe o se enlaza. */
  function renderTablero() {
    var lienzo = document.getElementById('tablero-lienzo');
    if (!lienzo) return;
    var t = cfg.tablero || {};

    /* No se calcula ni se simula ningún indicador: la sección existe, vacía
       y honesta, hasta que haya un tablero real que conectar. */
    if (!t.urlTablero) {
      lienzo.innerHTML = '<div class="preparacion">' +
        '<h2 class="preparacion__titulo">Módulo en preparación</h2>' +
        '<p class="preparacion__texto">Los indicadores de seguimiento de la operación ' +
        'de registro se incorporarán en este espacio.</p>' +
        '</div>';
      return;
    }

    if (t.modo === 'iframe') {
      lienzo.style.padding = '0';
      lienzo.style.background = 'none';
      lienzo.style.minHeight = t.altura + 'px';
      lienzo.innerHTML = '<iframe class="tablero__marco" src="' + esc(t.urlTablero) +
        '" style="height:' + t.altura + 'px" title="Tablero de análisis" loading="lazy"></iframe>';
      return;
    }

    lienzo.innerHTML = '<div class="tablero__vacio">' +
      '<h3>Tablero de análisis</h3>' +
      '<p>Este espacio integrará las herramientas de visualización y análisis construidas ' +
      'a partir de la información consolidada.</p>' +
      '<p style="margin-top:22px"><a class="boton boton--primario" href="' + esc(t.urlTablero) +
      '" target="_blank" rel="noopener">Abrir tablero <span aria-hidden="true">&rarr;</span></a></p>' +
      '</div>';
  }

  /* ---------------- Mapa de referencia territorial ----------------
     Proyección Mercator mínima calculada sobre geometría real de
     OpenStreetMap (portal/cali-geo.js). No se dibuja ningún dato de
     afectaciones: es únicamente contexto geográfico.               */
  function renderMapa() {
    var svg = document.getElementById('mapa-cali');
    var geo = window.CALI_GEO;
    if (!svg || !geo) return;

    // Solo el área urbana: comunas 1 a 22 (se omite el perímetro municipal,
    // que incluye la zona rural y corregimientos).
    var urbanas = geo.features.filter(function (f) { return f.properties.tipo === 'comuna'; });
    if (!urbanas.length) return;

    var W = 620, H = 560, P = 18;
    // Mercator: se devuelve en grados equivalentes para que X e Y compartan unidad
    var mercY = function (lat) {
      return Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2)) * 180 / Math.PI;
    };

    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    urbanas.forEach(function (f) {
      f.geometry.coordinates.forEach(function (anillo) {
        anillo.forEach(function (p) {
          var y = mercY(p[1]);
          if (p[0] < minX) minX = p[0];
          if (p[0] > maxX) maxX = p[0];
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        });
      });
    });

    var escala = Math.min((W - 2 * P) / (maxX - minX), (H - 2 * P) / (maxY - minY));
    var dx = (W - (maxX - minX) * escala) / 2;
    var dy = (H - (maxY - minY) * escala) / 2;

    function proyectar(p) {
      return [
        (p[0] - minX) * escala + dx,
        H - ((mercY(p[1]) - minY) * escala + dy)
      ];
    }

    function trazo(anillos) {
      return anillos.map(function (anillo) {
        return anillo.map(function (p, i) {
          var q = proyectar(p);
          return (i === 0 ? 'M' : 'L') + q[0].toFixed(1) + ' ' + q[1].toFixed(1);
        }).join(' ') + ' Z';
      }).join(' ');
    }

    var comunas = urbanas.map(function (f) { return trazo(f.geometry.coordinates); }).join(' ');

    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.innerHTML = '' +
      // 1) trazo ancho: define el perímetro urbano
      '<path d="' + comunas + '" fill="#FFFFFF" stroke="#7E8085" stroke-width="7" stroke-linejoin="round"/>' +
      // 2) fondo blanco y divisiones internas finas
      '<path d="' + comunas + '" fill="#FFFFFF" stroke="#C4C7CE" stroke-width="1" stroke-linejoin="round"/>' +
      // 3) acento azul institucional, muy sutil
      '<path d="' + comunas + '" fill="none" stroke="#395CE0" stroke-width="1" stroke-opacity="0.28" stroke-linejoin="round"/>';
  }

  /* ---------------- Contacto flotante «Escríbenos» ---------------- */
  function iniciarContacto() {
    var boton = document.getElementById('contacto-boton');
    var panel = document.getElementById('contacto-panel');
    var cerrar = document.getElementById('contacto-cerrar');
    var enlace = document.getElementById('contacto-enlace');
    if (!boton || !panel) return;

    if (enlace && cfg.contacto) {
      enlace.href = 'mailto:' + cfg.contacto.correo +
        '?subject=' + encodeURIComponent(cfg.contacto.asunto) +
        '&body=' + encodeURIComponent(cfg.contacto.cuerpo);
    }

    function alternar(abrir) {
      panel.classList.toggle('abierto', abrir);
      boton.setAttribute('aria-expanded', abrir ? 'true' : 'false');
    }

    boton.addEventListener('click', function () {
      alternar(!panel.classList.contains('abierto'));
    });
    if (cerrar) cerrar.addEventListener('click', function () { alternar(false); });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') alternar(false);
    });
    document.addEventListener('click', function (ev) {
      if (!panel.classList.contains('abierto')) return;
      if (ev.target.closest('#contacto')) return;
      alternar(false);
    });
  }

  function esc(texto) {
    return String(texto === undefined || texto === null ? '' : texto)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ---------------- Arranque ---------------- */
  document.addEventListener('DOMContentLoaded', function () {
    renderInicio();
    renderRegistro();
    renderTablero();
    renderMapa();
    iniciarContacto();
    iniciarNavegacion();
  });
})();
