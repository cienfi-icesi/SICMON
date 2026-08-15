/* ============================================================================
   export.js — Exportación de las encuestas a CSV.

   Criterios de diseño (para que el dato sea analizable sin reprocesarlo):

   1. Una columna por pregunta, con el mismo identificador que usa el
      formulario. Las columnas se derivan del esquema, no de los datos: si
      nadie respondió una pregunta la columna igual aparece, vacía. Así todos
      los archivos de todos los equipos tienen exactamente las mismas
      columnas y se pueden apilar sin conciliar nada.

   2. Las preguntas de opción única generan dos columnas: el código que
      guarda el formato original (por ejemplo "3") y su etiqueta legible
      ("Cédula de ciudadanía"). El análisis usa el código; la revisión
      manual, la etiqueta.

   3. Las preguntas de selección múltiple generan una columna indicadora 0/1
      por cada opción, más una columna con los códigos concatenados.

   4. El formulario de Personas/Familia produce dos archivos: uno por hogar
      y otro con una fila por persona (formato largo), unidos por id_encuesta.

   Archivos que se pueden generar:
      viviendas.csv          una fila por formulario de vivienda
      personas_hogares.csv   una fila por formulario de personas/familia
      personas.csv           una fila por persona registrada
      indice_encuestas.csv   una fila por encuesta (metadatos de control)
   ========================================================================== */
