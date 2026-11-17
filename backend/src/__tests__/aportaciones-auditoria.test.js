/**
 * ARCHIVO: aportaciones-auditoria.test.js
 * PROPÓSITO: Verifica que vincular/editar/desvincular un nodo de un
 *            indicador (aportaciones.controller.js, tabla
 *            indicador_aportaciones) quede registrado en la bitácora
 *            oficial `auditoria` — punto 1 del paso 7 DGTIC (continuación
 *            del paso 6): antes ninguna de las tres operaciones dejaba
 *            rastro ahí, solo en `actividad_log` (sin antes/después real).
 */
const PROYECTO = { id_proyecto: 'proy-1', nombre: 'Indicador X' };
const ACTOR = '00000000-0000-0000-0000-00000000000a';

function crearRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

jest.mock('../db/queries/aportaciones.queries', () => ({
  crear: jest.fn(),
  actualizar: jest.fn(),
  eliminar: jest.fn(),
  obtenerConNodo: jest.fn(),
  procesarCambioNodo: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../db/pool', () => ({ query: jest.fn() }));
jest.mock('../utils/actividad-log', () => ({ registrarActividad: jest.fn() }));
jest.mock('../utils/auditoria', () => ({ registrarAuditoria: jest.fn().mockResolvedValue('aud-id') }));

const pool = require('../db/pool');
const aportacionesQueries = require('../db/queries/aportaciones.queries');
const { registrarAuditoria } = require('../utils/auditoria');
const { crear, actualizar, eliminar } = require('../controllers/aportaciones.controller');

beforeEach(() => {
  jest.clearAllMocks();
  pool.query.mockResolvedValue({ rows: [PROYECTO] });
});

describe('crear', () => {
  test('audita INSERT con la fila completa', async () => {
    const aportacion = { id: 'ap-1', id_indicador: 'ind-1', id_etapa: 'e-1', aportacion: 100, modo: 'al_concluir' };
    aportacionesQueries.crear.mockResolvedValue(aportacion);
    aportacionesQueries.obtenerConNodo.mockResolvedValue({ ...aportacion, nodo_nombre: 'Etapa 1' });

    const req = { params: { id: 'ind-1' }, body: { tipo_nodo: 'etapa', id_nodo: 'e-1', valor_aportacion: 100 }, usuario: { id: ACTOR } };
    await crear(req, crearRes(), jest.fn());

    expect(registrarAuditoria).toHaveBeenCalledWith({
      tabla: 'indicador_aportaciones', registroId: 'ap-1', campoModificado: 'fila',
      valorNuevo: aportacion, operacion: 'INSERT', idUsuario: ACTOR
    });
  });
});

describe('actualizar', () => {
  test('audita UPDATE con aportacion/modo anterior y nuevo', async () => {
    aportacionesQueries.obtenerConNodo
      .mockResolvedValueOnce({ id: 'ap-1', id_indicador: 'ind-1', id_etapa: 'e-1', aportacion: 100, modo: 'al_concluir', nodo_nombre: 'Etapa 1' }) // antes
      .mockResolvedValueOnce({ id: 'ap-1', id_indicador: 'ind-1', id_etapa: 'e-1', aportacion: 200, modo: 'proporcional', nodo_nombre: 'Etapa 1' }); // después (para procesarCambioNodo)
    aportacionesQueries.actualizar.mockResolvedValue({ id: 'ap-1', id_indicador: 'ind-1', aportacion: 200, modo: 'proporcional' });

    const req = { params: { id: 'ap-1' }, body: { valor_aportacion: 200, modo: 'proporcional' }, usuario: { id: ACTOR } };
    await actualizar(req, crearRes(), jest.fn());

    expect(registrarAuditoria).toHaveBeenCalledWith({
      tabla: 'indicador_aportaciones', registroId: 'ap-1', campoModificado: 'ficha',
      valorAnterior: { aportacion: 100, modo: 'al_concluir' },
      valorNuevo: { aportacion: 200, modo: 'proporcional' },
      operacion: 'UPDATE', idUsuario: ACTOR
    });
  });

  test('aportación inexistente: no audita', async () => {
    aportacionesQueries.obtenerConNodo.mockResolvedValueOnce(null);
    aportacionesQueries.actualizar.mockResolvedValue(null);

    const req = { params: { id: 'ap-404' }, body: { valor_aportacion: 50 }, usuario: { id: ACTOR } };
    const res = crearRes();
    await actualizar(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
});

describe('eliminar', () => {
  test('audita DELETE con la fila completa (aportacion/modo incluidos)', async () => {
    const antes = { id: 'ap-1', id_indicador: 'ind-1', id_etapa: 'e-1', aportacion: 100, modo: 'al_concluir', nodo_nombre: 'Etapa 1' };
    aportacionesQueries.obtenerConNodo.mockResolvedValue(antes);
    aportacionesQueries.eliminar.mockResolvedValue({ id: 'ap-1', id_indicador: 'ind-1' });

    const req = { params: { id: 'ap-1' }, usuario: { id: ACTOR } };
    await eliminar(req, crearRes(), jest.fn());

    expect(registrarAuditoria).toHaveBeenCalledWith({
      tabla: 'indicador_aportaciones', registroId: 'ap-1', campoModificado: 'fila',
      valorAnterior: antes, operacion: 'DELETE', idUsuario: ACTOR
    });
  });

  test('aportación inexistente: no audita ni borra', async () => {
    aportacionesQueries.obtenerConNodo.mockResolvedValue(null);

    const req = { params: { id: 'ap-404' }, usuario: { id: ACTOR } };
    const res = crearRes();
    await eliminar(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(registrarAuditoria).not.toHaveBeenCalled();
    expect(aportacionesQueries.eliminar).not.toHaveBeenCalled();
  });
});
