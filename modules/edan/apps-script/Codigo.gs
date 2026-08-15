/* ============================================================================
   Codigo.gs — Receptor de encuestas del Registro de Afectaciones.

   Este archivo NO se ejecuta en la aplicación web: se pega en el editor de
   Google Apps Script de la cuenta de CIENFI. Queda aquí, en el repositorio,
   solo como documentación y control de versiones. NO contiene ningún dato
   sensible: el identificador de la hoja y el token viven en las Propiedades
   del script, dentro de la cuenta de Google.

   QUÉ HACE
   --------
   1. Recibe una encuesta finalizada desde la aplicación y la escribe en la
      hoja de cálculo, una fila por registro, con las mismas columnas del CSV.
   2. ENTREGA las tablas completas a quien tenga el token de extracción. Es
      por ahí por donde el pipeline de consolidación (consolidacion/, en R)
      se lleva los datos cada 10 minutos, sin que nadie descargue ni suba
      archivos a mano. Ver la sección EXTRACCIÓN, más abajo.
   3. GUARDA Y SIRVE el resultado consolidado que devuelve ese pipeline, que
      es lo que consulta el ciudadano por su cédula y lo que ve el equipo
      cuando entra con su contraseña. Ver la sección RESULTADO CONSOLIDADO.

   POR QUÉ ESTO ES EL CENTRO DEL SISTEMA
   -------------------------------------
   Los datos personales no viven en el repositorio: viven aquí. El sitio
   publicado en GitHub Pages solo lleva HTML, CSS y JavaScript, y le pide a
   esta dirección lo que necesita mostrar. Por eso actualizar la consulta no
   requiere ningún commit —antes sí, y por eso la consulta se quedaba vieja
   cada vez que a alguien se le olvidaba subir el archivo—.

   CÓMO EVITA PERDER O DEFORMAR DATOS
   ----------------------------------
   · Todas las celdas se escriben con formato de TEXTO PLANO. Sin esto, Google
     Sheets convierte «0012345» en 12345, «38-104» en una fecha y los números
     largos en notación científica. Es el problema más común al volcar datos
     de encuestas a una hoja, y aquí queda desactivado de raíz.
   · Las escrituras se serializan con LockService: dos diligenciadores
     enviando al mismo tiempo no se pisan.
   · La escritura es idempotente. Si una encuesta se envía dos veces —porque
     la primera falló a medias o el diligenciador reintentó— se reemplazan sus
     filas en lugar de duplicarlas. La llave es id_encuesta.
   · Si la aplicación agrega preguntas nuevas, las columnas correspondientes
     se crean solas al final. Nunca se reordenan ni se borran las existentes.
   · Cada envío queda registrado en la pestaña _bitacora.

   PROPIEDADES DEL SCRIPT QUE HAY QUE CREAR
   ----------------------------------------
   Configuración del proyecto → Propiedades del script:

     SHEET_ID   Identificador de la hoja de cálculo (obligatorio).
     TOKEN      Cadena larga inventada por el equipo (obligatorio).
     TOKEN_EXPORTACION   Otra cadena larga, DISTINTA de la anterior. Habilita
                la extracción de las tablas y la publicación del resultado
                consolidado. Sin ella, esa parte simplemente no funciona. Vive
                solo en la máquina donde corre el pipeline; no va en
                config-sync.js ni en ningún archivo del sitio.
     TOKEN_LECTURA   La contraseña del equipo a cargo de la base. Es lo que
                teclea el funcionario en «Acceso administrativo» y lo único
                que abre las tablas completas en el aplicativo de consulta.
                Cámbiela aquí y cambia para todos, sin tocar el sitio.
     EXIGIR_APELLIDO   Opcional. En "1", la consulta ciudadana pide además el
                primer apellido y no responde si no coincide. Sirve para que
                nadie saque registros probando cédulas al azar. Apagada por
                omisión.
     CARPETA_RESPALDOS_ID   Opcional. Si no se define, el script busca solo
                una carpeta llamada "respaldos" junto a la carpeta que
                contiene la hoja.
     CARPETA_FOTOS_ID   Opcional. Carpeta de Drive donde se guardan los
                soportes fotográficos del registro de afectaciones, con el
                nombre  <id_encuesta>_<n>.jpg . Si no se define, el script
                crea una carpeta "fotos_encuestas" junto a la hoja la
                primera vez que llega una foto.

   AL CAMBIAR ESTE ARCHIVO HAY QUE VOLVER A IMPLEMENTAR
   ----------------------------------------------------
   Pegar el código no basta: la dirección /exec sigue sirviendo la versión
   anterior hasta que se publica una nueva. Implementar → Gestionar
   implementaciones → editar (lápiz) → Versión: Nueva → Implementar. La
   dirección NO cambia. Para confirmar cuál está publicada, la respuesta del
   "ping" trae el número de versión de este archivo.
   ========================================================================== */

var ZONA_HORARIA = 'America/Bogota';
var HOJA_BITACORA = '_bitacora';

/* Pestaña donde se guarda la copia ÍNTEGRA (JSON) de cada encuesta recibida.
   Es lo que permite que las encuestas de un usuario lo sigan cuando cambia
   de equipo: la aplicación las descarga de aquí al iniciar sesión.
   Una celda de Sheets admite 50.000 caracteres, así que el JSON se parte en
   trozos y cada trozo va en una fila (columnas parte / total_partes). */
var HOJA_RESPALDOS = '_respaldos';
var TAM_TROZO = 40000;
var COLUMNAS_RESPALDO = ['id_encuesta', 'usuario', 'tipo_formulario', 'fecha_actualizacion', 'parte', 'total_partes', 'contenido'];

// Tablas que la aplicación puede enviar, y las únicas que se pueden extraer.
// Cualquier otra se rechaza. Deja por fuera _bitacora y _respaldos: la primera
// es operativa y la segunda guarda el JSON íntegro, que pesa muchísimo y no le
// sirve a nadie fuera de la aplicación.
var TABLAS_PERMITIDAS = ['viviendas', 'afectaciones', 'personas_hogares', 'personas', 'indice', 'diccionario'];

/* Pestañas del RESULTADO CONSOLIDADO. Las escribe el pipeline al final de cada
   corrida y son las que alimentan el aplicativo de consulta.

   POR QUÉ EXISTEN, SI YA ESTÁN LAS TABLAS CRUDAS
   Las de arriba son lo que llega del campo, tal cual, con duplicados y sin
   enlazar. Estas son el resultado de la consolidación en R: duplicados
   marcados, hogares emparejados con su edificación y las respuestas completas
   de cada formulario. La consulta necesita esto, no lo crudo.

   POR QUÉ NO VIAJAN EN EL REPOSITORIO
   Antes el pipeline escribía un archivo js/datos.js dentro del repositorio y
   había que hacer commit para que el sitio publicado se enterara. Eso ponía
   cédulas, direcciones y estado de salud en un repositorio público y, peor,
   dejaba la actualización a que alguien se acordara de subirla. Ahora el dato
   se queda aquí y el sitio lo pide por fetch: el repositorio no lleva ni un
   registro personal. */
var TABLAS_CONSOLIDADAS = ['c_personas', 'c_hogares', 'c_edificaciones', 'c_afectaciones',
                           'c_fichas', 'c_diccionario', 'c_revisar', 'c_duplicados'];

// Marca de tiempo de la última publicación del pipeline. Es lo que el
// aplicativo muestra como «actualizado el …».
var HOJA_CONSOLIDADO_META = 'c_meta';

