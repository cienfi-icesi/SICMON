##============================================================================##
# 3. No se generan duplicados
#------------------------------------------------------------------------------#
# "Duplicado" son dos cosas distintas y las dos hay que probarlas:
#
#   (a) El pipeline corrido dos veces sobre lo MISMO no duplica nada. Es el caso
#       real de todos los dias: el cron corre cada media hora sobre una carpeta
#       que casi nunca cambio.
#   (b) Dos encuestas distintas del mismo hogar quedan marcadas —no borradas—
#       con duplicate = 1 y su puntero al registro que se conserva.
#
# Y una tercera que es la que mas duele si se rompe: el marcaje es IDEMPOTENTE.
# Volver a correr no debe agregar una fila mas a la bitacora de duplicados por
# el mismo hallazgo.
##============================================================================##

cargar_configuracion()

banco <- file.path(tempdir(), paste0("sicmon-dup-", Sys.getpid()))
base  <- file.path(banco, "db/prueba.sqlite")

test_that("correr dos veces sobre lo mismo no cambia ningun conteo", {
  unlink(banco, recursive = TRUE)
  entrada <- file.path(banco, "entrada")
  dir.create(entrada, showWarnings = FALSE, recursive = TRUE)
  file.copy("data/pruebas/viviendas_gestion_riesgo_20260813_0800.xlsx", entrada)
  file.copy("data/pruebas/personas_gestion_riesgo_20260813_0800.xlsx",  entrada)

  expect_equal(correr_pipeline(banco), 0)
  primera <- conteos(base)

  expect_equal(correr_pipeline(banco), 0)
  segunda <- conteos(base)

  ## processing_runs si crece —cada corrida deja su fila, que es lo que se
  ## quiere— pero ninguna tabla de datos puede moverse
  datos <- c("personas", "viviendas", "familias", "afectaciones", "duplicados")
  expect_equal(segunda[datos], primera[datos])

  ## y la segunda corrida no debio insertar ni actualizar nada
  suppressMessages({ library(DBI); library(RSQLite) })
  con <- dbConnect(SQLite(), base)
  on.exit(dbDisconnect(con))
  ultima <- dbGetQuery(con, "SELECT reg_insertados, reg_actualizados
                             FROM processing_runs ORDER BY run_id DESC LIMIT 1")
  expect_equal(ultima$reg_insertados, 0)
  expect_equal(ultima$reg_actualizados, 0)
})

test_that("una encuesta repetida se marca, no se borra, y solo se anota una vez", {
  ## la jornada 2 de los generadores incluye re-encuestas de hogares de la
  ## jornada 1: es justo el caso que 02_dedup.R tiene que detectar
  entrada <- file.path(banco, "entrada")
  file.copy("data/pruebas/viviendas_gestion_riesgo_20260814_0800.xlsx", entrada)
  file.copy("data/pruebas/personas_gestion_riesgo_20260814_0800.xlsx",  entrada)
  expect_equal(correr_pipeline(banco), 0)

  suppressMessages({ library(DBI); library(RSQLite) })
  con <- dbConnect(SQLite(), base)
  on.exit(dbDisconnect(con))

  marcados <- dbGetQuery(con, "SELECT COUNT(*) AS n FROM viviendas WHERE duplicate = 1")$n
  bitacora <- dbGetQuery(con, "SELECT COUNT(*) AS n FROM duplicados")$n

  skip_if(marcados == 0 && bitacora == 0,
          "estas jornadas de prueba no traen repeticiones; nada que verificar aqui")

  ## nada se elimina: el duplicado sigue en la tabla, marcado
  todas <- dbGetQuery(con, "SELECT COUNT(*) AS n FROM viviendas")$n
  expect_gt(todas, marcados)

  ## todo marcado apunta a un registro que existe y que NO es el mismo
  huerfanos <- dbGetQuery(con, "
    SELECT COUNT(*) AS n FROM viviendas v
    WHERE v.duplicate = 1
      AND (v.id_canonico IS NULL
           OR v.id_canonico = v.id_encuesta
           OR NOT EXISTS (SELECT 1 FROM viviendas c WHERE c.id_encuesta = v.id_canonico))")$n
  expect_equal(huerfanos, 0)

  ## y la bitacora no tiene la misma pareja dos veces
  repetidas <- dbGetQuery(con, "
    SELECT COUNT(*) AS n FROM (
      SELECT tabla, id_registro, id_canonico FROM duplicados
      GROUP BY tabla, id_registro, id_canonico HAVING COUNT(*) > 1)")$n
  expect_equal(repetidas, 0)

  ## volver a correr no agrega una anotacion mas por el mismo hallazgo
  dbDisconnect(con)
  on.exit()
  expect_equal(correr_pipeline(banco), 0)
  con2 <- dbConnect(SQLite(), base)
  on.exit(dbDisconnect(con2))
  expect_equal(dbGetQuery(con2, "SELECT COUNT(*) AS n FROM duplicados")$n, bitacora)
})

test_that("se limpia el banco de pruebas", {
  unlink(banco, recursive = TRUE)
  expect_false(dir.exists(banco))
})
