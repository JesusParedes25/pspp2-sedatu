-- ============================================================
-- MIGRACIÓN 032: rol_global en usuarios + membresías demo
-- Idempotente: ADD COLUMN IF NOT EXISTS / ON CONFLICT DO NOTHING
-- ============================================================

-- 1. Columna rol_global
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS rol_global VARCHAR(20);

-- 2. Asignar rol_global por correo
UPDATE usuarios SET rol_global = 'superadmin' WHERE correo = 'jesus.paredes@sedatu.gob.mx';
UPDATE usuarios SET rol_global = 'ejecutivo'  WHERE correo = 'subsecretario@sedatu.gob.mx';
UPDATE usuarios SET rol_global = 'direccion'  WHERE correo IN (
  'pablo.director@sedatu.gob.mx',
  'ana.garcia@sedatu.gob.mx'
);
UPDATE usuarios SET rol_global = 'externo'    WHERE correo = 'fernando.castillo@sedatu.gob.mx';
-- Todo lo que no tenga rol_global aún → enlace
UPDATE usuarios SET rol_global = 'enlace' WHERE rol_global IS NULL;

-- 3. Membresías demo — se omiten si los proyectos/usuarios no existen
DO $$
BEGIN
  INSERT INTO proyecto_usuarios (id_proyecto, id_usuario, rol, invitado_por, aceptado_en) VALUES
    ('72a6a98c-832d-4850-8986-818648882f2c', 'bfc9932a-df9a-4d18-a9a2-724660c2a14d', 'responsable', '019c1c4e-5698-4dcd-a987-3e1018e3e951', NOW()),
    ('72a6a98c-832d-4850-8986-818648882f2c', 'a0000001-0000-0000-0000-000000000002', 'colaborador', '019c1c4e-5698-4dcd-a987-3e1018e3e951', NOW()),
    ('72a6a98c-832d-4850-8986-818648882f2c', 'f199363d-a072-47de-b80b-707ef3ef6cdf', 'colaborador', '019c1c4e-5698-4dcd-a987-3e1018e3e951', NOW()),
    ('72a6a98c-832d-4850-8986-818648882f2c', 'fb9e0663-7735-4ef8-9740-78908ff17546', 'colaborador', '019c1c4e-5698-4dcd-a987-3e1018e3e951', NOW()),
    ('84d96db5-0b19-48a6-87ac-ea00cfd9338a', 'cceb4e32-3778-4755-a2b9-04ee1fd45687', 'responsable', '019c1c4e-5698-4dcd-a987-3e1018e3e951', NOW()),
    ('84d96db5-0b19-48a6-87ac-ea00cfd9338a', 'a0000001-0000-0000-0000-000000000007', 'colaborador', '019c1c4e-5698-4dcd-a987-3e1018e3e951', NOW()),
    ('84d96db5-0b19-48a6-87ac-ea00cfd9338a', 'a0000001-0000-0000-0000-000000000005', 'colaborador', '019c1c4e-5698-4dcd-a987-3e1018e3e951', NOW()),
    ('84d96db5-0b19-48a6-87ac-ea00cfd9338a', 'e27f6e06-322f-4140-9328-4286774b09b3', 'colaborador', '019c1c4e-5698-4dcd-a987-3e1018e3e951', NOW()),
    ('6c83fdad-6f20-4238-8685-9885e6c33fb5', '3720850c-6554-4c1b-8f95-e86014784686', 'responsable', '019c1c4e-5698-4dcd-a987-3e1018e3e951', NOW()),
    ('6c83fdad-6f20-4238-8685-9885e6c33fb5', 'e27f6e06-322f-4140-9328-4286774b09b3', 'colaborador', '019c1c4e-5698-4dcd-a987-3e1018e3e951', NOW()),
    ('6c83fdad-6f20-4238-8685-9885e6c33fb5', '38c15f39-787d-4229-b3ad-99d8e0eee2ce', 'colaborador', '019c1c4e-5698-4dcd-a987-3e1018e3e951', NOW()),
    ('6c83fdad-6f20-4238-8685-9885e6c33fb5', 'a0000001-0000-0000-0000-000000000008', 'colaborador', '019c1c4e-5698-4dcd-a987-3e1018e3e951', NOW()),
    ('0f7efb83-21f4-4baf-bdf4-150300ba5e68', 'ed5a134e-6ebd-42d7-9aee-55691ace1ff9', 'responsable', '019c1c4e-5698-4dcd-a987-3e1018e3e951', NOW()),
    ('0f7efb83-21f4-4baf-bdf4-150300ba5e68', 'a0000001-0000-0000-0000-000000000003', 'colaborador', '019c1c4e-5698-4dcd-a987-3e1018e3e951', NOW()),
    ('0f7efb83-21f4-4baf-bdf4-150300ba5e68', '163fce78-a80d-4f76-9674-0b00afdc3b84', 'colaborador', '019c1c4e-5698-4dcd-a987-3e1018e3e951', NOW()),
    ('0f7efb83-21f4-4baf-bdf4-150300ba5e68', 'a0000001-0000-0000-0000-000000000006', 'colaborador', '019c1c4e-5698-4dcd-a987-3e1018e3e951', NOW()),
    ('3aba121d-ad58-4376-ae1f-b2c85f88f578', 'fb9e0663-7735-4ef8-9740-78908ff17546', 'responsable', '019c1c4e-5698-4dcd-a987-3e1018e3e951', NOW()),
    ('3aba121d-ad58-4376-ae1f-b2c85f88f578', 'd5d951ae-b80a-476f-befa-9480f890b713', 'colaborador', '019c1c4e-5698-4dcd-a987-3e1018e3e951', NOW()),
    ('3aba121d-ad58-4376-ae1f-b2c85f88f578', 'a0000001-0000-0000-0000-000000000004', 'colaborador', '019c1c4e-5698-4dcd-a987-3e1018e3e951', NOW()),
    ('3aba121d-ad58-4376-ae1f-b2c85f88f578', '01e2f8d0-6db8-402d-b865-b2650de81048', 'colaborador', '019c1c4e-5698-4dcd-a987-3e1018e3e951', NOW()),
    ('9bfb7864-0c35-427e-b6e1-64e732e84b8a', 'bfc9932a-df9a-4d18-a9a2-724660c2a14d', 'colaborador', '019c1c4e-5698-4dcd-a987-3e1018e3e951', NOW()),
    ('9bfb7864-0c35-427e-b6e1-64e732e84b8a', 'fb9e0663-7735-4ef8-9740-78908ff17546', 'colaborador', '019c1c4e-5698-4dcd-a987-3e1018e3e951', NOW()),
    ('9bfb7864-0c35-427e-b6e1-64e732e84b8a', 'cceb4e32-3778-4755-a2b9-04ee1fd45687', 'colaborador', '019c1c4e-5698-4dcd-a987-3e1018e3e951', NOW()),
    ('9bfb7864-0c35-427e-b6e1-64e732e84b8a', 'd5d951ae-b80a-476f-befa-9480f890b713', 'colaborador', '019c1c4e-5698-4dcd-a987-3e1018e3e951', NOW()),
    ('dee162f7-c446-48d9-8819-0283d3ae6e45', 'ed5a134e-6ebd-42d7-9aee-55691ace1ff9', 'responsable', '019c1c4e-5698-4dcd-a987-3e1018e3e951', NOW()),
    ('dee162f7-c446-48d9-8819-0283d3ae6e45', '38c15f39-787d-4229-b3ad-99d8e0eee2ce', 'colaborador', '019c1c4e-5698-4dcd-a987-3e1018e3e951', NOW()),
    ('dee162f7-c446-48d9-8819-0283d3ae6e45', 'a0000001-0000-0000-0000-000000000005', 'colaborador', '019c1c4e-5698-4dcd-a987-3e1018e3e951', NOW()),
    ('dee162f7-c446-48d9-8819-0283d3ae6e45', 'a0000001-0000-0000-0000-000000000003', 'colaborador', '019c1c4e-5698-4dcd-a987-3e1018e3e951', NOW())
  ON CONFLICT (id_proyecto, id_usuario) DO NOTHING;
EXCEPTION WHEN foreign_key_violation THEN
  NULL;
END $$;
