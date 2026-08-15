##============================================================================##
# parameters.R  —  Rutas y parametros del pipeline
##============================================================================##

## ---- De donde sale cada valor -----------------------------------------------
## Cada parametro configurable se lee primero del ENTORNO y, si no esta, toma el
## valor escrito aqui abajo. En la maquina del equipo no hay ninguna variable
## definida, asi que todo funciona exactamente como antes. En GitHub Actions el
## workflow las define desde los secrets del repositorio y ninguna credencial
## necesita existir como archivo.
##
## Ningun secreto tiene valor por defecto en este archivo: el token de
## extraccion se resuelve en functions.R (token_exportacion) y solo puede venir
## del entorno o de un archivo fuera de git.
env_texto <- function(nombre, defecto) {
  valor <- Sys.getenv(nombre, unset = "")
  if (valor == "") defecto else valor
}

## "1", "true", "TRUE", "si" -> TRUE ; "0", "false", "no" -> FALSE
## Vacia o sin definir devuelve el defecto, que es lo que pasa en local.
env_logico <- function(nombre, defecto) {
  valor <- toupper(trimws(Sys.getenv(nombre, unset = "")))
  if (valor == "") return(defecto)
  valor %in% c("1", "TRUE", "T", "SI", "SÍ", "YES", "Y")
}

##============================================================================##
##=== MODO SIMULADO                                                        ===##
##============================================================================##
##
##   SICMON_SIMULADO=1 Rscript pipeline/run_pipeline.R
##
## Con el interruptor encendido, TODO el pipeline trabaja contra datos
## inventados: entra por data/pruebas, consolida en base_simulada.sqlite y los
## dos canales de Google quedan apagados, de modo que no puede llegar ni salir
## un registro real. La consulta y el tablero se alimentan de ahi.
##
## POR QUE UN INTERRUPTOR Y NO CUATRO EDICIONES A MANO
## Hasta ahora este archivo explicaba como hacerlo cambiando cuatro lineas y
## deshaciendolas despues. Basta olvidar una: si se cambia la carpeta de entrada
## pero no la base, los datos inventados entran a la base oficial. Ya paso —la
## consulta termino mostrando 48 edificaciones que no existen y hubo que
## reconstruir la base—. Con una sola variable, o esta todo en simulado o no
## esta nada.
##
## Cada valor sigue siendo sobreescribible por su propia variable de entorno:
## el modo solo cambia el valor POR OMISION.
MODO_SIMULADO <- env_logico("SICMON_SIMULADO", FALSE)

## rutas principales (relativas a la raiz del repo)
##
## La ingesta vigila data/entrada, que SOLO llenan los dos pasos 00 con lo que
## baja de Google Drive y de la hoja del Apps Script: es el canal real y nada
## mas. Los datos ficticios de synthetic/ van a data/pruebas.
CARPETA_PRUEBAS <- "data/pruebas"   ## aqui escriben los generadores de synthetic/
CARPETA_INGESTA <- env_texto("SICMON_CARPETA_INGESTA",
                             if (MODO_SIMULADO) CARPETA_PRUEBAS else "data/entrada")
RUTA_DB         <- env_texto("SICMON_RUTA_DB",
                             if (MODO_SIMULADO) "data/db/base_simulada.sqlite"
                             else               "data/db/base_oficial.sqlite")
CARPETA_LOGS     <- env_texto("SICMON_CARPETA_LOGS", "logs")
## el lock vive junto a la base y no en una ruta fija: asi una corrida de prueba
## contra otra base (SICMON_RUTA_DB apuntando a un temporal) no se bloquea contra
## la corrida real ni al reves
RUTA_LOCK        <- file.path(dirname(RUTA_DB), "pipeline.lock")