// Cuántas filas devuelve la extracción de una vez. La hoja de viviendas tiene
// 221 columnas, así que pedir "todo" en una sola respuesta se vuelve pesado
// rápido; quien extrae pide una página tras otra hasta que hay_mas sea falso.
var FILAS_POR_PAGINA = 500;
var FILAS_POR_PAGINA_MAX = 2000;

// Columna que identifica la encuesta y permite reemplazarla sin duplicar.
var LLAVE = 'id_encuesta';


// ============================================================================
//  CONFIGURACIÓN
// ============================================================================

function propiedad_(nombre, obligatoria) {
  var valor = PropertiesService.getScriptProperties().getProperty(nombre);
  if (obligatoria && !valor) {
    throw new Error('Falta la propiedad del script "' + nombre + '". ' +
      'Créela en Configuración del proyecto → Propiedades del script.');
  }
  return valor || '';
}

function libro_() {
  return SpreadsheetApp.openById(propiedad_('SHEET_ID', true));
}

function verificarToken_(token) {
  var esperado = propiedad_('TOKEN', true);
  if (String(token || '') !== String(esperado)) {
    throw new Error('no_autorizado');
  }
}

/**
 * Candado adicional SOLO para las consultas que devuelven datos (avance y
 * mis_encuestas). El token general viaja en el código del sitio publicado,
 * así que por sí solo no protege una LECTURA de datos personales.
 *
 * Si se crea la propiedad del script TOKEN_LECTURA, las consultas exigen
 * ese valor además del token general; los equipos lo reciben en su
 * configuración local (js/config-sync.js) y NO debe publicarse en GitLab.
 * Sin la propiedad, las consultas funcionan solo con el token general
 * (comportamiento inicial, útil mientras el sitio no sea público).
 */
function verificarTokenLectura_(payload) {
  var esperado = propiedad_('TOKEN_LECTURA', false);
  if (!esperado) return;
  if (String(payload.token_lectura || '') !== String(esperado)) {
    throw new Error('no_autorizado');
  }
}

/**
 * Candado de la EXTRACCIÓN. Es el más estricto de los tres, a propósito: esta
 * puerta devuelve las tablas COMPLETAS —nombres, cédulas, teléfonos,
 * direcciones y coordenadas de todas las familias—, no un resumen de control
 * ni las encuestas de una sola persona.
 *
 * Falla cerrado, al revés de TOKEN_LECTURA: si la propiedad TOKEN_EXPORTACION
 * no existe, la extracción no está habilitada y punto. Nunca queda abierta
 * "por defecto" ni protegida por el token general, que viaja al navegador de
 * cualquiera que abra la aplicación y por eso no protege una lectura.
 *
 * Este token vive ÚNICAMENTE en la máquina donde corre el pipeline
 * (consolidacion/.secrets/, fuera de git). No va en config-sync.js.
 */
/**
 * Candado de la CONSULTA COMPLETA (las tablas consolidadas del aplicativo).
 *
 * Es igual a verificarTokenLectura_ salvo en una cosa, que es justamente la
 * importante: FALLA CERRADO. Si la propiedad TOKEN_LECTURA no existe, esta
 * puerta no se abre.
 *
 * POR QUÉ NO SIRVE AQUÍ EL COMPORTAMIENTO DE verificarTokenLectura_
 * Aquella deja pasar cuando la propiedad no está, y eso era razonable mientras
 * el sitio no era público y lo que devolvía era un resumen de avance. Esta
 * devuelve la base entera —cédulas, direcciones, estado de salud—, y el token
 * general no la protege: viaja en config-consulta.js, que cualquiera lee con
 * «ver código fuente».
 *
 * Se comprobó en la práctica: con la propiedad sin crear, una contraseña
 * inventada abría las cuatro bases completas.
 */
function verificarTokenConsulta_(payload) {
  var esperado = propiedad_('TOKEN_LECTURA', false);
  if (!esperado) throw new Error('consulta_no_habilitada');
  if (String(payload.token_lectura || '') !== String(esperado)) {
    throw new Error('no_autorizado');
  }
}

function verificarTokenExportacion_(payload) {
  var esperado = propiedad_('TOKEN_EXPORTACION', false);
  if (!esperado) throw new Error('exportacion_no_habilitada');
  if (String(payload.token_exportacion || '') !== String(esperado)) {
    throw new Error('no_autorizado');
  }
}


// ============================================================================
//  PUNTOS DE ENTRADA
// ============================================================================

/**
 * Comprobación de estado. NO devuelve datos de las encuestas a propósito:
 * la dirección del servicio es pública, así que solo se puede escribir.
 */
function doGet() {
  return salida_({
    ok: true,
    servicio: 'Registro de información — receptor',
    version: '1.6.1',
    hora_servidor: ahora_()
  });
}

function doPost(e) {
  try {
    var cuerpo = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    var payload = JSON.parse(cuerpo);

    verificarToken_(payload.token);

    /* --- Consultas (solo lectura): corren SIN el candado global, para que
       una mañana de inicios de sesión no deje esperando a los envíos de
       encuestas, que son lo importante. Leer sin candado puede, en el peor
       caso, ver un respaldo a medio escribir: el cliente lo descarta y lo
       vuelve a pedir en el siguiente inicio de sesión. --- */
    if (payload.accion === 'ping') {
      // La versión permite verificar que la implementación publicada trae
      // las consultas de avance y de recuperación de encuestas.
      return salida_({ ok: true, mensaje: 'conexión correcta', version: '1.6.1', hora_servidor: ahora_() });
    }
    if (payload.accion === 'avance') {
      verificarTokenLectura_(payload);
      // Resumen de TODAS las encuestas recibidas (pestaña indice), para que
      // el panel del coordinador vea la operación completa, no solo su equipo.
      return salida_({ ok: true, encuestas: leerAvance_(libro_()), hora_servidor: ahora_() });
    }
    if (payload.accion === 'mis_encuestas') {
      verificarTokenLectura_(payload);
      // Copias íntegras de las encuestas de UN usuario, para restaurarlas
      // cuando cambia de equipo.
      return salida_({ ok: true, encuestas: leerRespaldosDe_(libro_(), String(payload.usuario || '')), hora_servidor: ahora_() });
    }
    if (payload.accion === 'inventario') {
      verificarTokenExportacion_(payload);
      // Qué tablas hay y de qué tamaño. Sin datos: sirve para que quien
      // extrae sepa cuántas páginas va a pedir, y para revisar de un vistazo
      // que la hoja tiene lo que debería.
      return salida_({ ok: true, tablas: inventario_(libro_()), hora_servidor: ahora_() });
    }
    if (payload.accion === 'exportar_tabla') {
      verificarTokenExportacion_(payload);
      return salida_(exportarTabla_(libro_(), payload));
    }

    /* --- Resultado consolidado: lo que alimenta el aplicativo de consulta --- */
    if (payload.accion === 'consultar_cedula') {
      // A propósito SIN token de lectura: el ciudadano no tiene credenciales.
      // Lo que protege esta puerta es lo poco que devuelve —un registro, el de
      // la cédula exacta que preguntó—, no un candado. Ver la nota sobre
      // enumeración en la cabecera de consultarCedula_.
      return salida_(consultarCedula_(libro_(), payload));
    }
    if (payload.accion === 'consulta_completa') {
      verificarTokenConsulta_(payload);   // falla cerrado, NO verificarTokenLectura_
      return salida_(consultaCompleta_(libro_(), payload));
    }
    if (payload.accion === 'publicar_consolidado') {
      verificarTokenExportacion_(payload);
      // Se serializa como las escrituras de encuestas: dos corridas del
      // pipeline solapadas dejarían la pestaña a medio reemplazar.
      var lockPub = LockService.getScriptLock();
      try {
        lockPub.waitLock(45000);
      } catch (err) {
        return salida_({ ok: false, error: 'ocupado', reintentar: true });
      }
      try {
        return salida_(publicarConsolidado_(libro_(), payload));
      } finally {
        lockPub.releaseLock();
      }
    }
    if (payload.accion === 'marcar_consolidado') {
      verificarTokenExportacion_(payload);
      return salida_({ ok: true,
                       actualizado: marcaConsolidado_(libro_(), String(payload.actualizado || ahora_())),
                       hora_servidor: ahora_() });
    }

    if (payload.accion === 'guardar_encuesta') {
      // Las escrituras sí se serializan. Si otro envío está escribiendo, se
      // espera; si en 45 s no se libera, se responde "ocupado" y la
      // aplicación reintentará: nunca se pierde el dato.
      var lock = LockService.getScriptLock();
      try {
        lock.waitLock(45000);
      } catch (err) {
        return salida_({ ok: false, error: 'ocupado', reintentar: true });
      }
      try {
        return salida_(guardarEncuesta_(payload));
      } finally {
        lock.releaseLock();
      }
    }

    return salida_({ ok: false, error: 'accion_no_reconocida', accion: payload.accion || '' });

  } catch (error) {
    // Ni un token equivocado ni una propiedad sin crear se arreglan
    // reintentando; un fallo pasajero sí.
    var esConfiguracion = String(error.message).indexOf('no_autorizado') !== -1 ||
                          String(error.message).indexOf('exportacion_no_habilitada') !== -1 ||
                          String(error.message).indexOf('consulta_no_habilitada') !== -1;
    return salida_({
      ok: false,
      error: error.message,
      reintentar: !esConfiguracion
    });
  }
}


