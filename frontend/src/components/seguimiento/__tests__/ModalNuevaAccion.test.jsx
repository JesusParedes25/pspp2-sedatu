// @vitest-environment jsdom
/**
 * ARCHIVO: ModalNuevaAccion.test.jsx
 * PROPÓSITO: Prueba (a) del bloque "El modal de captura, y cierre de lo
 *            pendiente" — crear una acción con SOLO el nombre tiene que
 *            funcionar de punta a punta: el botón "Crear acción" no debe
 *            quedar deshabilitado por falta de fechas (bloque 2.1), y el
 *            payload que sale hacia el backend no debe traer ni "tipo"
 *            (bloque 1.1) ni una "fecha_fin" propia (bloque 2.3 — el
 *            backend es quien la espeja desde fecha_limite).
 *
 * La otra mitad de la prueba (a) — que un nodo sin fecha se dibuje gris —
 * ya está cubierta exhaustivamente en
 * backend/src/__tests__/calcularSemaforo.test.js
 * ("En proceso sin fecha -> gris", "usa fecha_fin cuando no hay
 * fecha_limite" con null/null -> gris): un nodo creado por este modal sin
 * ninguna fecha llega exactamente a ese caso.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import ModalNuevaAccion from '../ModalNuevaAccion';

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ usuario: { id: 'u1', id_dg: '', id_direccion_area: '' } }),
}));
vi.mock('../../../context/UIContext', () => ({
  useUI: () => ({ mostrarToast: vi.fn() }),
}));
vi.mock('../../../api/catalogos', () => ({
  obtenerDGs: vi.fn().mockResolvedValue({ datos: [] }),
  obtenerDireccionesArea: vi.fn().mockResolvedValue({ datos: [] }),
  obtenerUsuarios: vi.fn().mockResolvedValue({ datos: [] }),
  obtenerValoresCatalogo: vi.fn().mockResolvedValue({ datos: [] }),
}));
vi.mock('../../../api/etapas', () => ({
  obtenerIndicadoresEtapa: vi.fn().mockResolvedValue({ datos: [] }),
}));
vi.mock('../../../api/indicadores', () => ({
  obtenerIndicadoresProyecto: vi.fn().mockResolvedValue({ datos: [] }),
  obtenerResumenAportaciones: vi.fn().mockResolvedValue({ datos: {} }),
}));
const crearAccionEnEtapaMock = vi.fn().mockResolvedValue({ datos: { id: 'a1', nombre: 'Acción solo con nombre' } });
vi.mock('../../../api/acciones', () => ({
  crearAccionEnEtapa: (...args) => crearAccionEnEtapaMock(...args),
  crearAccionEnProyecto: vi.fn(),
}));
vi.mock('../../../api/evidencias', () => ({
  subirEvidenciaAccion: vi.fn(),
  registrarLinkAccion: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ModalNuevaAccion — bloque 2.1 (solo Nombre es obligatorio)', () => {
  it('crea la acción con solo el nombre: el botón no queda deshabilitado y el payload no manda tipo ni fecha_fin', async () => {
    render(<ModalNuevaAccion etapaId="e1" proyectoId={null} onCreado={() => {}} onCerrar={() => {}} />);

    const nombreInput = screen.getByPlaceholderText('Ej: Procesar datos INEGI de la ZM Guadalajara');
    fireEvent.change(nombreInput, { target: { value: 'Acción solo con nombre' } });

    const botonCrear = screen.getByRole('button', { name: /crear acción/i });
    expect(botonCrear).not.toBeDisabled();

    fireEvent.click(botonCrear);

    await waitFor(() => expect(crearAccionEnEtapaMock).toHaveBeenCalledTimes(1));
    const [etapaId, payload] = crearAccionEnEtapaMock.mock.calls[0];
    expect(etapaId).toBe('e1');
    expect(payload.nombre).toBe('Acción solo con nombre');
    expect(payload).not.toHaveProperty('tipo');
    expect(payload).not.toHaveProperty('fecha_fin');
    expect(payload.fecha_inicio).toBe('');
    expect(payload.fecha_limite).toBe('');
    expect(payload).not.toHaveProperty('instancia_responsable');
    expect(payload).not.toHaveProperty('enlace_responsable');
  });

  it('no pide ninguna fecha para poder enviar el formulario', () => {
    render(<ModalNuevaAccion etapaId="e1" proyectoId={null} onCreado={() => {}} onCerrar={() => {}} />);
    // createPortal monta en document.body, fuera del container local de
    // render() — por eso se consulta el documento completo.
    const camposFecha = document.querySelectorAll('input[type="date"]');
    // Antes del cambio: "Fecha inicio" y "Fecha fin", ambas required — el
    // bloque 2.3 las reduce a dos ("Fecha de inicio"/"Fecha límite"),
    // ninguna obligatoria (bloque 2.1).
    expect(camposFecha).toHaveLength(2);
    camposFecha.forEach(campo => expect(campo).not.toBeRequired());
  });

  it('"Más detalles" empieza plegado y no pide Instancia/Enlace responsable en ningún lado', () => {
    render(<ModalNuevaAccion etapaId="e1" proyectoId={null} onCreado={() => {}} onCerrar={() => {}} />);
    expect(screen.queryByText(/Instancia responsable/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Enlace responsable/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Descripción/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /más detalles/i }));
    expect(screen.getByText(/Descripción/i)).toBeInTheDocument();
    // Siguen sin aparecer aunque se despliegue "Más detalles" — se
    // quitaron del formulario, no solo se escondieron (bloque 2.5).
    expect(screen.queryByText(/Instancia responsable/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Enlace responsable/i)).not.toBeInTheDocument();
  });
});
