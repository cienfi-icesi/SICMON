# Consolidación de bases de afectados — Santiago de Cali

Pipeline que lee los archivos Excel de las encuestas (viviendas y
personas/familias), los cruza, controla duplicados y mantiene una **base de
datos oficial** en SQLite, actualizada automáticamente cada 10 minutos.

Universidad Icesi · CIENFI · Alcaldía de Santiago de Cali

Vive dentro del repositorio del portal SICMON, en `web_damage_cali/consolidacion/`,
para que todo el sistema —formularios, pipeline, consulta, tablero— quede en
un solo repositorio. Alimenta dos aplicativos, los dos módulos del portal:

- **El aplicativo de consulta** (`../modules/consulta/`, sección 9).
- **El tablero de control** (`../modules/tablero/`, sección 9).

Los formularios que generan los Excel viven en `../modules/edan/`, dentro de
este mismo repositorio.

> **Estado actual: el sistema corre con la base simulada.** Mientras la
> operación real arranca, `config/parameters.R` apunta la ingesta a
> `data/pruebas` y la base a `base_simulada.sqlite`, así que la consulta y el
> tablero muestran cifras ficticias. La base real (`base_oficial.sqlite`)
> queda congelada y sus dos canales (Drive y hoja) apagados. En ese mismo
> archivo están las tres líneas para volver al canal real.

---

## 1. Instalación

Requiere R (≥ 4.5) con estos paquetes:

```r
install.packages(c("dplyr", "tidyr", "rio", "data.table", "DBI", "RSQLite",
                   "digest", "jsonlite", "stringi", "stringdist", "googledrive"))
```

No hay nada más que instalar: la base es un archivo SQLite que el pipeline
crea solo la primera vez.

## 2. Estructura del repositorio

```
web_damage_cali/
├── modules/
│   ├── edan/              formularios de captura + apps-script/Codigo.gs,
│   │                       el receptor que guarda en la hoja y entrega
│   │                       las tablas a este pipeline
│   ├── consulta/           aplicativo de consulta (lo alimenta este pipeline)
│   └── tablero/            tablero de control (también lo alimenta)
└── consolidacion/          ESTE DIRECTORIO
    ├── config/
    │   ├── packages.R        librerías
    │   ├── parameters.R      rutas, umbrales y frecuencia
    │   └── functions.R       normalización, llave de dirección, conexión, logs
    ├── pipeline/
    │   ├── 00_conectar_drive.R  descarga los Excel desde Google Drive a
    │   │                     CARPETA_INGESTA; nunca detiene la corrida
    │   ├── 00_conectar_hoja.R   baja las tablas desde la hoja del Apps
    │   │                     Script a CARPETA_INGESTA; tampoco la detiene
    │   ├── 01_ingest.R       ingestión incremental de Excel y CSV
    │   ├── 02_dedup.R        detección y marcaje de duplicados
    │   ├── 03_matching.R     matching familias ↔ viviendas
    │   ├── 04_exportar_consulta.R  vuelca la base al módulo de consulta
    │   │                     (../modules/consulta)
    │   ├── 05_exportar_tablero.R   vuelca la base al tablero de control
    │   │                     (../modules/tablero)
    │   └── run_pipeline.R    orquestador (lo ejecuta launchd cada 10 min)
    ├── edan_comparison/      comparación formulario EDAN vs. base histórica
    ├── synthetic/            generadores de datos ficticios (3 jornadas)
    │   └── insumos/          plantillas reales de la app (221/60 columnas) + diccionario
    ├── db/schema.sql         esquema de la base oficial
    ├── data/
    │   ├── entrada/         carpeta vigilada: SOLO el canal real (la llenan
    │   │                     los dos pasos 00). Nada mas entra a la base
    │   ├── pruebas/          datos ficticios de synthetic/; el pipeline no
    │   │                     los mira, para que no se mezclen con lo real
    │   ├── historico/        base histórica de la Secretaría de Vivienda
    │   └── db/               base_oficial.sqlite
    ├── .secrets/             token de Google Drive y token de extracción de
    │                         la hoja (fuera de git; ver secciones 5 y 5.b)
    ├── logs/                 un log por día + salida de launchd
    └── scheduler/            plist de launchd (macOS)
```

