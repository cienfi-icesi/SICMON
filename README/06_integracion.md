# 06 · Integración de los desarrollos

> Qué se trajo de cada carpeta, qué se conservó, qué se reemplazó y por qué.
> Etapa realizada el 13 de agosto de 2026.

---

## 1. De dónde vino cada cosa

Tres desarrollos independientes se consolidaron en este repositorio.

| Origen | Qué aportó | Dónde quedó |
|---|---|---|
| **`web_damage_cali`** (andamiaje) | Estructura modular, módulos, persistencia, trazabilidad, documentación | Todo el repositorio |
| **`mockup_sismo`** (diseño) | Interfaz del portal: tres vistas, sistema de diseño, mapa de Cali, contacto flotante | `index.html`, `portal/` |
| **`app_damage_alcaldia`** (Google Drive) | Envío de encuestas a la hoja de CIENFI, con su receptor en Apps Script | `modules/edan/` |

Las tres carpetas de origen **quedaron intactas**. Solo se leyeron.

> Nota sobre la ruta del mockup: se indicó como
> `C:\Users\danie\...\mockup_sismo`, un perfil que no existe en este equipo.
> Dropbox ya lo tenía sincronizado en
> `C:\Users\laura\Universidad ICESI Dropbox\Cienfi\mockup_sismo`, y de ahí se
> tomó.

---

## 2. El diseño del mockup pasó a ser la interfaz real

El mockup **no quedó como carpeta aparte**: su diseño es ahora el portal.

| Archivo del mockup | Dónde quedó | Cambios |
|---|---|---|
| `css/styles.css` | `portal/portal.css` | Sin cambios |
| `js/cali-geo.js` | `portal/cali-geo.js` | Sin cambios |
| `assets/maps/cali.geojson` | `assets/maps/cali.geojson` | Sin cambios |
| `index.html` | `index.html` | Adaptado (ver abajo) |
| `js/app.js` | `portal/portal.js` | Adaptado |
| `js/config.js` | `portal/modulos.js` | Fusionado con el registro del andamiaje |
| `assets/logos/` | *(no se copió)* | El portal ya tenía los mismos logos en `assets/logos/` |

### Qué se conservó del mockup

Todo lo visual y estructural: el encabezado con navegación, el hero con el mapa
SVG de Cali dibujado sobre geometría real de OpenStreetMap, la franja
introductoria, las tarjetas de módulo con su insignia de estado, el pie
completo, el botón flotante de contacto, la navegación por hash y el menú
móvil. La hoja de estilos se copió sin tocar una línea.

### Qué se adaptó

1. **Los módulos apuntan a carpetas locales.** El mockup enlazaba el aplicativo
   a `https://damage-app-333fd6.gitlab.io/`. Ahora es `modules/edan/index.html`:
   todo viaja en el mismo repositorio y funciona sin depender de un sitio
   publicado. Los enlaces locales abren en la misma pestaña; solo lo externo
   abre aparte.

2. **Tres módulos en lugar de dos.** Se sumó «Registro y seguimiento de
   atención», del andamiaje.

3. **Los módulos «Próximamente» sí se pueden abrir.** En el mockup el botón
   quedaba deshabilitado. Aquí esas páginas existen y explican qué contendrá
   cada módulo, así que se entra con un botón secundario. La insignia sigue
   comunicando el estado; el botón ya no queda muerto.

4. **Se eliminó la vista Análisis.** Ver la sección 4.

5. **El pie se alimenta del registro.** La lista «Fuentes de información» se
   genera desde `CONFIG.modulos`, para que no quede desactualizada al agregar
   un módulo.

### Sobre los dos sistemas de diseño

El portal usa el del mockup (azul `#395CE0`, Plus Jakarta Sans) y el módulo
EDAN conserva el suyo (azul `#5454E9`, Inter). **No se unificaron**, por una
razón concreta: el CSS del EDAN está afinado para captura en campo —16 px
mínimos en los campos, áreas de toque de 48 px, barra de avance fija— y tocarlo
para igualar colores arriesgaba esa afinación sin beneficio funcional. Los dos
son azules institucionales sobre fondo claro, así que la transición no se
siente como cambiar de sitio.

`assets/shared.css`, que usan los módulos demo, tampoco se tocó.

---

## 2 bis. Lo que se eliminó: la sección de análisis

