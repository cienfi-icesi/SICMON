##============================================================================##
# 01_generar_jornada1.R  —  Datos sinteticos: jornada 1
#------------------------------------------------------------------------------#
# Escribe en data/pruebas los archivos de la primera jornada con la
# estructura EXACTA de los exportes reales de la app (221 columnas en
# viviendas, 60 en personas), expandida desde synthetic/insumos/:
#   - viviendas_gestion_riesgo_20260813_0800.xlsx  (grano: formulario de vivienda)
#   - viviendas_vivienda_20260813.xlsx             (grano: formulario de vivienda)
#   - personas_gestion_riesgo_20260813_0800.xlsx   (grano: persona)
#   - personas_vivienda_20260813.xlsx              (grano: persona)
#
# Escenarios que deja montados:
#   - familia A y vivienda A comparten id_hogar            -> matched_hogar
#   - familia B (otro id_hogar) con cedula del propietario -> matched_cedula
#   - familia I con la cedula de QUIEN ATENDIO la visita   -> matched_cedula
#     (la vivienda C no tiene cedula de propietario: sin
#      la cedula del informante nunca haria match)
#   - familia D sin vivienda relacionada                   -> no_match
#   - viviendas C y C2: misma direccion escrita distinto   -> duplicado por direccion
#   - Ana Perez aparece en familias A y F                  -> duplicado de persona
#   - familia F con cedula de vivienda E                   -> matched_cedula
#     (en jornada 2 aparece otra vivienda con esa cedula   -> pasa a ambiguous)
#
# Los valores de las preguntas de opcion unica son los VALORES CANONICOS del
# diccionario (p. ej. per_estado_salud = "2", no "Sano"); la expansion llena
# solas las columnas _num y _etiqueta.
##============================================================================##

## configuracion inicial
rm(list = ls())
source("config/packages.R")
source("config/parameters.R")             # CARPETA_PRUEBAS
source("synthetic/00_expandir_plantilla.R")

## path
## datos ficticios: van a la carpeta de pruebas, NUNCA a la que vigila
## 01_ingest.R, para que no se mezclen con lo que llega de la hoja
out <- CARPETA_PRUEBAS
dir.create(out, showWarnings = F, recursive = T)

## plantillas reales y libro de codigos
plantilla_viv <- as.data.frame(fread("synthetic/insumos/plantilla_viviendas.csv", encoding = "UTF-8", nrows = 1))
plantilla_per <- as.data.frame(fread("synthetic/insumos/plantilla_personas.csv",  encoding = "UTF-8", nrows = 1))
diccionario   <- as.data.frame(fread("synthetic/insumos/diccionario_variables.csv", encoding = "UTF-8"))

##============================================================================##
##=== 1. Viviendas (grano: formulario de vivienda)                         ===##
##============================================================================##

## equipo gestion del riesgo
viv_riesgo <- tibble(id_encuesta         = c("VIV-J1-A", "VIV-J1-B", "VIV-J1-C"),
                     tipo_formulario     = "vivienda",
                     id_hogar            = c("HOG-A", "HOG-B1", "HOG-C1"),
                     secretaria          = "gestion_riesgo",
                     secretaria_nombre   = "Secretaría de Gestión del Riesgo",
                     usuario             = "gabriela",
                     usuario_nombre      = "Gabriela",
                     rol                 = "diligenciador",
                     estado              = "finalizada",
                     fecha               = "2026-08-13",
                     hora                = "07:30:00",
                     fecha_actualizacion = "2026-08-13T07:30:00",
                     viv_prop_nombres_apellidos = c("Juan Perez", "Marta Gomez", "Rosa Diaz"),
                     viv_prop_cc         = c("1000001", "1.000.002", ""),
                     viv_prop_telefono   = c("3110000001", "3110000002", "3110000003"),
                     ## quien atendio la visita; en VIV-J1-C es la unica cedula disponible
                     viv_inf_nombre      = c("Juan Perez", "Marta Gomez", "Sofia Diaz"),
                     viv_inf_cc          = c("1000001", "1000002", "1000011"),
                     viv_inf_telefono    = c("3110000001", "3110000002", "3110000011"),
                     viv_prof_organismo  = "Secretaría de Gestión del Riesgo",
                     viv_fecha_evaluacion = "2026-08-13",
                     viv_departamento    = "Valle del Cauca",
                     viv_municipio       = "Santiago de Cali",
                     viv_cumple_requisitos   = c("si", "si", "no"),
                     viv_requiere_evacuacion = c("no", "no", "si"),
                     tipo_via            = c("Cra", "Calle", "Carrera"),
                     numero_via          = c("85", "5", "22"),
                     sufijo_via          = c("Ninguno", "Ninguno", "Oeste"),
                     numero_generador    = c("12", "38", "10"),
                     placa_inmueble      = c("35", "104", "20"),
                     tipo_inmueble       = "Casa",
                     direccion_completa  = c("Cra 85 # 12-35, Casa",
                                             "Calle 5 # 38-104, Casa",
                                             "Carrera 22 Oeste # 10-20, Casa"),
                     latitud             = c(3.3980, 3.4210, 3.4405),
                     longitud            = c(-76.5400, -76.5210, -76.5330),
                     sistema_coordenadas = "EPSG:4326",
                     fuente_georreferenciacion = "GPS",
                     ubicacion_confirmada = "Sí",
                     viv_tipo_evento     = "sismo",
                     viv_sistema_constructivo = c("mamposteria", "mamposteria", "mamposteria"),
                     ## inspeccion (seccion 5): dano en vigas y columnas
                     viv_mam_vigas_columnas_afectado = c("si", "si", "si"),
                     viv_mam_vigas_columnas_nivel    = c("moderado", "leve", "severo"),
                     viv_mam_muros_carga_afectado    = c("si", "no", "si"),
                     viv_mam_muros_carga_nivel       = c("leve", NA, "severo"),
                     viv_mam_cubierta_afectado       = c("no", "no", "si"),
                     viv_mam_cubierta_nivel          = c(NA, NA, "severo"))

