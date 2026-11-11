/**
 * ARCHIVO: solicitudes-auditoria.test.js
 * PROPÓSITO: Verifica que aceptar/declinar una solicitud de participación
 *            (backend/src/db/queries/solicitudes.queries.js::responder)
 *            quede registrado en la bitácora oficial `auditoria` — antes
 *            no dejaba ningún rastro, en ningún lado (punto 2, paso 6 DGTIC).
 */
const mockClient = { query: jest.fn(), release: jest.fn() };
jest.mock('../db/pool', () => ({ connect: jest.fn(() => Promise.resolve(mockClient)) }));
jest.mock('../utils/auditoria', () => ({ registrarAuditoria: jest.fn().mockResolvedValue('aud-id') }));

const { registrarAuditoria } = require('../utils/auditoria');
const { responder } = require('../db/queries/solicitudes.queries');

const SOLICITUD_ID = '00000000-0000-0000-0000-000000000001';
const RESOLUTOR_ID = '00000000-0000-0000-0000-00000000000a';
const USUARIO_SOLICITANTE = '00000000-0000-0000-0000-00000000000b';

beforeEach(() => {
  mockClient.query.mockReset();
  mockClient.release.mockReset();
  registrarAuditoria.mockClear();
});

test('aceptar una solicitud de proyecto: audita estado pendiente -> aceptada', async () => {
  const solicitud = { id: SOLICITUD_ID, estado: 'aceptada', id_proyecto: 'proy-1', id_nodo: null, id_usuario: USUARIO_SOLICITANTE, funcion: 'captura' };
  mockClient.query
    .mockResolvedValueOnce({ rows: [] }) // BEGIN
    .mockResolvedValueOnce({ rows: [solicitud] }) // UPDATE solicitudes_participacion
    .mockResolvedValueOnce({ rows: [] }) // INSERT proyecto_usuarios
    .mockResolvedValueOnce({ rows: [] }); // COMMIT

  await responder({ idSolicitud: SOLICITUD_ID, idQuienResuelve: RESOLUTOR_ID, acepta: true });

  expect(registrarAuditoria).toHaveBeenCalledWith({
    tabla: 'solicitudes_participacion', registroId: SOLICITUD_ID, campoModificado: 'estado',
    valorAnterior: 'pendiente', valorNuevo: 'aceptada',
    operacion: 'UPDATE', idUsuario: RESOLUTOR_ID, client: mockClient
  });
});

test('declinar: audita estado pendiente -> rechazada, sin tocar membresía', async () => {
  const solicitud = { id: SOLICITUD_ID, estado: 'rechazada', id_proyecto: 'proy-1', id_nodo: null };
  mockClient.query
    .mockResolvedValueOnce({ rows: [] }) // BEGIN
    .mockResolvedValueOnce({ rows: [solicitud] }) // UPDATE solicitudes_participacion
    .mockResolvedValueOnce({ rows: [] }); // COMMIT

  await responder({ idSolicitud: SOLICITUD_ID, idQuienResuelve: RESOLUTOR_ID, acepta: false, motivoRespuesta: 'No aplica' });

  expect(registrarAuditoria).toHaveBeenCalledWith(expect.objectContaining({
    valorAnterior: 'pendiente', valorNuevo: 'rechazada'
  }));
});

test('solicitud ya resuelta (0 filas): no audita', async () => {
  mockClient.query
    .mockResolvedValueOnce({ rows: [] }) // BEGIN
    .mockResolvedValueOnce({ rows: [] }) // UPDATE: 0 filas
    .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

  const resultado = await responder({ idSolicitud: SOLICITUD_ID, idQuienResuelve: RESOLUTOR_ID, acepta: true });

  expect(resultado).toBeNull();
  expect(registrarAuditoria).not.toHaveBeenCalled();
});
