##============================================================================##
# 01_ingest.R  —  Ingestion incremental de archivos de la carpeta OneDrive
#------------------------------------------------------------------------------#
# Lee los Excel/CSV nuevos o modificados de CARPETA_INGESTA y actualiza:
#   - source_files    (grano: version de archivo; hash sha-256)
#   - raw_records     (grano: version de fila; payload JSON, solo filas nuevas o cambiadas)
#   - encuestas       (grano: encuesta)
#   - viviendas       (grano: formulario de vivienda)
#   - personas        (grano: persona)
#   - familias        (grano: formulario de personas; derivada del archivo de personas)
#   - record_history  (grano: campo modificado)
#
# Reglas del upsert por registro:
#   - id nuevo                                  -> insertar
#   - misma fecha_actualizacion y mismos datos  -> ignorar (sin cambio)
#   - fecha_actualizacion mayor y datos nuevos  -> actualizar + historial campo a campo
#   - fecha_actualizacion menor (version vieja) -> ignorar
##============================================================================##

## configuracion inicial
rm(list = ls())
source("config/packages.R")
source("config/parameters.R")   # CARPETA_INGESTA, RUTA_DB, CARPETA_LOGS
source("config/functions.R")    # normalizar_*, llave_direccion, conectar_db, run_actual, log_msg

con    <- conectar_db()
ahora  <- format(Sys.time(), "%Y-%m-%dT%H:%M:%S")
run_id <- run_actual(con)

## corrida manual: si no hay corrida abierta (script ejecutado por fuera de
## run_pipeline.R) se abre una y se cierra al final
corrida_manual <- is.na(run_id)
if (corrida_manual) {
  dbExecute(con, "INSERT INTO processing_runs (inicio, estado, mensaje) VALUES (?, 'en_curso', 'corrida manual')",
            params = list(ahora))
  run_id <- run_actual(con)
}

## columna de un data frame como texto, o NA si el archivo no la trae
columna <- function(d, nombre) {
  if (nombre %in% names(d)) as.character(d[[nombre]]) else rep(NA_character_, nrow(d))
}

## valor legible de una pregunta de opcion unica: la etiqueta si el exporte la
## trae ("2 · No habitable"), si no el valor crudo ("2")
columna_etiqueta <- function(d, nombre) {
  etiqueta <- columna(d, paste0(nombre, "_etiqueta"))
  valor    <- columna(d, nombre)
  ifelse(!is.na(etiqueta) & etiqueta != "", etiqueta, valor)
}

## inserta o actualiza una fila consolidada; devuelve insertado/actualizado/sin_cambio
## reutilizada por encuestas, viviendas, personas y familias
upsert_registro <- function(tabla, llave, fila, campos_historial) {
  actual <- dbGetQuery(con, sprintf("SELECT * FROM %s WHERE %s = ?", tabla, llave),
                       params = list(fila[[llave]]))
  if (nrow(actual) == 0) {
    fila$ingestion_timestamp <- ahora
    fila$last_update         <- ahora
    dbExecute(con, sprintf("INSERT INTO %s (%s) VALUES (%s)", tabla,
                           paste(names(fila), collapse = ", "),
                           paste(rep("?", length(fila)), collapse = ", ")),
              params = unname(as.list(fila)))
    return("insertado")
  }
  ## llego una version anterior a la vigente: se ignora
  if (!is.na(actual$fecha_actualizacion) && !is.na(fila$fecha_actualizacion) &&
      fila$fecha_actualizacion < actual$fecha_actualizacion) {
    return("sin_cambio")
  }
  ## se compara TODA la fila para decidir si hay que escribir, pero solo se
  ## registran en el historial los campos de campos_historial. Antes se
  ## comparaban unicamente esos: una columna derivada nueva (unidad_norm) daba
  ## "sin_cambio" y se quedaba en NULL para siempre en los registros ya
  ## cargados, porque el dato de origen no habia cambiado.
  ##
  ## Las columnas REAL/INTEGER se comparan como numero y no como texto: el CSV
  ## trae la latitud "3.358000" y SQLite la devuelve 3.358, de modo que la
  ## comparacion de texto daba siempre distinto. Cada corrida que tocara el
  ## archivo marcaba el registro como actualizado y escribia una fila falsa en
  ## record_history (las 8 primeras filas de esa tabla fueron todas de eso).
  cambios <- names(fila)[sapply(names(fila), function(cc) {
               viejo <- actual[[cc]]
               nuevo <- fila[[cc]]
               if (is.numeric(viejo)) {
                 return(!isTRUE(all.equal(viejo, suppressWarnings(as.numeric(nuevo)))))
               }
               !identical(as.character(viejo), as.character(nuevo))
             })]
  if (length(cambios) == 0) return("sin_cambio")
  for (cc in intersect(cambios, campos_historial)) {
    dbExecute(con, "INSERT INTO record_history (tabla, id_registro, campo, valor_anterior, valor_nuevo, run_id, timestamp)
                    VALUES (?, ?, ?, ?, ?, ?, ?)",
              params = list(tabla, fila[[llave]], cc, as.character(actual[[cc]]),
                            as.character(fila[[cc]]), run_id, ahora))
  }
  campos_update <- setdiff(names(fila), llave)
  dbExecute(con, sprintf("UPDATE %s SET %s, last_update = ? WHERE %s = ?", tabla,
                         paste(sprintf("%s = ?", campos_update), collapse = ", "), llave),
            params = c(unname(as.list(fila[campos_update])), list(ahora, fila[[llave]])))
  "actualizado"
}

