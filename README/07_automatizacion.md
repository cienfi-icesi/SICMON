# 07 · Automatización, persistencia y protección de datos

Cómo llega la información desde el celular de quien encuesta hasta la pantalla
de quien consulta, quién puede ver qué, y qué corre solo.

---

## 1. El flujo completo

```
        ┌──────────────────┐
        │  Aplicativo EDAN │   celular en campo, funciona sin señal
        └────────┬─────────┘
                 │  guardar_encuesta
                 ▼
        ┌──────────────────┐
        │  Apps Script     │   Codigo.gs  ·  el centro del sistema
        │  + Hoja Google   │   aquí viven los datos personales
        └────────┬─────────┘
                 │  avisarGitHub()  →  repository_dispatch
                 ▼
        ┌──────────────────┐
        │  GitHub Actions  │   .github/workflows/consolidacion.yml
        └────────┬─────────┘
                 ▼
   ┌─────────────────────────────┐
   │  Pipeline R (consolidacion) │
   │                             │
   │  estado_descargar.sh        │  ← base cifrada, repo privado
   │  00_conectar_hoja.R         │  ← extrae las tablas crudas
   │  01_ingest → 02_dedup       │
   │  03_matching                │
   │  04 / 05  (salidas locales) │
   │  06_publicar_hoja.R         │  → pestañas c_* de la hoja
   │  estado_guardar.sh          │  → base cifrada, repo privado
   └────────────┬────────────────┘
                ▼
        ┌──────────────────┐
        │   app_consulta   │   fetch al Apps Script, nunca a un archivo
        └──────────────────┘
```

**El repositorio no aparece en ningún punto de la cadena de datos.** Solo sirve
el HTML, el CSS y el JavaScript. Esto no es un detalle de implementación: es lo
que permite que el sitio sea público sin que ninguna cédula lo sea.

---

## 2. Qué es público y qué es privado

| | Dónde vive | Quién lo ve |
|---|---|---|
| HTML, CSS, JavaScript | Repositorio público · GitHub Pages | Cualquiera |
| Cédulas, nombres, salud, direcciones, coordenadas | Hoja de Google | Quien tenga la contraseña del equipo |
| `base_oficial.sqlite` (historial, duplicados, cruces) | Repo privado de estado, cifrada | Quien tenga el token y la clave |
| `datos_tablero.js` (salud + coordenadas, sin nombre) | `consolidacion/data/salida/tablero/` | Solo la máquina donde corre |
| `TOKEN_EXPORTACION`, `TOKEN_LECTURA` | Propiedades del Apps Script | Nadie más |

### La regla que ya se rompió una vez

`.gitignore` **no aplica a lo que ya está rastreado**. El 15 de agosto de 2026 se
encontró que el token de extracción, tres bases SQLite y `datos_tablero.js`
estaban versionados en el repositorio público aunque el `.gitignore` los listaba:
habían entrado antes de que se escribiera esa lista.

Por eso existe `consolidacion/tools/verificar_publico.sh`, que mira el índice de
git y no el disco, y corre en cada corrida del workflow:

```bash
bash consolidacion/tools/verificar_publico.sh
```

---

## 3. Tres puertas, tres llaves

Todas las comprueba Google, no el navegador. Ninguna contraseña está escrita en
un archivo del sitio.

| Puerta | Qué entrega | Llave | Si falta la llave |
|---|---|---|---|
| `consultar_cedula` | **Un** registro: el de esa cédula | Ninguna | — |
| `consulta_completa` | Las tablas consolidadas enteras | `TOKEN_LECTURA` | **Falla cerrado** |
| `exportar_tabla` · `publicar_consolidado` | Las tablas crudas | `TOKEN_EXPORTACION` | **Falla cerrado** |

El token general de `config-consulta.js` **no protege nada** y no puede: viaja al
navegador de cualquiera que abra la página. Sirve para que la dirección no quede
abierta a todo internet, no para guardar datos.

### Pegar el código no basta

La dirección `/exec` sigue sirviendo la versión anterior hasta que se **implementa
una versión nueva**. El 15/08/2026 la implementación publicada era la **1.6.0**,
anterior a la que hace que `consulta_completa` falle cerrado: una petición sin
contraseña respondía `ok` con las 29 columnas de `c_personas`. El código correcto
llevaba semanas en el repositorio.

