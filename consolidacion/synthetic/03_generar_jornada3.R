##============================================================================##
# 03_generar_jornada3.R  —  Datos sinteticos: jornada 3 (prueba de alimentacion)
#------------------------------------------------------------------------------#
# Simula la llegada de dos archivos NUEVOS con un hogar nuevo completo, para
# probar que la base y el aplicativo de consulta se alimentan solos:
#   - viviendas_gestion_riesgo_20260815_0900.xlsx   VIV-J3-K (HOG-K)
#   - personas_gestion_riesgo_20260815_0900.xlsx    PER-J3-K (HOG-K, 2 personas)
# Resultado esperado tras correr el pipeline: familia K -> matched_hogar, y
# Carlos Vera (1000020) aparece en la consulta.
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
##=== 1. Vivienda nueva (grano: formulario de vivienda)                    ===##
##============================================================================##

viv_nueva <- tibble(id_encuesta         = "VIV-J3-K",
                    tipo_formulario     = "vivienda",
                    id_hogar            = "HOG-K",
                    secretaria          = "gestion_riesgo",
                    secretaria_nombre   = "Secretaría de Gestión del Riesgo",
                    usuario             = "gabriela",
                    usuario_nombre      = "Gabriela",
                    rol                 = "diligenciador",
                    estado              = "finalizada",
                    fecha               = "2026-08-15",
                    hora                = "09:00:00",
                    fecha_actualizacion = "2026-08-15T09:00:00",
                    viv_prop_nombres_apellidos = "Carlos Vera",
                    viv_prop_cc         = "1000020",
                    viv_prop_telefono   = "3110000020",
                    viv_inf_nombre      = "Carlos Vera",
                    viv_inf_cc          = "1000020",
                    viv_inf_telefono    = "3110000020",
                    viv_prof_organismo  = "Secretaría de Gestión del Riesgo",
                    viv_fecha_evaluacion = "2026-08-15",
                    viv_departamento    = "Valle del Cauca",
                    viv_municipio       = "Santiago de Cali",
                    viv_cumple_requisitos   = "si",
                    viv_requiere_evacuacion = "no",
                    tipo_via            = "Cl",
                    numero_via          = "44",
                    sufijo_via          = "Ninguno",
                    numero_generador    = "5",
                    placa_inmueble      = "10",
                    tipo_inmueble       = "Casa",
                    direccion_completa  = "Cl 44 # 5-10, Casa",
                    latitud             = 3.4520,
                    longitud            = -76.5120,
                    sistema_coordenadas = "EPSG:4326",
                    fuente_georreferenciacion = "GPS",
                    ubicacion_confirmada = "Sí",
                    viv_tipo_evento     = "sismo",
                    viv_sistema_constructivo = "mamposteria",
                    viv_mam_vigas_columnas_afectado = "si",
                    viv_mam_vigas_columnas_nivel    = "leve")

## export data
export(expandir_plantilla(viv_nueva, plantilla_viv, diccionario),
       file.path(out, "viviendas_gestion_riesgo_20260815_0900.xlsx"))

##============================================================================##
##=== 2. Familia nueva (grano: persona)                                    ===##
##============================================================================##

per_nueva <- tibble(id_encuesta         = c("PER-J3-K", "PER-J3-K"),
                    tipo_formulario     = "personas",
                    id_hogar            = "HOG-K",
                    secretaria          = "gestion_riesgo",
                    secretaria_nombre   = "Secretaría de Gestión del Riesgo",
                    usuario             = "gabriela",
                    usuario_nombre      = "Gabriela",
                    rol                 = "diligenciador",
                    estado              = "finalizada",
                    fecha               = "2026-08-15",
                    hora                = "09:20:00",
                    fecha_actualizacion = "2026-08-15T09:20:00",
                    persona_num         = c(1, 2),
                    id_persona          = c("PER-J3-K-P01", "PER-J3-K-P02"),
                    per_nombres         = c("Carlos", "Lucia"),
                    per_apellidos       = c("Vera", "Vera"),
                    per_tipo_documento  = "3",
                    per_numero_documento = c("1000020", "1000021"),
                    per_parentesco      = c("1", "3"),
                    per_genero          = c("M", "F"),
                    per_edad            = c(45, 12),
                    per_etnia           = "6",
                    per_estado_salud    = "2",
                    per_afiliacion_salud = "1",
                    per_ubicacion_inmueble = "urbano",
                    per_propiedad_inmueble = "propia",
                    per_estado_inmueble = "1",
                    per_ahe_alimentaria = "no",
                    per_ahe_no_alimentaria = "no",
                    per_mat_rehab_vivienda = "si",
                    per_sub_arriendo    = "no")

## export data
export(expandir_plantilla(per_nueva, plantilla_per, diccionario),
       file.path(out, "personas_gestion_riesgo_20260815_0900.xlsx"))

cat("jornada 3 generada en", out, "\n")
