-- ============================================================================
-- schema.sql — Base de datos oficial de afectaciones (SQLite v1)
-- ----------------------------------------------------------------------------
-- Tres capas:
--   control      : processing_runs, source_files
--   cruda        : raw_records (el registro tal como llego, en JSON)
--   consolidada  : encuestas, viviendas, familias, personas
--   auditoria    : matches, duplicados, record_history
-- Dialecto neutro para poder migrar a PostgreSQL (sin tipos exclusivos de
-- SQLite; los timestamps son TEXT en formato ISO-8601, zona America/Bogota).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- capa de control
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS processing_runs (
  run_id              INTEGER PRIMARY KEY AUTOINCREMENT,
  inicio              TEXT NOT NULL,
  fin                 TEXT,
  estado              TEXT NOT NULL DEFAULT 'en_curso',  -- en_curso / ok / error
  archivos_procesados INTEGER DEFAULT 0,
  reg_insertados      INTEGER DEFAULT 0,
  reg_actualizados    INTEGER DEFAULT 0,
  reg_sin_cambio      INTEGER DEFAULT 0,
  mensaje             TEXT
);

-- una fila por version de archivo: si el archivo cambia, cambia el hash y
-- se registra una nueva fila; asi queda el historial de reemplazos
CREATE TABLE IF NOT EXISTS source_files (
  archivo             TEXT NOT NULL,
  ruta                TEXT NOT NULL,
  hash                TEXT NOT NULL,
  fecha_modificacion  TEXT,
  fecha_procesado     TEXT,
  run_id              INTEGER,
  n_registros         INTEGER,
  estado              TEXT,                              -- procesado / error
  PRIMARY KEY (archivo, hash)
);

