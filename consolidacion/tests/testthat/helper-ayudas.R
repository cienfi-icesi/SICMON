##============================================================================##
# helper-ayudas.R  —  Utilidades comunes a las pruebas
#------------------------------------------------------------------------------#
# El prefijo "helper-" no es decorativo: testthat carga ANTES de cada corrida los
# archivos que empiezan asi, y solo esos. Con otro nombre, las funciones de aqui
# no existirian cuando los test-*.R las llaman.
##============================================================================##

## testthat corre con el directorio de trabajo en tests/testthat/, y lo RESTAURA
## al empezar cada archivo. El pipeline, en cambio, esta escrito con todas sus
## rutas relativas a consolidacion/ ("config/parameters.R", "db/schema.sql",
## "data/pruebas/...") y las pruebas lo invocan tal cual.
##
## Por eso cada test-*.R se ubica al principio, con ubicarse_en_raiz() o con
## cargar_configuracion(), que la llama. Ponerlo una sola vez aqui no sirve:
## testthat lo deshace en el archivo siguiente.
RAIZ <- normalizePath(file.path(dirname(dirname(getwd()))))
if (!file.exists(file.path(RAIZ, "config/parameters.R"))) {
  stop("no se encontro consolidacion/ desde ", getwd())
}

ubicarse_en_raiz <- function() {
  if (!identical(normalizePath(getwd()), RAIZ)) setwd(RAIZ)
  invisible(RAIZ)
}

## la raiz del repositorio, un nivel arriba. git check-ignore y git ls-files
## quieren rutas relativas a ESA carpeta, no a consolidacion/
RAIZ_GIT <- tryCatch(
  system2("git", c("rev-parse", "--show-toplevel"), stdout = TRUE, stderr = FALSE)[1],
  error = function(e) NA_character_)

## git <subcomando> ejecutado desde la raiz del repositorio
git_en_raiz <- function(argumentos, ...) {
  system2("git", c("-C", shQuote(RAIZ_GIT), argumentos), ...)
}

## el token de extraccion, de donde lo tome el pipeline. NULL si no hay ninguno
## disponible, que es la senal para saltarse una prueba de red
token_de_pruebas <- function() {
  del_entorno <- trimws(Sys.getenv("SICMON_TOKEN_EXPORTACION", unset = ""))
  if (nzchar(del_entorno)) return(del_entorno)
  ruta <- ".secrets/token_exportacion.txt"
  if (!file.exists(ruta)) return(NULL)
  valor <- trimws(readLines(ruta, warn = FALSE)[1])
  if (nzchar(valor)) valor else NULL
}

## las pruebas de red solo corren con --red Y con token: son lentas, dependen de
## que Google responda y consumen cuota del Apps Script
saltar_si_no_hay_red <- function() {
  testthat::skip_if(!nzchar(Sys.getenv("SICMON_PRUEBAS_RED")),
                    "prueba de red; use  Rscript tests/correr_pruebas.R --red")
  testthat::skip_if(is.null(token_de_pruebas()),
                    "no hay token de extraccion en esta maquina")
}

## una peticion al Apps Script, igual a la que hace el pipeline
pedir_al_receptor <- function(cuerpo, con_token_exportacion = TRUE) {
  suppressMessages({ library(httr); library(jsonlite) })
  cuerpo$token <- TOKEN_HOJA
  if (con_token_exportacion) cuerpo$token_exportacion <- token_de_pruebas()
  respuesta <- POST(URL_HOJA,
                    body = toJSON(cuerpo, auto_unbox = TRUE),
                    content_type("text/plain"),
                    timeout(TIEMPO_LIMITE_HOJA))
  fromJSON(content(respuesta, as = "text", encoding = "UTF-8"))
}

## carga la configuracion del pipeline sin ejecutar ningun paso
cargar_configuracion <- function() {
  ubicarse_en_raiz()
  suppressMessages(source("config/packages.R"))
  source("config/parameters.R")
  source("config/functions.R")
}

## un banco de pruebas aislado: carpeta temporal con su base, su carpeta de
## ingesta y sus logs, y los tres canales de Google apagados. Devuelve el vector
## de variables de entorno listo para system2().
##
## Lo importante es que RUTA_DB apunte al temporal: sin eso una prueba escribiria
## en data/db/base_oficial.sqlite, que es la base real de la operacion.
entorno_aislado <- function(carpeta) {
  dir.create(file.path(carpeta, "entrada"), showWarnings = FALSE, recursive = TRUE)
  dir.create(file.path(carpeta, "db"),      showWarnings = FALSE, recursive = TRUE)
  c(sprintf("SICMON_RUTA_DB=%s",          file.path(carpeta, "db/prueba.sqlite")),
    sprintf("SICMON_CARPETA_INGESTA=%s",  file.path(carpeta, "entrada")),
    sprintf("SICMON_CARPETA_LOGS=%s",     file.path(carpeta, "logs")),
    sprintf("SICMON_CARPETA_SALIDA=%s",   file.path(carpeta, "salida")),
    sprintf("SICMON_CARPETA_TABLERO=%s",  file.path(carpeta, "tablero")),
    "SICMON_CONECTAR_DRIVE=false",
    "SICMON_CONECTAR_HOJA=false",
    "SICMON_PUBLICAR_HOJA=false")
}

## corre el pipeline completo en un entorno aislado; devuelve el codigo de salida
correr_pipeline <- function(carpeta) {
  rscript <- file.path(R.home("bin"), "Rscript")
  system2(rscript, "pipeline/run_pipeline.R",
          env = entorno_aislado(carpeta),
          stdout = FALSE, stderr = FALSE)
}

## conteos de las tablas consolidadas de una base
conteos <- function(ruta_db) {
  suppressMessages({ library(DBI); library(RSQLite) })
  con <- dbConnect(SQLite(), ruta_db)
  on.exit(dbDisconnect(con))
  tablas <- c("personas", "viviendas", "familias", "afectaciones", "duplicados", "processing_runs")
  vapply(tablas, function(t) {
    tryCatch(dbGetQuery(con, sprintf("SELECT COUNT(*) AS n FROM %s", t))$n, error = function(e) NA_integer_)
  }, integer(1))
}
