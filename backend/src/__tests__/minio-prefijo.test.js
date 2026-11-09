/**
 * ARCHIVO: minio-prefijo.test.js
 * PROPÓSITO: MINIO_PREFIX (utils/minio.js). La DGTIC da un solo bucket por
 *            proyecto y separa QA de producción con un prefijo dentro de
 *            él. Se prueba que el prefijo se antepone a TODA operación
 *            (escribir, leer, copiar, borrar) y que vacío o ausente la
 *            clave queda idéntica, para no romper lo ya almacenado.
 *
 * Ejecutar: npm test
 */
const mockCliente = {
  putObject: jest.fn().mockResolvedValue({}),
  statObject: jest.fn().mockResolvedValue({}),
  getObject: jest.fn().mockResolvedValue({}),
  getPartialObject: jest.fn().mockResolvedValue({}),
  removeObject: jest.fn().mockResolvedValue({}),
  copyObject: jest.fn().mockResolvedValue({}),
};
jest.mock('minio', () => ({ Client: jest.fn().mockImplementation(() => mockCliente) }));

const ENV_ORIGINAL = { ...process.env };

function cargarConPrefijo(prefijo) {
  let modulo;
  jest.isolateModules(() => {
    process.env = { ...ENV_ORIGINAL, MINIO_BUCKET: 'bucket-sedatu' };
    if (prefijo !== undefined) process.env.MINIO_PREFIX = prefijo;
    else delete process.env.MINIO_PREFIX;
    modulo = require('../utils/minio');
  });
  return modulo;
}

afterEach(() => {
  process.env = { ...ENV_ORIGINAL };
  jest.clearAllMocks();
});

describe('normalizarPrefijo', () => {
  const { normalizarPrefijo } = cargarConPrefijo(undefined);
  test.each([
    [undefined, ''],
    ['', ''],
    ['   ', ''],
    ['/', ''],
    ['qa', 'qa/'],
    ['/qa/', 'qa/'],
    ['qa//', 'qa/'],
    ['pspp/qa', 'pspp/qa/'],
    ['pspp//prod/', 'pspp/prod/'],
  ])('%p → %p', (entrada, esperado) => {
    expect(normalizarPrefijo(entrada)).toBe(esperado);
  });

  test('rechaza ".." para no salirse del espacio del ambiente', () => {
    expect(() => normalizarPrefijo('qa/../prod')).toThrow(/MINIO_PREFIX/);
  });
});

describe('sin MINIO_PREFIX: comportamiento idéntico al anterior', () => {
  test.each([undefined, ''])('MINIO_PREFIX=%p no altera ninguna clave', async (valor) => {
    const { almacen, PREFIJO } = cargarConPrefijo(valor);
    expect(PREFIJO).toBe('');
    await almacen.putObject('evidencias/acciones/1/a.pdf', 'x', 1, {});
    await almacen.getObject('evidencias/acciones/1/a.pdf');
    await almacen.removeObject('evidencias/acciones/1/a.pdf');
    await almacen.copyObject('nuevo/a.pdf', 'evidencias/acciones/1/a.pdf');
    expect(mockCliente.putObject).toHaveBeenCalledWith('bucket-sedatu', 'evidencias/acciones/1/a.pdf', 'x', 1, {});
    expect(mockCliente.getObject).toHaveBeenCalledWith('bucket-sedatu', 'evidencias/acciones/1/a.pdf');
    expect(mockCliente.removeObject).toHaveBeenCalledWith('bucket-sedatu', 'evidencias/acciones/1/a.pdf');
    // Mismo formato de origen que usaba duplicar.queries.js antes del cambio.
    expect(mockCliente.copyObject).toHaveBeenCalledWith('bucket-sedatu', 'nuevo/a.pdf', '/bucket-sedatu/evidencias/acciones/1/a.pdf');
  });
});

describe('con MINIO_PREFIX=qa', () => {
  test('se antepone al escribir, leer (completo y parcial), consultar, copiar y borrar', async () => {
    const { almacen } = cargarConPrefijo('qa');
    const clave = 'evidencias/etapas/7/plano.zip';
    await almacen.putObject(clave, 'x', 1, {});
    await almacen.statObject(clave);
    await almacen.getObject(clave);
    await almacen.getPartialObject(clave, 10, 20);
    await almacen.removeObject(clave);
    await almacen.copyObject('p2/copia.zip', clave);

    expect(mockCliente.putObject).toHaveBeenCalledWith('bucket-sedatu', 'qa/evidencias/etapas/7/plano.zip', 'x', 1, {});
    expect(mockCliente.statObject).toHaveBeenCalledWith('bucket-sedatu', 'qa/evidencias/etapas/7/plano.zip');
    expect(mockCliente.getObject).toHaveBeenCalledWith('bucket-sedatu', 'qa/evidencias/etapas/7/plano.zip');
    expect(mockCliente.getPartialObject).toHaveBeenCalledWith('bucket-sedatu', 'qa/evidencias/etapas/7/plano.zip', 10, 20);
    expect(mockCliente.removeObject).toHaveBeenCalledWith('bucket-sedatu', 'qa/evidencias/etapas/7/plano.zip');
    expect(mockCliente.copyObject).toHaveBeenCalledWith('bucket-sedatu', 'qa/p2/copia.zip', '/bucket-sedatu/qa/evidencias/etapas/7/plano.zip');
  });

  test('una clave con "/" inicial no produce doble barra', () => {
    const { claveFisica } = cargarConPrefijo('qa');
    expect(claveFisica('/evidencias/a.pdf')).toBe('qa/evidencias/a.pdf');
  });

  test('clave vacía truena en vez de operar sobre la raíz del prefijo', () => {
    const { claveFisica } = cargarConPrefijo('qa');
    expect(() => claveFisica('')).toThrow();
    expect(() => claveFisica(null)).toThrow();
  });
});

test('ningún controller ni query usa el cliente crudo para operar sobre claves', () => {
  // El cliente crudo no conoce el prefijo: si alguien vuelve a llamarlo
  // directo, ese código leería/escribiría fuera del espacio del ambiente.
  const fs = require('fs');
  const path = require('path');
  const raiz = path.join(__dirname, '..');
  const archivos = [];
  (function recorrer(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== '__tests__') recorrer(p); } else if (p.endsWith('.js')) archivos.push(p);
    }
  })(raiz);
  const infractores = archivos
    .filter((p) => !p.endsWith(path.join('utils', 'minio.js')))
    .filter((p) => /minioClient\.(putObject|getObject|getPartialObject|statObject|removeObject|copyObject|fPutObject|fGetObject|presigned)/.test(fs.readFileSync(p, 'utf8'))
      || /new\s+MinioClient|require\(['"]minio['"]\)/.test(fs.readFileSync(p, 'utf8')));
  expect(infractores.map((p) => path.relative(raiz, p))).toEqual([]);
});
