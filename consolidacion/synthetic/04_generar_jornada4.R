##============================================================================##
# 04_generar_jornada4.R  —  Datos sinteticos: jornada 4 (20 hogares)
#------------------------------------------------------------------------------#
# Tanda mas grande que las jornadas 1-3, pensada para probar el tablero y la
# consulta con un volumen mas realista: 20 hogares distintos, repartidos entre
# las dos secretarias, con variedad de comunas, edades, generos, estados de
# salud, necesidades y niveles de dano. Es "como si" 20 encuestas reales
# hubieran llegado en un mismo dia de campo.
#
# NO reemplaza las jornadas 1-3 (que prueban casos puntuales de matching y
# duplicados): esta prueba volumen y variedad. Se puede correr sola, sin las
# otras, o despues de ellas.
##============================================================================##

## configuracion inicial
rm(list = ls())
source("config/packages.R")
source("config/parameters.R")             # CARPETA_PRUEBAS
source("synthetic/00_expandir_plantilla.R")

## path
## datos ficticios: van a la carpeta de pruebas, NUNCA a la que vigila
## 01_ingest.R, para que no se mezclen con lo que llega de la hoja
out <- CARPETA_PRUEBAS
dir.create(out, showWarnings = F, recursive = T)

## plantillas reales y libro de codigos
plantilla_viv <- as.data.frame(fread("synthetic/insumos/plantilla_viviendas.csv", encoding = "UTF-8", nrows = 1))
plantilla_per <- as.data.frame(fread("synthetic/insumos/plantilla_personas.csv",  encoding = "UTF-8", nrows = 1))
diccionario   <- as.data.frame(fread("synthetic/insumos/diccionario_variables.csv", encoding = "UTF-8"))

set.seed(2026)  ## reproducible: la misma jornada sale igual cada vez que se genera

##============================================================================##
##=== 1. Veinte hogares: nombre, comuna aproximada y escenario             ===##
##============================================================================##

## coordenadas ancla ya verificadas contra el geojson de comunas (cali-geo.js);
## cada hogar se ubica cerca de una de ellas con un jitter pequeño, para caer
## dentro de la misma comuna real y no fuera del perimetro urbano
anclas <- tibble(comuna_ref = c(1, 2, 3, 3, 4, 5, 6, 6, 7, 8, 8, 9, 10, 11, 13, 15, 17, 19, 19, 22),
                 lat = c(3.4780, 3.4610, 3.4560, 3.4570, 3.4750, 3.4550, 3.4680, 3.4690,
                        3.4390, 3.3980, 3.3990, 3.4210, 3.4110, 3.4030, 3.3750, 3.3480,
                        3.3820, 3.4405, 3.4406, 3.3720),
                 lon = c(-76.5320, -76.5250, -76.5180, -76.5190, -76.5010, -76.5090, -76.5040, -76.5050,
                        -76.5280, -76.5400, -76.5410, -76.5210, -76.5150, -76.5230, -76.5330, -76.5390,
                        -76.5470, -76.5330, -76.5331, -76.5460))

hogares <- tibble(
  hog = sprintf("HOG-J4-%02d", 1:20),
  nombre_prop = c("Diana Castro","Alvaro Munoz","Fabiola Ospina","Jorge Salazar","Marcela Zapata",
                  "Hernan Botero","Yolanda Correa","Ricardo Palacios","Beatriz Nino","Wilson Cardenas",
                  "Esperanza Rios","Gustavo Trujillo","Nancy Arboleda","Ivan Escobar","Consuelo Ramirez",
                  "Fernando Giraldo","Patricia Valencia","Alberto Quintero","Rosalba Pena","Camilo Duran"),
  cedula_prop = sprintf("11%06d", 100 + 1:20),
  secretaria  = rep(c("gestion_riesgo", "vivienda"), 10),
  usuario     = rep(c("gabriela", "laura"), 10),
  fecha       = rep(c("2026-08-16", "2026-08-17", "2026-08-18"), length.out = 20),
  n_personas  = c(1,2,3,4,2,5,1,3,2,4,3,2,6,1,2,3,4,2,3,2),
  cumple_req  = sample(c("si","si","si","no"), 20, replace = T),
  requiere_ev = sample(c("no","no","no","si"), 20, replace = T),
  sistema     = sample(c("mamposteria","mamposteria","mamposteria","madera"), 20, replace = T),
  nivel_dano  = sample(c("leve","moderado","moderado","severo","colapso_total"), 20, replace = T),
  ## una ancla por hogar, en el mismo orden (20 filas cada una): jitter pequeño
  ## para que no queden dos viviendas en el punto exacto, sin salirse de la comuna
  lat = anclas$lat + runif(20, -0.0015, 0.0015),
  lon = anclas$lon + runif(20, -0.0015, 0.0015)
)

