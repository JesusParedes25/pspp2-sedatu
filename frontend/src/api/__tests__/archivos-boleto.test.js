// @vitest-environment jsdom
/**
 * ARCHIVO: archivos-boleto.test.js
 * PROPÓSITO: api/archivos.js. Que ninguna URL de archivo lleve el token de
 *            sesión: la vista previa se pide con la cabecera (axios), y la
 *            descarga usa un boleto efímero pedido justo antes.
 *
 * Ejecutar: npm test (vitest)
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../client', () => ({
  default: { post: vi.fn(), get: vi.fn(), request: vi.fn(), defaults: { baseURL: '/pspp/api/v1' } },
}));

const client = (await import('../client')).default;
const archivosApi = await import('../archivos');

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem('pspp_token', 'JWT-DE-SESION');
});
afterEach(() => localStorage.clear());

describe('obtenerUrlConBoleto', () => {
  test('pide el boleto por POST (cabecera vía axios) y arma la URL con la base de la API', async () => {
    client.post.mockResolvedValue({ data: { datos: { ruta: '/evidencias/ev-1/descargar?boleto=B0L', boleto: 'B0L' } } });
    const url = await archivosApi.obtenerUrlConBoleto(archivosApi.fuenteEvidencia('ev-1'), 'descargar');
    expect(client.post).toHaveBeenCalledWith('/evidencias/ev-1/boleto', { accion: 'descargar' });
    expect(url).toBe('/pspp/api/v1/evidencias/ev-1/descargar?boleto=B0L');
    expect(url).not.toContain('JWT-DE-SESION');
    expect(url).not.toContain('token=');
  });

  test('adjuntos de tarea usan /actividad', async () => {
    client.post.mockResolvedValue({ data: { datos: { ruta: '/actividad/a-1/ver?boleto=X' } } });
    await archivosApi.obtenerUrlConBoleto(archivosApi.fuenteActividad('a-1'), 'ver');
    expect(client.post).toHaveBeenCalledWith('/actividad/a-1/boleto', { accion: 'ver' });
  });
});

describe('obtenerContenido (vista previa)', () => {
  test('GET /ver con axios (lleva la cabecera), como blob, sin nada en la query ni límite de 30 s', async () => {
    const blob = new Blob(['%PDF']);
    client.request.mockResolvedValue({ data: blob });
    const r = await archivosApi.obtenerContenido(archivosApi.fuenteEvidencia('ev-1'));
    expect(r).toBe(blob);
    const [config] = client.request.mock.calls[0];
    expect(config.method).toBe('get');
    expect(config.url).toBe('/evidencias/ev-1/ver');
    expect(config.responseType).toBe('blob');
    expect(config.params).toBeUndefined();
    // Transferencia: tope amplio + vigilante de "sin avance", no 30 s.
    expect(config.timeout).toBe(3_600_000);
    expect(typeof config.onDownloadProgress).toBe('function');
  });

  test('rango opcional → cabecera Range', async () => {
    client.request.mockResolvedValue({ data: new Blob(['a']) });
    await archivosApi.obtenerContenido(archivosApi.fuenteEvidencia('ev-1'), { rango: [0, 99] });
    expect(client.request.mock.calls[0][0].headers).toEqual({ Range: 'bytes=0-99' });
  });
});

describe('descargar', () => {
  test('pide boleto de "descargar" y hace clic en un <a download> con esa URL', async () => {
    client.post.mockResolvedValue({ data: { datos: { ruta: '/evidencias/ev-9/descargar?boleto=XYZ' } } });
    const clics = [];
    const original = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { clics.push({ href: this.getAttribute('href'), download: this.hasAttribute('download') }); };
    try {
      await archivosApi.descargar(archivosApi.fuenteEvidencia('ev-9'));
    } finally {
      HTMLAnchorElement.prototype.click = original;
    }
    expect(client.post).toHaveBeenCalledWith('/evidencias/ev-9/boleto', { accion: 'descargar' });
    expect(clics).toEqual([{ href: '/pspp/api/v1/evidencias/ev-9/descargar?boleto=XYZ', download: true }]);
    expect(document.querySelectorAll('a[download]').length).toBe(0); // no deja el <a> en el DOM
  });

  test('fuente inválida truena antes de llamar a la red', async () => {
    await expect(archivosApi.descargar({ tipo: 'otra', id: 'x' })).rejects.toThrow();
    expect(client.post).not.toHaveBeenCalled();
  });
});
