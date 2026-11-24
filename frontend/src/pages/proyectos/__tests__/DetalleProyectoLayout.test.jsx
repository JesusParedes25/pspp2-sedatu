// @vitest-environment jsdom
/**
 * ARCHIVO: DetalleProyectoLayout.test.jsx
 * PROPÓSITO: paso 12 DGTIC — la visibilidad de proyecto ahora también
 *            restringe la lectura, lo que significa que abrir un
 *            proyecto sin acceso ya no debe disparar la ráfaga de 403
 *            de cada sección (Seguimiento, Resumen, Bitácora...). Fija
 *            el contrato de la capa que evita eso:
 *            1. Mientras la carga de etapas no resuelve (éxito o 403),
 *               se muestra el esqueleto — nunca el contenido ni el
 *               <Outlet> de la sección activa.
 *            2. Si la carga de etapas resuelve con 403/NO_AUTORIZADO,
 *               se muestra SinAccesoProyecto en vez del encabezado y el
 *               <Outlet> — ninguna sección hija llega a montarse ni a
 *               pedir su propio contenido.
 *            3. En el caso normal (con acceso), todo sigue como antes:
 *               encabezado + barra de secciones + <Outlet>.
 *
 * Los hooks de datos (useProyecto/useEtapas/usePermisosProyecto) se
 * mockean para controlar exactamente el estado bajo prueba sin depender
 * de axios ni del backend — igual que router/__tests__/index.test.jsx
 * mockea sus propias dependencias para aislar la decisión de ruteo.
 * SinAccesoProyecto se mockea para probar SOLO la decisión de esta capa
 * (qué se renderiza); su propio contrato visual ya lo cubre
 * SinAccesoProyecto.test.jsx.
 */
import { describe, test, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import DetalleProyectoLayout from '../DetalleProyectoLayout';

afterEach(cleanup);

// El encabezado compacto usa IntersectionObserver (jsdom no lo trae) —
// no es parte de lo que esta prueba evalúa, solo necesita montar sin
// tronar.
global.IntersectionObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const mockUseProyecto = vi.fn();
const mockUseEtapas = vi.fn();

vi.mock('../../../hooks/useProyectos', () => ({
  useProyecto: (...args) => mockUseProyecto(...args),
}));
vi.mock('../../../hooks/useEtapas', () => ({
  useEtapas: (...args) => mockUseEtapas(...args),
}));
vi.mock('../../../hooks/usePermisos', () => ({
  usePermisosProyecto: () => ({
    puedeEditar: false, puedeEliminar: false, esSoloLectura: true,
    capturaParcial: false, puedeInvitar: false, puedeEditarNodo: () => false,
  }),
}));
vi.mock('../../../context/UIContext', () => ({
  useUI: () => ({ mostrarToast: vi.fn(), sidebarAbierto: true }),
}));
// ChipFuncion (parte del encabezado normal, siempre presente) necesita
// AuthContext — no es lo que esta prueba evalúa, se mockea igual que los
// demás hooks de datos para aislar la decisión de esta capa.
vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ usuario: { id: 'u-1', rol: 'enlace' } }),
}));
vi.mock('../../../components/proyectos/SinAccesoProyecto', () => ({
  default: ({ proyecto }) => <div>SIN_ACCESO_STUB:{proyecto?.nombre}</div>,
}));

const PROYECTO = { id: 'p-1', nombre: 'Catastro Nacional', dg_lider_siglas: 'DGOTU' };

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/proyectos/p-1']}>
      <Routes>
        <Route path="proyectos/:id" element={<DetalleProyectoLayout />}>
          <Route index element={<div>SECCION_ACTIVA_STUB</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('DetalleProyectoLayout — paso 12 DGTIC', () => {
  test('mientras la carga de etapas no resuelve, muestra el esqueleto y no monta la sección activa', () => {
    mockUseProyecto.mockReturnValue({ proyecto: PROYECTO, cargando: false, error: null, recargar: vi.fn(), recargarSilencioso: vi.fn() });
    mockUseEtapas.mockReturnValue({ etapas: [], cargando: true, errorCodigo: null, recargar: vi.fn(), recargarSilencioso: vi.fn() });

    renderLayout();

    expect(screen.queryByText('SECCION_ACTIVA_STUB')).not.toBeInTheDocument();
    expect(screen.queryByText(/SIN_ACCESO_STUB/)).not.toBeInTheDocument();
    expect(screen.queryByText('Catastro Nacional')).not.toBeInTheDocument();
  });

  test('con 403/NO_AUTORIZADO en etapas, muestra SinAccesoProyecto y no monta la sección activa ni la barra de secciones', () => {
    mockUseProyecto.mockReturnValue({ proyecto: PROYECTO, cargando: false, error: null, recargar: vi.fn(), recargarSilencioso: vi.fn() });
    mockUseEtapas.mockReturnValue({ etapas: [], cargando: false, errorCodigo: 'NO_AUTORIZADO', recargar: vi.fn(), recargarSilencioso: vi.fn() });

    renderLayout();

    expect(screen.getByText('SIN_ACCESO_STUB:Catastro Nacional')).toBeInTheDocument();
    expect(screen.queryByText('SECCION_ACTIVA_STUB')).not.toBeInTheDocument();
    expect(screen.queryByText('Seguimiento')).not.toBeInTheDocument();
    expect(screen.queryByText('Bitácora')).not.toBeInTheDocument();
  });

  test('con acceso (etapas resuelve sin error), muestra el encabezado, la barra de secciones y la sección activa', () => {
    mockUseProyecto.mockReturnValue({ proyecto: PROYECTO, cargando: false, error: null, recargar: vi.fn(), recargarSilencioso: vi.fn() });
    mockUseEtapas.mockReturnValue({ etapas: [], cargando: false, errorCodigo: null, recargar: vi.fn(), recargarSilencioso: vi.fn() });

    renderLayout();

    expect(screen.getByText('SECCION_ACTIVA_STUB')).toBeInTheDocument();
    expect(screen.queryByText(/SIN_ACCESO_STUB/)).not.toBeInTheDocument();
    expect(screen.getAllByText('Catastro Nacional').length).toBeGreaterThan(0);
  });

  test('un error distinto de NO_AUTORIZADO en etapas no activa la pantalla de sin acceso (sigue mostrando la sección activa)', () => {
    mockUseProyecto.mockReturnValue({ proyecto: PROYECTO, cargando: false, error: null, recargar: vi.fn(), recargarSilencioso: vi.fn() });
    mockUseEtapas.mockReturnValue({ etapas: [], cargando: false, errorCodigo: null, error: 'Error de red', recargar: vi.fn(), recargarSilencioso: vi.fn() });

    renderLayout();

    expect(screen.queryByText(/SIN_ACCESO_STUB/)).not.toBeInTheDocument();
    expect(screen.getByText('SECCION_ACTIVA_STUB')).toBeInTheDocument();
  });
});