## equipo secretaria de vivienda (este archivo se sobreescribe en jornada 2)
## VIV-J1-C2 repite la direccion de VIV-J1-C con otra grafia (KRA 22 O)
viv_vivienda <- tibble(id_encuesta         = c("VIV-J1-C2", "VIV-J1-E"),
                       tipo_formulario     = "vivienda",
                       id_hogar            = c("HOG-C2", "HOG-E"),
                       secretaria          = "vivienda",
                       secretaria_nombre   = "Secretaría de Vivienda",
                       usuario             = "laura",
                       usuario_nombre      = "Laura",
                       rol                 = "diligenciador",
                       estado              = "finalizada",
                       fecha               = "2026-08-13",
                       hora                = c("06:45:00", "09:10:00"),
                       fecha_actualizacion = c("2026-08-13T06:45:00", "2026-08-13T09:10:00"),
                       viv_prop_nombres_apellidos = c("Rosa Diaz", "Luis Rojas"),
                       viv_prop_cc         = c("", "1000005"),
                       viv_prop_telefono   = c("3110000003", "3110000005"),
                       viv_inf_nombre      = c("Sofia Diaz", "Luis Rojas"),
                       viv_inf_cc          = c("1000011", "1000005"),
                       viv_inf_telefono    = c("3110000011", "3110000005"),
                       viv_prof_organismo  = "Secretaría de Vivienda",
                       viv_fecha_evaluacion = "2026-08-13",
                       viv_departamento    = "Valle del Cauca",
                       viv_municipio       = "Santiago de Cali",
                       viv_cumple_requisitos   = c("no", "si"),
                       viv_requiere_evacuacion = c("si", "no"),
                       tipo_via            = c("KRA", "Av"),
                       numero_via          = c("22", "3"),
                       sufijo_via          = c("O", "Norte"),
                       numero_generador    = c("10", "45"),
                       placa_inmueble      = c("20", "12"),
                       tipo_inmueble       = "Casa",
                       direccion_completa  = c("KRA 22 O # 10-20, Casa",
                                               "Av 3 Norte # 45-12, Casa"),
                       latitud             = c(3.4406, 3.4610),
                       longitud            = c(-76.5331, -76.5250),
                       sistema_coordenadas = "EPSG:4326",
                       fuente_georreferenciacion = c("MAPA", "GPS"),
                       ubicacion_confirmada = "Sí",
                       viv_tipo_evento     = "sismo",
                       viv_sistema_constructivo = c("mamposteria", "madera"),
                       viv_mam_vigas_columnas_afectado = c("si", NA),
                       viv_mam_vigas_columnas_nivel    = c("severo", NA),
                       viv_mam_muros_carga_afectado    = c("si", NA),
                       viv_mam_muros_carga_nivel       = c("severo", NA),
                       viv_mam_cubierta_afectado       = c("si", NA),
                       viv_mam_cubierta_nivel          = c("severo", NA))

## export data (estructura completa de 221 columnas)
export(expandir_plantilla(viv_riesgo,   plantilla_viv, diccionario),
       file.path(out, "viviendas_gestion_riesgo_20260813_0800.xlsx"))
export(expandir_plantilla(viv_vivienda, plantilla_viv, diccionario),
       file.path(out, "viviendas_vivienda_20260813.xlsx"))

