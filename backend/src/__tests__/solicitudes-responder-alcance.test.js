/**
 * ARCHIVO: solicitudes-responder-alcance.test.js
 * PROPÓSITO: Fase 4/parte A del modelo de permisos (docs/modelo-permisos.md,
 *            commit 3) — POST /solicitudes/:id/responder evaluaba SIEMPRE
 *            contra el proyecto completo (puedeGestionarParticipantes),
 *            aunque la solicitud fuera de una etapa/acción/tarea puntual.
 *            Ahora: si la solicitud es de un nodo, se evalúa contra ESE
 *            nodo (puedeGestionarParticipantesNodo) — el mismo criterio
 *            que ya usa nodo-miembros.controller.js para una invitación
 *            directa; si es del proyecto completo, sigue evaluándose
 *            contra el proyecto.
 *
 * No se mockea autorizacion.js ni funcion-efectiva.js — se usa su
 * implementación real, para que esta suite sea la prueba de que el gate
 * real de responder() es exactamente el mismo que protege una invitación
 * directa. Solo se mockea ../db/pool y las funciones de escritura de
 * solicitudes.queries.js (obtener/responder) — esta suite es sobre el
 * GATE, no sobre la transacción de aceptar.
 *
 * Ejecutar: npm test
 */
const PROYECTO = '00000000-0000-0000-0000-0000000000b1';
const OTRO_PROYECTO = '00000000-0000-0000-0000-0000000000b9';
const ETAPA_A = '00000000-0000-0000-0000-0000000000b2';
const ETAPA_B = '00000000-0000-0000-0000-0000000000b3';
const SOLICITANTE = '00000000-0000-0000-0000-0000000000b4';
const RESPONSABLE_ETAPA_A = '00000000-0000-0000-0000-0000000000b5';
const RESPONSABLE_PROYECTO = '00000000-0000-0000-0000-0000000000b6';
const DIRECTOR_DG = '00000000-0000-0000-0000-0000000000b7';
const SIN_RELACION = '00000000-0000-0000-0000-0000000000b8';
const ID_DG = '00000000-0000-0000-0000-0000000000dg';

function crearRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

let fixture;

jest.mock('../db/pool', () => ({ query: jest.fn() }));
const pool = require('../db/pool');

jest.mock('../db/queries/solicitudes.queries', () => ({
  obtener: jest.fn(),
  responder: jest.fn(),
}));
const solicitudesQueries = require('../db/queries/solicitudes.queries');
jest.mock('../utils/notificaciones', () => ({ crearNotificacion: jest.fn() }));

const { responder } = require('../controllers/solicitudes.controller');

beforeEach(() => {
  jest.clearAllMocks();
  fixture = {
    proyecto: { id_creador: null, id_dg_lider: ID_DG },
    etapaA: { id_responsable: RESPONSABLE_ETAPA_A, id_proyecto: PROYECTO },
    miembrosProyecto: [{ id_usuario: RESPONSABLE_PROYECTO, rol: 'administracion_proyecto' }],
    miembrosNodoEtapaA: [],
  };

  pool.query.mockImplementation((sql, params) => {
    if (/FROM proyectos WHERE id = \$1/.test(sql)) {
      const id = params[0];
      if (id === PROYECTO) return Promise.resolve({ rows: [fixture.proyecto] });
      return Promise.resolve({ rows: [] });
    }
    if (/FROM proyecto_usuarios WHERE id_proyecto = \$1 AND id_usuario = \$2/.test(sql)) {
      const [, idUsuario] = params;
      const fila = fixture.miembrosProyecto.find(m => m.id_usuario === idUsuario);
      return Promise.resolve({ rows: fila ? [{ rol: fila.rol }] : [] });
    }
    if (/FROM etapas WHERE id = \$1/.test(sql)) {
      const id = params[0];
      if (id === ETAPA_A) return Promise.resolve({ rows: [fixture.etapaA] });
      return Promise.resolve({ rows: [] });
    }
    if (/FROM nodo_miembros/.test(sql)) {
      const [, idNodo, idUsuario] = params;
      const fila = fixture.miembrosNodoEtapaA.find(m => m.id_nodo === idNodo && m.id_usuario === idUsuario);
      return Promise.resolve({ rows: fila ? [{ rol: fila.rol }] : [] });
    }
    throw new Error(`Consulta no mockeada: ${sql}`);
  });
});

