# 03 · Cómo se incorporó el aplicativo EDAN

## Dónde quedó

```
modules/edan/
├── index.html                 Punto de entrada del módulo
├── styles.css                 Hoja de estilos del aplicativo (SIN CAMBIOS)
├── integracion-portal.css     ← ÚNICO archivo nuevo: el enlace de regreso
├── js/                        Los 9 archivos de lógica (SIN CAMBIOS)
│   ├── config.js              Secretarías, roles, usuarios, autenticación
│   ├── codigos.js             Códigos de pregunta V001–V102 / P001–P025
│   ├── campo-direccion.js     Dirección estructurada + mapa + GPS
│   ├── ayuda-nivel-dano.js    Anexo 1 (criterios técnicos)
│   ├── form-vivienda.js       Esquema del formulario VOL-10
│   ├── form-personas.js       Esquema del formulario VOL-3 / EDAN
│   ├── storage.js             Persistencia en localStorage
│   ├── export.js              Generación de los CSV
│   └── app.js                 Orquestación, render, navegación, panel
├── assets/                    Logos + Leaflet 1.9.4 alojado localmente
├── input/                     Transcripts y formatos originales (referencia)
└── README/                    Documentación completa del aplicativo
```

Punto de entrada: **`modules/edan/index.html`**, registrado en
`portal/modulos.js` con `ruta: 'modules/edan/index.html'`.

## Cómo se hizo

El aplicativo se copió **íntegro** desde el proyecto anterior
(`app_damage_alcaldia`), conservando su estructura interna intacta. Como todas
sus rutas son relativas (`js/app.js`, `assets/leaflet/leaflet.js`,
`assets/logo-icesi.png`), funciona igual dentro de `modules/edan/` que en la
raíz del proyecto original: no hubo que reescribir ninguna ruta.

**El proyecto anterior no se modificó en absoluto.** Se usó únicamente como
fuente de lectura.

## De qué versión se tomó la copia

La copia se hizo el **13 de agosto de 2026 a las 10:12**, del estado que tenía en
ese momento `app_damage_alcaldia`.

**Qué no incluye:** poco después, en la carpeta original se empezó a desarrollar
un **envío de encuestas a Google Drive mediante Google Apps Script**
(`apps-script/Codigo.gs`, `js/config-sync.js`, `js/sincronizacion.js`, más
cambios en `index.html`, `js/app.js`, `js/export.js` y `styles.css`). Esa
funcionalidad **no forma parte del módulo EDAN de este portal**: fue una
decisión explícita, no un olvido.

Si más adelante se decide incorporarla, hay que traer esos archivos y reaplicar
las cuatro adiciones de integración descritas abajo, que son lo único que
distingue este `index.html` del original.

## Qué cambió respecto del original

Solo la integración con el portal. Nada de la funcionalidad.

| Archivo | Cambio |
|---|---|
| `integracion-portal.css` | **Nuevo.** Estilos del enlace de regreso. Va aparte para que `styles.css` siga siendo idéntico al original y se pueda comparar o actualizar sin conflictos. |
| `index.html` | Cuatro adiciones: el `<link>` a esa hoja; un enlace «← Portal principal» en la barra superior; un enlace de regreso en la tarjeta de inicio de sesión; y otro en el pie. |

Ningún archivo de `js/` fue tocado. `styles.css` no fue tocado.

El enlace de la barra superior se colocó **fuera del menú desplegable**, para
que siga visible en celular cuando el menú está cerrado. En pantallas menores de
420 px se reduce al ícono `←`, con `aria-label` para lectores de pantalla.

## Qué se conservó

Verificado ejecutando el módulo dentro del portal:

| Funcionalidad | Estado |
|---|---|
| Login y autenticación | ✔ los 5 usuarios y sus alias |
| Roles y alcance de datos | ✔ diligenciador, coordinador, coordinación general |
| Selección de Secretaría | ✔ Gestión del Riesgo y Vivienda |
| Formulario de Vivienda | ✔ 9 secciones, códigos V001–V102 |
| Formulario de Personas / Familia | ✔ 2 secciones, sección repetible por persona |
| Lógica condicional | ✔ con «no cumple requisitos» aparecen las secciones 1-2-3-4-**8**-9; con «sí», 1-2-3-4-**5-6-7**-9 |
| Validación de obligatorios | ✔ bloquea el avance y lista los faltantes |
| Dirección estructurada | ✔ 21 subcampos; compone «Cra 85 # 12-35, Casa» |
| Mapa | ✔ Leaflet monta correctamente |
| GPS y geocodificación | ✔ botones y contexto de municipio/departamento |
| Guardado automático | ✔ escribe en `localStorage` con las mismas 3 claves |
| Panel de seguimiento | ✔ indicadores, filtros y tablas |
| Exportación | ✔ los 5 generadores de CSV corren (248 filas de diccionario) |
| Diseño responsive | ✔ sin desplazamiento horizontal en 375 px |

## Almacenamiento

El módulo sigue guardando en el **almacenamiento local del navegador**, con las
mismas claves que antes:

```
damage_cali_encuestas_v1
damage_cali_sesion_v1
damage_cali_borrador_activo_v1
```

Como el almacenamiento local se asocia al **origen** (dominio y puerto), y no a
la carpeta, mover el aplicativo a `modules/edan/` no afecta los datos ya
guardados: si se sirve desde el mismo origen que antes, las encuestas siguen
ahí. Si se sirve desde un origen distinto, se usa «Descargar respaldo» en el
origen anterior y «Restaurar respaldo» en el nuevo.

## Advertencias que siguen vigentes

Vienen del aplicativo original y no cambian por estar dentro del portal:

1. **La autenticación es preliminar.** Las contraseñas están en texto plano en
   `modules/edan/js/config.js` (todas son `123`). El aplicativo no debe
   publicarse en internet tal como está.
2. **El botón de ubicación actual exige HTTPS** o `localhost`. Servido desde una
   IP de red local por `http://`, el GPS queda bloqueado.
3. **Los mosaicos del mapa necesitan conexión.** Sin internet el mapa se ve
   vacío; el GPS sigue funcionando.

## Documentación detallada

`modules/edan/README/` conserva la documentación completa del aplicativo:

| Archivo | Contenido |
|---|---|
| `00_overview.md` | Qué es, tecnología, flujo general |
| `01_structure.md` | Estructura y función de cada archivo |
| `02_forms.md` | Los dos formularios pregunta por pregunta |
| `03_data.md` | Almacenamiento, registro, identificadores |
| `04_users.md` | Login, usuarios, roles, sesiones |
| `05_location.md` | Dirección, mapa, GPS, geocodificación |
| `06_export.md` | Los cinco CSV y sus columnas |
| `07_assets.md` | Logos, íconos, fuentes, paleta |
| `08_navigation.md` | Motor de formularios y navegación |

> Nota: las rutas que aparecen dentro de esos documentos son relativas a la
> carpeta del aplicativo, que ahora es `modules/edan/`.
