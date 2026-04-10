-- ═══════════════════════════════════════════════════════════════
-- PSPP v2.0 — Migración 002: Índices para consultas frecuentes
-- Cada índice acelera una consulta específica del sistema.
-- ═══════════════════════════════════════════════════════════════

CREATE INDEX idx_capas_geo_geometria   ON capas_geo USING GIST(geometria);
CREATE INDEX idx_capas_geo_nomgeo      ON capas_geo(nomgeo);
CREATE INDEX idx_proyectos_dg_lider    ON proyectos(id_dg_lider);
CREATE INDEX idx_proyectos_estado      ON proyectos(estado);
CREATE INDEX idx_proyectos_deleted_at  ON proyectos(deleted_at);
CREATE INDEX idx_etapas_proyecto       ON etapas(id_proyecto);
CREATE INDEX idx_etapas_dg             ON etapas(id_dg);
CREATE INDEX idx_acciones_etapa        ON acciones(id_etapa);
CREATE INDEX idx_acciones_proyecto     ON acciones(id_proyecto);
CREATE INDEX idx_acciones_dg           ON acciones(id_dg);
CREATE INDEX idx_acciones_estado       ON acciones(estado);
CREATE INDEX idx_acciones_fecha_fin    ON acciones(fecha_fin);
CREATE INDEX idx_evidencias_accion     ON evidencias(id_accion);
CREATE INDEX idx_riesgos_entidad       ON riesgos(entidad_tipo, entidad_id);
CREATE INDEX idx_comentarios_entidad   ON comentarios(entidad_tipo, entidad_id);
CREATE INDEX idx_notificaciones_usuario ON notificaciones(id_usuario, leida);
CREATE INDEX idx_proyecto_dgs_proyecto ON proyecto_dgs(id_proyecto);
