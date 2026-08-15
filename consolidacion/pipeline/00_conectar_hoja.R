##============================================================================##
# 00_conectar_hoja.R  —  Descarga de las tablas desde la hoja del Apps Script
#------------------------------------------------------------------------------#
# El aplicativo EDAN manda cada encuesta finalizada a la hoja de calculo
# "registro_afectados" del Drive de CIENFI. Este paso le pide a ese mismo Apps
# Script las tablas completas (accion "exportar_tabla") y las deja en
# CARPETA_INGESTA como CSV. De ahi en adelante 01_ingest.R no sabe ni le importa
# de donde salieron: los lee con su deteccion de cambios por hash, igual que
# cualquier otro archivo.
#
# Escribe un CSV por tabla de TABLAS_HOJA:
#   - viviendas_hoja.csv  (grano: formulario de vivienda)
#   - personas_hoja.csv   (grano: persona)
# Siempre con el mismo nombre, sobrescribiendo: la version vigente de la hoja
# es la que vale. Si el contenido no cambio, el hash es el mismo y 01_ingest.R
# ni lo mira. Si una tabla viene vacia, su CSV se retira.
#
# Autenticacion: NINGUNA credencial de Google. Se manda el token general (el de
# config-sync.js, que no es secreto) y el token de extraccion, que si lo es y
# vive solo en RUTA_TOKEN_HOJA, fuera de git. Ver README, seccion "Conexion a
# la hoja del Apps Script".
#
# Como 00_conectar_drive.R, este paso NUNCA tumba la corrida: si falta el token,
# si Google no responde o si la implementacion publicada todavia no trae la
# extraccion, se avisa en el log y el pipeline sigue con lo que ya haya en
# CARPETA_INGESTA.
##============================================================================##

## configuracion inicial
rm(list = ls())
source("config/packages.R")
source("config/parameters.R")   # CONECTAR_HOJA, URL_HOJA, TOKEN_HOJA, TABLAS_HOJA, CARPETA_INGESTA
source("config/functions.R")    # log_msg, token_exportacion

if (!CONECTAR_HOJA) {
  log_msg("hoja: conexion desactivada (CONECTAR_HOJA = FALSE); se omite")
  quit(status = 0)
}

dir.create(CARPETA_INGESTA, showWarnings = F, recursive = T)

resultado <- tryCatch({

  token_extraccion <- token_exportacion()

  ##============================================================================##
  ##=== 1. Una peticion al receptor                                          ===##
  ##============================================================================##

  ## se usa para las tres acciones (ping, inventario y cada pagina de datos)
  ## el cuerpo va como text/plain aunque sea JSON: las Web App de Apps Script no
  ## atienden peticiones que disparen la verificacion previa del navegador, y el
  ## receptor lo parsea igual
  pedir_hoja <- function(cuerpo) {
    cuerpo$token             <- TOKEN_HOJA
    cuerpo$token_exportacion <- token_extraccion
    respuesta <- POST(URL_HOJA,
                      body = toJSON(cuerpo, auto_unbox = T),
                      content_type("text/plain"),
                      timeout(TIEMPO_LIMITE_HOJA))
    datos <- fromJSON(content(respuesta, as = "text", encoding = "UTF-8"))
    if (!isTRUE(datos$ok)) {
      stop(sprintf("el receptor respondio '%s' (accion %s)", datos$error, cuerpo$accion))
    }
    datos
  }

  ##============================================================================##
  ##=== 2. Comprobacion e inventario                                         ===##
  ##============================================================================##

  ## el ping trae la version del Codigo.gs realmente publicado en /exec. Pegar
  ## el codigo en el editor no basta: hasta que no se implementa una version
  ## nueva, la direccion sigue sirviendo la anterior y la extraccion no existe
  ping <- pedir_hoja(list(accion = "ping"))
  log_msg(sprintf("hoja: receptor version %s, hora del servidor %s", ping$version, ping$hora_servidor))

  inventario <- pedir_hoja(list(accion = "inventario"))$tablas
  log_msg(sprintf("hoja: %s", paste(sprintf("%s=%s", inventario$tabla, inventario$filas), collapse = " | ")))

  ##============================================================================##
  ##=== 3. Descarga de cada tabla, pagina por pagina                         ===##
  ##============================================================================##

  ## una tabla completa: se piden paginas hasta que hay_mas venga en falso
  descargar_tabla <- function(tabla) {
    paginas <- list()
    desde   <- 1
    repeat {
      pagina <- pedir_hoja(list(accion = "exportar_tabla", tabla = tabla,
                                desde = desde, limite = FILAS_POR_PAGINA_HOJA))
      if (pagina$devueltas > 0) {
        trozo        <- as.data.frame(pagina$filas, stringsAsFactors = F)
        names(trozo) <- pagina$encabezados
        paginas[[length(paginas) + 1]] <- trozo
      }
      if (!isTRUE(pagina$hay_mas)) break
      desde <- desde + pagina$devueltas
    }
    if (length(paginas) == 0) return(NULL)
    bind_rows(paginas)
  }

  n_tablas <- 0
  for (tabla in TABLAS_HOJA) {
    ruta  <- file.path(CARPETA_INGESTA, sprintf("%s_hoja.csv", tabla))
    datos <- descargar_tabla(tabla)

    ## la hoja RESPONDIO y la tabla esta vacia de verdad (distinto de "Google no
    ## contesto", que cae en el error de abajo y no llega aqui). Si alguien
    ## limpio la hoja, el CSV viejo no puede quedarse: 01_ingest.R lo volveria
    ## a leer y la base seguiria mostrando registros que ya no existen
    if (is.null(datos)) {
      if (file.exists(ruta)) unlink(ruta)
      log_msg(sprintf("hoja: %s viene vacia; se retira %s", tabla, basename(ruta)))
      next
    }

    export(datos, ruta)
    n_tablas <- n_tablas + 1
    log_msg(sprintf("hoja: %s -> %s (%d filas, %d columnas)",
                    tabla, basename(ruta), nrow(datos), ncol(datos)))
  }

  log_msg(sprintf("hoja: %d de %d tabla(s) descargada(s)", n_tablas, length(TABLAS_HOJA)))
  "ok"

}, error = function(e) {
  log_msg(sprintf("hoja: %s — se omite este paso y se sigue con lo que ya hay en %s",
                  conditionMessage(e), CARPETA_INGESTA))
  "omitido"
})
