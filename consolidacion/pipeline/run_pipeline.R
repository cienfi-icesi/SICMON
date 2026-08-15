##============================================================================##
# run_pipeline.R  —  Orquestador de la corrida completa
#------------------------------------------------------------------------------#
# Punto de entrada del sistema de actualizacion automatica (launchd/cron lo
# ejecuta cada 10 minutos desde la raiz del repo):
#
#   Rscript pipeline/run_pipeline.R
#
# Pasos:
#   1. lockfile: si hay una corrida en curso (< LOCK_MAX_MIN minutos) se omite
#   2. abre la corrida en processing_runs
#   3. ejecuta 00_conectar_drive -> 00_conectar_hoja -> 01_ingest -> 02_dedup ->
#      03_matching -> 04_exportar_consulta -> 05_exportar_tablero, cada uno en
#      su propia sesion de R.
#      Los dos pasos 00 son los canales de llegada de datos y NINGUNO detiene
#      la corrida: si Drive o la hoja del Apps Script no responden, o falta su
#      token, se saltan y se sigue con lo que ya haya en CARPETA_INGESTA.
#      Si cualquiera de los demas pasos falla, la corrida queda en 'error'.
#   4. cierra la corrida con el resumen
##============================================================================##

## configuracion inicial
rm(list = ls())
source("config/packages.R")
source("config/parameters.R")   # RUTA_LOCK, LOCK_MAX_MIN, RUTA_DB
source("config/functions.R")    # conectar_db, run_actual, log_msg

##============================================================================##
##=== 1. Lockfile: evitar corridas solapadas                               ===##
##============================================================================##

if (file.exists(RUTA_LOCK)) {
  edad_min <- as.numeric(difftime(Sys.time(), file.mtime(RUTA_LOCK), units = "mins"))
  if (edad_min < LOCK_MAX_MIN) {
    log_msg("hay una corrida en curso; esta se omite")
    quit(status = 0)
  }
  log_msg(sprintf("lockfile huerfano (%.0f min); se elimina", edad_min))
  unlink(RUTA_LOCK)
}
writeLines(as.character(Sys.getpid()), RUTA_LOCK)

##============================================================================##
##=== 2. Apertura de la corrida                                            ===##
##============================================================================##

con <- conectar_db()
invisible(dbExecute(con, "INSERT INTO processing_runs (inicio, estado, mensaje) VALUES (?, 'en_curso', 'corrida programada')",
                    params = list(format(Sys.time(), "%Y-%m-%dT%H:%M:%S"))))
run_id <- run_actual(con)
dbDisconnect(con)
log_msg(sprintf("=== corrida %d iniciada ===", run_id))

##============================================================================##
##=== 3. Ejecucion de los pasos                                            ===##
##============================================================================##

pasos  <- c("pipeline/00_conectar_drive.R", "pipeline/00_conectar_hoja.R", "pipeline/01_ingest.R",
            "pipeline/02_dedup.R", "pipeline/03_matching.R", "pipeline/04_exportar_consulta.R",
            "pipeline/05_exportar_tablero.R")
estado <- "ok"

## ruta completa al Rscript de ESTA instalacion de R, no "Rscript" a secas:
## launchd corre con un PATH minimo que no incluye /usr/local/bin, y cada paso
## moria con codigo 127 ("command not found"). A mano funcionaba —la terminal
## si tiene ese PATH—, asi que el pipeline parecia sano y la corrida automatica
## llevaba dias sin hacer nada. Ademas garantiza que los pasos usen la misma R
## que el orquestador.
rscript <- file.path(R.home("bin"), "Rscript")

for (paso in pasos) {
  codigo <- system2(rscript, paso)
  if (codigo != 0) {
    log_msg(sprintf("ERROR: %s termino con codigo %d; la corrida se detiene", paso, codigo))
    estado <- "error"
    break
  }
}

##============================================================================##
##=== 4. Cierre de la corrida                                              ===##
##============================================================================##

con <- conectar_db()
invisible(dbExecute(con, "UPDATE processing_runs SET fin = ?, estado = ? WHERE run_id = ?",
                    params = list(format(Sys.time(), "%Y-%m-%dT%H:%M:%S"), estado, run_id)))

resumen <- dbGetQuery(con, "SELECT archivos_procesados, reg_insertados, reg_actualizados, reg_sin_cambio
                            FROM processing_runs WHERE run_id = ?", params = list(run_id))
log_msg(sprintf("=== corrida %d terminada (%s): %d archivos | %d insertados | %d actualizados | %d sin cambio ===",
                run_id, estado, resumen$archivos_procesados, resumen$reg_insertados,
                resumen$reg_actualizados, resumen$reg_sin_cambio))
dbDisconnect(con)

unlink(RUTA_LOCK)
if (estado != "ok") quit(status = 1)