// ============================================================================
//  ESCRITURA DE UNA ENCUESTA
// ============================================================================

/**
 * payload = {
 *   accion: 'guardar_encuesta',
 *   token: '...',
 *   id_encuesta: 'VIV-20260812-ABC123',
 *   equipo: 'nombre del navegador o equipo',
 *   tablas: [ { nombre: 'viviendas', encabezados: [...], filas: [ {...} ] } ]
 * }
 */
function guardarEncuesta_(payload) {
  var idEncuesta = String(payload.id_encuesta || '').trim();
  if (!idEncuesta) throw new Error('falta_id_encuesta');
  if (!payload.tablas || !payload.tablas.length) throw new Error('sin_tablas');

  var ss = libro_();
  var escritas = 0;
  var detalle = [];

  payload.tablas.forEach(function (tabla) {
    var nombre = String(tabla.nombre || '');
    if (TABLAS_PERMITIDAS.indexOf(nombre) === -1) {
      throw new Error('tabla_no_permitida: ' + nombre);
    }
    if (!tabla.encabezados || !tabla.encabezados.length) return;

    var hoja = obtenerHoja_(ss, nombre);
    var encabezados = asegurarEncabezados_(hoja, tabla.encabezados);

    // Idempotencia: se quitan las filas previas de esta encuesta antes de
    // volver a escribirlas. Así un reenvío corrige en vez de duplicar.
    var borradas = borrarFilasDeEncuesta_(hoja, encabezados, idEncuesta);

    var n = anexarFilas_(hoja, encabezados, tabla.filas || []);
    escritas += n;
    detalle.push({ tabla: nombre, filas: n, reemplazadas: borradas });
  });

  /* Soportes fotográficos (si la encuesta trae). Van a Drive con el id de la
     encuesta en el nombre; los enlaces se escriben en la fila de la tabla y
     se devuelven a la aplicación. Un fallo aquí NO tumba el envío de los
     datos: la encuesta ya quedó escrita, y la aplicación reintentará las
     fotos en el siguiente envío. */
  var fotos = [];
  var fotosOk = true;
  if (Array.isArray(payload.fotos) && payload.fotos.length) {
    try {
      var resultado = guardarFotos_(ss, idEncuesta, payload);
      fotos = resultado.guardadas;
      fotosOk = resultado.completo;
      if (!fotosOk) registrarBitacora_(ss, payload, 'fotos_incompletas: ' + resultado.errores.join('; '), escritas);
    } catch (errFotos) {
      fotosOk = false;
      registrarBitacora_(ss, payload, 'fotos_error: ' + errFotos.message, escritas);
    }
  }

  /* Copia íntegra de la encuesta (si la aplicación la manda; las versiones
     viejas no la traen y no pasa nada). Se guarda DESPUÉS de las tablas:
     si algo falla antes, el reintento de la aplicación reescribe todo. */
  if (payload.respaldo && typeof payload.respaldo === 'string') {
    /* La copia íntegra debe llevar los enlaces de Drive recién asignados: sin
       esto, la encuesta recuperada en otro equipo llegaría con fotos sin
       enlace ni bytes, y no podría mostrarlas ni descargarlas. */
    if (fotos.length) {
      try {
        var copia = JSON.parse(payload.respaldo);
        fotos.forEach(function (g) {
          var lista = copia && copia.respuestas && copia.respuestas[g.campo];
          if (Array.isArray(lista) && lista[g.indice]) {
            lista[g.indice].url = g.url;
            lista[g.indice].drive_id = g.drive_id;
            lista[g.indice].compartida = g.compartida;
          }
        });
        payload.respaldo = JSON.stringify(copia);
      } catch (e) { /* respaldo ilegible: se guarda como llegó */ }
    }
    guardarRespaldo_(ss, idEncuesta, payload);
  }

  registrarBitacora_(ss, payload, 'ok', escritas);

  return {
    ok: true,
    id_encuesta: idEncuesta,
    filas_escritas: escritas,
    detalle: detalle,
    fotos: fotos,
    fotos_ok: fotosOk,
    hora_servidor: ahora_()
  };
}


// ============================================================================
//  SOPORTES FOTOGRÁFICOS
// ============================================================================

/** Carpeta de Drive para las fotos. La crea junto a la hoja si no existe. */
function carpetaFotos_() {
  var id = propiedad_('CARPETA_FOTOS_ID', false);
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* sigue */ }
  }
  var archivo = DriveApp.getFileById(propiedad_('SHEET_ID', true));
  var padres = archivo.getParents();
  var base = padres.hasNext() ? padres.next() : DriveApp.getRootFolder();
  var existentes = base.getFoldersByName('fotos_encuestas');
  if (existentes.hasNext()) return existentes.next();
  return base.createFolder('fotos_encuestas');
}

/**
 * Guarda las fotos de una encuesta en Drive y escribe sus enlaces en la
 * columna <campo>_enlaces de la tabla correspondiente. Idempotente: si la
 * encuesta ya tenía fotos (reenvío), se borran las anteriores.
 *
 * payload.fotos = [{ campo, indice, nombre, mime, datos (base64) }]
 * Devuelve [{ campo, indice, nombre, url, drive_id }].
 */