function solicitudDeEtapaA() {
  return {
    id: 'sol-1', estado: 'pendiente', id_proyecto: PROYECTO,
    id_nodo: ETAPA_A, tipo_nodo: 'etapa', id_dg_lider: ID_DG,
  };
}

function solicitudDeProyecto() {
  return {
    id: 'sol-2', estado: 'pendiente', id_proyecto: PROYECTO,
    id_nodo: null, tipo_nodo: null, id_dg_lider: ID_DG,
  };
}

test('responsable SOLO de la etapa (sin fila en proyecto_usuarios) resuelve una solicitud de SU etapa', async () => {
  fixture.miembrosNodoEtapaA = [{ id_nodo: ETAPA_A, id_usuario: 'otro-responsable-directo', rol: 'responsable' }];
  fixture.etapaA.id_responsable = 'otro-responsable-directo'; // responsable directo de la etapa, no del proyecto
  solicitudesQueries.obtener.mockResolvedValue(solicitudDeEtapaA());
  solicitudesQueries.responder.mockResolvedValue({ id: 'sol-1', funcion: 'captura', id_usuario: SOLICITANTE, id_nodo: ETAPA_A, tipo_nodo: 'etapa' });

  const req = { params: { id: 'sol-1' }, body: { respuesta: 'aceptar' }, usuario: { id: 'otro-responsable-directo', rol: 'enlace', id_dg: null, nombre_completo: 'Resp. de etapa' } };
  const res = crearRes();
  await responder(req, res, jest.fn());

  expect(res.status).not.toHaveBeenCalledWith(403);
  expect(solicitudesQueries.responder).toHaveBeenCalled();
});

test('responsable de la etapa NO puede resolver una solicitud de OTRA etapa donde no participa', async () => {
  fixture.etapaA.id_responsable = RESPONSABLE_ETAPA_A;
  const solicitudDeEtapaB = {
    id: 'sol-3', estado: 'pendiente', id_proyecto: PROYECTO,
    id_nodo: ETAPA_B, tipo_nodo: 'etapa', id_dg_lider: ID_DG,
  };
  solicitudesQueries.obtener.mockResolvedValue(solicitudDeEtapaB);

  const req = { params: { id: 'sol-3' }, body: { respuesta: 'aceptar' }, usuario: { id: RESPONSABLE_ETAPA_A, rol: 'enlace', id_dg: null, nombre_completo: 'Resp. de etapa A' } };
  const res = crearRes();
  await responder(req, res, jest.fn());

  expect(res.status).toHaveBeenCalledWith(403);
  expect(solicitudesQueries.responder).not.toHaveBeenCalled();
});

test('sin ninguna relación con el proyecto ni el nodo: rechazado', async () => {
  fixture.etapaA.id_responsable = RESPONSABLE_ETAPA_A;
  solicitudesQueries.obtener.mockResolvedValue(solicitudDeEtapaA());

  const req = { params: { id: 'sol-1' }, body: { respuesta: 'aceptar' }, usuario: { id: SIN_RELACION, rol: 'enlace', id_dg: null, nombre_completo: 'Nadie' } };
  const res = crearRes();
  await responder(req, res, jest.fn());

  expect(res.status).toHaveBeenCalledWith(403);
});

test('quien ya podía resolver TODO el proyecto (administracion_proyecto) sigue resolviendo una solicitud de una etapa donde no tiene nada directo — hereda hacia abajo', async () => {
  fixture.etapaA.id_responsable = null;
  solicitudesQueries.obtener.mockResolvedValue(solicitudDeEtapaA());
  solicitudesQueries.responder.mockResolvedValue({ id: 'sol-1', funcion: 'captura', id_usuario: SOLICITANTE, id_nodo: ETAPA_A, tipo_nodo: 'etapa' });

  const req = { params: { id: 'sol-1' }, body: { respuesta: 'aceptar' }, usuario: { id: RESPONSABLE_PROYECTO, rol: 'enlace', id_dg: null, nombre_completo: 'Admin del proyecto' } };
  const res = crearRes();
  await responder(req, res, jest.fn());

  expect(res.status).not.toHaveBeenCalledWith(403);
  expect(solicitudesQueries.responder).toHaveBeenCalled();
});

