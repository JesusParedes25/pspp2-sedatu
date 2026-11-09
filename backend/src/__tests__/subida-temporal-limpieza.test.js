/**
 * ARCHIVO: subida-temporal-limpieza.test.js
 * PROPÓSITO: Que el temporal de una subida se borre SIEMPRE (servidor de
 *            SEDATU con poco disco: nada debe quedar). Cubre los dos
 *            huecos que tenía la limpieza en el finally del controller,
 *            reproducidos antes del cambio con un servidor real:
 *              1. un middleware posterior a multer rechaza la petición
 *                 (p. ej. el 403 de permisos de POST /actividad);
 *              2. el cliente corta la conexión a media subida.
 *            Además: falla de MinIO en el controller, límite de tamaño, y
 *            el barrido de huérfanos que deja un proceso muerto.
 *
 * Ejecutar: npm test
 */
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const express = require('express');

const DIR = path.join(os.tmpdir(), `pspp-uploads-limpieza-${process.pid}`);
process.env.UPLOAD_TMP_DIR = DIR;
process.env.UPLOAD_MAX_SIZE_MB = '1';

const {
  upload, limpiarArchivoTemporal, verificarDirectorioSubidas, purgarTemporalesHuerfanos,
} = require('../middleware/subidaArchivo.middleware');

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const temporales = () => fs.readdirSync(DIR).filter((n) => !n.startsWith('.'));

let servidor;
let puerto;
let comportamiento;
let vistoPorControlador;

beforeAll((hecho) => {
  verificarDirectorioSubidas();
  const app = express();
  app.post('/subir', upload.single('archivo'), (req, res, next) => {
    if (comportamiento === 'rechazo') {
      // Simula exigirEdicionDeNodoEnCuerpo(): rechaza sin llegar al controller.
      return res.status(403).json({ error: true });
    }
    return next();
  }, async (req, res, next) => {
    vistoPorControlador = req.file && fs.existsSync(req.file.path);
    try {
      if (comportamiento === 'falla-minio') throw new Error('MinIO caído');
      res.status(201).json({ ok: true });
    } catch (err) {
      next(err);
    } finally {
      await limpiarArchivoTemporal(req);
    }
  });
  app.use((err, req, res, next) => res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 500).json({ error: true }));
  servidor = app.listen(0, '127.0.0.1', () => { puerto = servidor.address().port; hecho(); });
});

afterAll((hecho) => {
  servidor.close(() => {
    fs.rmSync(DIR, { recursive: true, force: true });
    hecho();
  });
});

beforeEach(() => {
  vistoPorControlador = undefined;
  for (const n of temporales()) fs.unlinkSync(path.join(DIR, n));
});

// Envía un multipart "a mano" por socket para poder cortarlo a la mitad.
function enviar({ bytes, cortarTrasMs = null }) {
  return new Promise((resolve) => {
    const limite = 'LIMITE';
    const cabecera = `--${limite}\r\nContent-Disposition: form-data; name="archivo"; filename="capa.zip"\r\n`
      + 'Content-Type: application/zip\r\n\r\n';
    const cierre = `\r\n--${limite}--\r\n`;
    const declarado = cortarTrasMs === null ? bytes : bytes * 50; // al cortar, se promete más de lo que llega
    const s = net.connect(puerto, '127.0.0.1', () => {
      s.write(`POST /subir HTTP/1.1\r\nHost: x\r\nConnection: close\r\nContent-Type: multipart/form-data; boundary=${limite}\r\n`
        + `Content-Length: ${cabecera.length + declarado + cierre.length}\r\n\r\n`);
      s.write(cabecera);
      s.write(Buffer.alloc(bytes, 7));
      if (cortarTrasMs === null) s.write(cierre);
      else setTimeout(() => s.destroy(), cortarTrasMs);
    });
    let respuesta = '';
    s.on('data', (d) => { respuesta += d.toString(); });
    s.on('close', () => resolve(respuesta));
    s.on('error', () => {});
  });
}

test('camino feliz: el controller ve el temporal y después ya no existe', async () => {
  comportamiento = 'ok';
  const r = await enviar({ bytes: 2048 });
  expect(r).toMatch(/^HTTP\/1\.1 201/);
  expect(vistoPorControlador).toBe(true);
  await esperar(50);
  expect(temporales()).toEqual([]);
});

test('MinIO falla en el controller: se borra igual', async () => {
  comportamiento = 'falla-minio';
  const r = await enviar({ bytes: 2048 });
  expect(r).toMatch(/^HTTP\/1\.1 500/);
  await esperar(50);
  expect(temporales()).toEqual([]);
});

test('un middleware rechaza después de multer (403): se borra aunque el controller nunca corra', async () => {
  comportamiento = 'rechazo';
  const r = await enviar({ bytes: 2048 });
  expect(r).toMatch(/^HTTP\/1\.1 403/);
  await esperar(50);
  expect(temporales()).toEqual([]);
});

test('el cliente corta la conexión a media subida: el parcial se borra', async () => {
  comportamiento = 'ok';
  await enviar({ bytes: 200 * 1024, cortarTrasMs: 150 });
  await esperar(150);
  expect(temporales()).toEqual([]);
});

test('archivo más grande que UPLOAD_MAX_SIZE_MB: 413 y sin temporal', async () => {
  comportamiento = 'ok';
  const r = await enviar({ bytes: 1024 * 1024 + 10 });
  expect(r).toMatch(/^HTTP\/1\.1 413/);
  await esperar(50);
  expect(temporales()).toEqual([]);
});

describe('purgarTemporalesHuerfanos', () => {
  test('borra temporales viejos con el nombre del backend y no toca nada más', async () => {
    const viejo = path.join(DIR, `pspp-subida-${'a'.repeat(32)}`);
    const reciente = path.join(DIR, `pspp-subida-${'b'.repeat(32)}`);
    const ajeno = path.join(DIR, 'notas-de-alguien.txt');
    for (const p of [viejo, reciente, ajeno]) fs.writeFileSync(p, 'x');
    const hace2h = new Date(Date.now() - 2 * 60 * 60 * 1000);
    fs.utimesSync(viejo, hace2h, hace2h);
    fs.utimesSync(ajeno, hace2h, hace2h);

    const borrados = await purgarTemporalesHuerfanos(60 * 60 * 1000, DIR);

    expect(borrados).toBe(1);
    expect(fs.existsSync(viejo)).toBe(false);
    expect(fs.existsSync(reciente)).toBe(true);
    expect(fs.existsSync(ajeno)).toBe(true);
    fs.unlinkSync(reciente);
    fs.unlinkSync(ajeno);
  });

  test('no truena si el directorio no existe', async () => {
    await expect(purgarTemporalesHuerfanos(0, path.join(DIR, 'no-existe'))).resolves.toBe(0);
  });
});