function guardarFotos_(ss, idEncuesta, payload) {
  var carpeta = carpetaFotos_();

  /* Qué conservar: las fotos que la aplicación manda con drive_id (ya
     estaban en Drive) siguen; las que trae con bytes se crean; las que
     existían en Drive con este id y NO vienen mencionadas es que el usuario
     las quitó de la encuesta, y se envían a la papelera. La comparación es
     por nombre EXACTO con el prefijo <id>_ : un id nunca es prefijo de otro
     (todos tienen la misma longitud), así que no se toca nada ajeno. */
  var conservar = {};
  payload.fotos.forEach(function (f) { if (f && f.drive_id) conservar[String(f.drive_id)] = true; });

  /* Solo se envia a la papelera lo no mencionado cuando la aplicacion
     garantiza que su lista es la completa (fotos_completas). Si no lo dice
     (version vieja, o encuesta recuperada en otro equipo sin los drive_id)
     no se borra nada: peor es perder evidencia que dejar un archivo de mas. */
  var puedeBorrar = payload.fotos_completas === true;
  var previas = carpeta.searchFiles("title contains '" + idEncuesta + "_' and trashed = false");
  var yaEnDrive = {};
  var noMencionadas = [];
  while (previas.hasNext()) {
    var viejo = previas.next();
    if (viejo.getName().indexOf(idEncuesta + '_') !== 0) continue;
    if (conservar[viejo.getId()]) {
      yaEnDrive[viejo.getId()] = viejo;
    } else if (puedeBorrar) {
      viejo.setTrashed(true);
    } else {
      noMencionadas.push(viejo);
    }
  }

  var guardadas = [];
  var errores = [];
  var porCampo = {};
  var consecutivo = 0;
  var sello = Utilities.formatDate(new Date(), ZONA_HORARIA, 'HHmmss');
  payload.fotos.forEach(function (f) {
    if (!f) return;
    var url, id, compartida = true, nombre;
    try {
      if (f.drive_id && yaEnDrive[f.drive_id]) {
        // Ya estaba: se conserva tal cual.
        id = f.drive_id;
        nombre = yaEnDrive[id].getName();
        url = 'https://drive.google.com/file/d/' + id + '/view';
      } else if (f.datos) {
        consecutivo++;
        var ext = (String(f.mime || '').indexOf('png') !== -1) ? 'png' : 'jpg';
        nombre = idEncuesta + '_' + sello + '_' + consecutivo + '.' + ext;
        var blob = Utilities.newBlob(Utilities.base64Decode(String(f.datos)), f.mime || 'image/jpeg', nombre);
        var archivo = carpeta.createFile(blob);
        // Que cualquiera con el enlace pueda ver la foto (para abrirla desde el
        // aplicativo sin iniciar sesión en la cuenta de CIENFI). Si el dominio
        // lo prohíbe, se informa: el enlace solo servirá a quien tenga acceso
        // a la carpeta.
        try { archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }
        catch (e) { compartida = false; }
        id = archivo.getId();
        url = 'https://drive.google.com/file/d/' + id + '/view';
      } else {
        return;
      }
    } catch (errFoto) {
      // Una foto que falla no impide guardar las demás; queda registrada
      // para que la aplicación la reintente en el próximo envío.
      errores.push((f.nombre || 'foto') + ': ' + errFoto.message);
      return;
    }
    guardadas.push({ campo: f.campo, indice: f.indice, nombre: nombre, url: url, drive_id: id, compartida: compartida });
    if (!porCampo[f.campo]) porCampo[f.campo] = [];
    porCampo[f.campo].push(url);
  });

  /* Las que estaban en Drive y el cliente no pudo mencionar (sin drive_id
     local) se conservan y se devuelven, asi el cliente y la fila recuperan
     sus enlaces en vez de perderlos. Van al final de la lista. */
  if (noMencionadas.length) {
    var campoDestino = (payload.fotos[0] && payload.fotos[0].campo) || 'afe_fotos';
    var siguienteIndice = guardadas.reduce(function (m, g) { return Math.max(m, g.indice + 1); }, 0);
    noMencionadas.forEach(function (arch) {
      var u = 'https://drive.google.com/file/d/' + arch.getId() + '/view';
      guardadas.push({ campo: campoDestino, indice: siguienteIndice++, nombre: arch.getName(), url: u, drive_id: arch.getId(), compartida: true, recuperada: true });
      if (!porCampo[campoDestino]) porCampo[campoDestino] = [];
      porCampo[campoDestino].push(u);
    });
  }

  // Enlaces en la fila de la tabla (columna <campo>_enlaces).
  var tabla = tablaDeFormulario_(payload.tipo_formulario);
  var hoja = ss.getSheetByName(tabla);
  if (hoja && hoja.getLastRow() >= 2) {
    var encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0].map(String);
    var iLlave = encabezados.indexOf(LLAVE);
    if (iLlave !== -1) {
      var ids = hoja.getRange(2, iLlave + 1, hoja.getLastRow() - 1, 1).getValues();
      for (var f = 0; f < ids.length; f++) {
        if (String(ids[f][0]).trim() !== idEncuesta) continue;
        Object.keys(porCampo).forEach(function (campo) {
          var col = encabezados.indexOf(campo + '_enlaces');
          if (col === -1) return;
          var celda = hoja.getRange(f + 2, col + 1);
          celda.setNumberFormat('@');
          celda.setValue(porCampo[campo].join(' | '));
        });
        break;
      }
    }
  }
  return { guardadas: guardadas, completo: errores.length === 0, errores: errores };
}

/** Tabla principal donde vive una encuesta según su formulario. */
function tablaDeFormulario_(tipo) {
  if (tipo === 'vivienda') return 'viviendas';
  if (tipo === 'afectaciones') return 'afectaciones';
  return 'personas_hogares';
}


// ============================================================================
//  RESPALDOS ÍNTEGROS Y CONSULTAS DE AVANCE
// ============================================================================

/** Guarda (o reemplaza) la copia íntegra de una encuesta, en trozos. */
function guardarRespaldo_(ss, idEncuesta, payload) {
  var hoja = obtenerHoja_(ss, HOJA_RESPALDOS);
  var encabezados = asegurarEncabezados_(hoja, COLUMNAS_RESPALDO);
  borrarFilasDeEncuesta_(hoja, encabezados, idEncuesta);

  /* El corte nunca parte un par sustituto UTF-16 (emojis y otros caracteres
     fuera del plano básico, posibles en observaciones escritas en celular):
     una mitad huérfana en cada celda corrompería el JSON al rearmarlo. */
  var texto = String(payload.respaldo);
  var trozos = [];
  var inicio = 0;
  while (inicio < texto.length) {
    var fin = Math.min(inicio + TAM_TROZO, texto.length);
    var codigo = texto.charCodeAt(fin - 1);
    if (fin < texto.length && codigo >= 0xD800 && codigo <= 0xDBFF) fin--;
    trozos.push(texto.substring(inicio, fin));
    inicio = fin;
  }
  if (!trozos.length) trozos.push('');

  var filas = trozos.map(function (trozo, i) {
    return {
      id_encuesta: idEncuesta,
      usuario: String(payload.usuario || ''),
      tipo_formulario: String(payload.tipo_formulario || ''),
      fecha_actualizacion: ahora_(),
      parte: String(i + 1),
      total_partes: String(trozos.length),
      contenido: trozo
    };
  });
  anexarFilas_(hoja, encabezados, filas);
}

