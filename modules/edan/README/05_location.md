# 05 · Dirección, geolocalización y mapas

> Cómo está construida **hoy** la dirección de la vivienda y qué existe de
> georreferenciación. Casi todo vive en un solo archivo:
> [js/campo-direccion.js](../js/campo-direccion.js) (~900 líneas).

---

## 1. Panorama: dónde se pide una dirección

En la aplicación hay **tres** campos de dirección, y solo uno es estructurado:

| Campo | Código | Dónde | Tipo actual |
|---|---|---|---|
| `viv_prof_direccion` — Dirección (del profesional) | V010 | Vivienda, sección 1 | **texto libre** |
| `viv_prop_direccion` — Dirección (del propietario) | V016 | Vivienda, sección 1 | **texto libre** |
| `viv_direccion` — Dirección de la vivienda en cabecera municipal | *(sin código propio)* | Vivienda, sección 2 | **`tipo: 'direccion'`** → widget compuesto |

El motivo declarado de que solo la tercera sea estructurada
([js/form-vivienda.js:24](../js/form-vivienda.js#L24)): *«Las direcciones del
profesional y del propietario siguen siendo texto libre: son datos de contacto,
no el inmueble que se inspecciona.»*

El formulario de **Personas / Familia no pide ninguna dirección**.

---

## 2. Cómo está construida hoy la dirección de la vivienda

El campo se declara así en el esquema
([js/form-vivienda.js:178](../js/form-vivienda.js#L178)):

```js
{
  id: 'viv_direccion',
  etiqueta: 'Dirección de la vivienda en cabecera municipal',
  tipo: 'direccion',
  ayuda: 'Arme la dirección con las casillas. La aplicación la escribe sola: …',
  ancho: 'completo'
}
```

`app.js` delega su dibujo y su comportamiento a `window.CampoDireccion`
(`renderCampo()` → `CampoDireccion.render()`; después
`montarCamposDireccion()` → `CampoDireccion.montar()`,
[js/app.js:708](../js/app.js#L708)).

### 2.1 Los 21 subcampos (constante `SUBCAMPOS`)

Definidos en [js/campo-direccion.js:60](../js/campo-direccion.js#L60). El orden
de esta lista es también el orden de las columnas en el CSV.

| # | `id` | Etiqueta en pantalla | Código | Control | ¿Derivado? |
|---|---|---|---|---|---|
| 1 | `tipo_via` | Tipo de vía | V019 | `<select>` con 11 tipos | no |
| 2 | `numero_via` | Número de la vía | V020 | texto, `inputmode=numeric`, ej. «15» | no |
| 3 | `sufijo_via` | Letra o sufijo | V021 | `<select>`: Ninguno · A–F · Otro | no |
| 4 | `sufijo_via_otro` | Sufijo (¿cuál?) | V022 | texto; **aparece solo si** `sufijo_via = Otro`, ej. «Bis» | no |
| 5 | `numero_generador` | Número generador o cruce (#) | V023 | texto numérico, ej. «4» | no |
| 5b | `sufijo_generador` | Letra del generador | V105 (A042) | `<select>`: Ninguno · A–F · Otro — el «E» de «# 4E-64» | no |
| 5c | `sufijo_generador_otro` | Sufijo del generador (¿cuál?) | V106 (A043) | texto; **aparece solo si** `sufijo_generador = Otro`, ej. «Bis» | no |
| 6 | `placa_inmueble` | Placa del inmueble (–) | V024 | texto numérico, ej. «50» | no |
| 7 | `tipo_inmueble` | ¿Qué tipo de vivienda o inmueble es? | V025 | radios: **Casa** / **Conjunto residencial** | no |
| 8 | `nombre_conjunto` | Nombre del conjunto residencial | V026 | texto; solo si Conjunto | no |
| 9 | `tipo_unidad` | Tipo de unidad | V027 | radios: Apartamento / Casa; solo si Conjunto | no |
| 10 | `numero_unidad` | Número de apartamento o casa | V028 | texto numérico; solo si Conjunto | no |
| 11 | `torre_bloque` | Torre o bloque (opcional) | V029 | texto; solo si Conjunto | no |
| 12 | `direccion_completa` | Dirección completa | V030 | — | **sí** |
| 13 | `latitud` | Latitud | V031 | — | **sí** |
| 14 | `longitud` | Longitud | V032 | — | **sí** |
| 15 | `sistema_coordenadas` | Sistema de coordenadas | V033 | — | **sí** (`EPSG:4326`) |
| 16 | `fuente_georreferenciacion` | Fuente de la georreferenciación | V034 | — | **sí** (`GPS` / `MAPA` / `GEOCODIFICACION`) |
| 17 | `precision_gps_m` | Precisión del GPS (m) | V035 | — | **sí** |
| 18 | `direccion_geocodificada` | Dirección devuelta por geocodificación | V036 | — | **sí** |
| 19 | `fecha_georreferenciacion` | Fecha de la georreferenciación | V037 | — | **sí** (ISO) |
| 20 | `ubicacion_confirmada` | ¿El diligenciador confirmó la ubicación? | V038 | botón | **sí** (`Sí` o vacío) |
| 21 | `fecha_confirmacion_ubicacion` | Fecha de confirmación de la ubicación | V039 | — | **sí** (ISO) |

### 2.2 Comparación con la lista de campos consultada

| ¿Existe hoy? | Elemento | Campo actual |
|---|---|---|
| **Sí** | Tipo de vía / prefijo | `tipo_via` (V019) |
| **Sí** | Número de vía | `numero_via` (V020) |
| **Sí** | Letra o sufijo | `sufijo_via` (V021) + `sufijo_via_otro` (V022) |
| **Sí** | Número generador / cruce | `numero_generador` (V023) |
| **Sí** | Placa / número de inmueble | `placa_inmueble` (V024) |
| **No como campo propio** | Complemento | No existe un campo llamado «complemento». El complemento se expresa hoy con `tipo_inmueble` + los cuatro campos de conjunto (`nombre_conjunto`, `tipo_unidad`, `numero_unidad`, `torre_bloque`). No hay casilla de texto libre para «interior», «etapa», «piso», «local», «apto sin conjunto», etc. |
| **Sí** | Tipo de vivienda | `tipo_inmueble` (V025), con exactamente dos opciones: **Casa** y **Conjunto residencial** |
| **Sí** | Conjunto residencial | `nombre_conjunto` (V026) |
| **Parcial** | Apartamento | No hay un campo «apartamento» separado: hay `tipo_unidad` (V027, radio Apartamento/Casa) y `numero_unidad` (V028, el número). Solo aparecen si `tipo_inmueble = Conjunto residencial`. |
| **Parcial** | Casa | «Casa» aparece dos veces con significados distintos: como valor de `tipo_inmueble` (la vivienda es una casa suelta) y como valor de `tipo_unidad` (dentro de un conjunto, la unidad es una casa). No hay campos adicionales cuando `tipo_inmueble = Casa`. |
| **Sí** | Torre / bloque | `torre_bloque` (V029), opcional, solo si Conjunto |

### 2.3 Cómo se comporta el widget en pantalla

Estructura visual (`render()`, [js/campo-direccion.js:320](../js/campo-direccion.js#L320)):

```
┌─ Campo de dirección ─────────────────────────────────────────┐
│  [Tipo de vía ▾] [Número] [Sufijo ▾] (Sufijo ¿cuál?) [# Gen] [– Placa] │
│                                                              │
│  Dirección construida:   Cra 85 # 12-35, Casa                │  ← vista previa
│                                                              │
│  ¿Qué tipo de vivienda o inmueble es?   ( ) Casa  ( ) Conjunto│
│  └─ complemento según la respuesta ──────────────────────┐   │
│                                                              │
│  Ubicación de la vivienda en el mapa                         │
│  [📍 Usar mi ubicación actual] [🔎 Buscar dirección] [Quitar] │
│  ┌────────────── mapa Leaflet ──────────────┐                │
│  │                                          │                │
│  └──────────────────────────────────────────┘                │
│  Estado: Ubicación registrada: 3.451600, -76.532000 …        │
│  [Confirmar ubicación]                                       │
└──────────────────────────────────────────────────────────────┘
```

Comportamientos concretos:

- **Nada de doble digitación.** La dirección completa se compone sola con
  `componer()` y se muestra en vivo en la vista previa `#dir-vista-texto`.
- **Si escoge «Casa»**, se muestra el mensaje «Con «Casa» la dirección queda
  completa: no se piden apartamento, torre, bloque ni nombre de conjunto» y no
  aparece ningún campo más.
- **Si escoge «Conjunto residencial»**, aparecen nombre del conjunto, tipo de
  unidad, número de unidad y torre/bloque.
- **Al pasar de Conjunto a Casa, los cuatro campos de conjunto se limpian**
  (`CAMPOS_CONJUNTO`, [js/campo-direccion.js:466](../js/campo-direccion.js#L466)).
- **Al cambiar el sufijo a algo distinto de «Otro»**, `sufijo_via_otro` se limpia
  y se redibuja solo esa fila, conservando el foco.

### 2.4 Cómo se arma `direccion_completa`

Función `componer()`, [js/campo-direccion.js:141](../js/campo-direccion.js#L141).
Reglas actuales:

| Situación | Resultado |
|---|---|
| Sufijo de **una letra** | se pega al número: `15` + `A` → `15A` |
| Sufijo de **una palabra** | va separado: `22` + `Oeste` → `22 Oeste` |
| Generador **y** placa | `# 12-35` |
| Solo generador | `# 12` |
| Solo placa | `# -35` |
| `tipo_inmueble = Casa` | se añade `, Casa` |
| `tipo_inmueble = Conjunto residencial` | se añaden, en este orden: nombre del conjunto, torre/bloque, y `tipo_unidad + numero_unidad` |

Ejemplos que produce:

```
Cra 85 # 12-35, Casa
Cra 85 # 12-35, Conjunto Residencial Los Almendros, Torre 2, Apartamento 401
```

Tolera piezas faltantes: no deja restos como `# -` sueltos ni comas huérfanas.

### 2.5 Lista de tipos de vía

`TIPOS_VIA`, [js/campo-direccion.js:42](../js/campo-direccion.js#L42) — 11 valores:

`Cra` Carrera · `Cll` Calle · `Av` Avenida · `Dg` Diagonal · `Tv` Transversal ·
`Av Cra` Avenida Carrera · `Av Cll` Avenida Calle · `Cir` Circular ·
`Aut` Autopista · `Km` Kilómetro · `Mz` Manzana

Sufijos de la lista (`SUFIJOS`): `A B C D E F`, más las opciones «Ninguno» y
«Otro».

---

## 3. Geolocalización: qué está implementado

**Sí existe**, y de forma completa, dentro del mismo widget de dirección. No hay
mapas ni coordenadas en ninguna otra parte de la aplicación.

### 3.1 El mapa

- Librería: **Leaflet 1.9.4**, alojada en `assets/leaflet/` (no CDN), para que la
  aplicación cargue sin internet. Google Maps quedó descartado explícitamente
  porque exige clave de API y facturación
  ([js/campo-direccion.js:11](../js/campo-direccion.js#L11)).
- Mosaicos: `https://tile.openstreetmap.org/{z}/{x}/{y}.png`, `maxZoom: 19`,
  atribución «© colaboradores de OpenStreetMap». **Requieren conexión.**
- Vista inicial: **la cabecera del municipio elegido en el formulario** con zoom
  12 (`ZOOM_CIUDAD`); si ya hay punto, se centra en él con zoom 17 (`ZOOM_PUNTO`).
  Si el formulario aún no tiene municipio, se muestra el Valle del Cauca completo
  (`CENTRO_VALLE`, zoom 8): la aplicación **no asume Cali por defecto**. Al
  cambiar el municipio, el mapa se recentra en el acto
  (`CampoDireccion.actualizarContexto`) siempre que no haya un punto marcado; si
  ya lo hay, no se mueve (es dato del diligenciador) y se avisa cuando queda
  fuera del municipio nuevo.
- Los datos de cada municipio (código DANE, nombre, centro de la cabecera, caja
  del municipio y de la cabecera) están en `js/municipios-valle.js`, generado a
  partir del Marco Geoestadístico Nacional 2021 del DANE (capas
  `MGN_MPIO_POLITICO` y `MGN_CLASE`). Cada formulario declara en
  `campoMunicipio` cuál de sus campos guarda el municipio (`viv_municipio` /
  `afe_municipio`).
- `scrollWheelZoom: false`, para que la rueda del ratón no secuestre el
  desplazamiento de la página.
- **En pantalla táctil el mapa arranca bloqueado**, con un velo «Toque para mover
  el mapa»; se activa tocando el velo y se vuelve a bloquear con el botón
  «Bloquear el mapa para poder desplazar la página». Evita que el dedo arrastre
  el mapa al intentar desplazar la encuesta.
- Si los mosaicos fallan 6 veces (`tileerror`), se avisa que puede no haber
  conexión y se recuerda que el GPS sigue funcionando.
- Si Leaflet no cargó, se muestra un mensaje de error dentro del contenedor del
  mapa y el botón de ubicación actual sigue disponible.
- El mapa se **destruye** (`CampoDireccion.desmontar()`) antes de redibujar la
  sección y al salir de la vista de formulario, para no dejar Leaflet colgado de
  un nodo que ya no existe.

### 3.2 Las tres fuentes de coordenadas

Todas pasan por `fijarCoordenadas(lat, lon, fuente, precision, texto)`
([js/campo-direccion.js:635](../js/campo-direccion.js#L635)):

| Forma | Botón / gesto | `fuente_georreferenciacion` | Extra |
|---|---|---|---|
| **GPS del dispositivo** | «📍 Usar mi ubicación actual» | `GPS` | guarda `precision_gps_m` (redondeada) |
| **Selección manual** | tocar el mapa; el marcador se puede **arrastrar** | `MAPA` | — |
| **Búsqueda de la dirección** | «🔎 Buscar la dirección en el mapa» | `GEOCODIFICACION` | guarda `direccion_geocodificada` |

En los tres casos se escribe además:

- `latitud` y `longitud` con **6 decimales** (`toFixed(6)`, ≈11 cm);
- `sistema_coordenadas = 'EPSG:4326'` (siempre);
- `fecha_georreferenciacion` en ISO;
- y se **invalida** cualquier confirmación previa (`ubicacion_confirmada` y
  `fecha_confirmacion_ubicacion` se vacían), de modo que el dato confirmado
  siempre corresponda al punto vigente.

### 3.3 GPS

`usarUbicacionActual()`, [js/campo-direccion.js:791](../js/campo-direccion.js#L791).
Usa `navigator.geolocation.getCurrentPosition` con
`{enableHighAccuracy: true, timeout: 20000, maximumAge: 0}` y mensajes de error
propios para permiso denegado (1), posición no disponible (2) y tiempo agotado
(3).

Advertencia operativa registrada en el `README.md` raíz: los navegadores solo
entregan la ubicación en páginas `https://` o en `localhost`. Servida por
`http://192.168.x.x:puerto` en la red local, **la función de GPS queda
bloqueada**; el mapa y la búsqueda siguen funcionando. Es la razón declarada de
que exista el job `pages` de GitLab en `.gitlab-ci.yml`.

### 3.4 Geocodificación directa (dirección → coordenada)

`geocodificar()` en `js/campo-direccion.js`.

- Servicio: **Nominatim** de OpenStreetMap. NO se le pide «la dirección» como
  texto (su buscador no resuelve cruces ni placas): se piden por separado la
  geometría de la vía y la de la vía generadora, **acotadas a la caja del
  municipio elegido** (`viewbox` + `bounded=1`, y filtro de la respuesta con la
  misma caja), se calcula el cruce y, con la placa, se avanza esa distancia en
  metros a lo largo de la vía.
- **Regla del equipo (2026-08-15): solo se registra coordenada cuando la
  búsqueda llega a nivel de PREDIO.** Si apenas ubica la vía o el cruce, no se
  marca ningún punto: se centra el mapa en esa zona y se pide tocar el mapa o
  usar la ubicación actual. La precisión alcanzada se guarda en
  `precision_geocodificacion` (V104 / A040).
- El paso de cruce → predio depende del **sentido en que crece la numeración**.
  Ese sentido **se mide en el mapa para cada dirección** (`medirSentido`): se
  busca la generadora vecina (la siguiente o la anterior) y se mira a qué lado
  del cruce cae; hacia allá crece la numeración. Vale para cualquier municipio
  cuyas vías estén en el mapa base (verificado en Cali, El Cairo y Tuluá). La
  letra de una generadora se prueba con sus dos lecturas —intermedia (Cali:
  41B entre 41 y 42) y de sector (Buga: 4E = «4 Este», vecinas 5E/3E)— y gana
  la vecina que quede a distancia de cuadra (15–500 m).
- Condiciones para llegar a predio: el cruce base debe ser una intersección
  real o casi (≤ 60 m; si el mapa no dibuja las vías encontrándose, como la
  Carrera 4E de Buga con la Calle 5, se queda en cruce y no registra
  coordenada) y la placa no pasa del largo de la cuadra medida.
- Si la vecina no está en el mapa, se usa la regla escrita de la ciudad solo
  donde está verificada (`NOMENCLATURA_CALIBRADA` en `js/municipios-valle.js`,
  hoy Cali); en los demás la búsqueda se detiene en el cruce.
- La búsqueda por nombre de vía solo acepta el nombre **exacto** que devuelve
  el mapa base («Carrera 4E» con la letra pegada); pedir «Carrera 4D» traía 32
  tramos de otras carreras. La búsqueda libre sigue siendo difusa.
- Si el formulario no tiene municipio, la búsqueda no se ejecuta y lo dice: no
  se adivina un municipio.
- **Es una acción explícita del usuario, con botón.** No se dispara al escribir,
  porque cada consulta envía la dirección a un servicio externo.
- Límite de frecuencia propio: no se permite otra búsqueda antes de **1500 ms**.
- Si no hay resultados, o falla la red, se avisa y se sugiere marcar el punto a
  mano. Las coordenadas no se tocan.

### 3.5 Geocodificación inversa (coordenada → dirección)

`pedirDireccionDelMapa(lat, lon)`, [js/campo-direccion.js:668](../js/campo-direccion.js#L668).

- Se dispara **solo** cuando el punto lo puso el usuario (fuente `GPS` o `MAPA`),
  nunca tras una búsqueda.
- Espera **900 ms** desde el último movimiento antes de consultar
  (`https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=…&lon=…`).
- Guarda siempre el texto crudo devuelto en `direccion_geocodificada`
  (`display_name`).
- Interpreta `address.road` con `parsearVia()` y `address.house_number` con
  `parsearNumeroCasa()`:

| Entrada del servicio | Resultado en las casillas |
|---|---|
| «Carrera 38» | `tipo_via=Cra`, `numero_via=38`, `sufijo_via=Ninguno` |
| «Calle 15A» | `tipo_via=Cll`, `numero_via=15`, `sufijo_via=A` |
| «Carrera 22 Oeste» | `tipo_via=Cra`, `numero_via=22`, `sufijo_via=Otro`, `sufijo_via_otro=Oeste` |
| «38-104» | `numero_generador=38`, `placa_inmueble=104` |
| «4E-64» | `numero_generador=4`, `sufijo_generador=E`, `placa_inmueble=64` (la letra va pegada al número, como la escribe el mapa base: «Carrera 4E») |
| «Bulevar del Río» (vía con nombre propio) | no encaja: **no se rellena nada** |

  Los prefijos reconocidos están en `PREFIJOS_VIA`
  ([js/campo-direccion.js:87](../js/campo-direccion.js#L87)), ordenados del más
  específico al más general y comparados sin tildes.

- **Regla de precedencia**: si las casillas de vía están vacías, se rellenan
  directamente; si el diligenciador **ya escribió** una dirección, **no se pisa**:
  se muestra un recuadro de sugerencia con la propuesta del mapa y la escrita, y
  dos botones: «Usar la dirección del mapa» / «Conservar la que escribí»
  (`mostrarSugerencia()`, [js/campo-direccion.js:719](../js/campo-direccion.js#L719)).
- **La geocodificación nunca reemplaza la dirección declarada**: el texto del
  servicio vive aparte, en `direccion_geocodificada`.

### 3.6 Confirmar ubicación

Botón «Confirmar ubicación» bajo el estado del mapa
(`confirmarUbicacion()`, [js/campo-direccion.js:746](../js/campo-direccion.js#L746)):

- Si no hay coordenadas, avisa y no hace nada.
- Si las hay: escribe `ubicacion_confirmada = 'Sí'` y
  `fecha_confirmacion_ubicacion`, recompone `direccion_completa` y **fuerza el
  guardado inmediato** llamando al callback `guardarYa` (que en `app.js` es
  `guardarAhora()` + aviso «Ubicación confirmada y guardada»).
- El botón cambia a «✓ Ubicación confirmada y guardada».
- Si después se mueve el punto, la confirmación se invalida sola y el botón
  vuelve a pedirla.

### 3.7 Quitar ubicación

Botón «Quitar ubicación» (`limpiarUbicacion()`): vacía los nueve campos
derivados de georreferenciación, quita el marcador y cancela cualquier
geocodificación inversa pendiente. **No** toca las casillas de la dirección.

---

## 4. Cómo se guarda y se exporta

- Los 21 subcampos se guardan **sueltos dentro de `registro.respuestas`**, no
  anidados bajo `viv_direccion`. Por eso `valorDeCampo()`
  ([js/app.js:740](../js/app.js#L740)) usa `direccion_completa` para decidir si
  el campo está diligenciado.
- En el CSV de viviendas aportan **21 columnas consecutivas**, en el orden de
  `SUBCAMPOS`, generadas por `CampoDireccion.columnas()`
  ([js/export.js:129](../js/export.js#L129)).
- En el diccionario de variables aparecen como filas propias, con
  `tipo_campo = 'derivado'` o `'texto'` según la marca `derivado`
  ([js/export.js:340](../js/export.js#L340)).

---

## 5. Advertencias operativas ya registradas en el proyecto

Del `README.md` raíz, sección 8 (se transcriben porque describen el
comportamiento actual):

1. **El botón de ubicación actual exige HTTPS** (o `localhost`).
2. **La geocodificación de direcciones colombianas es imprecisa**: la cobertura
   de nomenclatura urbana de Nominatim en Colombia es parcial. En pruebas,
   «Cra 85 # 12-35» devolvió un punto sobre la Carrera 38. Sirve para acercar el
   mapa, no como dato definitivo; la coordenada confiable es la del GPS o la
   marcada a mano.
3. **Los mosaicos del mapa necesitan conexión.** Sin internet el mapa se ve
   vacío y la aplicación lo avisa; el GPS sigue funcionando.
