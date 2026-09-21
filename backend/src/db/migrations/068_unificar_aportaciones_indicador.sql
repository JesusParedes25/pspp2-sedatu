-- Migración 068: unificar accion_indicador en indicador_aportaciones
--
-- Dos mecanismos vivos escribían al mismo indicadores.valor_actual, en
-- orden fijo: recalcularIndicadoresProyecto (desde accion_indicador)
-- primero, recalcularAportacionesProyecto (desde indicador_aportaciones)
-- después — el segundo siempre pisaba al primero, así que un indicador
-- con aportaciones de ambos tipos perdía silenciosamente las de
-- accion_indicador en cada cambio de estado de cualquier nodo.
--
-- Se unifica en indicador_aportaciones (el mecanismo más completo — ya
-- soporta etapa/acción/tarea y dos modos de cálculo). Cambio de
-- comportamiento consciente: una aportación fija (capturada al crear una
-- Acción, modo Manual/Equitativo) antes contaba para el indicador desde
-- el momento en que se capturaba, sin importar el estado de la acción;
-- migrada a modo 'al_concluir', ahora solo cuenta cuando esa acción se
-- completa. El indicador debe reflejar lo realmente logrado, no una
-- promesa sin cumplir.
--
-- Un accion+indicador que ya tuviera fila en AMBOS mecanismos (caso
-- raro — implicaría estar vinculado dos veces por dos caminos distintos)
-- conserva la de indicador_aportaciones sin tocar: ON CONFLICT DO
-- NOTHING, no se pisa ni se suma.
--
-- Idempotente: si accion_indicador ya no existe (migración ya corrida),
-- ambos bloques no hacen nada.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'accion_indicador') THEN
    INSERT INTO indicador_aportaciones (id_indicador, id_accion, aportacion, modo)
    SELECT id_indicador, id_accion, valor_aportado, 'al_concluir'
    FROM accion_indicador
    ON CONFLICT (id_indicador, id_accion) WHERE id_accion IS NOT NULL DO NOTHING;

    DROP TABLE accion_indicador;
  END IF;
END $$;