/** Resumen de las encuestas recibidas, leído de la pestaña indice. */
function leerAvance_(ss) {
  var hoja = ss.getSheetByName('indice');
  if (!hoja || hoja.getLastRow() < 2) return [];

  var encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0].map(String);
  var datos = hoja.getRange(2, 1, hoja.getLastRow() - 1, hoja.getLastColumn()).getValues();

  /* Columnas de CONTROL únicamente: nada del contenido de las respuestas.
     id_hogar y n_personas permiten que el panel del coordinador calcule los
     mismos indicadores sobre la operación COMPLETA (personas registradas,
     hogares con los dos formularios) sin exponer un solo dato personal. */
  var visibles = ['id_encuesta', 'tipo_formulario', 'id_hogar', 'usuario', 'usuario_nombre',
    'estado', 'fecha_finalizacion', 'hora_finalizacion', 'n_personas', 'app_version'];

  return datos.map(function (fila) {
    var salida = {};
    visibles.forEach(function (col) {
      var i = encabezados.indexOf(col);
      if (i !== -1) salida[col] = String(fila[i]);
    });
    return salida;
  });
}

/**
 * Copias íntegras de las encuestas de un usuario, reconstruidas por trozos.
 * Para no cargar en memoria los contenidos de TODOS los usuarios, primero se
 * leen solo las columnas livianas (id, usuario, parte) y después se traen
 * únicamente las celdas de contenido de las filas que corresponden.
 */
function leerRespaldosDe_(ss, usuario) {
  if (!usuario) return [];
  var hoja = ss.getSheetByName(HOJA_RESPALDOS);
  if (!hoja || hoja.getLastRow() < 2) return [];

  var encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0].map(String);
  var iId = encabezados.indexOf('id_encuesta');
  var iUsuario = encabezados.indexOf('usuario');
  var iParte = encabezados.indexOf('parte');
  var iContenido = encabezados.indexOf('contenido');
  if (iId === -1 || iUsuario === -1 || iParte === -1 || iContenido === -1) return [];

  var n = hoja.getLastRow() - 1;
  var ids = hoja.getRange(2, iId + 1, n, 1).getValues();
  var usuarios = hoja.getRange(2, iUsuario + 1, n, 1).getValues();
  var partes = hoja.getRange(2, iParte + 1, n, 1).getValues();

  var porEncuesta = {};
  for (var f = 0; f < n; f++) {
    if (String(usuarios[f][0]).trim() !== usuario) continue;
    var id = String(ids[f][0]).trim();
    if (!porEncuesta[id]) porEncuesta[id] = [];
    porEncuesta[id].push({ parte: Number(partes[f][0]) || 1, fila: f + 2 });
  }

  return Object.keys(porEncuesta).map(function (id) {
    var trozos = porEncuesta[id].sort(function (a, b) { return a.parte - b.parte; });
    return trozos.map(function (t) {
      return String(hoja.getRange(t.fila, iContenido + 1).getValue());
    }).join('');
  });
}


// ============================================================================
//  EXTRACCIÓN DE LAS TABLAS
//
//  Por aquí el pipeline de consolidación (consolidacion/, en R) se lleva los
//  datos de la hoja cada 10 minutos. Antes de esto el único camino era que
//  alguien descargara los CSV de la aplicación y los subiera a una carpeta de
//  Drive; eso dependía de que una persona se acordara, todos los días.
//
//  POR QUÉ POR PÁGINAS, Y NO TODO DE UNA
//  La hoja de viviendas tiene 221 columnas. Con unos pocos miles de encuestas,
//  devolverlo todo en una sola respuesta se pasa del tamaño que Apps Script
//  entrega y del tiempo que puede correr. Quien extrae pide desde=1, luego
//  desde=501, y así hasta que hay_mas viene en falso.
//
//  POR QUÉ NO TOMA EL CANDADO DE ESCRITURA
//  A propósito. Un LockService que espera hasta 45 segundos, multiplicado por
//  cada página, dejaría a los diligenciadores esperando para enviar sus
//  encuestas —que es lo importante— mientras el pipeline lee. En el peor caso
//  una lectura agarra una encuesta a mitad de reemplazo y esa encuesta llega
//  incompleta; la siguiente corrida, diez minutos después, la trae bien: el
//  pipeline hace upsert por id_encuesta, no acumula.
// ============================================================================

/** Qué tablas existen y cuántas filas tiene cada una. No devuelve contenido. */
function inventario_(ss) {
  return TABLAS_PERMITIDAS.map(function (nombre) {
    var hoja = ss.getSheetByName(nombre);
    if (!hoja) return { tabla: nombre, existe: false, filas: 0, columnas: 0 };
    return {
      tabla: nombre,
      existe: true,
      filas: Math.max(0, hoja.getLastRow() - 1),   // sin contar el encabezado
      columnas: hoja.getLastColumn()
    };
  });
}

/**
 * Una página de una tabla.
 *
 * payload = { accion: 'exportar_tabla', token, token_exportacion,
 *             tabla: 'viviendas', desde: 1, limite: 500 }
 *
 * "desde" cuenta filas de DATOS empezando en 1, no filas de la hoja: quien
 * pide no tiene por qué saber que la primera fila es el encabezado.
 *
 * Las filas van como listas de valores en el orden de los encabezados, no como
 * objetos. Con 221 columnas, repetir el nombre de cada campo en cada fila
 * multiplicaría por varias veces el tamaño de la respuesta sin agregar nada.
 */
function exportarTabla_(ss, payload) {
  var nombre = String(payload.tabla || '');
  if (TABLAS_PERMITIDAS.indexOf(nombre) === -1) {
    throw new Error('tabla_no_permitida: ' + nombre);
  }

  var hoja = ss.getSheetByName(nombre);
  if (!hoja || hoja.getLastRow() < 1) {
    return {
      ok: true, tabla: nombre, encabezados: [], filas: [],
      desde: 1, devueltas: 0, total_filas: 0, hay_mas: false,
      hora_servidor: ahora_()
    };
  }

  var columnas = hoja.getLastColumn();
  var encabezados = hoja.getRange(1, 1, 1, columnas).getValues()[0].map(function (v) {
    return aTexto_(v);
  });
  var total = Math.max(0, hoja.getLastRow() - 1);

  var desde = Math.max(1, Number(payload.desde) || 1);
  var limite = Number(payload.limite) || FILAS_POR_PAGINA;
  limite = Math.min(Math.max(1, limite), FILAS_POR_PAGINA_MAX);

  var filas = [];
  if (desde <= total) {
    var cuantas = Math.min(limite, total - desde + 1);
    filas = hoja.getRange(desde + 1, 1, cuantas, columnas).getValues()
      .map(function (fila) {
        return fila.map(function (celda) { return aTexto_(celda); });
      });
  }

  return {
    ok: true,
    tabla: nombre,
    encabezados: encabezados,
    filas: filas,
    desde: desde,
    devueltas: filas.length,
    total_filas: total,
    hay_mas: (desde + filas.length - 1) < total,
    hora_servidor: ahora_()
  };
}