##============================================================================##
##=== 2. Personas (grano: persona; la familia se deriva por id_encuesta)   ===##
##============================================================================##

## equipo gestion del riesgo: familias A (2 personas), B, D e I
per_riesgo <- tibble(id_encuesta         = c("PER-J1-A", "PER-J1-A", "PER-J1-B", "PER-J1-D", "PER-J1-I"),
                     tipo_formulario     = "personas",
                     id_hogar            = c("HOG-A", "HOG-A", "HOG-B2", "HOG-D", "HOG-I"),
                     secretaria          = "gestion_riesgo",
                     secretaria_nombre   = "Secretaría de Gestión del Riesgo",
                     usuario             = "gabriela",
                     usuario_nombre      = "Gabriela",
                     rol                 = "diligenciador",
                     estado              = "finalizada",
                     fecha               = "2026-08-13",
                     hora                = "08:00:00",
                     fecha_actualizacion = "2026-08-13T08:00:00",
                     persona_num         = c(1, 2, 1, 1, 1),
                     id_persona          = c("PER-J1-A-P01", "PER-J1-A-P02", "PER-J1-B-P01",
                                             "PER-J1-D-P01", "PER-J1-I-P01"),
                     per_nombres         = c("Juan", "Ana", "Marta", "Pedro", "Sofia"),
                     per_apellidos       = c("Perez", "Perez", "Gomez", "Lopez", "Diaz"),
                     per_tipo_documento  = "3",
                     ## Sofia Diaz (1000011) es quien atendio la visita de VIV-J1-C
                     per_numero_documento = c("1000001", "1000010", "1000002", "1000004", "1000011"),
                     per_parentesco      = c("1", "3", "1", "1", "1"),
                     per_genero          = c("M", "F", "F", "M", "F"),
                     per_edad            = c(52, 25, 47, 61, 34),
                     per_etnia           = "6",
                     per_estado_salud    = c("2", "1", "2", "2", "2"),
                     per_afiliacion_salud = c("1", "1", "2", "2", "1"),
                     per_ubicacion_inmueble = "urbano",
                     per_propiedad_inmueble = c("propia", "propia", "arriendo", "propia", "propia"),
                     per_estado_inmueble = c("1", "1", "2", "1", "2"),
                     per_ahe_alimentaria = c("no", "no", "si", "no", "si"),
                     per_ahe_no_alimentaria = c("no", "no", "si", "no", "si"),
                     per_mat_rehab_vivienda = c("no", "no", "si", "no", "si"),
                     per_sub_arriendo    = c("no", "no", "si", "no", "si"))

## equipo secretaria de vivienda: familia F
## Ana Perez (1000010) repite la de la familia A -> duplicado de persona
## Luis Rojas (1000005) coincide con la cedula del propietario de VIV-J1-E
per_vivienda <- tibble(id_encuesta         = c("PER-J1-F", "PER-J1-F"),
                       tipo_formulario     = "personas",
                       id_hogar            = "HOG-F",
                       secretaria          = "vivienda",
                       secretaria_nombre   = "Secretaría de Vivienda",
                       usuario             = "laura",
                       usuario_nombre      = "Laura",
                       rol                 = "diligenciador",
                       estado              = "finalizada",
                       fecha               = "2026-08-13",
                       hora                = "09:30:00",
                       fecha_actualizacion = "2026-08-13T09:30:00",
                       persona_num         = c(1, 2),
                       id_persona          = c("PER-J1-F-P01", "PER-J1-F-P02"),
                       per_nombres         = c("Ana", "Luis"),
                       per_apellidos       = c("Perez", "Rojas"),
                       per_tipo_documento  = "3",
                       per_numero_documento = c("1000010", "1000005"),
                       per_parentesco      = c("1", "8"),
                       per_genero          = c("F", "M"),
                       per_edad            = c(25, 58),
                       per_etnia           = "6",
                       per_estado_salud    = "2",
                       per_afiliacion_salud = "1",
                       per_ubicacion_inmueble = "urbano",
                       per_propiedad_inmueble = c("arriendo", "propia"),
                       per_estado_inmueble = "2",
                       per_ahe_alimentaria = "si",
                       per_ahe_no_alimentaria = "si",
                       per_mat_rehab_vivienda = "no",
                       per_sub_arriendo    = "si")

## export data (estructura completa de 60 columnas)
export(expandir_plantilla(per_riesgo,   plantilla_per, diccionario),
       file.path(out, "personas_gestion_riesgo_20260813_0800.xlsx"))
export(expandir_plantilla(per_vivienda, plantilla_per, diccionario),
       file.path(out, "personas_vivienda_20260813.xlsx"))

cat("jornada 1 generada en", out, "\n")
