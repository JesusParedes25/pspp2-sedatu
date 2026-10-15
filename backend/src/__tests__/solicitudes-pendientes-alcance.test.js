/**
 * ARCHIVO: solicitudes-pendientes-alcance.test.js
 * PROPÓSITO: Fase 4/parte A del modelo de permisos (docs/modelo-permisos.md,
 *            commit 3) — `pendientesQuePuedeResolver` (la bandeja de
 *            Notificaciones) solo miraba `proyecto_usuarios`, nunca el
 *            nodo exacto de la solicitud ni su herencia: un responsable
 *            de una sola etapa no veía ahí las solicitudes de su propia
 *            etapa. Ahora reusa las MISMAS funciones que el gate real de
 *            responder() (puedeGestionarParticipantes/
 *            puedeGestionarParticipantesNodo) — por construcción, lo que
 *            aparece aquí es exactamente lo que responder() aceptaría.
 *
 * No se mockea autorizacion.js ni funcion-efectiva.js — implementación
 * real, solo se mockea ../pool.
 *
 * Ejecutar: npm test
 */
const PROYECTO = '00000000-0000-0000-0000-0000000000c1';
const ETAPA_A = '00000000-0000-0000-0000-0000000000c2';
const ETAPA_B = '00000000-0000-0000-0000-0000000000c3';
const SOLICITANTE = '00000000-0000-0000-0000-0000000000c4';
const RESPONSABLE_ETAPA_A = '00000000-0000-0000-0000-0000000000c5';
const SIN_RELACION = '00000000-0000-0000-0000-0000000000c6';
const ID_DG = '00000000-0000-0000-0000-0000000000dg';

let fixture;

jest.mock('../db/pool', () => ({ query: jest.fn() }));
const pool = require('../db/pool');
const { pendientesQuePuedeResolver } = require('../db/queries/solicitudes.queries');

const SOLICITUD_ETAPA_A = {
  id: 'sol-1', estado: 'pendiente', id_usuario: SOLICITANTE,
  id_proyecto: PROYECTO, id_nodo: ETAPA_A, tipo_nodo: 'etapa',
  nombre_completo: 'Quien pide', correo: 'x@sedatu.gob.mx', cargo: null, perfil: 'enlace',
  dg_siglas: null, nombre_proyecto: 'Proyecto de prueba', id_dg_lider: ID_DG,
  nombre_nodo: 'Etapa A', created_at: new Date(),
};

beforeEach(() => {
  jest.clearAllMocks();
  fixture = {
    etapaA: { id_responsable: null, id_proyecto: PROYECTO },
    miembrosProyecto: [],
    miembrosNodoEtapaA: [],
  };

  pool.query.mockImplementation((sql, params) => {
    if (/FROM solicitudes_participacion/.test(sql)) {
      return Promise.resolve({ rows: [SOLICITUD_ETAPA_A] });
    }
    if (/FROM proyectos WHERE id = \$1/.test(sql)) {
      const id = params[0];
      if (id === PROYECTO) return Promise.resolve({ rows: [{ id_creador: null, id_dg_lider: ID_DG }] });
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

test('responsable SOLO de la etapa (sin fila en proyecto_usuarios) SÍ ve la solicitud de su etapa', async () => {
  fixture.etapaA.id_responsable = RESPONSABLE_ETAPA_A;
  const resultado = await pendientesQuePuedeResolver({ id: RESPONSABLE_ETAPA_A, rol: 'enlace', id_dg: null });
  expect(resultado.map(s => s.id)).toContain('sol-1');
});

test('alguien sin relación con el proyecto ni el nodo NO la ve', async () => {
  fixture.etapaA.id_responsable = RESPONSABLE_ETAPA_A;
  const resultado = await pendientesQuePuedeResolver({ id: SIN_RELACION, rol: 'enlace', id_dg: null });
  expect(resultado.map(s => s.id)).not.toContain('sol-1');
});

test('responsable de OTRA etapa (sin nada en la etapa A) no la ve', async () => {
  fixture.etapaA.id_responsable = RESPONSABLE_ETAPA_A;
  fixture.miembrosNodoEtapaA = [{ id_nodo: ETAPA_B, id_usuario: 'resp-etapa-b', rol: 'responsable' }];
  const resultado = await pendientesQuePuedeResolver({ id: 'resp-etapa-b', rol: 'enlace', id_dg: null });
  expect(resultado.map(s => s.id)).not.toContain('sol-1');
});

test('responsable/administracion_proyecto de TODO el proyecto sigue viéndola (regresión)', async () => {
  fixture.miembrosProyecto = [{ id_usuario: 'admin-proyecto', rol: 'administracion_proyecto' }];
  const resultado = await pendientesQuePuedeResolver({ id: 'admin-proyecto', rol: 'enlace', id_dg: null });
  expect(resultado.map(s => s.id)).toContain('sol-1');
});

test('dirección con el bono de su DG la ve (aunque no tenga nada directo en la etapa)', async () => {
  const resultado = await pendientesQuePuedeResolver({ id: 'directora', rol: 'direccion', id_dg: ID_DG });
  expect(resultado.map(s => s.id)).toContain('sol-1');
});

test('dirección de otra DG no la ve', async () => {
  const resultado = await pendientesQuePuedeResolver({ id: 'otra-directora', rol: 'direccion', id_dg: 'dg-distinta' });
  expect(resultado.map(s => s.id)).not.toContain('sol-1');
});

test('superadmin sigue viendo todo, sin condición (regresión)', async () => {
  const comoSuperadmin = await pendientesQuePuedeResolver({ id: 'super-1', rol: 'superadmin', id_dg: null });
  expect(comoSuperadmin.map(s => s.id)).toContain('sol-1');
});

// 'ejecutivo' nunca tuvo un bono DE ESCALERA incondicional — solo lo da
// funcionEfectivaEnProyecto cuando su DG coincide con la del proyecto
// (funcion-efectiva.js:111-118). El SQL viejo de esta función sí lo
// trataba como incondicional ($2 IN ('superadmin','ejecutivo')) — un
// hallazgo nuevo, de la misma familia que el de 'direccion': un
// ejecutivo de OTRA DG veía la solicitud en su bandeja pero
// responder() ya lo rechazaba igual (funcionEfectivaEnProyecto no le
// da nada fuera de su DG) — "visible pero no resoluble", justo lo que
// esta ronda pidió eliminar. Se corrige aquí también, no solo para
// 'direccion': con la DG correcta sigue viendo/resolviendo todo; sin
// ella, deja de verla, consistente con que tampoco podría resolverla.
test('ejecutivo de la MISMA DG que lidera el proyecto la ve', async () => {
  const resultado = await pendientesQuePuedeResolver({ id: 'ejec-1', rol: 'ejecutivo', id_dg: ID_DG });
  expect(resultado.map(s => s.id)).toContain('sol-1');
});

test('ejecutivo de OTRA DG ya NO la ve (antes sí, por el SQL incondicional — pero tampoco podía resolverla)', async () => {
  const resultado = await pendientesQuePuedeResolver({ id: 'ejec-2', rol: 'ejecutivo', id_dg: 'dg-distinta' });
  expect(resultado.map(s => s.id)).not.toContain('sol-1');
});
