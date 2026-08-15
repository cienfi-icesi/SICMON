##============================================================================##
# 9. El pipeline puede ejecutarse sin intervencion humana
#------------------------------------------------------------------------------#
# La prueba 4 ya demuestra que corre de punta a punta sin que nadie teclee nada.
# Esta cubre lo que esa no ve: las trampas que solo aparecen en un runner, donde
# no hay quien conteste una pregunta ni un navegador que abrir.
#
#   - ningun paso pide entrada por consola ni abre nada
#   - el canal de Drive, que SI necesita un navegador, se puede apagar y el
#     pipeline lo salta sin tumbar la corrida
#   - el token puede entrar por variable de entorno, sin archivo en disco
#   - el workflow existe, esta bien formado y no lleva ningun secreto escrito
##============================================================================##

cargar_configuracion()

test_that("ningun paso del pipeline espera una respuesta de la consola", {
  scripts <- list.files("pipeline", pattern = "\\.R$", full.names = TRUE)
  expect_gt(length(scripts), 0)

  ## readline() y menu() bloquean para siempre en un proceso sin terminal;
  ## browseURL() y drive_auth() interactivo intentan abrir un navegador
  prohibidas <- "\\breadline\\s*\\(|\\breadLines\\s*\\(\\s*[\"']stdin|\\bmenu\\s*\\(|\\bbrowseURL\\s*\\(|\\binteractive\\s*\\(\\s*\\)"

  hallazgos <- character(0)
  for (script in scripts) {
    lineas <- readLines(script, warn = FALSE)
    lineas <- lineas[!grepl("^\\s*#", lineas)]          ## los comentarios no ejecutan
    if (any(grepl(prohibidas, lineas))) hallazgos <- c(hallazgos, script)
  }

  expect_equal(hallazgos, character(0),
               info = paste("piden intervencion:", paste(hallazgos, collapse = ", ")))
})

test_that("el canal de Drive se puede apagar desde el entorno", {
  ## Es el unico paso que necesita OAuth de usuario, es decir un navegador. En
  ## GitHub Actions va apagado; esta prueba confirma que el interruptor
  ## funciona y que apagarlo no rompe nada.
  antes <- Sys.getenv("SICMON_CONECTAR_DRIVE")
  on.exit(Sys.setenv(SICMON_CONECTAR_DRIVE = antes))

  Sys.setenv(SICMON_CONECTAR_DRIVE = "false")
  source("config/parameters.R", local = TRUE)
  expect_false(CONECTAR_DRIVE)

  Sys.setenv(SICMON_CONECTAR_DRIVE = "true")
  source("config/parameters.R", local = TRUE)
  expect_true(CONECTAR_DRIVE)

  ## y con el apagado, el paso termina en 0 en vez de fallar
  rscript <- file.path(R.home("bin"), "Rscript")
  banco   <- file.path(tempdir(), paste0("sicmon-drive-", Sys.getpid()))
  dir.create(banco, showWarnings = FALSE, recursive = TRUE)
  codigo  <- system2(rscript, "pipeline/00_conectar_drive.R",
                     env = c(entorno_aislado(banco), "SICMON_CONECTAR_DRIVE=false"),
                     stdout = FALSE, stderr = FALSE)
  expect_equal(codigo, 0)
  unlink(banco, recursive = TRUE)
})

test_that("el token de extraccion puede venir del entorno, sin archivo", {
  antes_token <- Sys.getenv("SICMON_TOKEN_EXPORTACION")
  antes_ruta  <- Sys.getenv("SICMON_RUTA_TOKEN_HOJA")
  on.exit({
    Sys.setenv(SICMON_TOKEN_EXPORTACION = antes_token,
               SICMON_RUTA_TOKEN_HOJA   = antes_ruta)
    source("config/parameters.R")
  })

  ## Se apunta la ruta del archivo a uno que no existe, POR EL ENTORNO y no con
  ## una asignacion local: token_exportacion() esta definida en el entorno
  ## global y ahi es donde busca RUTA_TOKEN_HOJA. Una variable local dentro de
  ## test_that() no la ve, y la prueba leeria el token real de la maquina y
  ## pasaria por la razon equivocada.
  Sys.setenv(SICMON_RUTA_TOKEN_HOJA   = file.path(tempdir(), "no-existe-este-archivo.txt"),
             SICMON_TOKEN_EXPORTACION = "  token-de-prueba  ")
  source("config/parameters.R")

  expect_equal(token_exportacion(), "token-de-prueba")   ## y viene sin espacios

  ## sin ninguna de las dos vias, el mensaje tiene que decir como arreglarlo
  Sys.setenv(SICMON_TOKEN_EXPORTACION = "")
  expect_error(token_exportacion(), "SICMON_TOKEN_EXPORTACION")
})

test_that("el workflow de GitHub Actions existe y no lleva secretos escritos", {
  ruta <- "../.github/workflows/consolidacion.yml"
  expect_true(file.exists(ruta))

  texto <- readLines(ruta, warn = FALSE)
  unido <- paste(texto, collapse = "\n")

  ## los tres disparadores
  expect_true(grepl("repository_dispatch", unido))
  expect_true(grepl("schedule", unido))
  expect_true(grepl("workflow_dispatch", unido))

  ## El estado se recupera ANTES de correr y se guarda DESPUES; al reves, cada
  ## corrida empezaria de cero.
  ##
  ## Se buscan los comandos completos y no los nombres de archivo: el encabezado
  ## del workflow menciona run_pipeline.R en un comentario, y buscar solo el
  ## nombre daba con esa linea, muy por encima de los pasos reales.
  linea_de <- function(comando) which(grepl(comando, texto, fixed = TRUE))[1]
  paso_bajar   <- linea_de("bash tools/estado_descargar.sh")
  paso_correr  <- linea_de("Rscript pipeline/run_pipeline.R")
  paso_guardar <- linea_de("bash tools/estado_guardar.sh")

  expect_false(any(is.na(c(paso_bajar, paso_correr, paso_guardar))))
  expect_lt(paso_bajar,  paso_correr)
  expect_lt(paso_correr, paso_guardar)

  ## Drive apagado: en un runner no hay navegador que autorice el OAuth
  expect_true(grepl("SICMON_CONECTAR_DRIVE: 'false'", unido))

  ## toda credencial entra por secrets.*, ninguna esta escrita
  for (variable in c("SICMON_TOKEN_EXPORTACION", "ESTADO_TOKEN", "ESTADO_CLAVE", "ESTADO_REPO")) {
    linea <- texto[grepl(paste0("^\\s*", variable, ":"), texto)]
    expect_length(linea, 1)
    expect_true(grepl("\\$\\{\\{\\s*secrets\\.", linea),
                info = sprintf("%s no viene de secrets: %s", variable, linea))
  }
})
