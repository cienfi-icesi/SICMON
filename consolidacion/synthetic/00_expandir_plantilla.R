##============================================================================##
# 00_expandir_plantilla.R  —  Expansion de escenarios a la estructura real
#------------------------------------------------------------------------------#
# Los generadores de datos sinteticos escriben solo las columnas del escenario
# (ids, cedulas, direcciones, respuestas clave). Esta funcion las completa
# hasta la estructura EXACTA de los exportes reales de la app (221 columnas en
# viviendas, 60 en personas), usando como insumos:
#   - synthetic/insumos/plantilla_*.csv        exporte real de la app (da las columnas)
#   - synthetic/insumos/diccionario_variables.csv  libro de codigos (da _num y _etiqueta)
#
# Para cada pregunta de opcion unica respondida se llenan sus columnas _num y
# _etiqueta desde el diccionario, como lo hace la app. Lo no respondido queda
# vacio, igual que en un exporte real.
##============================================================================##

expandir_plantilla <- function(datos, plantilla, diccionario) {
  unicas <- diccionario %>%
            filter(tipo_campo == "unica", !is.na(numero_respuesta)) %>%
            select(variable, valor_respuesta, numero_respuesta, etiqueta_respuesta)
  for (v in intersect(unique(unicas$variable), names(datos))) {
    op  <- filter(unicas, variable == v)
    idx <- match(as.character(datos[[v]]), op$valor_respuesta)
    if (paste0(v, "_num") %in% names(plantilla)) {
      datos[[paste0(v, "_num")]] <- op$numero_respuesta[idx]
    }
    if (paste0(v, "_etiqueta") %in% names(plantilla)) {
      datos[[paste0(v, "_etiqueta")]] <- op$etiqueta_respuesta[idx]
    }
  }
  ## columnas reales que el escenario no trae quedan vacias, en el orden real
  for (col in setdiff(names(plantilla), names(datos))) {
    datos[[col]] <- NA_character_
  }
  datos <- datos[, names(plantilla)]

  ## el sistema corre en locale C, asi que un literal escrito en el codigo del
  ## generador —"Sí", "Mampostería"— llega hasta aca con la codificacion sin
  ## declarar, y export() graba en el Excel el texto impreso "S<c3><ad>" en vez
  ## del caracter. De ahi pasaba a la base, a la consulta y al tablero.
  ## Los bytes ya son UTF-8 correctos; solo falta decirlo.
  for (col in names(datos)) {
    if (is.character(datos[[col]])) Encoding(datos[[col]]) <- "UTF-8"
  }
  datos
}
