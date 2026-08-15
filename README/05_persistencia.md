# 05 · Persistencia del progreso y respaldo

> Cómo se garantiza que nunca se pierda información diligenciada y que una
> corrección nunca duplique una encuesta.

Archivos: [`modules/edan/js/storage.js`](../modules/edan/js/storage.js),
[`modules/edan/js/sincronizacion.js`](../modules/edan/js/sincronizacion.js) y el
bloque de guardado de [`modules/edan/js/app.js`](../modules/edan/js/app.js).

---

## 1. Principio

```
Primero se guarda en el dispositivo. Después, cuando haya conexión, se envía.
Nunca al revés.
```

Perder un envío es recuperable; perder el dato diligenciado, no. Por eso ningún
fallo de red, de servidor o de conexión toca jamás la copia local.

---

## 2. Persistencia en el dispositivo

Las encuestas se guardan en el **almacenamiento local del navegador**
(`localStorage`), bajo tres claves:

| Clave | Contenido |
|---|---|
| `damage_cali_encuestas_v1` | Todas las encuestas, indexadas por `id_encuesta` |
| `damage_cali_sesion_v1` | La sesión activa |
| `damage_cali_borrador_activo_v1` | La encuesta que se estaba diligenciando |

Sobrevive a: cerrar el navegador, recargar la página, salir y volver a entrar,
perder la conexión, cambiar de pantalla dentro del aplicativo y apagar el
equipo. No sobrevive a borrar los datos del navegador ni a cambiar de equipo
(para eso están el respaldo JSON y el respaldo central).

---

## 3. Un identificador, un registro

El almacén es un objeto indexado por `id_encuesta`:

```js
{ "VIV-20260813-MHVDWB": { …registro… },
  "PER-20260813-83TKE2": { …registro… } }
```

Guardar diez veces la misma encuesta **sobrescribe la misma entrada**. No hay
forma de que una corrección genere un segundo registro: el identificador se
asigna una sola vez, al crear, y no cambia nunca.

```
VIV-20260813-MHVDWB   En progreso   30% ─┐
VIV-20260813-MHVDWB   En progreso   65% ─┤  siempre el mismo registro
VIV-20260813-MHVDWB   Completada   100% ─┘
```

Lo mismo aplica a las respuestas: si la pregunta 15 se responde «No» y luego se
corrige a «Sí», queda «Sí» como valor vigente. No se guarda un historial de
valores por pregunta, sino el estado actual.

---

## 4. Guardado automático

| Momento | Qué ocurre |
|---|---|
| Cada cambio en un campo | Se programa un guardado a los **400 ms** |
| Cambio de sección, agregar o eliminar persona, confirmar ubicación | Guardado **inmediato** |
| «Guardar y salir», «Inicio», «Salir» | Guardado inmediato |
| Cerrar la pestaña con cambios pendientes | Se fuerza el guardado y se pide confirmación |
| «Finalizar encuesta» | Se marca finalizada y se guarda |

No hace falta pulsar ningún botón de guardar. La píldora de la cabecera del
formulario muestra:

```
Guardando…            (mientras espera el guardado diferido)
Guardado 10:48 a. m.  (con la hora real del último guardado)
```

Se muestra la **hora**, no solo un visto: en campo, lo que da tranquilidad es
saber *cuándo* se guardó por última vez. Al pasar el cursor por encima aparece
la fecha y hora completas.

---

## 5. Fechas y horas

Se generan solas; el diligenciador nunca las escribe.

| Campo del registro | Cuándo se escribe |
|---|---|
| `fecha_creacion` | Al crear la encuesta |
| `fecha_actualizacion` | En **cada** guardado |
| `fecha_finalizacion` | Al finalizar |
| `fecha_sync` | Al confirmarse el envío al respaldo central |
| `n_actualizaciones` | Contador de escrituras del registro |

Todas en ISO 8601. En el CSV salen además partidas en columnas de fecha y hora
por separado (ver sección 8).

### Bitácora de hitos

Cada registro lleva una `bitacora` con los hitos de su ciclo de vida:

```js
bitacora: [
  { fecha: '…T15:58:52Z', evento: 'creada',       detalle: 'Encuesta creada por Laura' },
  { fecha: '…T15:59:31Z', evento: 'editada',      detalle: 'Respuestas actualizadas' },
  { fecha: '…T16:02:10Z', evento: 'sincronizada', detalle: 'Enviada al almacenamiento central' },
  { fecha: '…T16:05:44Z', evento: 'finalizada',   detalle: 'Encuesta finalizada' }
]
```

Eventos: `creada`, `editada`, `finalizada`, `refinalizada`, `sincronizada`,
`error_sync`.

Dos decisiones deliberadas:

- **No se registra cada pulsación.** El guardado automático corre cada 400 ms;
  una entrada por tecla llenaría el almacenamiento. Los eventos `editada`
  seguidos se agrupan en ventanas de 5 minutos, así que la bitácora muestra
  sesiones de trabajo, no ruido.