## 3. Ejecución

Siempre desde esta carpeta (`web_damage_cali/consolidacion/`, no la raíz del
repositorio del portal):

```bash
Rscript pipeline/run_pipeline.R
```

Cada paso también corre solo (abre y cierra su propia corrida):
`Rscript pipeline/01_ingest.R`, etc.

Para probar todo el sistema con datos ficticios:

```bash
Rscript synthetic/01_generar_jornada1.R
Rscript pipeline/run_pipeline.R
Rscript synthetic/02_generar_jornada2.R
Rscript pipeline/run_pipeline.R
```

La jornada 2 ejercita: archivo nuevo acumulado, archivo sobreescrito, archivo
intacto (se salta por hash), registro modificado (queda en `record_history`),
registro nuevo, y un match que se vuelve ambiguo. Una tercera corrida sin
archivos nuevos no debe producir ningún cambio.

## 4. Actualización automática (cada 10 minutos)

```bash
cp scheduler/com.cienfi.sicmon-consolidacion.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.cienfi.sicmon-consolidacion.plist
```

`run_pipeline.R` usa un lockfile para no solapar corridas; un lock huérfano
(más de `LOCK_MAX_MIN` minutos) se elimina solo. Cada corrida queda registrada
en `processing_runs` y en `logs/pipeline_AAAAMMDD.log`.

## 5. Conexión a Google Drive

Los Excel llegan a la carpeta de Drive **"Registro_afectados_sismo" → `data`**.
`pipeline/00_conectar_drive.R` los descarga a la carpeta local que vigila el
resto del pipeline (`CARPETA_INGESTA`, hoy `data/entrada`) antes de que
`01_ingest.R` haga su propia detección de cambios por **hash sha-256** —esa
parte no supo nunca de dónde venía el archivo y sigue igual—.

**Autorización, una sola vez por persona.** Nunca hay una contraseña de
Google en el código ni en el repositorio: es OAuth, con el navegador. Desde la
raíz del repo:

```r
source("config/packages.R")
source("config/parameters.R")
googledrive::drive_auth(cache = CARPETA_CACHE_DRIVE, email = TRUE)
```

Se abre el navegador, inicia sesión con la cuenta de Google que tiene acceso
a la carpeta y da clic en "Permitir". El token queda guardado en `.secrets/`
(fuera de git: ver `.gitignore`) y de ahí en adelante —incluidas las corridas
automáticas de launchd, que no tienen navegador— el paso 0 lo reutiliza sin
pedir nada más. Hay que repetir este paso si `.secrets/` se borra o si el
token se revoca desde la cuenta de Google.

**Si Drive no responde o no hay token todavía**, `00_conectar_drive.R` lo
avisa en el log y se salta: el resto de la corrida sigue con lo que ya haya
en `CARPETA_INGESTA`. Un problema de conectividad nunca detiene el pipeline.

Convención de nombres esperada: archivos que empiezan por `viviendas` o por
`personas` (`.xlsx`, `.xls` o `.csv`). Cualquier otro archivo se ignora.

Migrar a otra fuente (OneDrive, una carpeta sincronizada localmente, etc.)
es reemplazar `00_conectar_drive.R` por el conector correspondiente: el resto
del pipeline solo conoce `CARPETA_INGESTA`, nunca el origen.

## 5.b Conexión a la hoja del Apps Script

El otro canal de llegada, y el que no depende de que nadie se acuerde de nada.

La aplicación EDAN ya manda **cada encuesta finalizada** a la hoja
`registro_afectados` del Drive de CIENFI, a través de un Apps Script
(`../modules/edan/apps-script/Codigo.gs`). `pipeline/00_conectar_hoja.R` le
pide a ese mismo script las tablas completas y las deja en `CARPETA_INGESTA`
como CSV:

```
viviendas_hoja.csv    grano: formulario de vivienda
personas_hoja.csv     grano: persona
```

