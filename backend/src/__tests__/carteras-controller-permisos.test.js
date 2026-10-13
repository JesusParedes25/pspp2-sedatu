/**
 * ARCHIVO: carteras-controller-permisos.test.js
 * PROPÓSITO: Punto 4 de la ronda de correcciones de la Fase 1
 *            (docs/modelo-permisos.md) — hasta la migración 080,
 *            cualquier usuario autenticado podía editar, eliminar, o
 *            agregar/quitar proyectos de CUALQUIER cartera. Ahora exige
 *            administrar la cartera (su id_administrador, o superadmin);
 *            agregar un proyecto exige además poder VERLO. Pertenecer a
 *            una cartera, o que un proyecto propio esté en ella, nunca
 *            otorga ningún permiso — eso se cubre aquí no dándole a
 *            ningún usuario de prueba ninguna vía de acceso vía cartera.
 *
 * Ejecutar: npm test
 */

const UUID_ADMIN = '00000000-0000-0000-0000-000000000001';
const UUID_OTRO = '00000000-0000-0000-0000-000000000002';
const UUID_CARTERA = '00000000-0000-0000-0000-000000000003';
const UUID_PROYECTO = '00000000-0000-0000-0000-000000000004';

function crearRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

jest.mock('../db/queries/carteras.queries', () => ({
  obtenerCarteraPorId: jest.fn(),
  crearCartera: jest.fn(),
  actualizarCartera: jest.fn(),
  eliminarCartera: jest.fn(),
  reasignarAdministrador: jest.fn(),
  agregarProyectos: jest.fn(),
  quitarProyecto: jest.fn(),
}));
jest.mock('../db/queries/geografia.queries', () => ({}));
jest.mock('../utils/autorizacion', () => ({
  puedeVerProyecto: jest.fn(),
}));

const carterasQueries = require('../db/queries/carteras.queries');
const { puedeVerProyecto } = require('../utils/autorizacion');
const carterasController = require('../controllers/carteras.controller');

beforeEach(() => jest.clearAllMocks());

