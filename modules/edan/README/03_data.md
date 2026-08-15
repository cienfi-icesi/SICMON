# 03 · Almacenamiento de los datos

> Cómo se guardan hoy las respuestas, qué forma tiene un registro y cómo se
> identifican encuestas, hogares, usuarios y Secretarías.

Todo lo de este documento vive en [js/storage.js](../js/storage.js), salvo lo
indicado.

---

## 1. Dónde se guardan los datos

**En el `localStorage` del navegador de cada equipo.** No hay base de datos, ni
API, ni backend, ni sincronización. Nada sale del dispositivo salvo:

- las descargas de CSV / respaldo, que el usuario dispara a mano;
- las consultas de geocodificación a Nominatim (ver [05_location.md](05_location.md)).

Consecuencia operativa, declarada en el propio archivo
([js/storage.js:9](../js/storage.js#L9)) y en el `README.md` raíz: **los datos no
se sincronizan entre equipos**. La consolidación se hace descargando los CSV de
cada equipo, o con «Descargar respaldo» / «Restaurar respaldo».

### Las tres claves de `localStorage`

| Clave | Contenido |
|---|---|
| `damage_cali_encuestas_v1` | Objeto con **todas** las encuestas: `{ id_encuesta: registro }` |
| `damage_cali_sesion_v1` | La sesión activa: `{usuario, nombre, rol, secretaria}` |
| `damage_cali_borrador_activo_v1` | El `id_encuesta` de la encuesta que se está diligenciando (cadena suelta) |

Toda la lectura pasa por `leerTodo()` y toda la escritura por `escribirTodo()`
([js/storage.js:59](../js/storage.js#L59)). Si la cuota del navegador se agota,
`escribirTodo()` devuelve `{ok: false, mensaje: …}` y la aplicación muestra el
aviso en rojo; es el único escenario contemplado de pérdida de trabajo.

---

## 2. Estructura de un registro

Creada por `Almacen.crear()`, [js/storage.js:117](../js/storage.js#L117):

```js
{
  id_encuesta:        "VIV-20260812-A3F2K9",   // identificador visible
  tipo_formulario:    "vivienda",              // 'vivienda' | 'personas'
  id_hogar:           "HOG-20260812-9F2C",     // llave que relaciona formularios
  secretaria:         "vivienda",              // 'vivienda' | 'gestion_riesgo'
  usuario:            "laura",                 // usuario que diligenció
  usuario_nombre:     "Laura",
  rol:                "diligenciador",
  estado:             "borrador",              // 'borrador' | 'finalizada'
  fecha_creacion:     "2026-08-12T21:03:11.482Z",
  fecha_actualizacion:"2026-08-12T21:44:02.118Z",
  fecha_finalizacion: null,                    // se llena al finalizar
  app_version:        "1.0.0",
  respuestas:         { … },                   // respuestas a nivel de encuesta
  personas:           [ { … }, { … } ],        // solo si tipo_formulario = 'personas'
  prellenados:        [ "viv_prop_cc" ]        // solo si se creó desde otra encuesta
}
```

### 2.1 `respuestas` — el contenedor principal

Un objeto plano `{ id_campo: valor }`. La clave es el `id` del campo tal como
está en el esquema, y el valor depende del tipo de pregunta:

| Tipo de campo | Cómo queda guardado |
|---|---|
| `texto`, `textarea`, `numero`, `fecha` | cadena (`"Cra 85"`, `"45"`, `"2026-08-12"`) |
| `unica` | el `valor` de la opción marcada (`"si"`, `"sismo"`, `"3"`) |
| `multiple` | array de valores (`["L", "Bl"]`) |
| `confirmacion` | booleano (`true` / `false`) |
| `direccion` | **nada bajo su propio id**: sus 21 subcampos se guardan sueltos en el mismo objeto `respuestas` (`tipo_via`, `numero_via`, …, `latitud`, `longitud`, …) |

Ejemplo real de un `respuestas` de vivienda:

```js
respuestas: {
  viv_alcaldia_gobernacion: "Alcaldía de Santiago de Cali",
  viv_prof_nombre: "…",
  viv_fecha_evaluacion: "2026-08-12",
  viv_departamento: "Valle del Cauca",
  viv_municipio: "Santiago de Cali",
  // subcampos del widget de dirección, sueltos:
  tipo_via: "Cra", numero_via: "85", sufijo_via: "Ninguno", sufijo_via_otro: "",
  numero_generador: "12", placa_inmueble: "35",
  tipo_inmueble: "Casa", nombre_conjunto: "", tipo_unidad: "", numero_unidad: "",
  torre_bloque: "", direccion_completa: "Cra 85 # 12-35, Casa",
  latitud: "3.451600", longitud: "-76.532000",
  sistema_coordenadas: "EPSG:4326", fuente_georreferenciacion: "GPS",
  precision_gps_m: "12", direccion_geocodificada: "…",
  fecha_georreferenciacion: "2026-08-12T21:20:00.000Z",
  ubicacion_confirmada: "Sí", fecha_confirmacion_ubicacion: "2026-08-12T21:21:00.000Z",
  // resto del formulario:
  viv_cumple_requisitos: "si",
  viv_sistema_constructivo: "mamposteria",
  viv_infra_muros: ["L", "Bl"],
  viv_inf_firma: true
}
```

### 2.2 `personas` — el array repetible

Solo existe en los registros de tipo `personas`. Es un array de objetos, uno por
persona, con la misma forma que `respuestas` pero conteniendo únicamente los
campos de la sección repetible (`per_*`):

```js
personas: [
  { per_nombres: "Ana", per_apellidos: "Gómez", per_tipo_documento: "3",
    per_edad: "34", per_ahe_alimentaria: "si", … },
  { per_nombres: "Luis", … }
]
```

Al crear un registro de personas se inicializa con `[{}]` (una persona vacía).
La sección repetible declara `minimo: 1`, así que el botón «Eliminar persona»
solo aparece cuando hay dos o más.

Los campos de la sección 5 (`edan_*`) **no** van en el array: van en
`respuestas`, porque son una vez por encuesta.

### 2.3 `prellenados`

Array de `id` de campos que se copiaron desde la otra encuesta del mismo hogar.
Sirve para dos cosas en la interfaz:

- pintar el campo con borde verde (`.campo.prellenado`) y mostrar la nota
  «Dato traído del otro formulario del mismo hogar…»;
- el `id` se elimina del array en cuanto el usuario edita ese campo
  ([js/app.js:948](../js/app.js#L948)).

---

## 3. Cómo se identifican las cosas

### 3.1 La encuesta — `id_encuesta`

Generado por `nuevoIdEncuesta()`, [js/storage.js:48](../js/storage.js#L48):

```
VIV-20260812-A3F2K9        PER-20260812-B7H1M4
│    │        └── 6 caracteres aleatorios
│    └── fecha de creación AAAAMMDD
└── prefijo por tipo: VIV = vivienda, PER = personas
```

Los caracteres aleatorios salen del alfabeto
`23456789ABCDEFGHJKLMNPQRSTUVWXYZ` (32 símbolos, **sin 0, O, 1 ni I** para
evitar confusiones al leerlos en voz alta) y se obtienen con
`crypto.getRandomValues()`.

Es la **clave primaria**: el almacén es un objeto indexado por `id_encuesta`.

### 3.2 El hogar — `id_hogar`

```
HOG-20260812-9F2C
│    │        └── 5 caracteres aleatorios
│    └── fecha AAAAMMDD
└── prefijo fijo
```

Es la llave que **relaciona los dos formularios de un mismo hogar**. Se genera
al crear la primera encuesta del hogar; la segunda encuesta lo hereda cuando se
crea desde:

- la pantalla final → «Continuar con el otro formulario», o
- «Mis encuestas recientes» → botón `+ Vivienda` / `+ Personas / Familia`.

En código: `crearEncuesta(tipo, origen)` pasa `id_hogar: origen.id_hogar`
([js/app.js:481](../js/app.js#L481)). Si no hay origen, `Almacen.crear()` genera
uno nuevo.

Si un hogar solo tiene un formulario, su `id_hogar` simplemente no se repite.
La función `Almacen.hermanas(idHogar, idEncuestaExcluir)` devuelve las otras
encuestas del mismo hogar y es la que alimenta el aviso azul de la parte
superior del formulario y la lógica de la pantalla final.

### 3.3 Las respuestas

Se identifican por el `id` del campo, que es la clave dentro de `respuestas` o
dentro de cada objeto de `personas`. Ese mismo `id` es el nombre de la columna
en el CSV.

En paralelo, cada pregunta tiene un **código estable** (`V001`…`V102`,
`P001`…`P025`) definido en [js/codigos.js](../js/codigos.js). El código **no se
guarda en el registro**: solo se usa para mostrarlo en pantalla y para armar el
diccionario de variables. La regla declarada es que los códigos están congelados
y nunca se renumeran.

Las **opciones de respuesta** se numeran por su posición en la lista
(`CODIGOS.numeroOpcion()`), y ese número solo aparece en el CSV (columnas
`_num` / `_nums`), no en el almacenamiento.

### 3.4 El usuario / diligenciador

Cada registro guarda tres campos copiados de la sesión en el momento de crearlo:

| Campo | Origen |
|---|---|
| `usuario` | `sesion.usuario` — la clave del usuario (`"laura"`, `"eduard 1"`) |
| `usuario_nombre` | `sesion.nombre` — el nombre para mostrar |
| `rol` | `sesion.rol` — `diligenciador` / `coordinador` / `admin` |

Son una **copia congelada**: si el usuario cambiara de rol, las encuestas ya
creadas conservan el rol que tenía al crearlas.

### 3.5 La Secretaría

**Sí existe** y se registra en cada encuesta, en el campo `secretaria`, con los
valores `'vivienda'` o `'gestion_riesgo'` (los `id` definidos en
`APP_CONFIG.secretarias`, [js/config.js:17](../js/config.js#L17)).

De dónde sale el valor:

- **Diligenciadores**: la escogen en la pantalla «Paso 1 de 2» al iniciar la
  jornada; queda en `sesion.secretaria` y se copia a cada encuesta que creen.
  Pueden cambiarla desde «Inicio» → «Cambiar de Secretaría».
- **Coordinadores**: la traen fija en su cuenta (`config.js`) y no la escogen.

El nombre legible se resuelve en el momento de exportar, con
`APP_CONFIG.nombreSecretaria(id)`; en el CSV van las dos columnas: `secretaria`
(el id) y `secretaria_nombre`.

### 3.6 Fechas

Todas en **ISO 8601 UTC** (`new Date().toISOString()`):

| Campo | Cuándo se escribe |
|---|---|
| `fecha_creacion` | al crear el registro |
| `fecha_actualizacion` | en **cada** `guardar()` |
| `fecha_finalizacion` | solo al pulsar «Finalizar encuesta» |

Para mostrar en pantalla se convierten con `fechaLegible()`
(`DD/MM/AAAA HH:MM`, [js/app.js:1472](../js/app.js#L1472)) y para el CSV se
parten en `fecha` + `hora` con `partirFechaHora()`
([js/export.js:188](../js/export.js#L188)).

---

## 4. Cómo se guardan y se recuperan los datos

### 4.1 La API de `window.Almacen`

| Función | Qué hace |
|---|---|
| `listar(filtro)` | Devuelve todas las encuestas ordenadas de la más reciente a la más antigua por `fecha_actualizacion`. `filtro` acepta `secretaria`, `tipo_formulario`, `usuario`, `estado`. |
| `obtener(idEncuesta)` | Un registro o `null`. |
| `crear(opciones)` | Devuelve un registro nuevo en memoria, en estado `borrador`. **No lo guarda.** |
| `guardar(registro)` | Escribe (crea o actualiza) y refresca `fecha_actualizacion`. Devuelve `{ok, mensaje}`. |
| `finalizar(registro)` | Pone `estado: 'finalizada'`, sella `fecha_finalizacion` y guarda. |
| `eliminar(idEncuesta)` | Borra la clave del objeto y reescribe. |
| `hermanas(idHogar, excluir)` | Otras encuestas del mismo hogar. |
| `nuevoIdHogar()` | Genera un `HOG-…`. |
| `estadisticas(secretariaId)` | Resumen para el panel (ver abajo). |
| `guardarSesion` / `leerSesion` / `borrarSesion` | Sesión. |
| `guardarBorradorActivo` / `leerBorradorActivo` | Id de la encuesta abierta. |
| `exportarRespaldo()` / `importarRespaldo(texto)` | Respaldo JSON. |

### 4.2 Cuándo se escribe

| Momento | Función |
|---|---|
| Cualquier tecla o cambio en un campo | `guardarDiferido()` → espera **400 ms** y llama a `guardarAhora()` |
| Cambio en el widget de dirección | igual, vía el callback `alCambiar` |
| «Confirmar ubicación» | `guardarAhora()` inmediato (callback `guardarYa`) |
| Pasar de sección («Anterior», «Siguiente», clic en un paso) | `guardarAhora()` |
| Agregar o eliminar una persona | `guardarAhora()` |
| «Guardar y salir», «Inicio», «Salir» | `guardarAhora()` |
| Cerrar la pestaña con cambios pendientes | `beforeunload` fuerza `guardarAhora()` y pide confirmación ([js/app.js:125](../js/app.js#L125)) |
| «Finalizar encuesta» | `Almacen.finalizar()` |

La píldora `#form-guardado` refleja el estado: «Guardando…» (ámbar) o
«Guardado ✓» (verde).

### 4.3 Cómo se recuperan

| Escenario | Cómo |
|---|---|
| Retomar un borrador propio | «Mis encuestas recientes» en el menú → botón «Continuar». `renderEncuestasPropias()` lista las 12 más recientes del usuario ([js/app.js:394](../js/app.js#L394)). |
| Consultar todo | Panel de coordinación → tabla «Registros recolectados» (los 200 más recientes) y descarga de CSV. |
| Restaurar sesión | Al cargar la página, `Almacen.leerSesion()`; si hay sesión, se entra sin volver a pedir contraseña. |
| Llevar los datos a otro equipo | Respaldo JSON. |

Nota: `damage_cali_borrador_activo_v1` se escribe al abrir una encuesta y se
limpia al finalizarla, eliminarla o volver al Inicio. Actualmente
`leerBorradorActivo()` está expuesto en la API pero `app.js` no lo usa para
reabrir automáticamente la encuesta tras una recarga.

---

## 5. Estadísticas para el panel

`Almacen.estadisticas(secretariaId)`, [js/storage.js:201](../js/storage.js#L201).
Solo cuenta encuestas **finalizadas** en los totales; los borradores se reportan
aparte. Devuelve:

| Campo | Significado |
|---|---|
| `total` | Encuestas finalizadas |
| `vivienda` / `personas` | Finalizadas de cada tipo |
| `borradores` | Encuestas sin finalizar |
| `personasRegistradas` | Suma de `personas.length` de las encuestas de personas finalizadas |
| `hogares` | Hogares distintos con al menos una encuesta finalizada |
| `hogaresCompletos` | Hogares con **los dos** formularios finalizados |
| `ultimaActividad` | Fecha más reciente |
| `porUsuario` | `[{usuario, nombre, vivienda, personas, total, ultima}]`, ordenado por total |
| `porSecretaria` | `[{secretaria, vivienda, personas, total}]` |

---

## 6. Respaldo y restauración (JSON)

### Exportar

Botón «Descargar respaldo» de la barra superior. Genera un archivo
`respaldo_encuestas_AAAAMMDD_HHMM.json` con esta forma
([js/storage.js:271](../js/storage.js#L271)):

```json
{
  "app": "app_damage_alcaldia",
  "version": "1.0.0",
  "generado": "2026-08-12T23:26:00.000Z",
  "encuestas": { "VIV-20260812-A3F2K9": { … }, "PER-…": { … } }
}
```

Es el **volcado completo** de `damage_cali_encuestas_v1`, sin filtrar por
Secretaría, usuario ni estado.

### Restaurar

Botón «Restaurar respaldo» (un `<input type="file">` disfrazado de botón).
`importarRespaldo()`, [js/storage.js:285](../js/storage.js#L285):

- **No borra** lo que ya existe.
- Si el `id_encuesta` no está, lo agrega.
- Si ya está, lo reemplaza **solo si** el entrante tiene una
  `fecha_actualizacion` mayor (comparación de cadenas ISO).
- Devuelve un mensaje con cuántas se agregaron y cuántas se actualizaron.

---

## 7. Lo que hoy **no** existe en materia de datos

Para dejar constancia del estado actual, sin proponer nada:

- No hay base de datos ni servidor: no existe ningún `fetch` a una API propia.
- No hay sincronización automática entre equipos ni entre pestañas.
- No hay cifrado ni anonimización del contenido de `localStorage`.
- No hay control de versiones de registro ni bitácora de cambios más allá de
  `fecha_actualizacion`.
- No hay borrado en bloque desde la interfaz: solo se puede eliminar la encuesta
  abierta, una a una.
- No hay almacenamiento de fotografías ni de firmas manuscritas.
