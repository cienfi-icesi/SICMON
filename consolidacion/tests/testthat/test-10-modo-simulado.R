##============================================================================##
# 10. El modo simulado no se mezcla con la operacion real
#------------------------------------------------------------------------------#
# Mientras la consulta y el tablero trabajen con datos inventados, lo unico
# que de verdad puede salir mal es que los dos mundos se toquen:
#
#   - que una corrida simulada escriba en la base oficial;
#   - que una corrida simulada abra los canales de Google y traiga datos reales;
#   - que un volcado simulado se muestre sin decir que lo es.
#
# El interruptor existe justamente para eso: o esta todo en simulado o no esta
# nada. Antes eran cuatro lineas que habia que cambiar y deshacer a mano, y
# olvidar una fue lo que metio 48 edificaciones inventadas en la base real.
##============================================================================##

cargar_configuracion()

## lee la configuracion con unas variables de entorno dadas, sin ensuciar la
## sesion de pruebas: cada valor se consulta en un Rscript aparte
configuracion_con <- function(variables, nombres) {
  rscript <- file.path(R.home("bin"), "Rscript")
  codigo <- sprintf('source("config/parameters.R"); cat(%s, sep="\n")',
                    paste0("as.character(", nombres, ")", collapse = ", "))
  salida <- system2(rscript, c("-e", shQuote(codigo)), env = variables,
                    stdout = TRUE, stderr = FALSE)
  setNames(salida, nombres)
}

test_that("el interruptor mueve TODO a la vez, no una parte", {
  cfg <- configuracion_con("SICMON_SIMULADO=1",
                           c("RUTA_DB", "CARPETA_INGESTA", "CONECTAR_DRIVE",
                             "CONECTAR_HOJA", "CARPETA_TABLERO", "MODO_SIMULADO"))

  expect_equal(cfg[["MODO_SIMULADO"]],   "TRUE")
  expect_equal(cfg[["RUTA_DB"]],         "data/db/base_simulada.sqlite")
  expect_equal(cfg[["CARPETA_INGESTA"]], "data/pruebas")

  ## los dos canales reales cerrados: con ellos abiertos, una corrida simulada
  ## bajaria encuestas de verdad y las meteria en la base de prueba
  expect_equal(cfg[["CONECTAR_DRIVE"]], "FALSE")
  expect_equal(cfg[["CONECTAR_HOJA"]],  "FALSE")

  ## el tablero simulado si va a la carpeta del modulo: no hay dato personal
  ## que proteger y es donde el tablero lo lee
  expect_equal(cfg[["CARPETA_TABLERO"]], "../modules/tablero")
})

test_that("sin el interruptor nada apunta a lo simulado", {
  cfg <- configuracion_con("SICMON_SIMULADO=",
                           c("RUTA_DB", "CARPETA_INGESTA", "CARPETA_TABLERO", "MODO_SIMULADO"))

  expect_equal(cfg[["MODO_SIMULADO"]],   "FALSE")
  expect_equal(cfg[["RUTA_DB"]],         "data/db/base_oficial.sqlite")
  expect_equal(cfg[["CARPETA_INGESTA"]], "data/entrada")

  ## y el volcado del tablero sale FUERA del repositorio publicado
  expect_equal(cfg[["CARPETA_TABLERO"]], "data/salida/tablero")
})

test_that("una corrida simulada no toca la base oficial", {
  skip_if(!file.exists("data/db/base_oficial.sqlite"),
          "no hay base oficial en esta maquina")

  ## la base real no se abre ni para leer: se compara su huella antes y despues
  antes <- tools::md5sum("data/db/base_oficial.sqlite")

  banco <- file.path(tempdir(), paste0("sicmon-sim-", Sys.getpid()))
  unlink(banco, recursive = TRUE)
  dir.create(file.path(banco, "entrada"), showWarnings = FALSE, recursive = TRUE)
  file.copy("data/pruebas/viviendas_gestion_riesgo_20260813_0800.xlsx",
            file.path(banco, "entrada"))

  ## SICMON_SIMULADO encendido, pero con las rutas del banco por encima: lo que
  ## se prueba es que el modo no reabra por su cuenta ningun canal ni ninguna
  ## ruta real
  rscript <- file.path(R.home("bin"), "Rscript")
  codigo <- system2(rscript, "pipeline/run_pipeline.R",
                    env = c(entorno_aislado(banco), "SICMON_SIMULADO=1"),
                    stdout = FALSE, stderr = FALSE)
  expect_equal(codigo, 0)

  expect_equal(tools::md5sum("data/db/base_oficial.sqlite"), antes)

  unlink(banco, recursive = TRUE)
})

test_that("el volcado del tablero dice si es simulado", {
  banco <- file.path(tempdir(), paste0("sicmon-marca-", Sys.getpid()))
  unlink(banco, recursive = TRUE)
  dir.create(file.path(banco, "entrada"), showWarnings = FALSE, recursive = TRUE)
  file.copy("data/pruebas/viviendas_gestion_riesgo_20260813_0800.xlsx",
            file.path(banco, "entrada"))
  file.copy("data/pruebas/personas_gestion_riesgo_20260813_0800.xlsx",
            file.path(banco, "entrada"))

  rscript <- file.path(R.home("bin"), "Rscript")
  volcado <- file.path(banco, "tablero/js/datos_tablero.js")

  ## la marca tiene que seguir al modo en los dos sentidos
  for (simulado in c("1", "")) {
    system2(rscript, "pipeline/run_pipeline.R",
            env = c(entorno_aislado(banco), paste0("SICMON_SIMULADO=", simulado)),
            stdout = FALSE, stderr = FALSE)

    expect_true(file.exists(volcado))
    datos <- jsonlite::fromJSON(sub(";\\s*$", "", sub("^window\\.TABLERO = ", "",
                                                     readLines(volcado, warn = FALSE))))
    expect_equal(isTRUE(datos$simulado), simulado == "1",
                 info = sprintf("SICMON_SIMULADO='%s'", simulado))
  }

  unlink(banco, recursive = TRUE)
})

test_that("el tablero muestra el aviso cuando el volcado viene marcado", {
  ## el aviso vive en el HTML, oculto, y lo enciende el JavaScript al ver la
  ## marca. Si alguien quita cualquiera de las dos mitades, el tablero pintaria
  ## cifras inventadas sin decirlo, que es el peor final posible
  html <- paste(readLines("../modules/tablero/index.html", warn = FALSE), collapse = "\n")
  expect_true(grepl('id="aviso-simulado"', html, fixed = TRUE))
  expect_true(grepl("oculto", html, fixed = TRUE))

  js <- paste(readLines("../modules/tablero/js/tablero_v2.js", warn = FALSE), collapse = "\n")
  expect_true(grepl("D.simulado", js, fixed = TRUE))
  expect_true(grepl("aviso-simulado", js, fixed = TRUE))

  css <- paste(readLines("../modules/tablero/css/tablero_v2.css", warn = FALSE), collapse = "\n")
  expect_true(grepl(".aviso-simulado", css, fixed = TRUE))
})