Por eso `06_publicar_hoja.R` **toca la puerta antes de publicar**: manda una
contraseña inventada y, si abre, no sube ni un registro real. Que la consulta se
quede desactualizada es un problema; que la base quede descargable sin
credenciales es otro, y mucho peor.

Para cerrarla, en el editor del Apps Script:

1. Configuración del proyecto → Propiedades del script → crear `TOKEN_LECTURA`.
2. Implementar → Gestionar implementaciones → editar (lápiz) → Versión: **Nueva**.

La dirección no cambia. El `ping` devuelve la versión realmente publicada.

---

## 4. Modo simulado

Mientras la puerta de lectura esté abierta —o simplemente para ver el tablero con
volumen— todo el sistema puede trabajar contra datos inventados:

```bash
SICMON_SIMULADO=1 Rscript pipeline/run_pipeline.R
```

Un solo interruptor mueve las cuatro cosas a la vez:

| | Normal | Simulado |
|---|---|---|
| Entrada | `data/entrada` | `data/pruebas` |
| Base | `base_oficial.sqlite` | `base_simulada.sqlite` |
| Drive y hoja (entrada) | Encendidos | **Apagados** |
| Tablero | `data/salida/tablero` | `../modules/tablero` |

Antes esto eran cuatro líneas que había que cambiar a mano y deshacer después.
Olvidar una fue lo que metió 48 edificaciones inventadas en la base real.

**Se publica marcado.** La consulta muestra `· DATOS SIMULADOS (no es la base
real)` junto a la fecha, y el tablero pinta un aviso ámbar arriba del título. La
marca viaja dentro de los datos, no en la configuración, así que no puede quedar
diciendo una cosa mientras se muestra otra.

---

## 5. Persistencia del estado

Un runner de GitHub Actions arranca vacío. Sin esto, `01_ingest.R` volvería a
marcar como *insertado* todo lo consolidado y se perderían el historial campo a
campo, la bitácora de duplicados y el registro de corridas.

```
repo privado → descifrar → pipeline → cifrar → repo privado
```

La base viaja cifrada con AES-256 (clave derivada con PBKDF2). El repositorio de
estado ya es privado; el cifrado es la segunda cerradura. Cada corrida deja un
commit, así que **el historial de ese repositorio es la cadena de respaldos**.

Solo se sube si la base cambió: se compara el hash de la base *en claro*, porque
el cifrado lleva sal aleatoria y el archivo cifrado cambia siempre.

---

## 6. Puesta en marcha

### 6.1 Repositorio privado de estado

Crear `cienfi-icesi/SICMON-estado` **privado** (los repos privados no tienen
costo; lo que se paga es servir Pages *desde* uno privado, y eso aquí no aplica).

### 6.2 Secrets del repositorio público

`Settings → Secrets and variables → Actions`:

| Secret | Qué es |
|---|---|
| `TOKEN_EXPORTACION` | La propiedad `TOKEN_EXPORTACION` del Apps Script |
| `ESTADO_REPO` | `cienfi-icesi/SICMON-estado` |
| `ESTADO_TOKEN` | Token de GitHub con *Contents: Read and write* sobre el repo de estado |
| `ESTADO_CLAVE` | Frase de cifrado. **Si se pierde, el estado guardado es irrecuperable** |

### 6.3 Propiedades del Apps Script

`SHEET_ID`, `TOKEN`, `TOKEN_EXPORTACION`, `TOKEN_LECTURA`, y para el disparador:

| Propiedad | Qué es |
|---|---|
| `GITHUB_REPO` | `cienfi-icesi/SICMON` |
| `GITHUB_TOKEN` | Token con permiso de escritura sobre ese repositorio |

Después, correr `instalarAvisoGitHub()` una vez desde el editor. Para comprobar
que quedó bien: `probarConfiguracion()` y `probarAvisoGitHub()`.

---

## 7. Qué dispara la corrida

| Vía | Cuándo |
|---|---|
| `repository_dispatch` | El Apps Script detecta encuestas nuevas o corregidas |
| `schedule` | Cada 30 min, lunes a viernes, 07:00–18:00 Bogotá |
| `workflow_dispatch` | A mano, desde la pestaña Actions |

