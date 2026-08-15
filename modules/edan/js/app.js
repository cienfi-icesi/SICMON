/* ============================================================================
   app.js — Orquestación de la aplicación.

   Responsabilidades:
     · Inicio de sesión y control de acceso por rol.
     · Motor de render de formularios a partir de los esquemas declarativos
       (js/form-vivienda.js y js/form-personas.js).
     · Guardado automático en cada cambio.
     · Pantalla de finalización con continuidad hacia el otro formulario.
     · Panel de seguimiento y descargas para coordinadores.

   El motor de formularios no conoce ninguna pregunta: todo sale del esquema.
   Para cambiar una pregunta se edita el esquema, nunca este archivo.
   ========================================================================== */
(function () {
  'use strict';

  var CFG = window.APP_CONFIG;
  var FORMULARIOS = {
    vivienda: window.FORM_VIVIENDA,
    personas: window.FORM_PERSONAS
  };
  var TIPOS_SIN_DATO = ['subtitulo', 'nota', 'aviso'];

  /* ==========================================================================
     CÓMO SE ENTRA A ESTE APLICATIVO

     El portal abre  modules/edan/index.html  y, después del inicio de sesión,
     se elige el tipo de registro en pantalla (ver TIPOS_REGISTRO abajo).

     De la dirección solo se lee un parámetro:

       ?hogar=<código>   vincula la encuesta nueva a un hogar ya existente.

     No hay parámetro que preseleccione el formulario. Si más adelante se
     quisiera que cada tarjeta del portal entrara directo a su formulario,
     habría que leer aquí ese parámetro y saltarse la pantalla de selección;
     hoy no se hace, y por eso el portal no lo envía.
     ========================================================================== */
  /* ==========================================================================
     TIPOS DE REGISTRO

     Es lo que se ofrece en la primera pantalla después del inicio de sesión.
     Los tres conviven en este mismo aplicativo porque comparten toda la base
     técnica: sesión, almacenamiento local, cola de envío a la hoja de CIENFI,
     exportación y panel de coordinación.

     `formulario` es la clave dentro de FORMULARIOS. Si es null, el tipo existe
     en la pantalla pero todavía no tiene formulario: se anuncia como en
     preparación en vez de dejar una tarjeta muerta.

     QUÉ ES CADA UNO
       · Registro de edificaciones → formato VOL-10. Es la inspección de la
         vivienda o edificación y es el formulario que ya está construido.
       · Registro de afectaciones  → visita oficial posterior, que confirma la
         edificación. Todavía no tiene preguntas definidas, por eso va con
         formulario: null.
       · Registro de personas y familias → formato VOL-3 (EDAN).

     PARA CONECTAR EL REGISTRO DE AFECTACIONES cuando se definan sus preguntas:
       1. Escribir el esquema en js/form-afectaciones.js (puede copiarse la
          estructura de form-vivienda.js).
       2. Cargarlo en index.html y agregarlo a FORMULARIOS arriba.
       3. Poner aquí  formulario: 'afectaciones'.
     No hay que tocar nada más: hereda validación, guardado, envío y exportación.
     ========================================================================== */
  var TIPOS_REGISTRO = [
    {
      id: 'edificaciones',
      nombre: 'Registro de edificaciones',
      descripcion: 'Inspección y evaluación de la vivienda o edificación.',
      icono: '🏢',
      formulario: 'vivienda'
    },
    {
      id: 'afectaciones',
      nombre: 'Registro de afectaciones',
      descripcion: 'Visita oficial que confirma la edificación y las afectaciones reportadas.',
      icono: '📋',
      formulario: null
    },
    {
      id: 'personas',
      nombre: 'Registro de personas y familias',
      descripcion: 'Información de las personas que integran el hogar.',
      icono: '👪',
      formulario: 'personas'
    }
  ];

  var TITULO_SECCION = 'Registro de información';

  var PARAMETROS = new URLSearchParams(window.location.search);

  /* Código de hogar que puede llegar en la dirección para enlazar dos
     registros del mismo hogar. Se usa una sola vez: en la primera encuesta
     que se cree, para que la siguiente no quede pegada al mismo hogar. */
  var hogarHeredado = PARAMETROS.get('hogar') || null;

  /** Formularios que este aplicativo puede diligenciar hoy. */
  function formulariosDelModulo() {
    return TIPOS_REGISTRO
      .map(function (t) { return t.formulario; })
      .filter(function (c) { return c && FORMULARIOS[c]; });
  }

  /** Pone el nombre de la sección en el título, el ingreso y la barra superior. */
  function aplicarIdentidadDelModulo() {
    document.title = TITULO_SECCION + ' — Santiago de Cali';
    var enIngreso = document.getElementById('login-titulo');
    if (enIngreso) enIngreso.textContent = TITULO_SECCION;
    var enBarra = document.getElementById('topbar-modulo');
    if (enBarra) enBarra.textContent = TITULO_SECCION;
  }

  // --- Estado ---------------------------------------------------------------
  var sesion = null;        // { usuario, nombre, rol }
  var registro = null;      // encuesta en edición
  var formActivo = null;    // esquema del formulario en edición
  var indiceSeccion = 0;    // sección visible actual
  var condicionantes = {};  // campos que afectan la visibilidad de otros
  var temporizadorGuardado = null;
  var temporizadorEnfoque = null;
  var ayudasAbiertas = {};  // qué ayudas técnicas están desplegadas

  var dom = {};

  document.addEventListener('DOMContentLoaded', iniciar);

  function iniciar() {
    cachearDom();
    enlazarEventos();
    precalcularCondicionantes();
    dom.pieVersion.textContent = 'Versión ' + CFG.appVersion + ' · Universidad Icesi · CIENFI · Alcaldía de Santiago de Cali';
    verificarVersion();
    aplicarIdentidadDelModulo();

    // La cola de envío arranca siempre, haya o no sesión: si quedaron
    // encuestas de una jornada anterior, se van solas apenas haya conexión.
    if (window.Sincronizacion) window.Sincronizacion.iniciar(refrescarEstadoSync);

    var guardada = window.Almacen.leerSesion();
    if (guardada && CFG.autenticar) {
      // Se restaura la sesión sin volver a pedir contraseña dentro del mismo equipo.
      sesion = guardada;
      entrarAlSistema(true);
    } else {
      mostrarLogin();
    }
  }

  /**
   * Retoma la encuesta que quedó abierta la última vez.
   *
   * El identificador del borrador activo se guarda en cada apertura, así que
   * cerrar el navegador, recargar o apagar el equipo no obliga a buscar la
   * encuesta a mano: se vuelve al mismo registro y a la misma sección.
   *
   * Solo se retoma si sigue siendo un borrador del usuario en sesión. Una
   * encuesta ya finalizada, eliminada o de otra persona no se reabre sola.
   */
  function retomarBorradorActivo() {
    var id = window.Almacen.leerBorradorActivo();
    if (!id) return false;

    var reg = window.Almacen.obtener(id);
    if (!reg || reg.estado === 'finalizada' || reg.usuario !== sesion.usuario) {
      window.Almacen.guardarBorradorActivo(null);
      return false;
    }

    abrirEncuesta(reg);
    mostrarAviso('Se retomó la encuesta ' + reg.id_encuesta + ' donde la dejó.');
    return true;
  }

  /**
   * Compara la versión declarada en config.js con la que trae el "?v=" de los
   * <script> de index.html. Deben ser la misma.
   *
   * Sirve para dos cosas distintas:
   *  · Al publicar: si alguien sube el número en un solo sitio, el aviso sale
   *    de inmediato en la consola en vez de descubrirse semanas después.
   *  · En campo: el pie de página muestra la versión, así que basta pedirle a
   *    un diligenciador que la lea para saber si su navegador se quedó con una
   *    copia vieja en caché. Si el número no es el publicado, recarga con
   *    Ctrl+F5 y listo.
   */
  function verificarVersion() {
    var etiqueta = document.querySelector('script[src*="js/app.js"]');
    if (!etiqueta) return;
    var coincidencia = /[?&]v=([^&"]+)/.exec(etiqueta.getAttribute('src') || '');
    if (!coincidencia) {
      console.warn('[Registro de información] Los <script> de index.html no llevan "?v=". ' +
        'Sin eso, al publicar una versión nueva los equipos pueden quedarse con la ' +
        'anterior guardada en el caché del navegador.');
      return;
    }
    if (coincidencia[1] !== CFG.appVersion) {
      console.warn('[Registro de información] Las versiones no coinciden: config.js dice "' +
        CFG.appVersion + '" y index.html carga los archivos con "?v=' + coincidencia[1] +
        '". Hay que dejar el mismo número en los dos lugares.');
    }
  }

  function cachearDom() {
    var ids = [
      'vista-login', 'form-login', 'login-usuario', 'login-clave', 'login-error',
      'app-shell', 'topbar-titulo', 'pill-usuario',
      'btn-menu', 'topbar-acciones',
      'btn-inicio', 'btn-respaldo', 'input-respaldo', 'btn-salir',
      'vista-menu', 'lista-formularios', 'lista-encuestas-propias', 'menu-resumen',
      'vista-formulario', 'form-eyebrow', 'form-titulo', 'form-descripcion',
      'form-id', 'form-guardado', 'form-pasos', 'form-progreso', 'form-progreso-texto',
      'form-vinculo', 'form-campos', 'form-errores',
      'acciones-formulario', 'progreso-movil-texto', 'progreso-movil-barra',
      'btn-anterior', 'btn-siguiente', 'btn-finalizar', 'btn-guardar-salir',
      'btn-eliminar-encuesta',
      'vista-final', 'final-detalle', 'final-id', 'final-hogar', 'final-nota', 'final-opciones',
      'pill-sync', 'panel-respaldo', 'sync-estado-pill', 'sync-mensaje',
      'btn-sincronizar', 'btn-probar-sync',
      'vista-panel', 'panel-eyebrow', 'panel-titulo', 'panel-subtitulo',
      'btn-actualizar-panel', 'panel-tarjetas', 'panel-avance-tipo',
      'tabla-diligenciadores',
      'tabla-central', 'panel-central-nota', 'pill-central', 'panel-ambito',
      'filtro-tipo', 'filtro-usuario',
      'filtro-estado', 'filtro-separador', 'descarga-resumen', 'btn-descargar-todo',
      'tabla-registros', 'registros-conteo', 'pie-version', 'toast'
    ];
    ids.forEach(function (id) {
      dom[aCamello(id)] = document.getElementById(id);
    });
  }

  function aCamello(id) {
    return id.replace(/-([a-z])/g, function (m, c) { return c.toUpperCase(); });
  }

  function enlazarEventos() {
    dom.formLogin.addEventListener('submit', alIniciarSesion);
    dom.btnSalir.addEventListener('click', cerrarSesion);
    dom.btnInicio.addEventListener('click', irAlInicio);
    dom.btnMenu.addEventListener('click', alternarMenu);
    enlazarComportamientoTactil();
    dom.btnRespaldo.addEventListener('click', descargarRespaldo);
    dom.inputRespaldo.addEventListener('change', restaurarRespaldo);

    dom.listaFormularios.addEventListener('click', alElegirFormulario);
    dom.listaEncuestasPropias.addEventListener('click', alAccionEncuesta);

    dom.formCampos.addEventListener('input', alCambiarCampo);
    dom.formCampos.addEventListener('change', alCambiarCampo);
    dom.formCampos.addEventListener('click', alClicEnFormulario);

    dom.btnAnterior.addEventListener('click', function () { moverSeccion(-1); });
    dom.btnSiguiente.addEventListener('click', function () { moverSeccion(1); });
    dom.btnFinalizar.addEventListener('click', finalizarEncuesta);
    dom.btnGuardarSalir.addEventListener('click', guardarYSalir);
    dom.btnEliminarEncuesta.addEventListener('click', eliminarEncuestaActual);
    dom.formPasos.addEventListener('click', alClicPaso);

    dom.finalOpciones.addEventListener('click', alAccionFinal);

    dom.btnActualizarPanel.addEventListener('click', cargarAvanceCentral);
    ['filtroTipo', 'filtroUsuario', 'filtroEstado'].forEach(function (k) {
      dom[k].addEventListener('change', renderPanel);
    });
    dom.btnDescargarTodo.addEventListener('click', descargarTodo);

    // --- Envío a la base central ---
    dom.pillSync.addEventListener('click', function () { sincronizarAhora(false); });
    dom.btnSincronizar.addEventListener('click', function () { sincronizarAhora(false); });
    dom.btnProbarSync.addEventListener('click', probarConexionSync);
    document.querySelectorAll('[data-descargar]').forEach(function (btn) {
      btn.addEventListener('click', function () { descargarArchivo(btn.getAttribute('data-descargar')); });
    });

    // Evita perder trabajo al cerrar la pestaña con cambios sin guardar.
    window.addEventListener('beforeunload', function (e) {
      if (registro && temporizadorGuardado) {
        guardarAhora();
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  // ==========================================================================
  //  COMPORTAMIENTO TÁCTIL Y DE PANTALLA PEQUEÑA
  // ==========================================================================

  function alternarMenu() {
    var abierto = dom.topbarAcciones.classList.toggle('abierto');
    dom.btnMenu.setAttribute('aria-expanded', abierto ? 'true' : 'false');
    dom.btnMenu.textContent = abierto ? '✕ Cerrar' : '☰ Menú';
  }

  function cerrarMenu() {
    dom.topbarAcciones.classList.remove('abierto');
    dom.btnMenu.setAttribute('aria-expanded', 'false');
    dom.btnMenu.textContent = '☰ Menú';
  }

  /** ¿La pantalla es del tamaño en que el menú se colapsa y la barra se fija? */
  function esPantallaAngosta() {
    return window.matchMedia('(max-width: 820px)').matches;
  }

  function enlazarComportamientoTactil() {
    // Cerrar el menú al tocar fuera de él.
    document.addEventListener('click', function (evento) {
      if (!dom.topbarAcciones.classList.contains('abierto')) return;
      if (dom.topbarAcciones.contains(evento.target) || dom.btnMenu.contains(evento.target)) return;
      cerrarMenu();
    });
    // Cualquier botón del menú lo cierra al usarse.
    dom.topbarAcciones.addEventListener('click', function (evento) {
      if (evento.target.closest('button, label')) cerrarMenu();
    });

    /* Teclado del celular: al enfocar un campo de escritura se lo lleva al
       centro de la parte visible y se libera la barra fija de abajo, que si no
       quedaría justo encima del campo. Los radios y casillas se excluyen: no
       abren teclado y desplazar la pantalla ahí solo desorienta. */
    document.addEventListener('focusin', function (evento) {
      var el = evento.target;
      if (!el.matches || !el.matches('input, textarea, select')) return;
      if (el.type === 'radio' || el.type === 'checkbox') return;
      if (!esPantallaAngosta()) return;

      document.body.classList.add('editando');
      clearTimeout(temporizadorEnfoque);
      // El retraso da tiempo a que el teclado termine de aparecer y el
      // navegador recalcule el alto visible.
      temporizadorEnfoque = setTimeout(function () {
        if (document.activeElement === el) {
          el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      }, 320);
    });

    // Al girar el dispositivo o cambiar el tamaño de la ventana se recalcula
    // qué tablas caben y se recentra el paso activo.
    var temporizadorTamano = null;
    window.addEventListener('resize', function () {
      clearTimeout(temporizadorTamano);
      temporizadorTamano = setTimeout(function () {
        ajustarTablas();
        if (registro) centrarPasoActivo();
      }, 180);
    });

    document.addEventListener('focusout', function (evento) {
      var el = evento.target;
      if (!el.matches || !el.matches('input, textarea, select')) return;
      clearTimeout(temporizadorEnfoque);
      // Se espera un instante: si el foco pasa a otro campo, la barra sigue
      // liberada y no parpadea entre campo y campo.
      setTimeout(function () {
        var activo = document.activeElement;
        var sigueEscribiendo = activo && activo.matches &&
          activo.matches('input, textarea, select') &&
          activo.type !== 'radio' && activo.type !== 'checkbox';
        if (!sigueEscribiendo) document.body.classList.remove('editando');
      }, 150);
    });
  }

  /**
   * Apila como tarjetas las tablas que no caben en su contenedor.
   * Se mide en vez de usar un punto de quiebre fijo, porque las tablas del
   * panel tienen anchos muy distintos: la de registros ya no cabe en tableta,
   * mientras que las de resumen se leen bien hasta pantallas mucho menores.
   */
  function ajustarTablas() {
    document.querySelectorAll('.tabla-apilable').forEach(function (tabla) {
      var contenedor = tabla.closest('.tabla-contenedor');
      if (!contenedor || !tabla.offsetParent) return;
      // Se mide siempre en modo tabla: apilada, el ancho ya no es comparable.
      tabla.classList.remove('apilada');
      var noCabe = tabla.scrollWidth > contenedor.clientWidth + 1;
      tabla.classList.toggle('apilada', noCabe);
    });
  }

  /** Deja visible el paso activo dentro de la tira desplazable de secciones. */
  function centrarPasoActivo() {
    var activo = dom.formPasos.querySelector('.paso.activo');
    if (!activo) return;
    // Se mueve el scroll del contenedor directamente: scrollIntoView movería
    // también la página en vertical.
    var destino = activo.offsetLeft - (dom.formPasos.clientWidth - activo.clientWidth) / 2;
    dom.formPasos.scrollLeft = Math.max(0, destino);
  }

  // ==========================================================================
  //  SESIÓN
  // ==========================================================================

  function mostrarLogin() {
    dom.vistaLogin.classList.remove('oculto');
    dom.appShell.classList.add('oculto');
    dom.loginUsuario.value = '';
    dom.loginClave.value = '';
    dom.loginError.classList.add('oculto');
    dom.loginUsuario.focus();
  }

  function alIniciarSesion(evento) {
    evento.preventDefault();
    var usuario = CFG.autenticar(dom.loginUsuario.value, dom.loginClave.value);
    if (!usuario) {
      dom.loginError.textContent = 'Usuario o contraseña incorrectos. Verifique e intente de nuevo.';
      dom.loginError.classList.remove('oculto');
      dom.loginClave.value = '';
      dom.loginClave.focus();
      return;
    }
    sesion = usuario;
    window.Almacen.guardarSesion(sesion);
    entrarAlSistema(false);
  }

  function entrarAlSistema(esRestauracion) {
    dom.vistaLogin.classList.add('oculto');
    dom.appShell.classList.remove('oculto');

    var rol = CFG.roles[sesion.rol] || {};
    dom.pillUsuario.textContent = (rol.etiqueta || 'Usuario') + ': ' + sesion.nombre;

    refrescarEstadoSync();

    /* Del ingreso se pasa directo al tipo de registro. */
    if (rol.puedeConsultar) {
      prepararPanel();
      renderPanel();   // algo en pantalla mientras responde el centro
      cargarAvanceCentral();
      mostrarVista('vistaPanel');
    } else {
      // Antes de mostrar el menú se comprueba si quedó una encuesta a medias.
      if (!retomarBorradorActivo()) mostrarMenu();
      /* Recuperación entre equipos: en segundo plano se piden a la base
         central las encuestas de este usuario que no estén en este equipo
         (por ejemplo, si diligenció en otro computador). Solo en un INGRESO
         real, no al restaurar la sesión en cada carga de página: así el
         servidor no se consulta decenas de veces al día por equipo. Sin
         conexión, la aplicación sigue igual. */
      if (!esRestauracion) recuperarEncuestasDelUsuario();
    }

    if (!esRestauracion) mostrarAviso('Bienvenido, ' + sesion.nombre + '.');
  }

  function cerrarSesion() {
    if (registro) guardarAhora();
    if (!window.confirm('¿Desea salir de la aplicación? La información diligenciada queda guardada en este equipo.')) return;
    window.Almacen.borrarSesion();
    sesion = null;
    registro = null;
    formActivo = null;
    mostrarLogin();
  }

  function irAlInicio() {
    if (registro) guardarAhora();
    registro = null;
    formActivo = null;
    window.Almacen.guardarBorradorActivo(null);
    var rol = CFG.roles[sesion.rol] || {};
    if (rol.puedeConsultar) {
      renderPanel();
      mostrarVista('vistaPanel');
    } else {
      mostrarMenu();
    }
  }

  // ==========================================================================
  //  NAVEGACIÓN
  // ==========================================================================

  var VISTAS = ['vistaMenu', 'vistaFormulario', 'vistaFinal', 'vistaPanel'];

  function mostrarVista(nombre) {
    cerrarMenu();
    document.body.classList.remove('editando');
    // Al salir del formulario se libera el mapa: dejarlo vivo sobre un nodo
    // oculto consume memoria y descuadra su tamaño al volver.
    if (nombre !== 'vistaFormulario') window.CampoDireccion.desmontar();
    VISTAS.forEach(function (v) {
      if (dom[v]) dom[v].classList.toggle('oculto', v !== nombre);
    });
    var titulos = {
      vistaMenu: 'Registro de información',
      vistaFormulario: formActivo ? formActivo.nombre : 'Formulario',
      vistaFinal: 'Encuesta finalizada',
      vistaPanel: 'Panel de seguimiento'
    };
    dom.topbarTitulo.textContent = titulos[nombre] || '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ==========================================================================
  //  REGISTRO DE INFORMACIÓN — SELECCIÓN DEL TIPO DE REGISTRO
  //  Primera pantalla después del inicio de sesión.
  // ==========================================================================

  function mostrarMenu() {
    dom.listaFormularios.innerHTML = TIPOS_REGISTRO.map(function (t) {
      var f = t.formulario ? FORMULARIOS[t.formulario] : null;

      /* Un tipo sin formulario se muestra igual, anunciado como en
         preparación: es más claro que ocultarlo, porque comunica que el
         proceso existe y todavía no se puede diligenciar. */
      if (!f) {
        return '<button type="button" class="tarjeta-opcion tarjeta-opcion--preparacion" ' +
                 'data-tipo="' + escapar(t.id) + '">' +
          '<span class="icono">' + t.icono + '</span>' +
          '<span class="titulo">' + escapar(t.nombre) + '</span>' +
          '<span class="detalle">' + escapar(t.descripcion) + '</span>' +
          '<span class="codigo">En preparación</span>' +
          '</button>';
      }

      return '<button type="button" class="tarjeta-opcion" ' +
               'data-tipo="' + escapar(t.id) + '" ' +
               'data-formulario="' + escapar(t.formulario) + '">' +
        '<span class="icono">' + t.icono + '</span>' +
        '<span class="titulo">' + escapar(t.nombre) + '</span>' +
        '<span class="detalle">' + escapar(t.descripcion) + '</span>' +
        '<span class="codigo">Formato ' + escapar(f.codigoFormato) + '</span>' +
        '</button>';
    }).join('');

    renderEncuestasPropias();
    mostrarVista('vistaMenu');
  }

  /**
   * Píldora que indica si la encuesta ya viajó a la base central.
   *
   * Si el envío no está configurado no se muestra nada: informar de un envío
   * que no existe solo confunde. Los borradores tampoco la llevan, porque no
   * se envían hasta finalizarse.
   */
  function pildoraSync(r) {
    if (!window.Sincronizacion || !window.Sincronizacion.configurada()) return '';
    if (r.estado !== 'finalizada') {
      return '<span class="pill pill-suave">Se enviará al finalizar</span>';
    }
    if (r.sincronizada) {
      var cuando = r.fecha_sincronizacion ? ' title="Enviada el ' + escapar(fechaLegible(r.fecha_sincronizacion)) + '"' : '';
      return '<span class="pill pill-ok"' + cuando + '>Enviada a la base central</span>';
    }
    if (r.ultimo_error_sync) {
      return '<span class="pill pill-error" title="' + escapar(r.ultimo_error_sync) + '">Error de envío</span>';
    }
    return '<span class="pill pill-atencion">Pendiente de envío</span>';
  }

  /**
   * Encuestas que el diligenciador puede retomar o consultar.
   *
   * Se separan las que están en progreso de las ya finalizadas: lo primero que
   * necesita ver quien vuelve al aplicativo es qué dejó a medias.
   */
  function renderEncuestasPropias() {
    var todasMias = window.Almacen.listar({ usuario: sesion.usuario });
    var enProgreso = todasMias.filter(function (r) { return r.estado !== 'finalizada'; });
    var finalizadas = todasMias.filter(function (r) { return r.estado === 'finalizada'; });

    dom.menuResumen.textContent = enProgreso.length + ' en progreso · ' +
      finalizadas.length + ' finalizada(s) en este equipo.';

    if (!todasMias.length) {
      dom.listaEncuestasPropias.innerHTML =
        '<p class="hint">Todavía no ha diligenciado encuestas en este equipo. Escoja un formulario arriba para empezar.</p>';
      return;
    }

    var html = '';
    if (enProgreso.length) {
      html += '<p class="subtitulo-lista">Sin terminar — puede continuarlas</p>' +
        enProgreso.map(tarjetaEncuesta).join('');
    }
    if (finalizadas.length) {
      html += '<p class="subtitulo-lista">Finalizadas</p>' +
        finalizadas.slice(0, 10).map(tarjetaEncuesta).join('');
      if (finalizadas.length > 10) {
        html += '<p class="hint">Se muestran las 10 finalizadas más recientes de ' +
          finalizadas.length + '.</p>';
      }
    }
    dom.listaEncuestasPropias.innerHTML = html;
  }

  function tarjetaEncuesta(r) {
    var f = FORMULARIOS[r.tipo_formulario];
    var otro = r.tipo_formulario === 'vivienda' ? 'personas' : 'vivienda';
    var yaTieneOtro = window.Almacen.hermanas(r.id_hogar, r.id_encuesta)
      .some(function (h) { return h.tipo_formulario === otro; });
    var esBorrador = r.estado !== 'finalizada';

    var acciones = '';
    if (esBorrador) {
      acciones += '<button class="btn btn-primario" data-accion="retomar" data-id="' + r.id_encuesta + '">Continuar</button>';
    } else {
      acciones += '<button class="btn btn-secundario" data-accion="retomar" data-id="' + r.id_encuesta + '">Ver o corregir</button>';
    }
    if (!yaTieneOtro) {
      acciones += '<button class="btn btn-secundario" data-accion="agregar-otro" data-id="' + r.id_encuesta + '">' +
        '+ ' + escapar(FORMULARIOS[otro].nombreCorto) + '</button>';
    } else {
      acciones += '<span class="pill pill-ok">Hogar completo</span>';
    }

    return '<div class="tarjeta-encuesta">' +
      '<div class="datos">' +
        '<span class="titulo">' + f.icono + ' ' + escapar(f.nombreCorto) + ' · ' + escapar(r.id_encuesta) + '</span>' +
        '<span class="meta">' + escapar(resumenEncuesta(r)) + '</span>' +
        '<span class="meta estados-encuesta">' +
          (esBorrador
            ? '<span class="pill pill-atencion">En progreso</span>'
            : '<span class="pill pill-ok">Completada</span>') +
          pildoraSync(r) +
          '<span class="meta-tiempo">Actualizada ' + escapar(haceCuanto(r.fecha_actualizacion)) + '</span>' +
        '</span>' +
        '<span class="meta">Hogar ' + escapar(r.id_hogar) + '</span>' +
      '</div>' +
      '<div class="acciones">' + acciones + '</div>' +
    '</div>';
  }

  /** Texto corto que identifica la encuesta en las listas. */
  function resumenEncuesta(r) {
    if (r.tipo_formulario === 'vivienda') {
      var nombre = (r.respuestas || {}).viv_prop_nombres_apellidos;
      var dir = (r.respuestas || {}).direccion_completa;
      return [nombre, dir].filter(Boolean).join(' · ') || 'Sin propietario registrado';
    }
    var personas = r.personas || [];
    var primera = personas[0] || {};
    var quien = [primera.per_nombres, primera.per_apellidos].filter(Boolean).join(' ');
    return (quien || 'Sin personas registradas') + ' · ' + personas.length + ' persona(s)';
  }

  function alElegirFormulario(evento) {
    var boton = evento.target.closest('[data-tipo]');
    if (!boton) return;

    var formulario = boton.getAttribute('data-formulario');
    if (!formulario) {
      // Tipo de registro sin formulario todavía: se dice, no se ignora.
      mostrarAviso('El formulario de este registro todavía está en preparación.');
      return;
    }
    crearEncuesta(formulario, null);
  }

  function alAccionEncuesta(evento) {
    var boton = evento.target.closest('[data-accion]');
    if (!boton) return;
    var accion = boton.getAttribute('data-accion');
    var reg = window.Almacen.obtener(boton.getAttribute('data-id'));
    if (!reg) return;

    if (accion === 'retomar') {
      abrirEncuesta(reg);
    } else if (accion === 'agregar-otro') {
      var otro = reg.tipo_formulario === 'vivienda' ? 'personas' : 'vivienda';
      crearEncuesta(otro, reg);
    }
  }

  // ==========================================================================
  //  CICLO DE VIDA DE UNA ENCUESTA
  // ==========================================================================

  /**
   * Crea una encuesta nueva. Si se pasa `origen`, la nueva encuesta queda
   * vinculada al mismo hogar y se prellenan los campos equivalentes.
   */
  function crearEncuesta(tipo, origen) {
    /* El hogar puede venir de tres sitios, en este orden: de la encuesta desde
       la que se encadenó, del código que trajo el otro módulo en la dirección,
       o nuevo. El heredado se consume una sola vez para que la siguiente
       encuesta no quede pegada al mismo hogar por descuido. */
    var hogar = origen ? origen.id_hogar : (hogarHeredado || null);
    if (!origen && hogarHeredado) hogarHeredado = null;

    var nueva = window.Almacen.crear({
      tipo_formulario: tipo,
      id_hogar: hogar,
      usuario: sesion.usuario,
      usuario_nombre: sesion.nombre,
      rol: sesion.rol
    });

    aplicarValoresPorDefecto(nueva, FORMULARIOS[tipo]);
    if (origen) prellenarDesdeOrigen(nueva, origen);

    var res = window.Almacen.guardar(nueva);
    if (!res.ok) { mostrarAviso(res.mensaje, true); return; }
    abrirEncuesta(nueva);
  }

  /**
   * Aplica los valores por defecto declarados en el esquema. Son comodidades
   * de captura (por ejemplo Departamento y Municipio, que en esta operación
   * son siempre los mismos) y el diligenciador puede cambiarlos.
   */
  function aplicarValoresPorDefecto(reg, form) {
    (form.secciones || []).forEach(function (sec) {
      // Los campos de encabezado de una sección repetible son de nivel
      // formulario: viven en respuestas, no en cada persona.
      (sec.camposEncabezado || []).forEach(function (campo) {
        if (campo.valorPorDefecto === undefined || !campo.id) return;
        if (reg.respuestas[campo.id] === undefined) reg.respuestas[campo.id] = campo.valorPorDefecto;
      });
      (sec.campos || []).forEach(function (campo) {
        if (campo.valorPorDefecto === undefined || !campo.id) return;
        if (sec.tipo === 'repetible') {
          (reg[sec.claveLista] || []).forEach(function (item) {
            if (item[campo.id] === undefined) item[campo.id] = campo.valorPorDefecto;
          });
          return;
        }
        if (reg.respuestas[campo.id] === undefined) reg.respuestas[campo.id] = campo.valorPorDefecto;
      });
    });
  }

  /**
   * Copia al formulario nuevo los datos de identificación que ya se
   * capturaron en el otro formulario del mismo hogar. Solo se copian campos
   * cuyo significado es idéntico en ambos formatos; nada se deduce.
   */
  function prellenarDesdeOrigen(nueva, origen) {
    nueva.prellenados = [];

    if (nueva.tipo_formulario === 'vivienda' && origen.tipo_formulario === 'personas') {
      var primera = (origen.personas || [])[0] || {};
      var nombreCompleto = [primera.per_nombres, primera.per_apellidos]
        .filter(Boolean).join(' ').trim();
      if (nombreCompleto) {
        nueva.respuestas.viv_prop_nombres_apellidos = nombreCompleto;
        nueva.prellenados.push('viv_prop_nombres_apellidos');
      }
      if (primera.per_numero_documento) {
        nueva.respuestas.viv_prop_cc = primera.per_numero_documento;
        nueva.prellenados.push('viv_prop_cc');
      }
    }
    // De vivienda hacia personas no se prellena ningún nombre: el formato de
    // vivienda guarda "Nombres y apellidos" en un solo campo y separarlo sería
    // una suposición. El vínculo se mantiene por el código de hogar.
  }

  function abrirEncuesta(reg) {
    registro = reg;
    formActivo = FORMULARIOS[reg.tipo_formulario];
    ayudasAbiertas = {};
    window.Almacen.guardarBorradorActivo(reg.id_encuesta);

    // Se vuelve a la sección en la que quedó. Se guarda el id de la sección y
    // no su posición, porque las secciones visibles cambian según las
    // respuestas y una posición podría apuntar a otra sección distinta.
    indiceSeccion = 0;
    if (reg.ultima_seccion_id) {
      var visibles = seccionesVisibles();
      visibles.forEach(function (sec, i) {
        if (sec.id === reg.ultima_seccion_id) indiceSeccion = i;
      });
    }

    dom.formEyebrow.textContent = formActivo.nombre + ' · Formato ' + formActivo.codigoFormato;
    dom.formId.textContent = reg.id_encuesta;
    dom.formGuardado.textContent = 'Guardado ' + horaCorta(reg.fecha_actualizacion);
    dom.formGuardado.className = 'pill pill-ok';
    renderVinculo();
    renderSeccion();
    mostrarVista('vistaFormulario');
  }

  function renderVinculo() {
    var hermanas = window.Almacen.hermanas(registro.id_hogar, registro.id_encuesta);
    if (!hermanas.length) {
      dom.formVinculo.classList.add('oculto');
      return;
    }
    var textos = hermanas.map(function (h) {
      return FORMULARIOS[h.tipo_formulario].nombreCorto + ' (' + h.id_encuesta + ')';
    });
    dom.formVinculo.innerHTML = '<strong>Hogar ' + escapar(registro.id_hogar) + '.</strong> ' +
      'Esta encuesta queda vinculada con: ' + escapar(textos.join(', ')) + '.';
    dom.formVinculo.classList.remove('oculto');
  }

  function guardarDiferido() {
    dom.formGuardado.textContent = 'Guardando…';
    dom.formGuardado.className = 'pill pill-atencion';
    clearTimeout(temporizadorGuardado);
    temporizadorGuardado = setTimeout(guardarAhora, 400);
  }

  function guardarAhora() {
    clearTimeout(temporizadorGuardado);
    temporizadorGuardado = null;
    if (!registro) return;

    // Hito de edición en la bitácora del registro. registrarEvento agrupa las
    // ediciones seguidas, así que esto no crece con cada pulsación.
    window.Almacen.registrarEvento(registro, 'editada', 'Respuestas actualizadas');

    var res = window.Almacen.guardar(registro);
    if (res.ok) {
      // Se muestra la hora, no solo un visto: en campo, saber CUÁNDO se guardó
      // por última vez es lo que da tranquilidad de que no se perdió nada.
      dom.formGuardado.textContent = 'Guardado ' + horaCorta(registro.fecha_actualizacion);
      dom.formGuardado.className = 'pill pill-ok';
      dom.formGuardado.title = 'Última vez guardado en este equipo: ' +
        fechaLegible(registro.fecha_actualizacion);
      dom.formGuardado.style.background = '';
      dom.formGuardado.style.color = '';
      refrescarEstadoSync();
    } else {
      dom.formGuardado.textContent = 'No se pudo guardar';
      dom.formGuardado.className = 'pill';
      dom.formGuardado.style.background = '#fdeeec';
      dom.formGuardado.style.color = '#8d281c';
      mostrarAviso(res.mensaje, true);
    }
  }

  function guardarYSalir() {
    guardarAhora();
    mostrarAviso('Encuesta guardada como borrador. Puede retomarla desde «Mis encuestas recientes».');
    irAlInicio();
  }

  function eliminarEncuestaActual() {
    if (!registro) return;
    if (!window.confirm('¿Eliminar definitivamente esta encuesta (' + registro.id_encuesta + ')? Esta acción no se puede deshacer.')) return;
    window.Almacen.eliminar(registro.id_encuesta);
    registro = null;
    formActivo = null;
    window.Almacen.guardarBorradorActivo(null);
    mostrarAviso('Encuesta eliminada.');
    irAlInicio();
  }

  // ==========================================================================
  //  MOTOR DE FORMULARIOS
  // ==========================================================================

  /** Campos de los que depende la visibilidad de alguna sección o campo. */
  function precalcularCondicionantes() {
    Object.keys(FORMULARIOS).forEach(function (clave) {
      var mapa = {};
      recorrerCondiciones(FORMULARIOS[clave], function (cond) {
        if (cond.campo) mapa[cond.campo] = true;
      });
      condicionantes[clave] = mapa;
    });
  }

  function recorrerCondiciones(form, visitante) {
    function caminar(cond) {
      if (!cond) return;
      if (cond.todos) return cond.todos.forEach(caminar);
      if (cond.alguno) return cond.alguno.forEach(caminar);
      if (cond.ninguno) return cond.ninguno.forEach(caminar);
      visitante(cond);
    }
    (form.secciones || []).forEach(function (sec) {
      caminar(sec.visibleSi);
      (sec.campos || []).forEach(function (campo) { caminar(campo.visibleSi); });
    });
  }

  function evaluarCondicion(cond, valores) {
    if (!cond) return true;
    if (cond.todos) return cond.todos.every(function (c) { return evaluarCondicion(c, valores); });
    if (cond.alguno) return cond.alguno.some(function (c) { return evaluarCondicion(c, valores); });
    if (cond.ninguno) return !cond.ninguno.some(function (c) { return evaluarCondicion(c, valores); });

    var valor = valores[cond.campo];
    if (cond.op === 'eq') {
      return String(valor === undefined || valor === null ? '' : valor) === String(cond.valor);
    }
    if (cond.op === 'incluye') {
      return Array.isArray(valor) && valor.map(String).indexOf(String(cond.valor)) !== -1;
    }
    return true;
  }

  function seccionesVisibles() {
    return (formActivo.secciones || []).filter(function (sec) {
      return evaluarCondicion(sec.visibleSi, registro.respuestas);
    });
  }

  function camposVisibles(seccion, valores) {
    return (seccion.campos || []).filter(function (campo) {
      return evaluarCondicion(campo.visibleSi, valores);
    });
  }

  // --- Render de la sección actual ------------------------------------------

  function renderSeccion() {
    var visibles = seccionesVisibles();
    if (indiceSeccion >= visibles.length) indiceSeccion = visibles.length - 1;
    if (indiceSeccion < 0) indiceSeccion = 0;
    var seccion = visibles[indiceSeccion];
    if (!seccion) return;

    // Queda anotado dónde va el diligenciador, para poder devolverlo aquí si
    // cierra el navegador o se apaga el equipo.
    registro.ultima_seccion_id = seccion.id;

    dom.formTitulo.textContent = seccion.numero + '. ' + seccion.titulo;
    dom.formDescripcion.textContent = seccion.descripcion || '';
    dom.formErrores.classList.add('oculto');
    dom.formErrores.innerHTML = '';

    // El mapa se destruye antes de reemplazar el HTML: si no, Leaflet queda
    // agarrado a un nodo que ya no existe y el mapa no vuelve a dibujarse.
    window.CampoDireccion.desmontar();

    dom.formCampos.innerHTML = seccion.tipo === 'repetible'
      ? renderSeccionRepetible(seccion)
      : '<div class="campos">' +
          camposVisibles(seccion, registro.respuestas)
            .map(function (c) { return renderCampo(c, registro.respuestas, null, null); })
            .join('') +
        '</div>';

    montarCamposDireccion(seccion);
    renderPasos(visibles);
    renderProgreso(visibles);

    dom.btnAnterior.disabled = indiceSeccion === 0;
    var esUltima = indiceSeccion === visibles.length - 1;
    dom.btnSiguiente.classList.toggle('oculto', esUltima);
    dom.btnFinalizar.classList.toggle('oculto', !esUltima);
  }

  /**
   * Arranca el mapa y los eventos del campo de dirección, si la sección tiene
   * uno. Debe llamarse DESPUÉS de escribir el HTML en el documento.
   */
  function montarCamposDireccion(seccion) {
    var campoDir = null;
    (seccion.campos || []).forEach(function (c) { if (c.tipo === 'direccion') campoDir = c; });
    if (!campoDir) return;

    // Contexto para acotar la búsqueda de la dirección al municipio correcto.
    window.CampoDireccion.contexto = {
      formulario: formActivo.id,
      municipio: registro.respuestas.viv_municipio || 'Cali',
      departamento: registro.respuestas.viv_departamento || 'Valle del Cauca'
    };

    window.CampoDireccion.montar(dom.formCampos, campoDir, registro.respuestas, {
      // Cada tecla: guardado diferido, como el resto del formulario.
      alCambiar: function () {
        guardarDiferido();
        renderProgreso(seccionesVisibles());
      },
      // Al confirmar la ubicación: escritura inmediata, sin esperar el diferido.
      guardarYa: function () {
        guardarAhora();
        renderProgreso(seccionesVisibles());
        mostrarAviso('Ubicación confirmada y guardada.');
      }
    });
  }

  /**
   * Valor con el que se juzga si un campo está diligenciado. El campo de
   * dirección no guarda nada bajo su propio id: lo que cuenta es la dirección
   * compuesta a partir de sus casillas.
   */
  function valorDeCampo(campo, contenedor) {
    if (campo.tipo === 'direccion') return contenedor.direccion_completa;
    return contenedor[campo.id];
  }

  function renderSeccionRepetible(seccion) {
    var lista = registro[seccion.claveLista] || [];
    if (!lista.length) {
      lista.push({});
      registro[seccion.claveLista] = lista;
    }

    /* Campos de encabezado: se dibujan UNA vez, arriba de la lista, y
       escriben en respuestas (nivel formulario), no en cada persona — por
       eso se renderizan sin lista ni índice. */
    var encabezado = (seccion.camposEncabezado || [])
      .filter(function (c) { return evaluarCondicion(c.visibleSi, registro.respuestas); })
      .map(function (c) { return renderCampo(c, registro.respuestas, null, null); })
      .join('');

    var items = lista.map(function (item, i) {
      var resumen = [item.per_nombres, item.per_apellidos].filter(Boolean).join(' ');
      var puedeEliminar = lista.length > (seccion.minimo || 1);
      return '<div class="item-repetible">' +
        '<div class="item-cabecera">' +
          '<h3>' + escapar(seccion.etiquetaItem) + ' ' + (i + 1) +
            (resumen ? ' <span class="item-resumen">· ' + escapar(resumen) + '</span>' : '') + '</h3>' +
          (puedeEliminar
            ? '<button type="button" class="btn btn-peligro-linea" data-accion="eliminar-item" data-indice="' + i + '">Eliminar ' + escapar(seccion.etiquetaItem.toLowerCase()) + '</button>'
            : '') +
        '</div>' +
        '<div class="campos">' +
          camposVisibles(seccion, item)
            .map(function (c) { return renderCampo(c, item, seccion.claveLista, i); })
            .join('') +
        '</div>' +
      '</div>';
    }).join('');

    return (encabezado ? '<div class="campos campos-encabezado">' + encabezado + '</div>' : '') +
      items +
      '<button type="button" class="btn btn-primario-linea btn-bloque" data-accion="agregar-item">' +
        '+ Agregar otra ' + escapar(seccion.etiquetaItem.toLowerCase()) +
      '</button>';
  }

  /** Render de un campo. `lista`/`indice` solo se usan en grupos repetibles. */
  function renderCampo(campo, valores, lista, indice) {
    if (campo.tipo === 'subtitulo') {
      return '<div class="subtitulo-seccion">' + escapar(campo.etiqueta) + '</div>';
    }
    if (campo.tipo === 'nota') {
      return '<p class="nota-seccion">' + escapar(campo.etiqueta) + '</p>';
    }
    if (campo.tipo === 'aviso') {
      return '<div class="aviso">' + escapar(campo.etiqueta) + '</div>';
    }

    var valor = valores[campo.id];
    var ancho = campo.ancho === 'medio' ? ' medio' : (campo.ancho === 'tercio' ? ' tercio' : '');
    var prellenado = (registro.prellenados || []).indexOf(campo.id) !== -1 && !lista;
    var clave = claveCampo(campo.id, lista, indice);
    var attrs = 'data-campo="' + campo.id + '"' +
      (lista ? ' data-lista="' + lista + '" data-indice="' + indice + '"' : '');

    // El "for" solo se usa en controles de texto: en radios y casillas haría
    // que al tocar el enunciado se marcara la primera opción.
    var tiposConFoco = ['texto', 'textarea', 'numero', 'fecha'];
    var asociable = tiposConFoco.indexOf(campo.tipo) !== -1;
    // El código de la pregunta se muestra para poder referirse a ella sin
    // depender de su redacción (ver js/codigos.js).
    var codigo = window.CODIGOS.de(formActivo.id, campo.id);
    var etiqueta = '<label class="campo-etiqueta"' + (asociable ? ' for="' + clave + '"' : '') + '>' +
      (codigo ? '<span class="codigo-pregunta">' + escapar(codigo) + '</span>' : '') +
      escapar(campo.etiqueta) +
      (campo.requerido ? '<span class="campo-obligatorio">*</span>' : '') + '</label>';
    var ayuda = campo.ayuda ? '<p class="campo-ayuda">' + escapar(campo.ayuda) + '</p>' : '';
    var control = '';

    switch (campo.tipo) {
      case 'texto':
        control = '<input id="' + clave + '" type="' + (campo.modo === 'telefono' ? 'tel' : 'text') + '" ' +
          attrs + ' value="' + escapar(valor || '') + '"' +
          (campo.soloLectura ? ' readonly' : '') +
          (campo.modo === 'numerico' ? ' inputmode="numeric"' : '') +
          (campo.placeholder ? ' placeholder="' + escapar(campo.placeholder) + '"' : '') + ' />';
        break;

      case 'textarea':
        control = '<textarea id="' + clave + '" ' + attrs + ' rows="' + (campo.filas || 4) + '">' +
          escapar(valor || '') + '</textarea>';
        break;

      case 'numero':
        control = '<input id="' + clave + '" type="number" ' + attrs +
          ' value="' + escapar(valor === undefined || valor === null ? '' : valor) + '"' +
          (campo.min !== undefined ? ' min="' + campo.min + '"' : '') +
          (campo.max !== undefined ? ' max="' + campo.max + '"' : '') + ' inputmode="numeric" />';
        break;

      case 'fecha':
        control = '<input id="' + clave + '" type="date" ' + attrs + ' value="' + escapar(valor || '') + '" />';
        break;

      case 'unica':
        control = '<div class="opciones' + (campo.opciones.length > 3 ? '' : ' columnas') + '">' +
          campo.opciones.map(function (op, i) {
            var marcada = String(valor) === String(op.valor);
            return '<label class="opcion' + (marcada ? ' marcada' : '') + '">' +
              '<input type="radio" name="' + clave + '" ' + attrs +
                ' value="' + escapar(op.valor) + '"' + (marcada ? ' checked' : '') + ' />' +
              '<span>' + escapar(op.etiqueta) + '</span>' +
            '</label>';
          }).join('') +
        '</div>' + renderAyudaTecnica(campo, clave);
        break;

      case 'multiple':
        var seleccion = Array.isArray(valor) ? valor.map(String) : [];
        control = '<div class="opciones columnas">' +
          campo.opciones.map(function (op, i) {
            var marcada = seleccion.indexOf(String(op.valor)) !== -1;
            return '<label class="opcion' + (marcada ? ' marcada' : '') + '">' +
              '<input type="checkbox" ' + attrs + ' value="' + escapar(op.valor) + '"' +
                (marcada ? ' checked' : '') + ' />' +
              '<span>' + escapar(op.etiqueta) + '</span>' +
            '</label>';
          }).join('') +
        '</div>';
        break;

      case 'confirmacion':
        control = '<label class="opcion confirmacion' + (valor ? ' marcada' : '') + '">' +
          '<input id="' + clave + '" type="checkbox" ' + attrs + (valor ? ' checked' : '') + ' />' +
          '<span>' + escapar(campo.textoConfirmacion || 'Confirmo') + '</span>' +
        '</label>';
        break;

      case 'direccion':
        // Campo compuesto: se dibuja y se maneja en js/campo-direccion.js.
        // Sus subcampos se guardan sueltos en el mismo contenedor de respuestas.
        control = window.CampoDireccion.render(campo, valores);
        break;

      default:
        control = '<p class="hint">Tipo de campo no reconocido: ' + escapar(campo.tipo) + '</p>';
    }

    return '<div class="campo' + ancho + (prellenado ? ' prellenado' : '') + '" data-contenedor="' + campo.id + '">' +
      etiqueta + ayuda + control +
      (prellenado ? '<p class="campo-ayuda">Dato traído del otro formulario del mismo hogar. Verifíquelo y corríjalo si es necesario.</p>' : '') +
    '</div>';
  }

  function claveCampo(campoId, lista, indice) {
    return lista ? (lista + '_' + indice + '_' + campoId) : campoId;
  }

  /** Botón y contenido del Anexo 1 para los campos de nivel de daño. */
  function renderAyudaTecnica(campo, clave) {
    if (!campo.ayudaNivelDano || !window.AYUDA_NIVEL_DANO) return '';
    var ref = campo.ayudaNivelDano;
    var tabla = (window.AYUDA_NIVEL_DANO[ref.sistema] || {})[ref.elemento];
    if (!tabla) return '';

    var abierta = !!ayudasAbiertas[campo.id];
    var etiquetas = window.AYUDA_NIVEL_DANO.nivelesEtiqueta;
    var contenido = '';
    if (abierta) {
      contenido = '<div class="ayuda-contenido">' +
        ['leve', 'moderado', 'severo', 'colapso_total'].map(function (nivel) {
          if (!tabla[nivel]) return '';
          return '<div><span class="nivel">' + escapar(etiquetas[nivel]) + '</span>' +
            '<p>' + escapar(tabla[nivel]) + '</p></div>';
        }).join('') +
      '</div>';
    }

    return '<div class="ayuda-tecnica">' +
      '<button type="button" class="ayuda-boton" data-ayuda="' + campo.id + '">' +
        (abierta ? 'Ocultar criterios técnicos' : 'Ver criterios técnicos (Anexo 1)') +
      '</button>' + contenido +
    '</div>';
  }

  // --- Cambios en los campos ------------------------------------------------

  function alCambiarCampo(evento) {
    var control = evento.target;
    var campoId = control.getAttribute('data-campo');
    if (!campoId) return;

    // Radios y casillas disparan 'input' y 'change'; se atiende solo 'change'
    // para no procesar (ni redibujar) el mismo cambio dos veces.
    var esCasilla = control.type === 'radio' || control.type === 'checkbox';
    if (esCasilla && evento.type === 'input') return;

    var lista = control.getAttribute('data-lista');
    var indice = control.getAttribute('data-indice');
    var contenedor = lista ? registro[lista][Number(indice)] : registro.respuestas;
    var campo = buscarCampo(campoId);
    if (!campo || !contenedor) return;

    if (campo.tipo === 'multiple') {
      var selector = '[data-campo="' + campoId + '"]' +
        (lista ? '[data-lista="' + lista + '"][data-indice="' + indice + '"]' : '');
      var marcados = [];
      dom.formCampos.querySelectorAll(selector).forEach(function (input) {
        if (input.checked) marcados.push(input.value);
      });
      contenedor[campoId] = marcados;
    } else if (campo.tipo === 'confirmacion') {
      contenedor[campoId] = control.checked;
    } else {
      contenedor[campoId] = control.value;
    }

    // Si el campo ya no está prellenado desde el otro formulario, se desmarca.
    if (registro.prellenados && registro.prellenados.indexOf(campoId) !== -1) {
      registro.prellenados = registro.prellenados.filter(function (c) { return c !== campoId; });
    }

    guardarDiferido();

    // Solo se vuelve a dibujar cuando el cambio puede alterar qué se ve.
    var afectaVisibilidad = !!condicionantes[formActivo.id][campoId];
    var esOpcion = campo.tipo === 'unica' || campo.tipo === 'multiple' || campo.tipo === 'confirmacion';
    if (afectaVisibilidad) {
      renderSeccion();
    } else if (esOpcion) {
      actualizarMarcadoOpciones(control, campo);
      renderProgreso(seccionesVisibles());
    } else {
      renderProgreso(seccionesVisibles());
    }
  }

  /** Refresca el resaltado de las opciones sin volver a dibujar la sección. */
  function actualizarMarcadoOpciones(control, campo) {
    var grupo = control.closest('.campo');
    if (!grupo) return;
    grupo.querySelectorAll('.opcion').forEach(function (etiqueta) {
      var input = etiqueta.querySelector('input');
      etiqueta.classList.toggle('marcada', !!(input && input.checked));
    });
  }

  function buscarCampo(campoId) {
    var encontrado = null;
    (formActivo.secciones || []).forEach(function (sec) {
      (sec.camposEncabezado || []).concat(sec.campos || []).forEach(function (campo) {
        if (campo.id === campoId) encontrado = campo;
      });
    });
    return encontrado;
  }

  function alClicEnFormulario(evento) {
    var botonAyuda = evento.target.closest('[data-ayuda]');
    if (botonAyuda) {
      var id = botonAyuda.getAttribute('data-ayuda');
      ayudasAbiertas[id] = !ayudasAbiertas[id];
      renderSeccion();
      return;
    }

    var accion = evento.target.closest('[data-accion]');
    if (!accion) return;
    var seccion = seccionesVisibles()[indiceSeccion];
    if (!seccion || seccion.tipo !== 'repetible') return;

    if (accion.getAttribute('data-accion') === 'agregar-item') {
      registro[seccion.claveLista].push({});
      aplicarValoresPorDefecto(registro, formActivo);
      guardarAhora();
      renderSeccion();
      // Lleva el foco al primer campo de la persona recién agregada.
      var items = dom.formCampos.querySelectorAll('.item-repetible');
      var ultimo = items[items.length - 1];
      if (ultimo) {
        ultimo.scrollIntoView({ behavior: 'smooth', block: 'center' });
        var primerInput = ultimo.querySelector('input, textarea, select');
        if (primerInput) primerInput.focus({ preventScroll: true });
      }
    } else if (accion.getAttribute('data-accion') === 'eliminar-item') {
      var i = Number(accion.getAttribute('data-indice'));
      var etiqueta = seccion.etiquetaItem.toLowerCase();
      if (!window.confirm('¿Eliminar la ' + etiqueta + ' ' + (i + 1) + ' de este hogar?')) return;
      registro[seccion.claveLista].splice(i, 1);
      guardarAhora();
      renderSeccion();
    }
  }

  // --- Pasos y progreso -----------------------------------------------------

  function renderPasos(visibles) {
    dom.formPasos.innerHTML = visibles.map(function (sec, i) {
      var clase = i === indiceSeccion ? 'paso activo' : 'paso';
      if (i !== indiceSeccion && seccionCompleta(sec)) clase = 'paso completo';
      return '<button type="button" class="' + clase + '" data-paso="' + i + '">' +
        sec.numero + '. ' + escapar(sec.titulo) + '</button>';
    }).join('');
    centrarPasoActivo();
  }

  function alClicPaso(evento) {
    var boton = evento.target.closest('[data-paso]');
    if (!boton) return;
    guardarAhora();
    indiceSeccion = Number(boton.getAttribute('data-paso'));
    renderSeccion();
  }

  /** Una sección está completa si todos sus campos obligatorios están llenos. */
  function seccionCompleta(seccion) {
    return faltantesDeSeccion(seccion).length === 0;
  }

  /** Campos obligatorios visibles y sin responder de una sección. */
  function faltantesDeSeccion(seccion) {
    var faltantes = [];
    if (seccion.tipo === 'repetible') {
      // Primero los campos de encabezado (nivel formulario, en respuestas).
      (seccion.camposEncabezado || []).forEach(function (campo) {
        if (!evaluarCondicion(campo.visibleSi, registro.respuestas)) return;
        if (campo.requerido && estaVacio(valorDeCampo(campo, registro.respuestas))) {
          faltantes.push(campo.etiqueta);
        }
      });
      (registro[seccion.claveLista] || []).forEach(function (item, i) {
        camposVisibles(seccion, item).forEach(function (campo) {
          if (campo.requerido && estaVacio(valorDeCampo(campo, item))) {
            faltantes.push(seccion.etiquetaItem + ' ' + (i + 1) + ': ' + campo.etiqueta);
          }
        });
      });
      return faltantes;
    }
    camposVisibles(seccion, registro.respuestas).forEach(function (campo) {
      if (campo.requerido && estaVacio(valorDeCampo(campo, registro.respuestas))) {
        faltantes.push(campo.etiqueta);
      }
    });
    return faltantes;
  }

  function estaVacio(valor) {
    if (valor === undefined || valor === null) return true;
    if (Array.isArray(valor)) return valor.length === 0;
    return String(valor).trim() === '';
  }

  function renderProgreso(visibles) {
    var respondidos = 0;
    var total = 0;

    visibles.forEach(function (sec) {
      if (sec.tipo === 'repetible') {
        (sec.camposEncabezado || []).forEach(function (campo) {
          if (TIPOS_SIN_DATO.indexOf(campo.tipo) !== -1) return;
          if (!evaluarCondicion(campo.visibleSi, registro.respuestas)) return;
          total++;
          if (!estaVacio(valorDeCampo(campo, registro.respuestas))) respondidos++;
        });
        (registro[sec.claveLista] || []).forEach(function (item) {
          camposVisibles(sec, item).forEach(function (campo) {
            if (TIPOS_SIN_DATO.indexOf(campo.tipo) !== -1) return;
            total++;
            if (!estaVacio(valorDeCampo(campo, item))) respondidos++;
          });
        });
        return;
      }
      camposVisibles(sec, registro.respuestas).forEach(function (campo) {
        if (TIPOS_SIN_DATO.indexOf(campo.tipo) !== -1) return;
        total++;
        if (!estaVacio(valorDeCampo(campo, registro.respuestas))) respondidos++;
      });
    });

    var pct = total ? Math.round((respondidos / total) * 100) : 0;
    dom.formProgreso.style.width = pct + '%';
    dom.formProgresoTexto.textContent =
      'Sección ' + (indiceSeccion + 1) + ' de ' + visibles.length + ' · ' +
      respondidos + ' de ' + total + ' campos diligenciados (' + pct + '%)';

    // Mismo avance, resumido, en la barra fija del celular.
    dom.progresoMovilBarra.style.width = pct + '%';
    dom.progresoMovilTexto.textContent =
      'Sección ' + (indiceSeccion + 1) + ' de ' + visibles.length + ' · ' + pct + '% diligenciado';
  }

  // --- Navegación entre secciones -------------------------------------------

  function moverSeccion(direccion) {
    var visibles = seccionesVisibles();
    if (direccion > 0) {
      var faltantes = faltantesDeSeccion(visibles[indiceSeccion]);
      if (faltantes.length) { mostrarFaltantes(faltantes); return; }
    }
    guardarAhora();
    indiceSeccion = Math.max(0, Math.min(visibles.length - 1, indiceSeccion + direccion));
    renderSeccion();
  }

  function mostrarFaltantes(faltantes) {
    dom.formErrores.innerHTML = '<strong>Faltan datos obligatorios en esta sección:</strong><ul>' +
      faltantes.map(function (f) { return '<li>' + escapar(f) + '</li>'; }).join('') + '</ul>';
    dom.formErrores.classList.remove('oculto');
    dom.formErrores.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ==========================================================================
  //  FINALIZACIÓN
  // ==========================================================================

  function finalizarEncuesta() {
    var visibles = seccionesVisibles();
    var faltantes = [];
    visibles.forEach(function (sec) {
      faltantesDeSeccion(sec).forEach(function (f) {
        faltantes.push(sec.numero + '. ' + sec.titulo + ' → ' + f);
      });
    });
    if (faltantes.length) {
      mostrarFaltantes(faltantes);
      mostrarAviso('No se puede finalizar: faltan datos obligatorios.', true);
      return;
    }

    var res = window.Almacen.finalizar(registro);
    if (!res.ok) { mostrarAviso(res.mensaje, true); return; }

    window.Almacen.guardarBorradorActivo(null);
    mostrarPantallaFinal();

    // Se intenta enviar de inmediato. Si falla, la encuesta ya quedó guardada
    // y en la cola: se reintentará sola. Nunca se pierde por esto.
    if (window.Sincronizacion && window.Sincronizacion.configurada()) sincronizarAhora(true);
  }

  function mostrarPantallaFinal() {
    var tipo = registro.tipo_formulario;
    var otro = tipo === 'vivienda' ? 'personas' : 'vivienda';
    var f = FORMULARIOS[tipo];

    dom.finalDetalle.textContent = f.nombre + ' · ' + resumenEncuesta(registro);
    dom.finalId.textContent = registro.id_encuesta;
    dom.finalHogar.textContent = registro.id_hogar;

    var hermanas = window.Almacen.hermanas(registro.id_hogar, registro.id_encuesta);
    var yaTieneOtro = hermanas.some(function (h) { return h.tipo_formulario === otro; });

    dom.finalNota.textContent = yaTieneOtro
      ? 'Este hogar ya tiene los dos formularios diligenciados.'
      : 'Diligenciar el otro formulario es opcional. Si lo hace desde aquí, quedará vinculado a este mismo hogar.';

    var opciones = [];
    if (!yaTieneOtro) {
      /* Los dos formularios construidos (VOL-10 y VOL-3) viven en este mismo
         aplicativo, así que el otro siempre está disponible aquí y se continúa
         sin salir de la pantalla, conservando el mismo código de hogar.

         Si algún día uno se mudara a otro módulo, aquí iría el enlace a esa
         otra puerta llevando &hogar= en la dirección, para no perder el
         vínculo entre los dos registros. */
      if (formulariosDelModulo().indexOf(otro) !== -1) {
        opciones.push('<button type="button" class="btn btn-primario" data-final="continuar" data-tipo="' + otro + '">' +
          'Continuar con ' + escapar(FORMULARIOS[otro].nombre) + '</button>');
      }
    }
    opciones.push('<button type="button" class="btn btn-primario-linea" data-final="nueva" data-tipo="' + tipo + '">' +
      'Diligenciar otro registro de ' + escapar(f.nombreCorto) + ' (hogar nuevo)</button>');
    opciones.push('<button type="button" class="btn btn-secundario" data-final="inicio">' +
      'Finalizar y volver al inicio</button>');

    dom.finalOpciones.innerHTML = opciones.join('');
    mostrarVista('vistaFinal');
    mostrarAviso('Encuesta ' + registro.id_encuesta + ' guardada correctamente.');
  }

  function alAccionFinal(evento) {
    var boton = evento.target.closest('[data-final]');
    if (!boton) return;
    var accion = boton.getAttribute('data-final');

    if (accion === 'continuar') {
      crearEncuesta(boton.getAttribute('data-tipo'), registro);
    } else if (accion === 'nueva') {
      registro = null;
      crearEncuesta(boton.getAttribute('data-tipo'), null);
    } else {
      registro = null;
      formActivo = null;
      irAlInicio();
    }
  }

  // ==========================================================================
  //  PANEL DE COORDINACIÓN
  // ==========================================================================

  /* Estadísticas de la operación completa, tal como las devolvió la última
     consulta a la base central. Mientras sean null, el panel se dibuja con
     lo de este equipo y lo dice en pantalla. Al ser una sola variable, todos
     los refrescos del panel (filtros, botón Actualizar, envíos) muestran lo
     mismo sin tener que pasarse el dato entre funciones. */
  var statsCentral = null;

  function prepararPanel() {
    dom.panelEyebrow.textContent = 'Panel de seguimiento';
    dom.panelSubtitulo.textContent = 'Consultando la base central…';
  }

  /**
   * Recuperación entre equipos (diligenciador): trae de la base central las
   * encuestas de este usuario y agrega SOLO las que no existen localmente.
   * Lo diligenciado en este equipo nunca se toca.
   */
  function recuperarEncuestasDelUsuario() {
    if (!window.Sincronizacion || !window.Sincronizacion.configurada()) return;
    window.Sincronizacion.traerMisEncuestas(sesion.usuario).then(function (lista) {
      if (!lista || !lista.length || !sesion) return;
      var res = window.Almacen.importarDeCentral(lista);
      if (!res.ok || (!res.agregadas && !res.actualizadas)) return;

      /* El refresco y el aviso solo si el menú está a la vista: si la
         persona ya está diligenciando un formulario, no se interrumpe. */
      if (dom.vistaMenu && !dom.vistaMenu.classList.contains('oculto')) {
        renderEncuestasPropias();
        var partes = [];
        if (res.agregadas) partes.push(res.agregadas + ' recuperada(s)');
        if (res.actualizadas) partes.push(res.actualizadas + ' actualizada(s)');
        mostrarAviso('Encuestas suyas desde la base central: ' + partes.join(' y ') + '.');
      }
    });
  }

  /**
   * Avance central: lo que la base de CIENFI ha recibido desde TODOS los
   * equipos. Complementa las tablas locales del panel, que solo pueden ver
   * lo diligenciado en este computador.
   */
  function cargarAvanceCentral() {
    if (!dom.tablaCentral) return;
    dom.pillCentral.textContent = '';
    dom.tablaCentral.innerHTML = '';

    if (!window.Sincronizacion || !window.Sincronizacion.configurada()) {
      dom.panelCentralNota.textContent = 'El envío a la base central no está configurado.';
      statsCentral = null;
      renderPanel();
      return;
    }
    dom.panelCentralNota.textContent = 'Consultando la base central…';

    window.Sincronizacion.consultarAvance().then(function (lista) {
      if (!lista) {
        dom.panelCentralNota.textContent = 'La vista central no está disponible: requiere conexión ' +
          'a internet y el receptor actualizado.';
        statsCentral = null;
        renderPanel();
        return;
      }
      /* Todo el panel pasa a reflejar la operación completa: es lo que
         necesita quien coordina. Lo de este equipo solo se usa si el centro
         no responde (ver renderPanel). */
      statsCentral = estadisticasDeCentral(lista);
      renderPanel();
      renderTablaCentral(lista);
    });
  }

  function renderTablaCentral(lista) {
    if (!lista.length) {
      dom.panelCentralNota.textContent = 'La base central todavía no ha recibido encuestas.';
      dom.tablaCentral.innerHTML = '';
      return;
    }

    // Más recientes primero.
    lista.sort(function (a, b) {
      var fa = (a.fecha_finalizacion || '') + ' ' + (a.hora_finalizacion || '');
      var fb = (b.fecha_finalizacion || '') + ' ' + (b.hora_finalizacion || '');
      return fb.localeCompare(fa);
    });

    dom.pillCentral.textContent = lista.length + ' recibida(s)';

    /* Mismo tope que la tabla local: una operación grande no debe volver
       pesado el panel (en celular cada fila se apila como tarjeta). */
    var TOPE = 200;
    var recortada = lista.slice(0, TOPE);
    dom.panelCentralNota.textContent =
      'Encuestas recibidas por la base central de CIENFI, de todos los equipos de la operación.' +
      (lista.length > TOPE ? ' Se muestran las ' + TOPE + ' más recientes de ' + lista.length + '.' : '');

    var filas = recortada.map(function (r) {
      var f = FORMULARIOS[r.tipo_formulario];
      var cuando = ((r.fecha_finalizacion || '') + ' ' + (r.hora_finalizacion || '')).trim();
      return '<tr>' +
        '<td data-etiqueta="ID encuesta">' + escapar(r.id_encuesta || '') + '</td>' +
        '<td data-etiqueta="Formulario">' + escapar(f ? f.nombreCorto : (r.tipo_formulario || '')) + '</td>' +
        '<td data-etiqueta="Diligenciador">' + escapar(r.usuario_nombre || r.usuario || '') + '</td>' +
        '<td data-etiqueta="Finalizada">' + escapar(cuando || 'Sin fecha') + '</td>' +
        '</tr>';
    }).join('');

    dom.tablaCentral.innerHTML =
      '<thead><tr><th>ID encuesta</th><th>Formulario</th><th>Diligenciador</th><th>Finalizada</th></tr></thead>' +
      '<tbody>' + filas + '</tbody>';
  }

  /** Registros que la sesión puede ver, ya filtrados por la interfaz. */
  function registrosFiltrados() {
    var filtro = {};
    if (dom.filtroTipo.value) filtro.tipo_formulario = dom.filtroTipo.value;
    if (dom.filtroUsuario.value) filtro.usuario = dom.filtroUsuario.value;
    if (dom.filtroEstado.value) filtro.estado = dom.filtroEstado.value;
    return window.Almacen.listar(filtro);
  }

  /**
   * Estadísticas de la operación COMPLETA, calculadas con lo que devuelve la
   * base central. Produce la misma forma que Almacen.estadisticas(), para que
   * el panel se dibuje igual venga de donde venga el dato.
   *
   * Los borradores NO existen aquí: una encuesta sin finalizar nunca sale del
   * equipo donde se está diligenciando. Ese indicador sigue siendo local y va
   * rotulado como tal.
   */
  function estadisticasDeCentral(lista) {
    var porUsuario = {};
    var porHogar = {};
    var totalPersonas = 0;
    var ultima = null;

    /* Un receptor anterior no devuelve id_hogar ni n_personas. En ese caso
       esos dos indicadores no se pueden calcular, y mostrar «0» sería
       mentir: se marcan como no disponibles (null → «—» en pantalla). */
    var hayHogar = lista.some(function (r) { return r.id_hogar !== undefined; });
    var hayPersonas = lista.some(function (r) { return r.n_personas !== undefined; });

    lista.forEach(function (r) {
      var k = r.usuario || '(sin usuario)';
      if (!porUsuario[k]) {
        porUsuario[k] = { usuario: k, nombre: r.usuario_nombre || k, vivienda: 0, personas: 0, total: 0, ultima: null };
      }
      if (porUsuario[k][r.tipo_formulario] !== undefined) porUsuario[k][r.tipo_formulario] += 1;
      porUsuario[k].total += 1;

      var cuando = ((r.fecha_finalizacion || '') + ' ' + (r.hora_finalizacion || '')).trim();
      if (cuando && (!porUsuario[k].ultima || cuando > porUsuario[k].ultima)) porUsuario[k].ultima = cuando;
      if (cuando && (!ultima || cuando > ultima)) ultima = cuando;

      if (r.id_hogar) {
        if (!porHogar[r.id_hogar]) porHogar[r.id_hogar] = {};
        porHogar[r.id_hogar][r.tipo_formulario] = true;
      }
      if (r.tipo_formulario === 'personas') totalPersonas += (Number(r.n_personas) || 0);
    });

    return {
      total: lista.length,
      vivienda: lista.filter(function (r) { return r.tipo_formulario === 'vivienda'; }).length,
      personas: lista.filter(function (r) { return r.tipo_formulario === 'personas'; }).length,
      personasRegistradas: hayPersonas ? totalPersonas : null,
      hogaresCompletos: hayHogar ? Object.keys(porHogar).filter(function (h) {
        return porHogar[h].vivienda && porHogar[h].personas;
      }).length : null,
      hogares: hayHogar ? Object.keys(porHogar).length : null,
      incompleto: !hayHogar || !hayPersonas,
      ultimaActividad: ultima,
      porUsuario: Object.keys(porUsuario).map(function (k) { return porUsuario[k]; })
        .sort(function (a, b) { return b.total - a.total; })
    };
  }

  /**
   * Dibuja los indicadores y las tablas de avance.
   * `stats` puede venir de la base central (toda la operación) o del propio
   * equipo, cuando el centro no está disponible; `central` dice cuál es, para
   * que la pantalla nunca engañe sobre lo que está mostrando.
   */
  function renderPanel() {
    var local = window.Almacen.estadisticas();
    var central = !!statsCentral;
    var stats = statsCentral || local;

    var ambito = central ? 'toda la operación' : 'este equipo';
    dom.panelSubtitulo.textContent = central
      ? 'Indicadores y tablas de TODA la operación, según lo recibido por la base central de CIENFI.'
      : 'Sin conexión con la base central: los indicadores y las tablas cuentan solo lo diligenciado en ESTE equipo.';
    if (dom.panelAmbito) {
      dom.panelAmbito.textContent = central ? 'Todos los equipos' : 'Solo este equipo';
      dom.panelAmbito.className = 'pill ' + (central ? 'pill-ok' : 'pill-suave');
    }

    if (central && stats.incompleto) {
      dom.panelSubtitulo.textContent += ' Dos indicadores aparecen como «—»: ' +
        'el receptor publicado en Google todavía no envía esos datos (actualícelo).';
    }

    dom.panelTarjetas.innerHTML = [
      indicador('Formularios finalizados · ' + ambito, stats.total, true),
      indicador('Edificaciones', stats.vivienda),
      indicador('Personas y familias', stats.personas),
      indicador('Personas registradas', stats.personasRegistradas),
      indicador('Hogares con los dos formularios', stats.hogaresCompletos),
      // Los borradores viven solo en el equipo donde se están diligenciando.
      indicador('Borradores sin finalizar · este equipo', local.borradores)
    ].join('');

    var maximo = Math.max(stats.vivienda, stats.personas, 1);
    dom.panelAvanceTipo.innerHTML =
      barra('Registro de edificaciones', stats.vivienda, maximo, '') +
      barra('Registro de personas y familias', stats.personas, maximo, 'naranja') +
      '<p class="hint">Última encuesta registrada: <strong>' +
        (stats.ultimaActividad ? fechaLegible(stats.ultimaActividad) : 'todavía ninguna') +
      '</strong></p>';

    renderTablaDiligenciadores(stats);
    actualizarFiltroUsuarios();
    renderTablaRegistros();
    refrescarEstadoSync();
    ajustarTablas();
  }

  function indicador(etiqueta, valor, destacado) {
    // null = el dato no está disponible. Nunca se muestra 0 en su lugar.
    var texto = (valor === null || valor === undefined) ? '—' : valor;
    return '<div class="indicador' + (destacado ? ' destacado' : '') + '">' +
      '<span class="etiqueta">' + escapar(etiqueta) + '</span>' +
      '<strong>' + texto + '</strong></div>';
  }

  function barra(etiqueta, valor, maximo, clase) {
    var pct = maximo ? Math.round((valor / maximo) * 100) : 0;
    return '<div class="barra-fila">' +
      '<div class="barra-etiquetas"><span>' + escapar(etiqueta) + '</span><span>' + valor + '</span></div>' +
      '<div class="barra-pista"><div class="barra-relleno ' + clase + '" style="width:' + pct + '%"></div></div>' +
    '</div>';
  }

  function renderTablaDiligenciadores(stats) {
    if (!stats.porUsuario.length) {
      dom.tablaDiligenciadores.innerHTML =
        '<tbody><tr><td class="tabla-vacia">Todavía no hay encuestas finalizadas.</td></tr></tbody>';
      return;
    }
    // El atributo data-etiqueta es lo que la tabla muestra como rótulo de cada
    // dato cuando en celular las filas se apilan como tarjetas.
    var filas = stats.porUsuario.map(function (u) {
      return '<tr>' +
        '<td data-etiqueta="Diligenciador">' + escapar(u.nombre) + '</td>' +
        '<td class="numero" data-etiqueta="Vivienda">' + u.vivienda + '</td>' +
        '<td class="numero" data-etiqueta="Personas / Familia">' + u.personas + '</td>' +
        '<td class="numero total" data-etiqueta="Total">' + u.total + '</td>' +
        '<td data-etiqueta="Última encuesta">' + (u.ultima ? fechaLegible(u.ultima) : '—') + '</td>' +
      '</tr>';
    }).join('');

    dom.tablaDiligenciadores.innerHTML =
      '<thead><tr><th>Diligenciador</th><th class="numero">Vivienda</th>' +
      '<th class="numero">Personas / Familia</th><th class="numero">Total</th>' +
      '<th>Última encuesta</th></tr></thead><tbody>' + filas +
      '<tr><td data-etiqueta="Diligenciador"><strong>Total</strong></td>' +
        '<td class="numero total" data-etiqueta="Vivienda">' + stats.vivienda + '</td>' +
        '<td class="numero total" data-etiqueta="Personas / Familia">' + stats.personas + '</td>' +
        '<td class="numero total" data-etiqueta="Total">' + stats.total + '</td>' +
        '<td data-etiqueta="Última encuesta">—</td></tr>' +
      '</tbody>';
  }

  function actualizarFiltroUsuarios() {
    var visibles = window.Almacen.listar();
    var usuarios = {};
    visibles.forEach(function (r) { usuarios[r.usuario] = r.usuario_nombre || r.usuario; });

    var seleccionado = dom.filtroUsuario.value;
    dom.filtroUsuario.innerHTML = '<option value="">Todos</option>' +
      Object.keys(usuarios).map(function (u) {
        return '<option value="' + escapar(u) + '"' + (u === seleccionado ? ' selected' : '') + '>' +
          escapar(usuarios[u]) + '</option>';
      }).join('');
  }

  function renderTablaRegistros() {
    var registros = registrosFiltrados();
    var conteos = window.Exportador.conteos(registros);

    dom.registrosConteo.textContent = registros.length + ' registro(s) con los filtros aplicados.';
    dom.descargaResumen.textContent =
      'Con los filtros aplicados se exportarían: ' + conteos.viviendas + ' vivienda(s), ' +
      conteos.personas_hogares + ' hogar(es) del formulario de personas, ' +
      conteos.personas + ' persona(s) y ' + conteos.indice + ' fila(s) de índice.';

    if (!registros.length) {
      dom.tablaRegistros.innerHTML =
        '<tbody><tr><td class="tabla-vacia">No hay registros con los filtros aplicados.</td></tr></tbody>';
      return;
    }

    var filas = registros.slice(0, 200).map(function (r) {
      var f = FORMULARIOS[r.tipo_formulario];
      return '<tr>' +
        '<td data-etiqueta="ID encuesta">' + escapar(r.id_encuesta) + '</td>' +
        '<td data-etiqueta="Formulario">' + f.icono + ' ' + escapar(f.nombreCorto) + '</td>' +
        '<td data-etiqueta="Hogar">' + escapar(r.id_hogar || '') + '</td>' +
        '<td data-etiqueta="Diligenciador">' + escapar(r.usuario_nombre || r.usuario) + '</td>' +
        '<td data-etiqueta="Estado">' + (r.estado === 'finalizada'
            ? '<span class="pill pill-ok">Finalizada</span>'
            : '<span class="pill pill-atencion">Borrador</span>') + '</td>' +
        '<td data-etiqueta="Respaldo">' + pildoraSync(r) + '</td>' +
        '<td data-etiqueta="Última actualización">' + fechaLegible(r.fecha_actualizacion) + '</td>' +
        '<td data-etiqueta="Identificación">' + escapar(resumenEncuesta(r)) + '</td>' +
      '</tr>';
    }).join('');

    dom.tablaRegistros.innerHTML =
      '<thead><tr><th>ID encuesta</th><th>Formulario</th><th>Hogar</th>' +
      '<th>Diligenciador</th><th>Estado</th><th>Respaldo</th><th>Última actualización</th>' +
      '<th>Identificación</th></tr></thead>' +
      '<tbody>' + filas + '</tbody>' +
      (registros.length > 200
        ? '<tfoot><tr><td colspan="9" class="hint">Se muestran los 200 más recientes. La descarga incluye todos.</td></tr></tfoot>'
        : '');
  }

  // --- Descargas ------------------------------------------------------------

  function sufijoDescarga() {
    var partes = [];
    if (dom.filtroTipo.value) partes.push(dom.filtroTipo.value);
    if (dom.filtroUsuario.value) partes.push(CFG.normalizar(dom.filtroUsuario.value));
    return partes.join('_');
  }

  function descargarArchivo(clave) {
    var res = window.Exportador.descargarCsv(clave, registrosFiltrados(), {
      separador: dom.filtroSeparador.value,
      sufijo: sufijoDescarga()
    });
    mostrarAviso(res.mensaje, !res.ok);
  }

  function descargarTodo() {
    var registros = registrosFiltrados();
    var claves = ['indice', 'viviendas', 'personas_hogares', 'personas', 'diccionario'];
    var descargados = 0;
    // Se separan en el tiempo porque algunos navegadores bloquean descargas
    // múltiples disparadas en el mismo instante.
    claves.forEach(function (clave, i) {
      setTimeout(function () {
        var res = window.Exportador.descargarCsv(clave, registros, {
          separador: dom.filtroSeparador.value,
          sufijo: sufijoDescarga()
        });
        if (res.ok) descargados++;
        if (i === claves.length - 1) {
          mostrarAviso(descargados + ' archivo(s) descargado(s).');
        }
      }, i * 600);
    });
  }

  function descargarRespaldo() {
    var nombre = 'respaldo_encuestas_' + window.Exportador.selloTiempo() + '.json';
    window.Exportador.descargarTexto(nombre, window.Almacen.exportarRespaldo());
    mostrarAviso('Respaldo descargado: ' + nombre);
  }

  function restaurarRespaldo(evento) {
    var archivo = evento.target.files[0];
    if (!archivo) return;
    var lector = new FileReader();
    lector.onload = function () {
      var res = window.Almacen.importarRespaldo(String(lector.result));
      mostrarAviso(res.mensaje, !res.ok);
      if (res.ok) {
        var rol = CFG.roles[sesion.rol] || {};
        if (rol.puedeConsultar) renderPanel();
        else renderEncuestasPropias();
      }
    };
    lector.readAsText(archivo);
    evento.target.value = '';
  }

  // ==========================================================================
  //  RESPALDO CENTRALIZADO
  // ==========================================================================

  /**
   * Refresca el indicador de la barra superior y el panel del coordinador.
   * Recibe el estado que publica la capa de sincronización.
   */
  function refrescarEstadoSync(est) {
    if (!window.Sincronizacion || !dom.pillSync) return;
    est = est || window.Sincronizacion.estado();

    if (!est.configurada) {
      // Sin destino configurado no se muestra el indicador: no hay nada que
      // informar, y una píldora permanente en gris solo genera dudas.
      dom.pillSync.classList.add('oculto');
      if (dom.syncMensaje) {
        dom.syncMensaje.innerHTML = 'El envío automático a la base central todavía no está ' +
          'configurado. La aplicación sigue guardando en este equipo y permite descargar ' +
          'los CSV y el respaldo con normalidad.';
      }
      if (dom.btnSincronizar) dom.btnSincronizar.disabled = true;
      if (dom.btnProbarSync) dom.btnProbarSync.disabled = true;
      if (dom.syncEstadoPill) {
        dom.syncEstadoPill.textContent = 'Sin configurar';
        dom.syncEstadoPill.className = 'pill pill-suave';
      }
      return;
    }

    dom.pillSync.classList.remove('oculto');
    if (dom.btnSincronizar) dom.btnSincronizar.disabled = est.enviando;
    if (dom.btnProbarSync) dom.btnProbarSync.disabled = false;

    var texto, clase;
    if (est.enviando) {
      texto = 'Enviando…';
      clase = 'pill-atencion';
    } else if (!est.enLinea) {
      texto = 'Sin conexión · ' + est.pendientes + ' por enviar';
      clase = 'pill-atencion';
    } else if (est.pendientes > 0) {
      texto = est.pendientes + ' por enviar';
      clase = 'pill-atencion';
    } else {
      texto = 'Todo enviado ✓';
      clase = 'pill-ok';
    }
    dom.pillSync.textContent = texto;
    dom.pillSync.className = 'pill pill-sync ' + clase;
    dom.pillSync.title = 'Estado del envío a la base central. Pulse para enviar ahora.';

    if (dom.syncEstadoPill) {
      dom.syncEstadoPill.textContent = texto;
      dom.syncEstadoPill.className = 'pill ' + clase;
    }

    if (dom.syncMensaje) {
      var conteo = window.Almacen.conteoSync();
      var partes = ['Destino: <strong>' + escapar(est.destino) + '</strong>.'];
      partes.push(est.pendientes === 0
        ? 'No hay encuestas pendientes de enviar desde este equipo.'
        : '<strong>' + est.pendientes + '</strong> encuesta(s) pendiente(s) de enviar. ' +
          'Quedan guardadas aquí hasta que se confirmen.');
      partes.push('En este equipo: ' + conteo.sincronizadas + ' enviada(s), ' +
        conteo.borradores + ' borrador(es) sin finalizar (los borradores no se envían).');
      if (est.ultimoError) {
        partes.push('<span class="sync-error">Último aviso: ' + escapar(est.ultimoError) + '</span>');
      }
      dom.syncMensaje.innerHTML = partes.join(' ');
    }
  }

  function sincronizarAhora(silencioso) {
    if (!window.Sincronizacion.configurada()) {
      mostrarAviso('El envío a la base central todavía no está configurado. La ' +
        'información está guardada en este equipo.', true);
      return;
    }
    window.Sincronizacion.sincronizarAhora(silencioso).then(function (res) {
      if (silencioso) return;
      if (res.enviadas) {
        mostrarAviso(res.enviadas + ' encuesta(s) enviada(s) a la base central.');
      } else if (res.fallidas) {
        mostrarAviso('No se pudo enviar: ' + res.ultimoError, true);
      } else if (res.pendientes === 0) {
        mostrarAviso('No hay encuestas pendientes de enviar.');
      }
      var rol = (sesion && CFG.roles[sesion.rol]) || {};
      if (rol.puedeConsultar) renderPanel();
    });
  }

  function probarConexionSync() {
    dom.btnProbarSync.disabled = true;
    if (dom.syncMensaje) dom.syncMensaje.textContent = 'Probando la conexión…';
    window.Sincronizacion.probarConexion().then(function (res) {
      dom.btnProbarSync.disabled = false;
      mostrarAviso(res.mensaje, !res.ok);
      refrescarEstadoSync();
    });
  }

  // ==========================================================================
  //  UTILIDADES
  // ==========================================================================

  function escapar(texto) {
    return String(texto === undefined || texto === null ? '' : texto)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fechaLegible(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    var p = function (n) { return String(n).padStart(2, '0'); };
    return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /** Solo la hora, en formato de 12 horas: "10:48 a. m.". */
  function horaCorta(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    var h = d.getHours();
    var sufijo = h < 12 ? 'a. m.' : 'p. m.';
    var h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + ':' + String(d.getMinutes()).padStart(2, '0') + ' ' + sufijo;
  }

  /** Fecha relativa corta para las listas: "hace 5 min", "ayer 14:03". */
  function haceCuanto(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    var minutos = Math.floor((Date.now() - d.getTime()) / 60000);
    if (minutos < 1) return 'hace un momento';
    if (minutos < 60) return 'hace ' + minutos + ' min';
    var hoy = new Date();
    var mismoDia = d.toDateString() === hoy.toDateString();
    if (mismoDia) return 'hoy ' + horaCorta(iso);
    return fechaLegible(iso);
  }

  var temporizadorAviso = null;
  function mostrarAviso(mensaje, esError) {
    dom.toast.textContent = mensaje;
    dom.toast.className = 'toast visible' + (esError ? ' error' : '');
    clearTimeout(temporizadorAviso);
    temporizadorAviso = setTimeout(function () {
      dom.toast.className = 'toast';
    }, esError ? 7000 : 3800);
  }
})();
