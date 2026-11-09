/**
 * ARCHIVO: transmitir-objeto.test.js
 * PROPÓSITO: utils/transmitirObjeto.js, transmisión de archivos desde el
 *            backend (requisito DGTIC: el almacén no se publica, no hay
 *            URLs firmadas, el navegador nunca habla con él).
 *
 * Se levanta un servidor HTTP real (express en un puerto efímero) para
 * probar lo que con objetos falsos de req/res no se ve: Range y 206/416,
 * el 404 cuando el objeto no existe, y que un cierre anticipado del
 * navegador destruye el flujo del almacén en vez de dejarlo colgado.
 * El almacén sí es falso: un Readable en memoria en vez de MinIO.
 *
 * Ejecutar: npm test
 */
const http = require('http');
const { Readable } = require('stream');
const express = require('express');

const CONTENIDO = Buffer.from('0123456789abcdefghijklmnopqrstuvwxyz'); // 36 bytes

const mockAlmacen = {
  statObject: jest.fn(),
  getObject: jest.fn(),
  getPartialObject: jest.fn(),
};
jest.mock('../utils/minio', () => ({
  almacen: mockAlmacen,
  esObjetoInexistente: (err) => !!err && (err.code === 'NoSuchKey' || err.code === 'NotFound'),
}));

const { transmitirObjeto, interpretarRango } = require('../utils/transmitirObjeto');

function flujoDe(buf) {
  return Readable.from([buf]);
}

function configurarObjeto(buf = CONTENIDO) {
  mockAlmacen.statObject.mockResolvedValue({
    size: buf.length,
    etag: 'abc123',
    lastModified: new Date('2026-01-01T00:00:00Z'),
    metaData: { 'content-type': 'application/pdf' },
  });
  mockAlmacen.getObject.mockImplementation(async () => flujoDe(buf));
  mockAlmacen.getPartialObject.mockImplementation(async (clave, inicio, longitud) =>
    flujoDe(buf.subarray(inicio, inicio + longitud)));
}

let servidor;
let base;
let opcionesRuta;

beforeAll((hecho) => {
  const app = express();
  app.get('/archivo', (req, res, next) => transmitirObjeto(req, res, next, opcionesRuta));
  app.use((err, req, res, next) => res.status(500).json({ error: true, mensaje: err.message }));
  servidor = app.listen(0, '127.0.0.1', () => {
    base = `http://127.0.0.1:${servidor.address().port}`;
    hecho();
  });
});
afterAll((hecho) => { servidor.close(hecho); });

beforeEach(() => {
  jest.clearAllMocks();
  opcionesRuta = { clave: 'evidencias/acciones/x/doc.pdf', nombre: 'Informe de avance.pdf', tipo: 'application/pdf', disposicion: 'inline' };
  configurarObjeto();
});

async function pedir(headers = {}, metodo = 'GET') {
  const r = await fetch(`${base}/archivo`, { headers, method: metodo });
  const cuerpo = Buffer.from(await r.arrayBuffer());
  return { r, cuerpo };
}

describe('interpretarRango', () => {
  test.each([
    ['bytes=0-9', { inicio: 0, fin: 9 }],
    ['bytes=10-', { inicio: 10, fin: 35 }],
    ['bytes=-6', { inicio: 30, fin: 35 }],
    ['bytes=30-999', { inicio: 30, fin: 35 }],
    ['bytes=-999', { inicio: 0, fin: 35 }],
  ])('%s', (h, esperado) => {
    expect(interpretarRango(h, 36)).toEqual(esperado);
  });

  test.each(['bytes=36-', 'bytes=9-3', 'bytes=-0', 'bytes=-', 'bytes=a-b'])('%s es inválido (416)', (h) => {
    expect(interpretarRango(h, 36)).toEqual({ invalido: true });
  });

  test('sin header, unidad desconocida o multi-rango → null (respuesta completa)', () => {
    expect(interpretarRango(undefined, 36)).toBeNull();
    expect(interpretarRango('items=0-5', 36)).toBeNull();
    expect(interpretarRango('bytes=0-1,5-6', 36)).toBeNull();
  });
});

describe('respuesta completa', () => {
  test('200 con el contenido, Content-Type y Content-Length correctos', async () => {
    const { r, cuerpo } = await pedir();
    expect(r.status).toBe(200);
    expect(cuerpo.equals(CONTENIDO)).toBe(true);
    expect(r.headers.get('content-type')).toBe('application/pdf');
    expect(r.headers.get('content-length')).toBe('36');
    expect(r.headers.get('accept-ranges')).toBe('bytes');
    expect(r.headers.get('etag')).toBe('"abc123"');
    expect(mockAlmacen.getObject).toHaveBeenCalledWith('evidencias/acciones/x/doc.pdf');
  });

  test('inline para previsualizar, con el nombre real codificado', async () => {
    const { r } = await pedir();
    expect(r.headers.get('content-disposition')).toMatch(/^inline; filename="Informe de avance.pdf"; filename\*=UTF-8''Informe%20de%20avance.pdf$/);
  });

  test('attachment para descargar', async () => {
    opcionesRuta.disposicion = 'attachment';
    const { r } = await pedir();
    expect(r.headers.get('content-disposition')).toMatch(/^attachment;/);
  });

  test('sin tipo en la BD usa el del almacén, y si no hay ninguno octet-stream', async () => {
    opcionesRuta.tipo = undefined;
    let { r } = await pedir();
    expect(r.headers.get('content-type')).toBe('application/pdf');

    mockAlmacen.statObject.mockResolvedValue({ size: 36, etag: 'e', metaData: {} });
    ({ r } = await pedir());
    expect(r.headers.get('content-type')).toBe('application/octet-stream');
  });

  test('HTML/SVG subidos se sirven con CSP sandbox; PDF no (el visor de Chrome lo rechazaría)', async () => {
    let { r } = await pedir();
    expect(r.headers.get('content-security-policy')).toBeNull();

    opcionesRuta.tipo = 'text/html';
    ({ r } = await pedir());
    expect(r.headers.get('content-security-policy')).toMatch(/^sandbox/);
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
  });

  test('HEAD manda headers sin pedir el cuerpo al almacén', async () => {
    const { r, cuerpo } = await pedir({}, 'HEAD');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-length')).toBe('36');
    expect(cuerpo.length).toBe(0);
    expect(mockAlmacen.getObject).not.toHaveBeenCalled();
  });
});