`avisarGitHub()` compara una **huella** de la hoja (conteos de las tres tablas de
campo + la mayor `fecha_actualizacion` del índice) contra la anterior, y solo
avisa si cambió. No usa la fecha de modificación del archivo de Drive: el
pipeline termina escribiendo las pestañas `c_*`, así que esa fecha cambiaría por
culpa de la corrida anterior y cada aviso provocaría el siguiente, para siempre.

La huella solo se guarda si el aviso llegó; si GitHub no responde, el siguiente
activador reintenta.

---

## 8. Ejecución manual

Desde `consolidacion/`:

```bash
Rscript pipeline/run_pipeline.R
```

Con base simulada:

```bash
SICMON_SIMULADO=1 Rscript pipeline/run_pipeline.R
```

Todo parámetro se puede sobreescribir por entorno sin editar archivos:
`SICMON_RUTA_DB`, `SICMON_CARPETA_INGESTA`, `SICMON_CARPETA_TABLERO`,
`SICMON_CONECTAR_DRIVE`, `SICMON_CONECTAR_HOJA`, `SICMON_PUBLICAR_HOJA`,
`SICMON_TOKEN_EXPORTACION`, `SICMON_LOG_REDACTAR`.

### Por qué Drive está apagado en la nube

`00_conectar_drive.R` usa OAuth de usuario: hay que abrir un navegador e iniciar
sesión. Un runner no puede. El canal real es la hoja del Apps Script, que va con
token y no con credencial de Google — y de hecho el canal de Drive nunca llegó a
tener un token guardado. El paso se salta con un aviso y no detiene la corrida.

---

## 9. Reproducibilidad

`consolidacion/renv.lock` fija las 79 versiones de paquetes. El workflow las
restaura con `renv::restore()` sobre `R_LIBS_USER`, con caché por hash del
lockfile.

Se usa `R_LIBS_USER` y no un `.Rprofile` con `renv::activate()` a propósito: cada
paso del pipeline corre en su propio `Rscript` (los lanza `run_pipeline.R` con
`system2`) y todos heredan la variable de entorno, sin cambiar cómo trabaja el
equipo en sus máquinas.

Para actualizar una versión: instalarla en local y regenerar el lockfile.

---

## 10. Pruebas

Desde `consolidacion/`:

```bash
Rscript tests/correr_pruebas.R
```

Agregando `--red` corren además las que hablan con Google (necesitan el token de
extracción; para las del modo equipo, `SICMON_TOKEN_LECTURA`). Sin credenciales
se saltan con aviso en vez de fallar.

| Archivo | Qué comprueba |
|---|---|
| `test-01` | La conexión con la hoja, la versión publicada y que un token falso no abra |
| `test-02` | Que lo nuevo se extraiga y lo ya visto no se recuente |
| `test-03` | Que correr dos veces no duplique, y que el marcaje sea idempotente |
| `test-04` | La corrida completa, incluida una en vacío |
| `test-05` | Que la base sobreviva a que se borre el disco, y que sin la clave no se lea |
| `test-06` | Que la consulta reciba los datos con la forma que espera la pantalla |
| `test-07` | Que sin credenciales no se llegue a ningún dato |
| `test-08` | Que nada sensible haya quedado versionado |
| `test-09` | Que nada pida intervención humana |
| `test-10` | Que lo simulado y lo real no se mezclen |

---

## 11. Pendiente

**`modules/edan/js/config.js` publica nombres, cédulas y contraseñas** de dos
personas del equipo de campo, y la contraseña *es* la cédula. El propio archivo
advierte que la aplicación «NO debe publicarse en internet tal como está», pero
está publicada. `test-07` lo reporta en cada corrida y seguirá en rojo hasta que
se resuelva.

No se corrigió aquí porque cualquier arreglo cambia el ingreso de quienes están
encuestando en campo, y esa es una decisión de operación. Las dos salidas son:
mover la lista de usuarios al Apps Script (rompe el ingreso sin señal, que es
justo para lo que se diseñó la app) o dejar de usar la cédula como contraseña y
sacar las cédulas del archivo.
