##============================================================================##
# parameters.R  —  Rutas y parametros del pipeline
##============================================================================##

## rutas principales (relativas a la raiz del repo)
##
## La ingesta vigila data/entrada, que SOLO llenan los dos pasos 00 con lo que
## baja de Google Drive y de la hoja del Apps Script: es el canal real y nada
## mas. Los datos ficticios de synthetic/ van a data/pruebas, que el pipeline
## no mira. Las dos carpetas no se mezclan nunca: ya paso una vez, la consulta
## termino mostrando 48 edificaciones inventadas y toco reconstruir la base.
##
## Para trabajar un rato con la base simulada (ver el tablero con volumen):
##   CARPETA_INGESTA <- CARPETA_PRUEBAS
##   RUTA_DB         <- "data/db/base_simulada.sqlite"
##   CONECTAR_DRIVE  <- FALSE ; CONECTAR_HOJA <- FALSE
## y correr el pipeline. Para volver, deshacer esas lineas y correr otra vez.
CARPETA_INGESTA <- "data/entrada"
CARPETA_PRUEBAS <- "data/pruebas"   ## aqui escriben los generadores de synthetic/
RUTA_DB          <- "data/db/base_oficial.sqlite"
CARPETA_LOGS     <- "logs"
RUTA_LOCK        <- "data/db/pipeline.lock"

## ---- Google Drive: carpeta real donde caen los Excel (carpeta "data" dentro
## de "Registro_afectados_sismo") ----
## Autenticacion la hace CADA PERSONA una sola vez, de forma interactiva (ver
## README, seccion "Conexion a Google Drive"); el token queda en CARPETA_CACHE_DRIVE
## y de ahi en adelante corre solo, incluida la corrida automatica cada 10 min.
## Si no hay token todavia, 00_conectar_drive.R lo avisa en el log y se salta
## sin detener el resto del pipeline.
CONECTAR_DRIVE    <- TRUE
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
CONECTAR_HOJA <- TRUE
## Una sola implementacion publicada para todo. Si se publica un deploy nuevo,
## la direccion cambia y hay que actualizarla en TRES lugares a la vez:
##   1. aqui                                 (el pipeline: baja y publica)
##   2. ../modules/edan/js/config-sync.js    (los celulares en campo: escriben)
##   3. ../modules/consulta/js/config-consulta.js  (la consulta: lee)
## Si alguno queda con la direccion vieja, sigue hablando con la implementacion
## anterior sin dar error: responde bien, solo que a la version de antes.
URL_HOJA      <- "https://script.google.com/macros/s/AKfycbwHuGE5olZBzOskJoQh0bBo0YqcVSvEiIA0Vhbw1UrW_2bFJqEruqgAUsJG8patB5etxA/exec"
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
TABLAS_HOJA           <- c("viviendas", "afectaciones", "personas")
FILAS_POR_PAGINA_HOJA <- 500   ## debe ser <= FILAS_POR_PAGINA_MAX del Apps Script
TIEMPO_LIMITE_HOJA    <- 120   ## segundos que se espera una pagina antes de darla por fallida

## ---- Publicacion del consolidado en la hoja (06_publicar_hoja.R) ----
## El mismo canal, en sentido contrario: el pipeline devuelve a la hoja la base
## ya consolidada, en las pestañas c_*, y de ahi la lee el aplicativo de
## consulta por fetch. Es lo que permite que el sitio publicado se actualice sin
## un commit y, sobre todo, que el repositorio no lleve datos personales.
PUBLICAR_HOJA <- TRUE
## peso maximo de cada pagina de envio, en caracteres del JSON. 300 KB deja
## margen de sobra frente al limite de Apps Script y evita que la ejecucion se
## alargue tanto que Google cierre la conexion, que es como fallan estas cosas.
BYTES_POR_PAGINA_PUBLICAR <- 300000
## Publicar es reemplazar. Con esto en FALSE, 06_publicar_hoja.R se niega a
## dejar la hoja vacia si alli ya hay registros publicados: una base vieja
## sirve, una borrada no. Poner en TRUE solo para vaciar a proposito.
FORZAR_PUBLICACION_VACIA <- FALSE

## salida local del consolidado: copia de trabajo para el equipo (un Excel con
## las cuatro bases y el datos.js de respaldo).
##
## OJO: esta carpeta esta FUERA del repositorio publicado a proposito. Antes
## este pipeline escribia js/datos.js dentro de modules/consulta y el aplicativo
## lo leia como archivo estatico; eso publicaba cedulas, direcciones y estado de
## salud en un repositorio publico. Hoy el aplicativo pide los datos por fetch
## al Apps Script (ver 06_publicar_hoja.R) y aqui solo queda la copia local.
CARPETA_SALIDA <- "data/salida"

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
