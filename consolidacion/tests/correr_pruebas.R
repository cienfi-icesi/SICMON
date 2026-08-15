##============================================================================##
# correr_pruebas.R  —  Punto de entrada de las pruebas
#------------------------------------------------------------------------------#
# Desde consolidacion/ :
#
#   Rscript tests/correr_pruebas.R          las que no necesitan red
#   Rscript tests/correr_pruebas.R --red    ademas las que hablan con Google
#
# Las de red exigen el token de extraccion (SICMON_TOKEN_EXPORTACION o
# .secrets/token_exportacion.txt) y, para la puerta del equipo, la contrasena en
# SICMON_TOKEN_LECTURA. Sin eso se saltan con un aviso en vez de fallar: que un
# portatil sin credenciales no pueda correr las pruebas seria una molestia, no
# una senal de que algo esta mal.
#
# NINGUNA prueba escribe en la base oficial ni publica en la hoja. Las que tocan
# el pipeline lo corren contra una base temporal (SICMON_RUTA_DB) y con los tres
# canales de Google apagados; las de red solo LEEN.
##============================================================================##

suppressMessages(library(testthat))

## las pruebas asumen consolidacion/ como directorio de trabajo, igual que el
## pipeline: todas las rutas del proyecto son relativas a ahi
if (!file.exists("config/parameters.R")) {
  stop("Corra las pruebas desde consolidacion/ :  Rscript tests/correr_pruebas.R")
}

Sys.setenv(SICMON_PRUEBAS_RED = if ("--red" %in% commandArgs(TRUE)) "1" else "")

cat("\n=== Pruebas del pipeline SICMON ===\n")
cat("pruebas de red:", if (nzchar(Sys.getenv("SICMON_PRUEBAS_RED"))) "SI" else "no (use --red)", "\n\n")

## stop_on_failure = FALSE para que corran TODAS y el resumen del final diga
## cuantas fallaron; con TRUE, la primera que falle esconde a las demas
resultado <- test_dir("tests/testthat", reporter = "summary", stop_on_failure = FALSE)

df <- as.data.frame(resultado)
cat("\n")
if (sum(df$failed) > 0 || sum(df$error) > 0) {
  cat(sprintf("FALLARON %d prueba(s) y hubo %d error(es).\n", sum(df$failed), sum(df$error)))
  quit(status = 1)
}
cat(sprintf("Todo bien: %d prueba(s) pasada(s), %d omitida(s).\n", sum(df$passed), sum(df$skipped)))