test('superadmin sigue resolviendo una solicitud de nodo sin ninguna fila propia', async () => {
  fixture.etapaA.id_responsable = null;
  solicitudesQueries.obtener.mockResolvedValue(solicitudDeEtapaA());
  solicitudesQueries.responder.mockResolvedValue({ id: 'sol-1', funcion: 'captura', id_usuario: SOLICITANTE, id_nodo: ETAPA_A, tipo_nodo: 'etapa' });

  const req = { params: { id: 'sol-1' }, body: { respuesta: 'aceptar' }, usuario: { id: 'super-1', rol: 'superadmin', id_dg: null, nombre_completo: 'Super' } };
  const res = crearRes();
  await responder(req, res, jest.fn());

  expect(res.status).not.toHaveBeenCalledWith(403);
});

test('dirección con el bono de su DG sigue resolviendo una solicitud de nodo de un proyecto de su DG', async () => {
  fixture.etapaA.id_responsable = null;
  solicitudesQueries.obtener.mockResolvedValue(solicitudDeEtapaA());
  solicitudesQueries.responder.mockResolvedValue({ id: 'sol-1', funcion: 'captura', id_usuario: SOLICITANTE, id_nodo: ETAPA_A, tipo_nodo: 'etapa' });

  const req = { params: { id: 'sol-1' }, body: { respuesta: 'aceptar' }, usuario: { id: DIRECTOR_DG, rol: 'direccion', id_dg: ID_DG, nombre_completo: 'Directora' } };
  const res = crearRes();
  await responder(req, res, jest.fn());

  expect(res.status).not.toHaveBeenCalledWith(403);
  expect(solicitudesQueries.responder).toHaveBeenCalled();
});

test('dirección de OTRA DG (sin bono, sin nada directo) no puede resolver', async () => {
  fixture.etapaA.id_responsable = null;
  solicitudesQueries.obtener.mockResolvedValue(solicitudDeEtapaA());

  const req = { params: { id: 'sol-1' }, body: { respuesta: 'aceptar' }, usuario: { id: 'otra-dg', rol: 'direccion', id_dg: 'dg-distinta', nombre_completo: 'Otra directora' } };
  const res = crearRes();
  await responder(req, res, jest.fn());

  expect(res.status).toHaveBeenCalledWith(403);
});

test('una solicitud DEL PROYECTO completo sigue evaluándose contra el proyecto (regresión, sin cambio de comportamiento)', async () => {
  solicitudesQueries.obtener.mockResolvedValue(solicitudDeProyecto());
  solicitudesQueries.responder.mockResolvedValue({ id: 'sol-2', funcion: 'captura', id_usuario: SOLICITANTE, id_nodo: null, tipo_nodo: null });

  const req = { params: { id: 'sol-2' }, body: { respuesta: 'aceptar' }, usuario: { id: RESPONSABLE_PROYECTO, rol: 'enlace', id_dg: null, nombre_completo: 'Admin del proyecto' } };
  const res = crearRes();
  await responder(req, res, jest.fn());

  expect(res.status).not.toHaveBeenCalledWith(403);

  const req2 = { params: { id: 'sol-2' }, body: { respuesta: 'aceptar' }, usuario: { id: RESPONSABLE_ETAPA_A, rol: 'enlace', id_dg: null, nombre_completo: 'Resp. de etapa' } };
  const res2 = crearRes();
  fixture.etapaA.id_responsable = RESPONSABLE_ETAPA_A;
  await responder(req2, res2, jest.fn());
  expect(res2.status).toHaveBeenCalledWith(403); // responsable de una etapa, no del proyecto completo
});
