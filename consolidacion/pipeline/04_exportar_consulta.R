##============================================================================##
# 04_exportar_consulta.R  —  Copia local de la base consolidada
#------------------------------------------------------------------------------#
# Vuelca la base oficial a CARPETA_SALIDA, como copia de trabajo del equipo:
#   - data/salida/js/datos.js                  window.DATOS = {...}
#   - data/salida/descargas/base_consulta.xlsx descarga completa (4 hojas + cruce)
#
# ESTO YA NO ALIMENTA AL APLICATIVO PUBLICADO. Antes escribia dentro de
# modules/consulta y la pagina leia ese datos.js como archivo estatico, lo que
# obligaba a hacer un commit para actualizar el sitio y ponia cedulas,
# direcciones y estado de salud en un repositorio publico. Hoy el aplicativo
# pide los datos por fetch al Apps Script y quien los sube es 06_publicar_hoja.R.
# Este paso se queda por la comodidad de tener el Excel a mano, y su carpeta
# esta fuera del repositorio (.gitignore).
#
# window.DATOS contiene:
#   personas    grano persona (con su familia, su match y su vivienda)
#   familias    grano formulario de afectaciones (EDAN personas/familia)
#   viviendas   grano edificacion
#   afectaciones grano reporte del organismo de socorro (edificacion completa)
#   cruce       parejas afectacion <-> edificacion sugeridas por direccion
#   fichas      respuestas COMPLETAS de cada encuesta (ultima version cruda),
#               para que la consulta muestre todas las preguntas del formulario
#   diccionario etiquetas: variable -> pregunta y seccion (libro de codigos)
#   revisar / duplicados / actualizado
#
##============================================================================##

## configuracion inicial
rm(list = ls())
source("config/packages.R")
source("config/parameters.R")   # RUTA_DB
source("config/functions.R")    # conectar_db, log_msg

con <- conectar_db()

## carpeta local de trabajo; se crea sola si no existe
dir.create(file.path(CARPETA_SALIDA, "js"),        showWarnings = F, recursive = T)
dir.create(file.path(CARPETA_SALIDA, "descargas"), showWarnings = F, recursive = T)

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

## reporte_afectacion sale de una subconsulta y no de un JOIN: con un JOIN, una
## edificacion con dos reportes duplicaria la fila de la edificacion
viviendas <- dbGetQuery(con, "
  SELECT v.id_encuesta, v.id_hogar, v.prop_nombre, v.prop_cc, v.prop_cc_norm,
         v.inf_nombre, v.inf_cc, v.inf_cc_norm,
         v.cumple_requisitos, v.requiere_evacuacion, v.sistema_constructivo,
         v.tipo_inmueble, v.direccion_completa, v.latitud, v.longitud,
         v.ubicacion_confirmada, v.duplicate, v.id_canonico,
         v.fecha_actualizacion, v.archivo_origen, v.last_update,
         (SELECT GROUP_CONCAT(c.id_encuesta_afectacion, ' | ')
          FROM cruce_direccion c
          WHERE c.id_encuesta_vivienda = v.id_encuesta
            AND c.estado <> 'descartado') AS reporte_afectacion
  FROM viviendas v")

## reportes de afectacion: grano evento/edificacion. Entidad independiente (no
## se enlaza de forma dura con hogares ni personas), pero con el cruce sugerido
## por direccion que produce 03_matching.R; ver el comentario en db/schema.sql
afectaciones <- dbGetQuery(con, "
  SELECT a.id_encuesta, a.consecutivo_id, a.nombre_edificacion, a.barrio, a.comuna,
         a.direccion_completa, a.latitud, a.longitud,
         a.descripcion, a.colapso, a.requieren_evacuacion,
         a.fallecidos, a.atrapadas, a.necesitan_evacuar,
         a.tipo_edificacion, a.cantidad_viviendas, a.observaciones,
         a.fotos_cantidad, a.fotos_nombres, a.fotos_enlaces,
         a.diligencia_nombre, a.organismo, a.grupo_voluntarios,
         a.secretaria, a.fecha, a.fecha_actualizacion, a.duplicate, a.id_canonico,
         a.archivo_origen, a.last_update,
         (SELECT COUNT(*) FROM cruce_direccion c
          WHERE c.id_encuesta_afectacion = a.id_encuesta
            AND c.estado <> 'descartado') AS edificaciones_edan
  FROM afectaciones a")

## cruce sugerido, con los datos de las dos puntas para poder pintarlo en la
## ficha sin que el navegador tenga que hacer el join
cruce <- dbGetQuery(con, "
  SELECT c.id_encuesta_afectacion, c.id_encuesta_vivienda, c.direccion_norm,
         c.confianza, c.n_viviendas, c.estado,
         v.direccion_completa, v.prop_nombre, v.id_hogar, v.cumple_requisitos,
         a.nombre_edificacion, a.consecutivo_id, a.colapso, a.organismo
  FROM cruce_direccion c
  LEFT JOIN viviendas    v ON v.id_encuesta = c.id_encuesta_vivienda
  LEFT JOIN afectaciones a ON a.id_encuesta = c.id_encuesta_afectacion
  WHERE c.estado <> 'descartado'")

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

datos <- list(actualizado  = actualizado,
              personas     = personas,
              familias     = familias,
              viviendas    = viviendas,
              afectaciones = afectaciones,
              cruce        = cruce,
              fichas       = fichas,
              diccionario  = diccionario,
              revisar      = revisar,
              duplicados   = duplicados)

## export data (window.DATOS para que funcione con file://)
writeLines(paste0("window.DATOS = ", toJSON(datos, auto_unbox = T, na = "null"), ";"),
           file.path(CARPETA_SALIDA, "js/datos.js"), useBytes = T)
## OJO: "hogares" es el formulario EDAN de personas/familia; "afectaciones" es
## el reporte por evento. Antes la hoja de hogares se rotulaba "afectaciones",
## que ahora seria confuso porque ya existe una tabla con ese nombre.
export(list(personas      = personas,
            hogares       = familias,
            edificaciones = viviendas,
            afectaciones  = afectaciones,
            cruce         = cruce),
       file.path(CARPETA_SALIDA, "descargas/base_consulta.xlsx"))

log_msg(sprintf("consulta: %d personas, %d hogares, %d edificaciones, %d afectaciones, %d cruce(s), %d fichas -> %s",
                nrow(personas), nrow(familias), nrow(viviendas), nrow(afectaciones),
                nrow(cruce), length(fichas), CARPETA_SALIDA))
dbDisconnect(con)
