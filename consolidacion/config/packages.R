##============================================================================##
# packages.R  —  Librerias del proyecto
##============================================================================##

## Locale UTF-8, ANTES de cargar nada.
## Rscript arranca con locale "C" cuando lo lanza launchd o un cron, y con ese
## locale rio::import() no lee los acentos: convierte cada byte no-ASCII en el
## TEXTO literal "<c3><ad>", de modo que "Sí" entra a la base como "S<c3><ad>".
## No es cosmetico: rompe las categorias (los conteos por "18-59 años" salian
## en cero en el tablero) y contamina todo lo que se exporte despues.
for (loc in c("es_CO.UTF-8", "es_ES.UTF-8", "en_US.UTF-8", "C.UTF-8")) {
  if (Sys.setlocale("LC_CTYPE", loc) != "") break
}
options(encoding = "UTF-8")

library(dplyr)
library(tidyr)
library(rio)
library(data.table)
library(DBI)
library(RSQLite)
library(digest)
library(jsonlite)
library(stringi)
library(stringdist)
library(googledrive)
library(httr)
