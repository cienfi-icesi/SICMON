##============================================================================##
# 02_dedup.R  —  Deteccion y marcaje de duplicados
#------------------------------------------------------------------------------#
# Corre despues de la ingestion y antes del matching, para que el matching
# trabaje solo con registros canonicos. Nada se elimina: el registro duplicado
# queda con duplicate = 1, la confianza del emparejamiento y el puntero
# id_canonico al registro que se conserva.
#
# Criterios:
#   - personas : mismo documento_norm; canonico = fecha_actualizacion mas
#                reciente; confianza = similitud jaro-winkler del nombre.
#                Si el nombre difiere demasiado (< UMBRAL_NOMBRE) NO se marca:
#                puede ser un error de digitacion de la cedula.
#   - viviendas: misma direccion_norm Y misma unidad_norm (edificio + apartamento);
#                canonico = mas reciente; confianza 0.98 si ademas coincide la
#                cedula del propietario, 0.92 si la unidad venia diligenciada,
#                0.85 si no hay ni unidad ni cedula que lo confirmen.
#                Si las dos cedulas de propietario existen y son DISTINTAS no se
#                marca: son dos hogares del mismo edificio, no un duplicado.
#   - afectaciones: misma direccion_norm, esta vez SIN unidad, porque el reporte
#                es de la edificacion completa; canonico = mas reciente;
#                confianza 0.99 con el mismo consecutivo del CMGRD, 0.95 con el
#                mismo nombre de edificacion, 0.88 solo con la direccion.
#   - familias : mismo id_hogar en dos encuestas de personas; canonico = mas
#                reciente; confianza 0.95.
#
# El calculo es idempotente: se recalcula el estado objetivo completo y solo
# se escriben las filas cuyo estado cambio (con su fila de auditoria en
# duplicados).
##============================================================================##

## configuracion inicial
rm(list = ls())
source("config/packages.R")
source("config/parameters.R")   # RUTA_DB, UMBRAL_NOMBRE
source("config/functions.R")    # conectar_db, run_actual, log_msg

con    <- conectar_db()
ahora  <- format(Sys.time(), "%Y-%m-%dT%H:%M:%S")
run_id <- run_actual(con)

corrida_manual <- is.na(run_id)
if (corrida_manual) {
  dbExecute(con, "INSERT INTO processing_runs (inicio, estado, mensaje) VALUES (?, 'en_curso', 'corrida manual')",
            params = list(ahora))
  run_id <- run_actual(con)
}

## aplica el estado objetivo de duplicados a una tabla y audita los cambios
## reutilizada por personas, viviendas y familias
aplicar_duplicados <- function(tabla, llave, actual, objetivo, criterio) {
  estado <- actual %>%
            left_join(objetivo, by = llave) %>%
            mutate(dup_obj  = ifelse(is.na(dup_obj), 0, dup_obj),
                   conf_obj = ifelse(dup_obj == 0, NA, conf_obj),
                   can_obj  = ifelse(dup_obj == 0, NA, can_obj))
  cambios <- estado %>%
             filter(duplicate != dup_obj |
                    !identical_na(id_canonico, can_obj))
  for (j in seq_len(nrow(cambios))) {
    fila <- cambios[j, ]
    dbExecute(con, sprintf("UPDATE %s SET duplicate = ?, duplicate_confidence = ?, id_canonico = ? WHERE %s = ?",
                           tabla, llave),
              params = list(fila$dup_obj, fila$conf_obj, fila$can_obj, fila[[llave]]))
    if (fila$dup_obj == 1) {
      dbExecute(con, "INSERT INTO duplicados (tabla, id_registro, id_canonico, criterio, confianza, run_id, timestamp)
                      VALUES (?, ?, ?, ?, ?, ?, ?)",
                params = list(tabla, fila[[llave]], fila$can_obj, criterio, fila$conf_obj, run_id, ahora))
    }
  }
  log_msg(sprintf("dedup %s: %d duplicado(s) vigentes, %d cambio(s) en esta corrida",
                  tabla, sum(estado$dup_obj == 1), nrow(cambios)))
}