// ============================================================================
//  RESULTADO CONSOLIDADO: PUBLICACIÓN Y CONSULTA
//
//  Tres puertas, con tres candados distintos:
//
//    publicar_consolidado   la escribe el pipeline al final de cada corrida.
//                           TOKEN_EXPORTACION (el más estricto).
//    consultar_cedula       la usa el ciudadano, sin credenciales. Devuelve UN
//                           registro: el de la cédula que preguntó, su hogar y
//                           su edificación. No lista, no pagina, no busca por
//                           dirección ni por nombre. TOKEN general.
//    consulta_completa      la usa el equipo. Devuelve las tablas enteras.
//                           TOKEN_LECTURA, que es la contraseña que el
//                           funcionario teclea al entrar y que NO está escrita
//                           en ningún archivo del sitio.
//
//  POR QUÉ LA CONSULTA CIUDADANA NO DEVUELVE AFECTACIONES
//  El formulario de afectaciones lo diligencia un organismo de socorro sobre
//  una edificación completa y no registra la cédula de nadie. No hay forma de
//  saber que un reporte «es» de quien pregunta, así que no se devuelve: sería
//  entregarle a cualquiera el estado estructural de un edificio con solo
//  acertar una cédula.
// ============================================================================

/**
 * Lee una pestaña consolidada completa como lista de objetos.
 *
 * Lee de una vez y filtra en memoria en lugar de usar TextFinder por columna.
 * Con el volumen de esta operación —miles de registros, no millones— una
 * lectura de rango es más rápida que varias búsquedas, y sobre todo es una
 * sola llamada al servicio de hojas, que es lo que de verdad cuesta tiempo.
 */
function leerConsolidada_(ss, nombre) {
  var hoja = ss.getSheetByName(nombre);
  if (!hoja || hoja.getLastRow() < 2) return [];

  var valores = hoja.getRange(1, 1, hoja.getLastRow(), hoja.getLastColumn()).getValues();
  var encabezados = valores[0].map(function (v) { return aTexto_(v); });

  return valores.slice(1).map(function (fila) {
    var obj = {};
    for (var i = 0; i < encabezados.length; i++) {
      if (encabezados[i]) obj[encabezados[i]] = aTexto_(fila[i]);
    }
    return obj;
  });
}

/**
 * Reemplaza una pestaña consolidada con lo que manda el pipeline.
 *
 * payload = { accion: 'publicar_consolidado', token, token_exportacion,
 *             tabla: 'c_personas', encabezados: [...], filas: [[...], ...],
 *             reemplazar: true }
 *
 * El pipeline manda la tabla por páginas: la primera con reemplazar=true, que
 * borra lo que hubiera; las siguientes con reemplazar=false, que anexan. Así
 * una tabla grande no se pasa del tiempo máximo de ejecución.
 *
 * Las filas van como listas en el orden de los encabezados, no como objetos,
 * por la misma razón que en la extracción: repetir el nombre del campo en cada
 * fila multiplica el tamaño del envío sin agregar nada.
 */
function publicarConsolidado_(ss, payload) {
  var nombre = String(payload.tabla || '');
  if (TABLAS_CONSOLIDADAS.indexOf(nombre) === -1) {
    throw new Error('tabla_no_permitida: ' + nombre);
  }

  var encabezados = payload.encabezados || [];
  var filas = payload.filas || [];
  var hoja = obtenerHoja_(ss, nombre);

  if (payload.reemplazar) {
    hoja.clear();
    if (encabezados.length) {
      hoja.getRange(1, 1, 1, encabezados.length).setValues([encabezados]);
      formatearHoja_(hoja, encabezados.length);
    }
  }

  if (filas.length && encabezados.length) {
    var matriz = filas.map(function (fila) {
      var salida = [];
      for (var i = 0; i < encabezados.length; i++) salida.push(aTexto_(fila[i]));
      return salida;
    });
    var inicio = Math.max(2, hoja.getLastRow() + 1);
    var rango = hoja.getRange(inicio, 1, matriz.length, encabezados.length);
    rango.setNumberFormat('@');   // texto plano: las cédulas no son números
    rango.setValues(matriz);
  }

  return {
    ok: true,
    tabla: nombre,
    escritas: filas.length,
    total_filas: Math.max(0, hoja.getLastRow() - 1),
    hora_servidor: ahora_()
  };
}

/** Momento de la última publicación del pipeline. */
function marcaConsolidado_(ss, valor) {
  var hoja = obtenerHoja_(ss, HOJA_CONSOLIDADO_META);
  if (valor) {
    hoja.clear();
    hoja.getRange(1, 1, 2, 1).setValues([['actualizado'], [valor]]);
    return valor;
  }
  if (hoja.getLastRow() < 2) return '';
  return aTexto_(hoja.getRange(2, 1).getValue());
}

/**
 * La consulta del ciudadano: una cédula, su hogar y su edificación.
 *
 * payload = { accion: 'consultar_cedula', token, cedula: '1000001',
 *             apellido: 'Rincón' }        <- solo si EXIGIR_APELLIDO está activa
 *
 * Devuelve exactamente la misma forma que consumía el aplicativo cuando leía
 * datos.js, pero recortada a lo de esta persona. Así el código de pantalla
 * quedó igual: lo único que cambió es de dónde salen los datos.
 *
 * SOBRE LA ENUMERACIÓN DE CÉDULAS
 * Esta puerta no tiene candado, porque el ciudadano no tiene credenciales. Con
 * la cédula como único dato, alguien puede ir probando números y sacar
 * registros de uno en uno. No hay forma de evitarlo del todo sin pedirle algo
 * más a quien consulta.
 *
 * Por eso existe la propiedad del script EXIGIR_APELLIDO: puesta en "1", la
 * consulta exige además el primer apellido y solo responde si coincide con el
 * del registro. Eso corta la enumeración casi por completo, a cambio de un
 * campo más en el formulario. Viene APAGADA: la decisión de exigirlo es de la
 * Alcaldía, no del código, y prenderla no requiere tocar el sitio publicado
 * —solo crear la propiedad y volver a implementar—.
 */
function consultarCedula_(ss, payload) {
  var cedula = String(payload.cedula || '').replace(/[^0-9]/g, '').replace(/^0+/, '');
  if (!cedula) throw new Error('cedula_vacia');

  var personas = leerConsolidada_(ss, 'c_personas');
  var propias = personas.filter(function (p) { return p.documento === cedula; });

  if (propias.length && propiedad_('EXIGIR_APELLIDO', false) === '1') {
    var pedido = normalizarParaCotejo_(payload.apellido);
    if (!pedido) throw new Error('apellido_requerido');
    propias = propias.filter(function (p) {
      // el nombre viene como "NOMBRES APELLIDOS": basta con que el apellido
      // que teclearon aparezca entre sus palabras
      return normalizarParaCotejo_(p.nombre).split(' ').indexOf(pedido) !== -1;
    });
  }

  if (!propias.length) {
    return { ok: true, encontrado: false, actualizado: marcaConsolidado_(ss),
             hora_servidor: ahora_() };
  }

  // el hogar completo: las demás personas de la misma encuesta
  var encuestas = {};
  propias.forEach(function (p) { encuestas[p.id_encuesta] = true; });
  var delHogar = personas.filter(function (p) { return encuestas[p.id_encuesta]; });

  var hogares = leerConsolidada_(ss, 'c_hogares')
    .filter(function (f) { return encuestas[f.id_encuesta]; });

  var edificios = {};
  hogares.forEach(function (f) {
    if (f.id_encuesta_vivienda) edificios[f.id_encuesta_vivienda] = true;
  });
  var edificaciones = leerConsolidada_(ss, 'c_edificaciones')
    .filter(function (v) { return edificios[v.id_encuesta]; });

  // fichas: solo las de los registros que se devuelven
  var quiere = {};
  delHogar.forEach(function (p) { quiere[p.id_persona] = true; });
  edificaciones.forEach(function (v) { quiere[v.id_encuesta] = true; });

  var fichas = {};
  leerConsolidada_(ss, 'c_fichas').forEach(function (f) {
    if (!quiere[f.id_registro]) return;
    try {
      fichas[f.id_registro] = JSON.parse(f.contenido);
    } catch (err) {
      // una ficha ilegible no puede tumbar la consulta entera
    }
  });

  return {
    ok: true,
    encontrado: true,
    actualizado: marcaConsolidado_(ss),
    personas: delHogar,
    familias: hogares,
    viviendas: edificaciones,
    fichas: fichas,
    diccionario: leerConsolidada_(ss, 'c_diccionario'),
    hora_servidor: ahora_()
  };
}

