-- Migración 023: Ampliar columnas varchar(20) que son demasiado cortas para datos reales
-- prioridad, tipo y estado pueden recibir valores de Excel más largos

ALTER TABLE etapas ALTER COLUMN prioridad TYPE varchar(50);
ALTER TABLE etapas ALTER COLUMN estado TYPE varchar(30);

ALTER TABLE acciones ALTER COLUMN prioridad TYPE varchar(50);
ALTER TABLE acciones ALTER COLUMN estado TYPE varchar(30);
ALTER TABLE acciones ALTER COLUMN tipo TYPE varchar(50);
