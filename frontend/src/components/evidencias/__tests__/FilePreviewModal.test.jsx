// @vitest-environment jsdom
/**
 * ARCHIVO: FilePreviewModal.test.jsx
 * PROPÓSITO: La vista previa de PDF sigue funcionando sin poner ninguna
 *            credencial en la URL que abre el visor: el contenido llega
 *            por la API con la cabecera de sesión y el <iframe> recibe una
 *            URL blob: local, que no caduca mientras el visor carga.
 *            "Descargar" pide el boleto efímero solo al hacer clic.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/react';

vi.mock('../../../api/archivos', () => ({
  obtenerContenido: vi.fn(),
  descargar: vi.fn(),
  fuenteEvidencia: (id) => ({ tipo: 'evidencia', id }),
  fuenteActividad: (id) => ({ tipo: 'actividad', id }),
}));
const mockToast = vi.fn();
vi.mock('../../../context/UIContext', () => ({ useUI: () => ({ mostrarToast: mockToast }) }));

const archivosApi = await import('../../../api/archivos');
const { default: FilePreviewModal } = await import('../FilePreviewModal');

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:http://app/1234');
  globalThis.URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);

const PDF = { id: 'ev-1', nombre_original: 'informe.pdf', tipo_medio: 'archivo' };

describe('vista previa de PDF', () => {
  test('carga por la API con cabecera y el iframe recibe una URL blob:, sin token ni boleto', async () => {
    archivosApi.obtenerContenido.mockResolvedValue(new Blob(['%PDF-1.7'], { type: 'application/octet-stream' }));
    const { container } = render(<FilePreviewModal evidencia={PDF} onClose={() => {}} />);

    await waitFor(() => expect(container.ownerDocument.querySelector('iframe')).not.toBeNull());
    const iframe = container.ownerDocument.querySelector('iframe');
    expect(iframe.getAttribute('src')).toBe('blob:http://app/1234');
    expect(archivosApi.obtenerContenido).toHaveBeenCalledWith({ tipo: 'evidencia', id: 'ev-1' }, expect.any(Object));
    // El blob se entrega al visor como PDF aunque el servidor dijera otra cosa.
    expect(URL.createObjectURL.mock.calls[0][0].type).toBe('application/pdf');
    // Abrir la vista previa no gasta un boleto de descarga.
    expect(archivosApi.descargar).not.toHaveBeenCalled();
  });

  test('adjunto de tarea: usa la fuente "actividad" que le pasan', async () => {
    archivosApi.obtenerContenido.mockResolvedValue(new Blob(['%PDF']));
    render(<FilePreviewModal evidencia={{ ...PDF, id: 'a-7' }} fuente={{ tipo: 'actividad', id: 'a-7' }} onClose={() => {}} />);
    await waitFor(() => expect(archivosApi.obtenerContenido).toHaveBeenCalled());
    expect(archivosApi.obtenerContenido.mock.calls[0][0]).toEqual({ tipo: 'actividad', id: 'a-7' });
  });

  test('al cerrar se libera la URL blob:', async () => {
    archivosApi.obtenerContenido.mockResolvedValue(new Blob(['%PDF']));
    const { unmount, container } = render(<FilePreviewModal evidencia={PDF} onClose={() => {}} />);
    await waitFor(() => expect(container.ownerDocument.querySelector('iframe')).not.toBeNull());
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:http://app/1234');
  });

  test('archivo que ya no está (404) → mensaje, no un visor roto', async () => {
    archivosApi.obtenerContenido.mockRejectedValue({ response: { status: 404 } });
    const { findByText } = render(<FilePreviewModal evidencia={PDF} onClose={() => {}} />);
    expect(await findByText(/ya no está disponible/)).toBeInTheDocument();
  });
});

describe('descargar', () => {
  test('el botón pide el boleto en ese momento, con la fuente del archivo', async () => {
    archivosApi.obtenerContenido.mockResolvedValue(new Blob(['%PDF']));
    archivosApi.descargar.mockResolvedValue();
    const { getAllByText } = render(<FilePreviewModal evidencia={PDF} onClose={() => {}} />);
    fireEvent.click(getAllByText('Descargar')[0]);
    await waitFor(() => expect(archivosApi.descargar).toHaveBeenCalledWith({ tipo: 'evidencia', id: 'ev-1' }));
  });

  test('si falla, avisa con un toast', async () => {
    archivosApi.obtenerContenido.mockResolvedValue(new Blob(['%PDF']));
    archivosApi.descargar.mockRejectedValue({ response: { status: 403 } });
    const { getAllByText } = render(<FilePreviewModal evidencia={PDF} onClose={() => {}} />);
    fireEvent.click(getAllByText('Descargar')[0]);
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('No tienes acceso a este archivo.', 'error'));
  });
});

describe('texto', () => {
  test('se pide solo el principio (Range) y se muestra en <pre>, sin iframe', async () => {
    // jsdom no implementa Blob.text() (los navegadores sí): blob simulado.
    archivosApi.obtenerContenido.mockResolvedValue({ size: 13, text: async () => 'col1,col2\n1,2' });
    const { findByText, container } = render(<FilePreviewModal evidencia={{ id: 'ev-2', nombre_original: 'datos.csv', tipo_medio: 'archivo' }} onClose={() => {}} />);
    expect(await findByText(/col1,col2/)).toBeInTheDocument();
    expect(archivosApi.obtenerContenido.mock.calls[0][1].rango).toEqual([0, 2 * 1024 * 1024 - 1]);
    expect(container.ownerDocument.querySelector('iframe')).toBeNull();
  });
});

test('link externo: no toca la API de archivos', () => {
  render(<FilePreviewModal evidencia={{ id: 'l-1', tipo_medio: 'link', url: 'https://ejemplo.org/doc' }} onClose={() => {}} />);
  expect(archivosApi.obtenerContenido).not.toHaveBeenCalled();
});
