##============================================================================##
# 04_exportar_consulta.R  —  Datos para el aplicativo de consulta
#------------------------------------------------------------------------------#
# Ultimo paso de cada corrida: vuelca la base oficial a los archivos que lee
# el modulo de consulta del portal SICMON (CARPETA_CONSULTA, en el repositorio
# web_damage_cali):
#   - <modulo>/js/datos.js                    window.DATOS = {...}
#   - <modulo>/descargas/base_consulta.xlsx   descarga completa (3 hojas)
#
# window.DATOS contiene:
#   personas    grano persona (con su familia, su match y su vivienda)
#   familias    grano formulario de afectaciones (EDAN personas/familia)
#   viviendas   grano edificacion
#   fichas      respuestas COMPLETAS de cada encuesta (ultima version cruda),
#               para que la consulta muestre todas las preguntas del formulario
#   diccionario etiquetas: variable -> pregunta y seccion (libro de codigos)
#   revisar / duplicados / actualizado
#
# El aplicativo funciona con doble clic (file://): por eso los datos van como
# archivo .js y no como JSON via fetch, que el navegador bloquearia.
##============================================================================##

## configuracion inicial
rm(list = ls())
source("config/packages.R")
source("config/parameters.R")   # RUTA_DB
source("config/functions.R")    # conectar_db, log_msg

con <- conectar_db()

## el aplicativo vive en el portal (web_damage_cali/modules/consulta)
if (!dir.exists(CARPETA_CONSULTA)) {
  stop(sprintf("no existe la carpeta del modulo de consulta: %s", CARPETA_CONSULTA))
}
dir.create(file.path(CARPETA_CONSULTA, "js"),        showWarnings = F, recursive = T)
dir.create(file.path(CARPETA_CONSULTA, "descargas"), showWarnings = F, recursive = T)

##============================================================================##
##=== 1. Personas (grano: persona, con su familia y su vivienda)           ===##
##============================================================================##

personas <- dbGetQuery(con, "
  SELECT p.documento_norm                    AS documento,
         p.nombres || ' ' || p.apellidos     AS nombre,
         p.edad, p.genero, p.parentesco, p.etnia,
         p.estado_salud, p.afiliacion_salud,
         p.estado_inmueble, p.propiedad_inmueble, p.ubicacion_inmueble,
         p.ahe_alimentaria, p.ahe_no_alimentaria,
         p.mat_rehab_vivienda, p.sub_arriendo,
         p.id_persona, p.id_encuesta, p.id_hogar,
         p.duplicate                         AS persona_duplicada,
         f.match_status, f.match_confidence, f.secretaria,
         v.direccion_completa, v.cumple_requisitos, v.requiere_evacuacion,
         v.sistema_constructivo,
         v.id_encuesta                       AS id_encuesta_vivienda,
         p.archivo_origen, p.last_update
  FROM personas p
  LEFT JOIN familias  f ON f.id_encuesta = p.id_encuesta
  LEFT JOIN viviendas v ON v.id_encuesta = f.id_encuesta_vivienda")

##============================================================================##
##=== 2. Afectaciones (grano: formulario de familia) y edificaciones       ===##
##============================================================================##

familias <- dbGetQuery(con, "
  SELECT f.id_encuesta, f.id_hogar, f.n_personas, f.secretaria,
         f.match_status, f.match_method, f.match_confidence,
         f.id_encuesta_vivienda, f.duplicate, f.id_canonico,
         f.fecha_actualizacion, f.archivo_origen, f.last_update,
         v.direccion_completa
  FROM familias f
  LEFT JOIN viviendas v ON v.id_encuesta = f.id_encuesta_vivienda")

viviendas <- dbGetQuery(con, "
  SELECT id_encuesta, id_hogar, prop_nombre, prop_cc, prop_cc_norm,
         inf_nombre, inf_cc, inf_cc_norm,
         cumple_requisitos, requiere_evacuacion, sistema_constructivo,
         tipo_inmueble, direccion_completa, latitud, longitud,
         ubicacion_confirmada, duplicate, id_canonico,
         fecha_actualizacion, archivo_origen, last_update
  FROM viviendas")

revisar <- dbGetQuery(con, "
  SELECT id_encuesta, id_hogar, n_personas, match_status, secretaria, archivo_origen
  FROM familias
  WHERE duplicate = 0 AND match_status IN ('no_match', 'ambiguous')
  ORDER BY match_status")

duplicados <- dbGetQuery(con, "
  SELECT tabla, id_registro, id_canonico, criterio, confianza, timestamp
  FROM duplicados ORDER BY timestamp DESC")

## momento del volcado (la corrida actual sigue abierta cuando corre este paso)
actualizado <- format(Sys.time(), "%Y-%m-%dT%H:%M:%S")

##============================================================================##
##=== 3. Fichas completas: ultima version cruda de cada registro           ===##
##============================================================================##

## ultima version del payload por registro (viviendas: encuesta; personas: persona)
crudos <- dbGetQuery(con, "
  SELECT r.id_registro, r.tabla_origen, r.payload
  FROM raw_records r
  JOIN (SELECT id_registro, MAX(raw_id) AS raw_id
        FROM raw_records GROUP BY id_registro) u
    ON u.raw_id = r.raw_id")

fichas <- list()
for (i in seq_len(nrow(crudos))) {
  fila <- fromJSON(crudos$payload[i])
  ## solo campos con dato; fuera columnas derivadas (_num, _nums, indicadores 0/1)
  fila <- fila[!grepl("_num$|_nums$|__", names(fila))]
  fila <- fila[!sapply(fila, function(v) is.null(v) || is.na(v) || v == "")]
  fichas[[crudos$id_registro[i]]] <- fila
}

## libro de codigos: etiqueta y seccion de cada variable
diccionario <- fread("synthetic/insumos/diccionario_variables.csv", encoding = "UTF-8") %>%
               as.data.frame() %>%
               distinct(variable, .keep_all = T) %>%
               select(variable, codigo_pregunta, pregunta, seccion_numero,
                      seccion_titulo, formulario)

##============================================================================##
##=== 4. Export                                                            ===##
##============================================================================##

datos <- list(actualizado = actualizado,
              personas    = personas,
              familias    = familias,
              viviendas   = viviendas,
              fichas      = fichas,
              diccionario = diccionario,
              revisar     = revisar,
              duplicados  = duplicados)

## export data (window.DATOS para que funcione con file://)
writeLines(paste0("window.DATOS = ", toJSON(datos, auto_unbox = T, na = "null"), ";"),
           file.path(CARPETA_CONSULTA, "js/datos.js"), useBytes = T)
export(list(personas = personas, afectaciones = familias, edificaciones = viviendas),
       file.path(CARPETA_CONSULTA, "descargas/base_consulta.xlsx"))

log_msg(sprintf("consulta: %d personas, %d afectaciones, %d edificaciones, %d fichas -> %s",
                nrow(personas), nrow(familias), nrow(viviendas), length(fichas),
                CARPETA_CONSULTA))
dbDisconnect(con)
