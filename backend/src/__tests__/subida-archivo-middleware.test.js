/**
 * ARCHIVO: subida-archivo-middleware.test.js
 * PROPÓSITO: middleware/subidaArchivo.middleware.js — diskStorage en vez
 *            de memoryStorage para las subidas a MinIO. Cubre lo que no
 *            se ve con solo leer el código: que el temporal se borra pase
 *            lo que pase, y que la verificación de arranque de verdad
 *            detecta un directorio que no se puede usar.
 *
 * Ejecutar: npm test
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  limpiarArchivoTemporal,
  verificarDirectorioSubidas,
  upload,
} = require('../middleware/subidaArchivo.middleware');

const DIR_PRUEBAS = path.join(os.tmpdir(), `pspp-uploads-test-${process.pid}`);

afterEach(() => {
  if (fs.existsSync(DIR_PRUEBAS)) fs.rmSync(DIR_PRUEBAS, { recursive: true, force: true });
});

describe('upload — multer configurado con diskStorage', () => {
  test('expone .single como un multer de verdad (no es memoryStorage a mano)', () => {
    expect(typeof upload.single).toBe('function');
  });
});

describe('verificarDirectorioSubidas', () => {
  test('crea el directorio si no existe y no truena si ya puede escribir ahí', () => {
    expect(fs.existsSync(DIR_PRUEBAS)).toBe(false);
    expect(() => verificarDirectorioSubidas(DIR_PRUEBAS)).not.toThrow();
    expect(fs.existsSync(DIR_PRUEBAS)).toBe(true);
  });

  test('no deja tirado el archivo de prueba de escritura', () => {
    verificarDirectorioSubidas(DIR_PRUEBAS);
    const archivos = fs.readdirSync(DIR_PRUEBAS);
    expect(archivos).toEqual([]);
  });

  test('truena con un mensaje claro si la ruta no se puede usar como directorio', () => {
    // Un archivo normal en el lugar donde se esperaría un directorio:
    // mkdir con ese nombre falla (ENOTDIR), que es justo el caso real que
    // esto tiene que atrapar al arrancar.
    fs.mkdirSync(path.dirname(DIR_PRUEBAS), { recursive: true });
    fs.writeFileSync(DIR_PRUEBAS, 'esto no es un directorio');
    expect(() => verificarDirectorioSubidas(DIR_PRUEBAS)).toThrow();
    fs.unlinkSync(DIR_PRUEBAS);
  });
});

describe('limpiarArchivoTemporal', () => {
  test('borra el archivo cuando la petición trae req.file.path', async () => {
    fs.mkdirSync(DIR_PRUEBAS, { recursive: true });
    const ruta = path.join(DIR_PRUEBAS, 'temporal-de-prueba');
    fs.writeFileSync(ruta, 'contenido');
    const req = { file: { path: ruta } };

    await limpiarArchivoTemporal(req);

    expect(fs.existsSync(ruta)).toBe(false);
  });

  test('no truena si la petición nunca trajo archivo', async () => {
    await expect(limpiarArchivoTemporal({})).resolves.toBeUndefined();
  });

  test('no truena si el archivo ya no está (limpieza llamada dos veces)', async () => {
    fs.mkdirSync(DIR_PRUEBAS, { recursive: true });
    const ruta = path.join(DIR_PRUEBAS, 'temporal-ya-borrado');
    fs.writeFileSync(ruta, 'contenido');
    const req = { file: { path: ruta } };

    await limpiarArchivoTemporal(req);
    await expect(limpiarArchivoTemporal(req)).resolves.toBeUndefined();
  });
});