## igualdad elemento a elemento tratando NA == NA como verdadero
identical_na <- function(a, b) {
  (is.na(a) & is.na(b)) | (!is.na(a) & !is.na(b) & a == b)
}

##============================================================================##
##=== 1. Personas duplicadas (mismo documento)                             ===##
##============================================================================##

personas <- dbGetQuery(con, "SELECT id_persona, nombre_norm, documento_norm, fecha_actualizacion,
                                    duplicate, id_canonico
                             FROM personas")

## canonico por documento: el de fecha_actualizacion mas reciente
objetivo_per <- personas %>%
                filter(!is.na(documento_norm)) %>%
                group_by(documento_norm) %>%
                filter(n() > 1) %>%
                arrange(desc(fecha_actualizacion), id_persona) %>%
                mutate(canonico        = first(id_persona),
                       nombre_canonico = first(nombre_norm)) %>%
                ungroup() %>%
                filter(id_persona != canonico) %>%
                mutate(similitud = stringsim(nombre_norm, nombre_canonico, method = "jw"))

## nombre muy distinto: posible cedula mal digitada, se deja activa y se avisa
sospechosas <- filter(objetivo_per, similitud < UMBRAL_NOMBRE)
for (j in seq_len(nrow(sospechosas))) {
  log_msg(sprintf("dedup personas: %s comparte documento con %s pero el nombre difiere (sim %.2f); no se marca",
                  sospechosas$id_persona[j], sospechosas$canonico[j], sospechosas$similitud[j]))
}

objetivo_per <- objetivo_per %>%
                filter(similitud >= UMBRAL_NOMBRE) %>%
                transmute(id_persona,
                          dup_obj  = 1,
                          conf_obj = round(similitud, 3),
                          can_obj  = canonico)

aplicar_duplicados("personas", "id_persona", personas, objetivo_per, "documento")

##============================================================================##
##=== 2. Viviendas duplicadas (mismo edificio Y misma unidad)              ===##
##============================================================================##

viviendas <- dbGetQuery(con, "SELECT id_encuesta, direccion_norm, unidad_norm, prop_cc_norm,
                                     fecha_actualizacion, duplicate, id_canonico
                              FROM viviendas")

## el grupo es EDIFICIO + UNIDAD. Agrupar solo por direccion, como se hacia
## antes, marcaba el apartamento 1002 como duplicado del 1001 de la misma torre.
## unidad_norm en NA agrupa con NA: son las casas y los formularios sin
## complemento diligenciado, y por eso ese caso baja de confianza mas abajo.
objetivo_viv <- viviendas %>%
                filter(!is.na(direccion_norm)) %>%
                group_by(direccion_norm, unidad_norm) %>%
                filter(n() > 1) %>%
                arrange(desc(fecha_actualizacion), id_encuesta) %>%
                mutate(canonico    = first(id_encuesta),
                       cc_canonico = first(prop_cc_norm)) %>%
                ungroup() %>%
                filter(id_encuesta != canonico)

## dos propietarios distintos en la misma direccion son dos hogares, no un
## duplicado: la unidad quedo sin diligenciar o mal escrita. Se deja activo y
## se avisa, igual que con las personas de nombre distinto.
distinto_prop <- filter(objetivo_viv, !is.na(prop_cc_norm) & !is.na(cc_canonico) &
                                      prop_cc_norm != cc_canonico)
for (j in seq_len(nrow(distinto_prop))) {
  log_msg(sprintf("dedup viviendas: %s comparte direccion y unidad con %s pero el propietario difiere (%s vs %s); no se marca",
                  distinto_prop$id_encuesta[j], distinto_prop$canonico[j],
                  distinto_prop$prop_cc_norm[j], distinto_prop$cc_canonico[j]))
}

objetivo_viv <- objetivo_viv %>%
                filter(is.na(prop_cc_norm) | is.na(cc_canonico) |
                       prop_cc_norm == cc_canonico) %>%
                transmute(id_encuesta,
                          dup_obj  = 1,
                          conf_obj = case_when(!is.na(prop_cc_norm) & prop_cc_norm == cc_canonico ~ 0.98,
                                               !is.na(unidad_norm)                                ~ 0.92,
                                               T                                                  ~ 0.85),
                          can_obj  = canonico)

aplicar_duplicados("viviendas", "id_encuesta", viviendas, objetivo_viv, "direccion_unidad")

##============================================================================##
##=== 3. Familias duplicadas (mismo id_hogar en dos encuestas)             ===##
##============================================================================##

familias <- dbGetQuery(con, "SELECT id_encuesta, id_hogar, fecha_actualizacion, duplicate, id_canonico
                             FROM familias")

objetivo_fam <- familias %>%
                filter(!is.na(id_hogar)) %>%
                group_by(id_hogar) %>%
                filter(n() > 1) %>%
                arrange(desc(fecha_actualizacion), id_encuesta) %>%
                mutate(canonico = first(id_encuesta)) %>%
                ungroup() %>%
                filter(id_encuesta != canonico) %>%
                transmute(id_encuesta,
                          dup_obj  = 1,
                          conf_obj = 0.95,
                          can_obj  = canonico)

aplicar_duplicados("familias", "id_encuesta", familias, objetivo_fam, "id_hogar")

##============================================================================##
##=== 4. Afectaciones duplicadas (mismo edificio reportado dos veces)      ===##
##============================================================================##

## Aqui la llave es la del edificio SIN unidad, al reves que en viviendas: el
## formulario de afectaciones lo diligencia un organismo de socorro sobre la
## edificacion completa, asi que dos reportes con la misma direccion son dos
## organismos describiendo el mismo inmueble.
## Limitacion conocida: un segundo reporte del mismo edificio por un evento
## POSTERIOR tambien queda marcado. Nada se borra y el duplicado sale en "Casos
## por revisar", asi que se puede deshacer; si llega a pasar seguido, la salida
## es agregar la fecha del evento a la llave.
afectaciones <- dbGetQuery(con, "SELECT id_encuesta, direccion_norm, consecutivo_id,
                                        nombre_edificacion, fecha_actualizacion,
                                        duplicate, id_canonico
                                 FROM afectaciones")

objetivo_afe <- afectaciones %>%
                mutate(nombre_norm = normalizar_texto(nombre_edificacion)) %>%
                filter(!is.na(direccion_norm)) %>%
                group_by(direccion_norm) %>%
                filter(n() > 1) %>%
                arrange(desc(fecha_actualizacion), id_encuesta) %>%
                mutate(canonico        = first(id_encuesta),
                       cons_canonico   = first(consecutivo_id),
                       nombre_canonico = first(nombre_norm)) %>%
                ungroup() %>%
                filter(id_encuesta != canonico) %>%
                transmute(id_encuesta,
                          dup_obj  = 1,
                          ## el consecutivo del CMGRD es el identificador oficial
                          ## del caso: si coincide no hay duda
                          conf_obj = case_when(!is.na(consecutivo_id) & consecutivo_id == cons_canonico ~ 0.99,
                                               nombre_norm != "" & nombre_norm == nombre_canonico       ~ 0.95,
                                               T                                                        ~ 0.88),
                          can_obj  = canonico)

aplicar_duplicados("afectaciones", "id_encuesta", afectaciones, objetivo_afe, "direccion")

## cierre
if (corrida_manual) {
  dbExecute(con, "UPDATE processing_runs SET fin = ?, estado = 'ok' WHERE run_id = ?",
            params = list(format(Sys.time(), "%Y-%m-%dT%H:%M:%S"), run_id))
}
dbDisconnect(con)
