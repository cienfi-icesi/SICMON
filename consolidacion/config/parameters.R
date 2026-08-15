##============================================================================##
# parameters.R  —  Rutas y parametros del pipeline
##============================================================================##

## rutas principales (relativas a la raiz del repo)
##
## HOY EL SISTEMA CORRE CON LA BASE SIMULADA. Mientras la operacion arranca
## (la hoja de Google solo trae 4 viviendas de prueba), la base, la consulta
## y el tablero se alimentan de los datos ficticios de data/pruebas. La base
## real no se toca: queda congelada en data/db/base_oficial.sqlite, con sus
## dos canales de llegada (Drive y hoja) apagados mas abajo.
##
## Para pasar a la base real el dia que haya datos de verdad, dejar:
##   CARPETA_INGESTA <- "data/entrada"
##   RUTA_DB         <- "data/db/base_oficial.sqlite"
##   CONECTAR_HOJA   <- TRUE     (y CONECTAR_DRIVE si se usa ese canal)
## y correr el pipeline: la consulta y el tablero se regeneran solos.
##
## Las dos carpetas no se mezclan nunca: data/entrada es del canal real (la
## llenan los pasos 00) y data/pruebas es de los generadores de synthetic/.
## Mezclarlas en una misma base ya paso una vez y toco reconstruirla.
CARPETA_INGESTA <- "data/pruebas"
CARPETA_PRUEBAS <- "data/pruebas"   ## aqui escriben los generadores de synthetic/
RUTA_DB          <- "data/db/base_simulada.sqlite"
CARPETA_LOGS     <- "logs"
RUTA_LOCK        <- "data/db/pipeline.lock"

## ---- Google Drive: carpeta real donde caen los Excel (carpeta "data" dentro
## de "Registro_afectados_sismo") ----
## Autenticacion la hace CADA PERSONA una sola vez, de forma interactiva (ver
## README, seccion "Conexion a Google Drive"); el token queda en CARPETA_CACHE_DRIVE
## y de ahi en adelante corre solo, incluida la corrida automatica cada 10 min.
## Si no hay token todavia, 00_conectar_drive.R lo avisa en el log y se salta
## sin detener el resto del pipeline.
CONECTAR_DRIVE    <- FALSE   ## apagado mientras se trabaja con la base simulada (ver arriba)
ID_CARPETA_DRIVE  <- "1j5eT5lfjiv6LPxog3elwxL-QPr8pT-4v"   ## carpeta "Registro_afectados_sismo"
SUBCARPETA_DRIVE  <- "data"
CARPETA_CACHE_DRIVE <- ".secrets"   ## aqui queda el token; NUNCA se sube al repo (.gitignore)

## ---- Hoja de Google del Apps Script: el canal directo, sin archivos ----
## El aplicativo EDAN manda cada encuesta finalizada a la hoja "registro_afectados"
## a traves de un Apps Script (../modules/edan/apps-script/Codigo.gs). Con la
## accion "exportar_tabla" ese mismo script entrega las tablas completas, y
## 00_conectar_hoja.R las deja en CARPETA_INGESTA como CSV. A diferencia del
## canal de Drive, aqui nadie tiene que descargar ni subir nada a mano.
## Ver README, seccion "Conexion a la hoja del Apps Script".
CONECTAR_HOJA <- FALSE   ## apagado mientras se trabaja con la base simulada (ver arriba)
## OJO: esta NO es la misma direccion que usa la app para escribir. El proyecto
## de Apps Script tiene dos implementaciones publicadas:
##   - la original (AKfycbwBKU_ZW...), que es a la que le escriben los celulares
##     en campo y esta en ../modules/edan/js/config-sync.js
##   - esta, mas nueva, que es la unica que trae la extraccion de tablas
## Las dos van a la misma hoja, asi que funciona; pero si algun dia se actualiza
## el Codigo.gs hay que republicar LAS DOS o consolidar en una sola.
URL_HOJA      <- "https://script.google.com/macros/s/AKfycbzm82Z5rJTbtdOLI-dBONWaUhuV0zhg8-zLnfvgD70LFT6k07qLcfOo7ytYzojisg9cRQ/exec"
TOKEN_HOJA    <- "sismo_2026_01234567891011121314"   ## el general; el mismo de ../modules/edan/js/config-sync.js
                                                     ## no es un secreto: viaja al navegador de quien abra la app
## el token de EXTRACCION si es secreto y por eso vive en un archivo aparte,
## fuera de git: una sola linea con la misma cadena de la propiedad
## TOKEN_EXPORTACION del script de Google
RUTA_TOKEN_HOJA <- ".secrets/token_exportacion.txt"

## solo las tablas que consume 01_ingest.R.
## personas_hogares NO se baja a proposito: su nombre empieza por "personas" y
## 01_ingest.R lo leeria como el archivo persona a persona, que tiene otro grano
## (una fila por hogar, sin per_nombres ni documento). Lo que trae se deriva
## solo de la tabla personas.
TABLAS_HOJA           <- c("viviendas", "personas")
FILAS_POR_PAGINA_HOJA <- 500   ## debe ser <= FILAS_POR_PAGINA_MAX del Apps Script
TIEMPO_LIMITE_HOJA    <- 120   ## segundos que se espera una pagina antes de darla por fallida

## modulo de consulta del portal SICMON: el aplicativo vive en este mismo
## repositorio y este pipeline le regenera js/datos.js y descargas/ en cada corrida
CARPETA_CONSULTA <- "../modules/consulta"

## tablero de control: tambien vive en este repositorio, como un modulo mas del
## portal. Este pipeline le regenera js/datos_tablero.js en cada corrida
CARPETA_TABLERO  <- "../modules/tablero"

## confianza asignada a cada nivel de matching
CONF_HOGAR     <- 1.00
CONF_CEDULA    <- 0.95
CONF_DIRECCION <- 0.85

## umbral de similitud de nombre (jaro-winkler) para confirmar duplicados por documento
UMBRAL_NOMBRE <- 0.80

## minutos tras los cuales un lockfile se considera huerfano
LOCK_MAX_MIN <- 30

## zona horaria de la operacion
Sys.setenv(TZ = "America/Bogota")
