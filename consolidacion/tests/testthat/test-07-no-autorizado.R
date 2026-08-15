##============================================================================##
# 7. Un usuario no autorizado no puede acceder a los datos
#------------------------------------------------------------------------------#
# El sitio publicado es publico y su codigo se lee con "ver codigo fuente". Un
# atacante empieza, entonces, con todo lo que hay en el repositorio: la
# direccion del Apps Script y el token general. Esta prueba se pone exactamente
# en esa posicion y comprueba que con eso NO se llega a los datos.
#
# Cuatro puertas, cuatro comprobaciones:
#   - tablas completas sin contrasena           -> no_autorizado
#   - tablas completas con contrasena inventada -> no_autorizado
#   - tablas crudas sin token de extraccion     -> no_autorizado
#   - consulta ciudadana                        -> UN registro, nunca una lista
#
# La cuarta es la mas facil de romper sin darse cuenta: es la unica puerta sin
# credenciales, y lo unico que la protege es lo poco que devuelve.
##============================================================================##

cargar_configuracion()

test_that("las tablas completas no se abren sin contrasena", {
  saltar_si_no_hay_red()

  respuesta <- pedir_al_receptor(list(accion = "consulta_completa", tabla = "c_personas",
                                      desde = 1, limite = 10),
                                 con_token_exportacion = FALSE)

  expect_false(isTRUE(respuesta$ok))
  ## 'consulta_no_habilitada' significa que la propiedad TOKEN_LECTURA no existe:
  ## tambien es un rechazo, y de hecho el mas cerrado de los dos
  expect_true(respuesta$error %in% c("no_autorizado", "consulta_no_habilitada"))
  expect_null(respuesta$filas)
})

test_that("las tablas completas no se abren con una contrasena inventada", {
  saltar_si_no_hay_red()

  respuesta <- pedir_al_receptor(list(accion = "consulta_completa", tabla = "c_personas",
                                      token_lectura = "una-clave-cualquiera",
                                      desde = 1, limite = 10),
                                 con_token_exportacion = FALSE)

  expect_false(isTRUE(respuesta$ok))
  expect_true(respuesta$error %in% c("no_autorizado", "consulta_no_habilitada"))
  expect_null(respuesta$filas)
})

test_that("las tablas crudas no se extraen solo con el token general", {
  saltar_si_no_hay_red()

  ## el token general viaja en config-consulta.js y en config-sync.js: cualquiera
  ## lo tiene. La extraccion exige ademas el de exportacion, que no esta en
  ## ningun archivo del sitio
  respuesta <- pedir_al_receptor(list(accion = "exportar_tabla", tabla = "personas",
                                      desde = 1, limite = 10),
                                 con_token_exportacion = FALSE)

  expect_false(isTRUE(respuesta$ok))
  expect_true(respuesta$error %in% c("no_autorizado", "exportacion_no_habilitada"))
})

test_that("la consulta ciudadana no devuelve la base", {
  saltar_si_no_hay_red()

  ## no se pregunta por una cedula sino por lo que un atacante intentaria: una
  ## cadena vacia, un comodin, algo que "devuelva todo"
  for (intento in list("", "*", "%", "0", "' OR '1'='1")) {
    respuesta <- pedir_al_receptor(list(accion = "consultar_cedula", cedula = intento),
                                   con_token_exportacion = FALSE)

    ## puede responder ok con listas vacias, o rechazar; lo que NO puede es
    ## devolver registros
    devueltos <- if (is.null(respuesta$personas)) 0 else length(respuesta$personas)
    if (is.data.frame(respuesta$personas)) devueltos <- nrow(respuesta$personas)

    expect_equal(devueltos, 0,
                 info = sprintf("la cedula '%s' devolvio %d registro(s)", intento, devueltos))
  }
})

test_that("ninguna contrasena esta escrita en el JavaScript publicado", {
  ## Esta no necesita red: revisa el codigo que se publica en GitHub Pages.
  ## Una contrasena en el frontend no es autenticacion —cualquiera la lee con
  ## "ver codigo fuente"—, que es justo lo que se quito del aplicativo de
  ## consulta cuando paso a validar contra el Apps Script.
  archivos <- c(list.files("../modules", pattern = "\\.js$", recursive = TRUE, full.names = TRUE),
                list.files("../js",      pattern = "\\.js$", full.names = TRUE),
                list.files("../portal",  pattern = "\\.js$", full.names = TRUE))
  archivos <- archivos[file.exists(archivos)]
  archivos <- archivos[!grepl("leaflet|cali-geo", archivos)]     ## librerias y geometrias

  hallazgos <- character(0)
  for (archivo in archivos) {
    lineas <- readLines(archivo, warn = FALSE)
    ## fuera comentarios: en export.js aparece "clave: 'viviendas' | ..." dentro
    ## de un bloque de documentacion, describiendo un parametro, y no es nada
    numeros <- which(grepl("(password|contraseña|clave)\\s*:\\s*['\"][^'\"]{4,}['\"]",
                           lineas, ignore.case = TRUE) &
                     !grepl("^\\s*(\\*|//|/\\*)", lineas))
    for (n in numeros) {
      hallazgos <- c(hallazgos, sprintf("%s:%d", sub("^\\.\\./", "", archivo), n))
    }
  }

  expect_equal(hallazgos, character(0),
               info = paste0("contrasena en texto plano dentro del sitio publicado:\n  ",
                             paste(hallazgos, collapse = "\n  "),
                             "\nEl repositorio es publico: esas credenciales las lee cualquiera."))
})
