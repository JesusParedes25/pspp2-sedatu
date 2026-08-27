-- Migración 065: backfill de acciones.id_proyecto para acciones creadas por
-- "Duplicar etapa" antes de este fix. El INSERT de duplicarEtapa
-- (duplicar.queries.js) omitía la columna id_proyecto en las acciones que
-- copia — quedaban con id_proyecto NULL. Esas acciones (y sus tareas, por
-- rebote) se veían bien en el árbol de Seguimiento (que navega por
-- id_etapa) pero desaparecían de todo lo que filtra
-- "acciones WHERE id_proyecto = $1": dashboard, Panorama, carteras,
-- indicadores, riesgos, evidencias del proyecto.
--
-- No hay forma de distinguir aquí una acción duplicada-con-el-bug de una
-- fila corrupta por otra causa — pero da igual: id_proyecto SIEMPRE debe
-- coincidir con el de su etapa (así lo pone crearAccionEnEtapa y todo el
-- resto del código), así que resolverlo desde la etapa es correcto para
-- cualquier acción con id_proyecto NULL, no solo las del bug de duplicar.
-- Idempotente (solo toca filas con id_proyecto IS NULL).
UPDATE acciones a
SET id_proyecto = e.id_proyecto
FROM etapas e
WHERE e.id = a.id_etapa
  AND a.id_proyecto IS NULL;