/**
 * La consulta del equipo: una tabla consolidada completa, por páginas.
 *
 * payload = { accion: 'consulta_completa', token, token_lectura,
 *             tabla: 'c_personas', desde: 1, limite: 2000 }
 *
 * Va por páginas y en formato comprimido (encabezados aparte, filas como
 * listas) por lo mismo que la extracción: la respuesta de una tabla entera con
 * miles de registros no cabe de una sola vez.
 */
function consultaCompleta_(ss, payload) {
  var nombre = String(payload.tabla || '');
  if (TABLAS_CONSOLIDADAS.indexOf(nombre) === -1) {
    throw new Error('tabla_no_permitida: ' + nombre);
  }

  var hoja = ss.getSheetByName(nombre);
  if (!hoja || hoja.getLastRow() < 1) {
    return { ok: true, tabla: nombre, encabezados: [], filas: [], desde: 1,
             devueltas: 0, total_filas: 0, hay_mas: false,
             actualizado: marcaConsolidado_(ss), hora_servidor: ahora_() };
  }

  var columnas = hoja.getLastColumn();
  var encabezados = hoja.getRange(1, 1, 1, columnas).getValues()[0]
    .map(function (v) { return aTexto_(v); });
  var total = Math.max(0, hoja.getLastRow() - 1);

  var desde = Math.max(1, Number(payload.desde) || 1);
  var limite = Number(payload.limite) || FILAS_POR_PAGINA;
  limite = Math.min(Math.max(1, limite), FILAS_POR_PAGINA_MAX);

  var filas = [];
  if (desde <= total) {
    var cuantas = Math.min(limite, total - desde + 1);
    filas = hoja.getRange(desde + 1, 1, cuantas, columnas).getValues()
      .map(function (fila) {
        return fila.map(function (celda) { return aTexto_(celda); });
      });
  }

  return {
    ok: true,
    tabla: nombre,
    encabezados: encabezados,
    filas: filas,
    desde: desde,
    devueltas: filas.length,
    total_filas: total,
    hay_mas: (desde + filas.length - 1) < total,
    actualizado: marcaConsolidado_(ss),
    hora_servidor: ahora_()
  };
}


// ============================================================================
//  MANEJO DE HOJAS
// ============================================================================

function obtenerHoja_(ss, nombre) {
  var hoja = ss.getSheetByName(nombre);
  if (!hoja) {
    hoja = ss.insertSheet(nombre);
  }
  return hoja;
}

/**
 * Devuelve los encabezados vigentes de la hoja, creando los que falten.
 * Los existentes nunca se mueven ni se renombran: si la aplicación agrega una
 * pregunta, su columna se añade al final y las filas viejas quedan vacías ahí.
 */
function asegurarEncabezados_(hoja, entrantes) {
  var ultimaCol = hoja.getLastColumn();

  if (hoja.getLastRow() === 0 || ultimaCol === 0) {
    hoja.getRange(1, 1, 1, entrantes.length).setValues([entrantes]);
    formatearHoja_(hoja, entrantes.length);
    return entrantes.slice();
  }

  var actuales = hoja.getRange(1, 1, 1, ultimaCol).getValues()[0]
    .map(function (v) { return String(v); });

  var faltantes = entrantes.filter(function (c) { return actuales.indexOf(c) === -1; });
  if (faltantes.length) {
    hoja.getRange(1, actuales.length + 1, 1, faltantes.length).setValues([faltantes]);
    actuales = actuales.concat(faltantes);
    formatearHoja_(hoja, actuales.length);
  }
  return actuales;
}

/**
 * Da estilo al encabezado y lo deja congelado.
 *
 * OJO CON EL RENDIMIENTO: aquí NO se formatea la hoja entera.
 * La versión anterior hacía setNumberFormat sobre filas máximas × columnas;
 * con las 221 columnas del formulario de vivienda eso son más de 200.000
 * celdas en una sola operación, la ejecución se alargaba tanto que Google
 * cerraba la conexión y el envío moría con un error 404 —aunque la fila
 * alcanzara a escribirse—.
 *
 * El formato de texto plano, que es lo que impide que Sheets destruya
 * cédulas con ceros y placas tipo "38-104", se aplica en anexarFilas_ sobre
 * el rango exacto que se está escribiendo. Es donde de verdad hace falta y
 * cuesta una fracción del tiempo.
 */
function formatearHoja_(hoja, columnas) {
  var cabecera = hoja.getRange(1, 1, 1, columnas);
  cabecera.setNumberFormat('@');
  cabecera.setFontWeight('bold');
  cabecera.setBackground('#5454E9');
  cabecera.setFontColor('#FFFFFF');
  cabecera.setWrap(false);
  hoja.setFrozenRows(1);
}

/** Quita las filas que ya existían para esa encuesta. Devuelve cuántas quitó. */
function borrarFilasDeEncuesta_(hoja, encabezados, idEncuesta) {
  var iLlave = encabezados.indexOf(LLAVE);
  if (iLlave === -1) return 0;

  var ultimaFila = hoja.getLastRow();
  if (ultimaFila < 2) return 0;

  var columna = hoja.getRange(2, iLlave + 1, ultimaFila - 1, 1).getValues();
  var objetivo = [];
  for (var i = 0; i < columna.length; i++) {
    if (String(columna[i][0]).trim() === idEncuesta) objetivo.push(i + 2);
  }
  // De abajo hacia arriba: si se borra de arriba, los índices se corren.
  for (var j = objetivo.length - 1; j >= 0; j--) {
    hoja.deleteRow(objetivo[j]);
  }
  return objetivo.length;
}

/** Agrega las filas al final, en el orden de los encabezados de la hoja. */
function anexarFilas_(hoja, encabezados, filas) {
  if (!filas.length) return 0;

  var matriz = filas.map(function (fila) {
    return encabezados.map(function (col) { return aTexto_(fila[col]); });
  });

  var inicio = hoja.getLastRow() + 1;
  var rango = hoja.getRange(inicio, 1, matriz.length, encabezados.length);
  rango.setNumberFormat('@');   // texto plano también en las filas nuevas
  rango.setValues(matriz);
  return matriz.length;
}

/**
 * Todo entra como texto. Los vacíos quedan como celda vacía —no como "NA"—
 * para que en el análisis se distinga «no respondió» de la palabra NA.
 * Las tildes, los saltos de línea y las comillas viajan tal cual.
 */
function aTexto_(valor) {
  if (valor === undefined || valor === null) return '';
  if (valor instanceof Date) return Utilities.formatDate(valor, ZONA_HORARIA, 'yyyy-MM-dd HH:mm:ss');
  return String(valor);
}

/**
 * Texto comparable: mayúsculas, sin tildes y sin signos. Se usa para cotejar
 * el apellido que teclea el ciudadano contra el que quedó en la base, donde
 * «RINCON», «Rincón» y «rincon» tienen que valer lo mismo.
 */
