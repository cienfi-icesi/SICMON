/* ============================================================================
   storage.js — Persistencia local de las encuestas.

   Los registros se guardan en localStorage del navegador. Es la opción más
   robusta para una operación de campo sin garantía de conexión: nada depende
   de la red y el dato sobrevive a que se cierre el navegador o se apague el
   equipo.

   IMPORTANTE PARA LA OPERACIÓN: los datos viven en el navegador de CADA
   equipo. La consolidación se hace descargando el CSV desde cada equipo.
   El botón "Descargar respaldo" genera un JSON restaurable en otro equipo.

   Estructura de un registro:
     id_encuesta        VIV-20260812-A3F2K9 / PER-20260812-B7H1M4
     tipo_formulario    'vivienda' | 'personas'
     id_hogar           HOG-20260812-9F2C  (llave que relaciona formularios)
     usuario            usuario que diligenció
     estado             'borrador' | 'finalizada'
     respuestas         { id_campo: valor }
     personas           [ { id_campo: valor } ]   (solo tipo 'personas')
   ========================================================================== */
(function () {
  'use strict';

  var CLAVE_ENCUESTAS = 'damage_cali_encuestas_v1';
  var CLAVE_SESION = 'damage_cali_sesion_v1';
  var CLAVE_BORRADOR_ACTIVO = 'damage_cali_borrador_activo_v1';

  var ALFABETO = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // sin 0/O/1/I para evitar confusiones

  function aleatorio(n) {
    var s = '';
    var bytes = new Uint8Array(n);
    (window.crypto || window.msCrypto).getRandomValues(bytes);
    for (var i = 0; i < n; i++) s += ALFABETO[bytes[i] % ALFABETO.length];
    return s;
  }

  function hoyCompacto(fecha) {
    var d = fecha || new Date();
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    return '' + d.getFullYear() + mm + dd;
  }

  /** Genera el identificador visible de una encuesta. */
  function nuevoIdEncuesta(tipoFormulario) {
    var prefijo = tipoFormulario === 'vivienda' ? 'VIV'
      : tipoFormulario === 'afectaciones' ? 'AFE' : 'PER';
    return prefijo + '-' + hoyCompacto() + '-' + aleatorio(6);
  }

  /** Genera el identificador de hogar que relaciona los dos formularios. */
  function nuevoIdHogar() {
    return 'HOG-' + hoyCompacto() + '-' + aleatorio(5);
  }

  // --- Lectura y escritura del almacén --------------------------------------
  function leerTodo() {
    try {
      var crudo = localStorage.getItem(CLAVE_ENCUESTAS);
      var datos = crudo ? JSON.parse(crudo) : {};
      return (datos && typeof datos === 'object') ? datos : {};
    } catch (e) {
      console.error('No fue posible leer las encuestas almacenadas:', e);
      return {};
    }
  }

  function escribirTodo(datos) {
    try {
      localStorage.setItem(CLAVE_ENCUESTAS, JSON.stringify(datos));
      return { ok: true };
    } catch (e) {
      // Cuota agotada: es el único escenario en que se puede perder trabajo.
      console.error('No fue posible guardar:', e);
      return {
        ok: false,
        mensaje: 'No fue posible guardar la información: el almacenamiento del ' +
          'navegador está lleno. Descargue el respaldo y los CSV, y avise al ' +
          'coordinador antes de continuar.'
      };
    }
  }

  // --- API pública -----------------------------------------------------------

  /** Lista de encuestas ordenada de la más reciente a la más antigua. */
  function listar(filtro) {
    var datos = leerTodo();
    var lista = Object.keys(datos).map(function (k) { return datos[k]; });

    filtro = filtro || {};
    if (filtro.tipo_formulario) {
      lista = lista.filter(function (r) { return r.tipo_formulario === filtro.tipo_formulario; });
    }
    if (filtro.usuario) {
      // Acepta un usuario o una lista (el actual + los nombres anteriores).
      var admitidos = [].concat(filtro.usuario);
      lista = lista.filter(function (r) { return admitidos.indexOf(r.usuario) !== -1; });
    }
    if (filtro.estado) {
      lista = lista.filter(function (r) { return r.estado === filtro.estado; });
    }

    return lista.sort(function (a, b) {
      return String(b.fecha_actualizacion || '').localeCompare(String(a.fecha_actualizacion || ''));
    });
  }

  function obtener(idEncuesta) {
    return leerTodo()[idEncuesta] || null;
  }

  /** Crea un registro nuevo en estado borrador. */
  function crear(opciones) {
    var ahora = new Date().toISOString();
    var registro = {
      id_encuesta: nuevoIdEncuesta(opciones.tipo_formulario),
      tipo_formulario: opciones.tipo_formulario,
      id_hogar: opciones.id_hogar || nuevoIdHogar(),
      usuario: opciones.usuario,
      usuario_nombre: opciones.usuario_nombre,
      rol: opciones.rol,
      estado: 'borrador',
      fecha_creacion: ahora,
      fecha_actualizacion: ahora,
      fecha_finalizacion: null,
      app_version: (window.APP_CONFIG && window.APP_CONFIG.appVersion) || '',
      respuestas: opciones.respuestas || {},
      personas: opciones.tipo_formulario === 'personas' ? (opciones.personas || [{}]) : [],

      // --- Trazabilidad -----------------------------------------------------
      // n_actualizaciones cuenta cuántas veces se ha escrito el registro;
      // bitacora guarda solo los hitos, no cada tecla (ver registrarEvento).
      n_actualizaciones: 0,
      bitacora: [],

      // --- Envío a la base central ------------------------------------------
      // Los administra EN EXCLUSIVA la capa de sincronización, a través de
      // marcarSincronizacion(). Ver CAMPOS_SYNC más abajo.
      sincronizada: false,
      fecha_sincronizacion: null,
      intentos_sync: 0,
      ultimo_error_sync: ''
    };
    registrarEvento(registro, 'creada', 'Encuesta creada por ' + (opciones.usuario_nombre || opciones.usuario || ''));
    return registro;
  }

  /**
   * Añade un hito a la bitácora del registro.
   *
   * Solo se registran hitos, no cada cambio de tecla: el guardado automático
   * corre cada 400 ms y una bitácora por pulsación llenaría el almacenamiento.
   * Los eventos de tipo 'editada' se agrupan: si ya hay uno de hace menos de
   * VENTANA_EDICION, se actualiza su fecha en lugar de añadir otro. Así la
   * bitácora muestra sesiones de trabajo y no ruido.
   */
  var MAX_BITACORA = 60;
  var VENTANA_EDICION = 5 * 60 * 1000;   // 5 minutos

  function registrarEvento(registro, evento, detalle) {
    if (!registro) return;
    if (!Array.isArray(registro.bitacora)) registro.bitacora = [];
    var ahora = new Date();

    if (evento === 'editada' && registro.bitacora.length) {
      var ultimo = registro.bitacora[registro.bitacora.length - 1];
      if (ultimo.evento === 'editada' &&
          (ahora.getTime() - new Date(ultimo.fecha).getTime()) < VENTANA_EDICION) {
        ultimo.fecha = ahora.toISOString();
        ultimo.detalle = detalle || ultimo.detalle;
        return;
      }
    }

    registro.bitacora.push({
      fecha: ahora.toISOString(),
      evento: evento,
      detalle: detalle || ''
    });
    // Se conservan los últimos: la bitácora es para trazabilidad reciente,
    // no un registro de auditoría completo.
    if (registro.bitacora.length > MAX_BITACORA) {
      registro.bitacora = registro.bitacora.slice(-MAX_BITACORA);
    }
  }

  /**
   * Guarda (crea o actualiza) un registro. Devuelve {ok, mensaje}.
   *
   * SIEMPRE actualiza el mismo registro, indexado por id_encuesta: guardar dos
   * veces la misma encuesta no crea una segunda. Es la garantía de que una
   * corrección no duplica el registro.
   */
  /* Campos que describen el envío a la base central. Los administra EN
     EXCLUSIVA la capa de sincronización, a través de marcarSincronizacion().

     Por qué hace falta protegerlos: la pantalla del formulario conserva en
     memoria una copia del registro. Si mientras tanto la cola envía esa
     encuesta en segundo plano y luego el formulario vuelve a guardar su copia
     —al pulsar «Inicio», por ejemplo—, esa copia vieja borraría las marcas de
     envío y la encuesta aparecería como pendiente aunque ya hubiera llegado. */
  var CAMPOS_SYNC = ['sincronizada', 'fecha_sincronizacion', 'intentos_sync', 'ultimo_error_sync'];

  function conservarEnlacesFotos(previo, registro) {
    if (!previo.respuestas || !registro.respuestas) return;
    Object.keys(previo.respuestas).forEach(function (k) {
      var antes = previo.respuestas[k];
      var ahora = registro.respuestas[k];
      if (!Array.isArray(antes) || !Array.isArray(ahora)) return;
      if (!antes.length || !antes[0] || antes[0].nombre === undefined) return; // no es una lista de fotos
      antes.forEach(function (fa) {
        if (!fa || !fa.url) return;
        ahora.forEach(function (fh) {
          if (fh && !fh.url && fh.nombre === fa.nombre && fh.tam === fa.tam) {
            fh.url = fa.url;
            fh.drive_id = fa.drive_id || '';
            if (fa.compartida !== undefined) fh.compartida = fa.compartida;
            // Si en disco ya se soltaron los bytes, no se resucitan desde la copia vieja.
            if (fa.datos === undefined && fh.compartida !== false) delete fh.datos;
          }
        });
      });
    });
  }

  function guardar(registro) {
    if (!registro || !registro.id_encuesta) return { ok: false, mensaje: 'Registro inválido.' };
    var datos = leerTodo();
    var previo = datos[registro.id_encuesta];

    registro.fecha_actualizacion = new Date().toISOString();
    registro.n_actualizaciones = (registro.n_actualizaciones || 0) + 1;

    if (previo) {
      // El estado de envío que está en disco siempre manda sobre el que traiga
      // el registro en memoria.
      CAMPOS_SYNC.forEach(function (campo) {
        if (previo[campo] === undefined) delete registro[campo];
        else registro[campo] = previo[campo];
      });
      // Por lo mismo con la bitácora: los eventos de envío se escriben en la
      // copia del almacén y se perderían al guardar desde el formulario.
      registro.bitacora = fusionarBitacora(previo.bitacora, registro.bitacora);

      /* Los enlaces de Drive de las fotos los escribe el servidor (vía
         anotarEnlacesFotos). Si la copia en memoria del formulario es
         anterior a esa confirmación, no debe pisarlos: se conservan de la
         copia en disco, foto por foto, emparejando por nombre y tamaño. */
      conservarEnlacesFotos(previo, registro);

      /* Una encuesta FINALIZADA que ya estaba en la base central y vuelve a
         guardarse (la reabrieron para corregirla) regresa a la cola de
         envío, aunque no vuelvan a pulsar «Finalizar»: la base central debe
         reflejar siempre la última versión guardada. El reenvío es seguro:
         el receptor reemplaza por id en vez de duplicar. */
      if (previo.estado === 'finalizada' && previo.sincronizada) {
        registro.sincronizada = false;
      }
    }

    datos[registro.id_encuesta] = registro;
    return escribirTodo(datos);
  }

  /**
   * Única vía para modificar el estado de envío de una encuesta.
   * Relee el registro del almacenamiento para no arrastrar copias viejas.
   */
  function marcarSincronizacion(idEncuesta, cambios) {
    var datos = leerTodo();
    var registro = datos[idEncuesta];
    if (!registro) return { ok: false, mensaje: 'La encuesta ya no existe en este equipo.' };

    Object.keys(cambios).forEach(function (campo) { registro[campo] = cambios[campo]; });

    if (cambios.sincronizada) {
      registrarEvento(registro, 'sincronizada', 'Enviada a la base central');
    } else if (cambios.ultimo_error_sync) {
      registrarEvento(registro, 'error_sync', cambios.ultimo_error_sync);
    }

    return escribirTodo(datos);
  }


  /**
   * Anota, junto a cada foto de la encuesta, el enlace y el id que le asignó
   * Drive al recibirla. Relee del almacén y toca solo esos dos campos: como
   * marcarSincronizacion, es una vía estrecha para que una copia vieja del
   * formulario en memoria no pise lo que confirmó el servidor.
   * `enlaces` = [{ campo, indice, url, drive_id }].
   */
  function anotarEnlacesFotos(idEncuesta, enlaces) {
    var datos = leerTodo();
    var registro = datos[idEncuesta];
    if (!registro || !Array.isArray(enlaces)) return { ok: false };
    registro.respuestas = registro.respuestas || {};

    var anotados = 0;
    enlaces.forEach(function (e) {
      if (!Array.isArray(registro.respuestas[e.campo])) registro.respuestas[e.campo] = [];
      var lista = registro.respuestas[e.campo];
      // Foto que estaba en Drive y el equipo no conocia: se agrega a la lista.
      if (!lista[e.indice] && e.recuperada) lista[e.indice] = { nombre: e.nombre || 'foto', mime: 'image/jpeg', tam: 0 };
      if (!lista[e.indice]) return;
      lista[e.indice].url = e.url || '';
      lista[e.indice].drive_id = e.drive_id || '';
      if (e.compartida !== undefined) lista[e.indice].compartida = !!e.compartida;
      /* Ya está a salvo en Drive: los bytes locales se sueltan para liberar
         el almacén del equipo (la vista previa pasa a cargarse del enlace).
         Solo si el enlace quedó público; si no, la miniatura local es la
         única forma de verla en este equipo. */
      if (e.drive_id && e.compartida !== false) delete lista[e.indice].datos;
      anotados++;
    });
    if (anotados) registrarEvento(registro, 'fotos_en_drive', anotados + ' foto(s) guardada(s) en Drive');
    return escribirTodo(datos);
  }

  /**
   * Une la bitácora almacenada con la que trae el registro en memoria.
   *
   * Hace falta por lo mismo: los eventos de sincronización se escriben en la
   * copia del almacén, y sin fusionar se perderían al guardar desde el
   * formulario. Se descartan duplicados por fecha y tipo de evento.
   */
  function fusionarBitacora(anterior, entrante) {
    var vistos = {};
    var union = [];
    (anterior || []).concat(entrante || []).forEach(function (b) {
      if (!b || !b.fecha) return;
      var clave = b.fecha + '|' + b.evento;
      if (vistos[clave]) return;
      vistos[clave] = true;
      union.push(b);
    });
    union.sort(function (a, b) { return String(a.fecha).localeCompare(String(b.fecha)); });

    /* Se colapsan las ediciones seguidas dejando la más reciente.
       Hace falta porque registrarEvento agrupa actualizando la FECHA del
       último evento 'editada': al fusionar, la versión guardada y la de
       memoria tienen fechas distintas y se verían como dos hitos. Sin esto,
       cada guardado añadiría una línea y la agrupación no serviría de nada. */
    var colapsada = [];
    union.forEach(function (b) {
      var ultimo = colapsada[colapsada.length - 1];
      if (ultimo && ultimo.evento === 'editada' && b.evento === 'editada') {
        colapsada[colapsada.length - 1] = b;   // se conserva la más reciente
        return;
      }
      colapsada.push(b);
    });

    return colapsada.slice(-MAX_BITACORA);
  }

  /** Marca el registro como finalizado y lo guarda. */
  function finalizar(registro) {
    var reabierta = registro.estado === 'finalizada';
    registro.estado = 'finalizada';
    registro.fecha_finalizacion = new Date().toISOString();
    registrarEvento(registro, reabierta ? 'refinalizada' : 'finalizada',
      reabierta ? 'Encuesta corregida y finalizada de nuevo' : 'Encuesta finalizada');
    var res = guardar(registro);

    /* Una encuesta corregida vuelve a la cola de envío: sin esto, la base
       central se quedaría con la versión anterior para siempre (la cola solo
       toma encuestas con sincronizada=false). El reenvío es seguro: el
       receptor reemplaza las filas de la encuesta en vez de duplicarlas.
       Se hace por marcarSincronizacion, la única vía autorizada para tocar
       el estado de envío, y se refleja en la copia en memoria. */
    if (res.ok && reabierta && registro.sincronizada) {
      marcarSincronizacion(registro.id_encuesta, { sincronizada: false });
      registro.sincronizada = false;
    }
    return res;
  }

  /* Lápidas: ids de encuestas eliminadas a propósito en este equipo. Sin
     esto, una encuesta borrada que ya estaba en la base central "resucitaría"
     en el siguiente inicio de sesión al importarse de nuevo. */
  var CLAVE_ELIMINADAS = 'damage_cali_eliminadas_v1';
  var MAX_ELIMINADAS = 300;

  function leerEliminadas() {
    try {
      var lista = JSON.parse(localStorage.getItem(CLAVE_ELIMINADAS) || '[]');
      return Array.isArray(lista) ? lista : [];
    } catch (e) { return []; }
  }

  function eliminar(idEncuesta) {
    var datos = leerTodo();
    delete datos[idEncuesta];

    var eliminadas = leerEliminadas();
    if (eliminadas.indexOf(idEncuesta) === -1) {
      eliminadas.push(idEncuesta);
      if (eliminadas.length > MAX_ELIMINADAS) eliminadas = eliminadas.slice(-MAX_ELIMINADAS);
      try { localStorage.setItem(CLAVE_ELIMINADAS, JSON.stringify(eliminadas)); } catch (e) { /* sin lápida */ }
    }
    return escribirTodo(datos);
  }

  /**
   * Encuestas del mismo hogar, excluyendo la indicada.
   * Permite mostrar en pantalla si el hogar ya tiene el otro formulario.
   */
  function hermanas(idHogar, idEncuestaExcluir) {
    if (!idHogar) return [];
    return listar().filter(function (r) {
      return r.id_hogar === idHogar && r.id_encuesta !== idEncuestaExcluir;
    });
  }

  // --- Estado de envío a la base central ------------------------------------

  /**
   * Resumen del envío, para los indicadores de la interfaz.
   *
   * Solo se envían encuestas FINALIZADAS: un borrador a medias no tiene por
   * qué viajar a la base central. Los borradores se cuentan aparte para que el
   * coordinador sepa qué falta cerrar.
   */
  function conteoSync() {
    var conteo = { sincronizadas: 0, porEnviar: 0, conError: 0, borradores: 0, total: 0 };
    listar().forEach(function (r) {
      conteo.total++;
      if (r.estado !== 'finalizada') { conteo.borradores++; return; }
      if (r.sincronizada) conteo.sincronizadas++;
      else conteo.porEnviar++;
      if (r.ultimo_error_sync) conteo.conError++;
    });
    return conteo;
  }

  // --- Sesión ---------------------------------------------------------------
  function guardarSesion(sesion) {
    try { localStorage.setItem(CLAVE_SESION, JSON.stringify(sesion)); } catch (e) { /* sin sesión persistente */ }
  }

  function leerSesion() {
    try { return JSON.parse(localStorage.getItem(CLAVE_SESION) || 'null'); } catch (e) { return null; }
  }

  function borrarSesion() {
    localStorage.removeItem(CLAVE_SESION);
    localStorage.removeItem(CLAVE_BORRADOR_ACTIVO);
  }

  function guardarBorradorActivo(idEncuesta) {
    try {
      if (idEncuesta) localStorage.setItem(CLAVE_BORRADOR_ACTIVO, idEncuesta);
      else localStorage.removeItem(CLAVE_BORRADOR_ACTIVO);
    } catch (e) { /* no crítico */ }
  }

  function leerBorradorActivo() {
    return localStorage.getItem(CLAVE_BORRADOR_ACTIVO) || null;
  }

  // --- Estadísticas para el panel de coordinación ---------------------------
  /**
   * Resumen del avance de la operación.
   * Solo se cuentan encuestas finalizadas en los totales de avance; los
   * borradores se reportan aparte para que el coordinador sepa qué falta cerrar.
   */
  function estadisticas() {
    var todas = listar();
    var finalizadas = todas.filter(function (r) { return r.estado === 'finalizada'; });
    var borradores = todas.filter(function (r) { return r.estado !== 'finalizada'; });

    var porUsuario = {};
    var canon = (window.APP_CONFIG && window.APP_CONFIG.canonicoDe) ? window.APP_CONFIG.canonicoDe : function (u) { return u; };
    finalizadas.forEach(function (r) {
      var k = canon(r.usuario) || '(sin usuario)';
      if (!porUsuario[k]) {
        porUsuario[k] = {
          usuario: k,
          nombre: r.usuario_nombre || k,
          vivienda: 0,
          personas: 0,
          afectaciones: 0,
          total: 0,
          ultima: null
        };
      }
      if (porUsuario[k][r.tipo_formulario] !== undefined) porUsuario[k][r.tipo_formulario] += 1;
      porUsuario[k].total += 1;
      var f = r.fecha_finalizacion || r.fecha_actualizacion;
      if (!porUsuario[k].ultima || String(f) > String(porUsuario[k].ultima)) porUsuario[k].ultima = f;
    });

    var ultima = null;
    finalizadas.forEach(function (r) {
      var f = r.fecha_finalizacion || r.fecha_actualizacion;
      if (!ultima || String(f) > String(ultima)) ultima = f;
    });

    // Hogares con los dos formularios diligenciados.
    var porHogar = {};
    finalizadas.forEach(function (r) {
      if (!r.id_hogar) return;
      if (!porHogar[r.id_hogar]) porHogar[r.id_hogar] = {};
      porHogar[r.id_hogar][r.tipo_formulario] = true;
    });
    var hogaresCompletos = Object.keys(porHogar).filter(function (h) {
      return porHogar[h].vivienda && porHogar[h].personas;
    }).length;

    var totalPersonas = 0;
    finalizadas.forEach(function (r) {
      if (r.tipo_formulario === 'personas') totalPersonas += (r.personas || []).length;
    });

    return {
      total: finalizadas.length,
      vivienda: finalizadas.filter(function (r) { return r.tipo_formulario === 'vivienda'; }).length,
      personas: finalizadas.filter(function (r) { return r.tipo_formulario === 'personas'; }).length,
      afectaciones: finalizadas.filter(function (r) { return r.tipo_formulario === 'afectaciones'; }).length,
      borradores: borradores.length,
      personasRegistradas: totalPersonas,
      hogaresCompletos: hogaresCompletos,
      hogares: Object.keys(porHogar).length,
      ultimaActividad: ultima,
      porUsuario: Object.keys(porUsuario).map(function (k) { return porUsuario[k]; })
        .sort(function (a, b) { return b.total - a.total; })
    };
  }

  // --- Respaldo completo (JSON) ---------------------------------------------
  function exportarRespaldo() {
    return JSON.stringify({
      app: 'app_damage_alcaldia',
      version: (window.APP_CONFIG && window.APP_CONFIG.appVersion) || '',
      generado: new Date().toISOString(),
      encuestas: leerTodo()
    }, null, 2);
  }

  /**
   * Restaura un respaldo SIN borrar lo que ya existe: los registros del
   * respaldo se agregan y los que ya estaban se conservan salvo que el
   * respaldo traiga una versión más reciente del mismo id.
   */
  function importarRespaldo(textoJson) {
    var paquete;
    try {
      paquete = JSON.parse(textoJson);
    } catch (e) {
      return { ok: false, mensaje: 'El archivo no es un respaldo válido.' };
    }
    if (!paquete || !paquete.encuestas || typeof paquete.encuestas !== 'object') {
      return { ok: false, mensaje: 'El archivo no contiene encuestas.' };
    }

    var actuales = leerTodo();
    var agregadas = 0;
    var actualizadas = 0;

    Object.keys(paquete.encuestas).forEach(function (id) {
      var entrante = paquete.encuestas[id];
      var existente = actuales[id];
      if (!existente) {
        actuales[id] = entrante;
        agregadas++;
      } else if (String(entrante.fecha_actualizacion || '') > String(existente.fecha_actualizacion || '')) {
        actuales[id] = entrante;
        actualizadas++;
      }
    });

    var res = escribirTodo(actuales);
    if (!res.ok) return res;
    return {
      ok: true,
      mensaje: 'Respaldo restaurado: ' + agregadas + ' encuesta(s) nueva(s) y ' +
        actualizadas + ' actualizada(s).'
    };
  }

  /**
   * Importa encuestas recuperadas de la base central (cuando el usuario
   * cambia de equipo). Reglas deliberadamente conservadoras:
   *
   *  · Si la encuesta NO existe en este equipo, se agrega.
   *  · Si existe, solo se reemplaza cuando lo local ya está FINALIZADO Y
   *    ENVIADO (nada local sin enviar se puede perder) y el centro trae una
   *    versión más reciente — una corrección hecha en otro equipo.
   *  · En cualquier otro caso lo local manda: el trabajo en curso de este
   *    equipo jamás se toca.
   *
   * Las importadas se marcan como ya sincronizadas: vienen de la base
   * central por definición, así no vuelven a la cola de envío.
   */
  function importarDeCentral(lista) {
    var actuales = leerTodo();
    var agregadas = 0;
    var actualizadas = 0;

    var eliminadas = leerEliminadas();

    (lista || []).forEach(function (entrante) {
      if (!entrante || !entrante.id_encuesta) return;
      // Lo eliminado a propósito en este equipo no resucita.
      if (eliminadas.indexOf(entrante.id_encuesta) !== -1) return;

      var existente = actuales[entrante.id_encuesta];
      if (existente) {
        var reemplazable = existente.estado === 'finalizada' && existente.sincronizada &&
          String(entrante.fecha_actualizacion || '') > String(existente.fecha_actualizacion || '');
        if (!reemplazable) return;
        actualizadas++;
      } else {
        agregadas++;
      }

      entrante.sincronizada = true;
      entrante.fecha_sincronizacion = entrante.fecha_sincronizacion || new Date().toISOString();
      entrante.ultimo_error_sync = '';
      registrarEvento(entrante, 'importada', existente
        ? 'Actualizada con la corrección recibida por la base central'
        : 'Recuperada desde la base central en este equipo');
      actuales[entrante.id_encuesta] = entrante;
    });

    if (!agregadas && !actualizadas) return { ok: true, agregadas: 0, actualizadas: 0 };
    var res = escribirTodo(actuales);
    return res.ok ? { ok: true, agregadas: agregadas, actualizadas: actualizadas } : res;
  }

  window.Almacen = {
    listar: listar,
    obtener: obtener,
    crear: crear,
    guardar: guardar,
    finalizar: finalizar,
    eliminar: eliminar,
    hermanas: hermanas,
    nuevoIdHogar: nuevoIdHogar,
    estadisticas: estadisticas,
    registrarEvento: registrarEvento,
    marcarSincronizacion: marcarSincronizacion,
    anotarEnlacesFotos: anotarEnlacesFotos,
    conteoSync: conteoSync,
    guardarSesion: guardarSesion,
    leerSesion: leerSesion,
    borrarSesion: borrarSesion,
    guardarBorradorActivo: guardarBorradorActivo,
    leerBorradorActivo: leerBorradorActivo,
    exportarRespaldo: exportarRespaldo,
    importarRespaldo: importarRespaldo,
    importarDeCentral: importarDeCentral
  };
})();