describe('Range', () => {
  test('bytes=0-9 → 206 con solo ese tramo, pedido parcial al almacén', async () => {
    const { r, cuerpo } = await pedir({ Range: 'bytes=0-9' });
    expect(r.status).toBe(206);
    expect(cuerpo.toString()).toBe('0123456789');
    expect(r.headers.get('content-range')).toBe('bytes 0-9/36');
    expect(r.headers.get('content-length')).toBe('10');
    expect(mockAlmacen.getPartialObject).toHaveBeenCalledWith('evidencias/acciones/x/doc.pdf', 0, 10);
    expect(mockAlmacen.getObject).not.toHaveBeenCalled();
  });

  test('sufijo bytes=-6 → los últimos 6 bytes', async () => {
    const { r, cuerpo } = await pedir({ Range: 'bytes=-6' });
    expect(r.status).toBe(206);
    expect(cuerpo.toString()).toBe('uvwxyz');
    expect(r.headers.get('content-range')).toBe('bytes 30-35/36');
  });

  test('rango fuera del archivo → 416 con Content-Range bytes */tamaño, sin abrir flujo', async () => {
    const { r } = await pedir({ Range: 'bytes=100-200' });
    expect(r.status).toBe(416);
    expect(r.headers.get('content-range')).toBe('bytes */36');
    expect(mockAlmacen.getObject).not.toHaveBeenCalled();
    expect(mockAlmacen.getPartialObject).not.toHaveBeenCalled();
  });

  test('If-Range con ETag distinto → 200 completo (otra versión del archivo)', async () => {
    const { r, cuerpo } = await pedir({ Range: 'bytes=0-9', 'If-Range': '"otro"' });
    expect(r.status).toBe(200);
    expect(cuerpo.length).toBe(36);
  });

  test('If-Range con el mismo ETag → 206', async () => {
    const { r } = await pedir({ Range: 'bytes=0-9', 'If-Range': '"abc123"' });
    expect(r.status).toBe(206);
  });
});

describe('404 del almacén', () => {
  test('el objeto no existe (statObject NotFound) → 404 JSON, sin headers de archivo', async () => {
    mockAlmacen.statObject.mockRejectedValue(Object.assign(new Error('Not Found'), { code: 'NotFound' }));
    const { r, cuerpo } = await pedir();
    expect(r.status).toBe(404);
    expect(r.headers.get('content-type')).toMatch(/application\/json/);
    expect(r.headers.get('content-disposition')).toBeNull();
    expect(JSON.parse(cuerpo.toString()).codigo).toBe('ARCHIVO_NO_ENCONTRADO');
    expect(mockAlmacen.getObject).not.toHaveBeenCalled();
  });

  test('carrera: existía en el stat y getObject da NoSuchKey → 404, no 500', async () => {
    mockAlmacen.getObject.mockRejectedValue(Object.assign(new Error('NoSuchKey'), { code: 'NoSuchKey' }));
    const { r } = await pedir();
    expect(r.status).toBe(404);
    expect(r.headers.get('content-disposition')).toBeNull();
  });

  test('registro sin clave → 404 sin tocar el almacén', async () => {
    opcionesRuta.clave = null;
    const { r } = await pedir();
    expect(r.status).toBe(404);
    expect(mockAlmacen.statObject).not.toHaveBeenCalled();
  });

  test('otro error del almacén (caído) → pasa al manejador de errores', async () => {
    mockAlmacen.statObject.mockRejectedValue(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }));
    const { r } = await pedir();
    expect(r.status).toBe(500);
  });
});

describe('cierre anticipado de la conexión', () => {
  test('si el navegador corta a la mitad, el flujo del almacén se destruye', async () => {
    // Flujo "infinito" que entrega 64 KB cada vez que se le pide: sin
    // destrucción, seguiría produciendo para siempre.
    let flujo;
    mockAlmacen.statObject.mockResolvedValue({ size: 50 * 1024 * 1024, etag: 'g', metaData: {} });
    mockAlmacen.getObject.mockImplementation(async () => {
      flujo = new Readable({ read() { this.push(Buffer.alloc(64 * 1024)); } });
      return flujo;
    });

    await new Promise((resolve, reject) => {
      const req = http.get(`${base}/archivo`, (res) => {
        res.once('data', () => req.destroy()); // primer pedazo y se va
      });
      req.on('error', () => resolve()); // el destroy provoca 'error' del lado cliente
      req.on('close', resolve);
      setTimeout(() => reject(new Error('timeout')), 3000);
    });

    // Dar un instante para que el servidor vea el cierre.
    await new Promise((r) => setTimeout(r, 100));
    expect(flujo).toBeDefined();
    expect(flujo.destroyed).toBe(true);
  });
});
