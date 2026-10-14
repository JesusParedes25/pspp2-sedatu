/**
 * ARCHIVO: alcance-lectura.test.js
 * PROPÓSITO: Fase 2, Paso 1 del modelo de permisos (docs/modelo-permisos.md,
 *            Bloque A) — endpoints de lectura que hoy no verificaban nada
 *            ganan exactamente un chequeo: que 'externo' no vea proyectos
 *            fuera de los que fue invitado. No se mockea autorizacion.js ni
 *            funcion-efectiva.js a propósito — se usa la implementación
 *            real de puedeVerProyecto, para que esta suite sea la red de
 *            seguridad real: si alguien aprieta de más el alcance interno
 *            (o lo afloja para 'externo') en el futuro, aquí se nota. Solo
 *            se mockea ../db/pool (las filas que resuelven a qué proyecto
 *            pertenece cada entidad).
 *
 * Ejecutar: npm test
 */

jest.mock('../db/pool', () => ({ query: jest.fn() }));
const pool = require('../db/pool');
const {
  exigirVisibilidadProyecto, exigirVisibilidadNodo, exigirVisibilidadNodoEnParams,
  exigirVisibilidadDeEntidadEnQuery, exigirVisibilidadRiesgo, exigirVisibilidadIndicador,
  exigirVisibilidadEvidencia, exigirVisibilidadActividadPorId, exigirSoloInternos,
} = require('../utils/alcance-lectura');

const PROYECTO_A = '00000000-0000-0000-0000-0000000000a1';
const ETAPA_A = '00000000-0000-0000-0000-0000000000a2';
const ACCION_A = '00000000-0000-0000-0000-0000000000a3';
const TAREA_A = '00000000-0000-0000-0000-0000000000a4';
const RIESGO_A = '00000000-0000-0000-0000-0000000000a5';
const INDICADOR_A = '00000000-0000-0000-0000-0000000000a6';
const EVIDENCIA_A = '00000000-0000-0000-0000-0000000000a7';
const ACTIVIDAD_A = '00000000-0000-0000-0000-0000000000a8';
const ID_EXTERNO = '00000000-0000-0000-0000-0000000000e1';
const ID_ENLACE = '00000000-0000-0000-0000-0000000000e2';

function crearRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

// membresia: lista de { id_usuario, rol } aceptados en PROYECTO_A, para
// controlar si el usuario 'externo' de cada prueba está o no invitado.
function mockPool(membresia = []) {
  pool.query.mockImplementation((sql, params) => {
    if (/FROM proyectos WHERE id = \$1/.test(sql)) {
      return Promise.resolve({ rows: [{ id_creador: null, id_dg_lider: null }] });
    }
    if (/FROM proyecto_usuarios WHERE id_proyecto = \$1 AND id_usuario = \$2/.test(sql)) {
      const [, idUsuario] = params;
      const fila = membresia.find((m) => m.id_usuario === idUsuario);
      return Promise.resolve({ rows: fila ? [{ rol: fila.rol }] : [] });
    }
    if (/FROM etapas WHERE id = \$1/.test(sql)) {
      return Promise.resolve({ rows: [{ id_proyecto: PROYECTO_A }] });
    }
    if (/FROM acciones WHERE id = \$1/.test(sql)) {
      return Promise.resolve({ rows: [{ id_proyecto: PROYECTO_A, id_etapa: null }] });
    }
    if (/FROM tareas WHERE id = \$1/.test(sql)) {
      return Promise.resolve({ rows: [{ id_accion: ACCION_A }] });
    }
    if (/FROM riesgos WHERE id = \$1/.test(sql)) {
      return Promise.resolve({ rows: [{ entidad_tipo: 'Proyecto', entidad_id: PROYECTO_A }] });
    }
    if (/FROM indicadores WHERE id = \$1/.test(sql)) {
      return Promise.resolve({ rows: [{ id_proyecto: PROYECTO_A }] });
    }
    if (/FROM evidencias WHERE id = \$1/.test(sql)) {
      return Promise.resolve({ rows: [{ id_etapa: ETAPA_A, id_accion: null, id_subaccion: null, id_riesgo: null }] });
    }
    if (/FROM actividad WHERE id = \$1/.test(sql)) {
      return Promise.resolve({ rows: [{ id_proyecto: PROYECTO_A }] });
    }
    return Promise.resolve({ rows: [] });
  });
}

beforeEach(() => jest.clearAllMocks());

