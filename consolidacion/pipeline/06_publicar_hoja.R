##============================================================================##
# 06_publicar_hoja.R  —  Publicacion del resultado consolidado en la hoja
#------------------------------------------------------------------------------#
# Ultimo paso de cada corrida. Sube la base ya consolidada a las pestañas c_* de
# la misma hoja de Google de la que 00_conectar_hoja.R baja lo crudo, usando la
# accion "publicar_consolidado" del Apps Script.
#
# POR QUE EXISTE ESTE PASO
# Antes 04_exportar_consulta.R escribia js/datos.js DENTRO del repositorio y el
# aplicativo lo leia como archivo estatico. Eso tenia dos problemas: metia
# cedulas, direcciones y estado de salud en un repositorio publico, y obligaba a
# hacer commit para que el sitio publicado se actualizara. Como nadie se acuerda
# de hacer un commit cada diez minutos, la consulta vivia desactualizada.
#
# Ahora el dato se queda en la hoja y el sitio lo pide por fetch: el repositorio
# no lleva ni un registro personal y la actualizacion no depende de git.
#
# Pestañas que escribe (grano de cada una entre parentesis):
#   c_personas       (persona, con su hogar y su edificacion)
#   c_hogares        (formulario EDAN de personas/familia)
#   c_edificaciones  (formulario de vivienda)
#   c_afectaciones   (reporte por evento; entidad independiente)
#   c_fichas         (id_registro + respuestas completas en JSON)
#   c_diccionario    (libro de codigos: variable -> pregunta y seccion)
#   c_revisar        (hogares sin edificacion o con asociacion ambigua)
#   c_duplicados     (bitacora de duplicados marcados)
#   c_meta           (momento de esta publicacion)
#
# ANTES DE SUBIR NADA SE PRUEBA LA CERRADURA
# Este paso pone datos personales en la hoja, y de ahi los lee el aplicativo.
# Eso solo es aceptable si la puerta de lectura del Apps Script exige contrasena.
# Por eso, antes de publicar, se pide una tabla con una contrasena inventada: si
# el receptor la deja pasar, este paso se niega a publicar y dice como cerrarla.
# Ver la seccion 3.b, que explica por que se agrego.
#
# Como los dos pasos 00, este NUNCA tumba la corrida: si falta el token, si
# Google no responde o si la cerradura esta abierta, se avisa en el log y la base
# local queda igual de valida.
##============================================================================##

## configuracion inicial
rm(list = ls())
source("config/packages.R")
source("config/parameters.R")   # RUTA_DB, URL_HOJA, TOKEN_HOJA, BYTES_POR_PAGINA_PUBLICAR
source("config/functions.R")    # conectar_db, log_msg, token_exportacion

if (!PUBLICAR_HOJA) {
  log_msg("publicacion: desactivada (PUBLICAR_HOJA = FALSE); se omite")
  quit(status = 0)
}

