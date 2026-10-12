/**
 * ARCHIVO: proyectos-controller-permisos.test.js
 * PROPÓSITO: Dos huecos de autorización cerrados en la Fase 1 del modelo
 *            de permisos (docs/modelo-permisos.md, sección 6.2):
 *              - POST /proyectos no bloqueaba a 'externo' (su endpoint
 *                hermano `duplicar` sí lo hacía).
 *              - POST /proyectos/:id/imagen no tenía ningún chequeo.
 *
 * Ejecutar: npm test
 */

const UUID_1 = '00000000-0000-0000-0000-000000000001';
const UUID_2 = '00000000-0000-0000-0000-000000000002';

function crearRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

jest.mock('../db/queries/proyectos.queries', () => ({
  crearProyecto: jest.fn(),
  actualizarImagenProyecto: jest.fn(),
  obtenerProyectoPorId: jest.fn(),
}));
jest.mock('../db/queries/duplicar.queries', () => ({ duplicarProyecto: jest.fn() }));
jest.mock('../utils/autorizacion', () => ({
  puedeEditarProyecto: jest.fn(),
  puedeGestionarProyecto: jest.fn(),
  puedeEditarContenidoProyecto: jest.fn(),
  puedeGestionarParticipantes: jest.fn(),
}));
jest.mock('../db/queries/permisos.queries', () => ({}));
jest.mock('../db/queries/indicadores.queries', () => ({}));
jest.mock('../db/queries/inicio.queries', () => ({}));
jest.mock('../db/queries/bitacora.queries', () => ({}));
jest.mock('../db/queries/miembros.queries', () => ({}));
jest.mock('../db/queries/proyectos.stats.queries', () => ({}));
jest.mock('../db/pool', () => ({ connect: jest.fn(), query: jest.fn() }));
jest.mock('../utils/validaciones-estado', () => ({ cambiarEstado: jest.fn() }));
jest.mock('../utils/recalculos', () => ({ recalcularProyecto: jest.fn() }));

const mockPutObject = jest.fn().mockResolvedValue();
jest.mock('minio', () => ({
  Client: jest.fn().mockImplementation(() => ({ putObject: (...a) => mockPutObject(...a) })),
}));

const { puedeEditarProyecto } = require('../utils/autorizacion');
const proyectosQueries = require('../db/queries/proyectos.queries');
const proyectosController = require('../controllers/proyectos.controller');

beforeEach(() => jest.clearAllMocks());

describe('proyectos.controller.js::crear', () => {
  test('usuario externo recibe 403 y nunca llega a crearProyecto', async () => {
    const req = { usuario: { id: UUID_1, rol: 'externo' }, body: { nombre: 'Un proyecto' } };
    const res = crearRes();
    const next = jest.fn();

    await proyectosController.crear(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'FORBIDDEN' }));
    expect(proyectosQueries.crearProyecto).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test.each(['superadmin', 'ejecutivo', 'direccion', 'enlace'])(
    'usuario %s sí puede crear (no se bloquea a nadie más)',
    async (rol) => {
      proyectosQueries.crearProyecto.mockResolvedValueOnce({ id: UUID_2, nombre: 'Un proyecto' });
      const req = { usuario: { id: UUID_1, rol }, body: { nombre: 'Un proyecto' } };
      const res = crearRes();
      const next = jest.fn();

      await proyectosController.crear(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(proyectosQueries.crearProyecto).toHaveBeenCalledTimes(1);
    }
  );
});

describe('proyectos.controller.js::subirImagen', () => {
  test('sin permiso de editar el proyecto: 403, nunca sube a MinIO', async () => {
    puedeEditarProyecto.mockResolvedValueOnce(false);
    const req = {
      usuario: { id: UUID_1, rol: 'enlace' },
      params: { id: UUID_2 },
      file: { originalname: 'foto.png', buffer: Buffer.from(''), size: 0, mimetype: 'image/png' },
    };
    const res = crearRes();
    const next = jest.fn();

    await proyectosController.subirImagen(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'NO_AUTORIZADO' }));
    expect(mockPutObject).not.toHaveBeenCalled();
    expect(proyectosQueries.actualizarImagenProyecto).not.toHaveBeenCalled();
  });

  test('con permiso de editar el proyecto: sube la imagen normalmente', async () => {
    puedeEditarProyecto.mockResolvedValueOnce(true);
    proyectosQueries.actualizarImagenProyecto.mockResolvedValueOnce({ id: UUID_2, imagen_url: 'x' });
    const req = {
      usuario: { id: UUID_1, rol: 'enlace' },
      params: { id: UUID_2 },
      file: { originalname: 'foto.png', buffer: Buffer.from(''), size: 0, mimetype: 'image/png' },
    };
    const res = crearRes();
    const next = jest.fn();

    await proyectosController.subirImagen(req, res, next);

    expect(mockPutObject).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalledWith(403);
  });
});
