-- ═══════════════════════════════════════════════════════════════
-- PSPP v2.0 — Migración 001: Creación de tablas
-- Ejecutar en orden. Cada tabla depende solo de las anteriores.
-- ═══════════════════════════════════════════════════════════════

-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS postgis;

-- Tabla 1: subsecretarias (nivel jerárquico superior)
CREATE TABLE subsecretarias (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre      VARCHAR(300) NOT NULL,
  siglas      VARCHAR(30) NOT NULL UNIQUE,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- Tabla 2: unidades_responsables
-- Agrupa a las Direcciones Generales dentro de cada Subsecretaría
CREATE TABLE unidades_responsables (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre           VARCHAR(300) NOT NULL,
  siglas           VARCHAR(30) NOT NULL UNIQUE,
  id_subsecretaria UUID REFERENCES subsecretarias(id),
  created_at       TIMESTAMP DEFAULT NOW()
);

-- Tabla 3: direcciones_generales
-- Unidad organizacional principal. Cada DG pertenece a una UR.
CREATE TABLE direcciones_generales (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre                VARCHAR(300) NOT NULL,
  siglas                VARCHAR(30) NOT NULL UNIQUE,
  descripcion           TEXT,
  id_unidad_responsable UUID REFERENCES unidades_responsables(id),
  created_at            TIMESTAMP DEFAULT NOW()
);

-- Tabla 4: direcciones_area
-- Subdivisiones dentro de una DG (ej: DAOT dentro de DGOTU)
CREATE TABLE direcciones_area (
  id     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre VARCHAR(300) NOT NULL,
  siglas VARCHAR(30) NOT NULL UNIQUE,
  id_dg  UUID REFERENCES direcciones_generales(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabla 5: usuarios
CREATE TABLE usuarios (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre_completo VARCHAR(200) NOT NULL,
  correo          VARCHAR(200) NOT NULL UNIQUE,
  password_hash   VARCHAR(200) NOT NULL,
  cargo           VARCHAR(200),
  rol             VARCHAR(20) NOT NULL
                  CHECK (rol IN ('Ejecutivo','Directivo','Responsable','Operativo')),
  activo          BOOLEAN DEFAULT true,
  id_dg           UUID REFERENCES direcciones_generales(id),
  id_direccion_area UUID REFERENCES direcciones_area(id),
  created_at      TIMESTAMP DEFAULT NOW()
);

-- Tabla 6: programas
CREATE TABLE programas (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre           VARCHAR(300) NOT NULL,
  clave            VARCHAR(20),
  tipo             VARCHAR(30) NOT NULL
                   CHECK (tipo IN ('Prioritario_Nacional','Ramo_15','Otro')),
  ejercicio_fiscal INT,
  activo           BOOLEAN DEFAULT true
);

-- Tabla 7: proyectos
CREATE TABLE proyectos (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre                  VARCHAR(300) NOT NULL,
  descripcion             TEXT,
  tipo                    VARCHAR(30) NOT NULL
                          CHECK (tipo IN (
                            'Obra_fisica','Instrumento_planeacion',
                            'Programa_masivo','Regularizacion',
                            'Proceso_recurrente','Analisis_tecnico',
                            'Conflicto_agrario','Otro'
                          )),
  estado                  VARCHAR(20) NOT NULL DEFAULT 'Programado'
                          CHECK (estado IN (
                            'Programado','En_proceso','Pausado','Concluido','Cancelado'
                          )),
  meta_descripcion        TEXT NOT NULL,
  tiene_indicador         BOOLEAN DEFAULT false,
  indicador_nombre        VARCHAR(200),
  indicador_valor_actual  DECIMAL(10,2) DEFAULT 0,
  indicador_meta          DECIMAL(10,2),
  indicador_unidad        VARCHAR(100),
  es_prioritario          BOOLEAN DEFAULT false,
  ciclo_anual             BOOLEAN DEFAULT false,
  dependencia_externa     BOOLEAN DEFAULT false,
  descripcion_dependencia TEXT,
  tiene_subproyectos      BOOLEAN DEFAULT false,
  fecha_inicio            DATE,
  fecha_limite            DATE,
  porcentaje_calculado    DECIMAL(5,2) DEFAULT 0,
  deleted_at              TIMESTAMP,
  id_dg_lider             UUID REFERENCES direcciones_generales(id),
  id_direccion_area_lider UUID REFERENCES direcciones_area(id),
  id_creador              UUID REFERENCES usuarios(id),
  id_programa             UUID REFERENCES programas(id),
  created_at              TIMESTAMP DEFAULT NOW(),
  updated_at              TIMESTAMP DEFAULT NOW()
);

-- Tabla 8: proyecto_dgs
-- Registra qué DGs participan en cada proyecto y con qué rol
CREATE TABLE proyecto_dgs (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_proyecto         UUID REFERENCES proyectos(id) ON DELETE CASCADE,
  id_dg               UUID REFERENCES direcciones_generales(id),
  id_direccion_area   UUID REFERENCES direcciones_area(id),
  rol_en_proyecto     VARCHAR(20) NOT NULL
                      CHECK (rol_en_proyecto IN ('Lider','Colaboradora')),
  id_responsable      UUID REFERENCES usuarios(id),
  fecha_incorporacion TIMESTAMP DEFAULT NOW(),
  UNIQUE(id_proyecto, id_dg)
);

-- Tabla 9: etiquetas
CREATE TABLE etiquetas (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre      VARCHAR(100) NOT NULL,
  id_proyecto UUID REFERENCES proyectos(id) ON DELETE CASCADE
);

-- Tabla 10: subproyectos
CREATE TABLE subproyectos (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre               VARCHAR(300) NOT NULL,
  descripcion          TEXT,
  estado               VARCHAR(20) NOT NULL DEFAULT 'Programado'
                       CHECK (estado IN (
                         'Programado','En_proceso','Pausado','Concluido','Cancelado'
                       )),
  fecha_inicio         DATE,
  fecha_fin            DATE,
  porcentaje_calculado DECIMAL(5,2) DEFAULT 0,
  id_proyecto          UUID REFERENCES proyectos(id) ON DELETE CASCADE,
  created_at           TIMESTAMP DEFAULT NOW()
);

-- Tabla 11: etapas
CREATE TABLE etapas (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre               VARCHAR(300) NOT NULL,
  descripcion          TEXT,
  orden                INT DEFAULT 0,
  estado               VARCHAR(20) NOT NULL DEFAULT 'Pendiente'
                       CHECK (estado IN (
                         'Pendiente','En_proceso','Bloqueada','Completada','Cancelada'
                       )),
  tipo_meta            VARCHAR(20) DEFAULT 'Sin_meta'
                       CHECK (tipo_meta IN ('Cuantitativa','Cualitativa','Sin_meta')),
  meta_descripcion     TEXT,
  meta_valor           DECIMAL(10,2),
  meta_unidad          VARCHAR(100),
  porcentaje_calculado DECIMAL(5,2) DEFAULT 0,
  fecha_inicio         DATE,
  fecha_fin            DATE,
  depende_de           UUID REFERENCES etapas(id),
  id_proyecto          UUID REFERENCES proyectos(id) ON DELETE CASCADE,
  id_subproyecto       UUID REFERENCES subproyectos(id) ON DELETE CASCADE,
  id_dg                UUID REFERENCES direcciones_generales(id),
  id_direccion_area    UUID REFERENCES direcciones_area(id),
  id_responsable       UUID REFERENCES usuarios(id),
  created_at           TIMESTAMP DEFAULT NOW()
);

-- Tabla 12: acciones
CREATE TABLE acciones (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre            VARCHAR(300) NOT NULL,
  descripcion       TEXT,
  tipo              VARCHAR(20) NOT NULL DEFAULT 'Accion_programada'
                    CHECK (tipo IN ('Accion_programada','Hito')),
  estado            VARCHAR(20) NOT NULL DEFAULT 'Pendiente'
                    CHECK (estado IN (
                      'Pendiente','En_proceso','Bloqueada','Completada','Cancelada'
                    )),
  porcentaje_avance DECIMAL(5,2) DEFAULT 0,
  motivo_bloqueo    TEXT,
  fecha_inicio      DATE NOT NULL,
  fecha_fin         DATE NOT NULL,
  fecha_fin_real    DATE,
  id_etapa          UUID REFERENCES etapas(id) ON DELETE CASCADE,
  id_proyecto       UUID REFERENCES proyectos(id) ON DELETE CASCADE,
  id_subproyecto    UUID REFERENCES subproyectos(id) ON DELETE CASCADE,
  id_dg             UUID REFERENCES direcciones_generales(id),
  id_direccion_area UUID REFERENCES direcciones_area(id),
  id_responsable    UUID REFERENCES usuarios(id),
  created_at        TIMESTAMP DEFAULT NOW(),
  updated_at        TIMESTAMP DEFAULT NOW()
);

-- Tabla 13: evidencias
CREATE TABLE evidencias (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre_archivo   VARCHAR(500) NOT NULL,
  nombre_original  VARCHAR(500) NOT NULL,
  ruta_minio       VARCHAR(500) NOT NULL,
  tipo_archivo     VARCHAR(100),
  categoria        VARCHAR(30) NOT NULL DEFAULT 'Otro'
                   CHECK (categoria IN (
                     'Planos','Oficios','Minutas','Estudios','Fotografias',
                     'Contratos','Geoespacial','Scripts','Reportes','Otro'
                   )),
  tamano_bytes     BIGINT,
  version          INT DEFAULT 1,
  notas            TEXT,
  fecha_generacion DATE,
  id_accion        UUID REFERENCES acciones(id),
  id_riesgo        UUID,
  id_autor         UUID REFERENCES usuarios(id),
  created_at       TIMESTAMP DEFAULT NOW()
);

-- Tabla 14: riesgos
CREATE TABLE riesgos (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  titulo                  VARCHAR(300) NOT NULL,
  descripcion             TEXT,
  causa                   TEXT,
  impacto                 TEXT,
  nivel                   VARCHAR(10) NOT NULL
                          CHECK (nivel IN ('Bajo','Medio','Alto','Critico')),
  tipo                    VARCHAR(10) NOT NULL
                          CHECK (tipo IN ('Riesgo','Problema')),
  estado                  VARCHAR(20) NOT NULL DEFAULT 'Abierto'
                          CHECK (estado IN (
                            'Abierto','En_mitigacion','Resuelto','Cerrado'
                          )),
  medida_mitigacion       TEXT,
  entidad_tipo            VARCHAR(20) NOT NULL
                          CHECK (entidad_tipo IN (
                            'Proyecto','Subproyecto','Etapa','Accion'
                          )),
  entidad_id              UUID NOT NULL,
  id_responsable          UUID REFERENCES usuarios(id),
  id_reportador           UUID REFERENCES usuarios(id),
  fecha_limite_resolucion DATE,
  created_at              TIMESTAMP DEFAULT NOW(),
  updated_at              TIMESTAMP DEFAULT NOW()
);

ALTER TABLE evidencias
  ADD CONSTRAINT fk_evidencias_riesgo
  FOREIGN KEY (id_riesgo) REFERENCES riesgos(id);

-- Tabla 15: comentarios (inmutables, sin UPDATE ni DELETE)
CREATE TABLE comentarios (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entidad_tipo        VARCHAR(20) NOT NULL
                      CHECK (entidad_tipo IN (
                        'Proyecto','Subproyecto','Etapa','Accion','Riesgo'
                      )),
  entidad_id          UUID NOT NULL,
  contenido           TEXT NOT NULL,
  id_autor            UUID REFERENCES usuarios(id),
  id_comentario_padre UUID REFERENCES comentarios(id),
  created_at          TIMESTAMP DEFAULT NOW()
);

-- Tabla 16: menciones_comentario
CREATE TABLE menciones_comentario (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_comentario UUID REFERENCES comentarios(id) ON DELETE CASCADE,
  tipo_mencion  VARCHAR(20) NOT NULL
                CHECK (tipo_mencion IN ('Usuario','DG','Evidencia')),
  id_referencia UUID NOT NULL,
  texto_mencion VARCHAR(200)
);

-- Tabla 17: notificaciones
CREATE TABLE notificaciones (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tipo          VARCHAR(30) NOT NULL
                CHECK (tipo IN (
                  'Vencimiento','Inactividad','Riesgo','Comentario',
                  'MencionUsuario','PermisoNuevo','AccionBloqueada','AvanceDG'
                )),
  mensaje       TEXT NOT NULL,
  leida         BOOLEAN DEFAULT false,
  entidad_tipo  VARCHAR(50),
  entidad_id    UUID,
  id_usuario    UUID REFERENCES usuarios(id),
  created_at    TIMESTAMP DEFAULT NOW(),
  fecha_lectura TIMESTAMP
);

-- Tabla 18: permisos_dg
CREATE TABLE permisos_dg (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_dg_origen       UUID REFERENCES direcciones_generales(id),
  id_dg_destino      UUID REFERENCES direcciones_generales(id),
  id_proyecto        UUID REFERENCES proyectos(id),
  estado             VARCHAR(20) NOT NULL DEFAULT 'Pendiente'
                     CHECK (estado IN (
                       'Pendiente','Aceptado','Rechazado','Revocado'
                     )),
  nivel_acceso       VARCHAR(20) NOT NULL DEFAULT 'Lectura'
                     CHECK (nivel_acceso IN ('Lectura','Lectura_Escritura')),
  id_invitador       UUID REFERENCES usuarios(id),
  id_aceptador       UUID REFERENCES usuarios(id),
  fecha_invitacion   TIMESTAMP DEFAULT NOW(),
  fecha_respuesta    TIMESTAMP
);

-- Tabla 19: auditoria (INMUTABLE — nunca UPDATE ni DELETE)
CREATE TABLE auditoria (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tabla_afectada   VARCHAR(100) NOT NULL,
  registro_id      UUID NOT NULL,
  campo_modificado VARCHAR(100),
  valor_anterior   TEXT,
  valor_nuevo      TEXT,
  operacion        VARCHAR(10) NOT NULL
                   CHECK (operacion IN ('INSERT','UPDATE','DELETE')),
  id_usuario       UUID REFERENCES usuarios(id),
  created_at       TIMESTAMP DEFAULT NOW()
);

-- Tabla 20: capas_geo (módulo cartográfico — segunda fase)
CREATE TABLE capas_geo (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre            VARCHAR(200) NOT NULL,
  tipo              VARCHAR(20)
                    CHECK (tipo IN ('Poligono','Punto','Linea','WMS','Raster')),
  geometria         GEOMETRY(Geometry, 4326),
  nomgeo            VARCHAR(200),
  cuegeo            VARCHAR(50),
  url_wms           VARCHAR(500),
  estado_validacion VARCHAR(20) DEFAULT 'Pendiente',
  id_proyecto       UUID REFERENCES proyectos(id),
  id_usuario        UUID REFERENCES usuarios(id),
  created_at        TIMESTAMP DEFAULT NOW()
);
