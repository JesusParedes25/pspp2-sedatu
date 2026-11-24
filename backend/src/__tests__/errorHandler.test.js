/**
 * ARCHIVO: errorHandler.test.js
 * PROPÓSITO: paso 10 DGTIC (manejo de errores) — err.message llegaba al
 *            cliente tal cual también en producción. La mayoría de esos
 *            mensajes son seguros a propósito (utils/validaciones.js y
 *            el mismo patrón en varios controllers/queries: lanzan
 *            new Error(texto) con su propio err.statusCode para que
 *            errorHandler lo muestre), pero un error SIN err.statusCode
 *            propio (cayó al 500 por defecto, o es un código de Postgres
 *            sin mensaje curado) es uno que nadie anticipó, y su
 *            err.message puede traer detalle interno (Postgres, una
 *            librería, el intérprete). errorHandler ahora distingue los
 *            dos casos: en producción, el primero se muestra igual que
 *            antes; el segundo se cambia por un mensaje genérico. En
 *            desarrollo nada cambia, ambos casos siguen mostrando
 *            err.message. El log del servidor recibe el detalle completo
 *            (mensaje + stack) en los dos entornos — antes, el stack solo
 *            se logueaba en desarrollo.
 *
 * Ejecutar: npm test
 */
const errorHandler = require('../middleware/errorHandler');

function crearRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

function crearReq() {
  return { method: 'GET', originalUrl: '/api/v1/algo' };
}

describe('errorHandler', () => {
  const NODE_ENV_ORIGINAL = process.env.NODE_ENV;
  let consoleErrorSpy;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.NODE_ENV = NODE_ENV_ORIGINAL;
    consoleErrorSpy.mockRestore();
  });

  describe('en producción', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    test('error con err.statusCode propio (validación/regla de negocio): el mensaje SÍ llega al cliente', () => {
      const err = new Error('La cantidad debe ser mayor que 0');
      err.statusCode = 400;
      err.codigo = 'MONTO_REQUERIDO';
      const res = crearRes();

      errorHandler(err, crearReq(), res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        mensaje: 'La cantidad debe ser mayor que 0',
        codigo: 'MONTO_REQUERIDO',
      }));
    });

    test('error de constraint con mensaje curado (MENSAJES_CONSTRAINT): el mensaje SÍ llega al cliente', () => {
      const err = new Error('duplicate key value violates unique constraint "etapas_territorio_exclusivo"');
      err.code = '23514';
      err.constraint = 'etapas_territorio_exclusivo';
      const res = crearRes();

      errorHandler(err, crearReq(), res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        mensaje: 'Un nodo no puede tener Zona Metropolitana y Estado/Municipio al mismo tiempo.',
      }));
    });

    test('error SIN err.statusCode propio (no anticipado, cae al 500): el cliente recibe un mensaje genérico, no err.message', () => {
      const err = new Error('relation "usuarios" column "correo_invalido" does not exist');
      const res = crearRes();

      errorHandler(err, crearReq(), res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(500);
      const body = res.json.mock.calls[0][0];
      expect(body.mensaje).toBe('Error interno del servidor');
      expect(body.mensaje).not.toMatch(/usuarios|correo_invalido/);
    });

    test('error de Postgres mapeado a un status pero sin mensaje curado: el cliente recibe un mensaje genérico', () => {
      const err = new Error('duplicate key value violates unique constraint "usuarios_correo_key"');
      err.code = '23505';
      err.constraint = 'usuarios_correo_key';
      const res = crearRes();

      errorHandler(err, crearReq(), res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(409);
      const body = res.json.mock.calls[0][0];
      expect(body.mensaje).toBe('Error interno del servidor');
      expect(body.mensaje).not.toMatch(/usuarios_correo_key/);
    });

    test('no incluye stack en la respuesta', () => {
      const err = new Error('algo truena');
      const res = crearRes();

      errorHandler(err, crearReq(), res, jest.fn());

      expect(res.json.mock.calls[0][0]).not.toHaveProperty('stack');
    });

    test('el detalle completo (mensaje y stack) igual se loguea en el servidor', () => {
      const err = new Error('relation "usuarios" column "correo_invalido" does not exist');
      errorHandler(err, crearReq(), crearRes(), jest.fn());

      const loggedStack = consoleErrorSpy.mock.calls.some((c) => c[0] === 'Stack:' && c[1] === err.stack);
      const loggedMensaje = consoleErrorSpy.mock.calls.some((c) => c[0] === 'Mensaje:' && c[1] === err.message);
      expect(loggedStack).toBe(true);
      expect(loggedMensaje).toBe(true);
    });
  });

  describe('en desarrollo (sin cambios de comportamiento)', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
    });

    test('error SIN err.statusCode propio: el mensaje crudo sigue llegando al cliente, igual que antes', () => {
      const err = new Error('relation "usuarios" column "correo_invalido" does not exist');
      const res = crearRes();

      errorHandler(err, crearReq(), res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        mensaje: 'relation "usuarios" column "correo_invalido" does not exist',
      }));
    });

    test('incluye el stack en la respuesta', () => {
      const err = new Error('algo truena');
      const res = crearRes();

      errorHandler(err, crearReq(), res, jest.fn());

      expect(res.json.mock.calls[0][0]).toHaveProperty('stack', err.stack);
    });
  });

  test('MulterError: no cambia con el entorno, mismo mensaje curado en ambos', () => {
    for (const NODE_ENV of ['production', 'development']) {
      process.env.NODE_ENV = NODE_ENV;
      const err = new Error('File too large');
      err.name = 'MulterError';
      err.code = 'LIMIT_FILE_SIZE';
      const res = crearRes();

      errorHandler(err, crearReq(), res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(413);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        mensaje: 'El archivo excede el tamaño máximo permitido.',
        codigo: 'ARCHIVO_DEMASIADO_GRANDE',
      }));
    }
  });
});