De ahí en adelante `01_ingest.R` los lee igual que cualquier otro archivo, con
su detección de cambios por hash. Si el contenido no cambió, el hash es el
mismo y ni los mira.

Frente al canal de Drive: **ahí alguien tiene que descargar los CSV de la app
y subirlos a la carpeta; aquí no hay nadie en el medio.** Los dos pueden
convivir —el pipeline no distingue de dónde salió cada archivo— y los dos se
saltan solos, con aviso en el log, si su origen no responde.

### Puesta en marcha (una sola vez)

**1. Publicar el `Codigo.gs` actualizado.** Pegar el contenido de
`../modules/edan/apps-script/Codigo.gs` en el editor de Apps Script y luego
**Implementar → Gestionar implementaciones → editar (lápiz) → Versión: Nueva →
Implementar**. Sin este segundo paso la dirección `/exec` sigue sirviendo la
versión anterior. La dirección no cambia.

**2. Crear la propiedad `TOKEN_EXPORTACION`** en el editor: Configuración del
proyecto → Propiedades del script. Una cadena larga inventada, **distinta**
del `TOKEN` general.

**3. Dejar esa misma cadena** en `.secrets/token_exportacion.txt` (una línea,
sin comillas), en la máquina donde corre el pipeline. `.secrets/` está fuera
de git.

**4. Comprobar.** El log de la corrida debe decir `hoja: receptor version
1.3.0` seguido del inventario de tablas. Si dice `accion_no_reconocida`, faltó
el paso 1; si dice `exportacion_no_habilitada`, faltó el paso 2.

### Por qué un token aparte

El token general (`TOKEN`) viaja al navegador de cualquiera que abra la
aplicación —está en `config-sync.js`—, así que sirve para evitar escrituras
accidentales, no para proteger una **lectura**. Y esta puerta devuelve las
tablas completas: nombres, cédulas, teléfonos, direcciones y coordenadas de
todas las familias.

Por eso `TOKEN_EXPORTACION` es distinto, vive solo en la máquina del pipeline
y **falla cerrado**: si la propiedad no existe en el script de Google, la
extracción no está habilitada y punto. Nunca queda abierta por defecto.

### Detalles que importan

- **Por páginas.** La hoja de viviendas tiene 221 columnas; pedirlo todo de
  una se pasa del tamaño y del tiempo que Apps Script admite. El script pide
  500 filas por vuelta (`FILAS_POR_PAGINA_HOJA`) hasta agotar la tabla.
- **La extracción no toma el candado de escritura**, a propósito: bloquear la
  hoja mientras se lee dejaría a los diligenciadores esperando para enviar. En
  el peor caso una lectura agarra una encuesta a mitad de reemplazo y llega
  incompleta; la corrida siguiente, diez minutos después, la trae bien.
- **`personas_hogares` no se descarga a propósito.** Su nombre empieza por
  `personas` y `01_ingest.R` lo leería como el archivo persona a persona, que
  tiene otro grano. Lo que trae se deriva solo de la tabla `personas`.
- **Una tabla vacía no borra lo que ya se había bajado**: si la hoja responde
  sin filas, se conserva el CSV anterior.

## 6. Estructura de la base (`data/db/base_oficial.sqlite`)

| Capa | Tabla | Grano |
|---|---|---|
| Control | `processing_runs` | corrida del pipeline |
| Control | `source_files` | versión de archivo (hash) |
| Cruda | `raw_records` | versión de fila, payload JSON completo |
| Consolidada | `encuestas` | encuesta (índice general) |
| Consolidada | `viviendas` | formulario de vivienda |
| Consolidada | `familias` | formulario de personas/familia |
| Consolidada | `personas` | persona |
| Auditoría | `matches` | cambio de estado de match |
| Auditoría | `duplicados` | duplicado detectado |
| Auditoría | `record_history` | campo modificado (valor anterior y nuevo) |

Reglas del upsert (ingestión):

- id nuevo → insertar; misma versión → ignorar; `fecha_actualizacion` mayor →
  actualizar dejando cada campo cambiado en `record_history`; versión más
  vieja que la vigente → ignorar.
