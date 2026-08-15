/* ============================================================================
   sincronizacion.js — Envío de las encuestas a la hoja de CIENFI.

   PROCEDENCIA
   Esta implementación viene del desarrollo de integración con Google Drive
   (app_damage_alcaldia). Reemplaza a la capa de respaldo que traía el
   andamiaje del portal, que quedaba a la espera de un destino: esta ya tiene
   el receptor construido y desplegado (Apps Script, ver apps-script/Codigo.gs).

   PRINCIPIO DE DISEÑO: EL EQUIPO NUNCA PIERDE UN DATO.

   El almacenamiento local sigue siendo la verdad. Esta capa se monta encima y
   no reemplaza nada: si la conexión falla, si el servicio no responde o si el
   token está mal, la encuesta permanece guardada en el equipo y en la cola de
   envío. Nada se descarta jamás por un fallo de red.

   Una encuesta enviada TAMPOCO se borra del equipo: se marca como
   sincronizada. Así el CSV local sigue sirviendo como respaldo.

   CÓMO SE SABE QUE LLEGÓ
   ----------------------
   Se lee la respuesta del servidor. Una petición simple (Content-Type
   text/plain, sin cabeceras propias) no dispara la verificación previa del
   navegador —que Apps Script no atiende— y sí permite leer la confirmación.

   REENVÍOS
   --------
   Reenviar la misma encuesta es seguro: el script la reconoce por id_encuesta
   y reemplaza sus filas en lugar de duplicarlas.
   ========================================================================== */
