##============================================================================##
# 02_generar_jornada2.R  —  Datos sinteticos: jornada 2
#------------------------------------------------------------------------------#
# Simula la llegada de nuevos exportes un dia despues, con la estructura real
# de columnas. Ejecutar DESPUES de haber corrido el pipeline sobre la jornada 1.
#
#   - viviendas_gestion_riesgo_20260814_0800.xlsx  archivo NUEVO acumulado:
#       repite VIV-J1-B y VIV-J1-C sin cambios, trae VIV-J1-A con el telefono
#       corregido (registro modificado) y agrega VIV-J2-G (registro nuevo)
#   - personas_gestion_riesgo_20260814_0800.xlsx   archivo NUEVO acumulado:
#       familias A, B, D e I sin cambios + familia G nueva -> matched_hogar
#   - viviendas_vivienda_20260813.xlsx             archivo SOBREESCRITO:
#       mismas filas + VIV-J2-H con la cedula 1000005 -> el match de la
#       familia F (antes matched_cedula con VIV-J1-E) pasa a ambiguous
#   - personas_vivienda_20260813.xlsx              queda intacto -> el
#       pipeline debe saltarlo por hash sin reprocesarlo
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

## plantillas reales y libro de codigos
plantilla_viv <- as.data.frame(fread("synthetic/insumos/plantilla_viviendas.csv", encoding = "UTF-8", nrows = 1))
plantilla_per <- as.data.frame(fread("synthetic/insumos/plantilla_personas.csv",  encoding = "UTF-8", nrows = 1))
diccionario   <- as.data.frame(fread("synthetic/insumos/diccionario_variables.csv", encoding = "UTF-8"))

##============================================================================##
##=== 1. Viviendas gestion del riesgo: acumulado con 1 modificado + 1 nuevo ===##
##============================================================================##

viv_riesgo <- tibble(id_encuesta         = c("VIV-J1-A", "VIV-J1-B", "VIV-J1-C", "VIV-J2-G"),
                     tipo_formulario     = "vivienda",
                     id_hogar            = c("HOG-A", "HOG-B1", "HOG-C1", "HOG-G"),
                     secretaria          = "gestion_riesgo",
                     secretaria_nombre   = "Secretaría de Gestión del Riesgo",
                     usuario             = "gabriela",
                     usuario_nombre      = "Gabriela",
                     rol                 = "diligenciador",
                     estado              = "finalizada",
                     fecha               = c("2026-08-13", "2026-08-13", "2026-08-13", "2026-08-14"),
                     hora                = c("07:30:00", "07:30:00", "07:30:00", "07:40:00"),
                     ## VIV-J1-A trae fecha_actualizacion posterior: telefono corregido
                     fecha_actualizacion = c("2026-08-14T07:15:00", "2026-08-13T07:30:00",
                                             "2026-08-13T07:30:00", "2026-08-14T07:40:00"),
                     viv_prop_nombres_apellidos = c("Juan Perez", "Marta Gomez", "Rosa Diaz", "Elena Mora"),
                     viv_prop_cc         = c("1000001", "1.000.002", "", "1000007"),
                     viv_prop_telefono   = c("3110000099", "3110000002", "3110000003", "3110000007"),
                     viv_inf_nombre      = c("Juan Perez", "Marta Gomez", "Sofia Diaz", "Elena Mora"),
                     viv_inf_cc          = c("1000001", "1000002", "1000011", "1000007"),
                     viv_inf_telefono    = c("3110000099", "3110000002", "3110000011", "3110000007"),
                     viv_prof_organismo  = "Secretaría de Gestión del Riesgo",
                     viv_fecha_evaluacion = c("2026-08-13", "2026-08-13", "2026-08-13", "2026-08-14"),
                     viv_departamento    = "Valle del Cauca",
                     viv_municipio       = "Santiago de Cali",
                     viv_cumple_requisitos   = c("si", "si", "no", "si"),
                     viv_requiere_evacuacion = c("no", "no", "si", "no"),
                     tipo_via            = c("Cra", "Calle", "Carrera", "Dg"),
                     numero_via          = c("85", "5", "22", "15"),
                     sufijo_via          = c("Ninguno", "Ninguno", "Oeste", "Ninguno"),
                     numero_generador    = c("12", "38", "10", "70"),
                     placa_inmueble      = c("35", "104", "20", "22"),
                     tipo_inmueble       = "Casa",
                     direccion_completa  = c("Cra 85 # 12-35, Casa",
                                             "Calle 5 # 38-104, Casa",
                                             "Carrera 22 Oeste # 10-20, Casa",
                                             "Dg 15 # 70-22, Casa"),
                     latitud             = c(3.3980, 3.4210, 3.4405, 3.4110),
                     longitud            = c(-76.5400, -76.5210, -76.5330, -76.5150),
                     sistema_coordenadas = "EPSG:4326",
                     fuente_georreferenciacion = "GPS",
                     ubicacion_confirmada = "Sí",
                     viv_tipo_evento     = "sismo",
                     viv_sistema_constructivo = "mamposteria",
                     viv_mam_vigas_columnas_afectado = c("si", "si", "si", "si"),
                     viv_mam_vigas_columnas_nivel    = c("moderado", "leve", "severo", "leve"),
                     viv_mam_muros_carga_afectado    = c("si", "no", "si", "no"),
                     viv_mam_muros_carga_nivel       = c("leve", NA, "severo", NA),
                     viv_mam_cubierta_afectado       = c("no", "no", "si", "no"),
                     viv_mam_cubierta_nivel          = c(NA, NA, "severo", NA))

