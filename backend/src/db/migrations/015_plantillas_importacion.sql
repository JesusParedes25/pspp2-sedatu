-- ═══════════════════════════════════════════════════════════════
-- PSPP v2.0 — Migración 015: Plantillas de importación
--
-- Tabla para almacenar configuraciones de mapeo reutilizables
-- por DG. Las plantillas del sistema tienen id_dg = NULL.
-- Idempotente: CREATE TABLE IF NOT EXISTS.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS plantillas_importacion (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre            VARCHAR(200) NOT NULL,
  descripcion       TEXT,
  config            JSONB NOT NULL,
  id_dg             UUID REFERENCES direcciones_generales(id),
  id_creador        UUID REFERENCES usuarios(id),
  es_predeterminada BOOLEAN DEFAULT false,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plantillas_importacion_dg
  ON plantillas_importacion(id_dg);

-- Plantilla pre-cargada 1: Canónico jerárquico (formato legacy del importador)
INSERT INTO plantillas_importacion (nombre, descripcion, es_predeterminada, config)
SELECT
  'canonico-jerarquico',
  'Formato original del importador PSPP: columnas Nivel, Clave Etapa, Etapa, Clave Acción, Acción, Peso, Fecha Inicio, Fecha Fin, Responsable, Dependencia Externa, Entregable, Estado.',
  true,
  '{
    "version": 1,
    "headerRow": 1,
    "superHeaderRow": null,
    "dataStartRow": 2,
    "rowLevel": "etapa",
    "parentEntityId": null,
    "hierarchy": {
      "enabled": true,
      "column": 0,
      "valueMap": {
        "ETAPA": "etapa",
        "ACCION": "accion",
        "SUBACCION": "subaccion"
      },
      "parentKeyColumn": 3,
      "parentKeyFormat": "prefix"
    },
    "columnMap": {
      "1": "clave",
      "2": "nombre",
      "3": "clave_accion",
      "4": "nombre_accion",
      "5": "peso",
      "6": "fecha_inicio",
      "7": "fecha_fin",
      "8": "responsable",
      "9": "dependencia_externa",
      "10": "entregable",
      "11": "estado"
    },
    "pivotBlocks": [],
    "valueMap": {
      "estado": {
        "Concluido": "Completada",
        "Concl.": "Completada",
        "En proceso": "En_proceso",
        "No iniciado": "Pendiente",
        "Sin información": "Pendiente",
        "Cancelado": "Cancelada"
      }
    },
    "duplicateKey": {
      "etapa": ["nombre"],
      "accion": ["nombre"],
      "subaccion": ["nombre"]
    }
  }'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM plantillas_importacion WHERE nombre = 'canonico-jerarquico'
);

-- Plantilla pre-cargada 2: DOOTU PUMOT (formato pivotado)
INSERT INTO plantillas_importacion (nombre, descripcion, es_predeterminada, config)
SELECT
  'dootu-pumot',
  'Formato DOOTU PUMOT 2019-2025: cada fila es una etapa (municipio/instrumento), con 6 fases pivotadas como acciones (Consulta Pública, Aprobación, Congruencia, Publicación, Inscripción RPP, Carga SITU).',
  true,
  '{
    "version": 1,
    "headerRow": 2,
    "superHeaderRow": 1,
    "dataStartRow": 3,
    "rowLevel": "etapa",
    "parentEntityId": null,
    "hierarchy": {
      "enabled": false,
      "column": null,
      "valueMap": {},
      "parentKeyColumn": null,
      "parentKeyFormat": null
    },
    "columnMap": {
      "0": "orden",
      "1": "nombre",
      "2": "descripcion"
    },
    "pivotBlocks": [
      {
        "name": "Consulta Pública",
        "columns": [3, 4, 5, 6],
        "fieldMap": {
          "3": "estado",
          "4": "fecha_inicio",
          "5": "fecha_fin",
          "6": "descripcion"
        },
        "createsLevel": "accion"
      },
      {
        "name": "Aprobación",
        "columns": [7, 8, 9],
        "fieldMap": {
          "7": "estado",
          "8": "fecha_inicio",
          "9": "descripcion"
        },
        "createsLevel": "accion"
      },
      {
        "name": "Congruencia",
        "columns": [10, 11, 12],
        "fieldMap": {
          "10": "estado",
          "11": "fecha_inicio",
          "12": "descripcion"
        },
        "createsLevel": "accion"
      },
      {
        "name": "Publicación",
        "columns": [13, 14, 15],
        "fieldMap": {
          "13": "estado",
          "14": "fecha_inicio",
          "15": "descripcion"
        },
        "createsLevel": "accion"
      },
      {
        "name": "Inscripción RPP",
        "columns": [16, 17, 18],
        "fieldMap": {
          "16": "estado",
          "17": "fecha_inicio",
          "18": "descripcion"
        },
        "createsLevel": "accion"
      },
      {
        "name": "Carga en SITU",
        "columns": [19, 20, 21],
        "fieldMap": {
          "19": "estado",
          "20": "fecha_inicio",
          "21": "descripcion"
        },
        "createsLevel": "accion"
      }
    ],
    "valueMap": {
      "estado": {
        "Concluido": "Completada",
        "Concl.": "Completada",
        "En proceso": "En_proceso",
        "No iniciado": "Pendiente",
        "Sin información": "Pendiente",
        "Realizado": "Completada",
        "Adecuado": "Completada",
        "No aplica": "Cancelada",
        "Cancelado": "Cancelada"
      }
    },
    "duplicateKey": {
      "etapa": ["nombre"],
      "accion": ["nombre"],
      "subaccion": ["nombre"]
    }
  }'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM plantillas_importacion WHERE nombre = 'dootu-pumot'
);