function normalizarParaCotejo_(texto) {
  return String(texto || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/ +/g, ' ').trim();
}


// ============================================================================
//  BITÁCORA
// ============================================================================

var COLUMNAS_BITACORA = ['fecha_servidor', 'id_encuesta', 'tipo_formulario',
  'secretaria', 'usuario', 'equipo', 'app_version', 'resultado', 'filas_escritas'];

function registrarBitacora_(ss, payload, resultado, filas) {
  try {
    var hoja = obtenerHoja_(ss, HOJA_BITACORA);
    var encabezados = asegurarEncabezados_(hoja, COLUMNAS_BITACORA);
    anexarFilas_(hoja, encabezados, [{
      fecha_servidor: ahora_(),
      id_encuesta: payload.id_encuesta || '',
      tipo_formulario: payload.tipo_formulario || '',
      secretaria: payload.secretaria || '',
      usuario: payload.usuario || '',
      equipo: payload.equipo || '',
      app_version: payload.app_version || '',
      resultado: resultado,
      filas_escritas: String(filas)
    }]);
  } catch (err) {
    // La bitácora no debe tumbar un envío válido.
  }
}

function ahora_() {
  return Utilities.formatDate(new Date(), ZONA_HORARIA, 'yyyy-MM-dd HH:mm:ss');
}

function salida_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


// ============================================================================
//  RESPALDO DIARIO
//
//  Deja una copia de cada pestaña en CSV dentro de la carpeta "respaldos".
//  Para activarlo: en el editor, ícono del reloj (Activadores) → Añadir
//  activador → función "respaldoDiario", origen "Basado en el tiempo",
//  temporizador por día, entre 1 a. m. y 2 a. m.
// ============================================================================

function respaldoDiario() {
  var ss = libro_();
  var carpeta = carpetaRespaldos_();
  if (!carpeta) {
    Logger.log('No se encontró la carpeta de respaldos; no se generó copia.');
    return;
  }

  var sello = Utilities.formatDate(new Date(), ZONA_HORARIA, 'yyyyMMdd_HHmm');
  var creados = 0;

  ss.getSheets().forEach(function (hoja) {
    var nombre = hoja.getName();
    if (hoja.getLastRow() < 2) return;   // pestaña vacía, no vale la pena

    var datos = hoja.getRange(1, 1, hoja.getLastRow(), hoja.getLastColumn()).getValues();
    var csv = datos.map(function (fila) {
      return fila.map(function (celda) {
        var texto = aTexto_(celda);
        if (/[",\n\r]/.test(texto)) return '"' + texto.replace(/"/g, '""') + '"';
        return texto;
      }).join(',');
    }).join('\r\n');

    // El BOM hace que Excel respete las tildes al abrir el archivo.
    var blob = Utilities.newBlob('\uFEFF' + csv, 'text/csv', nombre + '_' + sello + '.csv');
    carpeta.createFile(blob);
    creados++;
  });

  Logger.log('Respaldo generado: ' + creados + ' archivo(s).');
}

/**
 * Ubica la carpeta de respaldos. Si no se configuró el ID, la busca por
 * nombre al lado de la carpeta que contiene la hoja de cálculo.
 */
function carpetaRespaldos_() {
  var id = propiedad_('CARPETA_RESPALDOS_ID', false);
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* sigue por nombre */ }
  }
  try {
    var archivo = DriveApp.getFileById(propiedad_('SHEET_ID', true));
    var padres = archivo.getParents();
    if (!padres.hasNext()) return null;
    var abuelos = padres.next().getParents();   // carpeta "data" → carpeta raíz
    if (!abuelos.hasNext()) return null;
    var candidatas = abuelos.next().getFoldersByName('respaldos');
    return candidatas.hasNext() ? candidatas.next() : null;
  } catch (e) {
    return null;
  }
}


// ============================================================================
//  PRUEBAS QUE SE PUEDEN CORRER DESDE EL EDITOR
// ============================================================================

/** Verifica que el ID de la hoja y el token estén bien configurados. */
function probarConfiguracion() {
  var ss = libro_();
  var pestanas = ss.getSheets().map(function (h) { return h.getName(); });
  var tieneToken = !!propiedad_('TOKEN', false);
  var tieneExport = !!propiedad_('TOKEN_EXPORTACION', false);
  Logger.log('Hoja encontrada: ' + ss.getName());
  Logger.log('Pestañas actuales: ' + (pestanas.join(', ') || '(ninguna)'));
  Logger.log('TOKEN configurado: ' + (tieneToken ? 'sí' : 'NO — falta crearlo'));
  Logger.log('TOKEN_EXPORTACION configurado: ' + (tieneExport ? 'sí' : 'no — la extracción está deshabilitada'));
  Logger.log('Carpeta de respaldos: ' + (carpetaRespaldos_() ? 'encontrada' : 'no encontrada'));
}

/**
 * Muestra qué tablas ve la extracción y cuántas filas tiene cada una, y trae
 * la primera fila de viviendas para revisar que los datos salen completos.
 * No manda nada a ninguna parte: solo escribe en el registro del editor.
 */
function probarExportacion() {
  var ss = libro_();
  Logger.log('Inventario: ' + JSON.stringify(inventario_(ss)));

  var pagina = exportarTabla_(ss, { tabla: 'viviendas', desde: 1, limite: 1 });
  Logger.log('viviendas: ' + pagina.total_filas + ' filas, ' +
    pagina.encabezados.length + ' columnas, hay_mas=' + pagina.hay_mas);
  if (pagina.devueltas) {
    Logger.log('Primera fila: ' + JSON.stringify(pagina.filas[0].slice(0, 12)) + ' …');
  }
}

/**
 * Escribe una fila de prueba con los casos que suelen dañarse:
 * cédula con cero inicial, placa tipo 38-104, tildes, ñ y salto de línea.
 * Después de revisarla en la hoja, córrase borrarPrueba() para quitarla.
 */
function probarEscritura() {
  var res = guardarEncuesta_({
    id_encuesta: 'PRUEBA-000',
    tipo_formulario: 'vivienda',
    secretaria: 'vivienda',
    usuario: 'prueba',
    equipo: 'editor Apps Script',
    app_version: 'prueba',
    tablas: [{
      nombre: 'viviendas',
      encabezados: ['id_encuesta', 'viv_prop_cc', 'placa_inmueble', 'viv_prop_nombres_apellidos', 'observacion'],
      filas: [{
        id_encuesta: 'PRUEBA-000',
        viv_prop_cc: '0012345678',
        placa_inmueble: '38-104',
        viv_prop_nombres_apellidos: 'José Muñoz Peña',
        observacion: 'Primera línea\nSegunda línea, con coma y "comillas"'
      }]
    }]
  });
  Logger.log(JSON.stringify(res));
  Logger.log('Revise la pestaña "viviendas": el documento debe conservar el cero ' +
    'inicial y la placa debe verse 38-104, no una fecha.');
}

function borrarPrueba() {
  var ss = libro_();
  ['viviendas', HOJA_BITACORA].forEach(function (nombre) {
    var hoja = ss.getSheetByName(nombre);
    if (!hoja || hoja.getLastRow() < 2) return;
    var encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0]
      .map(function (v) { return String(v); });
    borrarFilasDeEncuesta_(hoja, encabezados, 'PRUEBA-000');
  });
  Logger.log('Filas de prueba eliminadas.');
}
