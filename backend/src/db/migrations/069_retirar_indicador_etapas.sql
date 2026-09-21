-- Migración 069: retirar indicador_etapas, unificar en indicador_aportaciones
--
-- Mecanismo paralelo que se le pasó a la migración 068: ModalNuevaEtapa
-- y ModalEditarEtapa seguían escribiendo en indicador_etapas
-- (meta_etapa) al asociar un indicador existente a una etapa nueva o
-- editada. Nada leía esa tabla en el frontend (GET /etapas/:id/
-- indicadores existe pero no tiene ningún consumidor) y su columna
-- valor_actual nunca la actualizaba ningún recálculo — capturar ahí
-- era un callejón sin salida: el dato se guardaba y desaparecía.
--
-- Se unifica en indicador_aportaciones, que ya soporta id_etapa desde
-- el día uno (migración 029). meta_etapa migra a aportacion con modo
-- 'al_concluir' — mismo criterio que accion_indicador en la migración
-- 068: un valor fijo capturado de antemano solo cuenta cuando la etapa
-- se completa, no desde que se captura.
--
-- Idempotente: si indicador_etapas ya no existe (migración ya
-- corrida), el bloque no hace nada.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'indicador_etapas') THEN
    INSERT INTO indicador_aportaciones (id_indicador, id_etapa, aportacion, modo)
    SELECT id_indicador, id_etapa, meta_etapa, 'al_concluir'
    FROM indicador_etapas
    ON CONFLICT (id_indicador, id_etapa) WHERE id_etapa IS NOT NULL DO NOTHING;

    DROP TABLE indicador_etapas;
  END IF;
END $$;