## ---- Google Drive: carpeta real donde caen los Excel (carpeta "data" dentro
## de "Registro_afectados_sismo") ----
## Autenticacion la hace CADA PERSONA una sola vez, de forma interactiva (ver
## README, seccion "Conexion a Google Drive"); el token queda en CARPETA_CACHE_DRIVE
## y de ahi en adelante corre solo, incluida la corrida automatica cada 10 min.
## Si no hay token todavia, 00_conectar_drive.R lo avisa en el log y se salta
## sin detener el resto del pipeline.
##
## EN GITHUB ACTIONS VA APAGADO. Ese token es de OAuth de usuario y solo se
## obtiene abriendo un navegador, cosa que un runner no puede hacer; dejarlo
## encendido no rompe nada (el paso se salta con un aviso) pero ensucia el log
## de cada corrida con un error que no es tal. El canal real es la hoja del
## Apps Script, que no necesita credencial de Google. Ver README, "Automatizacion".
## En modo simulado va apagado: el canal real no debe abrirse cuando se esta
## trabajando con datos inventados, o los dos terminan en la misma base.
CONECTAR_DRIVE    <- env_logico("SICMON_CONECTAR_DRIVE", !MODO_SIMULADO)
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
## apagado en modo simulado, por lo mismo que CONECTAR_DRIVE
CONECTAR_HOJA <- env_logico("SICMON_CONECTAR_HOJA", !MODO_SIMULADO)
## Una sola implementacion publicada para todo. Si se publica un deploy nuevo,
## la direccion cambia y hay que actualizarla en TRES lugares a la vez:
##   1. aqui                                 (el pipeline: baja y publica)
##   2. ../modules/edan/js/config-sync.js    (los celulares en campo: escriben)
##   3. ../modules/consulta/js/config-consulta.js  (la consulta: lee)
## Si alguno queda con la direccion vieja, sigue hablando con la implementacion
## anterior sin dar error: responde bien, solo que a la version de antes.
URL_HOJA      <- env_texto("SICMON_URL_HOJA",
                           "https://script.google.com/macros/s/AKfycbwwJQIDHiG0n2x8nbMvpxJsiqDvFGvRzqhMRkbkz29wFoDNgbFfdiIhkGzBBUEn4xCaeg/exec")
TOKEN_HOJA    <- env_texto("SICMON_TOKEN_HOJA", "sismo_2026_01234567891011121314")
                                                     ## el general; el mismo de ../modules/edan/js/config-sync.js
                                                     ## no es un secreto: viaja al navegador de quien abra la app
## el token de EXTRACCION si es secreto. NUNCA se escribe aqui: lo resuelve
## token_exportacion() en config/functions.R, que lo busca primero en la
## variable de entorno SICMON_TOKEN_EXPORTACION (asi llega desde los secrets en
## GitHub Actions, sin tocar el disco) y si no, en este archivo, que esta fuera
## de git y solo existe en la maquina del equipo.
RUTA_TOKEN_HOJA <- env_texto("SICMON_RUTA_TOKEN_HOJA", ".secrets/token_exportacion.txt")

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
##
## EN MODO SIMULADO SIGUE ENCENDIDO, a proposito. Es lo que hace que el
## aplicativo de consulta muestre la base simulada: el aplicativo no lee ningun
## archivo del repositorio, le pide los datos a la hoja, asi que la unica forma
## de que vea lo simulado es publicarlo ahi. Lo que sube son personas
## inventadas, de modo que no hay nada que proteger.
PUBLICAR_HOJA <- env_logico("SICMON_PUBLICAR_HOJA", TRUE)
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
CARPETA_SALIDA <- env_texto("SICMON_CARPETA_SALIDA", "data/salida")

## ---- Tablero de control ----
## El volcado del tablero NO lleva cedula ni nombre, pero si lleva estado de
## salud, coordenadas y direccion de vivienda, fila por fila (el tablero agrega
## en el navegador). Es decir: es un dato personal, aunque sin identificador
## directo.
##
## Por eso el destino por omision esta FUERA del repositorio publicado. Antes
## era "../modules/tablero", que es una carpeta que GitHub Pages sirve: el
## archivo quedaba a un `git add` de distancia de ser publico, y de hecho lo
## fue. Con el destino aqui, el repositorio no puede publicarlo aunque alguien
## se equivoque.
##
## Para verlo en local se levanta el modulo con el volcado al lado:
##   Rscript -e 'file.copy("data/salida/tablero/js/datos_tablero.js",
##                         "../modules/tablero/js/", overwrite = TRUE)'
## o, para la corrida completa, SICMON_CARPETA_TABLERO=../modules/tablero. En
## los dos casos ese archivo esta en .gitignore y no debe subirse.
##
## Publicar el tablero exigiria antes un volcado AGREGADO (conteos por comuna,
## piramide poblacional) sin filas individuales ni coordenadas, y autorizacion
## de la Alcaldia. Ver README, "Que es publico y que es privado".
##
## EN MODO SIMULADO el destino SI es la carpeta del modulo, porque ahi es donde
## el tablero lee y es lo que hace que se vea con volumen al abrirlo. No hay
## nada que proteger: son personas inventadas, y el volcado sale marcado con
## simulado = true para que nadie lo confunda con la operacion real.
CARPETA_TABLERO  <- env_texto("SICMON_CARPETA_TABLERO",
                              if (MODO_SIMULADO) "../modules/tablero"
                              else               "data/salida/tablero")

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
