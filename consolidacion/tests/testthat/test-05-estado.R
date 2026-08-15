##============================================================================##
# 5. La SQLite se conserva entre ejecuciones
#------------------------------------------------------------------------------#
# Simula lo que pasa en GitHub Actions, donde el disco muere con la corrida:
#
#   corrida 1  →  guardar estado  →  [se borra todo]  →  recuperar  →  corrida 2
#
# El repositorio privado se sustituye por uno local (bare) en una carpeta
# temporal: es la misma ruta de codigo, sin red ni credenciales. Lo que se
# verifica es que la corrida 2 EMPIECE donde termino la 1 —que es lo que se
# pierde si la persistencia falla— y no que el archivo exista.
#
# Se comprueba tambien lo que protege el cifrado: que sin la clave correcta no
# se pueda leer nada.
##============================================================================##

cargar_configuracion()

## sin git u openssl no hay nada que probar aqui
tiene <- function(programa) nzchar(Sys.which(programa))

test_that("la base sobrevive a que el disco se borre entre corridas", {
  skip_if(!tiene("git") || !tiene("openssl"), "hacen falta git y openssl")

  banco   <- file.path(tempdir(), paste0("sicmon-estado-", Sys.getpid()))
  unlink(banco, recursive = TRUE)
  entrada <- file.path(banco, "entrada")
  base    <- file.path(banco, "db/prueba.sqlite")
  remoto  <- file.path(banco, "remoto.git")
  dir.create(entrada, showWarnings = FALSE, recursive = TRUE)

  ## el "repositorio privado de estado", aqui local
  expect_equal(system2("git", c("init", "--bare", "--quiet", shQuote(remoto))), 0)

  entorno <- c(entorno_aislado(banco),
               sprintf("ESTADO_REPO=%s", remoto),
               "ESTADO_CLAVE=clave-de-prueba-larga-y-tonta")

  ## ---- corrida 1: una jornada de datos, y se guarda el estado ----
  file.copy("data/pruebas/viviendas_gestion_riesgo_20260813_0800.xlsx", entrada)
  file.copy("data/pruebas/personas_gestion_riesgo_20260813_0800.xlsx",  entrada)
  expect_equal(correr_pipeline(banco), 0)

  antes <- conteos(base)
  expect_gt(antes[["viviendas"]], 0)

  expect_equal(system2("bash", c("tools/estado_guardar.sh"), env = entorno,
                       stdout = FALSE, stderr = FALSE), 0)

  ## ---- el runner muere: se borra la base, no la carpeta de entrada ----
  unlink(file.path(banco, "db"), recursive = TRUE)
  expect_false(file.exists(base))

  ## ---- corrida 2: se recupera el estado y se vuelve a correr ----
  expect_equal(system2("bash", c("tools/estado_descargar.sh"), env = entorno,
                       stdout = FALSE, stderr = FALSE), 0)
  expect_true(file.exists(base))

  ## la base restaurada es la misma, no una nueva
  restaurados <- conteos(base)
  expect_equal(restaurados[c("personas", "viviendas", "familias")],
               antes[c("personas", "viviendas", "familias")])

  expect_equal(correr_pipeline(banco), 0)

  ## LA COMPROBACION QUE IMPORTA: como el estado volvio, la corrida 2 no
  ## reinserto lo que ya estaba. Sin persistencia, reg_insertados seria igual al
  ## total de registros y el historial habria empezado de cero.
  suppressMessages({ library(DBI); library(RSQLite) })
  con <- dbConnect(SQLite(), base)
  on.exit(dbDisconnect(con))
  expect_equal(dbGetQuery(con, "SELECT reg_insertados FROM processing_runs
                                ORDER BY run_id DESC LIMIT 1")$reg_insertados, 0)

  ## y el historial de corridas anteriores sigue ahi
  expect_gte(dbGetQuery(con, "SELECT COUNT(*) AS n FROM processing_runs")$n, 2)

  dbDisconnect(con)
  on.exit()
  unlink(banco, recursive = TRUE)
})

test_that("sin la clave correcta el estado guardado no se puede leer", {
  skip_if(!tiene("git") || !tiene("openssl"), "hacen falta git y openssl")

  banco  <- file.path(tempdir(), paste0("sicmon-clave-", Sys.getpid()))
  unlink(banco, recursive = TRUE)
  base   <- file.path(banco, "db/prueba.sqlite")
  remoto <- file.path(banco, "remoto.git")
  dir.create(file.path(banco, "db"), showWarnings = FALSE, recursive = TRUE)
  dir.create(file.path(banco, "entrada"), showWarnings = FALSE, recursive = TRUE)
  system2("git", c("init", "--bare", "--quiet", shQuote(remoto)))

  ## una base minima, valida
  suppressMessages({ library(DBI); library(RSQLite) })
  con <- dbConnect(SQLite(), base)
  dbExecute(con, "CREATE TABLE prueba (cedula TEXT)")
  dbExecute(con, "INSERT INTO prueba VALUES ('1005259871')")
  dbDisconnect(con)

  base_env <- c(entorno_aislado(banco), sprintf("ESTADO_REPO=%s", remoto))

  expect_equal(system2("bash", "tools/estado_guardar.sh",
                       env = c(base_env, "ESTADO_CLAVE=la-buena"),
                       stdout = FALSE, stderr = FALSE), 0)

  ## lo que quedo en el repositorio no es la base en claro
  cifrado <- file.path(banco, "revision")
  system2("git", c("clone", "--quiet", shQuote(remoto), shQuote(cifrado)))
  archivo <- file.path(cifrado, "base_oficial.sqlite.enc")
  expect_true(file.exists(archivo))

  ## se compara sobre los BYTES: un archivo cifrado tiene ceros en medio y
  ## rawToChar() se niega a convertirlo ("embedded nul in string")
  bytes <- readBin(archivo, "raw", file.size(archivo))
  expect_equal(length(grepRaw("SQLite format 3", bytes, all = TRUE)), 0)
  expect_equal(length(grepRaw("1005259871", bytes, all = TRUE)), 0)

  ## y sí empieza por la marca de openssl, es decir, está cifrado de verdad
  expect_equal(length(grepRaw("Salted__", bytes[1:8])), 1)

  ## y con otra clave no se restaura
  unlink(base)
  expect_gt(system2("bash", "tools/estado_descargar.sh",
                    env = c(base_env, "ESTADO_CLAVE=la-equivocada"),
                    stdout = FALSE, stderr = FALSE), 0)
  expect_false(file.exists(base))

  unlink(banco, recursive = TRUE)
})

test_that("guardar y recuperar funcionan con la ruta RELATIVA de la base", {
  skip_if(!tiene("git") || !tiene("openssl"), "hacen falta git y openssl")

  ## Es el caso de GitHub Actions, y el que se escapo: ahi SICMON_RUTA_DB no
  ## se define y la base queda en la ruta relativa por defecto
  ## (data/db/base_oficial.sqlite). Las demas pruebas de este archivo pasan
  ## rutas absolutas y por eso nunca vieron que estado_guardar.sh hacia cd al
  ## clon y desde ahi volvia a leer la base con la ruta relativa, que ya no
  ## apuntaba a nada. La primera corrida real termino en
  ## "base_oficial.sqlite: No such file or directory" justo al ir a guardar.
  banco  <- file.path(tempdir(), paste0("sicmon-relativa-", Sys.getpid()))
  unlink(banco, recursive = TRUE)
  remoto <- file.path(banco, "remoto.git")
  dir.create(file.path(banco, "trabajo/db"), showWarnings = FALSE, recursive = TRUE)
  system2("git", c("init", "--bare", "--quiet", shQuote(remoto)))

  suppressMessages({ library(DBI); library(RSQLite) })
  con <- dbConnect(SQLite(), file.path(banco, "trabajo/db/base.sqlite"))
  dbExecute(con, "CREATE TABLE t (x TEXT)"); dbExecute(con, "INSERT INTO t VALUES ('relativa')")
  dbDisconnect(con)
  huella <- tools::md5sum(file.path(banco, "trabajo/db/base.sqlite"))

  ## los scripts se lanzan DESDE banco/trabajo con una ruta relativa, igual que
  ## en el runner; system2 no tiene argumento de directorio, asi que se hace
  ## el cd dentro del comando
  correr <- function(script) {
    system2("bash", c("-c", shQuote(sprintf("cd %s && bash %s/tools/%s",
                                             shQuote(file.path(banco, "trabajo")),
                                             shQuote(getwd()), script))),
            env = c("SICMON_RUTA_DB=db/base.sqlite",
                    sprintf("ESTADO_REPO=%s", remoto), "ESTADO_CLAVE=clave-relativa"),
            stdout = FALSE, stderr = FALSE)
  }

  expect_equal(correr("estado_guardar.sh"), 0)
  unlink(file.path(banco, "trabajo/db/base.sqlite"))
  expect_equal(correr("estado_descargar.sh"), 0)
  expect_equal(unname(tools::md5sum(file.path(banco, "trabajo/db/base.sqlite"))), unname(huella))

  unlink(banco, recursive = TRUE)
})

test_that("sin repositorio de estado configurado no se rompe nada", {
  skip_if(!tiene("git"), "hace falta git")

  ## es el caso de la maquina del equipo: la base vive en el disco y no hay
  ## nada que traer ni que subir. Los dos scripts deben terminar en 0.
  banco <- file.path(tempdir(), paste0("sicmon-sinrepo-", Sys.getpid()))
  dir.create(file.path(banco, "db"), showWarnings = FALSE, recursive = TRUE)
  entorno <- entorno_aislado(banco)

  expect_equal(system2("bash", "tools/estado_descargar.sh", env = entorno,
                       stdout = FALSE, stderr = FALSE), 0)
  expect_equal(system2("bash", "tools/estado_guardar.sh", env = entorno,
                       stdout = FALSE, stderr = FALSE), 0)

  unlink(banco, recursive = TRUE)
})