vias   <- c("Cra","Calle","Carrera","Cl","Av","Dg","Tv")
sufijos <- c("Ninguno","Ninguno","Ninguno","Norte","Oeste")
hogares$direccion <- sprintf("%s %d # %d-%d, Casa",
                             sample(vias, 20, replace = T), sample(3:120, 20),
                             sample(1:99, 20), sample(1:99, 20))

##============================================================================##
##=== 2. Viviendas (una fila por hogar)                                    ===##
##============================================================================##

viv <- tibble(id_encuesta         = paste0("VIV-J4-", sprintf("%02d", 1:20)),
             tipo_formulario     = "vivienda",
             id_hogar            = hogares$hog,
             secretaria          = hogares$secretaria,
             secretaria_nombre   = ifelse(hogares$secretaria == "gestion_riesgo",
                                          "Secretaría de Gestión del Riesgo", "Secretaría de Vivienda"),
             usuario             = hogares$usuario,
             usuario_nombre      = ifelse(hogares$usuario == "gabriela", "Gabriela", "Laura"),
             rol                 = "diligenciador",
             estado              = "finalizada",
             fecha               = hogares$fecha,
             hora                = sprintf("%02d:%02d:00", sample(7:17, 20, replace = T), sample(0:59, 20, replace = T)),
             fecha_actualizacion = paste0(hogares$fecha, "T", sprintf("%02d:%02d:00", sample(7:17, 20, replace = T), sample(0:59, 20, replace = T))),
             viv_prop_nombres_apellidos = hogares$nombre_prop,
             viv_prop_cc         = hogares$cedula_prop,
             viv_prop_telefono   = sprintf("300%07d", 1000000 + 1:20),
             viv_inf_nombre      = hogares$nombre_prop,
             viv_inf_cc          = hogares$cedula_prop,
             viv_inf_telefono    = sprintf("300%07d", 1000000 + 1:20),
             viv_prof_organismo  = ifelse(hogares$secretaria == "gestion_riesgo",
                                          "Secretaría de Gestión del Riesgo", "Secretaría de Vivienda"),
             viv_fecha_evaluacion = hogares$fecha,
             viv_departamento    = "Valle del Cauca",
             viv_municipio       = "Santiago de Cali",
             viv_cumple_requisitos   = hogares$cumple_req,
             viv_requiere_evacuacion = hogares$requiere_ev,
             tipo_via            = sub(" .*", "", hogares$direccion),
             numero_via          = sample(3:120, 20),
             sufijo_via          = sample(sufijos, 20, replace = T),
             numero_generador    = sample(1:99, 20),
             placa_inmueble      = sample(1:99, 20),
             tipo_inmueble       = "Casa",
             direccion_completa  = hogares$direccion,
             latitud             = hogares$lat,
             longitud            = hogares$lon,
             sistema_coordenadas = "EPSG:4326",
             fuente_georreferenciacion = sample(c("GPS","GPS","MAPA"), 20, replace = T),
             ubicacion_confirmada = "Sí",
             viv_tipo_evento     = "sismo",
             viv_sistema_constructivo = hogares$sistema,
             viv_mam_vigas_columnas_afectado = ifelse(hogares$sistema == "mamposteria", "si", NA),
             viv_mam_vigas_columnas_nivel    = ifelse(hogares$sistema == "mamposteria", hogares$nivel_dano, NA),
             viv_mam_muros_carga_afectado    = ifelse(hogares$sistema == "mamposteria",
                                                       sample(c("si","no"), 20, replace = T), NA),
             viv_mam_muros_carga_nivel       = ifelse(hogares$sistema == "mamposteria", hogares$nivel_dano, NA),
             viv_mad_vigas_columnas_afectado = ifelse(hogares$sistema == "madera", "si", NA),
             viv_mad_vigas_columnas_nivel    = ifelse(hogares$sistema == "madera", hogares$nivel_dano, NA))

