# 02 · Los formularios

> Cómo están construidos hoy los dos formularios, sección por sección, y dónde
> están los transcripts que les dieron origen.

---

## 1. Cómo se declara un formulario

Los formularios **no están escritos en HTML**. Son objetos JavaScript
declarativos que `app.js` interpreta y dibuja. Un formulario tiene esta forma
(ejemplo real, [js/form-vivienda.js:86](../js/form-vivienda.js#L86)):

```js
window.FORM_VIVIENDA = {
  id: 'vivienda',
  nombre: 'Formulario de Vivienda',
  nombreCorto: 'Vivienda',
  codigoFormato: 'VOL-10',
  titulo: 'Formato de inspección de viviendas afectadas',
  descripcion: '…',
  icono: '🏠',
  camposVinculo: { … },
  secciones: [ … ]
};
```

### 1.1 Propiedades de una sección

| Propiedad | Para qué sirve |
|---|---|
| `id` | Identificador interno (`sec1`, `secPersonas`…) |
| `numero` | Número que se muestra en pantalla (`'1'`, `'5'`, `'1-4'`) |
| `titulo` | Encabezado de la sección |
| `descripcion` | Texto explicativo bajo el título (opcional) |
| `campos` | Array de campos |
| `visibleSi` | Condición de visibilidad de toda la sección (opcional) |
| `tipo: 'repetible'` | La sección se diligencia N veces (solo la usa Personas) |
| `claveLista`, `etiquetaItem`, `minimo` | Solo en secciones repetibles: dónde se guarda la lista, cómo se llama cada ítem y el mínimo obligatorio |

### 1.2 Tipos de pregunta que soporta el motor

Implementados en `renderCampo()`, [js/app.js:778](../js/app.js#L778):

| `tipo` | Control en pantalla | Cómo se guarda |
|---|---|---|
| `texto` | `<input type="text">` (o `type="tel"` si `modo: 'telefono'`; `inputmode="numeric"` si `modo: 'numerico'`) | cadena |
| `textarea` | `<textarea rows=…>` | cadena |
| `numero` | `<input type="number" min max>` | cadena (valor del input) |
| `fecha` | `<input type="date">` | cadena `AAAA-MM-DD` |
| `unica` | Grupo de radios; cada opción es una fila tocable completa | el `valor` de la opción |
| `multiple` | Grupo de checkboxes | array de valores |
| `confirmacion` | Un checkbox con texto (`textoConfirmacion`) | booleano `true`/`false` |
| `direccion` | Widget compuesto de [campo-direccion.js](../js/campo-direccion.js) | **no** bajo su `id`: sus 21 subcampos se guardan sueltos |

Y tres tipos **sin dato**, que solo maquetan (constante `TIPOS_SIN_DATO`):

| `tipo` | Qué es |
|---|---|
| `subtitulo` | Franja azul con título de subsección (p. ej. «5.1 Tipo de evento…») |
| `nota` | Párrafo explicativo con borde punteado |
| `aviso` | Recuadro ámbar de advertencia |

### 1.3 Propiedades de un campo

| Propiedad | Efecto actual |
|---|---|
| `id` | Clave con la que se guarda la respuesta y nombre de la columna en el CSV |
| `etiqueta` | Enunciado de la pregunta |
| `tipo` | Ver tabla anterior |
| `opciones` | `[{valor, etiqueta}]` para `unica` y `multiple` |
| `requerido: true` | Marca `*` roja y bloquea «Siguiente» y «Finalizar» si está vacío |
| `visibleSi` | Condición; si no se cumple, el campo no se dibuja ni se valida ni cuenta en el progreso |
| `ayuda` | Párrafo gris bajo el enunciado |
| `ancho` | `completo` (6/6), `medio` (3/6) o `tercio` (2/6) de la rejilla |
| `valorPorDefecto` | Se aplica al crear la encuesta (`aplicarValoresPorDefecto()`) |
| `modo` | `'numerico'` o `'telefono'`: cambia teclado/tipo del input |
| `min` / `max` | Solo en `tipo: 'numero'` |
| `filas` | Solo en `textarea` |
| `textoConfirmacion` | Solo en `confirmacion` |
| `ayudaNivelDano` | `{sistema, elemento}`: añade el botón «Ver criterios técnicos (Anexo 1)» |
| `otroValor` / `otroCampoId` | **Declaradas en el esquema pero el motor no las lee**: la aparición del campo «¿cuál otro?» se resuelve hoy con `visibleSi` |

### 1.4 Cómo se escriben las condiciones (`visibleSi`)

Dos helpers en [js/form-vivienda.js:34](../js/form-vivienda.js#L34):

```js
eq('viv_cumple_requisitos', 'si')     // el campo es igual a ese valor
inc('viv_infra_muros', 'O')           // el array del campo incluye ese valor
```

Se combinan con `{todos: […]}`, `{alguno: […]}` y `{ninguno: […]}`. El
evaluador es `evaluarCondicion()`, [js/app.js:640](../js/app.js#L640); solo
existen los operadores `eq` e `incluye`.

---

## 2. Formulario de Vivienda (VOL-10)

**Archivo:** [js/form-vivienda.js](../js/form-vivienda.js) · **id:** `vivienda`
· **icono:** 🏠 · **formato:** `VOL-10`

Nueve secciones. Códigos de pregunta **V001 – V102** ([js/codigos.js:30](../js/codigos.js#L30)).

### Sección 1 — Información general

| Código | Campo | Tipo | Notas |
|---|---|---|---|
| V001 | `viv_codigo` — Código | texto | tercio |
| V002 | `viv_ficha_no` — Ficha No. | texto | tercio |
| V003 | `viv_alcaldia_gobernacion` — Alcaldía / Gobernación | texto | por defecto `Alcaldía de Santiago de Cali` |
| | *subtítulo* «Datos del profesional responsable…» | — | |
| V004 | `viv_prof_nombre` — Nombre del profesional | texto | **obligatorio** |
| V005 | `viv_prof_tarjeta` — Tarjeta profesional | texto | |
| V006 | `viv_prof_profesion` — Profesión | texto | |
| V007 | `viv_prof_cc` — C.C. No. (del profesional) | texto numérico | |
| V008 | `viv_prof_cc_de` — De (lugar de expedición) | texto | |
| V009 | `viv_prof_telefono` — Teléfono | texto teléfono | |
| V010 | `viv_prof_direccion` — Dirección | **texto libre** | dirección de contacto del profesional |
| V011 | `viv_fecha_evaluacion` — Fecha de evaluación | fecha | **obligatorio** |
| | *subtítulo* «Datos del propietario…» | — | |
| V012 | `viv_prop_nombres_apellidos` — Nombres y apellidos | texto | **obligatorio** |
| V013 | `viv_prop_cc` — C.C. No. | texto numérico | |
| V014 | `viv_prop_cc_de` — De (lugar de expedición) | texto | |
| V015 | `viv_prop_telefono` — Teléfono | texto teléfono | |
| V016 | `viv_prop_direccion` — Dirección | **texto libre** | dirección de contacto del propietario |

### Sección 2 — Localización de la vivienda

| Código | Campo | Tipo | Notas |
|---|---|---|---|
| V017 | `viv_departamento` — Departamento | texto | por defecto `Valle del Cauca` |
| V018 | `viv_municipio` — Municipio | lista (42 municipios del Valle, catálogo DANE en `js/municipios-valle.js`) | por defecto `Santiago de Cali`; obligatorio; se exporta con `viv_municipio_codigo` (código DANE). El mapa y la búsqueda de dirección se ajustan al municipio elegido |
| — | `viv_direccion` — Dirección de la vivienda en cabecera municipal | **direccion** | campo compuesto; no tiene código propio y no guarda nada bajo su `id` |
| V019–V039 | *(los 21 subcampos del widget de dirección)* | | Ver [05_location.md](05_location.md) |
| V040 | `viv_corregimiento` — Corregimiento | texto | |
| V041 | `viv_vereda` — Vereda | texto | |

### Sección 3 — Requisitos del propietario

Tres preguntas Sí/No, todas de ancho completo, ninguna obligatoria:

| Código | Campo |
|---|---|
| V042 | `viv_req_no_beneficiario` — No haber sido beneficiario del mismo programa… |
| V043 | `viv_req_propietario` — Ser el propietario de la vivienda afectada… |
| V044 | `viv_req_certificacion_alcaldia` — Certificación de la Alcaldía… |

### Sección 4 — Cumple requisitos

| Código | Campo | Tipo | Notas |
|---|---|---|---|
| V045 | `viv_cumple_requisitos` — ¿Cumple los requisitos? | única Sí/No | **obligatorio**. Es la pregunta que bifurca el formulario. |
| — | *aviso*: «El afectado no cumple los requisitos. Las secciones 5, 6 y 7 no se diligencian: continúe en la sección 8.» | aviso | visible si la respuesta es `no` |

### Sección 5 — Inspección de la vivienda · `visibleSi: viv_cumple_requisitos = si`

**5.1 Tipo de evento**

| Código | Campo | Tipo | Opciones |
|---|---|---|---|
| V046 | `viv_tipo_evento` | única, **obligatorio** | Inundación · Vendaval · Sismo · Avenida torrencial · Remoción en masa · Otro, ¿cuál? |
| V047 | `viv_tipo_evento_otro` | texto | visible si V046 = `otro` |

**5.2 Sistema constructivo**

| Código | Campo | Tipo | Opciones |
|---|---|---|---|
| V048 | `viv_sistema_constructivo` | única, **obligatorio** | Mampostería · Madera |

De esta respuesta depende qué matriz de la 5.4 y qué combos de la sección 6 se
muestran.

**5.3 Infraestructura actual** — cuatro preguntas de selección múltiple, cada
una con su campo «¿cuál otro material?» condicionado a que se marque `O`:

| Código | Campo | Opciones (valor · etiqueta) |
|---|---|---|
| V049 | `viv_infra_muros` — Muros divisorios | L Ladrillo · Bl Bloque · M Madera · G Guadua · Ba Bahareque · O Otro |
| V050 | `viv_infra_muros_otro` | visible si V049 incluye `O` |
| V051 | `viv_infra_pisos` — Pisos | C Cemento · B Baldosa · M Madera · T Tierra · O Otro |
| V052 | `viv_infra_pisos_otro` | visible si V051 incluye `O` |
| V053 | `viv_infra_estructura` — Estructura | M Madera · Co Concreto · Ma Mampostería · O Otro |
| V054 | `viv_infra_estructura_otro` | visible si V053 incluye `O` |
| V055 | `viv_infra_cubierta` — Cubierta | Pc Placa concreto · M Madera · Ac Asbesto-cemento · Tb Teja de barro · Z Zinc · P Palma · O Otro |
| V056 | `viv_infra_cubierta_otro` | visible si V055 incluye `O` |

**5.4 Evaluación técnica** — la matriz del papel se convierte en **dos preguntas
por elemento**, generadas por la función `elementoDano()`
([js/form-vivienda.js:56](../js/form-vivienda.js#L56)):

- `viv_<sistema>_<elemento>_afectado` → Sí/No, visible si el sistema coincide.
- `viv_<sistema>_<elemento>_nivel` → Leve / Moderado / Severo / Colapso total
  (más «No aplica (N/A)» en los elementos marcados así en el transcript),
  visible **solo si** el sistema coincide **y** el elemento fue afectado.

*Mampostería* (`visibleSi: viv_sistema_constructivo = mamposteria`):

| Elemento | Afectado | Nivel | ¿Incluye N/A? |
|---|---|---|---|
| Vigas y columnas | V057 | V058 | no |
| Muros de carga | V059 | V060 | no |
| Muros divisorios | V061 | V062 | no |
| Placa de piso | V063 | V064 | **sí** |
| Cubierta | V065 | V066 | no |
| Instalaciones hidrosanitarias | V067 | V068 | **sí** |
| Instalaciones eléctricas | V069 | V070 | no |

*Madera* (`visibleSi: viv_sistema_constructivo = madera`):

| Elemento | Afectado | Nivel | ¿Incluye N/A? |
|---|---|---|---|
| Vigas y columnas | V071 | V072 | no |
| Entrepisos | V073 | V074 | no |
| Muros en madera | V075 | V076 | **sí** |
| Cubierta | V077 | V078 | no |
| Instalaciones hidrosanitarias | V079 | V080 | no |
| Instalaciones eléctricas | V081 | V082 | **sí** |

Cada pregunta de **nivel de daño** lleva `ayudaNivelDano` y por tanto muestra el
botón «Ver criterios técnicos (Anexo 1)», que despliega el texto de
[js/ayuda-nivel-dano.js](../js/ayuda-nivel-dano.js).

| Código | Campo | Tipo |
|---|---|---|
| V083 | `viv_requiere_evacuacion` — ¿Requiere evacuación la vivienda? | única Sí/No |

Además hay un *aviso* visible cuando aún no se ha escogido sistema constructivo
(`{ninguno: [esMamposteria, esMadera]}`).

### Sección 6 — Banco de materiales · `visibleSi: viv_cumple_requisitos = si`

| Código | Campo | Tipo | Visible si |
|---|---|---|---|
| V084 | `viv_combo_mamposteria` — Combo 1 Leve / Combo 2 Moderado / Combo 3 Severo | única | sistema = mampostería |
| V085 | `viv_combo_madera` — Combo 4 Leve / Combo 5 Moderado / Combo 6 Severo | única | sistema = madera |
| V086 | `viv_kit_cubierta_mamposteria` — Cubierta zinc / fibrocemento | única | sistema = mampostería |
| V087 | `viv_kit_cubierta_madera` — Cubierta zinc | única | sistema = madera |
| V088 | `viv_combo_colapso_total` — Mampostería / Madera | única | siempre |

### Sección 7 — Persona que suministra la información · `visibleSi: cumple = si`

| Código | Campo | Tipo |
|---|---|---|
| V089 | `viv_inf_nombre` — Nombre | texto |
| V090 | `viv_inf_cc` — C.C. No. | texto numérico |
| V091 | `viv_inf_parentesco` — Parentesco | texto |
| V092 | `viv_inf_telefono` — Teléfono cel./fijo | texto teléfono |
| V093 | `viv_inf_firma` — Firma | confirmación («La persona firmó el formato físico») |

### Sección 8 — Afectado que no cumple requisitos · `visibleSi: cumple = no`

| Código | Campo | Tipo |
|---|---|---|
| — | *nota* con el texto literal de la declaración de conformidad | nota |
| V094 | `viv_declaracion_tipo` — Rehabilitación / Construcción | única |
| V095 | `viv_nc_nombre` — Nombre | texto |
| V096 | `viv_nc_cc` — C.C. No. | texto numérico |
| V097 | `viv_nc_telefono` — Teléfono cel./fijo | texto teléfono |
| V098 | `viv_nc_firma` — Firma | confirmación |

### Sección 9 — Firma y aprobación *(siempre visible)*

| Código | Campo | Tipo |
|---|---|---|
| V099 | `viv_firma_profesional_nombre` | texto |
| V100 | `viv_firma_profesional_ok` | confirmación |
| V101 | `viv_aprobo_coordinador_nombre` | texto |
| V102 | `viv_aprobo_coordinador_ok` | confirmación |

### Resumen de obligatorios — Vivienda

Solo **seis** campos tienen `requerido: true`:

`viv_prof_nombre` (V004) · `viv_fecha_evaluacion` (V011) ·
`viv_prop_nombres_apellidos` (V012) · `viv_cumple_requisitos` (V045) ·
`viv_tipo_evento` (V046) · `viv_sistema_constructivo` (V048).

Los dos últimos solo se exigen cuando la sección 5 es visible, es decir, cuando
el afectado cumple requisitos.

---

## 3. Formulario de Personas / Familia (VOL-3 · EDAN)

**Archivo:** [js/form-personas.js](../js/form-personas.js) · **id:** `personas`
· **icono:** 👪 · **formato:** `VOL-3 · FR-1703-SMD-08 v01`

Dos secciones. Códigos **P001 – P025** ([js/codigos.js:157](../js/codigos.js#L157)).

### Sección «1-4» — Personas del hogar *(repetible)*

```js
{ id: 'secPersonas', numero: '1-4', tipo: 'repetible',
  claveLista: 'personas', etiquetaItem: 'Persona', minimo: 1, … }
```

Las secciones 1 a 4 del formato en papel se diligencian **una vez por persona**.
En pantalla aparece un bloque por persona con botón «Eliminar persona» (solo si
hay más de `minimo`) y al final un botón «+ Agregar otra persona». No hay tope
de personas.

**1. Información demográfica**

| Código | Campo | Tipo | Opciones |
|---|---|---|---|
| P001 | `per_nombres` — Nombres | texto | **obligatorio** |
| P002 | `per_apellidos` — Apellidos | texto | **obligatorio** |
| P003 | `per_tipo_documento` | única | 1 Registro civil · 2 Tarjeta de identidad · 3 Cédula de ciudadanía · 4 Cédula de extranjería · 5 Indocumentado · 6 No sabe / No responde |
| P004 | `per_numero_documento` | texto numérico | |
| P005 | `per_parentesco` con el jefe de hogar | única | 1 Jefe de hogar · 2 Esposo(a) · 3 Hijo(a) · 4 Primo(a) · 5 Tío(a) · 6 Nieto(a) · 7 Suegro(a) · 8 Yerno/Nuera |
| P006 | `per_genero` | única | F Femenino · M Masculino |
| P007 | `per_edad` | número (0–120) | ayuda: «Años cumplidos» |
| P008 | `per_etnia` | única | 1 Afrocolombiano · 2 Indígena · 3 Gitano-Rom · 4 Raizal · 5 Otro · 6 Sin información |

**2. Salud**

| Código | Campo | Opciones |
|---|---|---|
| P009 | `per_estado_salud` | 1 Requiere asistencia médica · 2 No requiere asistencia médica |
| P010 | `per_afiliacion_salud` | 1 Contributivo · 2 Subsidiado · 3 Sin afiliación |

**3. Vivienda**

| Código | Campo | Opciones |
|---|---|---|
| P011 | `per_ubicacion_inmueble` | Rural · Urbano |
| P012 | `per_propiedad_inmueble` | Propia · Arriendo |
| P013 | `per_estado_inmueble` | 1 Habitable · 2 No habitable · 3 Destruida |

**4. Necesidades** — cuatro preguntas Sí/No:

| Código | Campo |
|---|---|
| P014 | `per_ahe_alimentaria` — AHE Alimentaria |
| P015 | `per_ahe_no_alimentaria` — AHE No alimentaria |
| P016 | `per_mat_rehab_vivienda` — Material para rehabilitación de vivienda |
| P017 | `per_sub_arriendo` — Subsidio de arriendo |

### Sección 5 — Datos finales del formato *(una vez por encuesta)*

| Código | Campo | Tipo |
|---|---|---|
| P018 | `edan_elaborado_por` | texto, **obligatorio** |
| P019 | `edan_elaborado_por_firma` | confirmación |
| P020 | `edan_entidad_operativa` | texto |
| P021 | `edan_observaciones` | textarea (4 filas) |
| P022 | `edan_vobo_cmgrd_nombre` | texto |
| P023 | `edan_vobo_cmgrd_firma` | confirmación |
| P024 | `edan_vobo_cdgrd_nombre` | texto |
| P025 | `edan_vobo_cdgrd_firma` | confirmación |

### Resumen de obligatorios — Personas

`per_nombres` (P001) y `per_apellidos` (P002) **por cada persona registrada**, y
`edan_elaborado_por` (P018) una vez por encuesta.

### Ningún campo condicional

El formulario de Personas **no tiene ningún `visibleSi`**. Todas sus preguntas se
muestran siempre.

---

## 4. Cómo se presentan y funcionan hoy las preguntas

| Aspecto | Comportamiento actual |
|---|---|
| **Una sección por pantalla** | Se ve una sección a la vez. Tira de pasos arriba (`#form-pasos`) para saltar a cualquier sección visible. |
| **Código visible** | Cada enunciado lleva delante su código en una píldora monoespaciada (`V046`, `P003`). Se genera con `CODIGOS.de()`. |
| **Obligatorios** | Asterisco rojo `*` junto al enunciado. |
| **Opciones** | Radios y checkboxes con la fila completa tocable (mín. 48 px de alto) y resaltado `.marcada` al seleccionar. Menos de 4 opciones → columnas; 4 o más → una por fila. |
| **Condicionales** | Al cambiar un campo que condiciona a otros, `renderSeccion()` redibuja toda la sección. Los campos ocultos no se validan ni cuentan en el progreso, pero **su valor previo permanece guardado**. |
| **Validación** | Solo existe la validación de obligatoriedad (`requerido`). No hay validaciones de formato, longitud, rango de cédula, dígito de verificación ni consistencia entre campos. `per_edad` tiene `min: 0` / `max: 120`, que es la validación nativa del `<input type="number">`. |
| **Bloqueo de avance** | «Siguiente →» comprueba los obligatorios de la sección actual y muestra la lista de faltantes en `#form-errores`. «Finalizar encuesta» comprueba **todas** las secciones visibles. |
| **Guardado** | Automático: cada cambio programa un guardado a los 400 ms (`guardarDiferido()`); al navegar entre secciones, agregar/eliminar persona o confirmar ubicación, se guarda de inmediato (`guardarAhora()`). La píldora `#form-guardado` muestra «Guardando…» / «Guardado ✓». |
| **Progreso** | Barra + texto «Sección X de Y · N de M campos diligenciados (P%)», calculado sobre los campos visibles con dato. |
| **Ayuda técnica** | En los niveles de daño, botón «Ver criterios técnicos (Anexo 1)» que despliega el texto correspondiente. Es solo lectura; no se guarda nada. |

Ver el detalle del motor en [08_navigation.md](08_navigation.md).

---

## 5. Los transcripts

### 5.1 Dónde están

Carpeta **`input/formularios/`**:

| Archivo | Qué es | Relación con la app |
|---|---|---|
| **`vol10_viviendas.docx`** | **Transcript de Vivienda.** Transcripción del formato VOL-10, hoja «F1 EVALUACIÓN», secciones 1 a 9, más el **Anexo 1 — Clasificación del nivel de daño**. | Fuente de verdad de [js/form-vivienda.js](../js/form-vivienda.js) y de [js/ayuda-nivel-dano.js](../js/ayuda-nivel-dano.js) |
| **`vol3_personas.docx`** | **Transcript de Personas/Familia.** Transcripción del formato VOL-3 «EDAN», código FR-1703-SMD-08 versión 01, secciones 1 a 5. | Fuente de verdad de [js/form-personas.js](../js/form-personas.js) |
| `VOL-10-Formato-Inspeccion-de-vivienda-Octubre-26.xlsx` | Formato original en Excel. Hojas: `F1 EVALUACIÓN`, `F2-PLANO`, `F3-fotografias`, `ANEXO 1 MAMPOSTERÍA`, `ANEXO 1 MADERA`, `ANEXO 2 MAMPOSTERÍA`, `ANEXO 2 MADERA`, `Hoja1`. | Insumo del que se hizo el transcript |
| `VOL-3-Formato-EDAN.xlsx` | Formato original en Excel (una hoja). | Insumo del que se hizo el transcript |

### 5.2 Qué relación tienen con los formularios de la app

La relación está declarada explícitamente en el encabezado de cada esquema:

- [js/form-vivienda.js:4](../js/form-vivienda.js#L4) — *«FUENTE DE VERDAD:
  input/formularios/vol10_viviendas.docx … Las preguntas, sus opciones y su
  orden reproducen el transcript; no se agregaron ni se eliminaron preguntas.»*
- [js/form-personas.js:4](../js/form-personas.js#L4) — *«FUENTE DE VERDAD:
  input/formularios/vol3_personas.docx … Las preguntas, sus códigos numéricos y
  sus etiquetas reproducen el transcript.»*
- [js/ayuda-nivel-dano.js:3](../js/ayuda-nivel-dano.js#L3) — *«FUENTE:
  input/formularios/vol10_viviendas.docx, apartado "Anexo 1"»*

Los `.docx` **no se leen en tiempo de ejecución**: son documentación de origen.
El contenido se transcribió a mano a los objetos JavaScript.

### 5.3 Adaptaciones declaradas del papel a la aplicación

Documentadas en los propios encabezados de los esquemas:

**Vivienda** ([js/form-vivienda.js:9](../js/form-vivienda.js#L9)):

1. Las firmas manuscritas se registran como **confirmación** de que la persona
   firmó el formato físico.
2. La matriz de la sección 5.4 se presenta como **dos preguntas por elemento**;
   el nivel de daño solo se pide si el elemento fue afectado.
3. **Departamento y Municipio** vienen prellenados (Valle del Cauca / Santiago
   de Cali) y son editables.
4. Las secciones **5, 6 y 7 se ocultan** y aparece la **8** cuando el afectado no
   cumple requisitos, aplicando la instrucción del propio formato.
5. La **dirección de la vivienda** deja de ser texto libre y pasa a ser un campo
   compuesto con nomenclatura colombiana y georreferenciación. Las direcciones
   del profesional y del propietario siguen siendo texto libre.

**Personas** ([js/form-personas.js:9](../js/form-personas.js#L9)):

1. La matriz de 12 filas del papel se convierte en una **sección repetible sin
   tope** de personas.
2. Las opciones muestran el código del formato junto a su significado
   (`3 · Cédula de ciudadanía`); lo que se guarda y exporta es el código.
3. Las firmas se registran como nombre + confirmación de firma física.

### 5.4 Qué no se incorporó

Según el `README.md` de la raíz (sección 7):

- **F2-PLANO** (esquema de la vivienda a mano alzada) y **F3-FOTOGRAFÍAS**.
- **Anexo 2** (banco de materiales estandarizado): se cita como referencia en el
  texto de la sección 6, pero no se despliega el detalle de kits y cantidades.

También se deja constancia allí de una **discrepancia entre el Excel y el
transcript** en la sección 5.4 de mampostería sobre en qué elementos aplica
«N/A»: la aplicación siguió el transcript (Placa de piso e Instalaciones
hidrosanitarias).
