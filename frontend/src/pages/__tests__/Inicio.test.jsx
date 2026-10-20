// @vitest-environment jsdom
/**
 * ARCHIVO: Inicio.test.jsx
 * PROPÓSITO: "PSPP v2.0 · Pantalla de Inicio" — el concentrador nuevo en
 *            la ruta raíz.
 *
 *   - Bloque 3.2: la tarjeta "Nuevo proyecto" se gatea por
 *     puedeCrearProyecto, no solo se oculta visualmente.
 *   - Bloque 3: cada tarjeta muestra el dato real que devuelve
 *     GET /inicio/resumen-tarjetas (y la de Notificaciones, el conteo ya
 *     calculado que Layout expone por Outlet context).
 *   - Bloque 4.1: la sección "Cómo funciona el seguimiento" abre la
 *     primera vez (sin preferencia guardada) y queda cerrada después
 *     (con preferencia '0' ya guardada) — el caso que, sin el
 *     inicializador de useState a prueba de la doble invocación de
 *     React.StrictMode, se veía siempre cerrado incluso en la primera
 *     visita real (ver DiagramaJerarquia.jsx / Inicio.jsx para el porqué).
 *   - Bloque 4.2: el texto numerado es EXACTO, palabra por palabra, al
 *     que especifica el encargo — no una paráfrasis.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Inicio from '../Inicio';

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ usuario: { id: 'u1', nombre_completo: 'Ana López' } }),
}));

const puedeCrearProyectoMock = vi.fn();
vi.mock('../../hooks/usePermisos', () => ({
  usePermisosGlobales: () => ({ puedeCrearProyecto: puedeCrearProyectoMock() }),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, useOutletContext: () => ({ notificacionesSinLeer: 4 }) };
});

const RESUMEN = {
  proyectos_visibles: 12,
  proyectos_sigue: 5,
  indicadores_visibles: 8,
  estados_con_actividad: 3,
  mis_actividades_total: 7,
  mis_actividades_vencidas: 2,
};
const obtenerResumenTarjetasInicioMock = vi.fn();
vi.mock('../../api/inicio', () => ({
  obtenerResumenTarjetasInicio: (...args) => obtenerResumenTarjetasInicioMock(...args),
}));

function renderInicio() {
  return render(<MemoryRouter><Inicio /></MemoryRouter>);
}

beforeEach(() => {
  localStorage.clear();
  obtenerResumenTarjetasInicioMock.mockResolvedValue(RESUMEN);
  puedeCrearProyectoMock.mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Inicio — bloque 3 (tarjetas de acceso, datos reales y gateo por permiso)', () => {
  it('con permiso de crear proyectos, la tarjeta "Nuevo proyecto" sí se renderiza', async () => {
    puedeCrearProyectoMock.mockReturnValue(true);
    renderInicio();
    expect(await screen.findByText('Da de alta un proyecto y define sus etapas')).toBeInTheDocument();
  });

  it('sin permiso de crear proyectos, la tarjeta "Nuevo proyecto" NO se renderiza en absoluto', async () => {
    puedeCrearProyectoMock.mockReturnValue(false);
    renderInicio();
    // Esperar a que carguen las otras tarjetas, para no confundir "aún no
    // montó" con "se gateó correctamente".
    await screen.findByText('Seguimiento de proyectos');
    expect(screen.queryByText('Da de alta un proyecto y define sus etapas')).not.toBeInTheDocument();
  });

  it('cada tarjeta muestra el dato real devuelto por el backend', async () => {
    renderInicio();
    expect(await screen.findByText('12 proyectos')).toBeInTheDocument(); // Seguimiento de proyectos
    expect(await screen.findByText('5 proyectos')).toBeInTheDocument(); // Tablero
    expect(await screen.findByText('8 indicadores')).toBeInTheDocument();
    expect(await screen.findByText('3 estados con actividad')).toBeInTheDocument();
    expect(screen.getByText(/7 actividades a tu cargo/)).toBeInTheDocument();
    expect(screen.getByText(/2 vencidas/)).toBeInTheDocument();
    // Notificaciones no viene de GET /inicio/resumen-tarjetas sino del
    // Outlet context (misma fuente que la campanita del Header/Sidebar).
    expect(screen.getByText('4 sin leer')).toBeInTheDocument();
  });
});

describe('Inicio — bloque 4.1 (Cómo funciona el seguimiento: abre la primera vez, cerrada después)', () => {
  it('sin preferencia guardada (primera vez), la sección se muestra abierta y guarda "0" para la próxima', async () => {
    renderInicio();
    await screen.findByText('Seguimiento de proyectos');
    const boton = screen.getByRole('button', { name: /cómo funciona el seguimiento/i });
    expect(boton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/Cada proyecto se divide en etapas/)).toBeInTheDocument();
    expect(localStorage.getItem('pspp_inicio_como_funciona_abierto_u1')).toBe('0');
  });

  it('con preferencia "0" ya guardada (visita posterior sin tocarla), se muestra cerrada', async () => {
    localStorage.setItem('pspp_inicio_como_funciona_abierto_u1', '0');
    renderInicio();
    await screen.findByText('Seguimiento de proyectos');
    const boton = screen.getByRole('button', { name: /cómo funciona el seguimiento/i });
    expect(boton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/Cada proyecto se divide en etapas/)).not.toBeInTheDocument();
  });

  it('un clic la abre y persiste "1"; otro clic la cierra y persiste "0"', async () => {
    localStorage.setItem('pspp_inicio_como_funciona_abierto_u1', '0');
    renderInicio();
    await screen.findByText('Seguimiento de proyectos');
    const boton = screen.getByRole('button', { name: /cómo funciona el seguimiento/i });

    fireEvent.click(boton);
    expect(boton).toHaveAttribute('aria-expanded', 'true');
    expect(localStorage.getItem('pspp_inicio_como_funciona_abierto_u1')).toBe('1');

    fireEvent.click(boton);
    expect(boton).toHaveAttribute('aria-expanded', 'false');
    expect(localStorage.getItem('pspp_inicio_como_funciona_abierto_u1')).toBe('0');
  });

  it('si localStorage truena al leer, se queda abierta en vez de ocultar la explicación', async () => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => { throw new Error('storage bloqueado'); };
    try {
      renderInicio();
      await screen.findByText('Seguimiento de proyectos');
      expect(screen.getByRole('button', { name: /cómo funciona el seguimiento/i })).toHaveAttribute('aria-expanded', 'true');
    } finally {
      Storage.prototype.getItem = original;
    }
  });
});

describe('Inicio — bloque 4.2 (texto numerado exacto, bloque 4.4 vocabulario)', () => {
  it('los 6 puntos son el texto exacto del encargo, sin parafrasear', async () => {
    renderInicio();
    await screen.findByText('Seguimiento de proyectos');
    const textos = [
      'Cada proyecto se divide en etapas, cada etapa en acciones, y cada acción en tareas.',
      'Registras el avance en lo más pequeño que tengas asignado. El avance sube solo hasta el proyecto: no hay que actualizarlo en cada nivel.',
      'Cada actividad tiene un estado que tú declaras: sin iniciar, en proceso, bloqueada, completada o cancelada.',
      'Y un semáforo que la plataforma calcula sola a partir de la fecha límite: en tiempo, por vencer, vencida, o sin urgencia cuando falta capturar la fecha.',
      'En Mis actividades ves únicamente lo que te toca a ti. En Seguimiento de proyectos ves todo lo de la Secretaría, aunque solo puedas editar aquello en lo que participas.',
      'Puedes delegar una etapa, una acción o una tarea en otra persona. Lo que delegues aparece en las actividades de quien lo recibe.',
    ];
    for (const texto of textos) {
      expect(screen.getByText(texto)).toBeInTheDocument();
    }
  });
});
