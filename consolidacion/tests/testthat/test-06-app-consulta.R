##============================================================================##
# 6. app_consulta recibe los datos actualizados
#------------------------------------------------------------------------------#
# La consulta ya no lee ningun archivo del repositorio: le pide los datos al
# Apps Script. Lo que hay que verificar es esa cadena completa:
#
#   pipeline  →  pestañas c_*  →  fetch de la consulta  →  pantalla
#
# La prueba se pone en el lugar del navegador y hace las mismas dos peticiones
# que hace modules/consulta/js/app.js, con la misma forma de respuesta que ese
# codigo espera. Si el Apps Script cambiara el nombre de un campo, aqui se ve;
# en el navegador se veria como una tabla vacia sin ningun error.
#
# Ademas se comprueba que la marca de actualizacion sea RECIENTE: que la
# consulta responda no sirve de nada si esta sirviendo lo de hace tres dias
# porque el pipeline lleva ese tiempo caido.
##============================================================================##

cargar_configuracion()

## la contrasena del equipo (TOKEN_LECTURA del Apps Script). No esta en ningun
## archivo del repositorio ni tiene por que estarlo: para correr esta prueba se
## pasa por el entorno.
token_lectura <- function() {
  valor <- trimws(Sys.getenv("SICMON_TOKEN_LECTURA", unset = ""))
  if (nzchar(valor)) valor else NULL
}

test_that("la consulta ciudadana responde con la forma que espera la pantalla", {
  saltar_si_no_hay_red()

  ## una cedula que no existe: la respuesta correcta es ok con listas vacias,
  ## no un error. La pantalla distingue "no esta en la base" de "no se pudo
  ## consultar", y son mensajes muy distintos para quien pregunta
  respuesta <- pedir_al_receptor(list(accion = "consultar_cedula", cedula = "99999999999"),
                                 con_token_exportacion = FALSE)

  expect_true(isTRUE(respuesta$ok))
  expect_equal(length(respuesta$personas), 0)
})

test_that("las tablas consolidadas llegan con la contrasena del equipo", {
  saltar_si_no_hay_red()
  skip_if(is.null(token_lectura()),
          "defina SICMON_TOKEN_LECTURA con la contrasena del equipo")

  respuesta <- pedir_al_receptor(list(accion = "consulta_completa", tabla = "c_personas",
                                      token_lectura = token_lectura(),
                                      desde = 1, limite = 10),
                                 con_token_exportacion = FALSE)

  expect_true(isTRUE(respuesta$ok))

  ## aObjetos() del navegador arma cada fila con estos dos campos; sin ellos la
  ## tabla se dibuja vacia
  expect_true(all(c("encabezados", "filas") %in% names(respuesta)))

  skip_if(respuesta$devueltas == 0, "la base consolidada esta vacia todavia")

  ## las columnas que la pantalla lee por nombre en el modo equipo
  esperadas <- c("documento", "nombre", "id_persona", "id_encuesta", "match_status")
  expect_true(all(esperadas %in% respuesta$encabezados))
})

test_that("la marca de actualizacion es reciente", {
  saltar_si_no_hay_red()
  skip_if(is.null(token_lectura()),
          "defina SICMON_TOKEN_LECTURA con la contrasena del equipo")

  respuesta <- pedir_al_receptor(list(accion = "consulta_completa", tabla = "c_meta",
                                      token_lectura = token_lectura(),
                                      desde = 1, limite = 5),
                                 con_token_exportacion = FALSE)
  skip_if(!isTRUE(respuesta$ok) || is.null(respuesta$actualizado) || !nzchar(respuesta$actualizado),
          "el pipeline todavia no ha publicado ninguna marca")

  publicado <- as.POSIXct(respuesta$actualizado, format = "%Y-%m-%dT%H:%M:%S", tz = "America/Bogota")
  horas <- as.numeric(difftime(Sys.time(), publicado, units = "hours"))

  ## 24 horas es holgado a proposito: el cron corre en horario laboral, asi que
  ## un lunes por la manana la ultima publicacion es del viernes por la tarde.
  ## Lo que esto detecta es el pipeline caido desde hace dias, que es como se
  ## manifiesta el problema de verdad
  expect_lt(horas, 24 * 4)
})
