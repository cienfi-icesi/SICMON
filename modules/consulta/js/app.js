/* ============================================================
   Aplicativo de consulta — lógica
   ------------------------------------------------------------
   Pide los datos por fetch al Apps Script (js/config-consulta.js)
   y los deja en DATOS, que es la forma que consume toda la
   pantalla. Antes ese mismo objeto llegaba de un archivo estático
   js/datos.js que el pipeline escribía dentro del repositorio;
   cambió de dónde salen los datos, no cómo se dibujan.

   POR QUÉ CAMBIÓ
   Aquel archivo ponía cédulas, direcciones y estado de salud en un
   repositorio público, y obligaba a hacer commit para que el sitio
   publicado se actualizara. Ahora el repositorio no lleva ningún
   dato personal y la consulta se actualiza sola.

   Dos modos de ingreso, con dos puertas distintas del receptor:
     · Ciudadano  sin credenciales. Pide 'consultar_cedula' y recibe
                  UN registro: el de esa cédula, su hogar y su
                  edificación. Nunca una lista.
     · Equipo     usuario y contraseña. La contraseña ES el
                  TOKEN_LECTURA del Apps Script: no está escrita en
                  ningún archivo de este sitio y quien la valida es
                  Google, no este código. Se cambia en las
                  Propiedades del script.

   CONSECUENCIA: este aplicativo ya NO funciona con doble clic desde
   el disco. El navegador bloquea fetch sobre file://. Hay que
   abrirlo servido por http, que es como queda en GitHub Pages.
   ============================================================ */