resultado <- tryCatch({

  token_extraccion <- token_exportacion()

  con <- conectar_db()

  ##============================================================================##
  ##=== 1. Las mismas consultas que alimentaban datos.js                     ===##
  ##============================================================================##

  personas <- dbGetQuery(con, "
    SELECT p.documento_norm                    AS documento,
           p.nombres || ' ' || p.apellidos     AS nombre,
           p.edad, p.genero, p.parentesco, p.etnia,
           p.estado_salud, p.afiliacion_salud,
           p.estado_inmueble, p.propiedad_inmueble, p.ubicacion_inmueble,
           p.ahe_alimentaria, p.ahe_no_alimentaria,
           p.mat_rehab_vivienda, p.sub_arriendo,
           p.id_persona, p.id_encuesta, p.id_hogar,
           p.duplicate                         AS persona_duplicada,
           f.match_status, f.match_confidence, f.secretaria,
           v.direccion_completa, v.cumple_requisitos, v.requiere_evacuacion,
           v.sistema_constructivo,
           v.id_encuesta                       AS id_encuesta_vivienda,
           p.archivo_origen, p.last_update
    FROM personas p
    LEFT JOIN familias  f ON f.id_encuesta = p.id_encuesta
    LEFT JOIN viviendas v ON v.id_encuesta = f.id_encuesta_vivienda")

  hogares <- dbGetQuery(con, "
    SELECT f.id_encuesta, f.id_hogar, f.n_personas, f.secretaria,
           f.match_status, f.match_method, f.match_confidence,
           f.id_encuesta_vivienda, f.duplicate, f.id_canonico,
           f.fecha_actualizacion, f.archivo_origen, f.last_update,
           v.direccion_completa
    FROM familias f
    LEFT JOIN viviendas v ON v.id_encuesta = f.id_encuesta_vivienda")

  edificaciones <- dbGetQuery(con, "
    SELECT id_encuesta, id_hogar, prop_nombre, prop_cc, prop_cc_norm,
           inf_nombre, inf_cc, inf_cc_norm,
           cumple_requisitos, requiere_evacuacion, sistema_constructivo,
           tipo_inmueble, direccion_completa, latitud, longitud,
           ubicacion_confirmada, duplicate, id_canonico,
           fecha_actualizacion, archivo_origen, last_update
    FROM viviendas")

  afectaciones <- dbGetQuery(con, "
    SELECT id_encuesta, consecutivo_id, nombre_edificacion, barrio, comuna,
           direccion_completa, latitud, longitud,
           descripcion, colapso, requieren_evacuacion,
           fallecidos, atrapadas, necesitan_evacuar,
           tipo_edificacion, cantidad_viviendas, observaciones,
           fotos_cantidad, fotos_nombres, fotos_enlaces,
           diligencia_nombre, organismo, grupo_voluntarios,
           secretaria, fecha, fecha_actualizacion, duplicate, id_canonico,
           archivo_origen, last_update
    FROM afectaciones")

  revisar <- dbGetQuery(con, "
    SELECT id_encuesta, id_hogar, n_personas, match_status, secretaria, archivo_origen
    FROM familias
    WHERE duplicate = 0 AND match_status IN ('no_match', 'ambiguous')
    ORDER BY match_status")

  duplicados <- dbGetQuery(con, "
    SELECT tabla, id_registro, id_canonico, criterio, confianza, timestamp
    FROM duplicados ORDER BY timestamp DESC")

  ##============================================================================##
  ##=== 2. Fichas: respuestas completas de cada encuesta, una por fila       ===##
  ##============================================================================##

  ## ultima version del payload por registro (viviendas: encuesta; personas: persona)
  crudos <- dbGetQuery(con, "
    SELECT r.id_registro, r.tabla_origen, r.payload
    FROM raw_records r
    JOIN (SELECT id_registro, MAX(raw_id) AS raw_id
          FROM raw_records GROUP BY id_registro) u
      ON u.raw_id = r.raw_id")

  ## una celda de Sheets admite 50.000 caracteres y una ficha de vivienda son
  ## 221 preguntas: cabe de sobra, asi que cada ficha va entera en una celda y
  ## no hace falta partirla como en la pestaña de respaldos
  contenidos <- character(nrow(crudos))
  for (i in seq_len(nrow(crudos))) {
    fila <- fromJSON(crudos$payload[i])
    ## solo campos con dato; fuera columnas derivadas (_num, _nums, indicadores 0/1)
    fila <- fila[!grepl("_num$|_nums$|__", names(fila))]
    fila <- fila[!sapply(fila, function(v) is.null(v) || is.na(v) || v == "")]
    contenidos[i] <- toJSON(fila, auto_unbox = T, na = "null")
  }

  fichas <- data.frame(id_registro = crudos$id_registro,
                       contenido   = contenidos,
                       stringsAsFactors = F)

  ## libro de codigos: etiqueta y seccion de cada variable
  diccionario <- fread("synthetic/insumos/diccionario_variables.csv", encoding = "UTF-8") %>%
                 as.data.frame() %>%
                 distinct(variable, .keep_all = T) %>%
                 select(variable, codigo_pregunta, pregunta, seccion_numero,
                        seccion_titulo, formulario)

  dbDisconnect(con)

  ##============================================================================##
  ##=== 3. Envio de cada tabla, pagina por pagina                            ===##
  ##============================================================================##

  ## el cuerpo va como text/plain aunque sea JSON, por lo mismo que en
  ## 00_conectar_hoja.R: las Web App de Apps Script no atienden peticiones que
  ## disparen la verificacion previa del navegador
  ## la peticion tal cual, SIN interpretar la respuesta. La usa la prueba de la
  ## cerradura de mas abajo, donde un rechazo es el resultado correcto y no un
  ## error. Con `exportacion = FALSE` va solo el token general, que es lo unico
  ## que tiene un navegador: asi la prueba mide lo que puede hacer un extraño y
  ## no lo que puede hacer el pipeline.
  pedir_hoja_cruda <- function(cuerpo, exportacion = TRUE) {
    cuerpo$token <- TOKEN_HOJA
    if (exportacion) cuerpo$token_exportacion <- token_extraccion
    respuesta <- POST(URL_HOJA,
                      body = toJSON(cuerpo, auto_unbox = T, na = "null"),
                      content_type("text/plain"),
                      timeout(TIEMPO_LIMITE_HOJA))
    fromJSON(content(respuesta, as = "text", encoding = "UTF-8"))
  }

  pedir_hoja <- function(cuerpo) {
    datos <- pedir_hoja_cruda(cuerpo)
    if (!isTRUE(datos$ok)) {
      ## el nombre de la tabla va aparte: las acciones que no la llevan (ping,
      ## inventario, marca) dejarian a sprintf con un argumento de longitud cero
      ## y el mensaje saldria VACIO, que fue justo lo que paso la primera vez
      ## que el seguro de abajo freno una corrida
      cual <- if (is.null(cuerpo$tabla)) "" else sprintf(", tabla %s", cuerpo$tabla)
      stop(sprintf("el receptor respondio '%s' (accion %s%s)",
                   datos$error, cuerpo$accion, cual))
    }
    datos
  }

  ## una tabla completa: la primera pagina reemplaza y las siguientes anexan
  ##
  ## El tamaño de pagina se calcula por PESO, no por numero de filas: una fila de
  ## c_revisar son seis campos cortos y una de c_fichas son 221 preguntas en
  ## JSON. Con un numero fijo, la que sirve para fichas deja las demas en
  ## cientos de peticiones inutiles, y la que sirve para las demas revienta el
  ## limite de tiempo de Apps Script en fichas.
  publicar_tabla <- function(nombre, datos) {
    if (is.null(datos) || nrow(datos) == 0) {
      pedir_hoja(list(accion = "publicar_consolidado", tabla = nombre,
                      encabezados = names(datos), filas = list(), reemplazar = T))
      log_msg(sprintf("publicacion: %s vacia (0 filas)", nombre))
      return(0)
    }

    ## todo viaja como texto: la hoja guarda texto plano y asi una cedula con
    ## ceros a la izquierda no se convierte en numero por el camino
    datos[] <- lapply(datos, function(x) ifelse(is.na(x), "", as.character(x)))

    peso_fila <- max(1, nchar(toJSON(unname(as.list(datos[1, ])), auto_unbox = T)))
    por_pagina <- max(1, floor(BYTES_POR_PAGINA_PUBLICAR / peso_fila))

    desde <- 1
    while (desde <= nrow(datos)) {
      hasta  <- min(desde + por_pagina - 1, nrow(datos))
      trozo  <- datos[desde:hasta, , drop = F]
      pedir_hoja(list(accion      = "publicar_consolidado",
                      tabla       = nombre,
                      encabezados = names(datos),
                      filas       = unname(lapply(seq_len(nrow(trozo)),
                                                  function(i) unname(as.list(trozo[i, ])))),
                      reemplazar  = (desde == 1)))
      desde <- hasta + 1
    }

    log_msg(sprintf("publicacion: %s -> %d filas, %d columnas (%d por pagina)",
                    nombre, nrow(datos), ncol(datos), por_pagina))
    nrow(datos)
  }

  ## el ping confirma que la implementacion publicada trae estas acciones: pegar
  ## el codigo en el editor no basta, hay que implementar una version nueva
  ping <- pedir_hoja(list(accion = "ping"))
  log_msg(sprintf("publicacion: receptor version %s", ping$version))

  ##============================================================================##
<<<<<<< HEAD
  ##=== 3.b Prueba de la cerradura ANTES de subir nada                       ===##
  ##============================================================================##

  ## POR QUE ESTO EXISTE
  ## El 15 de agosto de 2026 se comprobo que la implementacion publicada era la
  ## 1.6.0, anterior a la que hace que consulta_completa falle cerrado. Con esa
  ## version, una peticion SIN contrasena devolvia ok y las 29 columnas de
  ## c_personas —documento, nombre, estado de salud, direccion—. No entrego
  ## registros solo porque las pestañas estaban vacias: la primera publicacion
  ## real los habria dejado al alcance de cualquiera, porque la direccion y el
  ## token general estan en config-consulta.js, que es publico.
  ##
  ## El codigo correcto llevaba semanas en el repositorio. Lo que fallo fue el
  ## paso manual de implementar la version nueva, y nada lo revisaba.
  ##
  ## Asi que antes de subir un solo registro se toca la puerta con una
  ## contrasena inventada. Si abre, esto NO publica. Que el aplicativo se quede
  ## con datos viejos es un problema; que la base entera quede descargable sin
  ## credenciales es otro, y mucho peor.
  cerradura <- pedir_hoja_cruda(list(accion        = "consulta_completa",
                                     tabla         = "c_personas",
                                     token_lectura = paste0("cerradura-", as.integer(Sys.time())),
                                     desde = 1, limite = 1),
                                exportacion = FALSE)

  ##
  ## EL ENCLAVAMIENTO SOLO APLICA A LA BASE REAL. Lo que protege es que no
  ## salgan datos personales por una puerta abierta; con la base simulada no hay
  ## ninguno que proteger, son personas inventadas. Si aqui se bloqueara tambien
  ## el modo simulado, no habria forma de dejar la consulta funcionando mientras
  ## se arregla el Apps Script, que es justo para lo que existe ese modo.
  if (isTRUE(cerradura$ok)) {
    aviso <- paste("LA PUERTA DE LECTURA ESTA ABIERTA: consulta_completa respondio 'ok' a una",
                   "contrasena inventada, asi que las tablas consolidadas quedan al alcance",
                   "de cualquiera que abra el sitio.",
                   "\n  Para cerrarla, en el script de Google:",
                   "\n    1. Propiedades del script: cree TOKEN_LECTURA con la contrasena del equipo.",
                   "\n    2. Implementar -> Gestionar implementaciones -> editar -> Version: Nueva.",
                   "\n       (pegar el codigo NO basta; la direccion sigue sirviendo la version anterior)",
                   sprintf("\n  Version publicada ahora: %s. Se necesita 1.6.1 o posterior.", ping$version))

    if (!MODO_SIMULADO) {
      stop(paste(aviso, "\n  NO se publico nada: la base real no sale por una puerta abierta."))
    }
    log_msg(paste(aviso, "\n  Se publica de todas formas porque son DATOS SIMULADOS,",
                  "pero no cambie a la base real hasta cerrarla."))
  } else {
    log_msg(sprintf("publicacion: la puerta de lectura rechaza contrasenas invalidas (%s)",
                    cerradura$error))
=======
  ##=== 4. Seguro: no reemplazar una base publicada por una vacia            ===##
  ##============================================================================##

  ## Publicar es REEMPLAZAR: la primera pagina de cada tabla borra lo que
  ## hubiera. Si esta corrida consolido cero registros, sin este seguro la
  ## consulta se queda muda y nadie se entera, porque no hay ningun error: el
  ## pipeline hizo exactamente lo que le pidieron.
  ##
  ## Y no es hipotetico. Basta con que la hoja cruda responda vacia una vez —una
  ## exportacion a medias, alguien limpiando pestañas— para que la corrida
  ## siguiente arrase con lo publicado. En GitHub Actions es mas facil todavia:
  ## si la cache no trae la base, se reconstruye desde cero, y una lectura vacia
  ## de la hoja se convierte en una base vacia.
  ##
  ## Ante la duda se conserva lo que ya esta publicado: una base vieja sirve;
  ## una borrada, no. Para un reemplazo legitimo por vacio (empezar de nuevo)
  ## se corre este paso con FORZAR_PUBLICACION_VACIA <- TRUE.
  cuentas <- c(c_personas      = nrow(personas),
               c_hogares       = nrow(hogares),
               c_edificaciones = nrow(edificaciones),
               c_afectaciones  = nrow(afectaciones))

  if (all(cuentas == 0) && !FORZAR_PUBLICACION_VACIA) {
    publicado <- pedir_hoja(list(accion = "inventario_consolidado"))$tablas
    vivas     <- publicado$filas[publicado$tabla %in% names(cuentas)]

    if (any(vivas > 0)) {
      stop(sprintf(paste("esta corrida consolido CERO registros y la hoja tiene %d publicados.",
                         "No se reemplaza nada. Revise que la hoja cruda no este vacia;",
                         "si el vaciado es intencional, corra este paso con",
                         "FORZAR_PUBLICACION_VACIA <- TRUE."),
                   sum(vivas)))
    }
>>>>>>> 67cf61f6646899c3a9242ce650c7fedc3eec54fe
  }

  ## export data (pestañas c_* de la hoja; las lee el aplicativo de consulta)
  publicar_tabla("c_personas",      personas)
  publicar_tabla("c_hogares",       hogares)
  publicar_tabla("c_edificaciones", edificaciones)
  publicar_tabla("c_afectaciones",  afectaciones)
  publicar_tabla("c_fichas",        fichas)
  publicar_tabla("c_diccionario",   diccionario)
  publicar_tabla("c_revisar",       revisar)
  publicar_tabla("c_duplicados",    duplicados)

  ## la marca va de ULTIMA, cuando ya esta todo arriba: si la corrida se cae a
  ## la mitad, el aplicativo sigue mostrando la fecha de la ultima publicacion
  ## completa y no una que corresponde a datos a medias
  ##
  ## En modo simulado el aviso viaja PEGADO a la fecha. Es la unica forma de que
  ## el aplicativo lo muestre sin cambiarle el codigo ni republicar el Apps
  ## Script: la pantalla pinta este texto tal cual bajo el titulo ("Actualizada:
  ## ..."), asi que quien abra la consulta lee de entrada que lo que ve no es la
  ## operacion real. Y como la marca la escribe esta misma corrida, no puede
  ## quedar diciendo "simulado" sobre datos reales ni al reves.
  marca <- format(Sys.time(), "%Y-%m-%dT%H:%M:%S")
  if (MODO_SIMULADO) marca <- paste(marca, "· DATOS SIMULADOS (no es la base real)")
  pedir_hoja(list(accion = "marcar_consolidado", actualizado = marca))

  log_msg(sprintf("publicacion: consolidado en la hoja, marcado %s", marca))
  "ok"

}, error = function(e) {
  log_msg(sprintf("publicacion: %s — se omite este paso; la base local queda igual de valida",
                  conditionMessage(e)))
  "omitido"
})
