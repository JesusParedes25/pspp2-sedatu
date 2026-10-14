/**
 * ARCHIVO: bloqueos-actividad-permisos.test.js
 * PROPÓSITO: Fase 2, Paso 0 del modelo de permisos (docs/modelo-permisos.md)
 *            — bugs 1 y 2: PUT /bloqueos/:id/resolver y POST /actividad no
 *            tenían ningún chequeo de autorización. Prueba las factories
 *            de permisos.middleware.js directamente, como middleware
 *            Express (req, res, next), no a través de los controllers.
 *            GET /bloqueos y GET /bloqueos/activo tuvieron aquí su propio
 *            caso (exigirEdicionDeEntidadEnQuery) hasta Fase 2/Paso 1, que
 *            lo retiró a favor de exigirVisibilidadDeEntidadEnQuery
 *            (utils/alcance-lectura.js, cubierta en alcance-lectura.test.js)
 *            — leer un bloqueo pasó a ser visibilidad total entre
 *            internos, no un criterio de captura.
 *
 * Ejecutar: npm test
 */

const UUID_USUARIO = '00000000-0000-0000-0000-000000000001';
const UUID_CREADOR = '00000000-0000-0000-0000-000000000002';
const UUID_NODO = '00000000-0000-0000-0000-000000000003';
const UUID_BLOQUEO = '00000000-0000-0000-0000-000000000004';

function crearRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

jest.mock('../db/pool', () => ({ query: jest.fn() }));
jest.mock('../utils/autorizacion', () => ({
  puedeEditarNodo: jest.fn(),
  puedeEditarContenidoProyecto: jest.fn(),
  tienePeldanoNodo: jest.fn(),
  tienePeldanoProyecto: jest.fn(),
}));

const pool = require('../db/pool');
const { puedeEditarNodo } = require('../utils/autorizacion');
const {
  exigirResolverBloqueo,
  exigirEdicionDeNodoEnCuerpo,
} = require('../middleware/permisos.middleware');

beforeEach(() => jest.clearAllMocks());

describe('PUT /bloqueos/:id/resolver — exigirResolverBloqueo', () => {
  test('sin ser el creador y sin captura en la entidad dueña, 403', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ entidad_tipo: 'Tarea', entidad_id: UUID_NODO, id_creador: UUID_CREADOR }] });
    puedeEditarNodo.mockResolvedValueOnce(false);
    const req = { usuario: { id: UUID_USUARIO }, params: { id: UUID_BLOQUEO } };
    const res = crearRes();
    const next = jest.fn();

    await exigirResolverBloqueo()(req, res, next);

    expect(puedeEditarNodo).toHaveBeenCalledWith({ usuario: req.usuario, tipoNodo: 'tarea', idNodo: UUID_NODO });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('siendo quien creó el bloqueo, deja pasar sin ni siquiera consultar captura', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ entidad_tipo: 'Tarea', entidad_id: UUID_NODO, id_creador: UUID_USUARIO }] });
    const req = { usuario: { id: UUID_USUARIO }, params: { id: UUID_BLOQUEO } };
    const res = crearRes();
    const next = jest.fn();

    await exigirResolverBloqueo()(req, res, next);

    expect(puedeEditarNodo).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
  });

  test('sin ser el creador pero con captura en la entidad dueña, deja pasar', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ entidad_tipo: 'Etapa', entidad_id: UUID_NODO, id_creador: UUID_CREADOR }] });
    puedeEditarNodo.mockResolvedValueOnce(true);
    const req = { usuario: { id: UUID_USUARIO }, params: { id: UUID_BLOQUEO } };
    const res = crearRes();
    const next = jest.fn();

    await exigirResolverBloqueo()(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('bloqueo inexistente, 403 sin consultar permiso', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const req = { usuario: { id: UUID_USUARIO }, params: { id: 'no-existe' } };
    const res = crearRes();
    const next = jest.fn();

    await exigirResolverBloqueo()(req, res, next);

    expect(puedeEditarNodo).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('POST /actividad — exigirEdicionDeNodoEnCuerpo', () => {
  test('sin captura en el nodo, 403 y nunca llega al controller', async () => {
    puedeEditarNodo.mockResolvedValueOnce(false);
    const req = { usuario: { id: UUID_USUARIO }, body: { tipo_nodo: 'accion', id_nodo: UUID_NODO, tipo_evento: 'comentario' } };
    const res = crearRes();
    const next = jest.fn();

    await exigirEdicionDeNodoEnCuerpo()(req, res, next);

    expect(puedeEditarNodo).toHaveBeenCalledWith({ usuario: req.usuario, tipoNodo: 'accion', idNodo: UUID_NODO });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('con captura en el nodo, deja pasar', async () => {
    puedeEditarNodo.mockResolvedValueOnce(true);
    const req = { usuario: { id: UUID_USUARIO }, body: { tipo_nodo: 'tarea', id_nodo: UUID_NODO, tipo_evento: 'riesgo' } };
    const res = crearRes();
    const next = jest.fn();

    await exigirEdicionDeNodoEnCuerpo()(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('sin tipo_nodo/id_nodo en el body, deja pasar para que el controller dé su propio 400', async () => {
    const req = { usuario: { id: UUID_USUARIO }, body: {} };
    const res = crearRes();
    const next = jest.fn();

    await exigirEdicionDeNodoEnCuerpo()(req, res, next);

    expect(puedeEditarNodo).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
  });
});
