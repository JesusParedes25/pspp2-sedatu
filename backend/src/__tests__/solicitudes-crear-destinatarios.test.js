/**
 * ARCHIVO: solicitudes-crear-destinatarios.test.js
 * PROPÓSITO: POST /proyectos/:id/solicitudes (y las rutas de nodo) ya
 *            creaba la notificación dentro de la plataforma para cada
 *            destinatario de `destinatariosDe`, pero no mandaba ningún
 *            correo — esta ronda agrega el correo, reusando la MISMA
 *            lista (ver docs/modelo-permisos.md, sección 15.2.3, punto
 *            5): `destinatariosDe` ahora devuelve objetos
 *            {id_usuario, nombre_completo, correo} en vez de solo ids,
 *            y el controller debe (a) seguir filtrando al propio
 *            solicitante de las notificaciones, (b) devolver esa misma
 *            lista filtrada como `destinatarios` en la respuesta del
 *            POST, para que el frontend envíe el correo sin recalcular
 *            nada, y (c) no tronar si no hay ningún destinatario.
 *
 * Ejecutar: npm test
 */
const PROYECTO = '00000000-0000-0000-0000-0000000000e1';
const SOLICITANTE = '00000000-0000-0000-0000-0000000000e2';
const DESTINATARIO_1 = '00000000-0000-0000-0000-0000000000e3';
const DESTINATARIO_2 = '00000000-0000-0000-0000-0000000000e4';

function crearRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

jest.mock('../db/pool', () => ({ query: jest.fn() }));
const pool = require('../db/pool');

jest.mock('../db/queries/solicitudes.queries', () => ({
  crear: jest.fn(),
  destinatariosDe: jest.fn(),
}));
const solicitudesQueries = require('../db/queries/solicitudes.queries');

jest.mock('../utils/autorizacion', () => ({
  puedeGestionarParticipantes: jest.fn(),
  puedeGestionarParticipantesNodo: jest.fn(),
  obtenerProyectoIdDeNodo: jest.fn(),
}));

jest.mock('../utils/validar-funcion-lectura', () => ({
  rechazoLecturaParaInterno: jest.fn().mockResolvedValue(null),
}));

jest.mock('../utils/notificaciones', () => ({ crearNotificacion: jest.fn() }));
const { crearNotificacion } = require('../utils/notificaciones');

const { crear } = require('../controllers/solicitudes.controller');

beforeEach(() => {
  jest.clearAllMocks();
  pool.query.mockImplementation((sql) => {
    if (/SELECT nombre FROM proyectos WHERE id = \$1/.test(sql)) {
      return Promise.resolve({ rows: [{ nombre: 'Proyecto de prueba' }] });
    }
    if (/SELECT 1 FROM proyectos WHERE id = \$1 AND deleted_at IS NULL/.test(sql)) {
      return Promise.resolve({ rows: [{}] });
    }
    throw new Error(`Consulta no mockeada: ${sql}`);
  });
  solicitudesQueries.crear.mockResolvedValue({
    solicitud: { id: 'sol-1', funcion: 'captura', motivo: null, id_usuario: SOLICITANTE, id_proyecto: PROYECTO },
  });
});

function req(overrides = {}) {
  return {
    params: { id: PROYECTO },
    body: { funcion: 'captura', motivo: '' },
    usuario: { id: SOLICITANTE, nombre_completo: 'Quien solicita' },
    ...overrides,
  };
}

test('reusa destinatariosDe para notificar y para la respuesta — filtra al propio solicitante de ambos', async () => {
  solicitudesQueries.destinatariosDe.mockResolvedValue([
    { id_usuario: SOLICITANTE, nombre_completo: 'Quien solicita', correo: 'solicitante@sedatu.gob.mx' },
    { id_usuario: DESTINATARIO_1, nombre_completo: 'Destinatario Uno', correo: 'd1@sedatu.gob.mx' },
    { id_usuario: DESTINATARIO_2, nombre_completo: 'Destinatario Dos', correo: 'd2@sedatu.gob.mx' },
  ]);
  const res = crearRes();

  await crear(req(), res, jest.fn());

  // Al solicitante no se le notifica a sí mismo.
  expect(crearNotificacion).toHaveBeenCalledTimes(2);
  expect(crearNotificacion).toHaveBeenCalledWith(expect.objectContaining({ idUsuario: DESTINATARIO_1 }));
  expect(crearNotificacion).toHaveBeenCalledWith(expect.objectContaining({ idUsuario: DESTINATARIO_2 }));
  expect(crearNotificacion).not.toHaveBeenCalledWith(expect.objectContaining({ idUsuario: SOLICITANTE }));

  // La respuesta trae la MISMA lista (sin el solicitante), con
  // nombre/correo — lo que el frontend necesita para el correo, sin
  // tener que volver a calcular nada ni pedir otro endpoint.
  expect(res.status).toHaveBeenCalledWith(201);
  const payload = res.json.mock.calls[0][0];
  expect(payload.destinatarios).toHaveLength(2);
  expect(payload.destinatarios).toEqual(expect.arrayContaining([
    expect.objectContaining({ id_usuario: DESTINATARIO_1, nombre_completo: 'Destinatario Uno', correo: 'd1@sedatu.gob.mx' }),
    expect.objectContaining({ id_usuario: DESTINATARIO_2, nombre_completo: 'Destinatario Dos', correo: 'd2@sedatu.gob.mx' }),
  ]));
  expect(payload.datos).toEqual(expect.objectContaining({ id: 'sol-1' }));
});

test('sin ningún destinatario: no notifica, no truena, responde con destinatarios vacío', async () => {
  solicitudesQueries.destinatariosDe.mockResolvedValue([]);
  const res = crearRes();

  await expect(crear(req(), res, jest.fn())).resolves.not.toThrow();

  expect(crearNotificacion).not.toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(201);
  const payload = res.json.mock.calls[0][0];
  expect(payload.destinatarios).toEqual([]);
  // La solicitud ya quedó guardada de todos modos.
  expect(solicitudesQueries.crear).toHaveBeenCalled();
});

test('único destinatario además del propio solicitante: 1 notificación, 1 destinatario en la respuesta', async () => {
  solicitudesQueries.destinatariosDe.mockResolvedValue([
    { id_usuario: DESTINATARIO_1, nombre_completo: 'Destinatario Uno', correo: 'd1@sedatu.gob.mx' },
  ]);
  const res = crearRes();

  await crear(req(), res, jest.fn());

  expect(crearNotificacion).toHaveBeenCalledTimes(1);
  const payload = res.json.mock.calls[0][0];
  expect(payload.destinatarios).toHaveLength(1);
});