- **Se conservan los últimos 60 hitos.** Es trazabilidad reciente, no un
  registro de auditoría completo.

---

## 6. Recuperación del progreso

### Reanudación automática

Al abrir el aplicativo, si quedó una encuesta a medias **se retoma sola**, en la
misma sección donde se dejó, y se avisa con un mensaje. Solo ocurre si sigue
siendo un borrador del usuario en sesión: una encuesta finalizada, eliminada o
de otra persona no se reabre.

La sección se recuerda por su identificador (`ultima_seccion_id`), no por su
posición: las secciones visibles cambian según las respuestas, y una posición
podría apuntar a otra sección distinta.

### Lista de encuestas

En el menú principal, «Mis encuestas recientes» separa:

```
SIN TERMINAR — PUEDE CONTINUARLAS
  🏠 Vivienda · VIV-20260813-4ASPPE
     [En progreso] [Guardada en este equipo]  Actualizada hace 3 min
     [Continuar]  [+ Personas / Familia]

FINALIZADAS
  🏠 Vivienda · VIV-20260813-MHVDWB
     [Completada] [Respaldada]  Actualizada hoy 10:48 a. m.
     [Ver o corregir]  [+ Personas / Familia]
```

Lo primero que ve quien vuelve al aplicativo es qué dejó a medias.

### Navegar no borra nada

Moverse entre inicio, selección de formulario, formulario, mapa, pantalla final
y panel **no afecta el progreso**: el registro vive en el almacenamiento, no en
la pantalla. Al salir del formulario se guarda antes de cambiar de vista.

---

## 7. Estados del envío

Cada registro lleva cuatro campos, administrados **en exclusiva** por la capa
de sincronización a través de `Almacen.marcarSincronizacion()`:

| Campo | Significa |
|---|---|
| `sincronizada` | `true` si el receptor confirmó la escritura |
| `fecha_sincronizacion` | Cuándo se confirmó |
| `intentos_sync` | Cuántas veces se ha intentado |
| `ultimo_error_sync` | Motivo del último fallo, si lo hubo |

En pantalla:

| Situación | Cómo se ve |
|---|---|
| Borrador | Se enviará al finalizar (gris) |
| Finalizada, sin enviar | Pendiente de envío (ámbar) |
| Finalizada y confirmada | Enviada a la base central (verde) |
| Último intento fallido | Error de envío (rojo), con el motivo al pasar el cursor |

Aparecen en la píldora de la barra superior (con el total pendiente), en cada
tarjeta de «Mis encuestas recientes» y en la columna «Respaldo» de la tabla del
panel de coordinación. Si el envío no está configurado, los indicadores no se
muestran: informar de un envío que no existe solo confunde.

### Protección de estos campos

`guardar()` **nunca** escribe los campos de envío: los toma siempre de lo que
hay en disco. Hace falta porque la pantalla del formulario conserva en memoria
una copia del registro; si la cola envía esa encuesta en segundo plano y luego
el formulario vuelve a guardar su copia —al pulsar «Inicio», por ejemplo— esa
copia vieja borraría la marca de envío y la encuesta aparecería como pendiente
aunque ya hubiera llegado.

Lo mismo aplica a la bitácora, que se fusiona en lugar de sobrescribirse.

---

## 8. Exportación siempre vigente

El CSV se genera desde el almacén, que está indexado por identificador, así que
**una encuesta corregida diez veces sigue siendo una sola fila** con su última
versión.

Columnas de trazabilidad al inicio de cada archivo:

```
id_encuesta · tipo_formulario · id_hogar · secretaria · secretaria_nombre ·
usuario · usuario_nombre · rol · estado · fecha · hora ·
fecha_creacion · hora_creacion ·
fecha_actualizacion · hora_actualizacion ·
fecha_finalizacion · hora_finalizacion ·
n_actualizaciones · estado_respaldo · fecha_respaldo · app_version
```

---

## 9. Respaldo centralizado

> **Actualizado el 13 de agosto de 2026.** Esta sección describía una
> arquitectura a la espera de destino. En la etapa de integración se incorporó
> la implementación que ya tenía receptor construido y desplegado. Ver
> [06_integracion.md](06_integracion.md), sección 3.

### Estado actual

**Funcionando.** Las encuestas finalizadas se envían a una hoja de cálculo en
el Google Drive de CIENFI, mediante un Apps Script que actúa de receptor.

```
modules/edan/js/config-sync.js        Dirección del Apps Script y token
modules/edan/js/sincronizacion.js     Cola de envío, reintentos, estados
modules/edan/apps-script/Codigo.gs    Receptor (se pega en el editor de Google)
```

Verificado: el Apps Script responde correctamente al «ping» de comprobación.

### Configuración

En `modules/edan/js/config-sync.js`:

```js
url:   'https://script.google.com/macros/s/…/exec'
token: '…'   // debe coincidir con la propiedad TOKEN del script
```

Si esos campos quedan vacíos la aplicación funciona igual: guarda en el equipo
y permite descargar los CSV y el respaldo. Solo no envía.

El token **no es un secreto**: viaja al navegador de quien abra la aplicación.
Sirve para que un envío accidental o un robot no escriba en la hoja. Lo que
acota el riesgo es que la dirección solo permite escribir, que los envíos son
idempotentes por `id_encuesta` y que todo queda en la pestaña `_bitacora`.

### Contrato con el destino

Se envía por POST una encuesta a la vez:

```json
{
  "accion": "guardar_encuesta",
  "token": "…",
  "id_encuesta": "VIV-20260813-MHVDWB",
  "tipo_formulario": "vivienda",
  "equipo": "EQ-BNBTM (Windows)",
  "tablas": [ { "nombre": "viviendas", "encabezados": [...], "filas": [...] } ]
}
```

Y se espera:

```json
{ "ok": true, "filas_escritas": 2, "hora_servidor": "2026-08-13 11:29:21" }
```

Las **tablas son las mismas del CSV**: se generan con los mismos generadores
(`Exportador.filasParaSincronizar`). Si mañana se agrega una pregunta, la
columna aparece sola en el archivo descargado y en la hoja, sin tocar nada más.

**El receptor hace upsert por `id_encuesta`**: crea las filas si no existen y
las reemplaza si ya están. Sin eso, cada corrección acumularía duplicados.

> El cuerpo se envía como `text/plain` aunque el contenido sea JSON: las Web
> App de Google Apps Script no atienden peticiones que disparen preflight CORS.

### Cómo funciona el envío

- **Una encuesta a la vez, en serie.** El receptor serializa las escrituras con
  `LockService`, así que mandarlas en paralelo solo generaría respuestas
  «ocupado».
- **Solo encuestas finalizadas.** Un borrador a medias no viaja a la base
  central.
- Cada intento incrementa `intentos_sync`. Si falla, el motivo queda en
  `ultimo_error_sync` y se reintenta. **El dato local no se toca.**
- Tras el envío se relee el registro del almacén, por si cambió mientras
  viajaba.
- Reintento automático cada 90 segundos mientras queden pendientes, más un
  intento al abrir la aplicación y otro al recuperar la conexión.

### Con y sin conexión

```
Sin conexión  →  se sigue diligenciando y guardando con normalidad
                 (la píldora muestra «Sin conexión (N)»)
Vuelve la conexión  →  se envía lo pendiente automáticamente
```

Al recuperarse la conexión se espera unos segundos antes de intentar: recién
recuperada suele ser inestable y el primer intento falla más de lo que debería.
Además, hay un reintento automático cada 2 minutos mientras queden pendientes.

`navigator.onLine` solo indica que hay una interfaz de red activa, no que el
destino responda. Sirve para no intentar en vano; la prueba real es el propio
envío.

---

## 10. Qué se verificó

Probado ejecutando el aplicativo:

| Requisito | Resultado |
|---|---|
| Recargar la página no pierde el progreso | ✔ retoma la misma encuesta, en la misma sección, con los datos |
| Corregir una respuesta no duplica la encuesta | ✔ un solo registro, mismo identificador |
| Guardado automático con hora visible | ✔ «Guardado 10:58 a. m.» |
| Fechas y horas automáticas | ✔ creación, actualización, finalización y contador |
| Bitácora sin ruido | ✔ ediciones agrupadas, hitos conservados |
| CSV con una fila por encuesta y el dato vigente | ✔ 1 fila, respuesta corregida |
| Envío al respaldo: upsert, no duplicados | ✔ dos envíos, un registro en destino |
| Editar tras respaldar vuelve a pendiente | ✔ conserva la fecha del último respaldo |
| Fallo de envío | ✔ estado `error` con motivo; dato local intacto |
| Sin conexión | ✔ se sigue diligenciando y guardando |
| Al volver la conexión | ✔ envía solo; el dato escrito sin conexión llega al destino |

---

## 11. Límites actuales

Para que no se den por hechas cosas que no existen:

- **Los datos viven en cada equipo.** Sin un destino configurado no hay
  consolidado automático: se reúnen con los CSV o con «Descargar respaldo» /
  «Restaurar respaldo».
- **No hay resolución de conflictos.** Si la misma encuesta se editara en dos
  equipos, gana la última que llegue al destino. Hoy no puede ocurrir porque
  cada encuesta se diligencia en un solo equipo.
- **No se guarda historial de valores por pregunta**, solo el vigente. La
  bitácora registra *cuándo* se modificó, no *qué* cambió.
- **El almacenamiento del navegador tiene cuota.** Si se agota, el aplicativo
  avisa y pide descargar el respaldo; es el único escenario contemplado de
  pérdida.
