# Comparación: formulario EDAN vs. base histórica (Secretaría de Vivienda)

- Formulario EDAN actual: **127 preguntas** (102 de vivienda, 25 de personas/familia).
- Base histórica: **873 registros** y **32 columnas** (hoja "EDAN 100826 - Datos Madre").

## Resultado

| Estado | Preguntas |
|---|---|
| **No están en la base histórica** | **84** |
| Ambiguas (información relacionada pero no equivalente) | 32 |
| Parciales (existen incompletas o sin estructura) | 10 |
| Presentes | 1 |

## Hallazgos clave

1. **La base histórica no registra cédulas ni nombres de los afectados**: el cruce
   con el formulario actual solo será posible por **dirección** (texto libre tipo
   "Carrera 44 con calle 5", sin placa en la mayoría de los casos).
2. **El daño se clasifica de forma global** (Normalizacion: Colapso Estructural /
   Afectación estructural...), no por elemento como la sección 5 del formulario.
3. La base es un **registro de atención de emergencia** (prioridad, semáforo,
   rescatados, fallecidos, atrapamientos), no una inspección técnica de vivienda:
   por eso faltan las secciones de requisitos, banco de materiales y firmas.
4. Las **coordenadas** existen solo en 1 de 873 registros; la localización real de
   la base es comuna + barrio + dirección en texto libre.

El detalle pregunta a pregunta está en `comparacion_edan.xlsx` (hoja `comparacion`).
Las equivalencias semánticas son revisables en `edan_comparison/equivalencias.csv`.
