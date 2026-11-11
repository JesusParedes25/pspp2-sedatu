-- Migración 088: declara `auditoria` como la bitácora OFICIAL de PSPP para
-- efectos del formato de dictaminación de la DGTIC (exige trazabilidad con
-- el estado previo y posterior del objeto afectado, en un historial
-- inalterable). Documenta en la propia base de datos el papel de las tres
-- tablas que hoy conviven, para que no se vuelva a escribir una bitácora de
-- cumplimiento en la que no es. Solo COMMENT ON — no toca datos ni esquema,
-- se puede correr cualquier número de veces.

COMMENT ON TABLE auditoria IS
  'Bitácora OFICIAL de auditoría de PSPP (ver backend/src/utils/auditoria.js). '
  'registro_id no tiene llave foránea a propósito: una fila sobrevive aunque '
  'se borre la entidad que describe, incluida la cascada de borrar un '
  'proyecto completo. Es la única de las tres bitácoras del sistema '
  '(auditoria / actividad_log / actividad) que cumple "historial '
  'inalterable". No existe, ni por la API ni por la aplicación, ninguna vía '
  'para modificarla o borrarla: el único INSERT pasa por '
  'registrarAuditoria() en backend/src/utils/auditoria.js.';

COMMENT ON TABLE actividad_log IS
  'Auditoría INFORMAL (nombre heredado de la migración 031). Alimenta '
  'pantallas con texto legible para humanos (Bitácora del proyecto, '
  '"Actividad reciente" de Carteras, Tablero General, Resumen) — NO es la '
  'bitácora de cumplimiento: se borra en cascada con el proyecto '
  '(ON DELETE CASCADE en id_proyecto), así que no sobrevive el borrado '
  'definitivo que esta migración sí deja registrado en auditoria antes de '
  'que ocurra. Para trazabilidad ante un dictamen, usar auditoria.';

COMMENT ON TABLE actividad IS
  'Stream de actividad de la INTERFAZ (comentarios, archivos, riesgos y '
  'cambios de estatus/avance/estatus-cualitativo, con fecha+autor) — '
  'comodidad de usuario para la pestaña de Detalle de un nodo, NO una '
  'bitácora de auditoría: solo guarda el valor nuevo, nunca el anterior, y '
  'se borra en cascada con el nodo/proyecto. Para trazabilidad ante un '
  'dictamen, usar auditoria.';