## export data
export(expandir_plantilla(viv_riesgo, plantilla_viv, diccionario),
       file.path(out, "viviendas_gestion_riesgo_20260814_0800.xlsx"))

##============================================================================##
##=== 2. Personas gestion del riesgo: acumulado + familia G nueva          ===##
##============================================================================##

per_riesgo <- tibble(id_encuesta         = c("PER-J1-A", "PER-J1-A", "PER-J1-B", "PER-J1-D",
                                             "PER-J1-I", "PER-J2-G"),
                     tipo_formulario     = "personas",
                     id_hogar            = c("HOG-A", "HOG-A", "HOG-B2", "HOG-D", "HOG-I", "HOG-G"),
                     secretaria          = "gestion_riesgo",
                     secretaria_nombre   = "Secretaría de Gestión del Riesgo",
                     usuario             = "gabriela",
                     usuario_nombre      = "Gabriela",
                     rol                 = "diligenciador",
                     estado              = "finalizada",
                     fecha               = c("2026-08-13", "2026-08-13", "2026-08-13",
                                             "2026-08-13", "2026-08-13", "2026-08-14"),
                     hora                = c("08:00:00", "08:00:00", "08:00:00",
                                             "08:00:00", "08:00:00", "08:20:00"),
                     fecha_actualizacion = c("2026-08-13T08:00:00", "2026-08-13T08:00:00",
                                             "2026-08-13T08:00:00", "2026-08-13T08:00:00",
                                             "2026-08-13T08:00:00", "2026-08-14T08:20:00"),
                     persona_num         = c(1, 2, 1, 1, 1, 1),
                     id_persona          = c("PER-J1-A-P01", "PER-J1-A-P02", "PER-J1-B-P01",
                                             "PER-J1-D-P01", "PER-J1-I-P01", "PER-J2-G-P01"),
                     per_nombres         = c("Juan", "Ana", "Marta", "Pedro", "Sofia", "Elena"),
                     per_apellidos       = c("Perez", "Perez", "Gomez", "Lopez", "Diaz", "Mora"),
                     per_tipo_documento  = "3",
                     per_numero_documento = c("1000001", "1000010", "1000002", "1000004",
                                              "1000011", "1000007"),
                     per_parentesco      = "1",
                     per_genero          = c("M", "F", "F", "M", "F", "F"),
                     per_edad            = c(52, 25, 47, 61, 34, 39),
                     per_etnia           = "6",
                     per_estado_salud    = c("2", "1", "2", "2", "2", "2"),
                     per_afiliacion_salud = c("1", "1", "2", "2", "1", "2"),
                     per_ubicacion_inmueble = "urbano",
                     per_propiedad_inmueble = c("propia", "propia", "arriendo", "propia",
                                                "propia", "propia"),
                     per_estado_inmueble = c("1", "1", "2", "1", "2", "1"),
                     per_ahe_alimentaria = c("no", "no", "si", "no", "si", "no"),
                     per_ahe_no_alimentaria = c("no", "no", "si", "no", "si", "no"),
                     per_mat_rehab_vivienda = c("no", "no", "si", "no", "si", "si"),
                     per_sub_arriendo    = c("no", "no", "si", "no", "si", "no"))

