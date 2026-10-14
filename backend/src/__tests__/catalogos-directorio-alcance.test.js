/**
 * ARCHIVO: catalogos-directorio-alcance.test.js
 * PROPÓSITO: Fase 2, Paso 1 del modelo de permisos (docs/modelo-permisos.md,
 *            Bloque B) — GET /catalogos/usuarios devolvía el directorio
 *            completo a cualquier usuario autenticado, incluido 'externo'.
 *            Ahora 'externo' solo recibe a quienes comparten un proyecto
 *            con él; cualquier perfil interno sigue recibiendo el
 *            directorio completo, sin cambio (regresión explícita).
 *
 * Ejecutar: npm test
 */

jest.mock('../db/queries/catalogos.queries', () => ({
  obtenerUsuarios: jest.fn(),
  obtenerUsuariosCoparticipantes: jest.fn(),
}));

const catalogosQueries = require('../db/queries/catalogos.queries');
const catalogosController = require('../controllers/catalogos.controller');

function crearRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

const ID_EXTERNO = '00000000-0000-0000-0000-0000000000e1';
const ID_ENLACE = '00000000-0000-0000-0000-0000000000e2';

beforeEach(() => jest.clearAllMocks());

describe('GET /catalogos/usuarios', () => {
  test("'externo' recibe solo a sus coparticipantes, nunca el directorio completo", async () => {
    catalogosQueries.obtenerUsuariosCoparticipantes.mockResolvedValueOnce([{ id: 'x' }]);
    const req = { usuario: { id: ID_EXTERNO, rol: 'externo' }, query: {} };
    const res = crearRes();
    const next = jest.fn();

    await catalogosController.obtenerUsuarios(req, res, next);

    expect(catalogosQueries.obtenerUsuariosCoparticipantes).toHaveBeenCalledWith(ID_EXTERNO, expect.any(Object));
    expect(catalogosQueries.obtenerUsuarios).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ datos: [{ id: 'x' }] }));
  });

  test.each(['superadmin', 'ejecutivo', 'direccion', 'enlace'])(
    "regresión — '%s' sigue recibiendo el directorio completo sin cambio",
    async (rol) => {
      catalogosQueries.obtenerUsuarios.mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }]);
      const req = { usuario: { id: ID_ENLACE, rol }, query: { id_dg: 'dg-1' } };
      const res = crearRes();
      const next = jest.fn();

      await catalogosController.obtenerUsuarios(req, res, next);

      expect(catalogosQueries.obtenerUsuarios).toHaveBeenCalledWith('dg-1', expect.any(Object));
      expect(catalogosQueries.obtenerUsuariosCoparticipantes).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ datos: [{ id: 'a' }, { id: 'b' }] }));
    }
  );
});
