##============================================================================##
# 03_matching.R  —  Matching entre familias y viviendas
#------------------------------------------------------------------------------#
# Asigna a cada familia canonica (duplicate = 0) su vivienda, con esta
# jerarquia sobre viviendas canonicas:
#
#   nivel 0  id_hogar     la app hereda el codigo de hogar entre los dos
#                         formularios -> confianza CONF_HOGAR (1.00)
#   nivel 1  cedula       alguna cedula de las personas de la familia coincide
#                         con alguna de las TRES cedulas del formulario de
#                         vivienda -> CONF_CEDULA (0.95):
#                           viv_prop_cc  propietario
#                           viv_inf_cc   quien suministra la informacion en la visita
#                           viv_nc_cc    afectado que no cumple requisitos
#                         El propietario puede no ser quien habita ni quien
#                         reporta, por eso se buscan las tres.
#   nivel 2  direccion    NO aplica entre estos dos formularios: el formato
#                         EDAN de personas no captura direccion. La llave
#                         direccion_norm queda construida en viviendas para
#                         cruzar la base historica de la Secretaria de
#                         Vivienda y cualquier fuente futura con direccion.
#
# Estados: matched_hogar / matched_cedula / ambiguous / no_match.
# Una familia con varios candidatos del mismo nivel queda ambiguous, sin
# vivienda asignada, para revision manual.
#
# El calculo es idempotente: se recalcula el estado objetivo de todas las
# familias y solo se escriben las que cambian (con auditoria en matches).
##============================================================================##

## configuracion inicial
rm(list = ls())
source("config/packages.R")
source("config/parameters.R")   # RUTA_DB, CONF_HOGAR, CONF_CEDULA
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

##============================================================================##
##=== 1. Insumos: familias y viviendas canonicas, cedulas por familia      ===##
##============================================================================##

familias  <- dbGetQuery(con, "SELECT id_encuesta, id_hogar, match_status, match_method,
                                     match_confidence, id_encuesta_vivienda
                              FROM familias WHERE duplicate = 0")

viviendas <- dbGetQuery(con, "SELECT id_encuesta AS id_encuesta_vivienda, id_hogar,
                                     prop_cc_norm, inf_cc_norm, nc_cc_norm
                              FROM viviendas WHERE duplicate = 0")

cedulas   <- dbGetQuery(con, "SELECT id_encuesta, documento_norm FROM personas
                              WHERE documento_norm IS NOT NULL")

## las tres cedulas de vivienda en formato largo: una fila por cedula disponible
cedulas_viv <- viviendas %>%
               select(id_encuesta_vivienda, prop_cc_norm, inf_cc_norm, nc_cc_norm) %>%
               pivot_longer(cols = c(prop_cc_norm, inf_cc_norm, nc_cc_norm),
                            names_to = "rol", values_to = "cc_norm") %>%
               filter(!is.na(cc_norm)) %>%
               distinct(id_encuesta_vivienda, cc_norm)

##============================================================================##
##=== 2. Estado objetivo por niveles (grano: familia)                      ===##
##============================================================================##

## nivel 0: mismo id_hogar
nivel_hogar <- familias %>%
               select(id_encuesta, id_hogar) %>%
               inner_join(select(viviendas, id_encuesta_vivienda, id_hogar), by = "id_hogar") %>%
               group_by(id_encuesta) %>%
               summarise(n_cand   = n(),
                         vivienda = first(id_encuesta_vivienda),
                         .groups = "drop") %>%
               transmute(id_encuesta,
                         status    = ifelse(n_cand == 1, "matched_hogar", "ambiguous"),
                         method    = "id_hogar",
                         conf      = ifelse(n_cand == 1, CONF_HOGAR, NA),
                         vivienda  = ifelse(n_cand == 1, vivienda, NA))

## nivel 1: cedula de alguna persona de la familia == cedula del propietario
nivel_cedula <- familias %>%
                filter(!id_encuesta %in% nivel_hogar$id_encuesta) %>%
                select(id_encuesta) %>%
                inner_join(cedulas, by = "id_encuesta") %>%
                inner_join(cedulas_viv, by = c("documento_norm" = "cc_norm")) %>%
                distinct(id_encuesta, id_encuesta_vivienda) %>%
                group_by(id_encuesta) %>%
                summarise(n_cand   = n(),
                          vivienda = first(id_encuesta_vivienda),
                          .groups = "drop") %>%
                transmute(id_encuesta,
                          status   = ifelse(n_cand == 1, "matched_cedula", "ambiguous"),
                          method   = "cedula",
                          conf     = ifelse(n_cand == 1, CONF_CEDULA, NA),
                          vivienda = ifelse(n_cand == 1, vivienda, NA))

## resto: sin match
objetivo <- bind_rows(nivel_hogar, nivel_cedula)
objetivo <- familias %>%
            select(id_encuesta) %>%
            left_join(objetivo, by = "id_encuesta") %>%
            mutate(status = ifelse(is.na(status), "no_match", status))

##============================================================================##
##=== 3. Escritura de cambios y auditoria                                  ===##
##============================================================================##

## igualdad tratando NA == NA como verdadero
identical_na <- function(a, b) {
  (is.na(a) & is.na(b)) | (!is.na(a) & !is.na(b) & a == b)
}

cambios <- familias %>%
           inner_join(objetivo, by = "id_encuesta") %>%
           filter(!identical_na(match_status, status) |
                  !identical_na(id_encuesta_vivienda, vivienda))

for (j in seq_len(nrow(cambios))) {
  fila <- cambios[j, ]
  dbExecute(con, "UPDATE familias
                  SET match_status = ?, match_method = ?, match_confidence = ?, id_encuesta_vivienda = ?
                  WHERE id_encuesta = ?",
            params = list(fila$status, fila$method, fila$conf, fila$vivienda, fila$id_encuesta))
  dbExecute(con, "INSERT INTO matches (id_encuesta_familia, id_encuesta_vivienda, match_status,
                                       match_method, match_confidence, run_id, timestamp)
                  VALUES (?, ?, ?, ?, ?, ?, ?)",
            params = list(fila$id_encuesta, fila$vivienda, fila$status, fila$method,
                          fila$conf, run_id, ahora))
  log_msg(sprintf("match %s: %s -> %s%s", fila$id_encuesta,
                  ifelse(is.na(fila$match_status), "(nuevo)", fila$match_status), fila$status,
                  ifelse(is.na(fila$vivienda), "", paste0(" (", fila$vivienda, ")"))))
}

resumen <- objetivo %>% count(status)
log_msg(sprintf("matching: %s | %d cambio(s) en esta corrida",
                paste(sprintf("%s=%d", resumen$status, resumen$n), collapse = " | "),
                nrow(cambios)))

## cierre
if (corrida_manual) {
  dbExecute(con, "UPDATE processing_runs SET fin = ?, estado = 'ok' WHERE run_id = ?",
            params = list(format(Sys.time(), "%Y-%m-%dT%H:%M:%S"), run_id))
}
dbDisconnect(con)