## la fila de Ana conserva parentesco hijo(a), como en la jornada 1
per_riesgo$per_parentesco[2] <- "3"

## export data
export(expandir_plantilla(per_riesgo, plantilla_per, diccionario),
       file.path(out, "personas_gestion_riesgo_20260814_0800.xlsx"))

##============================================================================##
##=== 3. Viviendas secretaria de vivienda: archivo sobreescrito + VIV-J2-H ===##
##============================================================================##

viv_vivienda <- tibble(id_encuesta         = c("VIV-J1-C2", "VIV-J1-E", "VIV-J2-H"),
                       tipo_formulario     = "vivienda",
                       id_hogar            = c("HOG-C2", "HOG-E", "HOG-H"),
                       secretaria          = "vivienda",
                       secretaria_nombre   = "Secretaría de Vivienda",
                       usuario             = "laura",
                       usuario_nombre      = "Laura",
                       rol                 = "diligenciador",
                       estado              = "finalizada",
                       fecha               = c("2026-08-13", "2026-08-13", "2026-08-14"),
                       hora                = c("06:45:00", "09:10:00", "09:00:00"),
                       fecha_actualizacion = c("2026-08-13T06:45:00", "2026-08-13T09:10:00",
                                               "2026-08-14T09:00:00"),
                       viv_prop_nombres_apellidos = c("Rosa Diaz", "Luis Rojas", "Luis Rojas"),
                       ## VIV-J2-H repite la cedula 1000005: mismo dueño, otro inmueble
                       viv_prop_cc         = c("", "1000005", "1000005"),
                       viv_prop_telefono   = c("3110000003", "3110000005", "3110000005"),
                       viv_inf_nombre      = c("Sofia Diaz", "Luis Rojas", "Luis Rojas"),
                       viv_inf_cc          = c("1000011", "1000005", "1000005"),
                       viv_inf_telefono    = c("3110000011", "3110000005", "3110000005"),
                       viv_prof_organismo  = "Secretaría de Vivienda",
                       viv_fecha_evaluacion = c("2026-08-13", "2026-08-13", "2026-08-14"),
                       viv_departamento    = "Valle del Cauca",
                       viv_municipio       = "Santiago de Cali",
                       viv_cumple_requisitos   = c("no", "si", "si"),
                       viv_requiere_evacuacion = c("si", "no", "no"),
                       tipo_via            = c("KRA", "Av", "Cl"),
                       numero_via          = c("22", "3", "9"),
                       sufijo_via          = c("O", "Norte", "Ninguno"),
                       numero_generador    = c("10", "45", "50"),
                       placa_inmueble      = c("20", "12", "33"),
                       tipo_inmueble       = "Casa",
                       direccion_completa  = c("KRA 22 O # 10-20, Casa",
                                               "Av 3 Norte # 45-12, Casa",
                                               "Cl 9 # 50-33, Casa"),
                       latitud             = c(3.4406, 3.4610, 3.4290),
                       longitud            = c(-76.5331, -76.5250, -76.5405),
                       sistema_coordenadas = "EPSG:4326",
                       fuente_georreferenciacion = c("MAPA", "GPS", "GPS"),
                       ubicacion_confirmada = "Sí",
                       viv_tipo_evento     = "sismo",
                       viv_sistema_constructivo = c("mamposteria", "madera", "madera"),
                       viv_mam_vigas_columnas_afectado = c("si", NA, NA),
                       viv_mam_vigas_columnas_nivel    = c("severo", NA, NA),
                       viv_mam_muros_carga_afectado    = c("si", NA, "no"),
                       viv_mam_muros_carga_nivel       = c("severo", NA, NA),
                       viv_mam_cubierta_afectado       = c("si", NA, "no"),
                       viv_mam_cubierta_nivel          = c("severo", NA, NA))

## export data (mismo nombre de la jornada 1: simula archivo reemplazado)
export(expandir_plantilla(viv_vivienda, plantilla_viv, diccionario),
       file.path(out, "viviendas_vivienda_20260813.xlsx"))

cat("jornada 2 generada en", out, "\n")