Decisión del proyecto, tomada después de la primera integración: **el portal no
tiene ningún espacio destinado al análisis de las encuestas recolectadas.**

Se eliminó por completo:

| Qué | Dónde estaba |
|---|---|
| La vista **Análisis** | Tercera vista del mockup, con su placeholder de tablero |
| Su entrada en el **menú** | Escritorio y móvil |
| El botón **«Explorar análisis»** | Hero de la portada |
| La tarjeta **«02 · Análisis»** | Franja «¿Qué encontrarás en este portal?» |
| El enlace **Análisis** | Pie, sección «Secciones» |
| El módulo **Tableros de análisis** | `modules/tableros/` — carpeta eliminada |
| Su entrada en el registro | `portal/modulos.js` |
| `CONFIG.tablero` y `renderTablero()` | `portal/modulos.js`, `portal/portal.js` |

El alcance de esta etapa es **recolectar → almacenar → respaldar → consultar**.
Quedan fuera: análisis estadístico, tableros, indicadores derivados, gráficos de
resultados, cruces de variables, interpretación de respuestas y reportes
analíticos. Si más adelante se necesita una herramienta de análisis, será un
desarrollo independiente que entrará como un módulo más de Consultas.

Dos decisiones de detalle, por si conviene revisarlas:

- **La tarjeta «02» de la franja se reemplazó por «Registro en campo»**, un
  atajo directo al aplicativo EDAN. El mockup tenía dos tarjetas y con una sola
  el bloque quedaba descuadrado. No es análisis: es acceso a la recolección.
- **Los títulos del portal conservan la palabra «análisis»** («Portal de
  información y análisis», «Información y análisis sobre las afectaciones
  sísmicas en Cali»). Son los textos de marca del mockup y se dejaron tal cual;
  no son un espacio de análisis. Se pueden cambiar si se prefiere.

Los estilos `.tablero*` siguen en `portal/portal.css` porque esa hoja se
conservó exactamente como venía del mockup. No se usan y no se ven.

---

## 3. La integración con Google Drive reemplazó la del andamiaje

Esta es la decisión de fondo de esta etapa, y conviene entender por qué.

Los dos desarrollos habían construido una capa de respaldo. Al compararlas:

| | Andamiaje (`web_damage_cali`) | Google Drive (`app_damage_alcaldia`) |
|---|---|---|
| Destino | **Ninguno configurado** | **Apps Script real, desplegado y respondiendo** |
| Receptor | No existía | `apps-script/Codigo.gs`, 16 KB |
| Qué enviaba | El registro JSON crudo | Las **mismas filas y columnas del CSV** |
| Qué encuestas | Todas, incluidos borradores | Solo **finalizadas** |
| Autorización | No | Token |
| Tiempo límite | No | Sí (`AbortController`) |
| Mensajes de error | Genéricos | Traducidos y accionables |
| Identifica el equipo | No | Sí, código estable por máquina |

**Se adoptó la de Google Drive**, íntegra. No por antigüedad ni por autoría:
tiene el receptor construido y funcionando, envía el formato correcto, y las
decisiones que toma —solo finalizadas, texto plano para evitar el preflight
CORS, escritura serializada con `LockService`— responden a problemas reales que
la otra no había enfrentado todavía.

### Archivos incorporados

```
modules/edan/js/config-sync.js        Dirección y token del Apps Script
modules/edan/js/sincronizacion.js     Cola de envío, reintentos, estados
modules/edan/apps-script/Codigo.gs    Receptor (se pega en el editor de Google)
```

### Qué se conservó del andamiaje

La integración **no borró** lo construido antes. Sigue vigente:

- Reanudación automática del borrador en la sección donde se quedó.
- «Guardado 10:48 a. m.» con la hora real del último guardado.
- Bitácora de hitos y contador `n_actualizaciones`.
- Lista de encuestas separada en «Sin terminar» y «Finalizadas».
- Columnas de trazabilidad en el CSV.

La bitácora quedó integrada con el envío: ahora registra también
`sincronizada` y `error_sync`, así que en una sola secuencia se lee el ciclo
completo:

```
creada → editada → finalizada → sincronizada → editada
```

### Qué se descartó

La capa de respaldo del andamiaje (`estado_sync` con cuatro estados,
`pendientesDeSync`, `marcarSincronizado`, `marcarErrorSync`, envío por lotes) y
su modelo de estados. Los campos pasaron a ser los de la integración:
`sincronizada`, `fecha_sincronizacion`, `intentos_sync`, `ultimo_error_sync`.

