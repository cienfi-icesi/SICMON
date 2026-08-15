##============================================================================##
# 05_exportar_tablero.R  —  Datos para el tablero de control
#------------------------------------------------------------------------------#
# Vuelca la base oficial a los archivos que lee el tablero estatico
# (CARPETA_TABLERO en config/parameters.R, hoy data/salida/tablero — FUERA del
# repositorio publicado; el modulo del portal es HTML+CSS+JS, sin servidor):
#   - <CARPETA_TABLERO>/js/datos_tablero.js   window.TABLERO = {...}
#       personas   (grano: persona canonica, sin identificadores directos;
#                   conserva id_encuesta de la familia para poder contar
#                   hogares una vez aplicados los filtros del tablero)
#       viviendas  (grano: vivienda canonica, con coordenadas)
#       danio      (grano: vivienda x elemento estructural)
#       revisar    (grano: familia sin vivienda asociada o con match ambiguo)
#       duplicados (grano: registro marcado como repetido)
#
# El tablero agrega y filtra en el navegador: por eso el volcado es a nivel de
# fila y no de tabla agregada. No lleva cedula ni nombre, pero si lleva estado
# de salud, coordenadas y direccion de vivienda: es dato personal sin
# identificador directo, no un agregado.
#
# USO INTERNO. Por eso el destino ya NO es ../modules/tablero: esa carpeta la
# sirve GitHub Pages y el archivo quedaba a un `git add` de ser publico. Para
# publicar el tablero habria que generar antes un volcado agregado (conteos, sin
# filas ni coordenadas) y contar con autorizacion de la Alcaldia.
##============================================================================##

## configuracion inicial
rm(list = ls())
source("config/packages.R")
source("config/parameters.R")   # RUTA_DB, CARPETA_TABLERO
source("config/functions.R")    # conectar_db, log_msg

## la carpeta se crea si no esta: el destino por omision (data/salida/tablero)
## vive fuera del repositorio y por tanto no existe en un clon nuevo. Antes esto
## era un stop() porque el destino era ../modules/tablero, una carpeta que
## siempre existia; si faltaba, era senal de que la ruta estaba mal configurada
dir.create(CARPETA_TABLERO, showWarnings = F, recursive = T)

con <- conectar_db()
out <- file.path(CARPETA_TABLERO, "js")
dir.create(out, showWarnings = F, recursive = T)

##============================================================================##
##=== 1. Fecha de la encuesta  (grano: encuesta)                           ===##
##============================================================================##