(function () {
  'use strict';

  var CLAVE_EQUIPO = 'damage_cali_equipo_v1';
  var ALFABETO = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

  var enviando = false;
  var temporizador = null;
  var alCambiarEstado = null;   // la interfaz se suscribe para refrescarse
  var ultimoError = '';

  // --- Identificación del equipo -------------------------------------------

  /**
   * El navegador no expone el nombre del computador. Se genera un código
   * estable por equipo y se guarda localmente, para poder distinguir en la
   * bitácora desde qué máquina llegó cada encuesta.
   */
  function nombreEquipo() {
    var guardado = localStorage.getItem(CLAVE_EQUIPO);
    if (guardado) return guardado;

    var bytes = new Uint8Array(5);
    (window.crypto || window.msCrypto).getRandomValues(bytes);
    var codigo = 'EQ-';
    for (var i = 0; i < bytes.length; i++) codigo += ALFABETO[bytes[i] % ALFABETO.length];

    var sistema = /Android/i.test(navigator.userAgent) ? 'Android'
      : /iPhone|iPad/i.test(navigator.userAgent) ? 'iOS'
      : /Windows/i.test(navigator.userAgent) ? 'Windows'
      : /Mac/i.test(navigator.userAgent) ? 'Mac' : 'Otro';

    var nombre = codigo + ' (' + sistema + ')';
    try { localStorage.setItem(CLAVE_EQUIPO, nombre); } catch (e) { /* sin persistencia */ }
    return nombre;
  }

  // --- Estado ---------------------------------------------------------------

  function configurada() {
    var c = window.CONFIG_SYNC || {};
    return !!(String(c.url || '').trim() && String(c.token || '').trim());
  }

  /** Encuestas finalizadas que todavía no confirmó el servidor. */
  function pendientes() {
    return window.Almacen.listar({ estado: 'finalizada' })
      .filter(function (r) { return !r.sincronizada; });
  }

  function estado() {
    return {
      configurada: configurada(),
      pendientes: pendientes().length,
      enviando: enviando,
      enLinea: navigator.onLine,
      ultimoError: ultimoError,
      destino: (window.CONFIG_SYNC || {}).nombreDestino || ''
    };
  }

  function avisarCambio() {
    if (alCambiarEstado) alCambiarEstado(estado());
  }

  // --- Fotos ----------------------------------------------------------------

  /** Campos tipo 'fotos' del formulario de una encuesta. */
  function camposFotosDe(registro) {
    var form = registro.tipo_formulario === 'vivienda' ? window.FORM_VIVIENDA
      : registro.tipo_formulario === 'afectaciones' ? window.FORM_AFECTACIONES
      : window.FORM_PERSONAS;
    var lista = [];
    ((form && form.secciones) || []).forEach(function (sec) {
      (sec.camposEncabezado || []).concat(sec.campos || []).forEach(function (c) {
        if (c.tipo === 'fotos') lista.push(c);
      });
    });
    return lista;
  }

  /**
   * Fotos a enviar. Las nuevas van con sus bytes; las que YA están en Drive
   * van solo con su drive_id, para que el receptor las CONSERVE al reescribir
   * la encuesta (si no las mencionáramos, un reenvío por corrección las
   * borraría de Drive). Las que el usuario quitó de la encuesta simplemente
   * no aparecen y el receptor las retira.
   */
  function fotosDe(registro) {
    var salida = [];
    camposFotosDe(registro).forEach(function (campo) {
      var lista = registro.respuestas && registro.respuestas[campo.id];
      if (!Array.isArray(lista)) return;
      lista.forEach(function (f, i) {
        if (!f) return;
        // Primero el drive_id: si ya está en Drive no se vuelve a subir aunque
        // el equipo aún conserve los bytes.
        if (f.drive_id) {
          salida.push({ campo: campo.id, indice: i, nombre: f.nombre, drive_id: f.drive_id, conservar: true });
        } else if (f.datos) {
          salida.push({ campo: campo.id, indice: i, nombre: f.nombre, mime: f.mime || 'image/jpeg', datos: f.datos });
        }
      });
    });
    return salida;
  }

  /** Copia de las respuestas con las fotos reducidas a nombre y enlace. */
  function respuestasSinBytesDeFotos(registro) {
    var copia = Object.assign({}, registro.respuestas || {});
    camposFotosDe(registro).forEach(function (campo) {
      var lista = copia[campo.id];
      if (!Array.isArray(lista)) return;
      copia[campo.id] = lista.map(function (f) {
        return { nombre: f.nombre, mime: f.mime, tam: f.tam, url: f.url || '', drive_id: f.drive_id || '' };
      });
    });
    return copia;
  }

  // --- Envío ----------------------------------------------------------------

  /**
   * Manda una encuesta y espera confirmación.
   * Devuelve { ok, mensaje, reintentar }.
   */
  function enviarUna(registro) {
    var cfg = window.CONFIG_SYNC;

    var payload = {
      accion: 'guardar_encuesta',
      token: cfg.token,
      id_encuesta: registro.id_encuesta,
      tipo_formulario: registro.tipo_formulario,
      usuario: registro.usuario,
      equipo: nombreEquipo(),
      app_version: registro.app_version,
      tablas: window.Exportador.filasParaSincronizar(registro),
      /* Fotos de la encuesta (campos tipo 'fotos'), aparte de las tablas: el
         receptor las guarda en Drive con el id de la encuesta y devuelve los
         enlaces. Un receptor viejo las ignora. */
      fotos: fotosDe(registro),
      /* Le dice al receptor que la lista de fotos de arriba es la lista
         COMPLETA vigente: lo que este en Drive con este id y no aparezca aqui
         es porque se quito. Un cliente viejo no manda esta marca y el
         receptor entonces no borra nada. */
      fotos_completas: true,
      /* Copia íntegra de la encuesta. El receptor la guarda aparte y es lo
         que permite recuperarla desde CUALQUIER equipo al iniciar sesión.
         Un receptor viejo simplemente la ignora. Los campos de estado de
         envío van normalizados: quien la importe la recibe como lo que es —
         una encuesta que YA está en la base central. Las fotos van SIN sus
         bytes (solo nombre y enlace): en Drive están completas y meterlas
         aquí duplicaría megas en la hoja. */
      respaldo: JSON.stringify(Object.assign({}, registro, {
        respuestas: respuestasSinBytesDeFotos(registro),
        sincronizada: true,
        fecha_sincronizacion: new Date().toISOString(),
        ultimo_error_sync: ''
      }))
    };
    var cuerpo = JSON.stringify(payload);
    /* El tiempo de espera crece con el tamaño real del envío: con señal de
       campo (~50 KB/s en un mal momento) 2 MB de fotos pueden tardar más de
       un minuto, y cortar antes obligaría a reintentar TODO el envío. Mínimo
       el tiempo configurado; +1 s por cada 50 KB; tope 10 min. */
    var tiempoLimite = Math.min(600000, Math.max(cfg.tiempoLimite, 60000 + Math.ceil(cuerpo.length / 50000) * 1000));

    var control = new AbortController();
    var corte = setTimeout(function () { control.abort(); }, tiempoLimite);

    return fetch(cfg.url, {
      method: 'POST',
      // text/plain evita la verificación previa del navegador, que Apps Script
      // no responde. El script lee el cuerpo y lo interpreta como JSON.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: cuerpo,
      redirect: 'follow',
      signal: control.signal
    })
      .then(function (r) {
        clearTimeout(corte);
        if (!r.ok) throw new Error('El servidor respondió ' + r.status);
        return r.text();
      })
      .then(function (texto) {
        var datos;
        try {
          datos = JSON.parse(texto);
        } catch (e) {
          // Suele pasar cuando la implementación no está publicada como
          // "cualquier usuario": Google devuelve una página de inicio de sesión.
          throw new Error('La respuesta no es válida. Revise que la implementación ' +
            'esté publicada con acceso para «cualquier usuario».');
        }
        if (!datos.ok) {
          var err = new Error(mensajeDeError(datos.error));
          err.reintentar = datos.reintentar !== false;
          throw err;
        }
        return { ok: true, filas: datos.filas_escritas, hora: datos.hora_servidor,
                 fotos: Array.isArray(datos.fotos) ? datos.fotos : null,
                 // Un receptor viejo no manda fotos_ok: se asume que no hubo fotos que perder.
                 fotosOk: datos.fotos_ok !== false };
      })
      .catch(function (e) {
        clearTimeout(corte);
        var mensaje;
        if (e.name === 'AbortError') {
          mensaje = 'El envío tardó demasiado y se canceló. Se reintentará solo.';
        } else if (/failed to fetch|networkerror|load failed/i.test(e.message || '')) {
          // Es el error genérico del navegador: puede ser falta de señal o una
          // dirección mal configurada. Se dice en términos accionables.
          mensaje = 'No se pudo contactar el servicio. Revise la conexión; si el problema ' +
            'persiste, verifique la dirección configurada. La encuesta quedó guardada.';
        } else {
          mensaje = e.message || 'Fallo de conexión';
        }
        return {
          ok: false,
          mensaje: mensaje,
          // Por defecto se reintenta: ante la duda, no se da por perdido.
          reintentar: e.reintentar !== false
        };
      });
  }

  function mensajeDeError(codigo) {
    var mapa = {
      no_autorizado: 'El token no coincide con el configurado en el script de Google.',
      falta_id_encuesta: 'La encuesta no tiene identificador.',
      sin_tablas: 'La encuesta no trae datos para escribir.',
      ocupado: 'La hoja estaba ocupada con otro envío.'
    };
    return mapa[codigo] || String(codigo || 'Error desconocido');
  }

  /**
   * Envía todas las pendientes, una por una.
   * Se hace en serie a propósito: el script serializa las escrituras, así que
   * mandarlas en paralelo solo generaría esperas y respuestas "ocupado".
   */
  function sincronizarAhora(silencioso) {
    if (enviando) return Promise.resolve(estado());
    if (!configurada()) {
      ultimoError = 'El envío a Google Drive no está configurado.';
      avisarCambio();
      return Promise.resolve(estado());
    }
    if (!navigator.onLine) {
      ultimoError = 'Sin conexión. Las encuestas quedan guardadas y se enviarán solas.';
      avisarCambio();
      return Promise.resolve(estado());
    }

    var cola = pendientes();
    if (!cola.length) {
      ultimoError = '';
      avisarCambio();
      return Promise.resolve(estado());
    }

    enviando = true;
    ultimoError = '';
    avisarCambio();

    var enviadas = 0;
    var fallidas = 0;

    // Cadena secuencial de promesas.
    var cadena = Promise.resolve();
    cola.forEach(function (registro) {
      cadena = cadena.then(function () {
        return enviarUna(registro).then(function (res) {
          // Se relee el registro por si cambió mientras se enviaba.
          var actual = window.Almacen.obtener(registro.id_encuesta);
          if (!actual) return;

          var cambios = { intentos_sync: (actual.intentos_sync || 0) + 1 };

          if (res.ok) {
            /* Solo se marca como sincronizada si la encuesta NO cambió
               mientras viajaba. Si el diligenciador la corrigió en pleno
               envío, lo confirmado ya no es la versión vigente: se deja en
               la cola y el próximo ciclo envía la corrección. El receptor
               reemplaza por id, así que reenviar nunca duplica. */
            /* Enlaces de Drive de las fotos: se anotan en la encuesta local
               (junto a cada foto) para poder abrirlas desde el aplicativo. */
            if (res.fotos && res.fotos.length) {
              window.Almacen.anotarEnlacesFotos(registro.id_encuesta, res.fotos);
            }
            var sinCambiosEnVuelo = String(actual.fecha_actualizacion || '') === String(registro.fecha_actualizacion || '');
            if (sinCambiosEnVuelo && res.fotosOk) {
              cambios.sincronizada = true;
              cambios.fecha_sincronizacion = new Date().toISOString();
              cambios.ultimo_error_sync = '';
            } else if (!res.fotosOk) {
              /* Los datos llegaron pero alguna foto no se pudo guardar en
                 Drive: la encuesta se queda en la cola para reintentar SOLO
                 lo que falta (las ya guardadas viajan con drive_id y se
                 conservan). */
              cambios.ultimo_error_sync = 'Datos recibidos; falta guardar alguna foto en Drive. Se reintentará.';
              ultimoError = cambios.ultimo_error_sync;
            }
            enviadas++;
          } else {
            cambios.ultimo_error_sync = res.mensaje;
            ultimoError = res.mensaje;
            fallidas++;
          }

          // Se usa marcarSincronizacion y NO guardar: es la única vía que
          // toca estos campos, y así una copia vieja del formulario no puede
          // borrar el estado de envío.
          window.Almacen.marcarSincronizacion(registro.id_encuesta, cambios);
          avisarCambio();
        });
      });
    });

    return cadena.then(function () {
      enviando = false;
      avisarCambio();
      var resumen = estado();
      resumen.enviadas = enviadas;
      resumen.fallidas = fallidas;
      resumen.silencioso = !!silencioso;
      return resumen;
    }).catch(function (e) {
      // Red de seguridad: pase lo que pase, no quedarse en "enviando", porque
      // ese estado bloquea todos los envíos siguientes y el respaldo dejaría
      // de funcionar en silencio.
      enviando = false;
      ultimoError = 'El envío se interrumpió: ' + (e && e.message ? e.message : e) +
        '. La información sigue guardada en este equipo.';
      avisarCambio();
      var resumen = estado();
      resumen.enviadas = enviadas;
      resumen.fallidas = fallidas;
      return resumen;
    });
  }

  /** Consulta genérica al receptor. Devuelve el objeto de respuesta, o null
      si no hay conexión, el receptor es una versión vieja que no conoce la
      acción, o cualquier otro fallo: quien llama decide qué hacer sin. */
  function consultar(cuerpo, tiempoLimite) {
    if (!configurada() || !navigator.onLine) return Promise.resolve(null);

    var control = new AbortController();
    var corte = setTimeout(function () { control.abort(); }, tiempoLimite || 20000);

    cuerpo.token = window.CONFIG_SYNC.token;
    if (window.CONFIG_SYNC.tokenLectura) cuerpo.token_lectura = window.CONFIG_SYNC.tokenLectura;
    return fetch(window.CONFIG_SYNC.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(cuerpo),
      redirect: 'follow',
      signal: control.signal
    })
      .then(function (r) { clearTimeout(corte); return r.text(); })
      .then(function (t) {
        var d = JSON.parse(t);
        return d.ok ? d : null;
      })
      .catch(function () { clearTimeout(corte); return null; });
  }

  /**
   * Resumen central: todas las encuestas que la base de CIENFI ha recibido,
   * de todos los equipos. Para el panel del coordinador.
   */
  function consultarAvance() {
    return consultar({ accion: 'avance' }).then(function (d) {
      return (d && Array.isArray(d.encuestas)) ? d.encuestas : null;
    });
  }

  /**
   * Encuestas de un usuario guardadas en la base central, como registros
   * completos listos para importar. Devuelve la lista (puede ser vacía) o
   * null si el centro no está disponible.
   */
  function traerMisEncuestas(usuario) {
    return consultar({ accion: 'mis_encuestas', usuario: usuario }, 30000).then(function (d) {
      if (!d || !Array.isArray(d.encuestas)) return null;
      var validas = [];
      d.encuestas.forEach(function (texto) {
        try {
          var reg = JSON.parse(texto);
          if (reg && reg.id_encuesta && reg.tipo_formulario) validas.push(reg);
        } catch (e) { /* un respaldo ilegible no daña los demás */ }
      });
      return validas;
    });
  }

  /** Comprobación de conexión sin escribir nada en la hoja. */
  function probarConexion() {
    if (!configurada()) {
      return Promise.resolve({ ok: false, mensaje: 'Falta configurar la dirección y el token.' });
    }
    var control = new AbortController();
    var corte = setTimeout(function () { control.abort(); }, 20000);

    return fetch(window.CONFIG_SYNC.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ accion: 'ping', token: window.CONFIG_SYNC.token }),
      redirect: 'follow',
      signal: control.signal
    })
      .then(function (r) { clearTimeout(corte); return r.text(); })
      .then(function (t) {
        var d = JSON.parse(t);
        return d.ok
          ? { ok: true, mensaje: 'Conexión correcta con la hoja de CIENFI.' +
              (d.version ? ' Receptor versión ' + d.version + '.' : ' Receptor en versión anterior (sin vista central ni recuperación).') +
              ' Hora del servidor: ' + d.hora_servidor }
          : { ok: false, mensaje: mensajeDeError(d.error) };
      })
      .catch(function (e) {
        clearTimeout(corte);
        return { ok: false, mensaje: 'No se pudo conectar: ' + (e.message || 'error desconocido') };
      });
  }

  // --- Arranque -------------------------------------------------------------

  function iniciar(alCambiar) {
    alCambiarEstado = alCambiar || null;

    // Al recuperar la conexión se intenta de inmediato.
    window.addEventListener('online', function () {
      ultimoError = '';
      avisarCambio();
      sincronizarAhora(true);
    });
    window.addEventListener('offline', avisarCambio);

    // Reintento periódico mientras queden pendientes.
    clearInterval(temporizador);
    temporizador = setInterval(function () {
      if (!enviando && navigator.onLine && pendientes().length) sincronizarAhora(true);
    }, (window.CONFIG_SYNC || {}).intervaloReintento || 90000);

    avisarCambio();
    // Un intento al abrir, por si quedaron encuestas de una jornada anterior.
    if (pendientes().length) sincronizarAhora(true);
  }

  window.Sincronizacion = {
    iniciar: iniciar,
    sincronizarAhora: sincronizarAhora,
    probarConexion: probarConexion,
    pendientes: pendientes,
    estado: estado,
    configurada: configurada,
    nombreEquipo: nombreEquipo,
    consultarAvance: consultarAvance,
    traerMisEncuestas: traerMisEncuestas
  };
})();
