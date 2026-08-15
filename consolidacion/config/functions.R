##============================================================================##
# functions.R  —  Funciones transversales del pipeline
#------------------------------------------------------------------------------#
# Solo funciones usadas por dos o mas scripts:
#   - normalizar_texto()   mayusculas, sin tildes, sin dobles espacios
#   - normalizar_cedula()  solo digitos, sin ceros a la izquierda
#   - llave_direccion()    llave canonica del EDIFICIO (via, numero, placa)
#   - llave_unidad()       llave canonica de la UNIDAD dentro del edificio
#   - conectar_db()        conexion SQLite con el esquema aplicado
#   - run_actual()         run_id de la corrida abierta en processing_runs
#   - log_msg()            escribe en consola y en el log del dia
##============================================================================##

## texto en mayusculas, sin tildes ni signos, espacios simples
## un dato ausente sale como cadena vacia, NO como el texto "NA": quien llame
## a esta funcion casi siempre pega el resultado con paste(), y paste() convierte
## un NA en las letras N y A. Asi nacio el peor error que ha tenido el pipeline:
## toda vivienda sin direccion terminaba con la llave "NA NA NA NA NA", las
## cuatro primeras viviendas reales la compartieron y 02_dedup.R marco tres
## como duplicadas de la cuarta, siendo hogares distintos.
normalizar_texto <- function(x) {
  x <- as.character(x)
  x[is.na(x)] <- ""
  x <- stri_trans_general(x, "Latin-ASCII")
  x <- toupper(x)
  x <- gsub("[^A-Z0-9 ]", " ", x)
  x <- gsub(" +", " ", x)
  trimws(x)
}

## cedula: solo digitos y sin ceros a la izquierda; vacia si no queda nada
normalizar_cedula <- function(x) {
  x <- gsub("[^0-9]", "", as.character(x))
  x <- sub("^0+", "", x)
  ifelse(is.na(x) | x == "", NA_character_, x)
}

## llave canonica del EDIFICIO a partir de los componentes de la app
## unifica abreviaturas de tipo de via (CARRERA/CRA/KR -> CR, CALLE/CLL -> CL, ...)
## OJO: identifica la edificacion, NO el hogar. "Cll 18 # 121-159, Apto 1001" y
## "Cll 18 # 121-159, Apto 1002" comparten esta llave a proposito, porque es el
## grano al que reporta el formulario de afectaciones. Para distinguir hogares
## dentro del mismo edificio va llave_unidad().
llave_direccion <- function(tipo_via, numero_via, sufijo_via, numero_generador, placa_inmueble) {
  tipo <- normalizar_texto(tipo_via)
  tipo <- case_when(tipo %in% c("CARRERA", "CRA", "KRA", "KR", "CR")     ~ "CR",
                    tipo %in% c("CALLE", "CLL", "CL", "CLLE")            ~ "CL",
                    tipo %in% c("AVENIDA", "AV", "AVDA")                 ~ "AV",
                    tipo %in% c("DIAGONAL", "DG", "DIAG")                ~ "DG",
                    tipo %in% c("TRANSVERSAL", "TV", "TRANSV", "TRANS")  ~ "TV",
                    tipo %in% c("AUTOPISTA", "AUT", "AUTOP")             ~ "AUT",
                    T                                                    ~ tipo)
  sufijo <- normalizar_texto(sufijo_via)
  sufijo <- case_when(sufijo %in% c("", "NINGUNO", "NA")  ~ "",
                      sufijo %in% c("OESTE", "O", "W")    ~ "O",
                      sufijo %in% c("ESTE", "E")          ~ "E",
                      sufijo %in% c("NORTE", "N")         ~ "N",
                      sufijo %in% c("SUR", "S")           ~ "S",
                      T                                   ~ sufijo)
  llave <- paste(tipo, normalizar_texto(numero_via), sufijo,
                 normalizar_texto(numero_generador), normalizar_texto(placa_inmueble))
  llave <- gsub(" +", " ", trimws(llave))
  ifelse(llave == "", NA_character_, llave)
}

## llave canonica de la UNIDAD dentro del edificio (apartamento, casa, torre)
## Va separada de llave_direccion() a proposito. Si se mezclaran en una sola
## llave, el reporte de afectacion —que es del edificio completo y no trae
## apartamento— nunca cruzaria con las edificaciones del EDAN. Y si no
## existiera, dos apartamentos del mismo edificio compartirian llave y 02_dedup
## marcaria uno como duplicado del otro, siendo hogares distintos.
llave_unidad <- function(tipo_unidad, numero_unidad, torre_bloque) {
  llave <- paste(normalizar_texto(tipo_unidad), normalizar_texto(numero_unidad),
                 normalizar_texto(torre_bloque))
  llave <- gsub(" +", " ", trimws(llave))
  ifelse(llave == "", NA_character_, llave)
}

## conexion a la base oficial; aplica el esquema si la base es nueva
conectar_db <- function() {
  con <- dbConnect(SQLite(), RUTA_DB)
  sentencias <- readLines("db/schema.sql")
  sentencias <- paste(sentencias[!grepl("^--", sentencias)], collapse = "\n")
  sentencias <- strsplit(sentencias, ";")[[1]]
  sentencias <- sentencias[trimws(sentencias) != ""]

  ## las tablas primero y los indices de ultimo, con la migracion de columnas en
  ## medio: un indice nuevo puede nombrar una columna que en una base ya creada
  ## todavia no existe (paso con idx_viv_unidad)
  indices <- grepl("CREATE INDEX", sentencias)
  for (s in sentencias[!indices]) dbExecute(con, s)

  ## columnas agregadas al esquema despues de que la base ya existia:
  ## CREATE TABLE IF NOT EXISTS no toca una tabla ya creada y SQLite no tiene
  ## ADD COLUMN IF NOT EXISTS, asi que se revisan una a una. Sin esto habria
  ## que borrar y reconstruir la base en cada cambio de esquema.
  nuevas <- list(c("viviendas", "unidad_norm", "TEXT"))
  for (n in nuevas) {
    columnas <- dbGetQuery(con, sprintf("PRAGMA table_info(%s)", n[1]))$name
    if (!n[2] %in% columnas) {
      dbExecute(con, sprintf("ALTER TABLE %s ADD COLUMN %s %s", n[1], n[2], n[3]))
    }
  }

  for (s in sentencias[indices]) dbExecute(con, s)
  con
}

## run_id de la corrida abierta (la crea run_pipeline.R)
run_actual <- function(con) {
  run <- dbGetQuery(con, "SELECT MAX(run_id) AS run_id FROM processing_runs WHERE estado = 'en_curso'")
  run$run_id[1]
}

## mensaje con hora en consola y en logs/pipeline_YYYYMMDD.log
log_msg <- function(texto) {
  linea <- sprintf("[%s] %s", format(Sys.time(), "%Y-%m-%d %H:%M:%S"), texto)
  cat(linea, "\n")
  archivo <- file.path(CARPETA_LOGS, sprintf("pipeline_%s.log", format(Sys.Date(), "%Y%m%d")))
  cat(linea, "\n", file = archivo, append = T)
}
