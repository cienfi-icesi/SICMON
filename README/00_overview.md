# 00 · Visión general del portal

## Qué es

**Portal de atención y gestión de información — Emergencia por sismo, Santiago
de Cali.** Es una plataforma web que centraliza los aplicativos, formularios y
fuentes de información que se utilizan para la atención y el seguimiento del
desastre ocasionado por el sismo en Cali.

Universidad Icesi · CIENFI · Alcaldía de Santiago de Cali.

## Para qué sirve

Antes, cada instrumento vivía por separado. El portal da **un único punto de
entrada**: el usuario llega a una sola dirección, ve qué instrumentos existen,
en qué estado está cada uno, y entra al que necesita.

El portal en sí mismo **no procesa información**. Solo presenta y dirige. Toda
la funcionalidad vive dentro de los módulos.

## Qué módulos contiene hoy

| Módulo | Estado | Qué hace |
|---|---|---|
| **Registro de afectaciones (EDAN)** | Disponible | Aplicativo completo de recolección en campo: formatos VOL-10 (inspección de viviendas) y VOL-3 (EDAN de personas y familias), con roles, mapa, GPS, panel de seguimiento, exportación a CSV y envío a la base central. |
| **Observación satelital — Copernicus** | Próximamente | Espacio destinado a información satelital y geoespacial. La interfaz está lista; todavía **no hay fuente de datos conectada**. |
| **Registro y seguimiento de atención** | Próximamente | Espacio reservado para futuros instrumentos de registro y seguimiento de hogares afectados. |

## Alcance de esta etapa

```
recolectar  →  almacenar  →  respaldar  →  consultar
```

El portal **no incluye análisis de la información recolectada**: ni tableros, ni
indicadores derivados, ni gráficos de resultados, ni cruces de variables, ni
reportes analíticos. Es una decisión del proyecto, no una omisión. Si más
adelante se necesita una herramienta de análisis, será un desarrollo
independiente que se incorporará como un módulo más.

## Objetivo general

Que la plataforma **crezca sin rehacerse**. Agregar un instrumento nuevo
—un formulario, una fuente geoespacial, una herramienta de consulta— debe
consistir en crear una carpeta dentro de `modules/` y añadir una línea al
registro de módulos. Ni el portal ni los módulos existentes se tocan.

Ver [01_architecture.md](01_architecture.md) para cómo está construido eso.

## Cómo ejecutarlo

Es un sitio estático: no necesita instalación, ni base de datos, ni compilación.

**Doble clic en `servir.bat`** y se abre el portal en el navegador. No hay que
instalar nada: usa PowerShell, que viene con Windows.

> No abra `index.html` con doble clic (`file://`): el módulo EDAN guarda las
> encuestas en el almacenamiento local del navegador, y algunos navegadores lo
> bloquean en ese modo. Por eso hace falta servirlo por HTTP.

Detalle en [04_development.md](04_development.md).

## Documentación

| Archivo | Contenido |
|---|---|
| [00_overview.md](00_overview.md) | Este documento |
| [01_architecture.md](01_architecture.md) | Arquitectura, estructura de carpetas, cómo se incorporan módulos |
| [02_modules.md](02_modules.md) | Detalle de cada módulo |
| [03_edan.md](03_edan.md) | Cómo se incorporó el aplicativo EDAN y dónde quedó |
| [04_development.md](04_development.md) | Guía para quien vaya a desarrollar |
| [05_persistencia.md](05_persistencia.md) | Persistencia del progreso, trazabilidad y respaldo centralizado |

Cada módulo tiene además su propio `README.md`. El módulo EDAN conserva su
documentación completa en `modules/edan/README/`.