describe('POST /carteras — crear', () => {
  test("perfil 'externo' no puede crear carteras", async () => {
    const req = { usuario: { id: UUID_OTRO, rol: 'externo' }, body: { nombre: 'X' } };
    const res = crearRes();
    await carterasController.crear(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(403);
    expect(carterasQueries.crearCartera).not.toHaveBeenCalled();
  });

  test("cualquier otro perfil sí puede crear (no es privilegio de superadmin/ejecutivo)", async () => {
    carterasQueries.crearCartera.mockResolvedValueOnce({ id: UUID_CARTERA });
    const req = { usuario: { id: UUID_OTRO, rol: 'enlace' }, body: { nombre: 'X' } };
    const res = crearRes();
    await carterasController.crear(req, res, jest.fn());

    expect(carterasQueries.crearCartera).toHaveBeenCalledWith(req.body, UUID_OTRO);
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe('PUT /carteras/:id — actualizar', () => {
  test('cartera inexistente: 404', async () => {
    carterasQueries.obtenerCarteraPorId.mockResolvedValueOnce(null);
    const req = { usuario: { id: UUID_OTRO, rol: 'enlace' }, params: { id: UUID_CARTERA }, body: {} };
    const res = crearRes();
    await carterasController.actualizar(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(carterasQueries.actualizarCartera).not.toHaveBeenCalled();
  });

  test('quien no administra la cartera: 403, sin llegar al UPDATE', async () => {
    carterasQueries.obtenerCarteraPorId.mockResolvedValueOnce({ id: UUID_CARTERA, id_administrador: UUID_ADMIN });
    const req = { usuario: { id: UUID_OTRO, rol: 'enlace' }, params: { id: UUID_CARTERA }, body: { nombre: 'Y' } };
    const res = crearRes();
    await carterasController.actualizar(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(403);
    expect(carterasQueries.actualizarCartera).not.toHaveBeenCalled();
  });

  test('el administrador de la cartera sí puede editarla', async () => {
    carterasQueries.obtenerCarteraPorId.mockResolvedValueOnce({ id: UUID_CARTERA, id_administrador: UUID_ADMIN });
    carterasQueries.actualizarCartera.mockResolvedValueOnce({ id: UUID_CARTERA, nombre: 'Y' });
    const req = { usuario: { id: UUID_ADMIN, rol: 'enlace' }, params: { id: UUID_CARTERA }, body: { nombre: 'Y' } };
    const res = crearRes();
    await carterasController.actualizar(req, res, jest.fn());

    expect(carterasQueries.actualizarCartera).toHaveBeenCalledWith(UUID_CARTERA, req.body);
    expect(res.status).not.toHaveBeenCalledWith(403);
  });

  test('superadmin puede editar aunque no sea el administrador', async () => {
    carterasQueries.obtenerCarteraPorId.mockResolvedValueOnce({ id: UUID_CARTERA, id_administrador: UUID_ADMIN });
    carterasQueries.actualizarCartera.mockResolvedValueOnce({ id: UUID_CARTERA });
    const req = { usuario: { id: UUID_OTRO, rol: 'superadmin' }, params: { id: UUID_CARTERA }, body: { nombre: 'Z' } };
    const res = crearRes();
    await carterasController.actualizar(req, res, jest.fn());

    expect(carterasQueries.actualizarCartera).toHaveBeenCalled();
  });

  test('una cartera sin administrador asignado (huérfana) no es editable por nadie salvo superadmin', async () => {
    carterasQueries.obtenerCarteraPorId.mockResolvedValueOnce({ id: UUID_CARTERA, id_administrador: null });
    const req = { usuario: { id: UUID_OTRO, rol: 'enlace' }, params: { id: UUID_CARTERA }, body: {} };
    const res = crearRes();
    await carterasController.actualizar(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('DELETE /carteras/:id — eliminar', () => {
  test('quien no administra la cartera: 403', async () => {
    carterasQueries.obtenerCarteraPorId.mockResolvedValueOnce({ id: UUID_CARTERA, id_administrador: UUID_ADMIN });
    const req = { usuario: { id: UUID_OTRO, rol: 'ejecutivo' }, params: { id: UUID_CARTERA } };
    const res = crearRes();
    await carterasController.eliminar(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(403);
    expect(carterasQueries.eliminarCartera).not.toHaveBeenCalled();
  });
});

describe('PATCH /carteras/:id/administrador — reasignarAdministrador', () => {
  test('solo superadmin puede reasignar', async () => {
    const req = { usuario: { id: UUID_OTRO, rol: 'ejecutivo' }, params: { id: UUID_CARTERA }, body: { id_administrador: UUID_OTRO } };
    const res = crearRes();
    await carterasController.reasignarAdministrador(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(403);
    expect(carterasQueries.reasignarAdministrador).not.toHaveBeenCalled();
  });

  test('sin id_administrador en el body: 400', async () => {
    const req = { usuario: { id: UUID_OTRO, rol: 'superadmin' }, params: { id: UUID_CARTERA }, body: {} };
    const res = crearRes();
    await carterasController.reasignarAdministrador(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('superadmin con id_administrador válido: reasigna', async () => {
    carterasQueries.reasignarAdministrador.mockResolvedValueOnce({ id: UUID_CARTERA, id_administrador: UUID_OTRO });
    const req = { usuario: { id: UUID_ADMIN, rol: 'superadmin' }, params: { id: UUID_CARTERA }, body: { id_administrador: UUID_OTRO } };
    const res = crearRes();
    await carterasController.reasignarAdministrador(req, res, jest.fn());

    expect(carterasQueries.reasignarAdministrador).toHaveBeenCalledWith(UUID_CARTERA, UUID_OTRO);
    expect(res.status).not.toHaveBeenCalledWith(403);
  });
});

describe('POST /carteras/:id/proyectos — agregarProyectos', () => {
  test('quien no administra la cartera: 403, sin consultar visibilidad de proyectos', async () => {
    carterasQueries.obtenerCarteraPorId.mockResolvedValueOnce({ id: UUID_CARTERA, id_administrador: UUID_ADMIN });
    const req = { usuario: { id: UUID_OTRO, rol: 'enlace' }, params: { id: UUID_CARTERA }, body: { proyecto_ids: [UUID_PROYECTO] } };
    const res = crearRes();
    await carterasController.agregarProyectos(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(403);
    expect(puedeVerProyecto).not.toHaveBeenCalled();
    expect(carterasQueries.agregarProyectos).not.toHaveBeenCalled();
  });

  test('administrador de la cartera, pero no puede ver uno de los proyectos: 403', async () => {
    carterasQueries.obtenerCarteraPorId.mockResolvedValueOnce({ id: UUID_CARTERA, id_administrador: UUID_ADMIN });
    puedeVerProyecto.mockResolvedValueOnce(false);
    const req = { usuario: { id: UUID_ADMIN, rol: 'enlace' }, params: { id: UUID_CARTERA }, body: { proyecto_ids: [UUID_PROYECTO] } };
    const res = crearRes();
    await carterasController.agregarProyectos(req, res, jest.fn());

    expect(puedeVerProyecto).toHaveBeenCalledWith(req.usuario, UUID_PROYECTO);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(carterasQueries.agregarProyectos).not.toHaveBeenCalled();
  });

  test('administrador y puede ver el proyecto: lo agrega', async () => {
    carterasQueries.obtenerCarteraPorId.mockResolvedValueOnce({ id: UUID_CARTERA, id_administrador: UUID_ADMIN });
    puedeVerProyecto.mockResolvedValueOnce(true);
    carterasQueries.agregarProyectos.mockResolvedValueOnce([{ id: 'cp1' }]);
    const req = { usuario: { id: UUID_ADMIN, rol: 'enlace' }, params: { id: UUID_CARTERA }, body: { proyecto_ids: [UUID_PROYECTO] } };
    const res = crearRes();
    await carterasController.agregarProyectos(req, res, jest.fn());

    expect(carterasQueries.agregarProyectos).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe('DELETE /carteras/:id/proyectos/:proyectoId — quitarProyecto', () => {
  test('quien no administra la cartera: 403', async () => {
    carterasQueries.obtenerCarteraPorId.mockResolvedValueOnce({ id: UUID_CARTERA, id_administrador: UUID_ADMIN });
    const req = { usuario: { id: UUID_OTRO, rol: 'direccion' }, params: { id: UUID_CARTERA, proyectoId: UUID_PROYECTO } };
    const res = crearRes();
    await carterasController.quitarProyecto(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(403);
    expect(carterasQueries.quitarProyecto).not.toHaveBeenCalled();
  });

  test('el administrador sí puede quitar un proyecto', async () => {
    carterasQueries.obtenerCarteraPorId.mockResolvedValueOnce({ id: UUID_CARTERA, id_administrador: UUID_ADMIN });
    carterasQueries.quitarProyecto.mockResolvedValueOnce({ id: 'cp1' });
    const req = { usuario: { id: UUID_ADMIN, rol: 'enlace' }, params: { id: UUID_CARTERA, proyectoId: UUID_PROYECTO } };
    const res = crearRes();
    await carterasController.quitarProyecto(req, res, jest.fn());

    expect(carterasQueries.quitarProyecto).toHaveBeenCalledWith(UUID_CARTERA, UUID_PROYECTO);
  });
});
