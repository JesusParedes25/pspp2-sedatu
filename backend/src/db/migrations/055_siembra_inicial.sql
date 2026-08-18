-- ═══════════════════════════════════════════════════════════════
-- PSPP v2.0 — Migración 055: registro de siembra inicial de catálogos
--
-- La estructura organizacional (subsecretarías, URs, DGs, direcciones
-- de área) y los programas presupuestarios del Ramo 15 se aseguran al
-- arrancar el backend, para que una instalación nueva no nazca con los
-- catálogos vacíos. Eso resolvió el problema de producción, pero dejó
-- otro: al correr en CADA arranque, un área o un programa que el
-- superadministrador eliminara desde el panel reaparecía en el
-- siguiente reinicio. El panel no podía ganarle al arranque.
--
-- Esta tabla es la marca de "esto ya se sembró una vez". Con ella, el
-- arranque siembra únicamente cuando el catálogo nunca se ha sembrado;
-- a partir de ahí el panel de administración es la única autoridad
-- sobre esos catálogos, y agregar, editar o quitar desde ahí es
-- definitivo.
--
-- POR QUÉ SE MARCA AQUÍ Y NO SOLO AL SEMBRAR: las bases que ya están
-- en operación (producción incluida) ya tienen sus áreas y sus
-- programas, unos sembrados y otros capturados a mano. Si la marca
-- solo la pusiera el sembrador, la próxima vez que arrancara el
-- backend volvería a insertar lo que el usuario ya hubiera decidido
-- eliminar — exactamente lo que se quiere evitar. Por eso la migración
-- marca como "ya sembrado" todo catálogo que hoy tenga contenido.
--
-- Una base realmente nueva llega aquí con las tablas vacías, no se
-- marca, y el arranque siguiente la siembra por única vez.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS siembra_inicial (
  clave       VARCHAR(60) PRIMARY KEY,
  sembrado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  detalle     TEXT
);

COMMENT ON TABLE siembra_inicial
  IS 'Catálogos que ya recibieron su siembra inicial. Mientras la clave exista, el arranque del backend no vuelve a tocar ese catálogo: manda el panel de administración.';

-- Estructura organizacional: si ya hay direcciones generales, esta base
-- ya está en operación y su catálogo de áreas lo gobierna el panel.
INSERT INTO siembra_inicial (clave, detalle)
SELECT 'estructura_sedatu',
       'Marcada por la migración 055: la base ya tenía áreas capturadas.'
 WHERE EXISTS (SELECT 1 FROM direcciones_generales)
ON CONFLICT (clave) DO NOTHING;

-- Programas presupuestarios: mismo criterio.
INSERT INTO siembra_inicial (clave, detalle)
SELECT 'programas_ramo15',
       'Marcada por la migración 055: la base ya tenía programas capturados.'
 WHERE EXISTS (SELECT 1 FROM programas)
ON CONFLICT (clave) DO NOTHING;