- La fila cruda de cada versión queda en `raw_records`: el origen de cualquier
  dato se puede reconstruir siempre.

El dialecto SQL es neutro para poder migrar a PostgreSQL sin reescribir.

## 7. Matching familias ↔ viviendas

| Nivel | Llave | Confianza | Estado |
|---|---|---|---|
| 0 | `id_hogar` (la app lo hereda entre formularios) | 1.00 | `matched_hogar` |
| 1 | cédula de alguna persona de la familia == cédula del propietario | 0.95 | `matched_cedula` |
| — | varios candidatos del mismo nivel | — | `ambiguous` |
| — | ningún candidato | — | `no_match` |

- El matching solo usa registros **canónicos** (no marcados como duplicados).
- El **nivel dirección no aplica entre estos dos formularios**: el formato
  EDAN de personas no captura dirección. La llave `direccion_norm` queda
  construida en `viviendas` para cruzar la base histórica de la Secretaría de
  Vivienda y cualquier fuente futura que sí traiga dirección.
- Nada se elimina: la familia sin match queda con `match_status = 'no_match'`.
- Cada cambio de estado queda en la bitácora `matches`; los `ambiguous` se
  revisan con: `SELECT * FROM familias WHERE match_status = 'ambiguous'`.

## 8. Deduplicación

| Tabla | Criterio | Canónico | Confianza |
|---|---|---|---|
| `personas` | mismo documento normalizado | más reciente | similitud del nombre (Jaro-Winkler) |
| `viviendas` | misma dirección normalizada | más reciente | 0.98 si coincide también la cédula, 0.90 si no |
| `familias` | mismo `id_hogar` en dos encuestas | más reciente | 0.95 |

- El duplicado **no se borra**: queda con `duplicate = 1`,
  `duplicate_confidence` y el puntero `id_canonico`.
- Si dos personas comparten documento pero el nombre difiere demasiado
  (posible cédula mal digitada), **no** se marca: se deja constancia en el log.
- La dirección se normaliza unificando tipo de vía (CARRERA/CRA/KRA → CR),
  sufijos (OESTE/O → O), tildes, mayúsculas y espacios, a partir de los
  componentes que la app ya entrega separados.

## 9. Aplicativo de consulta y tablero de control

**Consulta** — módulo `../modules/consulta/` de este mismo repositorio
(consulta ciudadana solo por cédula + acceso administrativo a las tres bases
con filtros, observaciones y descargas). El código del aplicativo se edita
allá; este pipeline solo le regenera los datos. En cada corrida,
`pipeline/04_exportar_consulta.R` escribe `js/datos.js` y
`descargas/base_consulta.xlsx` a través del parámetro `CARPETA_CONSULTA` de
`config/parameters.R`.

**Tablero** — módulo `../modules/tablero/` de este mismo repositorio. En cada
corrida, `pipeline/05_exportar_tablero.R` le escribe `js/datos_tablero.js` a
través de `CARPETA_TABLERO`. El portal lo abre desde el tercer acceso de la
portada (`CONFIG.accesos.tableros` en `../js/config.js`).

El módulo trae dos versiones del tablero: `index.html` es la vigente, con el
Resumen como portada; `index_v1.html` es la anterior y no está enlazada desde
ninguna parte. Las dos leen el mismo `js/datos_tablero.js`.

- Si alguna de las dos carpetas se mueve, actualizar `CARPETA_CONSULTA` o
  `CARPETA_TABLERO`; si la ruta no existe, el paso correspondiente se
  detiene con un error claro en vez de fallar en silencio.
- **Antes de publicar el portal**: cambiar la contraseña `123` del acceso
  administrativo de la consulta y tener presente que `datos.js` (de ambos
  aplicativos) viaja con cédulas y datos de salud.

## 10. Comparación EDAN vs. base histórica (`edan_comparison/`)

```bash
Rscript edan_comparison/01_comparar_edan.R
```

