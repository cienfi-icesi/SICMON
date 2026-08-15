##============================================================================##
# 2. Los registros nuevos se extraen correctamente
#------------------------------------------------------------------------------#
# Dos partes, y la segunda es la que de verdad importa:
#
#   (a) contra la hoja real: que exportar_tabla devuelva paginas coherentes con
#       lo que dijo el inventario, y con los encabezados que 01_ingest.R espera.
#   (b) sin red: que la ingestion DETECTE lo nuevo. Se corre el pipeline sobre
#       una carpeta, se agrega un archivo con registros que no estaban y se
#       vuelve a correr; tienen que aparecer como insertados y nada mas.
#
# La (b) es la que cubre el caso que rompe en produccion: no "la descarga
# funciona" sino "lo que llego nuevo entro, y lo que ya estaba no se volvio a
# contar".
##============================================================================##

cargar_configuracion()

test_that("exportar_tabla devuelve lo que el inventario prometio", {
  saltar_si_no_hay_red()

  inventario <- pedir_al_receptor(list(accion = "inventario"))
  skip_if(!isTRUE(inventario$ok), "el inventario no respondio")

  filas_viviendas <- inventario$tablas$filas[inventario$tablas$tabla == "viviendas"]
  skip_if(length(filas_viviendas) == 0 || filas_viviendas == 0,
          "la hoja de viviendas esta vacia; no hay nada que extraer")

  pagina <- pedir_al_receptor(list(accion = "exportar_tabla", tabla = "viviendas",
                                   desde = 1, limite = 5))

  expect_true(isTRUE(pagina$ok))
  expect_true(pagina$devueltas > 0)
  expect_equal(ncol(as.data.frame(pagina$filas)), length(pagina$encabezados))

  ## las columnas de las que 01_ingest.R saca la llave y la fecha. Si la app
  ## renombra una, la ingestion no falla: mete NA en silencio y el registro
  ## queda sin direccion ni control de version
  expect_true(all(c("id_encuesta", "fecha_actualizacion") %in% pagina$encabezados))
})

test_that("una tabla que no esta en la lista blanca no se puede extraer", {
  saltar_si_no_hay_red()

  ## _respaldos guarda el JSON integro de cada encuesta; queda fuera de
  ## TABLAS_PERMITIDAS a proposito
  respuesta <- pedir_al_receptor(list(accion = "exportar_tabla", tabla = "_respaldos",
                                      desde = 1, limite = 1))

  expect_false(isTRUE(respuesta$ok))
})

test_that("los registros nuevos entran y los viejos no se recuentan", {
  banco <- file.path(tempdir(), paste0("sicmon-ingesta-", Sys.getpid()))
  unlink(banco, recursive = TRUE)
  entrada <- file.path(banco, "entrada")
  base    <- file.path(banco, "db/prueba.sqlite")
  dir.create(entrada, showWarnings = FALSE, recursive = TRUE)

  ## primera jornada
  file.copy("data/pruebas/viviendas_gestion_riesgo_20260813_0800.xlsx", entrada)
  file.copy("data/pruebas/personas_gestion_riesgo_20260813_0800.xlsx",  entrada)
  expect_equal(correr_pipeline(banco), 0)

  primera <- conteos(base)
  expect_gt(primera[["viviendas"]], 0)
  expect_gt(primera[["personas"]],  0)

  ## segunda jornada: un archivo mas, con registros que no estaban
  file.copy("data/pruebas/viviendas_gestion_riesgo_20260814_0800.xlsx", entrada)
  file.copy("data/pruebas/personas_gestion_riesgo_20260814_0800.xlsx",  entrada)
  expect_equal(correr_pipeline(banco), 0)

  segunda <- conteos(base)
  expect_gt(segunda[["viviendas"]], primera[["viviendas"]])
  expect_gt(segunda[["personas"]],  primera[["personas"]])

  ## la corrida tuvo que reportar inserciones y NO reprocesar los dos archivos
  ## de la primera jornada: su hash no cambio
  suppressMessages({ library(DBI); library(RSQLite) })
  con <- dbConnect(SQLite(), base)
  on.exit(dbDisconnect(con))
  ultima <- dbGetQuery(con, "SELECT archivos_procesados, reg_insertados
                             FROM processing_runs ORDER BY run_id DESC LIMIT 1")
  expect_equal(ultima$archivos_procesados, 2)
  expect_gt(ultima$reg_insertados, 0)

  unlink(banco, recursive = TRUE)
})