(function () {
  'use strict';

  var TIPOS_SIN_DATO = ['subtitulo', 'nota', 'aviso'];

  // --- Utilidades de CSV ----------------------------------------------------

  /**
   * Neutraliza el valor si Excel lo interpretaría como fórmula.
   * Solo aplica a "=" y "@", que no aparecen al inicio de datos legítimos;
   * "+" y "-" se dejan intactos porque son válidos en teléfonos y números.
   */
  function neutralizarFormula(texto) {
    if (/^[=@]/.test(texto)) return "'" + texto;
    return texto;
  }

  function celda(valor, separador) {
    if (valor === null || valor === undefined) return '';
    var texto = neutralizarFormula(String(valor));
    if (texto.indexOf(separador) !== -1 || texto.indexOf('"') !== -1 ||
        texto.indexOf('\n') !== -1 || texto.indexOf('\r') !== -1) {
      return '"' + texto.replace(/"/g, '""') + '"';
    }
    return texto;
  }

  function construirCsv(columnas, filas, separador) {
    separador = separador || ',';
    var lineas = [columnas.map(function (c) { return celda(c, separador); }).join(separador)];
    filas.forEach(function (fila) {
      lineas.push(columnas.map(function (c) { return celda(fila[c], separador); }).join(separador));
    });
    return lineas.join('\r\n');
  }

  /** Descarga un texto como archivo. El BOM hace que Excel respete las tildes. */
  function descargar(nombreArchivo, contenido) {
    var blob = new Blob(['\ufeff' + contenido], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function descargarTexto(nombreArchivo, contenido, tipoMime) {
    var blob = new Blob([contenido], { type: tipoMime || 'application/json;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function selloTiempo() {
    var d = new Date();
    var p = function (n) { return String(n).padStart(2, '0'); };
    return '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' +
      p(d.getHours()) + p(d.getMinutes());
  }

  // --- Derivación de columnas desde el esquema del formulario ---------------

  /** Recorre los campos con dato de una lista de secciones. */
  function camposConDato(secciones) {
    var salida = [];
    (secciones || []).forEach(function (sec) {
      (sec.campos || []).forEach(function (campo) {
        if (TIPOS_SIN_DATO.indexOf(campo.tipo) !== -1) return;
        if (!campo.id) return;
        salida.push(campo);
      });
    });
    return salida;
  }

  /** Columnas que genera un campo, en orden. */
  function columnasDeCampo(campo) {
    if (campo.tipo === 'unica') {
      // Tres columnas: el valor guardado, su número de respuesta y su etiqueta.
      return [campo.id, campo.id + '_num', campo.id + '_etiqueta'];
    }
    if (campo.tipo === 'multiple') {
      var cols = [campo.id, campo.id + '_nums'];
      (campo.opciones || []).forEach(function (op) {
        cols.push(campo.id + '__' + op.valor);
      });
      return cols;
    }
    if (campo.tipo === 'direccion') {
      // El campo compuesto no aporta una columna sino todos sus componentes:
      // tipo_via, numero_via, ..., direccion_completa, latitud, longitud,
      // sistema_coordenadas y fuente_georreferenciacion.
      return window.CampoDireccion.columnas();
    }
    if (campo.tipo === 'fotos') {
      // Nunca los bytes: solo cuántas, sus nombres y sus enlaces en Drive.
      return [campo.id + '_cantidad', campo.id + '_nombres', campo.id + '_enlaces'];
    }
    if (campo.tipo === 'lista') {
      // El valor legible (nombre oficial) y, al lado, el código del catálogo
      // (código DANE en el caso de municipios) para cruzar con bases oficiales.
      return [campo.id, campo.id + '_codigo'];
    }
    return [campo.id];
  }

  /**
   * Vuelca en la fila los valores que aporta un campo.
   * Recibe el contenedor completo de respuestas (no solo el valor) porque el
   * campo de dirección guarda sus componentes sueltos, no bajo su propio id.
   */
  function valoresDeCampo(campo, contenedor, fila) {
    contenedor = contenedor || {};

    if (campo.tipo === 'direccion') {
      window.CampoDireccion.columnas().forEach(function (col) {
        var v = contenedor[col];
        fila[col] = (v === undefined || v === null) ? '' : v;
      });
      return;
    }

    if (campo.tipo === 'fotos') {
      var r = window.CampoFotos.resumenParaExportar(contenedor[campo.id]);
      fila[campo.id + '_cantidad'] = r.cantidad;
      fila[campo.id + '_nombres'] = r.nombres;
      fila[campo.id + '_enlaces'] = r.enlaces;
      return;
    }

    var valor = contenedor[campo.id];

    if (campo.tipo === 'unica') {
      var etiqueta = '';
      (campo.opciones || []).forEach(function (op) {
        if (String(op.valor) === String(valor)) etiqueta = op.etiqueta;
      });
      fila[campo.id] = (valor === undefined || valor === null) ? '' : valor;
      fila[campo.id + '_num'] = window.CODIGOS.numeroOpcion(campo, valor);
      fila[campo.id + '_etiqueta'] = etiqueta;
      return;
    }
    if (campo.tipo === 'multiple') {
      var lista = Array.isArray(valor) ? valor.map(String) : [];
      fila[campo.id] = lista.join('|');
      fila[campo.id + '_nums'] = lista
        .map(function (v) { return window.CODIGOS.numeroOpcion(campo, v); })
        .filter(function (n) { return n !== ''; }).join('|');
      (campo.opciones || []).forEach(function (op) {
        fila[campo.id + '__' + op.valor] = lista.indexOf(String(op.valor)) !== -1 ? 1 : 0;
      });
      return;
    }
    if (campo.tipo === 'lista') {
      var codigo = '';
      (campo.opciones || []).forEach(function (op) {
        if (String(op.valor) === String(valor)) codigo = op.codigo || '';
      });
      fila[campo.id] = (valor === undefined || valor === null) ? '' : valor;
      fila[campo.id + '_codigo'] = codigo;
      return;
    }
    if (campo.tipo === 'confirmacion') {
      fila[campo.id] = valor ? 1 : 0;
      return;
    }
    fila[campo.id] = (valor === undefined || valor === null) ? '' : valor;
  }

  // --- Metadatos comunes ----------------------------------------------------

  /**
   * Metadatos comunes a todos los archivos.
   *
   * Cada encuesta produce UNA fila: los archivos se generan desde el almacén,
   * que está indexado por id_encuesta, así que una encuesta corregida diez
   * veces sigue siendo una sola fila con su última versión. Las columnas de
   * trazabilidad (fechas, n_actualizaciones, estado del respaldo) permiten
   * saber cuándo se tomó y cuándo se modificó ese dato.
   */
  var COLUMNAS_META = [
    'id_encuesta', 'tipo_formulario', 'id_hogar',
    'usuario', 'usuario_nombre', 'rol', 'estado',
    'fecha', 'hora',
    'fecha_creacion', 'hora_creacion',
    'fecha_actualizacion', 'hora_actualizacion',
    'fecha_finalizacion', 'hora_finalizacion',
    'n_actualizaciones', 'enviada_base_central', 'fecha_envio_base_central',
    'app_version'
  ];

  function partirFechaHora(iso) {
    if (!iso) return { fecha: '', hora: '' };
    var d = new Date(iso);
    if (isNaN(d.getTime())) return { fecha: '', hora: '' };
    var p = function (n) { return String(n).padStart(2, '0'); };
    return {
      fecha: d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()),
      hora: p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds())
    };
  }

  function filaMeta(registro) {
    var ref = registro.fecha_finalizacion || registro.fecha_creacion;
    var fh = partirFechaHora(ref);
    var creacion = partirFechaHora(registro.fecha_creacion);
    var actualizacion = partirFechaHora(registro.fecha_actualizacion);
    var finalizacion = partirFechaHora(registro.fecha_finalizacion);
    return {
      id_encuesta: registro.id_encuesta,
      tipo_formulario: registro.tipo_formulario,
      id_hogar: registro.id_hogar || '',
      usuario: registro.usuario || '',
      usuario_nombre: registro.usuario_nombre || '',
      rol: registro.rol || '',
      estado: registro.estado || '',
      fecha: fh.fecha,
      hora: fh.hora,
      // Fecha y hora separadas de cada hito, además de las marcas completas.
      fecha_creacion: creacion.fecha,
      hora_creacion: creacion.hora,
      fecha_actualizacion: actualizacion.fecha,
      hora_actualizacion: actualizacion.hora,
      fecha_finalizacion: finalizacion.fecha,
      hora_finalizacion: finalizacion.hora,
      n_actualizaciones: registro.n_actualizaciones === undefined ? '' : registro.n_actualizaciones,
      enviada_base_central: registro.sincronizada ? 1 : 0,
      fecha_envio_base_central: registro.fecha_sincronizacion || '',
      app_version: registro.app_version || ''
    };
  }

  // --- Generadores de cada archivo ------------------------------------------

  /** viviendas.csv — una fila por formulario de vivienda. */
  function csvViviendas(registros, separador) {
    var campos = camposConDato(window.FORM_VIVIENDA.secciones);
    var columnas = COLUMNAS_META.slice();
    campos.forEach(function (c) { columnas = columnas.concat(columnasDeCampo(c)); });

    var filas = registros
      .filter(function (r) { return r.tipo_formulario === 'vivienda'; })
      .map(function (r) {
        var fila = filaMeta(r);
        campos.forEach(function (c) { valoresDeCampo(c, r.respuestas, fila); });
        return fila;
      });

    return { columnas: columnas, filas: filas, csv: construirCsv(columnas, filas, separador) };
  }

  /** afectaciones.csv — una fila por registro de afectaciones. */
  function csvAfectaciones(registros, separador) {
    var campos = camposConDato(window.FORM_AFECTACIONES.secciones);
    var columnas = COLUMNAS_META.slice();
    campos.forEach(function (c) { columnas = columnas.concat(columnasDeCampo(c)); });

    var filas = registros
      .filter(function (r) { return r.tipo_formulario === 'afectaciones'; })
      .map(function (r) {
        var fila = filaMeta(r);
        campos.forEach(function (c) { valoresDeCampo(c, r.respuestas, fila); });
        return fila;
      });

    return { columnas: columnas, filas: filas, csv: construirCsv(columnas, filas, separador) };
  }

  /** Secciones del formulario de personas separadas por nivel. */
  function seccionesPersonas() {
    var repetible = [];
    var hogar = [];
    (window.FORM_PERSONAS.secciones || []).forEach(function (sec) {
      if (sec.tipo === 'repetible') {
        repetible.push(sec);
        /* Los campos de encabezado de una sección repetible se capturan una
           sola vez por formulario (viven en respuestas), así que sus columnas
           van en la tabla de hogares, no en la de personas. */
        if (sec.camposEncabezado && sec.camposEncabezado.length) {
          hogar.push({ campos: sec.camposEncabezado });
        }
      } else {
        hogar.push(sec);
      }
    });
    return { repetible: repetible, hogar: hogar };
  }

  /** personas_hogares.csv — una fila por formulario de personas/familia. */
  function csvHogares(registros, separador) {
    var secs = seccionesPersonas();
    var campos = camposConDato(secs.hogar);
    var columnas = COLUMNAS_META.concat(['n_personas']);
    campos.forEach(function (c) { columnas = columnas.concat(columnasDeCampo(c)); });

    var filas = registros
      .filter(function (r) { return r.tipo_formulario === 'personas'; })
      .map(function (r) {
        var fila = filaMeta(r);
        fila.n_personas = (r.personas || []).length;
        campos.forEach(function (c) { valoresDeCampo(c, r.respuestas, fila); });
        return fila;
      });

    return { columnas: columnas, filas: filas, csv: construirCsv(columnas, filas, separador) };
  }

  /** personas.csv — una fila por persona (formato largo). */
  function csvPersonas(registros, separador) {
    var secs = seccionesPersonas();
    var campos = camposConDato(secs.repetible);
    var columnas = COLUMNAS_META.concat(['persona_num', 'id_persona']);
    campos.forEach(function (c) { columnas = columnas.concat(columnasDeCampo(c)); });

    var filas = [];
    registros
      .filter(function (r) { return r.tipo_formulario === 'personas'; })
      .forEach(function (r) {
        (r.personas || []).forEach(function (persona, i) {
          var fila = filaMeta(r);
          fila.persona_num = i + 1;
          fila.id_persona = r.id_encuesta + '-P' + String(i + 1).padStart(2, '0');
          campos.forEach(function (c) { valoresDeCampo(c, persona, fila); });
          filas.push(fila);
        });
      });

    return { columnas: columnas, filas: filas, csv: construirCsv(columnas, filas, separador) };
  }

  /** indice_encuestas.csv — control de la operación, una fila por encuesta. */
  function csvIndice(registros, separador) {
    var columnas = COLUMNAS_META.concat(['n_personas', 'tiene_formulario_pareja']);

    // Qué tipos de formulario existen por hogar, para marcar los emparejados.
    var porHogar = {};
    registros.forEach(function (r) {
      if (!r.id_hogar) return;
      if (!porHogar[r.id_hogar]) porHogar[r.id_hogar] = {};
      porHogar[r.id_hogar][r.tipo_formulario] = true;
    });

    var filas = registros.map(function (r) {
      var fila = filaMeta(r);
      fila.n_personas = r.tipo_formulario === 'personas' ? (r.personas || []).length : '';
      var h = porHogar[r.id_hogar] || {};
      fila.tiene_formulario_pareja = (h.vivienda && h.personas) ? 1 : 0;
      return fila;
    });

    return { columnas: columnas, filas: filas, csv: construirCsv(columnas, filas, separador) };
  }

  /**
   * diccionario_variables.csv — el libro de códigos.
   *
   * Una fila por opción de respuesta, y una fila por pregunta cuando la
   * respuesta es abierta. Es el archivo que permite leer los demás sin tener
   * la aplicación a la vista: dice qué significa cada columna, a qué pregunta
   * corresponde, qué número tiene cada respuesta y en qué sección vive.
   */
  function csvDiccionario(registros, separador) {
    var columnas = ['formulario', 'codigo_pregunta', 'variable', 'seccion_numero',
      'seccion_titulo', 'pregunta', 'tipo_campo', 'obligatoria', 'nivel_dato',
      'numero_respuesta', 'valor_respuesta', 'etiqueta_respuesta'];
    var filas = [];

    function agregar(idForm, nombreForm, secciones) {
      (secciones || []).forEach(function (sec) {
        var nivel = sec.tipo === 'repetible' ? 'persona' : 'encuesta';
        /* Los campos de encabezado de una sección repetible se capturan una
           sola vez por encuesta, así que entran al diccionario con nivel
           'encuesta' aunque la sección sea de personas. */
        var todos = (sec.camposEncabezado || []).map(function (c) {
          return { campo: c, nivel: 'encuesta' };
        }).concat((sec.campos || []).map(function (c) {
          return { campo: c, nivel: nivel };
        }));
        todos.forEach(function (par) {
          var campo = par.campo;
          var nivelCampo = par.nivel;
          if (TIPOS_SIN_DATO.indexOf(campo.tipo) !== -1 || !campo.id) return;

          // El campo de dirección aporta sus componentes, cada uno con código.
          if (campo.tipo === 'direccion') {
            window.CampoDireccion.SUBCAMPOS.forEach(function (sub) {
              filas.push({
                formulario: nombreForm,
                codigo_pregunta: window.CODIGOS.de(idForm, sub.id),
                variable: sub.id,
                seccion_numero: sec.numero,
                seccion_titulo: sec.titulo,
                pregunta: sub.etiqueta,
                tipo_campo: sub.derivado ? 'derivado' : 'texto',
                obligatoria: 'no',
                nivel_dato: nivelCampo,
                numero_respuesta: '', valor_respuesta: '', etiqueta_respuesta: ''
              });
            });
            return;
          }

          var base = {
            formulario: nombreForm,
            codigo_pregunta: window.CODIGOS.de(idForm, campo.id),
            variable: campo.id,
            seccion_numero: sec.numero,
            seccion_titulo: sec.titulo,
            pregunta: campo.etiqueta,
            tipo_campo: campo.tipo,
            obligatoria: campo.requerido ? 'sí' : 'no',
            nivel_dato: nivelCampo
          };

          if (campo.opciones && campo.opciones.length) {
            campo.opciones.forEach(function (op, i) {
              filas.push(Object.assign({}, base, {
                numero_respuesta: i + 1,
                valor_respuesta: op.valor,
                etiqueta_respuesta: op.etiqueta
              }));
            });
          } else {
            filas.push(Object.assign({}, base, {
              numero_respuesta: '', valor_respuesta: '', etiqueta_respuesta: ''
            }));
          }
        });
      });
    }

    agregar('vivienda', window.FORM_VIVIENDA.nombre, window.FORM_VIVIENDA.secciones);
    agregar('personas', window.FORM_PERSONAS.nombre, window.FORM_PERSONAS.secciones);
    if (window.FORM_AFECTACIONES) {
      agregar('afectaciones', window.FORM_AFECTACIONES.nombre, window.FORM_AFECTACIONES.secciones);
    }

    return { columnas: columnas, filas: filas, csv: construirCsv(columnas, filas, separador) };
  }

  // --- API ------------------------------------------------------------------

  var GENERADORES = {
    viviendas: { fn: csvViviendas, archivo: 'viviendas' },
    afectaciones: { fn: csvAfectaciones, archivo: 'afectaciones' },
    personas_hogares: { fn: csvHogares, archivo: 'personas_hogares' },
    personas: { fn: csvPersonas, archivo: 'personas' },
    indice: { fn: csvIndice, archivo: 'indice_encuestas' },
    diccionario: { fn: csvDiccionario, archivo: 'diccionario_variables' }
  };

  /**
   * Genera y descarga uno de los archivos.
   * clave: 'viviendas' | 'personas_hogares' | 'personas' | 'indice'
   */
  function descargarCsv(clave, registros, opciones) {
    opciones = opciones || {};
    var gen = GENERADORES[clave];
    if (!gen) return { ok: false, mensaje: 'Archivo desconocido.' };

    var resultado = gen.fn(registros, opciones.separador || ',');
    if (!resultado.filas.length) {
      return { ok: false, mensaje: 'No hay registros para ese archivo con los filtros aplicados.' };
    }

    // El diccionario describe el instrumento completo, así que no lleva el
    // sufijo de los filtros: no depende de los registros seleccionados.
    var sufijo = (opciones.sufijo && clave !== 'diccionario') ? '_' + opciones.sufijo : '';
    var nombre = gen.archivo + sufijo + '_' + selloTiempo() + '.csv';
    descargar(nombre, resultado.csv);
    return { ok: true, mensaje: 'Se descargó ' + nombre + ' (' + resultado.filas.length + ' filas).', archivo: nombre };
  }

  /**
   * Prepara una encuesta para enviarla a la base central (Google Sheets).
   *
   * Reutiliza los mismos generadores del CSV, así que las columnas de la hoja
   * son exactamente las del archivo descargado. Si mañana se agrega una
   * pregunta, la columna aparece sola en los dos lados sin tocar nada más.
   *
   * Devuelve: [ { nombre, encabezados, filas } ]
   */
  function filasParaSincronizar(registro) {
    var tablas = [];
    var solo = [registro];

    if (registro.tipo_formulario === 'vivienda') {
      var v = csvViviendas(solo, ',');
      if (v.filas.length) tablas.push({ nombre: 'viviendas', encabezados: v.columnas, filas: v.filas });
    } else if (registro.tipo_formulario === 'afectaciones') {
      var a = csvAfectaciones(solo, ',');
      if (a.filas.length) tablas.push({ nombre: 'afectaciones', encabezados: a.columnas, filas: a.filas });
    } else {
      var h = csvHogares(solo, ',');
      if (h.filas.length) tablas.push({ nombre: 'personas_hogares', encabezados: h.columnas, filas: h.filas });
      var p = csvPersonas(solo, ',');
      if (p.filas.length) tablas.push({ nombre: 'personas', encabezados: p.columnas, filas: p.filas });
    }

    // El índice se calcula sobre TODAS las encuestas del equipo, porque la
    // columna tiene_formulario_pareja depende de si el hogar tiene el otro
    // formulario. Luego se envía únicamente la fila de esta encuesta.
    var todas = window.Almacen ? window.Almacen.listar() : solo;
    var i = csvIndice(todas, ',');
    var propia = i.filas.filter(function (f) { return f.id_encuesta === registro.id_encuesta; });
    if (propia.length) tablas.push({ nombre: 'indice', encabezados: i.columnas, filas: propia });

    return tablas;
  }

  /** Cuenta cuántas filas produciría cada archivo, sin descargar nada. */
  function conteos(registros) {
    return {
      viviendas: csvViviendas(registros, ',').filas.length,
      afectaciones: csvAfectaciones(registros, ',').filas.length,
      personas_hogares: csvHogares(registros, ',').filas.length,
      personas: csvPersonas(registros, ',').filas.length,
      indice: csvIndice(registros, ',').filas.length,
      diccionario: csvDiccionario(registros, ',').filas.length
    };
  }

  window.Exportador = {
    descargarCsv: descargarCsv,
    descargarTexto: descargarTexto,
    conteos: conteos,
    selloTiempo: selloTiempo,
    filasParaSincronizar: filasParaSincronizar
  };
})();
