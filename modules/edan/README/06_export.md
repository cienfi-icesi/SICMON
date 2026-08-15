# 06 · Exportación de la información

> Cómo funciona hoy la descarga de datos. El código está en
> [js/export.js](../js/export.js); los botones y filtros, en el panel de
> coordinación ([index.html:207](../index.html#L207) y el bloque «Descargas» de
> [js/app.js:1399](../js/app.js#L1399)).

---

## 1. Qué formatos existen

| Formato | Qué es | Quién lo dispara |
|---|---|---|
| **CSV** | Cinco archivos distintos, todos UTF-8 con BOM | Botones `[data-descargar]` del panel + «Descargar todos» |
| **JSON** | Un respaldo completo restaurable en otro equipo | Botón «Descargar respaldo» de la barra superior (ver [03_data.md](03_data.md), sección 6) |

No existe exportación a Excel (`.xlsx`), PDF, Word ni ningún otro formato, ni
envío a un servidor.

---

## 2. Dónde está la funcionalidad

| Pieza | Ubicación |
|---|---|
| Botones de descarga | `#vista-panel`, sección «Descarga de información», [index.html:246](../index.html#L246) |
| Filtros | `#filtro-secretaria`, `#filtro-tipo`, `#filtro-usuario`, `#filtro-estado`, `#filtro-separador` |
| Enganche de eventos | `descargarArchivo()` y `descargarTodo()`, [js/app.js:1408](../js/app.js#L1408) |
| Generación | `window.Exportador.descargarCsv()`, [js/export.js:407](../js/export.js#L407) |
| Conteo previo | `window.Exportador.conteos()`, usado para el texto «Con los filtros aplicados se exportarían…» |

**La exportación solo está disponible en el panel**, es decir, para roles con
`puedeConsultar = true` (coordinador y coordinación general). Un diligenciador
no ve esta sección; sí puede, en cambio, descargar el respaldo JSON.

---

## 3. Los cinco archivos CSV

| Botón en pantalla | Clave interna | Archivo generado | Una fila por… | Columnas en el ejemplo de `app_output/` |
|---|---|---|---|---|
| Viviendas (.csv) | `viviendas` | `viviendas_…csv` | formulario de vivienda | **221** |
| Personas · hogares (.csv) | `personas_hogares` | `personas_hogares_…csv` | formulario de personas/familia | **24** |
| Personas · una fila por persona (.csv) | `personas` | `personas_…csv` | persona registrada (formato largo) | **60** |
| Índice de encuestas (.csv) | `indice` | `indice_encuestas_…csv` | encuesta (metadatos de control) | **17** |
| Diccionario de variables (.csv) | `diccionario` | `diccionario_variables_…csv` | opción de respuesta (o pregunta abierta) | **12** |

El botón **«Descargar todos»** lanza los cinco en el orden
`indice, viviendas, personas_hogares, personas, diccionario`, separados **600 ms**
entre sí, porque algunos navegadores bloquean descargas múltiples simultáneas
([js/app.js:1416](../js/app.js#L1416)).

### Nombre de archivo

```
<archivo><_sufijo><_AAAAMMDD_HHMM>.csv
        │        └── selloTiempo(): fecha y hora local de la descarga
        └── sufijo de filtros: secretaría_tipo_usuario (los que estén activos)
```

Ejemplo: `viviendas_vivienda_laura_20260812_2326.csv`.
El **diccionario nunca lleva sufijo de filtros**, porque describe el instrumento
completo y no depende de los registros seleccionados
([js/export.js:419](../js/export.js#L419)).

---

## 4. De dónde salen los datos

```
localStorage
     │  Almacen.listar(filtro)
     ▼
registrosFiltrados()          ← aplica alcance por rol + filtros de pantalla
     │
     ▼
Exportador.descargarCsv(clave, registros, {separador, sufijo})
     │
     ├── columnas ← DERIVADAS DEL ESQUEMA (FORM_VIVIENDA / FORM_PERSONAS)
     └── filas    ← derivadas de los registros
     │
     ▼
Blob('﻿' + csv) → <a download> → carpeta de descargas del navegador
```

Puntos clave del diseño actual, declarados en el encabezado de
[js/export.js:4](../js/export.js#L4):

1. **Las columnas se derivan del esquema, no de los datos.** Si nadie respondió
   una pregunta, la columna aparece igual, vacía. Así todos los archivos de todos
   los equipos tienen exactamente las mismas columnas y se pueden apilar sin
   conciliar nada.
2. Las preguntas de opción única generan **tres** columnas.
3. Las de selección múltiple generan **una columna indicadora 0/1 por opción**,
   más los valores y los números concatenados.
4. El formulario de Personas produce **dos** archivos: uno por hogar y otro con
   una fila por persona, unidos por `id_encuesta`.

### El filtro de alcance

`registrosFiltrados()` ([js/app.js:1242](../js/app.js#L1242)) construye el filtro
con:

- `secretaria` ← `secretariaDelAlcance()`: para `coordinador` se fuerza su propia
  Secretaría; para `admin` se toma el valor del selector (puede ser «Todas»).
- `tipo_formulario`, `usuario`, `estado` ← los selectores de pantalla.

El filtro **Estado** viene por defecto en «Solo finalizadas»; la otra opción es
«Todas (incluye borradores)».

El filtro **Separador del CSV** ofrece coma (R, Python, Stata) o punto y coma
(Excel en español).

---

## 5. Cómo se construyen las columnas

### 5.1 Metadatos, iguales en los cinco archivos

`COLUMNAS_META`, [js/export.js:182](../js/export.js#L182) — 15 columnas al
principio de cada archivo (el diccionario es la excepción: no las lleva):

```
id_encuesta · tipo_formulario · id_hogar · secretaria · secretaria_nombre ·
usuario · usuario_nombre · rol · estado · fecha · hora ·
fecha_creacion · fecha_actualizacion · fecha_finalizacion · app_version
```

`fecha` y `hora` se derivan de `fecha_finalizacion` si existe, si no de
`fecha_creacion`, partidas en hora local (`partirFechaHora()`).
`secretaria_nombre` se resuelve en el momento con
`APP_CONFIG.nombreSecretaria()`.

### 5.2 Columnas por tipo de pregunta

`columnasDeCampo()` / `valoresDeCampo()`, [js/export.js:113](../js/export.js#L113):

| Tipo | Columnas que genera | Ejemplo |
|---|---|---|
| `texto`, `textarea`, `numero`, `fecha` | 1: `<id>` | `viv_prof_nombre` |
| `unica` | 3: `<id>`, `<id>_num`, `<id>_etiqueta` | `viv_tipo_evento` = `sismo` · `viv_tipo_evento_num` = `3` · `viv_tipo_evento_etiqueta` = `Sismo` |
| `multiple` | 2 + una por opción: `<id>` (valores unidos por `\|`), `<id>_nums`, y `<id>__<valor>` con 0/1 | `viv_infra_muros` = `L\|Bl` · `viv_infra_muros_nums` = `1\|2` · `viv_infra_muros__L` = `1` … |
| `confirmacion` | 1: `<id>` con **1 / 0** | `viv_inf_firma` = `1` |
| `direccion` | **21**: los `SUBCAMPOS` del widget, en orden | `tipo_via` … `fecha_confirmacion_ubicacion` |
| `subtitulo`, `nota`, `aviso` | ninguna (`TIPOS_SIN_DATO`) | — |

El número de respuesta (`_num`, `_nums`) es la **posición** de la opción en la
lista del esquema, calculada con `CODIGOS.numeroOpcion()`.

### 5.3 Contenido de cada archivo

**`viviendas.csv`** — `csvViviendas()`, [js/export.js:227](../js/export.js#L227)
Metadatos + todos los campos con dato de las 9 secciones de `FORM_VIVIENDA`,
incluidas las 21 columnas de dirección/georreferenciación. Filtra
`tipo_formulario === 'vivienda'`.

**`personas_hogares.csv`** — `csvHogares()`, [js/export.js:255](../js/export.js#L255)
Metadatos + `n_personas` + los campos de las secciones **no repetibles** de
`FORM_PERSONAS` (los `edan_*`). Una fila por encuesta de personas.

**`personas.csv`** — `csvPersonas()`, [js/export.js:274](../js/export.js#L274)
Metadatos + `persona_num` + `id_persona` + los campos de la sección
**repetible** (`per_*`). Una fila por persona. El identificador de persona se
construye como:

```
id_persona = <id_encuesta>-P<nn>      p. ej.  PER-20260812-B7H1M4-P01
```

Se une con `personas_hogares.csv` por `id_encuesta`.

**`indice_encuestas.csv`** — `csvIndice()`, [js/export.js:297](../js/export.js#L297)
Metadatos + `n_personas` (vacío en las de vivienda) + `tiene_formulario_pareja`
(1/0), que marca los hogares que tienen los **dos** formularios. Incluye
encuestas de los dos tipos.

**`diccionario_variables.csv`** — `csvDiccionario()`, [js/export.js:327](../js/export.js#L327)
El libro de códigos del instrumento. **No depende de los registros**: recorre los
dos esquemas completos. Columnas:

```
formulario · codigo_pregunta · variable · seccion_numero · seccion_titulo ·
pregunta · tipo_campo · obligatoria · nivel_dato ·
numero_respuesta · valor_respuesta · etiqueta_respuesta
```

- Una fila **por opción de respuesta** en las preguntas cerradas; una sola fila
  en las abiertas.
- `nivel_dato` vale `persona` en las secciones repetibles y `encuesta` en el
  resto.
- `obligatoria` vale `sí` / `no` según `requerido`.
- El campo de dirección se despliega en sus 21 subcampos, con
  `tipo_campo = derivado` para los que calcula la aplicación.

---

## 6. Detalles técnicos del CSV

Todos en [js/export.js](../js/export.js), funciones `celda()`, `construirCsv()`
y `descargar()`:

| Aspecto | Comportamiento |
|---|---|
| **Codificación** | UTF-8 **con BOM** (`'﻿' + contenido`), para que Excel respete las tildes. |
| **Fin de línea** | `\r\n`. |
| **Entrecomillado** | Se entrecomilla la celda si contiene el separador, comillas, `\n` o `\r`; las comillas internas se duplican. |
| **Neutralización de fórmulas** | Si el valor empieza por `=` o `@`, se le antepone `'`. `+` y `-` se dejan intactos porque son válidos en teléfonos y números (`neutralizarFormula()`). |
| **Separador** | Seleccionable en pantalla: `,` o `;`. |
| **Descarga** | `Blob` + `URL.createObjectURL` + `<a download>` sintético; la URL se revoca a 1 s. |
| **Sin filas** | Si el generador no produce ninguna fila, no se descarga nada y se muestra «No hay registros para ese archivo con los filtros aplicados.» |

Los archivos quedan en la carpeta de descargas del navegador. La interfaz sugiere
moverlos después a `app_output/` (nota al pie de la sección de descargas en
[index.html:255](../index.html#L255)).

---

## 7. Ejemplos reales en el repositorio

La carpeta `app_output/` contiene una descarga de prueba del 2026-08-12 23:26 con
los cinco archivos. Sus encabezados confirman lo descrito arriba, por ejemplo el
tramo de dirección dentro de `viviendas_20260812_2326.csv`:

```
… viv_departamento, viv_municipio,
tipo_via, numero_via, sufijo_via, sufijo_via_otro, numero_generador,
sufijo_generador, sufijo_generador_otro, placa_inmueble, tipo_inmueble, nombre_conjunto, tipo_unidad, numero_unidad,
torre_bloque, direccion_completa, latitud, longitud, sistema_coordenadas,
fuente_georreferenciacion, precision_gps_m, direccion_geocodificada,
fecha_georreferenciacion, ubicacion_confirmada, fecha_confirmacion_ubicacion,
viv_corregimiento, viv_vereda, viv_req_no_beneficiario,
viv_req_no_beneficiario_num, viv_req_no_beneficiario_etiqueta, …
```

Esa carpeta está en `.gitignore`, junto con todos los `*.csv` y los
`respaldo_encuestas_*.json`, porque los datos recolectados contienen información
personal.