## export data (estructura completa de 222 columnas)
export(expandir_plantilla(viv, plantilla_viv, diccionario),
       file.path(out, "viviendas_jornada4_20260816_0700.xlsx"))

##============================================================================##
##=== 3. Personas (una o mas por hogar, segun n_personas)                  ===##
##============================================================================##

nombres_m <- c("Julian","Andres","Santiago","Mateo","Nicolas","Sebastian","Emmanuel","Samuel","Tomas","Simon")
nombres_f <- c("Valentina","Isabella","Maria","Sofia","Camila","Antonella","Salome","Emilia","Luciana","Martina")
apellidos <- c("Castro","Munoz","Ospina","Salazar","Zapata","Botero","Correa","Palacios","Nino","Cardenas")

filas_per <- list()
for (i in 1:20) {
  n <- hogares$n_personas[i]
  genero <- sample(c("F","M"), n, replace = T)
  ## jefe(a) de hogar es siempre la primera persona, con la cedula del propietario
  parentesco <- c("1", sample(c("2","3","4","5","6","7","8"), max(0, n - 1), replace = T))
  edad <- c(sample(28:75, 1), sample(0:90, max(0, n - 1), replace = T))
  documento <- c(hogares$cedula_prop[i], sprintf("11%06d", 200 + (i - 1) * 10 + seq_len(max(0, n - 1))))
  nombre <- ifelse(genero == "F", sample(nombres_f, n, replace = T), sample(nombres_m, n, replace = T))

  filas_per[[i]] <- tibble(
    id_encuesta         = paste0("PER-J4-", sprintf("%02d", i)),
    tipo_formulario     = "personas",
    id_hogar            = hogares$hog[i],
    secretaria          = hogares$secretaria[i],
    secretaria_nombre   = ifelse(hogares$secretaria[i] == "gestion_riesgo",
                                 "Secretaría de Gestión del Riesgo", "Secretaría de Vivienda"),
    usuario             = hogares$usuario[i],
    usuario_nombre      = ifelse(hogares$usuario[i] == "gabriela", "Gabriela", "Laura"),
    rol                 = "diligenciador",
    estado              = "finalizada",
    fecha               = hogares$fecha[i],
    hora                = sprintf("%02d:%02d:00", sample(7:17, 1), sample(0:59, 1)),
    fecha_actualizacion = paste0(hogares$fecha[i], "T", sprintf("%02d:%02d:00", sample(7:17, 1), sample(0:59, 1))),
    persona_num         = 1:n,
    id_persona          = sprintf("PER-J4-%02d-P%02d", i, 1:n),
    per_nombres         = nombre,
    per_apellidos       = sample(apellidos, n, replace = T),
    per_tipo_documento  = ifelse(edad < 7, "1", ifelse(edad < 18, "2", "3")),
    per_numero_documento = documento,
    per_parentesco      = parentesco,
    per_genero          = genero,
    per_edad            = edad,
    per_etnia           = sample(c("6","6","6","1","2"), n, replace = T),
    ## una persona por hogar con necesidad de asistencia medica, en 6 de los 20 hogares
    per_estado_salud    = if (i %% 3 == 0) c("1", rep("2", max(0, n - 1))) else rep("2", n),
    per_afiliacion_salud = sample(c("1","1","2","2","3"), n, replace = T),
    per_ubicacion_inmueble = "urbano",
    per_propiedad_inmueble = ifelse(runif(n) < 0.75, "propia", "arriendo"),
    per_estado_inmueble = rep(sample(c("1","1","2","3"), 1), n),
    per_ahe_alimentaria = rep(sample(c("si","no"), 1, prob = c(0.55, 0.45)), n),
    per_ahe_no_alimentaria = rep(sample(c("si","no"), 1, prob = c(0.4, 0.6)), n),
    per_mat_rehab_vivienda = rep(sample(c("si","no"), 1, prob = c(0.6, 0.4)), n),
    per_sub_arriendo    = rep(sample(c("si","no"), 1, prob = c(0.3, 0.7)), n)
  )
}
per <- bind_rows(filas_per)

## export data
export(expandir_plantilla(per, plantilla_per, diccionario),
       file.path(out, "personas_jornada4_20260816_0700.xlsx"))

cat(sprintf("jornada 4 generada en %s: 20 hogares, %d personas\n", out, nrow(per)))
