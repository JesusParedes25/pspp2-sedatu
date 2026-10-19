-- Migración 083: elimina la clase de bug "semaforo_override=true sin
-- valor de semaforo" y bloquea que vuelva a aparecer.
-- Idempotente: UPDATE de limpieza (no-op si ya no hay filas) + CHECK con
-- IF NOT EXISTS (ver 024_avance_semaforo_override.sql como referencia de
-- estilo).
--
-- CONTEXTO: semaforoEfectivo() (avance-semaforo.js) solo muestra el color
-- capturado cuando semaforo_override=true Y semaforo no es NULL; con
-- override=true y semaforo NULL, cae en silencio al cálculo automático
-- — el override no hace nada en la práctica, pero contarNodosVencidos()
-- (proyectos.stats.queries.js) sí lo trata como "ya tiene un valor fijo"
-- y excluye esa fila del conteo de vencidos aunque esté vencida por
-- fecha. Verificado en producción: 4 filas en tareas, 0 en etapas/
-- acciones, las 4 con semaforo_override=true y semaforo=NULL — ningún
-- override legítimo en toda la base, así que no hay nada que preservar.
-- No se encontró, en el código actual, ninguna ruta de escritura que
-- pueda producir esta combinación (los 3 sitios que escriben
-- semaforo_override lo hacen en la misma sentencia SQL que escribe
-- semaforo) — estas filas son anteriores a eso o vinieron de fuera de
-- la aplicación.

-- 1. Limpieza: apaga el override donde no tiene valor que mostrar.
--    En las tres tablas aunque hoy solo tareas tenga filas, para que la
--    migración sea correcta en cualquier ambiente, no solo el nuestro.
UPDATE etapas   SET semaforo_override = FALSE WHERE semaforo_override AND semaforo IS NULL;
UPDATE acciones SET semaforo_override = FALSE WHERE semaforo_override AND semaforo IS NULL;
UPDATE tareas   SET semaforo_override = FALSE WHERE semaforo_override AND semaforo IS NULL;

-- 2. CHECK que impide que el estado inconsistente vuelva a aparecer.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'etapas_semaforo_override_consistente') THEN
    ALTER TABLE etapas ADD CONSTRAINT etapas_semaforo_override_consistente
      CHECK (NOT (semaforo_override AND semaforo IS NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'acciones_semaforo_override_consistente') THEN
    ALTER TABLE acciones ADD CONSTRAINT acciones_semaforo_override_consistente
      CHECK (NOT (semaforo_override AND semaforo IS NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tareas_semaforo_override_consistente') THEN
    ALTER TABLE tareas ADD CONSTRAINT tareas_semaforo_override_consistente
      CHECK (NOT (semaforo_override AND semaforo IS NULL));
  END IF;
END$$;
