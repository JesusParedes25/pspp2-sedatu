/**
 * ARCHIVO: solicitudes-crear-destinatarios.test.js
 * PROPÓSITO: POST /proyectos/:id/solicitudes (y las rutas de nodo) crea
 *            la notificación dentro de la plataforma para cada
 *            destinatario de `destinatariosDe` y, en el mismo bucle,
 *            manda el correo de "solicitud por resolver" (ver
 *            docs/modelo-permisos.md, sección 15.2.3, punto 5) — un
 *            solo cálculo de destinatarios para los dos canales, ahora
 *            enteramente en el backend. El controller debe (a) filtrar
 *            al propio solicitante de los dos avisos, (b) mandar
 *            correo solo a quien tiene `correo` registrado, y (c) no
 *            tronar si no hay ningún destinatario.
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

jest.mock('../utils/correo', () => ({
  enviarCorreo: jest.fn().mockResolvedValue({ enviado: true }),
  enlaceNotificaciones: jest.fn(() => 'http://localhost:5173/notificaciones'),
  enlaceProyecto: jest.fn(() => 'http://localhost:5173/proyectos/x'),
  destinoTexto: jest.fn(() => 'el proyecto «X»'),
}));
const { enviarCorreo } = require('../utils/correo');

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
    { id_usuario: SOLICITANTE, nombre_completo: 'Quien solicita', correo: 'solicitante@example.org' },
    { id_usuario: DESTINATARIO_1, nombre_completo: 'Destinatario Uno', correo: 'd1@example.org' },
    { id_usuario: DESTINATARIO_2, nombre_completo: 'Destinatario Dos', correo: 'd2@example.org' },
  ]);
  const res = crearRes();

  await crear(req(), res, jest.fn());

  // Al solicitante no se le notifica a sí mismo, ni por los dos canales.
  expect(crearNotificacion).toHaveBeenCalledTimes(2);
  expect(crearNotificacion).toHaveBeenCalledWith(expect.objectContaining({ idUsuario: DESTINATARIO_1 }));
  expect(crearNotificacion).toHaveBeenCalledWith(expect.objectContaining({ idUsuario: DESTINATARIO_2 }));
  expect(crearNotificacion).not.toHaveBeenCalledWith(expect.objectContaining({ idUsuario: SOLICITANTE }));

  expect(enviarCorreo).toHaveBeenCalledTimes(2);
  expect(enviarCorreo).toHaveBeenCalledWith(expect.objectContaining({ para: 'd1@example.org' }));
  expect(enviarCorreo).toHaveBeenCalledWith(expect.objectContaining({ para: 'd2@example.org' }));

  expect(res.status).toHaveBeenCalledWith(201);
  const payload = res.json.mock.calls[0][0];
  expect(payload.datos).toEqual(expect.objectContaining({ id: 'sol-1' }));
});

test('sin ningún destinatario: no notifica, no manda correo, no truena', async () => {
  solicitudesQueries.destinatariosDe.mockResolvedValue([]);
  const res = crearRes();

  await expect(crear(req(), res, jest.fn())).resolves.not.toThrow();

  expect(crearNotificacion).not.toHaveBeenCalled();
  expect(enviarCorreo).not.toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(201);
  // La solicitud ya quedó guardada de todos modos.
  expect(solicitudesQueries.crear).toHaveBeenCalled();
});

test('destinatario sin correo registrado: notifica dentro de la plataforma, no manda correo', async () => {
  solicitudesQueries.destinatariosDe.mockResolvedValue([
    { id_usuario: DESTINATARIO_1, nombre_completo: 'Destinatario Uno', correo: null },
  ]);
  const res = crearRes();

  await crear(req(), res, jest.fn());

  expect(crearNotificacion).toHaveBeenCalledTimes(1);
  expect(enviarCorreo).not.toHaveBeenCalled();
});