// Una fila por factory: { nombre, middleware, req } — req siempre trae
// solo usuario + los params/query que esa factory necesita. Reutilizada
// por los tres describe() de abajo (rechazo, regresión interna, caso feliz).
const CASOS = [
  { nombre: 'exigirVisibilidadProyecto', mw: () => exigirVisibilidadProyecto(), req: () => ({ params: { id: PROYECTO_A } }) },
  { nombre: "exigirVisibilidadNodo('etapa')", mw: () => exigirVisibilidadNodo('etapa'), req: () => ({ params: { id: ETAPA_A } }) },
  { nombre: "exigirVisibilidadNodo('accion')", mw: () => exigirVisibilidadNodo('accion'), req: () => ({ params: { id: ACCION_A } }) },
  { nombre: "exigirVisibilidadNodo('tarea')", mw: () => exigirVisibilidadNodo('tarea'), req: () => ({ params: { id: TAREA_A } }) },
  { nombre: 'exigirVisibilidadNodoEnParams (actividad)', mw: () => exigirVisibilidadNodoEnParams(), req: () => ({ params: { tipo_nodo: 'etapa', id_nodo: ETAPA_A } }) },
  { nombre: 'exigirVisibilidadDeEntidadEnQuery (comentarios/bloqueos)', mw: () => exigirVisibilidadDeEntidadEnQuery(), req: () => ({ query: { entidad_tipo: 'Etapa', entidad_id: ETAPA_A } }) },
  { nombre: 'exigirVisibilidadRiesgo', mw: () => exigirVisibilidadRiesgo(), req: () => ({ params: { id: RIESGO_A } }) },
  { nombre: 'exigirVisibilidadIndicador', mw: () => exigirVisibilidadIndicador(), req: () => ({ params: { id: INDICADOR_A } }) },
  { nombre: 'exigirVisibilidadEvidencia', mw: () => exigirVisibilidadEvidencia(), req: () => ({ params: { id: EVIDENCIA_A } }) },
  { nombre: 'exigirVisibilidadActividadPorId', mw: () => exigirVisibilidadActividadPorId(), req: () => ({ params: { id: ACTIVIDAD_A } }) },
];

describe.each(CASOS)('$nombre', ({ mw, req }) => {
  test('externo SIN invitación al proyecto: 403, nunca llega al controller', async () => {
    mockPool([]); // nadie invitado
    const res = crearRes();
    const next = jest.fn();
    await mw()({ usuario: { id: ID_EXTERNO, rol: 'externo' }, ...req() }, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('externo CON invitación (lectura) al proyecto: pasa', async () => {
    mockPool([{ id_usuario: ID_EXTERNO, rol: 'lectura' }]);
    const res = crearRes();
    const next = jest.fn();
    await mw()({ usuario: { id: ID_EXTERNO, rol: 'externo' }, ...req() }, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });

  // Regresión (la red de seguridad que pidió el usuario): un interno sin
  // ninguna invitación ve exactamente lo mismo que antes de este PR — es
  // decir, nunca lo bloquea. Antes de este PR ninguno de estos endpoints
  // tenía control alguno, así que "lo mismo que antes" es "siempre pasa".
  test("regresión — 'enlace' SIN participar en el proyecto sigue pasando, como antes de este PR", async () => {
    mockPool([]); // enlace tampoco está invitado, y aun así debe pasar
    const res = crearRes();
    const next = jest.fn();
    await mw()({ usuario: { id: ID_ENLACE, rol: 'enlace' }, ...req() }, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('superadmin siempre pasa, sin tocar la base de datos de membresía', async () => {
    mockPool([]);
    const res = crearRes();
    const next = jest.fn();
    await mw()({ usuario: { id: 'otro', rol: 'superadmin' }, ...req() }, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('exigirVisibilidadDeEntidadEnQuery — casos propios de la query string', () => {
  test('sin entidad_tipo/entidad_id, deja pasar para que el controller dé su 400', async () => {
    mockPool([]);
    const res = crearRes();
    const next = jest.fn();
    await exigirVisibilidadDeEntidadEnQuery()({ usuario: { rol: 'enlace' }, query: {} }, res, next);

    expect(pool.query).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
  });
});

describe('exigirVisibilidadNodoEnParams — tipo_nodo inválido', () => {
  test('tipo_nodo fuera de etapa/accion/tarea deja pasar (400 lo da el controller, no un 403)', async () => {
    mockPool([]);
    const res = crearRes();
    const next = jest.fn();
    await exigirVisibilidadNodoEnParams()({ usuario: { rol: 'enlace' }, params: { tipo_nodo: 'proyecto', id_nodo: 'x' } }, res, next);

    expect(pool.query).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
  });
});

describe('exigirSoloInternos — plantillas de importación (sin proyecto que resolver)', () => {
  test('externo: 403', () => {
    const res = crearRes();
    const next = jest.fn();
    exigirSoloInternos()({ usuario: { rol: 'externo' } }, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test.each(['superadmin', 'ejecutivo', 'direccion', 'enlace'])('%s: pasa (regresión — mismo acceso que antes)', (rol) => {
    const res = crearRes();
    const next = jest.fn();
    exigirSoloInternos()({ usuario: { rol } }, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });
});
