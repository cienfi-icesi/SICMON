##============================================================================##
# 1. La conexion con Google Sheets funciona
#------------------------------------------------------------------------------#
# Comprueba las tres cosas que tienen que estar bien para que 00_conectar_hoja.R
# traiga algo, y las distingue: que la direccion responda, que la implementacion
# publicada sea reciente y que el token de extraccion sirva.
#
# La distincion importa porque los tres fallan igual desde fuera —"no llegaron
# datos"— y se arreglan de formas distintas: republicar el Apps Script, corregir
# la direccion o rotar el token.
##============================================================================##

cargar_configuracion()

test_that("la direccion del Apps Script responde y dice su version", {
  saltar_si_no_hay_red()

  respuesta <- pedir_al_receptor(list(accion = "ping"), con_token_exportacion = FALSE)

  expect_true(isTRUE(respuesta$ok))
  expect_true(nzchar(respuesta$version))

  ## La version publicada tiene que ser 1.6.1 o posterior. No es un capricho de
  ## numeracion: en la 1.6.1 se corrigio verificarTokenConsulta_ para que FALLE
  ## CERRADO, y con una anterior las tablas consolidadas se abren sin
  ## contrasena (comprobado el 15/08/2026 contra la 1.6.0 publicada).
  ##
  ## Esta es la comprobacion que hay que mirar primero cuando algo huele mal:
  ## que el codigo correcto este en el repositorio no dice nada sobre lo que
  ## Google esta sirviendo. Hay que implementar una version nueva a mano.
  expect_gte(numeric_version(respuesta$version), numeric_version("1.6.1"))
})

test_that("el token de extraccion abre el inventario", {
  saltar_si_no_hay_red()

  respuesta <- pedir_al_receptor(list(accion = "inventario"))

  expect_true(isTRUE(respuesta$ok),
              info = sprintf("el receptor respondio: %s",
                             if (is.null(respuesta$error)) "sin error" else respuesta$error))
  expect_true(all(c("tabla", "filas") %in% names(respuesta$tablas)))

  ## las tres tablas que consume 01_ingest.R tienen que existir en la hoja
  expect_true(all(TABLAS_HOJA %in% respuesta$tablas$tabla))
})

test_that("un token de extraccion equivocado no abre nada", {
  saltar_si_no_hay_red()

  respuesta <- pedir_al_receptor(list(accion = "inventario", token_exportacion = "clave-inventada"),
                                 con_token_exportacion = FALSE)

  expect_false(isTRUE(respuesta$ok))
  expect_equal(respuesta$error, "no_autorizado")
})
