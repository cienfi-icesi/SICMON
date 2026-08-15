# Portal de atención y gestión — Emergencia por sismo

Plataforma web que centraliza los aplicativos, formularios y fuentes de
información para la atención y el seguimiento del desastre ocasionado por el
sismo en Santiago de Cali.

Universidad Icesi · CIENFI · Alcaldía de Santiago de Cali

---

## Cómo ejecutarlo

**Doble clic en `servir.bat`.** Se abre el portal en el navegador.

No hay que instalar nada: usa PowerShell, que viene con Windows. El servidor
busca un puerto libre a partir del 8801 y se detiene cerrando la ventana.

> No abra `index.html` con doble clic (`file://`): el módulo EDAN guarda las
> encuestas en el almacenamiento local del navegador y algunos navegadores lo
> bloquean en ese modo. Por eso hace falta servirlo por HTTP.

Si prefiere otra herramienta, cualquier servidor estático sirve — por ejemplo
`python -m http.server 8801` donde haya Python instalado.

## Módulos

| Módulo | Estado | Carpeta |
|---|---|---|
| Registro de afectaciones (EDAN) | Disponible | `modules/edan/` |
| Consulta de información | Disponible | `modules/consulta/` |
| Tablero de control | Disponible | `modules/tablero/` |
| Observación satelital — Copernicus | Próximamente | `modules/copernicus/` |
| Registro y seguimiento de atención | Próximamente | `modules/seguimiento/` |

El alcance de esta etapa es **recolectar → almacenar → respaldar → consultar →
visualizar**. Los tres primeros accesos de la portada están operativos y sus
destinos se configuran en `js/config.js`.

Ni la consulta ni el tablero calculan nada en el navegador: los dos leen
archivos que regenera el pipeline de `consolidacion/` en cada corrida, a
partir de la base oficial.

## Estructura

```
web_damage_cali/
├── index.html        Portal principal (Inicio · Consultas)
├── servir.bat        Levanta el portal (doble clic)
├── portal/           modulos.js (registro) · portal.js · portal.css · cali-geo.js
├── assets/           logos institucionales · shared.css · maps/cali.geojson
├── modules/          Un módulo = una carpeta
├── consolidacion/    Pipeline en R: consolida, deduplica y alimenta
│                     modules/consulta y modules/tablero
├── tools/            servir.ps1 (el servidor)
└── README/           Documentación
```

Este repositorio consolida tres desarrollos independientes: el andamiaje
modular, el diseño del portal y la integración con Google Drive. Ver
[README/06_integracion.md](README/06_integracion.md).

## Agregar un módulo

1. Copiar `modules/_plantilla/` a `modules/<id-nuevo>/`.
2. Agregar una entrada al array de `portal/modulos.js`.
3. Desarrollar dentro de esa carpeta.

No hay que tocar el portal ni los demás módulos.

## Documentación

| Archivo | Contenido |
|---|---|
| [README/00_overview.md](README/00_overview.md) | Qué es el portal y qué contiene |
| [README/01_architecture.md](README/01_architecture.md) | Arquitectura y cómo se incorporan módulos |
| [README/02_modules.md](README/02_modules.md) | Detalle de cada módulo |
| [README/03_edan.md](README/03_edan.md) | Cómo se incorporó el aplicativo EDAN |
| [README/04_development.md](README/04_development.md) | Guía de desarrollo |
| [README/05_persistencia.md](README/05_persistencia.md) | Persistencia, trazabilidad y respaldo centralizado |
| [README/06_integracion.md](README/06_integracion.md) | Qué se integró de cada desarrollo y por qué |

Cada módulo tiene además su propio `README.md`.