-- ---------------------------------------------------------------------------
-- capa cruda: cada version de cada fila, tal como llego (payload JSON)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS raw_records (
  raw_id              INTEGER PRIMARY KEY AUTOINCREMENT,
  id_registro         TEXT NOT NULL,     -- id_encuesta o id_persona segun tabla
  tabla_origen        TEXT NOT NULL,     -- viviendas / personas
  archivo             TEXT NOT NULL,
  hash_fila           TEXT NOT NULL,
  payload             TEXT NOT NULL,     -- fila completa en JSON
  ingestion_timestamp TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_raw_registro ON raw_records (id_registro, tabla_origen);

-- ---------------------------------------------------------------------------
-- capa consolidada
-- ---------------------------------------------------------------------------

-- indice general de encuestas (una fila por encuesta, vigente)
CREATE TABLE IF NOT EXISTS encuestas (
  id_encuesta         TEXT PRIMARY KEY,
  tipo_formulario     TEXT,              -- vivienda / personas
  id_hogar            TEXT,
  secretaria          TEXT,
  usuario             TEXT,
  estado              TEXT,
  fecha               TEXT,
  fecha_actualizacion TEXT,
  archivo_origen      TEXT,
  hash_fila           TEXT,
  ingestion_timestamp TEXT,
  last_update         TEXT
);

-- una fila por formulario de vivienda (grano: edificacion reportada)
CREATE TABLE IF NOT EXISTS viviendas (
  id_encuesta          TEXT PRIMARY KEY,
  id_hogar             TEXT,
  prop_nombre          TEXT,
  prop_cc              TEXT,
  prop_cc_norm         TEXT,
  prop_telefono        TEXT,
  -- persona que suministra la informacion en la visita (seccion 7)
  inf_nombre           TEXT,
  inf_cc               TEXT,
  inf_cc_norm          TEXT,
  inf_telefono         TEXT,
  -- afectado que no cumple requisitos de auto-rehabilitacion (seccion 8)
  nc_nombre            TEXT,
  nc_cc                TEXT,
  nc_cc_norm           TEXT,
  -- estado de la edificacion
  cumple_requisitos    TEXT,
  requiere_evacuacion  TEXT,
  sistema_constructivo TEXT,
  tipo_evento          TEXT,
  tipo_via             TEXT,
  numero_via           TEXT,
  sufijo_via           TEXT,
  numero_generador     TEXT,
  placa_inmueble       TEXT,
  tipo_inmueble        TEXT,
  direccion_completa   TEXT,
  direccion_norm       TEXT,
  latitud              REAL,
  longitud             REAL,
  ubicacion_confirmada TEXT,
  fecha_actualizacion  TEXT,
  archivo_origen       TEXT,
  hash_fila            TEXT,
  duplicate            INTEGER DEFAULT 0,
  duplicate_confidence REAL,
  id_canonico          TEXT,
  ingestion_timestamp  TEXT,
  last_update          TEXT
);

CREATE INDEX IF NOT EXISTS idx_viv_hogar     ON viviendas (id_hogar);
CREATE INDEX IF NOT EXISTS idx_viv_cc        ON viviendas (prop_cc_norm);
CREATE INDEX IF NOT EXISTS idx_viv_cc_inf    ON viviendas (inf_cc_norm);
CREATE INDEX IF NOT EXISTS idx_viv_direccion ON viviendas (direccion_norm);

-- una fila por formulario de personas/familia (grano: familia reportada)
CREATE TABLE IF NOT EXISTS familias (
  id_encuesta          TEXT PRIMARY KEY,
  id_hogar             TEXT,
  n_personas           INTEGER,
  secretaria           TEXT,
  usuario              TEXT,
  fecha_actualizacion  TEXT,
  archivo_origen       TEXT,
  match_status         TEXT,             -- matched_hogar / matched_cedula /
                                         -- matched_address / ambiguous / no_match
  match_method         TEXT,
  match_confidence     REAL,
  id_encuesta_vivienda TEXT,
  duplicate            INTEGER DEFAULT 0,
  duplicate_confidence REAL,
  id_canonico          TEXT,
  ingestion_timestamp  TEXT,
  last_update          TEXT
);

CREATE INDEX IF NOT EXISTS idx_fam_hogar ON familias (id_hogar);

-- una fila por persona registrada (grano: persona)
CREATE TABLE IF NOT EXISTS personas (
  id_persona           TEXT PRIMARY KEY,
  id_encuesta          TEXT,
  id_hogar             TEXT,
  nombres              TEXT,
  apellidos            TEXT,
  nombre_norm          TEXT,
  tipo_documento       TEXT,
  numero_documento     TEXT,
  documento_norm       TEXT,
  parentesco           TEXT,
  genero               TEXT,
  edad                 INTEGER,
  etnia                TEXT,
  -- estado de la persona (lo que consulta el aplicativo)
  estado_salud         TEXT,
  afiliacion_salud     TEXT,
  ubicacion_inmueble   TEXT,
  propiedad_inmueble   TEXT,
  estado_inmueble      TEXT,
  -- ayudas solicitadas
  ahe_alimentaria      TEXT,
  ahe_no_alimentaria   TEXT,
  mat_rehab_vivienda   TEXT,
  sub_arriendo         TEXT,
  fecha_actualizacion  TEXT,
  archivo_origen       TEXT,
  hash_fila            TEXT,
  duplicate            INTEGER DEFAULT 0,
  duplicate_confidence REAL,
  id_canonico          TEXT,
  ingestion_timestamp  TEXT,
  last_update          TEXT
);

CREATE INDEX IF NOT EXISTS idx_per_documento ON personas (documento_norm);
CREATE INDEX IF NOT EXISTS idx_per_encuesta  ON personas (id_encuesta);

-- ---------------------------------------------------------------------------
-- auditoria
-- ---------------------------------------------------------------------------

-- bitacora de cambios de match (el estado vigente vive en familias)
CREATE TABLE IF NOT EXISTS matches (
  match_id             INTEGER PRIMARY KEY AUTOINCREMENT,
  id_encuesta_familia  TEXT NOT NULL,
  id_encuesta_vivienda TEXT,
  match_status         TEXT NOT NULL,
  match_method         TEXT,
  match_confidence     REAL,
  run_id               INTEGER,
  timestamp            TEXT NOT NULL
);

-- bitacora de duplicados detectados (el estado vigente vive en cada tabla)
CREATE TABLE IF NOT EXISTS duplicados (
  dup_id      INTEGER PRIMARY KEY AUTOINCREMENT,
  tabla       TEXT NOT NULL,              -- viviendas / familias / personas
  id_registro TEXT NOT NULL,
  id_canonico TEXT NOT NULL,
  criterio    TEXT NOT NULL,              -- documento / direccion / id_hogar / cedula_propietario
  confianza   REAL,
  run_id      INTEGER,
  timestamp   TEXT NOT NULL
);

-- historial campo a campo cuando un registro consolidado se actualiza
CREATE TABLE IF NOT EXISTS record_history (
  hist_id        INTEGER PRIMARY KEY AUTOINCREMENT,
  tabla          TEXT NOT NULL,
  id_registro    TEXT NOT NULL,
  campo          TEXT NOT NULL,
  valor_anterior TEXT,
  valor_nuevo    TEXT,
  run_id         INTEGER,
  timestamp      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hist_registro ON record_history (tabla, id_registro);
