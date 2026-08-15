##============================================================================##
# 8. Ningun dato personal aparece en GitHub Pages
#------------------------------------------------------------------------------#
# GitHub Pages sirve TODO lo que este versionado. Asi que la pregunta no es que
# hay en el disco —la base tiene que estar en el disco, ahi trabaja el pipeline—
# sino que conoce git.
#
# La comprobacion de rutas la hace tools/verificar_publico.sh, que corre tambien
# en el workflow; aqui se invoca y ademas se revisa por CONTENIDO lo que se
# publica, que es lo que atrapa una copia con otro nombre.
##============================================================================##

ubicarse_en_raiz()

test_that("la verificacion de exposicion publica pasa", {
  skip_if(!nzchar(Sys.which("git")), "hace falta git")
  skip_if(is.na(RAIZ_GIT), "esto no es un repositorio de git")

  salida <- system2("bash", "tools/verificar_publico.sh", stdout = TRUE, stderr = TRUE)
  codigo <- attr(salida, "status")

  expect_true(is.null(codigo) || codigo == 0,
              info = paste(salida, collapse = "\n"))
})

test_that("ningun archivo versionado contiene cedulas ni nombres de la base", {
  skip_if(!nzchar(Sys.which("git")), "hace falta git")
  skip_if(is.na(RAIZ_GIT), "esto no es un repositorio de git")

  ## Se revisa lo que se publica: html, js, json y csv del sitio. Se dejan fuera
  ## los .R y los .md, que hablan de las cedulas sin llevar ninguna, y el
  ## diccionario de variables, que es el libro de codigos del formulario.
  versionados <- git_en_raiz("ls-files", stdout = TRUE)
  publicados  <- versionados[grepl("\\.(html|js|json|csv)$", versionados)]
  publicados  <- publicados[!grepl("^consolidacion/(synthetic|edan_comparison)/", publicados)]
  publicados  <- publicados[!grepl("leaflet|cali-geo|cali\\.geojson", publicados)]

  hallazgos <- character(0)
  for (nombre in publicados) {
    archivo <- file.path(RAIZ_GIT, nombre)
    if (!file.exists(archivo)) next
    texto <- paste(readLines(archivo, warn = FALSE), collapse = "\n")

    ## una cedula colombiana junto a una etiqueta de dato personal en el mismo
    ## objeto JSON. Buscar digitos sueltos daria falsos positivos en cualquier
    ## coordenada o codigo; lo que delata un volcado es la pareja campo -> valor
    if (grepl('"(documento|numero_documento|prop_cc|inf_cc|cedula)"\\s*:\\s*"?[0-9]{6,}',
              texto)) {
      hallazgos <- c(hallazgos, sprintf("%s (documento con valor)", nombre))
    }
    if (grepl('"(estado_salud|afiliacion_salud)"\\s*:\\s*"[^"]+"', texto)) {
      hallazgos <- c(hallazgos, sprintf("%s (estado de salud)", nombre))
    }
    if (grepl('"(latitud|longitud)"\\s*:\\s*-?[0-9]+\\.[0-9]+', texto)) {
      hallazgos <- c(hallazgos, sprintf("%s (coordenadas individuales)", nombre))
    }
  }

  expect_equal(hallazgos, character(0),
               info = paste("datos personales en archivos versionados:\n",
                            paste(hallazgos, collapse = "\n")))
})

test_that("el .gitignore protege las rutas que producen los pasos de salida", {
  ## Cada una de estas la ESCRIBE el pipeline. Si alguna dejara de estar
  ## ignorada, el siguiente `git add -A` la subiria sin que nadie lo note; asi
  ## fue como datos_tablero.js termino publicado.
  rutas <- c("consolidacion/data/salida/js/datos.js",
             "consolidacion/data/salida/tablero/js/datos_tablero.js",
             "consolidacion/data/salida/descargas/base_consulta.xlsx",
             "consolidacion/data/db/base_oficial.sqlite",
             "consolidacion/data/entrada/viviendas_hoja.csv",
             "consolidacion/.secrets/token_exportacion.txt")

  skip_if(is.na(RAIZ_GIT), "esto no es un repositorio de git")

  for (ruta in rutas) {
    ignorada <- git_en_raiz(c("check-ignore", "-q", shQuote(ruta)),
                            stdout = FALSE, stderr = FALSE) == 0
    expect_true(ignorada, info = sprintf("no esta en .gitignore: %s", ruta))
  }
})