## guarda la version cruda de una fila (payload JSON)
guardar_raw <- function(id_registro, tabla_origen, archivo, hash_fila, payload) {
  dbExecute(con, "INSERT INTO raw_records (id_registro, tabla_origen, archivo, hash_fila, payload, ingestion_timestamp)
                  VALUES (?, ?, ?, ?, ?, ?)",
            params = list(id_registro, tabla_origen, archivo, hash_fila, payload, ahora))
}

## contadores de la corrida
n_archivos <- 0
n_insert   <- 0
n_update   <- 0
n_igual    <- 0

##============================================================================##
##=== 1. Deteccion de archivos nuevos o modificados (por hash)             ===##
##============================================================================##

archivos <- list.files(CARPETA_INGESTA, pattern = "\\.(xlsx|csv)$", full.names = T)
log_msg(sprintf("ingestion: %d archivo(s) en la carpeta", length(archivos)))

## vapply y no sapply: con la carpeta vacia sapply devuelve una lista, hash
## queda como columna-lista y el anti_join de abajo falla por tipos. Una carpeta
## sin archivos es un estado normal (base en cero, o la hoja todavia sin datos)
pendientes <- tibble(ruta    = archivos,
                     archivo = basename(archivos),
                     hash    = vapply(archivos, function(a) digest(file = a, algo = "sha256"),
                                      character(1)),
                     mtime   = format(file.mtime(archivos), "%Y-%m-%dT%H:%M:%S"))

procesados <- dbGetQuery(con, "SELECT archivo, hash FROM source_files WHERE estado = 'procesado'")
pendientes <- anti_join(pendientes, procesados, by = c("archivo", "hash"))
log_msg(sprintf("ingestion: %d archivo(s) nuevo(s) o modificado(s)", nrow(pendientes)))

##============================================================================##
##=== 2. Procesamiento de cada archivo pendiente                           ===##
##============================================================================##

