/**
 * ARCHIVO: paso2-grupo2-dashboard-mapas.test.js
 * PROPÓSITO: Fase 2, Paso 2 (docs/modelo-permisos.md sección 9) —
 *            Grupo 2: GET /dashboard, GET /mapa/resumen-estados y
 *            GET /mapa/estado/:id no filtraban nada; ahora se conectan
 *            al alcance real del usuario (alcanceProyectosUsuarioONull).
 *            Confirmado sin importador conocido en el frontend hoy
 *            (frontend/src/api/dashboard.js y api/mapa.js sin callers) —
 *            se protegen igual, por eso estos tests son a nivel API/
 *            controller, no end-to-end de UI.
 *
 * Ejecutar: npm test
 */

jest.mock('../utils/alcanceProyectos', () => ({ alcanceProyectosUsuarioONull: jest.fn() }));
jest.mock('../db/queries/dashboard.queries', () => ({
  obtenerMetricasGlobales: jest.fn().mockResolvedValue({}),
  obtenerAvancePorDG: jest.fn().mockResolvedValue([]),
  obtenerAlertas: jest.fn().mockResolvedValue({ vencidas: [], riesgos: [] }),
  obtenerIndicadoresPublicables: jest.fn().mockResolvedValue([]),
}));
jest.mock('../db/queries/geografia.queries', () => ({
  obtenerResumenPorEstados: jest.fn().mockResolvedValue([]),
  obtenerResumenTerritorial: jest.fn().mockResolvedValue({}),
}));

const { alcanceProyectosUsuarioONull } = require('../utils/alcanceProyectos');
const dashboardQueries = require('../db/queries/dashboard.queries');
const geografiaQueries = require('../db/queries/geografia.queries');
const dashboardController = require('../controllers/dashboard.controller');
const geografiaController = require('../controllers/geografia.controller');

function crearRes() {
  return { json: jest.fn().mockReturnThis() };
}

beforeEach(() => jest.clearAllMocks());

describe.each([
  ['superadmin', null],
  ['ejecutivo', null],
  ['direccion', ['p-dg1', 'p-dg2']],
  ['enlace', ['p-propio']],
])('GET /dashboard — %s', (rol, alcance) => {
  test('el alcance real del perfil llega a las 4 queries agregadas', async () => {
    alcanceProyectosUsuarioONull.mockResolvedValueOnce(alcance);
    const req = { usuario: { rol }, query: {} };
    await dashboardController.obtenerDashboard(req, crearRes(), jest.fn());

    expect(dashboardQueries.obtenerMetricasGlobales).toHaveBeenCalledWith({}, alcance);
    expect(dashboardQueries.obtenerAvancePorDG).toHaveBeenCalledWith({}, alcance);
    expect(dashboardQueries.obtenerAlertas).toHaveBeenCalledWith({}, alcance);
    expect(dashboardQueries.obtenerIndicadoresPublicables).toHaveBeenCalledWith({}, alcance);
  });
});

describe.each([
  ['superadmin', null],
  ['ejecutivo', null],
  ['direccion', ['p-dg1', 'p-dg2']],
  ['enlace', ['p-propio']],
])('GET /mapa/resumen-estados y /mapa/estado/:id — %s', (rol, alcance) => {
  test('el alcance real del perfil llega a ambas queries del mapa', async () => {
    alcanceProyectosUsuarioONull.mockResolvedValueOnce(alcance);
    await geografiaController.resumenPorEstados({ usuario: { rol }, query: {} }, crearRes(), jest.fn());
    expect(geografiaQueries.obtenerResumenPorEstados).toHaveBeenCalledWith({}, alcance);

    alcanceProyectosUsuarioONull.mockResolvedValueOnce(alcance);
    await geografiaController.resumenTerritorial({ usuario: { rol }, query: {}, params: { id: 'edomex' } }, crearRes(), jest.fn());
    expect(geografiaQueries.obtenerResumenTerritorial).toHaveBeenCalledWith('edomex', {}, alcance);
  });
});