Compara las **127 preguntas** del formulario actual (diccionario de la app)
contra la base histórica de la Secretaría de Vivienda
(`data/historico/EDAN_SISMO.xlsx`, hoja "EDAN 100826 - Datos Madre", 873
registros). Resultado: **84 preguntas no están**, 32 ambiguas, 10 parciales y
1 presente. Hallazgo clave: la base histórica **no registra cédulas**, así que
su cruce con el formulario solo será posible por dirección. Las equivalencias
semánticas son revisables en `edan_comparison/equivalencias.csv`; el informe
queda en `edan_comparison/output/` (Excel + resumen en Markdown).

## 11. Solución de problemas

- **"hay una corrida en curso; esta se omite"**: otra corrida tiene el lock.
  Si no hay ninguna corriendo, borrar `data/db/pipeline.lock`.
- **Un archivo quedó `estado = 'error'`** en `source_files`: la causa está en
  el log del día. Al corregir el archivo cambia su hash y se reprocesa solo.
- **Reprocesar todo desde cero**: borrar `data/db/base_oficial.sqlite` y
  correr el pipeline; con los mismos archivos el resultado es idéntico
  (el pipeline es reproducible).
- **La base tiene registros que no deberían estar**: el pipeline **nunca
  borra**, así que sacar un archivo de `data/entrada/` no quita lo que ya
  ingirió. Hay que moverlo y reconstruir la base con el punto anterior.
- **Datos ficticios en la consulta o el tablero**: alguien corrió un
  generador de `synthetic/` apuntando a `data/entrada/` en vez de
  `data/pruebas/`. Los generadores escriben en `CARPETA_PRUEBAS`, que el
  pipeline no vigila; si eso cambió, se mezclan otra vez.
- **launchd no corre**: revisar `logs/launchd_error.log` y que la ruta de
  `WorkingDirectory` en el plist siga siendo la del repo.
- **"drive: no hay un token guardado..."** en el log: falta autorizar el
  acceso a Google Drive (paso interactivo de la sección 5). No es un error
  que detenga la corrida; los archivos que ya estén en `CARPETA_INGESTA`
  se siguen procesando igual.
- **Archivos que no llegan aunque están en Drive**: confirmar que la cuenta
  de Google con la que se autorizó (`drive_auth`) tiene al menos acceso de
  lectura a la carpeta `data`, y que el archivo está directamente ahí (no en
  una subcarpeta).
- **`hoja: el receptor respondio 'accion_no_reconocida'`**: el `Codigo.gs`
  está actualizado en el repositorio pero no se publicó una versión nueva del
  Apps Script (paso 1 de la sección 5.b).
- **`hoja: el receptor respondio 'exportacion_no_habilitada'`**: falta crear
  la propiedad `TOKEN_EXPORTACION` en el script de Google (paso 2).
- **`hoja: el receptor respondio 'no_autorizado'`**: la cadena de
  `.secrets/token_exportacion.txt` no coincide con la de la propiedad
  `TOKEN_EXPORTACION`.

## 12. Pendientes

- Autorizar Google Drive en la máquina donde corra `run_pipeline.R` de forma
  permanente (paso interactivo de la sección 5) y confirmar que la carpeta
  `data` es donde van a caer los Excel definitivos, no solo de prueba.
- Poner en marcha el canal de la hoja del Apps Script (sección 5.b): publicar
  la versión nueva del `Codigo.gs` y crear `TOKEN_EXPORTACION`. Mientras
  tanto sigue funcionando el canal de Drive, con la descarga manual de por
  medio. Decidir después si el de Drive se apaga (`CONECTAR_DRIVE = FALSE`)
  o se deja como respaldo.
- Definir la máquina donde correrá el pipeline de forma permanente.
- Matching de la base histórica contra las viviendas del formulario, por
  dirección normalizada (la base histórica no tiene cédulas).
- Tableros de análisis (Gabriela): leerán directamente de
  `base_oficial.sqlite`; el portal ya tiene el punto de integración
  (`CONFIG.tablero` en `mockup_sismo`).
- Autenticación del aplicativo de consulta antes de cualquier publicación.
