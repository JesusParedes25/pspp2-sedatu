/**
 * ARCHIVO: evidencias-transmision-permisos.test.js
 * PROPÓSITO: Que el permiso se valide ANTES de abrir cualquier flujo hacia
 *            el almacén, y que conocer el identificador de una evidencia
 *            (o la clave de su objeto) no baste para descargarla.
 *
 * Se montan las rutas REALES de transmisión (routes/archivos.routes.js),
 * con su autenticador y el middleware de visibilidad reales, y se entra
 * con un token de sesión real en la cabecera Authorization. Solo se
 * simulan la BD y el almacén. Las pruebas del boleto efímero (la otra vía
 * de entrada) están en boleto-archivo.test.js.
 *
 * Ejecutar: npm test
 */
const express = require('express');
const jwt = require('jsonwebtoken');
const { Readable } = require('stream');

process.env.JWT_SECRET = 'secreto-de-prueba-transmision';
const SESION = jwt.sign({ id: 'u-1', rol: 'externo' }, process.env.JWT_SECRET, { expiresIn: '1h' });
const CABECERA = { Authorization: `Bearer ${SESION}` };

jest.mock('../db/pool', () => ({ query: jest.fn() }));
jest.mock('../utils/autorizacion', () => ({
  ...jest.requireActual('../utils/autorizacion'),
  puedeVerProyecto: jest.fn(),
  obtenerProyectoIdDeNodo: jest.fn(),
}));
const mockAlmacen = {
  statObject: jest.fn(),
  getObject: jest.fn(),
  getPartialObject: jest.fn(),
  removeObject: jest.fn(),
};
jest.mock('../utils/minio', () => ({
  minioClient: { bucketExists: jest.fn().mockResolvedValue(true), makeBucket: jest.fn() },
  BUCKET: 'b',
  almacen: mockAlmacen,
  esObjetoInexistente: (err) => err?.code === 'NotFound' || err?.code === 'NoSuchKey',
}));
jest.mock('../db/queries/evidencias.queries', () => ({ obtenerEvidenciaPorId: jest.fn() }));

const pool = require('../db/pool');
const autorizacion = require('../utils/autorizacion');
const evidenciasQueries = require('../db/queries/evidencias.queries');
const archivosRoutes = require('../routes/archivos.routes');

const EVIDENCIA = {
  id: '11111111-1111-1111-1111-111111111111',
  id_accion: 'acc-1',
  ruta_minio: 'evidencias/acciones/acc-1/uuid_plano.pdf',
  nombre_original: 'plano.pdf',
  tipo_archivo: 'application/pdf',
  tipo_medio: 'archivo',
};

let servidor;
let base;
beforeAll((hecho) => {
  const app = express();
  app.use(archivosRoutes);
  app.use((err, req, res, next) => res.status(500).json({ error: true, mensaje: err.message }));
  servidor = app.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${servidor.address().port}`; hecho(); });
});
afterAll((hecho) => { servidor.close(hecho); });

beforeEach(() => {
  jest.clearAllMocks();
  pool.query.mockImplementation((sql) => {
    if (/FROM evidencias WHERE id = \$1/.test(sql)) {
      return Promise.resolve({ rows: [{ id_etapa: null, id_accion: 'acc-1', id_subaccion: null, id_riesgo: null }] });
    }
    return Promise.resolve({ rows: [] });
  });
  autorizacion.obtenerProyectoIdDeNodo.mockResolvedValue('proyecto-1');
  evidenciasQueries.obtenerEvidenciaPorId.mockResolvedValue(EVIDENCIA);
  mockAlmacen.statObject.mockResolvedValue({ size: 4, etag: 'e', metaData: {} });
  mockAlmacen.getObject.mockImplementation(async () => Readable.from([Buffer.from('%PDF')]));
});

test.each(['ver', 'descargar'])('/%s sin permiso → 403 y el almacén ni se consulta', async (accion) => {
  autorizacion.puedeVerProyecto.mockResolvedValue(false);
  const r = await fetch(`${base}/evidencias/${EVIDENCIA.id}/${accion}`, { headers: CABECERA });
  expect(r.status).toBe(403);
  expect(mockAlmacen.statObject).not.toHaveBeenCalled();
  expect(mockAlmacen.getObject).not.toHaveBeenCalled();
});

test('/ver con permiso → inline; /descargar con permiso → attachment', async () => {
  autorizacion.puedeVerProyecto.mockResolvedValue(true);
  const ver = await fetch(`${base}/evidencias/${EVIDENCIA.id}/ver`, { headers: CABECERA });
  expect(ver.status).toBe(200);
  expect(ver.headers.get('content-disposition')).toMatch(/^inline;/);
  expect(await ver.text()).toBe('%PDF');

  const desc = await fetch(`${base}/evidencias/${EVIDENCIA.id}/descargar`, { headers: CABECERA });
  expect(desc.status).toBe(200);
  expect(desc.headers.get('content-disposition')).toMatch(/^attachment;/);
  expect(mockAlmacen.getObject).toHaveBeenCalledWith(EVIDENCIA.ruta_minio);
});

test('la clave del objeto sale de la BD, no de lo que mande el cliente', async () => {
  autorizacion.puedeVerProyecto.mockResolvedValue(true);
  await fetch(`${base}/evidencias/${EVIDENCIA.id}/descargar?ruta=otra/clave.pdf&key=x`, {
    headers: { ...CABECERA, 'X-Object-Key': 'otra/clave.pdf' },
  });
  expect(mockAlmacen.statObject).toHaveBeenCalledWith(EVIDENCIA.ruta_minio);
});

test('evidencia inexistente → 403 (no revela si el id existe) y sin tocar el almacén', async () => {
  pool.query.mockResolvedValue({ rows: [] });
  const r = await fetch(`${base}/evidencias/${EVIDENCIA.id}/descargar`, { headers: CABECERA });
  expect(r.status).toBe(403);
  expect(mockAlmacen.statObject).not.toHaveBeenCalled();
});

test('con permiso pero el objeto ya no está en el almacén → 404', async () => {
  autorizacion.puedeVerProyecto.mockResolvedValue(true);
  mockAlmacen.statObject.mockRejectedValue(Object.assign(new Error('nf'), { code: 'NotFound' }));
  const r = await fetch(`${base}/evidencias/${EVIDENCIA.id}/descargar`, { headers: CABECERA });
  expect(r.status).toBe(404);
});

test('sin cabecera ni boleto → 401, sin consultar permisos ni almacén', async () => {
  const r = await fetch(`${base}/evidencias/${EVIDENCIA.id}/descargar`);
  expect(r.status).toBe(401);
  expect(autorizacion.puedeVerProyecto).not.toHaveBeenCalled();
  expect(mockAlmacen.statObject).not.toHaveBeenCalled();
});
