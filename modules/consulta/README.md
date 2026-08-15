# Aplicativo de consulta

Consulta de la base oficial consolidada, con dos modos de ingreso:

- **Consulta ciudadana** (sin credenciales): búsqueda **solo por cédula** (se
  rechaza cualquier término no numérico; la dirección se usa internamente en
  el pipeline pero no es consultable). Muestra únicamente la información
  asociada a esa cédula, incluida la ficha con **todas las respuestas del
  formulario**.
- **Equipo a cargo de la base** (usuario `eduard`, contraseña `123` —
  preliminar): las tres bases en pestañas (Edificaciones, Afectaciones,
  Personas), tabla tipo Excel (orden por columna, filtro por columna, búsqueda
  global), observaciones por registro, casos por revisar y descargas (CSV
  filtrado y Excel de las tres bases).

Es un sitio 100 % estático: funciona con doble clic en `index.html` o servido
por cualquier servidor. Los datos los regenera el pipeline en cada corrida
(`pipeline/04_exportar_consulta.R` → `js/datos.js` y
`descargas/base_consulta.xlsx`).

## Observaciones

Se guardan en el navegador (`localStorage`, clave
`alcaldia_sismos_observaciones_v1`) con usuario y fecha, sobreviven a las
regeneraciones de `datos.js`, salen en el CSV descargado y tienen exportación
propia («Exportar observaciones»). La **sincronización automática entre
usuarios** requiere un backend (no existe en un sitio estático): quedará
resuelta al integrarlo al portal, usando el mismo Apps Script que ya recibe
las encuestas.

## Relación con el pipeline (`consolidacion/`)

**El código del aplicativo vive aquí** (este es el único lugar donde se
edita). Lo que NO se edita a mano son los datos: **`js/datos.js` y
`descargas/base_consulta.xlsx` los regenera el pipeline de `consolidacion/`,
en este mismo repositorio, en cada corrida** (cada 10 minutos), a través del
parámetro `CARPETA_CONSULTA` de su `config/parameters.R`, que apunta a esta
carpeta.
Ese pipeline es el que lee los Excel de OneDrive, consolida, deduplica y hace
el matching; este módulo solo presenta el resultado.

Para publicar: trabajo `pages` del repositorio
(GitLab → Build → Pipelines → ejecutar `pages`; es manual a propósito).

**Antes de publicar**: cambiar la contraseña `123` (en `js/app.js`,
`USUARIOS`) y tener presente que `js/datos.js` y `descargas/` contienen
cédulas y datos de salud — en GitLab Pages quedan al alcance de quien tenga la
URL. Revisar en Deploy → Pages si el sitio queda público o restringido a
miembros del proyecto.

## Conexión con las bases de OneDrive

El aplicativo no se conecta a OneDrive: lee `js/datos.js`, y ese archivo lo
produce el pipeline de este repositorio, que es el que vigila la carpeta de
OneDrive (sincronizada localmente; `CARPETA_ONEDRIVE` en
`config/parameters.R`). El flujo completo queda:

```
Excel en OneDrive → carpeta sincronizada → pipeline (cada 10 min)
    → base_oficial.sqlite → js/datos.js → este aplicativo
```

Mientras el aplicativo se use localmente, no hay nada más que hacer: cada
corrida deja `datos.js` al día. Cuando esté publicado en GitLab Pages, la
máquina del pipeline debe además **empujar el `datos.js` regenerado al
repositorio** (commit + push de `modules/consulta/js/datos.js` y ejecutar el
trabajo `pages`); ese paso se puede automatizar en `run_pipeline.R` cuando se
decida publicar.
