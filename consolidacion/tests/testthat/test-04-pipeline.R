##============================================================================##
# 4. El pipeline se ejecuta correctamente
#------------------------------------------------------------------------------#
# De punta a punta contra una base temporal, con los tres canales de Google
# apagados. Se verifica lo que tiene que quedar despues de una corrida:
#
#   - codigo de salida 0 y la corrida cerrada en estado 'ok'
#   - las tablas de la consolidacion pobladas y enlazadas entre si
#   - los volcados de salida escritos DONDE se configuro, y no dentro del repo
#   - una corrida en vacio (sin un solo archivo) tambien termina bien: es el
#     estado normal de un dia sin trabajo de campo, no un error
##============================================================================##

cargar_configuracion()

test_that("una corrida completa termina en ok y deja la base consolidada", {
  banco <- file.path(tempdir(), paste0("sicmon-pipe-", Sys.getpid()))
  unlink(banco, recursive = TRUE)
  entrada <- file.path(banco, "entrada")
  base    <- file.path(banco, "db/prueba.sqlite")
  dir.create(entrada, showWarnings = FALSE, recursive = TRUE)

  for (f in c("viviendas_gestion_riesgo_20260813_0800.xlsx",
              "personas_gestion_riesgo_20260813_0800.xlsx")) {
    file.copy(file.path("data/pruebas", f), entrada)
  }

  ## Se anota la fecha de los volcados que viven dentro de los modulos, si
  ## quedaron de la arquitectura anterior. No se comprueba que NO EXISTAN —el
  ## archivo viejo puede seguir en el disco de quien trabaja en el tablero, y
  ## esta ignorado— sino que esta corrida no los TOCA.
  en_modulos <- c("../modules/tablero/js/datos_tablero.js",
                  "../modules/consulta/js/datos.js")
  antes <- file.mtime(en_modulos)

  expect_equal(correr_pipeline(banco), 0)
  expect_true(file.exists(base))

  suppressMessages({ library(DBI); library(RSQLite) })
  con <- dbConnect(SQLite(), base)
  on.exit(dbDisconnect(con))

  corrida <- dbGetQuery(con, "SELECT estado, fin FROM processing_runs ORDER BY run_id DESC LIMIT 1")
  expect_equal(corrida$estado, "ok")
  expect_true(nzchar(corrida$fin))       ## cerrada, no colgada en 'en_curso'

  ## las cuatro tablas de la consolidacion
  n <- conteos(base)
  expect_gt(n[["viviendas"]], 0)
  expect_gt(n[["personas"]],  0)
  expect_gt(n[["familias"]],  0)

  ## 03_matching corrio: cada familia tiene un estado, ninguno vacio
  sin_estado <- dbGetQuery(con, "SELECT COUNT(*) AS n FROM familias
                                 WHERE match_status IS NULL OR match_status = ''")$n
  expect_equal(sin_estado, 0)

  ## y algo enlazo de verdad: si TODO quedara no_match, el matching estaria roto
  ## aunque el pipeline dijera ok
  enlazadas <- dbGetQuery(con, "SELECT COUNT(*) AS n FROM familias
                                WHERE match_status LIKE 'matched%'")$n
  expect_gt(enlazadas, 0)

  ## el volcado del tablero fue a donde se le dijo, que esta fuera del repo
  expect_true(file.exists(file.path(banco, "tablero/js/datos_tablero.js")))
  expect_true(file.exists(file.path(banco, "salida/js/datos.js")))

  ## y NO se escribio dentro de los modulos publicados, que es la carpeta que
  ## sirve GitHub Pages
  expect_equal(file.mtime(en_modulos), antes)

  ## el lockfile se libera al terminar; si quedara, la corrida siguiente se
  ## saltaria sola durante LOCK_MAX_MIN minutos
  expect_false(file.exists(file.path(banco, "db/pipeline.lock")))

  dbDisconnect(con)
  on.exit()
  unlink(banco, recursive = TRUE)
})

test_that("una corrida sin archivos nuevos tambien termina bien", {
  banco <- file.path(tempdir(), paste0("sicmon-vacio-", Sys.getpid()))
  unlink(banco, recursive = TRUE)
  dir.create(file.path(banco, "entrada"), showWarnings = FALSE, recursive = TRUE)

  ## carpeta de ingesta vacia y sin base previa: el arranque en frio
  expect_equal(correr_pipeline(banco), 0)

  base <- file.path(banco, "db/prueba.sqlite")
  expect_true(file.exists(base))

  suppressMessages({ library(DBI); library(RSQLite) })
  con <- dbConnect(SQLite(), base)
  on.exit(dbDisconnect(con))
  expect_equal(dbGetQuery(con, "SELECT estado FROM processing_runs ORDER BY run_id DESC LIMIT 1")$estado,
               "ok")

  dbDisconnect(con)
  on.exit()
  unlink(banco, recursive = TRUE)
})