(function () {
  'use strict';

  var VACIO = { actualizado: '', personas: [], familias: [], viviendas: [], afectaciones: [],
                fichas: {}, diccionario: [], revisar: [], duplicados: [] };

  var DATOS = JSON.parse(JSON.stringify(VACIO));

  var CFG = window.CONFIG_CONSULTA || {};
  var CLAVE_OBS = 'alcaldia_sismos_observaciones_v1';
  var sesion = null;

  /* Quiénes pueden entrar. Se toma la MISMA lista del aplicativo de campo
     (../edan/js/config.js, que index.html carga antes que este archivo), para
     que dar de alta a alguien sea una sola línea en un solo sitio y no haya
     forma de que quede habilitado en una aplicación y no en la otra.

     Se aceptan el nombre de usuario canónico (claudia-rincon), sus alias y sus
     nombres anteriores, porque de eso ya se encarga fichaDe() allá.

     LA CONTRASEÑA NO SALE DE AHÍ, y no puede. La que se teclea en esta pantalla
     es el TOKEN_LECTURA del Apps Script: es la que Google compara antes de
     entregar las tablas, y por eso no está escrita en ningún archivo de este
     sitio. La cédula que config.js usa como clave sirve para entrar al
     aplicativo de campo, que trabaja sin conexión y guarda todo en el propio
     teléfono; aquí lo que hay al otro lado es la base consolidada entera, así
     que quien decide es el servidor y no el navegador.

     Consecuencia práctica: la contraseña es la misma para todo el equipo. El
     usuario sirve para que las observaciones queden firmadas con un nombre real
     y no con lo que alguien teclee. Para una clave por persona haría falta que
     el Apps Script guardara una por funcionario, que es otra decisión.

     Quitarle el acceso a TODOS = cambiar TOKEN_LECTURA en las Propiedades del
     script de Google. Surte efecto de inmediato, sin publicar nada. */
  var USUARIOS = (window.APP_CONFIG && window.APP_CONFIG.usuarios) || [
    { usuario: 'administrador', nombre: 'Administrador' }
  ];

  /* ---------- utilidades ---------- */

  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  function normalizarCedula(texto) {
    return String(texto || '').replace(/[^0-9]/g, '').replace(/^0+/, '');
  }

  function normalizarTexto(texto) {
    return String(texto || '').toUpperCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Z0-9 ]/g, ' ').replace(/ +/g, ' ').trim();
  }

  function valor(v) {
    return (v === null || v === undefined || v === '') ? '—' : String(v);
  }

  function escapar(v) {
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ---------- red: el receptor del Apps Script ---------- */

  /* Una petición al receptor. El cuerpo va como text/plain aunque sea JSON:
     las Web App de Apps Script no atienden peticiones que disparen la
     verificación previa del navegador, y el script lo interpreta igual.
     Es el mismo patrón que usa la aplicación de campo desde hace meses
     (../edan/js/sincronizacion.js). */
  function pedir(cuerpo) {
    cuerpo.token = CFG.token;
    var control = new AbortController();
    var corte = setTimeout(function () { control.abort(); }, CFG.tiempoLimite || 60000);

    return fetch(CFG.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(cuerpo),
      redirect: 'follow',
      signal: control.signal
    })
      .then(function (r) {
        clearTimeout(corte);
        if (!r.ok) throw new Error('El servidor respondió ' + r.status);
        return r.text();
      })
      .then(function (t) {
        var d = JSON.parse(t);
        if (!d.ok) throw new Error(d.error || 'error_desconocido');
        return d;
      });
  }

  /* La hoja guarda TODO como texto plano —a propósito: así una cédula con
     ceros a la izquierda no se convierte en número por el camino—. Pero la
     pantalla compara `duplicate === 1` de forma estricta, así que estas
     columnas hay que devolverlas a número al llegar.

     Va por lista explícita y no por «si parece número, conviértelo»: con esa
     regla las cédulas y los id_hogar también se convertirían, y la búsqueda
     ciudadana, que compara documento como texto, dejaría de encontrar a nadie. */
  var NUMERICAS = ['edad', 'duplicate', 'persona_duplicada', 'match_confidence',
                   'confianza', 'n_personas', 'latitud', 'longitud',
                   'fallecidos', 'atrapadas', 'necesitan_evacuar',
                   'cantidad_viviendas', 'fotos_cantidad'];

  function anumerar(fila) {
    NUMERICAS.forEach(function (campo) {
      if (!(campo in fila)) return;
      var v = fila[campo];
      if (v === '' || v === null || v === undefined) { fila[campo] = null; return; }
      var n = Number(v);
      if (!isNaN(n)) fila[campo] = n;
    });
    return fila;
  }

  /* Las tablas del equipo viajan comprimidas —encabezados aparte, filas como
     listas— porque repetir el nombre de cada campo en cada fila multiplicaría
     el tamaño de la respuesta. Aquí se vuelven objetos. */
  function aObjetos(encabezados, filas) {
    return filas.map(function (fila) {
      var obj = {};
      for (var i = 0; i < encabezados.length; i++) obj[encabezados[i]] = fila[i];
      return anumerar(obj);
    });
  }

  /* Una tabla completa: se piden páginas hasta que hay_mas venga en falso. */
  function traerTabla(nombre, password) {
    var acumulado = [];

    function pagina(desde) {
      return pedir({ accion: 'consulta_completa', tabla: nombre,
                     token_lectura: password, desde: desde,
                     limite: CFG.filasPorPagina || 2000 })
        .then(function (d) {
          if (d.devueltas > 0) acumulado = acumulado.concat(aObjetos(d.encabezados, d.filas));
          if (d.hay_mas) return pagina(desde + d.devueltas);
          return { filas: acumulado, actualizado: d.actualizado };
        });
    }

    return pagina(1);
  }

  /* Las fichas llegan como id_registro + JSON y se rearman en el objeto
     {id: {respuestas}} que espera abrirFicha(). */
  function aFichas(filas) {
    var fichas = {};
    filas.forEach(function (f) {
      try { fichas[f.id_registro] = JSON.parse(f.contenido); }
      catch (e) { /* una ficha ilegible no puede tumbar la carga entera */ }
    });
    return fichas;
  }

  function indexarDiccionario() {
    DICC = {};
    (DATOS.diccionario || []).forEach(function (d) { DICC[d.variable] = d; });
  }

  var ETIQUETA_MATCH = {
    matched_hogar:  { texto: 'Vivienda asociada (código de hogar)', chip: 'chip--verde' },
    matched_cedula: { texto: 'Vivienda asociada (cédula)',          chip: 'chip--verde' },
    ambiguous:      { texto: 'Varias viviendas posibles',           chip: 'chip--ambar' },
    no_match:       { texto: 'Sin vivienda asociada',               chip: 'chip--rojo' }
  };

  function chipMatch(status) {
    var e = ETIQUETA_MATCH[status] || { texto: 'Sin información', chip: 'chip--gris' };
    return '<span class="chip ' + e.chip + '">' + e.texto + '</span>';
  }

  function chipSiNo(marcado) {
    return marcado
      ? '<span class="chip chip--ambar">Sí</span>'
      : '<span class="chip chip--gris">No</span>';
  }

  /* estado de colapso: el color sigue la gravedad real de la categoría */
  function chipColapso(v) {
    if (!v) return '—';
    var t = String(v).toLowerCase();
    var clase = t.indexOf('colapsado') !== -1 ? 'chip--rojo'
              : t.indexOf('riesgo') !== -1    ? 'chip--ambar'
              : 'chip--gris';
    return '<span class="chip ' + clase + '">' + escapar(v) + '</span>';
  }

  function chipFotos(n) {
    var c = parseInt(n, 10);
    if (!c) return '—';
    return '<span class="chip chip--gris">' + c + (c === 1 ? ' foto' : ' fotos') + '</span>';
  }

  /* ---------- cruce sugerido afectación <-> edificación ----------
     El reporte de afectación no trae cédula ni código de hogar, así que no
     entra en el matching de hogares. Lo único que comparte con las
     edificaciones es la dirección del edificio, y sobre esa llave el pipeline
     (03_matching.R) produce una SUGERENCIA. Es 1:N: el reporte cubre el
     edificio completo y bajo esa dirección puede haber varios hogares.
     Aquí solo se indexa en los dos sentidos; el cruce ya viene resuelto. */

  var CRUCE_DE_AFECTACION  = {};
  var CRUCE_DE_EDIFICACION = {};
  (DATOS.cruce || []).forEach(function (c) {
    (CRUCE_DE_AFECTACION[c.id_encuesta_afectacion] =
       CRUCE_DE_AFECTACION[c.id_encuesta_afectacion] || []).push(c);
    (CRUCE_DE_EDIFICACION[c.id_encuesta_vivienda] =
       CRUCE_DE_EDIFICACION[c.id_encuesta_vivienda] || []).push(c);
  });

  function chipCruce(n) {
    var c = parseInt(n, 10);
    if (!c) return '<span class="chip chip--gris">Sin cruce</span>';
    return '<span class="chip chip--azul">' + c +
           (c === 1 ? ' edificación' : ' edificaciones') + '</span>';
  }

  /* ---------- soportes fotográficos ----------
     El pipeline entrega los enlaces de Drive separados por |. De un enlace de
     Drive se puede sacar el id del archivo y con él una miniatura; si el
     permiso del archivo no la deja ver, la imagen falla y en su lugar queda
     el enlace, que siempre funciona para quien tenga acceso a la carpeta. */

  function idDeDrive(url) {
    var m = String(url).match(/\/d\/([-\w]{20,})/) || String(url).match(/[?&]id=([-\w]{20,})/);
    return m ? m[1] : null;
  }

  function separarLista(texto) {
    return String(texto || '').split('|').map(function (s) { return s.trim(); })
                              .filter(function (s) { return s; });
  }

  function galeriaFotos(enlaces, nombres) {
    var urls = separarLista(enlaces);
    if (!urls.length) return '<p class="nota">Este reporte no tiene soportes fotográficos.</p>';
    var noms = separarLista(nombres);
    return '<div class="galeria">' + urls.map(function (url, i) {
      var id = idDeDrive(url);
      var rotulo = noms[i] || ('Foto ' + (i + 1));
      var miniatura = id
        ? '<img class="galeria__img" loading="lazy" alt="' + escapar(rotulo) + '"' +
          ' src="https://drive.google.com/thumbnail?id=' + escapar(id) + '&sz=w400"' +
          ' onerror="this.classList.add(\'galeria__img--rota\')" />'
        : '<span class="galeria__sinvista">Vista previa no disponible</span>';
      return '<a class="galeria__item" href="' + escapar(url) + '" target="_blank" rel="noopener"' +
             ' title="' + escapar(rotulo) + '">' + miniatura +
             '<span class="galeria__pie">' + escapar(rotulo) + '</span></a>';
    }).join('') + '</div>';
  }

  /* ---------- diccionario: etiquetas de variables ---------- */

  /* se llena cuando llegan los datos, con indexarDiccionario() */
  var DICC = {};

  /* ---------- observaciones (almacenamiento local) ---------- */

  function leerObs() {
    try { return JSON.parse(localStorage.getItem(CLAVE_OBS)) || {}; }
    catch (e) { return {}; }
  }

  function guardarObs(todas) {
    localStorage.setItem(CLAVE_OBS, JSON.stringify(todas));
  }

  function obsDe(id) { return leerObs()[id] || []; }

  function agregarObs(id, texto) {
    var todas = leerObs();
    if (!todas[id]) todas[id] = [];
    todas[id].push({ texto: texto,
                     usuario: sesion ? sesion.nombre : 'equipo',
                     fecha: new Date().toISOString().slice(0, 16).replace('T', ' ') });
    guardarObs(todas);
  }

  /* ---------- navegación ---------- */

  function mostrarVista(nombre) {
    $$('.vista').forEach(function (v) { v.classList.add('oculto'); });
    $('#vista-' + nombre).classList.remove('oculto');
    var nav = $('#nav-principal');
    if (nombre === 'rol') {
      nav.innerHTML = '';
      $('#etiqueta-modo').textContent = 'Consulta de información';
    } else if (nombre === 'ciudadano') {
      nav.innerHTML = '<a class="nav__enlace" href="#" id="nav-salir">← Cambiar de modo</a>';
      $('#etiqueta-modo').textContent = 'Consulta ciudadana';
    } else {
      nav.innerHTML = '<span class="nav__usuario mono">' + escapar(sesion.nombre) + '</span>' +
                      '<a class="nav__enlace" href="#" id="nav-salir">Salir</a>';
      $('#etiqueta-modo').textContent = 'Equipo a cargo de la base · Uso interno';
    }
    var salir = $('#nav-salir');
    if (salir) salir.addEventListener('click', function (ev) {
      ev.preventDefault();
      sesion = null;
      sessionStorage.removeItem('consulta_sesion');
      mostrarVista('rol');
    });
  }

  /* ---------- fecha de actualización ---------- */

  /* la trae el receptor con cada respuesta (pestaña c_meta): es el momento en
     que el pipeline terminó de publicar, no el de esta consulta */
  function pintarActualizado() {
    var fecha = (DATOS.actualizado || '').replace('T', ' ');
    $('#actualizado').textContent = fecha ? ('Actualizada: ' + fecha) : '';
    $('#pie-actualizado').textContent = fecha ? ('Base actualizada: ' + fecha) : '';
  }

  pintarActualizado();

  /* ============================================================
     FICHA COMPLETA: todas las respuestas del formulario
     ============================================================ */

  /* Ficha del reporte de afectación: se arma con los campos de la tabla, no
     con el diccionario, porque este formulario tiene su propia estructura
     (conteos por evento y soportes fotográficos) y no está en el libro de
     códigos del EDAN. */
  function fichaAfectacion(r) {
    var dato = function (etiqueta, v) {
      return '<div class="dato"><b>' + escapar(etiqueta) + ':</b> ' + escapar(valor(v)) + '</div>';
    };
    var bloque = function (titulo, contenido) {
      return '<h3 class="ficha-seccion">' + escapar(titulo) + '</h3>' +
             '<div class="ficha__grupo">' + contenido + '</div>';
    };

    return bloque('1 · Identificación del reporte',
        dato('Registro', r.id_encuesta) +
        dato('Consecutivo CMGRD', r.consecutivo_id) +
        dato('Organismo', r.organismo) +
        dato('Diligenciado por', r.diligencia_nombre) +
        dato('Grupo de voluntarios', r.grupo_voluntarios) +
        dato('Fecha', r.fecha)) +

      bloque('2 · Ubicación',
        dato('Edificación', r.nombre_edificacion) +
        dato('Dirección', r.direccion_completa) +
        dato('Barrio', r.barrio) +
        dato('Comuna', r.comuna) +
        dato('Coordenadas', (r.latitud != null && r.longitud != null)
             ? (r.latitud + ', ' + r.longitud) : null)) +

      bloque('3 · Afectación encontrada',
        '<div class="dato dato--ancho"><b>Descripción:</b> ' + escapar(valor(r.descripcion)) + '</div>' +
        dato('Colapso', r.colapso) +
        dato('Requieren evacuación', r.requieren_evacuacion)) +

      bloque('4 · Personas afectadas (conteos declarados en el reporte)',
        dato('Fallecidas', r.fallecidos) +
        dato('Atrapadas', r.atrapadas) +
        dato('Necesitan evacuar', r.necesitan_evacuar)) +

      bloque('5 · Edificación atendida',
        dato('Tipo de edificación', r.tipo_edificacion) +
        dato('Viviendas caracterizadas y atendidas', r.cantidad_viviendas)) +

      bloque('6 · Observaciones y soportes',
        '<div class="dato dato--ancho"><b>Observaciones:</b> ' + escapar(valor(r.observaciones)) + '</div>') +
      galeriaFotos(r.fotos_enlaces, r.fotos_nombres) +

      bloqueCruce(r.id_encuesta) +

      '<div class="ficha__meta">Origen: ' + escapar(valor(r.archivo_origen)) +
      ' · Actualizado: ' + escapar(valor(r.last_update).replace('T', ' ')) + '</div>';
  }

  /* Sección 7 de la ficha del reporte. Se rotula explícitamente como sugerencia
     porque no es un enlace confirmado: dos direcciones escritas igual pueden
     ser el mismo edificio o no, y quien revisa tiene que decidirlo. */
  function bloqueCruce(id) {
    var lista = CRUCE_DE_AFECTACION[id] || [];
    var titulo = '<h3 class="ficha-seccion">7 · Edificaciones del EDAN en esta dirección</h3>';

    if (!lista.length) {
      return titulo + '<p class="nota">Ninguna edificación del EDAN comparte dirección con este ' +
             'reporte. Puede que todavía no se haya diligenciado el formulario de vivienda, o que ' +
             'la dirección se haya escrito de otra forma.</p>';
    }

    return titulo +
      '<p class="nota">Cruce <b>sugerido por dirección</b>, sin confirmar. El reporte es de la ' +
      'edificación completa, así que bajo la misma dirección puede haber varios hogares del EDAN.</p>' +
      '<div class="ficha__grupo">' + lista.map(function (c) {
        return '<div class="dato dato--ancho">' +
          '<span class="mono">' + escapar(c.id_encuesta_vivienda) + '</span> · ' +
          escapar(valor(c.direccion_completa)) +
          (c.prop_nombre ? ' · ' + escapar(c.prop_nombre) : '') +
          (c.estado === 'confirmado'
             ? ' <span class="chip chip--verde">Confirmado</span>'
             : ' <span class="chip chip--azul">Sugerido</span>') +
          '</div>';
      }).join('') + '</div>';
  }

  function abrirFicha(id, titulo) {
    var cuerpo = $('#ficha-cuerpo');

    /* los reportes de afectación tienen ficha propia */
    var afe = (DATOS.afectaciones || []).filter(function (a) { return a.id_encuesta === id; })[0];
    if (afe) {
      $('#ficha-titulo').textContent = titulo || ('Reporte ' + id);
      cuerpo.innerHTML = fichaAfectacion(afe);
      $('#modal-ficha').classList.remove('oculto');
      return;
    }

    var ficha = (DATOS.fichas || {})[id];
    $('#ficha-titulo').textContent = titulo || ('Registro ' + id);
    if (!ficha) {
      cuerpo.innerHTML = '<p class="nota">No hay respuestas guardadas para este registro.</p>';
    } else {
      /* agrupar por sección usando el diccionario; metadatos al final */
      var grupos = {};
      var orden = [];
      Object.keys(ficha).forEach(function (variable) {
        if (/_etiqueta$/.test(variable) && ficha[variable.replace(/_etiqueta$/, '')] !== undefined) return;
        var base2 = variable.replace(/_etiqueta$/, '');
        var d = DICC[base2];
        var seccion = d ? (d.seccion_numero + ' · ' + d.seccion_titulo) : 'Metadatos del registro';
        if (!grupos[seccion]) { grupos[seccion] = []; orden.push(seccion); }
        var mostrado = ficha[base2 + '_etiqueta'] !== undefined ? ficha[base2 + '_etiqueta'] : ficha[variable];
        grupos[seccion].push({ etiqueta: d ? d.pregunta : base2, valor: mostrado, codigo: d ? d.codigo_pregunta : '' });
      });
      /* metadatos de último */
      orden.sort(function (a, b) {
        if (a === 'Metadatos del registro') return 1;
        if (b === 'Metadatos del registro') return -1;
        return a.localeCompare(b, 'es', { numeric: true });
      });
      cuerpo.innerHTML = orden.map(function (seccion) {
        return '<h3 class="ficha-seccion">' + escapar(seccion) + '</h3>' +
          '<div class="ficha__grupo">' +
          grupos[seccion].map(function (item) {
            return '<div class="dato">' +
              (item.codigo ? '<span class="codigo mono">' + escapar(item.codigo) + '</span> ' : '') +
              '<b>' + escapar(item.etiqueta) + ':</b> ' + escapar(valor(item.valor)) + '</div>';
          }).join('') + '</div>';
      }).join('');
    }
    $('#modal-ficha').classList.remove('oculto');
  }

  $('#ficha-cerrar').addEventListener('click', function () { $('#modal-ficha').classList.add('oculto'); });

  /* ============================================================
     MODO CIUDADANO
     ============================================================ */

  $('#rol-ciudadano').addEventListener('click', function () { mostrarVista('ciudadano'); });

  function fichaPersonaHTML(p) {
    var botones = '<div class="ficha__acciones">' +
      '<button class="boton" data-ficha="' + escapar(p.id_persona) + '" data-titulo="Formulario de afectaciones — ' + escapar(p.nombre) + '">Ver todas las respuestas del formulario</button>' +
      (p.id_encuesta_vivienda
        ? '<button class="boton" data-ficha="' + escapar(p.id_encuesta_vivienda) + '" data-titulo="Formulario de la edificación">Ver el formulario de la edificación</button>'
        : '') +
      '</div>';
    var hogar = DATOS.personas.filter(function (q) { return q.id_encuesta === p.id_encuesta; });
    var filasHogar = hogar.map(function (q) {
      return '<tr><td class="mono">' + escapar(valor(q.documento)) + '</td><td>' + escapar(valor(q.nombre)) +
             '</td><td>' + escapar(valor(q.edad)) + '</td><td>' + escapar(valor(q.parentesco)) +
             '</td><td>' + escapar(valor(q.estado_inmueble)) + '</td></tr>';
    }).join('');
    return '<div class="ficha">' +
      '<h2 class="estado-si">' + escapar(p.nombre) + '</h2>' +
      chipMatch(p.match_status) +
      '<div class="ficha__grupo">' +
        '<div class="dato"><b>Cédula:</b> <span class="mono">' + escapar(valor(p.documento)) + '</span></div>' +
        '<div class="dato"><b>Edad:</b> ' + escapar(valor(p.edad)) + '</div>' +
        '<div class="dato"><b>Género:</b> ' + escapar(valor(p.genero)) + '</div>' +
        '<div class="dato"><b>Parentesco:</b> ' + escapar(valor(p.parentesco)) + '</div>' +
        '<div class="dato"><b>Estado del inmueble:</b> ' + escapar(valor(p.estado_inmueble)) + '</div>' +
        '<div class="dato"><b>Estado de salud:</b> ' + escapar(valor(p.estado_salud)) + '</div>' +
        '<div class="dato"><b>Dirección:</b> ' + escapar(valor(p.direccion_completa)) + '</div>' +
        '<div class="dato"><b>¿Requiere evacuación?:</b> ' + escapar(valor(p.requiere_evacuacion)) + '</div>' +
      '</div>' + botones +
      '<div class="ficha__meta">Código de hogar: <span class="mono">' + escapar(valor(p.id_hogar)) +
        '</span> · Actualizado: ' + escapar(valor(p.last_update).replace('T', ' ')) + '</div>' +
      '</div>' +
      '<h2 class="titulo-seccion">Personas del mismo hogar</h2>' +
      '<div class="tabla-marco"><table class="tabla">' +
      '<thead><tr><th>Cédula</th><th>Nombre</th><th>Edad</th><th>Parentesco</th><th>Estado del inmueble</th></tr></thead>' +
      '<tbody>' + filasHogar + '</tbody></table></div>';
  }

  function fichaEdificacionHTML(v) {
    return '<div class="ficha">' +
      '<h2 class="estado-si">Edificación registrada</h2>' +
      '<div class="ficha__grupo">' +
        '<div class="dato"><b>Dirección:</b> ' + escapar(valor(v.direccion_completa)) + '</div>' +
        '<div class="dato"><b>Propietario:</b> ' + escapar(valor(v.prop_nombre)) + '</div>' +
        '<div class="dato"><b>¿Cumple requisitos de auto-reparación?:</b> ' + escapar(valor(v.cumple_requisitos)) + '</div>' +
        '<div class="dato"><b>¿Requiere evacuación?:</b> ' + escapar(valor(v.requiere_evacuacion)) + '</div>' +
        '<div class="dato"><b>Sistema constructivo:</b> ' + escapar(valor(v.sistema_constructivo)) + '</div>' +
      '</div>' +
      '<div class="ficha__acciones">' +
        '<button class="boton" data-ficha="' + escapar(v.id_encuesta) + '" data-titulo="Formulario de la edificación — ' + escapar(valor(v.direccion_completa)) + '">Ver todas las respuestas del formulario</button>' +
      '</div>' +
      '<div class="ficha__meta">Registro: <span class="mono">' + escapar(v.id_encuesta) +
        '</span> · Actualizado: ' + escapar(valor(v.last_update).replace('T', ' ')) + '</div>' +
      '</div>';
  }

  /* la consulta ciudadana busca SOLO por cedula; el cruce por direccion es
     interno del pipeline y no se expone aqui */
  function buscarCiudadano() {
    var termino = $('#cedula').value;
    var caja = $('#resultado');
    var cedula = normalizarCedula(termino);
    var html = '';

    if (!String(termino).trim()) {
      caja.innerHTML = '<p class="nota">Escriba un número de cédula y presione Buscar.</p>';
      return;
    }
    /* solo se acepta un numero de cedula: digitos con puntos, espacios o guiones */
    if (cedula.length < 4 || !/^[0-9 .-]+$/.test(String(termino).trim())) {
      caja.innerHTML = '<p class="nota nota--error">Escriba un número de cédula válido (solo números; los puntos y espacios se ignoran). La consulta no admite búsquedas por dirección ni por nombre.</p>';
      return;
    }

    /* se le pregunta al receptor por ESA cédula: lo que vuelve es su registro,
       su hogar y su edificación, no la base. El navegador nunca llega a tener
       los datos de nadie más. */
    caja.innerHTML = '<p class="nota">Consultando…</p>';

    pedir({ accion: 'consultar_cedula', cedula: cedula })
      .then(function (d) {
        DATOS.personas    = (d.personas    || []).map(anumerar);
        DATOS.familias    = (d.familias    || []).map(anumerar);
        DATOS.viviendas   = (d.viviendas   || []).map(anumerar);
        DATOS.fichas      = d.fichas      || {};
        DATOS.diccionario = d.diccionario || [];
        DATOS.actualizado = d.actualizado || '';
        indexarDiccionario();
        pintarActualizado();

        var html = '';

        /* personas con esa cedula, y edificaciones donde aparece como
           propietario o como quien atendio la visita */
        var registros = DATOS.personas.filter(function (p) { return p.documento === cedula; });
        registros.sort(function (a, b) { return (a.persona_duplicada || 0) - (b.persona_duplicada || 0); });
        if (registros.length > 0) html += fichaPersonaHTML(registros[0]);

        var edifs = DATOS.viviendas.filter(function (v) {
          return normalizarCedula(v.prop_cc) === cedula || normalizarCedula(v.inf_cc) === cedula;
        });
        edifs.forEach(function (v) { html += fichaEdificacionHTML(v); });

        if (!html) {
          html = '<div class="ficha ficha--no"><h2 class="estado-no">La cédula NO está en la base</h2>' +
            '<p>No hay ningún registro asociado a la cédula <span class="mono">' + escapar(cedula) + '</span>.</p>' +
            '<p class="nota">Puede que la encuesta aún no se haya sincronizado, o que la persona no haya sido encuestada.</p></div>';
        }
        caja.innerHTML = html;
      })
      .catch(function (e) {
        caja.innerHTML = '<p class="nota nota--error">No se pudo consultar en este momento (' +
          escapar(e.message) + '). Verifique la conexión e intente de nuevo.</p>';
      });
  }

  $('#btn-buscar').addEventListener('click', buscarCiudadano);
  $('#cedula').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); buscarCiudadano(); } });

  /* botones "ver todas las respuestas" (delegación: sirven en cualquier vista) */
  document.addEventListener('click', function (ev) {
    var boton = ev.target.closest('[data-ficha]');
    if (boton) abrirFicha(boton.getAttribute('data-ficha'), boton.getAttribute('data-titulo'));
  });

  /* ============================================================
     MODO EQUIPO: login
     ============================================================ */

  /* Trae las ocho tablas consolidadas y las deja en DATOS.
     Quien valida la contraseña es el Apps Script, no este código: la contraseña
     ES el TOKEN_LECTURA del script de Google. Si no coincide, el receptor
     responde 'no_autorizado' y aquí no llega ni una fila. Por eso ya no hay una
     lista de usuarios con la clave en texto plano dentro de este archivo. */
  function cargarEquipo(password) {
    var tablas = [['c_personas', 'personas'], ['c_hogares', 'familias'],
                  ['c_edificaciones', 'viviendas'], ['c_afectaciones', 'afectaciones'],
                  ['c_diccionario', 'diccionario'], ['c_revisar', 'revisar'],
                  ['c_duplicados', 'duplicados']];

    return Promise.all(tablas.map(function (par) {
      return traerTabla(par[0], password).then(function (r) {
        DATOS[par[1]] = r.filas;
        if (r.actualizado) DATOS.actualizado = r.actualizado;
      });
    })).then(function () {
      return traerTabla('c_fichas', password).then(function (r) {
        DATOS.fichas = aFichas(r.filas);
      });
    });
  }

  $('#form-login').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var tecleado = normalizarTexto($('#login-usuario').value).toLowerCase().replace(/ /g, '');
    var password = $('#login-password').value;
    var boton = $('#form-login button[type="submit"]');
    var error = $('#login-error');

    if (!tecleado || !password) { error.textContent = 'Escriba usuario y contraseña.';
                                  error.classList.remove('oculto'); return; }

    /* el usuario se valida aquí y la contraseña allá: son dos comprobaciones
       distintas, pero el mensaje de error es el mismo a propósito, para no
       decirle a quien tantea cuál de las dos acertó.

       Se traduce lo tecleado a su nombre de usuario canónico con canonicoDe()
       del aplicativo de campo, que ya sabe de tildes, mayúsculas, alias y
       nombres anteriores. Si no conoce el texto lo devuelve igual, y entonces
       no coincide con ningún usuario, que es lo que se quiere.

       Hace falta porque el formato nuevo lleva guion: «claudia-rincon» nunca
       coincidiría con lo que alguien teclea. El respaldo de abajo solo actúa
       si config.js no llegó a cargar, y compara sin espacios ni guiones. */
    var conocido;
    if (window.APP_CONFIG && window.APP_CONFIG.canonicoDe) {
      var canonico = window.APP_CONFIG.canonicoDe($('#login-usuario').value);
      conocido = USUARIOS.filter(function (u) { return u.usuario === canonico; })[0];
    } else {
      conocido = USUARIOS.filter(function (u) {
        return u.usuario.replace(/[\s_-]+/g, '') === tecleado;
      })[0];
    }
    if (!conocido) { error.textContent = 'Usuario o contraseña incorrectos.';
                     error.classList.remove('oculto'); return; }

    error.classList.add('oculto');
    boton.disabled = true;
    boton.textContent = 'Entrando…';

    cargarEquipo(password)
      .then(function () {
        sesion = { usuario: conocido.usuario, nombre: conocido.nombre, password: password };
        sessionStorage.setItem('consulta_sesion', JSON.stringify(sesion));
        indexarDiccionario();
        pintarActualizado();
        mostrarVista('equipo');
        pintarPanelColumnas();
        pintarBase();
        pintarRevisar();
      })
      .catch(function (e) {
        if (e.message === 'no_autorizado') {
          error.textContent = 'Usuario o contraseña incorrectos.';
        } else if (e.message === 'consulta_no_habilitada') {
          /* la propiedad TOKEN_LECTURA no existe en el script de Google, así
             que la puerta está cerrada para todos. Es el estado seguro, pero
             el mensaje tiene que decir qué hacer y no dejar a nadie adivinando */
          error.textContent = 'El acceso del equipo no está habilitado todavía: ' +
            'falta crear la propiedad TOKEN_LECTURA en el script de Google.';
        } else {
          error.textContent = 'No se pudo conectar con la base (' + e.message + ').';
        }
        error.classList.remove('oculto');
      })
      .then(function () {
        boton.disabled = false;
        boton.textContent = 'Ingresar';
      });
  });

  /* ============================================================
     MODO EQUIPO: tres bases con tabla tipo Excel
     ============================================================ */

  var BASES = {
    viviendas: {
      titulo: 'Edificaciones',
      filas: function () { return DATOS.viviendas; },
      id: 'id_encuesta',
      tituloFicha: function (r) { return 'Formulario de la edificación — ' + valor(r.direccion_completa); },
      columnas: [
        { titulo: 'Registro', campo: 'id_encuesta', mono: true },
        { titulo: 'Dirección', campo: 'direccion_completa' },
        { titulo: 'Propietario', campo: 'prop_nombre' },
        { titulo: 'C.C. propietario', campo: 'prop_cc_norm', mono: true },
        { titulo: 'Atendió visita', campo: 'inf_nombre' },
        { titulo: 'Cumple requisitos', campo: 'cumple_requisitos' },
        { titulo: 'Requiere evacuación', campo: 'requiere_evacuacion' },
        { titulo: 'Sistema', campo: 'sistema_constructivo' },
        { titulo: 'Reporte de afectación', campo: 'reporte_afectacion', mono: true },
        { titulo: 'Duplicado', campo: 'duplicate', render: function (r) { return chipSiNo(r.duplicate === 1); } },
        { titulo: 'Actualizado', campo: 'fecha_actualizacion', mono: true }
      ]
    },
    /* Reportes de afectación: grano EVENTO / edificación atendida por un
       organismo de socorro. No trae cédula ni código de hogar, así que no entra
       en el matching de hogares; con las edificaciones solo comparte la
       dirección del edificio, y de ahí sale el cruce sugerido de la columna
       "Edificaciones EDAN" y de la sección 7 de la ficha. */
    afectaciones: {
      titulo: 'Afectaciones',
      filas: function () { return DATOS.afectaciones || []; },
      id: 'id_encuesta',
      tituloFicha: function (r) {
        return 'Reporte de afectación — ' + valor(r.nombre_edificacion || r.direccion_completa);
      },
      fichaPropia: true,          /* la arma fichaAfectacion(), no el diccionario */
      columnas: [
        { titulo: 'Registro', campo: 'id_encuesta', mono: true },
        { titulo: 'Consecutivo', campo: 'consecutivo_id', mono: true },
        { titulo: 'Edificación', campo: 'nombre_edificacion' },
        { titulo: 'Dirección', campo: 'direccion_completa' },
        { titulo: 'Barrio', campo: 'barrio' },
        { titulo: 'Comuna', campo: 'comuna' },
        { titulo: 'Colapso', campo: 'colapso', render: function (r) { return chipColapso(r.colapso); } },
        { titulo: 'Evacuación', campo: 'requieren_evacuacion' },
        { titulo: 'Fallecidos', campo: 'fallecidos' },
        { titulo: 'Atrapadas', campo: 'atrapadas' },
        { titulo: 'Por evacuar', campo: 'necesitan_evacuar' },
        { titulo: 'Viviendas', campo: 'cantidad_viviendas' },
        { titulo: 'Fotos', campo: 'fotos_cantidad',
          render: function (r) { return chipFotos(r.fotos_cantidad); } },
        { titulo: 'Edificaciones EDAN', campo: 'edificaciones_edan',
          render: function (r) { return chipCruce(r.edificaciones_edan); } },
        { titulo: 'Organismo', campo: 'organismo' },
        { titulo: 'Duplicado', campo: 'duplicate', render: function (r) { return chipSiNo(r.duplicate === 1); } },
        { titulo: 'Actualizado', campo: 'fecha_actualizacion', mono: true }
      ]
    },
    familias: {
      titulo: 'Hogares',
      filas: function () { return DATOS.familias; },
      id: 'id_encuesta',
      tituloFicha: function (r) { return 'Formulario de hogar — ' + valor(r.id_hogar); },
      sinFichaDirecta: true,
      columnas: [
        { titulo: 'Registro', campo: 'id_encuesta', mono: true },
        { titulo: 'Código de hogar', campo: 'id_hogar', mono: true },
        { titulo: 'Personas', campo: 'n_personas' },
        { titulo: 'Secretaría', campo: 'secretaria' },
        { titulo: 'Vivienda', campo: 'match_status', render: function (r) { return chipMatch(r.match_status); } },
        { titulo: 'Dirección', campo: 'direccion_completa' },
        { titulo: 'Duplicado', campo: 'duplicate', render: function (r) { return chipSiNo(r.duplicate === 1); } },
        { titulo: 'Actualizado', campo: 'fecha_actualizacion', mono: true }
      ]
    },
    personas: {
      titulo: 'Personas',
      filas: function () { return DATOS.personas; },
      id: 'id_persona',
      tituloFicha: function (r) { return 'Formulario de afectaciones — ' + valor(r.nombre); },
      columnas: [
        { titulo: 'Cédula', campo: 'documento', mono: true },
        { titulo: 'Nombre', campo: 'nombre' },
        { titulo: 'Edad', campo: 'edad' },
        { titulo: 'Parentesco', campo: 'parentesco' },
        { titulo: 'Estado del inmueble', campo: 'estado_inmueble' },
        { titulo: 'Estado de salud', campo: 'estado_salud' },
        { titulo: 'Vivienda', campo: 'match_status', render: function (r) { return chipMatch(r.match_status); } },
        { titulo: 'Dirección', campo: 'direccion_completa' },
        { titulo: 'Hogar', campo: 'id_hogar', mono: true },
        { titulo: 'Duplicado', campo: 'persona_duplicada', render: function (r) { return chipSiNo(r.persona_duplicada === 1); } }
      ]
    }
  };

  var baseActiva = 'viviendas';
  var filtros = {};          /* campo -> texto crudo del filtro */
  var ordenCampo = null;
  var ordenAsc = true;
  var mostrarDuplicados = false;
  var seccionesActivas = { viviendas: {}, familias: {}, personas: {}, afectaciones: {} };

  /* Formulario cuyas preguntas pueden agregarse como columnas en cada base;
     en hogares solo la sección 5, las demás son de nivel persona.
     `afectaciones` no tiene entrada porque su cuestionario no está en el libro
     de códigos del EDAN: su ficha se arma en fichaAfectacion() y todas sus
     preguntas ya son columnas de la tabla, así que no hay nada que agregar. */
  var FORMULARIO_DE_BASE = {
    viviendas: { formulario: 'Formulario de Vivienda' },
    familias:  { formulario: 'Formulario de Personas / Familia', secciones: ['5'] },
    personas:  { formulario: 'Formulario de Personas / Familia' }
  };

  function seccionesDe(nombreBase) {
    var cfg = FORMULARIO_DE_BASE[nombreBase];
    if (!cfg) return [];              /* base sin preguntas en el diccionario */
    var vistas = {};
    var lista = [];
    (DATOS.diccionario || []).forEach(function (d) {
      if (d.formulario !== cfg.formulario) return;
      if (cfg.secciones && cfg.secciones.indexOf(String(d.seccion_numero)) === -1) return;
      var llave = d.seccion_numero + ' · ' + d.seccion_titulo;
      if (!vistas[llave]) { vistas[llave] = true; lista.push(llave); }
    });
    return lista;
  }

  function columnasExtra(nombreBase) {
    var cfg = FORMULARIO_DE_BASE[nombreBase];
    if (!cfg) return [];              /* base sin preguntas en el diccionario */
    var activas = seccionesActivas[nombreBase] || {};
    var columnas = [];
    (DATOS.diccionario || []).forEach(function (d) {
      if (d.formulario !== cfg.formulario) return;
      if (!activas[d.seccion_numero + ' · ' + d.seccion_titulo]) return;
      columnas.push({ titulo: d.codigo_pregunta + ' · ' + d.pregunta, campo: '@' + d.variable });
    });
    return columnas;
  }

  function columnasActivas() {
    return BASES[baseActiva].columnas.concat(columnasExtra(baseActiva));
  }

  /* ficha (respuestas completas) asociada a una fila de la base activa */
  function fichaDe(r) {
    if (baseActiva === 'personas')  return (DATOS.fichas || {})[r.id_persona];
    if (baseActiva === 'viviendas') return (DATOS.fichas || {})[r.id_encuesta];
    var primera = DATOS.personas.filter(function (p) { return p.id_encuesta === r.id_encuesta; })[0];
    return primera ? (DATOS.fichas || {})[primera.id_persona] : null;
  }

  function valorCelda(r, campo) {
    if (campo.charAt(0) !== '@') return r[campo];
    var ficha = fichaDe(r) || {};
    var variable = campo.slice(1);
    var v = ficha[variable + '_etiqueta'];
    return (v === undefined) ? ficha[variable] : v;
  }

  function digitos(texto) { return String(texto || '').replace(/[^0-9]/g, ''); }

  /* un filtro coincide por texto normalizado o, si trae 3+ digitos, por los
     digitos solos: asi "1.000.002" encuentra "1000002" y al reves */
  function coincide(celda, filtro) {
    if (!filtro) return true;
    if (normalizarTexto(celda).indexOf(normalizarTexto(filtro)) !== -1) return true;
    var d = digitos(filtro);
    return d.length >= 3 && digitos(celda).indexOf(d) !== -1;
  }

  function esDuplicado(r) {
    return r.duplicate === 1 || r.persona_duplicada === 1;
  }

  function filasFiltradas() {
    var columnas = columnasActivas();
    var global = $('#filtro-global').value;
    var filas = BASES[baseActiva].filas().filter(function (r) {
      if (!mostrarDuplicados && esDuplicado(r)) return false;
      for (var campo in filtros) {
        if (!filtros[campo]) continue;
        if (!coincide(valorCelda(r, campo), filtros[campo])) return false;
      }
      if (global) {
        var pajar = columnas.map(function (c) { return valorCelda(r, c.campo); }).join(' ');
        if (!coincide(pajar, global)) return false;
      }
      return true;
    });
    if (ordenCampo) {
      filas = filas.slice().sort(function (a, b) {
        var va = valorCelda(a, ordenCampo), vb = valorCelda(b, ordenCampo);
        if (va === null || va === undefined || va === '') return 1;
        if (vb === null || vb === undefined || vb === '') return -1;
        var na = parseFloat(va), nb = parseFloat(vb);
        var cmp = (!isNaN(na) && !isNaN(nb) && String(na) === String(va) && String(nb) === String(vb))
          ? na - nb
          : String(va).localeCompare(String(vb), 'es', { numeric: true });
        return ordenAsc ? cmp : -cmp;
      });
    }
    return filas;
  }

  function pintarBase() {
    var base = BASES[baseActiva];
    var columnas = columnasActivas();
    var filas = filasFiltradas();
    var obsTodas = leerObs();

    var encabezado = '<thead><tr>' + columnas.map(function (c) {
        var flecha = ordenCampo === c.campo ? (ordenAsc ? ' ▲' : ' ▼') : '';
        var corto = c.titulo.length > 34 ? c.titulo.slice(0, 32) + '…' : c.titulo;
        return '<th class="ordenable" data-orden="' + c.campo + '" title="' + escapar(c.titulo) + '">' + escapar(corto) + flecha + '</th>';
      }).join('') + '<th>Observaciones</th></tr>' +
      '<tr class="fila-filtros">' + columnas.map(function (c) {
        var actual = filtros[c.campo] || '';
        return '<th><input class="filtro-col" data-campo="' + c.campo + '" type="text" placeholder="Filtrar…" value="' + escapar(actual) + '" /></th>';
      }).join('') + '<th></th></tr></thead>';

    var cuerpo = filas.map(function (r) {
      var id = r[base.id];
      var obs = obsTodas[id] || [];
      return '<tr class="fila-registro" data-id="' + escapar(id) + '">' +
        columnas.map(function (c) {
          if (c.render) return '<td>' + c.render(r) + '</td>';
          var celda = escapar(valor(valorCelda(r, c.campo)));
          return c.mono ? '<td class="mono">' + celda + '</td>' : '<td>' + celda + '</td>';
        }).join('') +
        '<td><button class="boton boton--mini" data-obs="' + escapar(id) + '">' +
          (obs.length ? obs.length + ' obs.' : '+ observación') + '</button></td></tr>';
    }).join('');

    /* Una tabla con encabezados y nada debajo se lee como un error. Se
       distingue el caso «la base todavía no tiene registros» del caso «los
       filtros no dejaron pasar ninguno», que se arreglan de formas distintas. */
    if (!cuerpo) {
      var mensaje = base.filas().length
        ? 'Ningún registro coincide con los filtros aplicados.'
        : 'Todavía no hay registros en esta base. Aparecerán en cuanto lleguen ' +
          'las primeras encuestas diligenciadas en campo.';
      cuerpo = '<tr><td class="tabla__vacio" colspan="' + (columnas.length + 1) + '">' +
               mensaje + '</td></tr>';
    }
    $('#tabla-base').innerHTML = encabezado + '<tbody>' + cuerpo + '</tbody>';
    var duplicadosBase = base.filas().filter(esDuplicado).length;
    $('#conteo-base').textContent = base.titulo + ': ' + filas.length + ' de ' + base.filas().length + ' registros' +
      (!mostrarDuplicados && duplicadosBase ? ' (' + duplicadosBase + ' duplicado(s) oculto(s): la base entrega una sola observación por registro)' : '');

    /* eventos de la tabla */
    $$('#tabla-base .ordenable').forEach(function (th) {
      th.addEventListener('click', function () {
        var campo = th.getAttribute('data-orden');
        if (ordenCampo === campo) ordenAsc = !ordenAsc;
        else { ordenCampo = campo; ordenAsc = true; }
        pintarBase();
      });
    });
    $$('#tabla-base .filtro-col').forEach(function (input) {
      input.addEventListener('input', function () {
        filtros[input.getAttribute('data-campo')] = input.value;
        var pos = input.selectionStart;
        pintarBase();
        var nuevo = document.querySelector('.filtro-col[data-campo="' + input.getAttribute('data-campo') + '"]');
        if (nuevo) { nuevo.focus(); nuevo.setSelectionRange(pos, pos); }
      });
    });
    $$('#tabla-base .fila-registro').forEach(function (tr) {
      tr.addEventListener('click', function (ev) {
        if (ev.target.closest('[data-obs]')) return;
        var r = base.filas().filter(function (x) { return String(x[base.id]) === tr.getAttribute('data-id'); })[0];
        if (!r) return;
        if (baseActiva === 'familias') {
          /* la ficha de una afectacion son las fichas de sus personas */
          var primera = DATOS.personas.filter(function (p) { return p.id_encuesta === r.id_encuesta; })[0];
          abrirFicha(primera ? primera.id_persona : r.id_encuesta, base.tituloFicha(r));
        } else {
          abrirFicha(tr.getAttribute('data-id'), base.tituloFicha(r));
        }
      });
    });
    $$('#tabla-base [data-obs]').forEach(function (boton) {
      boton.addEventListener('click', function () { abrirObs(boton.getAttribute('data-obs')); });
    });
  }

  /* pestañas */
  $$('#pestanas .pestana').forEach(function (boton) {
    boton.addEventListener('click', function () {
      $$('#pestanas .pestana').forEach(function (b) { b.classList.remove('pestana--activa'); });
      boton.classList.add('pestana--activa');
      var destino = boton.getAttribute('data-base');
      if (destino === 'revisar') {
        $('#panel-base').classList.add('oculto');
        $('#panel-revisar').classList.remove('oculto');
      } else {
        $('#panel-revisar').classList.add('oculto');
        $('#panel-base').classList.remove('oculto');
        baseActiva = destino;
        filtros = {}; ordenCampo = null; $('#filtro-global').value = '';
        pintarPanelColumnas();
        pintarBase();
      }
    });
  });

  $('#filtro-global').addEventListener('input', pintarBase);
  $('#btn-limpiar').addEventListener('click', function () {
    filtros = {}; ordenCampo = null; $('#filtro-global').value = '';
    pintarBase();
  });

  /* selector de modulos de preguntas (secciones del formulario) */
  function pintarPanelColumnas() {
    var activas = seccionesActivas[baseActiva] || {};
    $('#lista-secciones').innerHTML = seccionesDe(baseActiva).map(function (llave) {
      return '<label class="check"><input type="checkbox" data-seccion="' + escapar(llave) + '"' +
             (activas[llave] ? ' checked' : '') + ' /> ' + escapar(llave) + '</label>';
    }).join('');
    $$('#lista-secciones input').forEach(function (chk) {
      chk.addEventListener('change', function () {
        seccionesActivas[baseActiva][chk.getAttribute('data-seccion')] = chk.checked;
        pintarBase();
      });
    });
  }

  $('#btn-columnas').addEventListener('click', function () {
    $('#panel-columnas').classList.toggle('oculto');
  });

  $('#chk-duplicados').addEventListener('change', function () {
    mostrarDuplicados = $('#chk-duplicados').checked;
    pintarBase();
  });

  /* descarga CSV de lo filtrado (UTF-8 con BOM y separador ; para Excel) */
  $('#btn-csv').addEventListener('click', function () {
    var base = BASES[baseActiva];
    var activas = columnasActivas();
    var filas = filasFiltradas();
    var obsTodas = leerObs();
    var columnas = activas.map(function (c) { return c.titulo; }).concat(['Observaciones']);
    var lineas = [columnas.join(';')];
    filas.forEach(function (r) {
      var celdas = activas.map(function (c) {
        var v = valor(valorCelda(r, c.campo));
        return '"' + String(v === '—' ? '' : v).replace(/"/g, '""') + '"';
      });
      var obs = (obsTodas[r[base.id]] || []).map(function (o) {
        return '[' + o.usuario + ' ' + o.fecha + '] ' + o.texto;
      }).join(' | ');
      celdas.push('"' + obs.replace(/"/g, '""') + '"');
      lineas.push(celdas.join(';'));
    });
    var blob = new Blob(['﻿' + lineas.join('\n')], { type: 'text/csv;charset=utf-8' });
    var enlace = document.createElement('a');
    enlace.href = URL.createObjectURL(blob);
    enlace.download = 'consulta_' + base.titulo.toLowerCase() + '.csv';
    enlace.click();
    URL.revokeObjectURL(enlace.href);
  });

  /* Las cuatro bases de una vez, sin filtros ni selección de columnas: es el
     reemplazo del .xlsx que antes se descargaba del repositorio. Va como
     cuatro CSV y no como un Excel de cuatro hojas porque armar un xlsx real
     exigiría una librería externa, y este sitio no carga ninguna. */
  $('#btn-csv-todo').addEventListener('click', function () {
    Object.keys(BASES).forEach(function (clave) {
      var base = BASES[clave];
      if (clave === 'revisar') return;
      var filas = base.filas();
      if (!filas.length) return;

      var columnas = Object.keys(filas[0]);
      var lineas = [columnas.join(';')];
      filas.forEach(function (r) {
        lineas.push(columnas.map(function (c) {
          var v = (r[c] === null || r[c] === undefined) ? '' : String(r[c]);
          return '"' + v.replace(/"/g, '""') + '"';
        }).join(';'));
      });

      var blob = new Blob(['﻿' + lineas.join('\n')], { type: 'text/csv;charset=utf-8' });
      var enlace = document.createElement('a');
      enlace.href = URL.createObjectURL(blob);
      enlace.download = 'base_' + clave + '.csv';
      enlace.click();
      URL.revokeObjectURL(enlace.href);
    });
  });

  /* exportar todas las observaciones de este equipo */
  $('#btn-obs-export').addEventListener('click', function () {
    var todas = leerObs();
    var lineas = ['registro;usuario;fecha;observacion'];
    Object.keys(todas).forEach(function (id) {
      todas[id].forEach(function (o) {
        lineas.push(['"' + id + '"', '"' + o.usuario + '"', '"' + o.fecha + '"',
                     '"' + String(o.texto).replace(/"/g, '""') + '"'].join(';'));
      });
    });
    var blob = new Blob(['﻿' + lineas.join('\n')], { type: 'text/csv;charset=utf-8' });
    var enlace = document.createElement('a');
    enlace.href = URL.createObjectURL(blob);
    enlace.download = 'observaciones.csv';
    enlace.click();
    URL.revokeObjectURL(enlace.href);
  });

  /* ---------- observaciones: panel ---------- */

  var obsRegistroActual = null;

  function abrirObs(id) {
    obsRegistroActual = id;
    $('#obs-titulo').textContent = 'Observaciones — ' + id;
    pintarObs();
    $('#modal-obs').classList.remove('oculto');
  }

  function pintarObs() {
    var lista = obsDe(obsRegistroActual);
    $('#obs-lista').innerHTML = lista.length
      ? lista.map(function (o) {
          return '<div class="obs"><div class="obs__meta mono">' + escapar(o.usuario) + ' · ' + escapar(o.fecha) + '</div>' +
                 '<div>' + escapar(o.texto) + '</div></div>';
        }).join('')
      : '<p class="nota">Este registro no tiene observaciones todavía.</p>';
  }

  $('#obs-form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var texto = $('#obs-texto').value.trim();
    if (!texto) return;
    agregarObs(obsRegistroActual, texto);
    $('#obs-texto').value = '';
    pintarObs();
    pintarBase();
  });

  $('#obs-cerrar').addEventListener('click', function () { $('#modal-obs').classList.add('oculto'); });

  /* ---------- casos por revisar ---------- */

  function pintarRevisar() {
    var encabezado = '<thead><tr><th>Encuesta</th><th>Código de hogar</th><th>Personas</th><th>Estado</th><th>Secretaría</th><th>Archivo</th></tr></thead>';
    var cuerpo = (DATOS.revisar || []).map(function (f) {
      return '<tr><td class="mono">' + escapar(valor(f.id_encuesta)) + '</td><td class="mono">' + escapar(valor(f.id_hogar)) +
             '</td><td>' + escapar(valor(f.n_personas)) + '</td><td>' + chipMatch(f.match_status) +
             '</td><td>' + escapar(valor(f.secretaria)) + '</td><td>' + escapar(valor(f.archivo_origen)) + '</td></tr>';
    }).join('');
    $('#tabla-revisar').innerHTML = encabezado + '<tbody>' + (cuerpo || '<tr><td colspan="6">Sin casos pendientes.</td></tr>') + '</tbody>';

    var encDup = '<thead><tr><th>Tabla</th><th>Registro</th><th>Se conservó</th><th>Criterio</th><th>Confianza</th><th>Detectado</th></tr></thead>';
    var cuerpoDup = (DATOS.duplicados || []).map(function (d) {
      return '<tr><td>' + escapar(valor(d.tabla)) + '</td><td class="mono">' + escapar(valor(d.id_registro)) +
             '</td><td class="mono">' + escapar(valor(d.id_canonico)) + '</td><td>' + escapar(valor(d.criterio)) +
             '</td><td>' + escapar(valor(d.confianza)) + '</td><td>' + escapar(valor(d.timestamp).replace('T', ' ')) + '</td></tr>';
    }).join('');
    $('#tabla-duplicados').innerHTML = encDup + '<tbody>' + (cuerpoDup || '<tr><td colspan="6">Sin duplicados detectados.</td></tr>') + '</tbody>';
  }

  /* ---------- arranque: restaurar sesión si existe ----------

     La sesión guarda la contraseña porque cada recarga tiene que volver a
     pedirle las tablas al receptor: aquí ya no queda ninguna copia local de la
     base. Vive en sessionStorage, que es por pestaña y se borra al cerrarla;
     no en localStorage, que sobreviviría en el equipo indefinidamente.

     Si la contraseña cambió en las Propiedades del script, la recarga falla
     con 'no_autorizado' y la sesión se descarta: es el comportamiento que se
     quiere, revocar desde Google y que todos los navegadores queden fuera. */

  try { sesion = JSON.parse(sessionStorage.getItem('consulta_sesion')); } catch (e) { sesion = null; }

  if (sesion && sesion.usuario && sesion.password) {
    mostrarVista('equipo');
    $('#conteo-base').textContent = 'Cargando la base…';
    cargarEquipo(sesion.password)
      .then(function () {
        indexarDiccionario();
        pintarActualizado();
        pintarPanelColumnas();
        pintarBase();
        pintarRevisar();
      })
      .catch(function () {
        sessionStorage.removeItem('consulta_sesion');
        sesion = null;
        mostrarVista('rol');
      });
  } else {
    sesion = null;
    mostrarVista('rol');
  }
})();