## encuestas.fecha solo queda diligenciada para el formulario de vivienda: en el
## de personas la ingestion no la lleva a la tabla consolidada. El dato si esta
## en el payload, asi que se lee de ahi para los dos formularios y la serie del
## tablero usa la fecha del trabajo de campo y no la de ultima actualizacion.
raw_viv <- dbGetQuery(con, "
  SELECT r.payload
  FROM raw_records r
  JOIN viviendas v ON v.id_encuesta = r.id_registro AND v.hash_fila = r.hash_fila
  WHERE r.tabla_origen = 'viviendas' AND v.duplicate = 0")

raw_per <- dbGetQuery(con, "
  SELECT r.payload
  FROM raw_records r
  JOIN personas p ON p.id_persona = r.id_registro AND p.hash_fila = r.hash_fila
  WHERE r.tabla_origen = 'personas' AND p.duplicate = 0")

## un solo fromJSON sobre el arreglo completo devuelve ya un data.frame.
## con la base en cero el arreglo es "[]" y fromJSON devuelve una lista vacia,
## sobre la que select() no sabe operar: en ese caso se arma a mano el data
## frame vacio con las dos columnas que usan los pasos de abajo
payload_json <- function(payload) {
  if (length(payload) == 0) return(data.frame(id_encuesta = character(0), fecha = character(0)))
  fromJSON(paste0("[", paste(payload, collapse = ","), "]"))
}

payload_viv <- payload_json(raw_viv$payload)
payload_per <- payload_json(raw_per$payload)

fecha_encuesta <- bind_rows(payload_viv %>% select(id_encuesta, fecha),
                            payload_per %>% select(id_encuesta, fecha)) %>%
                  filter(!is.na(fecha), fecha != "") %>%
                  distinct(id_encuesta, .keep_all = T)

## clean
rm(raw_viv, raw_per, payload_per)

##============================================================================##
##=== 2. Personas  (grano: persona canonica, sin identificadores)          ===##
##============================================================================##

personas_base <- dbGetQuery(con, "
  SELECT p.id_encuesta, p.edad, p.genero, p.parentesco, p.etnia,
         p.estado_salud, p.afiliacion_salud,
         p.estado_inmueble, p.propiedad_inmueble, p.ubicacion_inmueble,
         p.ahe_alimentaria, p.ahe_no_alimentaria,
         p.mat_rehab_vivienda, p.sub_arriendo,
         f.secretaria, f.match_status,
         v.latitud, v.longitud
  FROM personas p
  LEFT JOIN familias  f ON f.id_encuesta = p.id_encuesta
  LEFT JOIN viviendas v ON v.id_encuesta = f.id_encuesta_vivienda
  WHERE p.duplicate = 0")

## etiquetas quinquenales de la piramide poblacional
rangos <- c("0-4",   "5-9",   "10-14", "15-19", "20-24", "25-29",
            "30-34", "35-39", "40-44", "45-49", "50-54", "55-59",
            "60-64", "65-69", "70-74", "75-79", "80+")

personas <- personas_base %>%
            left_join(fecha_encuesta, by = "id_encuesta") %>%
            mutate(across(c(genero, parentesco, etnia, estado_salud, afiliacion_salud,
                            estado_inmueble, propiedad_inmueble, ubicacion_inmueble),
                          ~ sub("^[^\u00b7]+\u00b7 ", "", .))) %>%   ## la base guarda "1 · Etiqueta"
            mutate(rango_edad   = cut(edad, breaks = c(seq(0, 80, 5), Inf),
                                      labels = rangos, right = F),
                   grupo_etario = case_when(edad <= 5  ~ "0-5 años",
                                            edad <= 17 ~ "6-17 años",
                                            edad <= 59 ~ "18-59 años",
                                            edad >= 60 ~ "60 años o más")) %>%
            select(-edad) %>%
            as.data.table()

## clean
rm(personas_base)

##============================================================================##
##=== 3. Viviendas  (grano: vivienda canonica)                             ===##
##============================================================================##

viviendas <- dbGetQuery(con, "
  SELECT v.id_encuesta, v.sistema_constructivo, v.tipo_inmueble, v.tipo_evento,
         v.cumple_requisitos, v.requiere_evacuacion,
         v.latitud, v.longitud, v.ubicacion_confirmada,
         e.secretaria
  FROM viviendas v
  LEFT JOIN encuestas e ON e.id_encuesta = v.id_encuesta
  WHERE v.duplicate = 0") %>%
             left_join(fecha_encuesta, by = "id_encuesta") %>%
             mutate(across(c(sistema_constructivo, tipo_inmueble, tipo_evento,
                             cumple_requisitos, requiere_evacuacion),
                           ~ sub("^[^\u00b7]+\u00b7 ", "", .))) %>%
             as.data.table()

##============================================================================##
##=== 4. Nivel de dano  (grano: vivienda x elemento estructural)           ===##
##============================================================================##

## los niveles de dano no estan en la tabla consolidada: se leen del payload.
## con la base en cero el payload no trae ninguna columna _nivel_etiqueta y
## pivot_longer no tiene nada que alargar, asi que se agrega vacia a mano
if (!any(grepl("_nivel_etiqueta$", names(payload_viv)))) {
  payload_viv$viv_mam_cubierta_nivel_etiqueta <- character(nrow(payload_viv))
}

danio <- payload_viv %>%
         select(id_encuesta, ends_with("_nivel_etiqueta")) %>%
         pivot_longer(-id_encuesta, names_to = "elemento", values_to = "nivel") %>%
         filter(!is.na(nivel), nivel != "") %>%
         mutate(sistema  = case_when(grepl("^viv_mam_", elemento) ~ "Mampostería",
                                     grepl("^viv_mad_", elemento) ~ "Madera"),
                elemento = sub("^viv_(mam|mad)_", "", elemento),
                elemento = sub("_nivel_etiqueta$", "", elemento)) %>%
         mutate(elemento = case_when(elemento == "vigas_columnas"   ~ "Vigas y columnas",
                                     elemento == "muros_carga"      ~ "Muros de carga",
                                     elemento == "muros_divisorios" ~ "Muros divisorios",
                                     elemento == "muros_madera"     ~ "Muros en madera",
                                     elemento == "placa_piso"       ~ "Placa de piso",
                                     elemento == "entrepisos"       ~ "Entrepisos",
                                     elemento == "cubierta"         ~ "Cubierta",
                                     elemento == "hidrosanitarias"  ~ "Instalaciones hidrosanitarias",
                                     elemento == "electricas"       ~ "Instalaciones eléctricas")) %>%
         as.data.table()

## clean
rm(payload_viv)

##============================================================================##
##=== 5. Casos por revisar  (grano: caso pendiente)                        ===##
##============================================================================##

## familias que no quedaron enlazadas con una ficha de vivienda, o que tienen
## mas de una candidata: hay que resolverlas antes de asignar una ayuda
revisar <- dbGetQuery(con, "
  SELECT id_encuesta, id_hogar, n_personas, match_status,
         secretaria, archivo_origen
  FROM familias
  WHERE duplicate = 0 AND match_status IN ('no_match', 'ambiguous')") %>%
           left_join(fecha_encuesta, by = "id_encuesta") %>%
           as.data.table()

## registros repetidos, con la direccion y las coordenadas de la vivienda
## cuando aplica: son el dato con el que una brigada lo verifica en terreno
duplicados <- dbGetQuery(con, "
  SELECT d.tabla, d.id_registro, d.id_canonico, d.criterio, d.confianza,
         d.timestamp,
         v.direccion_completa  AS direccion_repetida,
         c.direccion_completa  AS direccion_conservada,
         v.latitud, v.longitud
  FROM duplicados d
  LEFT JOIN viviendas v ON v.id_encuesta = d.id_registro
  LEFT JOIN viviendas c ON c.id_encuesta = d.id_canonico
  ORDER BY d.confianza") %>%
              as.data.table()

##============================================================================##
##=== 5b. Afectaciones  (grano: reporte de un organismo sobre una           ===##
##===      edificacion completa)                                           ===##
##============================================================================##

## OJO: grano distinto al de viviendas. Aqui una fila no es un hogar ni una
## vivienda, sino UN REPORTE que un organismo de socorro hizo sobre una
## edificacion entera: cuantas viviendas tiene, cuantas personas quedaron
## atrapadas, si colapso. Sumar sus conteos con los de personas seria contar dos
## veces, y por eso el tablero los muestra en su propia pestaña y nunca los
## mezcla con los indicadores de hogares.
##
## Los conteos de fallecidos, atrapadas y necesitan_evacuar son DECLARADOS en el
## reporte, no personas identificadas: no hay forma de saber si el mismo
## fallecido aparece en dos reportes del mismo edificio.
##
## No lleva descripcion ni observaciones: son texto libre donde el diligenciador
## a veces escribe nombres, y este volcado alimenta un tablero sin identidades.
afectaciones <- dbGetQuery(con, "
  SELECT id_encuesta, barrio, comuna, latitud, longitud,
         colapso, requieren_evacuacion,
         fallecidos, atrapadas, necesitan_evacuar,
         tipo_edificacion, cantidad_viviendas,
         organismo, fotos_cantidad, fecha
  FROM afectaciones
  WHERE duplicate = 0") %>%
                mutate(across(c(colapso, requieren_evacuacion, tipo_edificacion),
                              ~ sub("^[^·]+· ", "", .))) %>%
                as.data.table()

corrida <- dbGetQuery(con, "
  SELECT fin FROM processing_runs WHERE estado = 'ok' ORDER BY run_id DESC LIMIT 1")

##============================================================================##
##=== 6. Export                                                            ===##
##============================================================================##

## los grupos etarios, los sistemas constructivos y los nombres de elemento se
## arman con literales escritos aqui arriba ("18-59 años", "Mampostería"). El
## sistema corre en locale C, asi que esos literales llegan con la codificacion
## sin declarar y toJSON() los serializa como "a<c3><b1>os". Los bytes ya son
## UTF-8; solo falta decirlo, y hay que hacerlo antes de serializar
for (tabla in c("personas", "viviendas", "danio", "revisar", "duplicados", "afectaciones")) {
  d <- get(tabla)
  for (col in names(d)) {
    if (is.character(d[[col]])) Encoding(d[[col]]) <- "UTF-8"
  }
  assign(tabla, d)
}

## la marca viaja CON los datos y no en la configuracion del tablero: asi no
## puede desincronizarse. Un archivo de datos simulados dice que lo es, se
## copie a donde se copie, y el tablero pinta el aviso en pantalla
datos <- list(actualizado  = ifelse(nrow(corrida) == 0, "", corrida$fin[1]),
              simulado     = MODO_SIMULADO,
              personas     = personas,
              viviendas    = viviendas,
              danio        = danio,
              revisar      = revisar,
              duplicados   = duplicados,
              afectaciones = afectaciones)

## export data (window.TABLERO para que el tablero funcione con file://)
writeLines(paste0("window.TABLERO = ", toJSON(datos, auto_unbox = T, na = "null"), ";"),
           file.path(out, "datos_tablero.js"), useBytes = T)

log_msg(sprintf("tablero: %d personas, %d viviendas, %d afectaciones, %d casos por revisar",
                nrow(personas), nrow(viviendas), nrow(afectaciones),
                nrow(revisar) + nrow(duplicados)))
dbDisconnect(con)