for (i in seq_len(nrow(pendientes))) {

  archivo <- pendientes$archivo[i]
  n_filas <- 0
  resultado_archivo <- tryCatch({

    ## los CSV NO se leen con import(): por dentro usa fread, que interpreta el
    ## tipo de cada columna y en el camino deforma justo lo que no se puede
    ## deformar. Con el exporte real de la app:
    ##   - la cedula 0012345 se vuelve 12345 (se come los ceros de la izquierda)
    ##   - una observacion con comillas ("38-104" o un apodo) llega con las
    ##     comillas duplicadas: fread no deshace el escape del CSV
    ## read.csv con todo como texto respeta el archivo tal cual. Es la misma
    ## precaucion que toma el Apps Script al escribir en la hoja (formato de
    ## texto plano); no tendria sentido cuidarlo alla y perderlo aca.
    ## Los .xlsx del canal de Drive siguen con import(), que si los lee bien.
    if (grepl("\\.csv$", archivo, ignore.case = T)) {
      datos <- read.csv(pendientes$ruta[i], colClasses = "character", check.names = F)
      ## algunos exportes traen marca de orden de bytes al inicio (BOM); sin
      ## quitarla la primera columna se llamaria "<BOM>id_encuesta" y quedaria
      ## invisible para columna(). Se compara por bytes y con el escape \ufeff,
      ## no con el caracter literal: el sistema corre en locale C y un literal
      ## multibyte dentro de un patron rompe la expresion regular
      names(datos)[1] <- sub("^\ufeff", "", names(datos)[1], useBytes = T)
      ## read.csv devuelve el texto con la codificacion SIN DECLARAR. Al escribir
      ## en SQLite, enc2utf8() no sabe que son bytes UTF-8 validos y los cambia
      ## por su representacion impresa: en la base terminaba el texto literal
      ## "Mamposter<c3><ad>a" en vez de "Mamposteria" con tilde, y de ahi pasaba
      ## a la consulta y al tablero. Los archivos de la app y de la hoja son
      ## UTF-8, asi que solo hay que declararlo; los bytes no se tocan.
      ## (No se usa el argumento encoding= de read.csv: en locale C rompe la
      ## lectura, se come filas y trunca las tildes.)
      datos[] <- lapply(datos, function(columna) {
                   Encoding(columna) <- "UTF-8"
                   columna
                 })
      ## una celda vacia es "sin respuesta", venga escrita como ,, o como ,"",
      datos <- datos %>% mutate(across(everything(), ~ ifelse(. == "", NA_character_, .)))
    } else {
      datos <- import(pendientes$ruta[i]) %>%
               mutate(across(everything(), as.character))
    }
    n_filas <- nrow(datos)

    ##------------------------------------------------------------------------
    ## archivos de viviendas (una fila por formulario de vivienda)
    ##------------------------------------------------------------------------
    if (grepl("^viviendas", archivo)) {

      filas <- tibble(id_encuesta          = columna(datos, "id_encuesta"),
                      id_hogar             = columna(datos, "id_hogar"),
                      prop_nombre          = columna(datos, "viv_prop_nombres_apellidos"),
                      prop_cc              = columna(datos, "viv_prop_cc"),
                      prop_cc_norm         = normalizar_cedula(columna(datos, "viv_prop_cc")),
                      prop_telefono        = columna(datos, "viv_prop_telefono"),
                      inf_nombre           = columna(datos, "viv_inf_nombre"),
                      inf_cc               = columna(datos, "viv_inf_cc"),
                      inf_cc_norm          = normalizar_cedula(columna(datos, "viv_inf_cc")),
                      inf_telefono         = columna(datos, "viv_inf_telefono"),
                      nc_nombre            = columna(datos, "viv_nc_nombre"),
                      nc_cc                = columna(datos, "viv_nc_cc"),
                      nc_cc_norm           = normalizar_cedula(columna(datos, "viv_nc_cc")),
                      cumple_requisitos    = columna_etiqueta(datos, "viv_cumple_requisitos"),
                      requiere_evacuacion  = columna_etiqueta(datos, "viv_requiere_evacuacion"),
                      sistema_constructivo = columna_etiqueta(datos, "viv_sistema_constructivo"),
                      tipo_evento          = columna_etiqueta(datos, "viv_tipo_evento"),
                      tipo_via             = columna(datos, "tipo_via"),
                      numero_via           = columna(datos, "numero_via"),
                      sufijo_via           = columna(datos, "sufijo_via"),
                      numero_generador     = columna(datos, "numero_generador"),
                      placa_inmueble       = columna(datos, "placa_inmueble"),
                      tipo_inmueble        = columna(datos, "tipo_inmueble"),
                      ## el formulario lo pide desde la version 2.3.0 (los 42
                      ## municipios del Valle); las encuestas anteriores no lo
                      ## traen y columna() devuelve NA, que es lo correcto
                      municipio            = columna(datos, "viv_municipio"),
                      direccion_completa   = columna(datos, "direccion_completa"),
                      direccion_norm       = llave_direccion(columna(datos, "tipo_via"),
                                                             columna(datos, "numero_via"),
                                                             columna(datos, "sufijo_via"),
                                                             columna(datos, "numero_generador"),
                                                             columna(datos, "placa_inmueble")),
                      unidad_norm          = llave_unidad(columna(datos, "tipo_unidad"),
                                                          columna(datos, "numero_unidad"),
                                                          columna(datos, "torre_bloque")),
                      latitud              = columna(datos, "latitud"),
                      longitud             = columna(datos, "longitud"),
                      ubicacion_confirmada = columna(datos, "ubicacion_confirmada"),
                      fecha_actualizacion  = columna(datos, "fecha_actualizacion"),
                      archivo_origen       = archivo)

      campos_hist <- c("id_hogar", "prop_nombre", "prop_cc", "prop_telefono", "inf_cc", "nc_cc",
                       "cumple_requisitos", "requiere_evacuacion", "direccion_completa",
                       "latitud", "longitud", "fecha_actualizacion")

      for (j in seq_len(nrow(filas))) {
        fila           <- as.list(filas[j, ])
        payload        <- toJSON(as.list(datos[j, ]), auto_unbox = T)
        fila$hash_fila <- digest(payload, algo = "sha256")
        resultado <- upsert_registro("viviendas", "id_encuesta", fila, campos_hist)
        if (resultado == "insertado")   n_insert <- n_insert + 1
        if (resultado == "actualizado") n_update <- n_update + 1
        if (resultado == "sin_cambio")  n_igual  <- n_igual  + 1
        if (resultado != "sin_cambio") {
          guardar_raw(fila$id_encuesta, "viviendas", archivo, fila$hash_fila, payload)
        }
        ## indice general de encuestas
        indice <- list(id_encuesta         = fila$id_encuesta,
                       tipo_formulario     = "vivienda",
                       id_hogar            = fila$id_hogar,
                       secretaria          = columna(datos, "secretaria")[j],
                       usuario             = columna(datos, "usuario")[j],
                       estado              = columna(datos, "estado")[j],
                       fecha               = columna(datos, "fecha")[j],
                       fecha_actualizacion = fila$fecha_actualizacion,
                       archivo_origen      = archivo,
                       hash_fila           = fila$hash_fila)
        upsert_registro("encuestas", "id_encuesta", indice, c("estado", "fecha_actualizacion"))
      }
    }

    ##------------------------------------------------------------------------
    ## archivos de afectaciones (una fila por reporte de evento/edificacion)
    ##
    ## Grano distinto al de viviendas: aqui un registro es una edificacion
    ## atendida por un organismo de socorro, con conteos declarados de personas
    ## (fallecidas, atrapadas, por evacuar). No trae cedula ni id_hogar, asi
    ## que no se enlaza con las otras tablas; entra como entidad independiente.
    ##------------------------------------------------------------------------
    if (grepl("^afectaciones", archivo)) {

      filas <- tibble(id_encuesta          = columna(datos, "id_encuesta"),
                      consecutivo_id       = columna(datos, "afe_consecutivo_id"),
                      correo               = columna(datos, "afe_correo"),
                      nombre_edificacion   = columna(datos, "afe_nombre_edificacion"),
                      barrio               = columna(datos, "afe_barrio"),
                      comuna               = columna(datos, "afe_comuna"),
                      tipo_via             = columna(datos, "tipo_via"),
                      numero_via           = columna(datos, "numero_via"),
                      sufijo_via           = columna(datos, "sufijo_via"),
                      numero_generador     = columna(datos, "numero_generador"),
                      placa_inmueble       = columna(datos, "placa_inmueble"),
                      direccion_completa   = columna(datos, "direccion_completa"),
                      direccion_norm       = llave_direccion(columna(datos, "tipo_via"),
                                                             columna(datos, "numero_via"),
                                                             columna(datos, "sufijo_via"),
                                                             columna(datos, "numero_generador"),
                                                             columna(datos, "placa_inmueble")),
                      latitud              = columna(datos, "latitud"),
                      longitud             = columna(datos, "longitud"),
                      descripcion          = columna(datos, "afe_descripcion"),
                      colapso              = columna_etiqueta(datos, "afe_colapso"),
                      requieren_evacuacion = columna_etiqueta(datos, "afe_requieren_evacuacion"),
                      fallecidos           = columna(datos, "afe_fallecidos"),
                      atrapadas            = columna(datos, "afe_atrapadas"),
                      necesitan_evacuar    = columna(datos, "afe_necesitan_evacuar"),
                      tipo_edificacion     = columna(datos, "afe_tipo_edificacion"),
                      cantidad_viviendas   = columna(datos, "afe_cantidad_viviendas"),
                      observaciones        = columna(datos, "afe_observaciones"),
                      fotos_cantidad       = columna(datos, "afe_fotos_cantidad"),
                      fotos_nombres        = columna(datos, "afe_fotos_nombres"),
                      fotos_enlaces        = columna(datos, "afe_fotos_enlaces"),
                      diligencia_nombre    = columna(datos, "afe_diligencia_nombre"),
                      organismo            = columna(datos, "afe_organismo"),
                      grupo_voluntarios    = columna_etiqueta(datos, "afe_grupo_voluntarios"),
                      secretaria           = columna(datos, "secretaria"),
                      fecha                = columna(datos, "fecha"),
                      fecha_actualizacion  = columna(datos, "fecha_actualizacion"),
                      archivo_origen       = archivo)

      campos_hist <- c("descripcion", "colapso", "requieren_evacuacion", "fallecidos",
                       "atrapadas", "necesitan_evacuar", "cantidad_viviendas",
                       "observaciones", "fotos_cantidad", "direccion_completa",
                       "fecha_actualizacion")

      for (j in seq_len(nrow(filas))) {
        fila           <- as.list(filas[j, ])
        payload        <- toJSON(as.list(datos[j, ]), auto_unbox = T)
        fila$hash_fila <- digest(payload, algo = "sha256")
        resultado <- upsert_registro("afectaciones", "id_encuesta", fila, campos_hist)
        if (resultado == "insertado")   n_insert <- n_insert + 1
        if (resultado == "actualizado") n_update <- n_update + 1
        if (resultado == "sin_cambio")  n_igual  <- n_igual  + 1
        if (resultado != "sin_cambio") {
          guardar_raw(fila$id_encuesta, "afectaciones", archivo, fila$hash_fila, payload)
        }
        ## indice general de encuestas
        indice <- list(id_encuesta         = fila$id_encuesta,
                       tipo_formulario     = "afectaciones",
                       secretaria          = fila$secretaria,
                       usuario             = columna(datos, "usuario")[j],
                       estado              = columna(datos, "estado")[j],
                       fecha               = fila$fecha,
                       fecha_actualizacion = fila$fecha_actualizacion,
                       archivo_origen      = archivo,
                       hash_fila           = fila$hash_fila)
        upsert_registro("encuestas", "id_encuesta", indice, c("estado", "fecha_actualizacion"))
      }
    }

    ##------------------------------------------------------------------------
    ## archivos de personas (una fila por persona; la familia se deriva)
    ##------------------------------------------------------------------------
    if (grepl("^personas", archivo)) {

      filas <- tibble(id_persona          = columna(datos, "id_persona"),
                      id_encuesta         = columna(datos, "id_encuesta"),
                      id_hogar            = columna(datos, "id_hogar"),
                      nombres             = columna(datos, "per_nombres"),
                      apellidos           = columna(datos, "per_apellidos"),
                      nombre_norm         = normalizar_texto(paste(columna(datos, "per_nombres"),
                                                                   columna(datos, "per_apellidos"))),
                      tipo_documento      = columna_etiqueta(datos, "per_tipo_documento"),
                      numero_documento    = columna(datos, "per_numero_documento"),
                      documento_norm      = normalizar_cedula(columna(datos, "per_numero_documento")),
                      parentesco          = columna_etiqueta(datos, "per_parentesco"),
                      genero              = columna_etiqueta(datos, "per_genero"),
                      edad                = columna(datos, "per_edad"),
                      etnia               = columna_etiqueta(datos, "per_etnia"),
                      estado_salud        = columna_etiqueta(datos, "per_estado_salud"),
                      afiliacion_salud    = columna_etiqueta(datos, "per_afiliacion_salud"),
                      ubicacion_inmueble  = columna_etiqueta(datos, "per_ubicacion_inmueble"),
                      propiedad_inmueble  = columna_etiqueta(datos, "per_propiedad_inmueble"),
                      estado_inmueble     = columna_etiqueta(datos, "per_estado_inmueble"),
                      ahe_alimentaria     = columna_etiqueta(datos, "per_ahe_alimentaria"),
                      ahe_no_alimentaria  = columna_etiqueta(datos, "per_ahe_no_alimentaria"),
                      mat_rehab_vivienda  = columna_etiqueta(datos, "per_mat_rehab_vivienda"),
                      sub_arriendo        = columna_etiqueta(datos, "per_sub_arriendo"),
                      fecha_actualizacion = columna(datos, "fecha_actualizacion"),
                      archivo_origen      = archivo)

      campos_hist <- c("nombres", "apellidos", "numero_documento", "parentesco", "edad",
                       "estado_salud", "estado_inmueble", "fecha_actualizacion")

      for (j in seq_len(nrow(filas))) {
        fila           <- as.list(filas[j, ])
        payload        <- toJSON(as.list(datos[j, ]), auto_unbox = T)
        fila$hash_fila <- digest(payload, algo = "sha256")
        resultado <- upsert_registro("personas", "id_persona", fila, campos_hist)
        if (resultado == "insertado")   n_insert <- n_insert + 1
        if (resultado == "actualizado") n_update <- n_update + 1
        if (resultado == "sin_cambio")  n_igual  <- n_igual  + 1
        if (resultado != "sin_cambio") {
          guardar_raw(fila$id_persona, "personas", archivo, fila$hash_fila, payload)
        }
      }

      ## familias: una fila por encuesta de personas
      ## no se tocan aca las columnas match_* ni duplicate: son de 02 y 03
      grupos <- filas %>%
                group_by(id_encuesta) %>%
                summarise(id_hogar            = first(id_hogar),
                          n_personas          = n(),
                          fecha_actualizacion = max(fecha_actualizacion),
                          .groups = "drop")

      for (j in seq_len(nrow(grupos))) {
        fila <- as.list(grupos[j, ])
        fila$secretaria     <- columna(datos, "secretaria")[1]
        fila$usuario        <- columna(datos, "usuario")[1]
        fila$archivo_origen <- archivo
        upsert_registro("familias", "id_encuesta", fila,
                        c("id_hogar", "n_personas", "fecha_actualizacion"))
        indice <- list(id_encuesta         = fila$id_encuesta,
                       tipo_formulario     = "personas",
                       id_hogar            = fila$id_hogar,
                       secretaria          = fila$secretaria,
                       usuario             = fila$usuario,
                       fecha_actualizacion = fila$fecha_actualizacion,
                       archivo_origen      = archivo)
        upsert_registro("encuestas", "id_encuesta", indice, c("fecha_actualizacion"))
      }
    }

    "procesado"
  }, error = function(e) {
    log_msg(sprintf("ERROR en %s: %s", archivo, conditionMessage(e)))
    "error"
  })

  ## registro de la version del archivo
  dbExecute(con, "INSERT OR REPLACE INTO source_files (archivo, ruta, hash, fecha_modificacion, fecha_procesado, run_id, n_registros, estado)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            params = list(archivo, pendientes$ruta[i], pendientes$hash[i],
                          pendientes$mtime[i], ahora, run_id, n_filas, resultado_archivo))
  n_archivos <- n_archivos + 1
  log_msg(sprintf("%s: %s (%d filas)", archivo, resultado_archivo, n_filas))
}

##============================================================================##
##=== 3. Cierre: contadores de la corrida                                  ===##
##============================================================================##

invisible(dbExecute(con, "UPDATE processing_runs
                          SET archivos_procesados = archivos_procesados + ?,
                              reg_insertados      = reg_insertados      + ?,
                              reg_actualizados    = reg_actualizados    + ?,
                              reg_sin_cambio      = reg_sin_cambio      + ?
                          WHERE run_id = ?",
                    params = list(n_archivos, n_insert, n_update, n_igual, run_id)))

log_msg(sprintf("ingestion: %d archivos | %d insertados | %d actualizados | %d sin cambio",
                n_archivos, n_insert, n_update, n_igual))

if (corrida_manual) {
  dbExecute(con, "UPDATE processing_runs SET fin = ?, estado = 'ok' WHERE run_id = ?",
            params = list(format(Sys.time(), "%Y-%m-%dT%H:%M:%S"), run_id))
}
dbDisconnect(con)
