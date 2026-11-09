/**
 * ARCHIVO: subida-limite-413.test.js
 * PROPÓSITO: Un archivo más grande que UPLOAD_MAX_SIZE_MB debe responder
 *            413 con un mensaje claro en español. Antes el MulterError
 *            caía al manejador genérico: 500 "File too large", y el
 *            usuario veía un error interno por un límite conocido.
 *            Se usa el middleware de subida y el errorHandler REALES.
 *
 * Ejecutar: npm test
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const multer = require('multer');

const DIR = path.join(os.tmpdir(), `pspp-uploads-413-${process.pid}`);
process.env.UPLOAD_TMP_DIR = DIR;
process.env.UPLOAD_MAX_SIZE_MB = '1';

const { upload, verificarDirectorioSubidas } = require('../middleware/subidaArchivo.middleware');
const errorHandler = require('../middleware/errorHandler');

let servidor;
let base;
beforeAll((hecho) => {
  verificarDirectorioSubidas();
  const app = express();
  app.post('/subir', upload.single('archivo'), (req, res) => res.status(201).json({ ok: true }));
  app.use(errorHandler);
  servidor = app.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${servidor.address().port}`; hecho(); });
});
afterAll((hecho) => { servidor.close(() => { fs.rmSync(DIR, { recursive: true, force: true }); hecho(); }); });

const silenciar = () => jest.spyOn(console, 'error').mockImplementation(() => {});

test('archivo de más de UPLOAD_MAX_SIZE_MB → 413 ARCHIVO_DEMASIADO_GRANDE, en español', async () => {
  const spy = silenciar();
  const form = new FormData();
  form.append('archivo', new Blob([Buffer.alloc(1024 * 1024 + 1)]), 'grande.bin');
  const r = await fetch(`${base}/subir`, { method: 'POST', body: form });
  spy.mockRestore();
  expect(r.status).toBe(413);
  const cuerpo = await r.json();
  expect(cuerpo.codigo).toBe('ARCHIVO_DEMASIADO_GRANDE');
  expect(cuerpo.mensaje).toMatch(/tamaño máximo/);
});

test('dentro del límite → pasa', async () => {
  const form = new FormData();
  form.append('archivo', new Blob([Buffer.alloc(1024)]), 'chico.bin');
  const r = await fetch(`${base}/subir`, { method: 'POST', body: form });
  expect(r.status).toBe(201);
});

test('otros errores de multer → 400 con código propio, no 500', () => {
  const spy = silenciar();
  const res = { headersSent: false, status: jest.fn().mockReturnThis(), json: jest.fn() };
  errorHandler(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'otro'), { method: 'POST', originalUrl: '/x' }, res, jest.fn());
  spy.mockRestore();
  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'CAMPO_ARCHIVO_INESPERADO' }));
});
