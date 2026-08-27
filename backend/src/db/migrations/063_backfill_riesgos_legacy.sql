-- Migración 063: unifica los riesgos "legacy" que solo vivían en el stream
-- `actividad` (reportados con el cuadro de texto rápido que existió antes de
-- que "Reportar riesgo" pasara a usar el modal completo — ver
-- reportarRiesgo en frontend/src/api/actividad.js, ya sin ningún caller) a
-- la tabla `riesgos`. Esos reportes nunca tuvieron fila en `riesgos`, así
-- que eran de solo lectura: no había nada estructurado (tipo, responsable,
-- causa, medida de mitigación...) que editar detrás. El PR #18 dejó el
-- botón de editar sin mostrarse para ellos en vez de fallar con "Riesgo no
-- encontrado" — este backfill es el paso que faltaba para que esos
-- usuarios por fin puedan editarlos/resolverlos en producción.
--
-- Por cada fila de actividad con tipo_evento='riesgo' que aún no apunta a
-- un riesgo real (metadata sin 'riesgo_id'): crea la fila `riesgos`
-- equivalente y BORRA la fila de actividad original. No se deja enlazada
-- (metadata.riesgo_id) en su lugar porque obtenerActividadNodo ya trae los
-- riesgos de la tabla `riesgos` por su cuenta (sintetizados, ver query
-- "Riesgos (modelo viejo)") — dejar las dos filas produciría un duplicado
-- en el stream (la de actividad + la sintetizada desde riesgos). Borrar y
-- dejar que la nueva fila de `riesgos` sea la única fuente de verdad es lo
-- que de verdad "unifica" el dato, que es lo que se pidió.
--
-- Idempotente: una fila ya migrada (borrada) no puede volver a
-- seleccionarse en una segunda corrida.
DO $$
DECLARE
  fila RECORD;
  entidad_tipo_calc VARCHAR(20);
  entidad_id_calc UUID;
  nivel_calc VARCHAR(10);
BEGIN
  FOR fila IN
    SELECT * FROM actividad
    WHERE tipo_evento = 'riesgo'
      AND (metadata->>'riesgo_id') IS NULL
      AND COALESCE(id_etapa, id_accion, id_tarea) IS NOT NULL
  LOOP
    entidad_tipo_calc := CASE
      WHEN fila.id_etapa IS NOT NULL THEN 'Etapa'
      WHEN fila.id_accion IS NOT NULL THEN 'Accion'
      ELSE 'Tarea'
    END;
    entidad_id_calc := COALESCE(fila.id_etapa, fila.id_accion, fila.id_tarea);

    nivel_calc := fila.metadata->>'nivel';
    IF nivel_calc IS NULL OR nivel_calc NOT IN ('Bajo', 'Medio', 'Alto', 'Critico') THEN
      nivel_calc := 'Medio';
    END IF;

    INSERT INTO riesgos (
      titulo, descripcion, nivel, tipo, estado,
      entidad_tipo, entidad_id, id_reportador, created_at, updated_at
    ) VALUES (
      LEFT(COALESCE(fila.contenido, 'Riesgo sin título'), 300),
      fila.contenido,
      nivel_calc, 'Riesgo', 'Abierto',
      entidad_tipo_calc, entidad_id_calc, fila.id_usuario,
      fila.created_at, fila.created_at
    );

    DELETE FROM actividad WHERE id = fila.id;
  END LOOP;
END $$;
