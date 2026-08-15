##============================================================================##
# 01_comparar_edan.R  —  Comparacion formulario EDAN vs. base historica
#------------------------------------------------------------------------------#
# Responde la pregunta: ¿que preguntas del formulario EDAN actual (127, segun
# el diccionario de la app) NO estan presentes en la base historica de la
# Secretaria de Vivienda (hoja "EDAN 100826 - Datos Madre", 873 registros)?
#
# Insumos:
#   - synthetic/insumos/diccionario_variables.csv   las 127 preguntas del formulario
#   - data/historico/EDAN_SISMO.xlsx                base historica
#   - edan_comparison/equivalencias.csv             equivalencias semanticas REVISABLES
#     (todo lo que no aparezca alli queda como "no"; las familias de preguntas
#      de nivel de dano por elemento se marcan "ambigua" en bloque, porque la
#      base solo trae una clasificacion global del dano)
#
# Produce:
#   - edan_comparison/output/comparacion_edan.xlsx  (grano: pregunta del formulario;
#     hojas: comparacion, resumen, columnas_base_historica)
#   - edan_comparison/output/resumen_comparacion.md
##============================================================================##

## configuracion inicial
rm(list = ls())
source("config/packages.R")
library(readxl)

## path
out <- "edan_comparison/output"
dir.create(out, showWarnings = F, recursive = T)

##============================================================================##
##=== 1. Preguntas del formulario y equivalencias (grano: pregunta)        ===##
##============================================================================##

preguntas <- fread("synthetic/insumos/diccionario_variables.csv", encoding = "UTF-8") %>%
             as.data.frame() %>%
             distinct(formulario, codigo_pregunta, variable, seccion_numero,
                      seccion_titulo, pregunta)

equivalencias <- fread("edan_comparison/equivalencias.csv", encoding = "UTF-8") %>%
                 as.data.frame()

comparacion <- preguntas %>%
               left_join(equivalencias, by = "variable") %>%
               mutate(## niveles de dano por elemento: la base solo clasifica el dano global
                      esta = case_when(!is.na(esta) ~ esta,
                                       grepl("^viv_(mam|mad)_", variable) ~ "ambigua",
                                       T ~ "no"),
                      columna_historica = case_when(!is.na(columna_historica) & columna_historica != "" ~ columna_historica,
                                                    grepl("^viv_(mam|mad)_", variable) ~ "Normalizacion / Colapso Total / Colapso Parcial / Danos",
                                                    T ~ "—"),
                      observacion = case_when(!is.na(observacion) ~ observacion,
                                              grepl("^viv_(mam|mad)_", variable) ~ "La base clasifica el dano global de la edificacion, no por elemento",
                                              T ~ "No existe en la base historica")) %>%
               arrange(formulario, codigo_pregunta)

##============================================================================##
##=== 2. Columnas de la base historica y su diligenciamiento               ===##
##============================================================================##

historica <- suppressMessages(read_excel("data/historico/EDAN_SISMO.xlsx",
                                         sheet = "EDAN 100826 - Datos Madre"))
names(historica)[10] <- "Direccion (corta)"

columnas_historica <- tibble(columna     = names(historica),
                             n_diligenciados = sapply(historica, function(x) {
                                                 sum(!is.na(x) & trimws(as.character(x)) != "" &
                                                     trimws(as.character(x)) != "-")
                                               }),
                             pct_diligenciado = round(100 * n_diligenciados / nrow(historica), 1))

##============================================================================##
##=== 3. Resumen y export                                                  ===##
##============================================================================##

resumen <- comparacion %>%
           count(formulario, esta) %>%
           tidyr::pivot_wider(names_from = esta, values_from = n, values_fill = 0) %>%
           as.data.frame()

faltan  <- sum(comparacion$esta == "no")
total   <- nrow(comparacion)

## export data
export(list(comparacion             = comparacion,
            resumen                 = resumen,
            columnas_base_historica = as.data.frame(columnas_historica)),
       file.path(out, "comparacion_edan.xlsx"))

lineas <- c("# Comparación: formulario EDAN vs. base histórica (Secretaría de Vivienda)",
            "",
            sprintf("- Formulario EDAN actual: **%d preguntas** (%d de vivienda, %d de personas/familia).",
                    total, sum(grepl("^V", comparacion$codigo_pregunta)),
                    sum(grepl("^P", comparacion$codigo_pregunta))),
            sprintf("- Base histórica: **%d registros** y **%d columnas** (hoja \"EDAN 100826 - Datos Madre\").",
                    nrow(historica), ncol(historica)),
            "",
            "## Resultado",
            "",
            sprintf("| Estado | Preguntas |"),
            sprintf("|---|---|"),
            sprintf("| **No están en la base histórica** | **%d** |", faltan),
            sprintf("| Ambiguas (información relacionada pero no equivalente) | %d |", sum(comparacion$esta == "ambigua")),
            sprintf("| Parciales (existen incompletas o sin estructura) | %d |", sum(comparacion$esta == "parcial")),
            sprintf("| Presentes | %d |", sum(comparacion$esta == "si")),
            "",
            "## Hallazgos clave",
            "",
            "1. **La base histórica no registra cédulas ni nombres de los afectados**: el cruce",
            "   con el formulario actual solo será posible por **dirección** (texto libre tipo",
            "   \"Carrera 44 con calle 5\", sin placa en la mayoría de los casos).",
            "2. **El daño se clasifica de forma global** (Normalizacion: Colapso Estructural /",
            "   Afectación estructural...), no por elemento como la sección 5 del formulario.",
            "3. La base es un **registro de atención de emergencia** (prioridad, semáforo,",
            "   rescatados, fallecidos, atrapamientos), no una inspección técnica de vivienda:",
            "   por eso faltan las secciones de requisitos, banco de materiales y firmas.",
            "4. Las **coordenadas** existen solo en 1 de 873 registros; la localización real de",
            "   la base es comuna + barrio + dirección en texto libre.",
            "",
            "El detalle pregunta a pregunta está en `comparacion_edan.xlsx` (hoja `comparacion`).",
            "Las equivalencias semánticas son revisables en `edan_comparison/equivalencias.csv`.")
writeLines(lineas, file.path(out, "resumen_comparacion.md"))

cat(sprintf("comparacion EDAN: %d de %d preguntas NO estan en la base historica (%d ambiguas, %d parciales, %d presentes)\n",
            faltan, total, sum(comparacion$esta == "ambigua"),
            sum(comparacion$esta == "parcial"), sum(comparacion$esta == "si")))
