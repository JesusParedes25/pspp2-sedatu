-- Migración 064: backfill de cobertura_geografica para etapas/acciones/
-- tareas que YA tenían territorio capturado (cve_ent / *_municipios) antes
-- de que existiera el espejo automático (sincronizarCobertura, ver
-- cobertura-sync.queries.js) o antes de que tareas empezara a sincronizarlo
-- (migraciones 062 + el fix de tareas.controller.js/tareas.queries.js que
-- lo acompañó). Ese mecanismo solo dispara al GUARDAR territorio — nunca
-- corrió retroactivamente sobre lo ya capturado, así que la columna
-- "Ubicación" de Vista Lista (y el dashboard ejecutivo/Panorama, que leen
-- del mismo espejo) seguía vacía para todo nodo territorializado antes de
-- ese punto, aunque el territorio siguiera ahí en cve_ent/*_municipios.
--
-- Mismo criterio que sincronizarCobertura: sin municipios explícitos, la
-- cobertura es "todo el estado" (cve_ent); con municipios, cada uno se
-- etiqueta con SU PROPIO estado (no con el cve_ent "principal" del nodo).
-- Nodos en modo Zona Metropolitana (id_zm) se omiten a propósito — esa
-- tabla no soporta ZM, mismo comportamiento que ya tiene el PATCH manual.
--
-- Idempotente: el UNIQUE de cobertura_geografica es sobre
-- (tipo_entidad, id_entidad, id_estado, id_municipio), pero en SQL
-- NULL nunca es "igual" a otro NULL — así que ON CONFLICT DO NOTHING por sí
-- solo NO evita duplicados en el caso "todo el estado" (id_municipio NULL);
-- cada rama "sin municipios" de abajo agrega su propio NOT EXISTS contra
-- cobertura_geografica (no solo contra la tabla de municipios) para
-- cubrir eso explícitamente.

-- Etapas sin municipios propios: todo el estado.
INSERT INTO cobertura_geografica (tipo_entidad, id_entidad, id_estado, id_municipio)
SELECT 'etapa', e.id, cef.id, NULL
FROM etapas e
JOIN cat_entidades_federativas cef ON cef.clave = e.cve_ent
WHERE e.cve_ent IS NOT NULL
  AND e.id_zm IS NULL
  AND NOT EXISTS (SELECT 1 FROM etapa_municipios em WHERE em.etapa_id = e.id)
  AND NOT EXISTS (
    SELECT 1 FROM cobertura_geografica cg
    WHERE cg.tipo_entidad = 'etapa' AND cg.id_entidad = e.id AND cg.id_municipio IS NULL
  )
ON CONFLICT DO NOTHING;

-- Etapas con municipios propios.
INSERT INTO cobertura_geografica (tipo_entidad, id_entidad, id_estado, id_municipio)
SELECT 'etapa', em.etapa_id, cm.id_entidad, cm.id
FROM etapa_municipios em
JOIN cat_municipios cm ON cm.clave = em.cve_mun
ON CONFLICT DO NOTHING;

-- Acciones (y subacciones, misma tabla) sin municipios propios.
INSERT INTO cobertura_geografica (tipo_entidad, id_entidad, id_estado, id_municipio)
SELECT 'accion', a.id, cef.id, NULL
FROM acciones a
JOIN cat_entidades_federativas cef ON cef.clave = a.cve_ent
WHERE a.cve_ent IS NOT NULL
  AND a.id_zm IS NULL
  AND NOT EXISTS (SELECT 1 FROM accion_municipios am WHERE am.accion_id = a.id)
  AND NOT EXISTS (
    SELECT 1 FROM cobertura_geografica cg
    WHERE cg.tipo_entidad = 'accion' AND cg.id_entidad = a.id AND cg.id_municipio IS NULL
  )
ON CONFLICT DO NOTHING;

-- Acciones con municipios propios.
INSERT INTO cobertura_geografica (tipo_entidad, id_entidad, id_estado, id_municipio)
SELECT 'accion', am.accion_id, cm.id_entidad, cm.id
FROM accion_municipios am
JOIN cat_municipios cm ON cm.clave = am.cve_mun
ON CONFLICT DO NOTHING;

-- Tareas sin municipios propios (tareas no tiene id_zm, no aplica filtro).
INSERT INTO cobertura_geografica (tipo_entidad, id_entidad, id_estado, id_municipio)
SELECT 'tarea', t.id, cef.id, NULL
FROM tareas t
JOIN cat_entidades_federativas cef ON cef.clave = t.cve_ent
WHERE t.cve_ent IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM tarea_municipios tm WHERE tm.tarea_id = t.id)
  AND NOT EXISTS (
    SELECT 1 FROM cobertura_geografica cg
    WHERE cg.tipo_entidad = 'tarea' AND cg.id_entidad = t.id AND cg.id_municipio IS NULL
  )
ON CONFLICT DO NOTHING;

-- Tareas con municipios propios.
INSERT INTO cobertura_geografica (tipo_entidad, id_entidad, id_estado, id_municipio)
SELECT 'tarea', tm.tarea_id, cm.id_entidad, cm.id
FROM tarea_municipios tm
JOIN cat_municipios cm ON cm.clave = tm.cve_mun
ON CONFLICT DO NOTHING;
