-- SCRIPT: territorio-cobertura-nodos-indicadores.sql
-- PROPÓSITO: Bloque B4 del encargo "API pública de indicadores para el
-- tablero de la Secretaría" — qué proporción de los nodos (etapa/acción/
-- tarea) que hoy aportan a algún indicador tienen territorio capturado,
-- separando territorio_propio (lo que el nodo mismo tiene capturado) de
-- territorio_efectivo (después de aplicar la misma herencia que usa
-- GET /publico/indicadores: tarea -> su acción -> acción padre si es
-- subacción -> etapa; acción/subacción -> etapa; una etapa nunca hereda).
-- Ver publico.controller.js::territorioEfectivoAccion/territorioEfectivoTarea
-- para la lógica original en JS que esta consulta reproduce en SQL.
--
-- Es de SOLO LECTURA. No modifica nada. No forma parte de migrate.js ni
-- corre sola; se ejecuta a mano con psql cuando alguien quiera medir la
-- cobertura real de territorio antes de prometerla al consumidor externo:
--   psql -U <usuario> -d <base> -f backend/src/db/scripts/territorio-cobertura-nodos-indicadores.sql
--
-- Nota: mide existencia ("¿tiene algo?"), no corrección de ese algo —
-- un nodo con territorio_efectivo = true puede tener solo cve_ent sin
-- ningún municipio, que la API expone igual (entidad con municipios: []).

WITH nodos_etapa AS (
  SELECT DISTINCT ia.id_etapa AS nodo_id
  FROM indicador_aportaciones ia WHERE ia.id_etapa IS NOT NULL
),
nodos_accion AS (
  SELECT DISTINCT ia.id_accion AS nodo_id
  FROM indicador_aportaciones ia WHERE ia.id_accion IS NOT NULL
),
nodos_tarea AS (
  SELECT DISTINCT ia.id_tarea AS nodo_id
  FROM indicador_aportaciones ia WHERE ia.id_tarea IS NOT NULL
),

etapa_resuelta AS (
  SELECT
    ne.nodo_id, 'Etapa' AS tipo,
    (e.cve_ent IS NOT NULL OR EXISTS (SELECT 1 FROM etapa_municipios em WHERE em.etapa_id = e.id)) AS propio
  FROM nodos_etapa ne JOIN etapas e ON e.id = ne.nodo_id
),
etapa_con_efectivo AS (
  SELECT nodo_id, tipo, propio, propio AS efectivo FROM etapa_resuelta
),

accion_resuelta AS (
  SELECT
    na.nodo_id, 'Accion' AS tipo,
    (a.cve_ent IS NOT NULL OR EXISTS (SELECT 1 FROM accion_municipios am WHERE am.accion_id = a.id)) AS propio,
    a.id_accion_padre, a.id_etapa
  FROM nodos_accion na JOIN acciones a ON a.id = na.nodo_id
),
accion_con_efectivo AS (
  SELECT
    ar.nodo_id, ar.tipo, ar.propio,
    ar.propio
      OR (padre.cve_ent IS NOT NULL OR EXISTS (SELECT 1 FROM accion_municipios pm WHERE pm.accion_id = padre.id))
      OR (etapa.cve_ent IS NOT NULL OR EXISTS (SELECT 1 FROM etapa_municipios em WHERE em.etapa_id = etapa.id))
      AS efectivo
  FROM accion_resuelta ar
  LEFT JOIN acciones padre ON padre.id = ar.id_accion_padre
  LEFT JOIN etapas etapa ON etapa.id = ar.id_etapa
),

tarea_resuelta AS (
  SELECT
    nt.nodo_id, 'Tarea' AS tipo,
    (t.cve_ent IS NOT NULL OR EXISTS (SELECT 1 FROM tarea_municipios tm WHERE tm.tarea_id = t.id)) AS propio,
    t.id_accion
  FROM nodos_tarea nt JOIN tareas t ON t.id = nt.nodo_id
),
tarea_con_efectivo AS (
  SELECT
    tr.nodo_id, tr.tipo, tr.propio,
    tr.propio
      OR (acc.cve_ent IS NOT NULL OR EXISTS (SELECT 1 FROM accion_municipios am WHERE am.accion_id = acc.id))
      OR (padre.cve_ent IS NOT NULL OR EXISTS (SELECT 1 FROM accion_municipios pm WHERE pm.accion_id = padre.id))
      OR (etapa.cve_ent IS NOT NULL OR EXISTS (SELECT 1 FROM etapa_municipios em WHERE em.etapa_id = etapa.id))
      AS efectivo
  FROM tarea_resuelta tr
  LEFT JOIN acciones acc ON acc.id = tr.id_accion
  LEFT JOIN acciones padre ON padre.id = acc.id_accion_padre
  LEFT JOIN etapas etapa ON etapa.id = acc.id_etapa
),

todos AS (
  SELECT * FROM etapa_con_efectivo
  UNION ALL
  SELECT * FROM accion_con_efectivo
  UNION ALL
  SELECT * FROM tarea_con_efectivo
)

SELECT
  tipo,
  COUNT(*)                                                    AS total_nodos,
  COUNT(*) FILTER (WHERE propio)                              AS con_territorio_propio,
  ROUND(100.0 * COUNT(*) FILTER (WHERE propio) / COUNT(*), 1)   AS pct_propio,
  COUNT(*) FILTER (WHERE efectivo)                            AS con_territorio_efectivo,
  ROUND(100.0 * COUNT(*) FILTER (WHERE efectivo) / COUNT(*), 1) AS pct_efectivo
FROM todos
GROUP BY tipo
UNION ALL
SELECT
  'TOTAL',
  COUNT(*),
  COUNT(*) FILTER (WHERE propio),
  ROUND(100.0 * COUNT(*) FILTER (WHERE propio) / COUNT(*), 1),
  COUNT(*) FILTER (WHERE efectivo),
  ROUND(100.0 * COUNT(*) FILTER (WHERE efectivo) / COUNT(*), 1)
FROM todos
ORDER BY 1;