### Una coincidencia que vale la pena registrar

Los dos desarrollos encontraron **el mismo problema por separado**: la pantalla
del formulario guarda en memoria una copia del registro, y si la cola envía esa
encuesta en segundo plano, el siguiente guardado del formulario borraba la
marca de envío.

Ambos lo resolvieron con la misma idea —el estado de envío en disco manda sobre
el de memoria— pero la solución de la integración es más general: una lista
explícita de `CAMPOS_SYNC` protegidos y `marcarSincronizacion()` como única vía
para tocarlos. **Se conservó esa.**

---

## 4. Cómo funciona el envío hoy

```
El diligenciador finaliza una encuesta
        ↓
Se guarda en el equipo (siempre, pase lo que pase)
        ↓
Se intenta enviar de inmediato
        ↓
   ¿llegó?  ── sí ──→  sincronizada = true, fecha_sincronizacion
        │
        └── no ──→  queda en la cola: reintento cada 90 s y al volver la conexión
```

- **Solo se envían encuestas finalizadas.** Un borrador a medias no viaja.
- **Una encuesta enviada no se borra del equipo**: queda marcada, y el CSV
  local sigue sirviendo como respaldo.
- **Reenviar es seguro**: el Apps Script reconoce `id_encuesta` y reemplaza las
  filas en lugar de duplicarlas.
- **Un fallo de red nunca toca el dato local.**

Indicadores: píldora en la barra superior («Todo enviado ✓», «3 por enviar»,
«Sin conexión · 2 por enviar», «Enviando…»), estado por encuesta en «Mis
encuestas recientes», columna «Respaldo» en la tabla del panel, y un panel
propio con el destino, el detalle y los botones de enviar y probar conexión.

### Configuración

`modules/edan/js/config-sync.js` trae la dirección del Apps Script y el token.
Ese archivo lo explica con franqueza: **el token no es un secreto** —viaja al
navegador de quien abra la aplicación— sino un filtro para que un envío
accidental o un robot no escriba en la hoja. Lo que acota el riesgo es que la
dirección solo permite escribir, que los envíos son idempotentes y que todo
queda en la pestaña `_bitacora`.

Si los campos quedan vacíos, la aplicación funciona igual: guarda en el equipo
y permite descargar los CSV. Solo no envía.

---

## 5. Qué se verificó

Ejecutando el portal integrado:

| Prueba | Resultado |
|---|---|
| Portal: dos vistas, navegación por hash, menú móvil | ✔ |
| Mapa de Cali dibujado con geometría real | ✔ 3 trazos |
| Tres módulos con su insignia y enlace correcto | ✔ |
| Ninguna mención a tableros en la interfaz | ✔ |
| Una URL vieja con `#analisis` no rompe nada | ✔ cae a Inicio |
| Todas las rutas del sitio responden | ✔ 15/15 en 200 |
| **Conexión real con el Apps Script de CIENFI** | ✔ respondió con la hora del servidor |
| EDAN: crear, editar, finalizar | ✔ |
| `filasParaSincronizar` produce las tablas del CSV | ✔ viviendas (227 col.) + índice (23 col.) |
| Envío marca `sincronizada` e incrementa `intentos_sync` | ✔ |
| Editar tras enviar **no borra** la marca de envío | ✔ |
| Bitácora integrada con los eventos de envío | ✔ |
| CSV: una fila, con las columnas de envío | ✔ |
| Panel del coordinador con el estado del envío | ✔ |
| Responsive en 375 px, sin desplazamiento horizontal | ✔ |

**No se escribieron datos de prueba en la hoja real de CIENFI.** La conexión se
verificó con el «ping», que no escribe, y el ciclo de envío se validó
interceptando la petición en el navegador.

---

## 6. Pendientes de esta integración

- **Un archivo residual**: `modules/edan/js/sincronizacion-drive.js` es la copia
  intermedia que se usó al integrar. El contenido vigente está en
  `sincronizacion.js`; el residual se puede borrar.
- **Unificar la identidad visual del EDAN** con la del portal, si se decide que
  vale la pena (ver sección 2).
- **Publicación por HTTPS**: sigue pendiente, y es necesaria para que funcione
  el GPS del EDAN en campo.
