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
#   - viviendas: misma direccion_norm; canonico = mas reciente; confianza 0.98
#                si ademas coincide la cedula del propietario, 0.90 si no.
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
##=== 2. Viviendas duplicadas (misma direccion normalizada)                ===##
##============================================================================##

viviendas <- dbGetQuery(con, "SELECT id_encuesta, direccion_norm, prop_cc_norm, fecha_actualizacion,
                                     duplicate, id_canonico
                              FROM viviendas")

objetivo_viv <- viviendas %>%
                filter(!is.na(direccion_norm)) %>%
                group_by(direccion_norm) %>%
                filter(n() > 1) %>%
                arrange(desc(fecha_actualizacion), id_encuesta) %>%
                mutate(canonico    = first(id_encuesta),
                       cc_canonico = first(prop_cc_norm)) %>%
                ungroup() %>%
                filter(id_encuesta != canonico) %>%
                transmute(id_encuesta,
                          dup_obj  = 1,
                          ## misma direccion y misma cedula del propietario: confianza alta
                          conf_obj = ifelse(!is.na(prop_cc_norm) & !is.na(cc_canonico) &
                                            prop_cc_norm == cc_canonico, 0.98, 0.90),
                          can_obj  = canonico)

aplicar_duplicados("viviendas", "id_encuesta", viviendas, objetivo_viv, "direccion")

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

## cierre
if (corrida_manual) {
  dbExecute(con, "UPDATE processing_runs SET fin = ?, estado = 'ok' WHERE run_id = ?",
            params = list(format(Sys.time(), "%Y-%m-%dT%H:%M:%S"), run_id))
}
dbDisconnect(con)
