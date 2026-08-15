# 08 · Navegación y motor de formularios

> Cómo se mueve el usuario entre pantallas y cómo `app.js` convierte un esquema
> en un formulario funcional. Complementa a [00_overview.md](00_overview.md) y
> [02_forms.md](02_forms.md).

---

## 1. Arranque de la aplicación

`document.addEventListener('DOMContentLoaded', iniciar)` — [js/app.js:38](../js/app.js#L38).

```
iniciar()
 ├─ cachearDom()               guarda ~60 elementos por id en el objeto `dom`
 │                             (los ids con guion pasan a camello: form-campos → formCampos)
 ├─ enlazarEventos()           un listener por control + delegación en contenedores
 ├─ precalcularCondicionantes()recorre los dos esquemas y anota qué campos
 │                             condicionan la visibilidad de algo
 ├─ escribe la versión en el pie
 └─ ¿hay sesión guardada?
       sí → sesion = guardada; entrarAlSistema(true)
       no → mostrarLogin()
```

`enlazarEventos()` usa **delegación** en cuatro contenedores clave:
`#lista-secretarias`, `#lista-formularios`, `#lista-encuestas-propias` y
`#form-campos`. Por eso el HTML se puede regenerar entero con `innerHTML` sin
volver a enganchar nada.

---

## 2. Vistas y cómo se cambia entre ellas

No hay router. `mostrarVista(nombre)` — [js/app.js:332](../js/app.js#L332):

```js
var VISTAS = ['vistaSecretaria','vistaMenu','vistaFormulario','vistaFinal','vistaPanel'];
```

Qué hace cada llamada:

1. Cierra el menú desplegable de la barra superior.
2. Quita la clase `editando` del `body` (modo teclado abierto).
3. Si la vista destino **no** es el formulario, llama a
   `CampoDireccion.desmontar()` — libera el mapa de Leaflet.
4. Alterna la clase `.oculto` en las cinco vistas.
5. Escribe el título de la barra superior según la vista.
6. `window.scrollTo({top: 0, behavior: 'smooth'})`.

La vista de **login** queda fuera de ese array: se muestra u oculta junto con
`#app-shell` en `mostrarLogin()` / `entrarAlSistema()`.

### Mapa de transiciones

```
                    ┌──────────────┐
                    │ #vista-login │
                    └──────┬───────┘
                    login OK │
              ┌──────────────┴───────────────┐
   puedeConsultar = false            puedeConsultar = true
              │                              │
   ¿sesion.secretaria?                       ▼
      no │        │ sí                 #vista-panel
         ▼        │                    (Actualizar, filtros, descargas)
 #vista-secretaria│
         └────────┤
                  ▼
            #vista-menu ◄──────────────── «Inicio» / «Finalizar y volver»
                  │  elegir formulario           ▲
                  │  o «Continuar» un borrador   │
                  ▼                              │
          #vista-formulario ─── «Guardar y salir»┤
                  │  Finalizar (validación OK)   │
                  ▼                              │
             #vista-final ─── «Diligenciar otro»─┘
                  │  «Continuar con el otro formulario»
                  └──► #vista-formulario (nueva encuesta, mismo id_hogar)
```

Botones que fuerzan transición desde la barra superior: **Inicio**
(`irAlInicio()`, guarda y vuelve al panel o al menú según el rol) y **Salir**
(`cerrarSesion()`).

---

## 3. Ciclo de vida de una encuesta

| Paso | Función | Qué ocurre |
|---|---|---|
| Crear | `crearEncuesta(tipo, origen)` — [js/app.js:478](../js/app.js#L478) | `Almacen.crear()` + `aplicarValoresPorDefecto()` + (si hay origen) `prellenarDesdeOrigen()` + `Almacen.guardar()` + `abrirEncuesta()` |
| Abrir | `abrirEncuesta(reg)` — [js/app.js:542](../js/app.js#L542) | Fija `registro`, `formActivo`, `indiceSeccion = 0`, limpia `ayudasAbiertas`, marca el borrador activo, pinta cabecera, `renderVinculo()`, `renderSeccion()`, `mostrarVista('vistaFormulario')` |
| Editar | `alCambiarCampo()` | Escribe en el contenedor correcto y programa el guardado |
| Navegar | `moverSeccion(±1)` / `alClicPaso()` | Valida (solo al avanzar), guarda y redibuja |
| Finalizar | `finalizarEncuesta()` — [js/app.js:1134](../js/app.js#L1134) | Valida **todas** las secciones visibles; `Almacen.finalizar()`; limpia el borrador activo; `mostrarPantallaFinal()` |
| Eliminar | `eliminarEncuestaActual()` | `window.confirm` + `Almacen.eliminar()` + volver al inicio |

### Prellenado entre formularios

`prellenarDesdeOrigen(nueva, origen)` — [js/app.js:521](../js/app.js#L521).
Actualmente **solo funciona en un sentido**: de Personas → Vivienda.

| Origen | Destino | Qué se copia |
|---|---|---|
| Personas | Vivienda | `per_nombres + per_apellidos` de la **primera** persona → `viv_prop_nombres_apellidos`; `per_numero_documento` → `viv_prop_cc` |
| Vivienda | Personas | **nada**. El comentario del código lo justifica: el formato de vivienda guarda «Nombres y apellidos» en un solo campo y separarlo sería una suposición. El vínculo se mantiene por el `id_hogar`. |

Los campos copiados se registran en `registro.prellenados`, se pintan con borde
verde y llevan la nota «Dato traído del otro formulario del mismo hogar…». La
marca desaparece en cuanto se edita el campo.

Nota: los dos esquemas declaran una propiedad `camposVinculo`
([js/form-vivienda.js:95](../js/form-vivienda.js#L95),
[js/form-personas.js:38](../js/form-personas.js#L38)) que describe qué campos son
equivalentes entre formularios, pero **ningún archivo la lee**: el prellenado
está codificado a mano en `prellenarDesdeOrigen()`.

---

## 4. Motor de render

### 4.1 `renderSeccion()` — [js/app.js:670](../js/app.js#L670)

```
seccionesVisibles()                filtra secciones por visibleSi
  └─ acota indiceSeccion al rango válido
pinta título, descripción, limpia errores
CampoDireccion.desmontar()         antes de reemplazar el HTML
formCampos.innerHTML = …
  ├─ sección normal    → <div class="campos"> + renderCampo() por campo visible
  └─ sección repetible → renderSeccionRepetible()
montarCamposDireccion(seccion)     arranca el mapa DESPUÉS de insertar el HTML
renderPasos(visibles)              tira de botones de sección
renderProgreso(visibles)           barra + texto
ajusta botones Anterior / Siguiente / Finalizar
```

Consecuencia de este diseño: **cualquier cambio que afecte la visibilidad
redibuja la sección completa** (y por tanto reinicia el mapa si está en ella).

### 4.2 `renderCampo(campo, valores, lista, indice)` — [js/app.js:778](../js/app.js#L778)

Devuelve el HTML de un campo. Puntos a tener en cuenta:

- La clave del control (`id`, `name`) es `claveCampo()`: `campoId` en secciones
  normales, `<lista>_<indice>_<campoId>` en repetibles (`personas_0_per_nombres`).
- Los atributos de identificación se llevan en `data-campo`, `data-lista` y
  `data-indice`; son los que lee el manejador de cambios.
- El `<label for=…>` **solo** se pone en `texto`, `textarea`, `numero` y `fecha`:
  en radios y casillas, tocar el enunciado marcaría la primera opción.
- El código de la pregunta se antepone en una píldora (`CODIGOS.de()`).
- Todo texto pasa por `escapar()`.
- En las preguntas con `ayudaNivelDano` se añade el bloque plegable del Anexo 1
  (`renderAyudaTecnica()`), cuyo estado abierto/cerrado vive en la variable
  `ayudasAbiertas` y se pierde al cambiar de sección.

### 4.3 Secciones repetibles — `renderSeccionRepetible()` — [js/app.js:745](../js/app.js#L745)

- Si la lista está vacía, inserta un ítem vacío.
- Cada ítem lleva cabecera «Persona N», con el nombre y apellido como resumen si
  ya están escritos, y botón «Eliminar persona» si hay más de `minimo`.
- Al final, botón «+ Agregar otra persona»: hace `push({})`, aplica valores por
  defecto, guarda de inmediato, redibuja y **lleva el foco al primer campo del
  ítem recién creado**.
- Eliminar pide confirmación con `window.confirm`.

---

## 5. Condicionales

### 5.1 Precálculo

`precalcularCondicionantes()` — [js/app.js:616](../js/app.js#L616) — recorre los
dos esquemas (secciones y campos), camina por `todos` / `alguno` / `ninguno` y
arma un mapa `{campoId: true}` de todos los campos que condicionan algo. Se
calcula una sola vez, al arrancar.

### 5.2 Evaluación

`evaluarCondicion(cond, valores)` — [js/app.js:640](../js/app.js#L640):

| Forma | Semántica |
|---|---|
| `undefined` | visible |
| `{todos: […]}` | todas se cumplen |
| `{alguno: […]}` | al menos una |
| `{ninguno: […]}` | ninguna |
| `{campo, op: 'eq', valor}` | comparación de cadenas |
| `{campo, op: 'incluye', valor}` | el array del campo contiene el valor |

En secciones repetibles, la condición se evalúa **contra el objeto de la persona**
(`camposVisibles(seccion, item)`), no contra `respuestas`.

### 5.3 Redibujado selectivo

`alCambiarCampo()` — [js/app.js:917](../js/app.js#L917) — decide cuánto redibujar:

| Caso | Acción |
|---|---|
| El campo condiciona algo | `renderSeccion()` completo |
| Es opción / múltiple / confirmación y no condiciona nada | solo refresca el resaltado `.marcada` + progreso |
| Cualquier otro | solo progreso |

Además, radios y checkboxes disparan `input` **y** `change`; el manejador ignora
el `input` para no procesar el mismo cambio dos veces. La misma precaución existe
en el widget de dirección ([js/campo-direccion.js:459](../js/campo-direccion.js#L459)).

---

## 6. Progreso y pasos

- **Tira de pasos** (`renderPasos()`): un botón por sección visible, con clases
  `activo` / `completo` (completo = sin obligatorios pendientes). `centrarPasoActivo()`
  desplaza el contenedor horizontalmente para dejar el paso activo a la vista, sin
  mover la página en vertical.
- **Barra de progreso** (`renderProgreso()`): cuenta **campos visibles con dato**
  sobre el total de campos visibles con dato posible, excluyendo `subtitulo`,
  `nota` y `aviso`. En secciones repetibles cuenta los campos de **cada** persona.
  Muestra «Sección X de Y · N de M campos diligenciados (P%)».
- La misma cifra se replica en la barra fija de celular
  (`#progreso-movil-texto`, `#progreso-movil-barra`).
- El campo de dirección cuenta como diligenciado si `direccion_completa` tiene
  contenido (`valorDeCampo()`, [js/app.js:740](../js/app.js#L740)).

---

## 7. Validación

Solo existe la validación de **obligatoriedad**.

| Función | Qué hace |
|---|---|
| `estaVacio(valor)` | `undefined`/`null` → vacío; array vacío → vacío; cadena en blanco → vacío |
| `faltantesDeSeccion(seccion)` | Lista de etiquetas de campos `requerido` **visibles** y vacíos. En repetibles prefija «Persona N: » |
| `seccionCompleta(seccion)` | `faltantesDeSeccion().length === 0` |
| `mostrarFaltantes(lista)` | Pinta `#form-errores` y hace scroll hasta él |

Dónde se aplica:

- **«Siguiente →»** valida solo la sección actual (`moverSeccion(1)`). Retroceder
  no valida.
- **Saltar con la tira de pasos no valida**: `alClicPaso()` guarda y salta.
- **«Finalizar encuesta»** valida todas las secciones visibles y prefija cada
  faltante con «N. Título de la sección → ».

No hay validación de formato (cédulas, teléfonos, fechas coherentes), de rango
—salvo el `min`/`max` nativo de `per_edad`— ni de consistencia entre campos.

---

## 8. Guardado

| Función | Cuándo |
|---|---|
| `guardarDiferido()` | En cada cambio de campo. Pone la píldora en «Guardando…» y programa `guardarAhora()` a los **400 ms**. |
| `guardarAhora()` | Escribe ya. Pone «Guardado ✓» o, si falla la cuota, muestra el error en rojo y un toast. |

Puntos donde se fuerza el guardado inmediato: cambio de sección, agregar o
eliminar persona, confirmar ubicación, «Guardar y salir», «Inicio», «Salir» y
`beforeunload` (que además pide confirmación al cerrar la pestaña con cambios
pendientes).

---

## 9. Comportamiento en celular y tableta

Concentrado en `enlazarComportamientoTactil()` — [js/app.js:155](../js/app.js#L155):

| Comportamiento | Detalle |
|---|---|
| Menú desplegable | `#btn-menu` alterna `.abierto`; se cierra al tocar fuera o al usar cualquier botón del menú |
| Umbral de «pantalla angosta» | `matchMedia('(max-width: 820px)')` |
| Teclado abierto | Al enfocar un campo de escritura (no radios ni checkboxes) se añade `body.editando` —que libera la barra fija inferior— y a los **320 ms** se centra el campo con `scrollIntoView({block:'center'})`. Al perder el foco se espera **150 ms** por si el foco pasa a otro campo, para que la barra no parpadee. |
| Rotación / cambio de tamaño | Con 180 ms de espera: `ajustarTablas()` y `centrarPasoActivo()` |
| Tablas apilables | `ajustarTablas()` **mide** cada `.tabla-apilable` contra su contenedor y le pone la clase `apilada` si no cabe. No usa punto de quiebre fijo, porque las tablas del panel tienen anchos muy distintos. Los rótulos de cada celda apilada salen del atributo `data-etiqueta` que se escribe en el HTML de cada `<td>`. |

---

## 10. Panel de coordinación

| Función | Qué pinta |
|---|---|
| `prepararPanel()` | Ajusta textos según el rol y muestra u oculta el filtro de Secretaría y la tabla «Avance por Secretaría» (solo `admin`) |
| `renderPanel()` | Recalcula todo: indicadores, barras por tipo, tabla de diligenciadores, tabla de secretarías, filtro de usuarios, tabla de registros y `ajustarTablas()` |
| `secretariaDelAlcance()` | Control de acceso: `admin` → valor del filtro (o todas); resto → su propia Secretaría |
| `registrosFiltrados()` | `Almacen.listar()` con el alcance + filtros de pantalla |
| `renderTablaRegistros()` | Muestra los **200 más recientes**; avisa en el pie que la descarga incluye todos |
| `actualizarFiltroUsuarios()` | Reconstruye el selector de diligenciadores con los usuarios presentes en los datos visibles |

Se refresca al pulsar «Actualizar», al cambiar cualquiera de los filtros
(`filtroSecretaria`, `filtroTipo`, `filtroUsuario`, `filtroEstado`) y al restaurar
un respaldo.

---

## 11. Utilidades transversales

| Función | Uso |
|---|---|
| `escapar(texto)` | Escapa `& < > " '` antes de insertar en `innerHTML`. Todo el HTML se arma por concatenación de cadenas, así que esta función se usa en todas partes. `campo-direccion.js` tiene su propia copia, `esc()`. |
| `fechaLegible(iso)` | `DD/MM/AAAA HH:MM` en hora local |
| `mostrarAviso(mensaje, esError)` | Toast inferior; 3800 ms normal, 7000 ms si es error |
| `aCamello(id)` | Convierte los ids del HTML a claves del objeto `dom` |
| `buscarCampo(campoId)` | Busca la definición de un campo recorriendo el esquema activo |
