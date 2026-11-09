// @vitest-environment jsdom
/**
 * ARCHIVO: transferencias-limites.test.js
 * PROPÓSITO: Defecto "AxiosError: timeout of 30000ms exceeded" al subir un
 *            archivo pesado. Se fija que:
 *            - las peticiones normales siguen con su límite corto (30 s);
 *            - subidas y descargas grandes NO tienen ese límite: fallan
 *              solo si dejan de avanzar (60 s), con un tope total amplio;
 *            - las operaciones de proceso largo usan 5 min;
 *            - un archivo de más de 200 MB se rechaza antes de subirlo;
 *            - cada fallo se traduce a un mensaje comprensible.
 *
 * Ejecutar: npm test (vitest)
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../client', () => ({
  default: { request: vi.fn(), post: vi.fn(), get: vi.fn(), defaults: { baseURL: '/api/v1' } },
}));

const client = (await import('../client')).default;
const limites = await import('../limites');
const { transferir, subirArchivo, mensajeDeError, conTiempoDeProceso, ERROR_SIN_AVANCE } = await import('../transferencias');
const importarApi = await import('../importar');
const evidenciasApi = await import('../evidencias');

// Simula axios: la promesa queda pendiente hasta que el test la resuelva o
// hasta que la señal se aborte (como hace axios con un AbortController).
function peticionControlable() {
  let resolver;
  let config;
  client.request.mockImplementation((c) => {
    config = c;
    return new Promise((resolve, reject) => {
      resolver = resolve;
      c.signal.addEventListener('abort', () => {
        const e = new Error('canceled');
        e.name = 'CanceledError';
        e.code = 'ERR_CANCELED';
        reject(e);
      });
    });
  });
  return {
    get config() { return config; },
    avanzar: (loaded, total) => (config.onUploadProgress || config.onDownloadProgress)({ loaded, total }),
    terminar: (data = { ok: true }) => resolver({ data }),
  };
}

beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); });
afterEach(() => vi.useRealTimers());

describe('valores por omisión', () => {
  test('normal 30 s, proceso 5 min, tope de transferencia 60 min, sin avance 60 s, máximo 200 MB', () => {
    expect(limites.TIEMPO_NORMAL_MS).toBe(30_000);
    expect(limites.TIEMPO_PROCESO_MS).toBe(300_000);
    expect(limites.TIEMPO_MAXIMO_TRANSFERENCIA_MS).toBe(3_600_000);
    expect(limites.TRANSFERENCIA_SIN_AVANCE_MS).toBe(60_000);
    expect(limites.TAMANO_MAXIMO_SUBIDA_MB).toBe(200);
  });

  test('el cliente compartido conserva el límite corto para peticiones normales', async () => {
    vi.doUnmock('../client');
    vi.resetModules();
    const real = (await import('../client')).default;
    expect(real.defaults.timeout).toBe(30_000);
  });
});

describe('subidas', () => {
  test('una subida que tarda 10 minutos pero sigue avanzando NO falla', async () => {
    const p = peticionControlable();
    const progreso = [];
    const promesa = subirArchivo('/acciones/a1/evidencias', new FormData(), { size: 150 * 1024 * 1024 }, { onProgreso: (f) => progreso.push(f) });

    expect(p.config.timeout).toBe(3_600_000);
    for (let i = 1; i <= 20; i++) {          // 20 × 30 s = 10 min
      await vi.advanceTimersByTimeAsync(30_000);
      p.avanzar(i * 5, 100);
    }
    p.terminar({ datos: { id: 'ev' } });
    await expect(promesa).resolves.toEqual({ datos: { id: 'ev' } });
    expect(progreso.at(-1)).toBe(1);
  });

  test('si deja de avanzar 60 s se aborta con un mensaje que lo dice', async () => {
    peticionControlable();
    const promesa = subirArchivo('/acciones/a1/evidencias', new FormData(), { size: 10 });
    const verificacion = expect(promesa).rejects.toMatchObject({ code: ERROR_SIN_AVANCE });
    await vi.advanceTimersByTimeAsync(60_001);
    await verificacion;
    const err = await promesa.catch((e) => e);
    expect(mensajeDeError(err)).toMatch(/dejó de avanzar durante más de 60 segundos/);
  });

  test('al llegar al 100 % el vigilante se apaga: el servidor puede tardar en guardar', async () => {
    const p = peticionControlable();
    const promesa = subirArchivo('/acciones/a1/evidencias', new FormData(), { size: 10 });
    p.avanzar(100, 100);
    await vi.advanceTimersByTimeAsync(120_000);
    p.terminar();
    await expect(promesa).resolves.toEqual({ ok: true });
  });

  test('más de 200 MB se rechaza antes de mandar un solo byte', async () => {
    const promesa = subirArchivo('/x', new FormData(), { size: 201 * 1024 * 1024 });
    await expect(promesa).rejects.toMatchObject({ code: 'PSPP_ARCHIVO_DEMASIADO_GRANDE' });
    expect(client.request).not.toHaveBeenCalled();
    expect(mensajeDeError(await promesa.catch((e) => e))).toMatch(/más de 200 MB/);
  });

  test('las funciones de evidencias suben por aquí (sin el límite de 30 s)', async () => {
    const p = peticionControlable();
    const promesa = evidenciasApi.subirEvidenciaAccion('a1', { size: 5, name: 'audio.mp3' }, { categoria: 'Audio' });
    expect(p.config).toMatchObject({ method: 'post', url: '/acciones/a1/evidencias', timeout: 3_600_000 });
    p.terminar();
    await promesa;
  });

  test('cancelación externa (cerrar el modal) no se confunde con "sin avance"', async () => {
    peticionControlable();
    const ctrl = new AbortController();
    const promesa = transferir({ method: 'post', url: '/x' }, { signal: ctrl.signal });
    ctrl.abort();
    const err = await promesa.catch((e) => e);
    expect(err.code).toBe('ERR_CANCELED');
    expect(mensajeDeError(err)).toBe('La operación se canceló.');
  });
});

describe('operaciones de proceso largo', () => {
  test('confirmar una importación usa 5 min', async () => {
    client.post.mockResolvedValue({ data: {} });
    await importarApi.confirmar({ fileId: 'f', config: {}, proyectoId: 'p' });
    expect(client.post.mock.calls[0][2]).toEqual({ timeout: 300_000 });
    expect(conTiempoDeProceso({ params: { a: 1 } })).toEqual({ params: { a: 1 }, timeout: 300_000 });
  });
});

describe('mensajeDeError', () => {
  test.each([
    [{ code: 'ECONNABORTED', message: 'timeout of 30000ms exceeded', config: { timeout: 30000 } }, /tardó más de 30 segundos/],
    [{ code: 'ECONNABORTED', message: 'timeout of 300000ms exceeded', config: { timeout: 300000 } }, /tardó más de 5 minutos/],
    [{ message: 'Network Error' }, /Se perdió la conexión/],
    [{ response: { status: 413, data: '<html>413</html>' } }, /tamaño máximo .*200 MB/],
    [{ response: { status: 504, data: '' } }, /tardó demasiado en responder/],
    [{ response: { status: 408, data: '' } }, /cortó la petición/],
    [{ response: { status: 502, data: '' } }, /no está disponible/],
    [{ response: { status: 400, data: { mensaje: 'Formato no soportado' } } }, /^Formato no soportado$/],
  ])('%#', (err, esperado) => {
    expect(mensajeDeError(err, 'por omisión')).toMatch(esperado);
  });

  test('sin nada reconocible usa el texto por omisión', () => {
    expect(mensajeDeError({ response: { status: 500, data: {} } }, 'No se pudo.')).toBe('No se pudo.');
  });
});
