// @vitest-environment jsdom
/**
 * ARCHIVO: Inicio.test.jsx
 * PROPÓSITO: "PSPP v2.0 · Inicio, color y la guía de uso" — el
 *            concentrador en la ruta raíz.
 *
 *   - Bloque 1: CADA tarjeta muestra el dato que trae su propia fuente —
 *     las 4 de GET /inicio/resumen-tarjetas tal cual, "Mis actividades"
 *     calculado aquí sobre GET /agenda con la misma función pura que usa
 *     MisActividades.jsx (resumenMisActividades.js), y "Notificaciones"
 *     desde el Outlet context (la misma cifra combinada de la campanita).
 *     Es justo el punto que falló la ronda anterior (7/5 en la tarjeta,
 *     25/22 en la pantalla; "0" contra "4" en Territorio) — estas pruebas
 *     fijan que el dato de la tarjeta es el que devuelve su fuente, sin
 *     reinventar un cálculo nuevo.
 *   - Bloque 2: gateo de "Nuevo proyecto" por permiso; sin borde/color
 *     reservado (verde/amarillo/rojo) en ninguna tarjeta de navegación.
 *   - Bloque 3: la franja a la Guía de uso reemplaza la sección
 *     desplegable "Cómo funciona el seguimiento" (que se movió a
 *     GuiaDeUso.jsx).
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Inicio from '../Inicio';

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ usuario: { id: 'u1', nombre_completo: 'Ana López' } }),
}));

const puedeCrearProyectoMock = vi.fn();
vi.mock('../../hooks/usePermisos', () => ({
  usePermisosGlobales: () => ({ puedeCrearProyecto: puedeCrearProyectoMock() }),
}));

// Deliberadamente distinto del total de "Mis actividades" (4, ver
// ITEMS_AGENDA) para que las aserciones por número no choquen entre sí.
vi.mock('react-router-dom', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, useOutletContext: () => ({ notificacionesSinLeer: 6 }) };
});

const RESUMEN = {
  proyectos_visibles: 12,
  proyectos_sigue: 5,
  indicadores_visibles: 8,
  estados_con_actividad: 3,
};
const obtenerResumenTarjetasInicioMock = vi.fn();
vi.mock('../../api/inicio', () => ({
  obtenerResumenTarjetasInicio: (...args) => obtenerResumenTarjetasInicioMock(...args),
}));

// Dos pendientes (fecha_fin dentro del mes, sin completar) + una vencida
// (fecha_fin ya pasada) + una completada (cuenta en el total, no en
// vencidas) — calcularResumenMisActividades(items) con el periodo por
// omisión ('mes') debe dar total=4, vencidas=1.
function fechaOffset(dias) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}
const ITEMS_AGENDA = [
  { id: 'a1', estado: 'Pendiente', fecha_fin: fechaOffset(5) },
  { id: 'a2', estado: 'En_proceso', fecha_fin: fechaOffset(10) },
  { id: 'a3', estado: 'Pendiente', fecha_fin: fechaOffset(-3) },
  { id: 'a4', estado: 'Completada', fecha_fin: fechaOffset(-1) },
];
const obtenerAgendaMock = vi.fn();
vi.mock('../../api/acciones', () => ({
  obtenerAgenda: (...args) => obtenerAgendaMock(...args),
}));

function renderInicio() {
  return render(<MemoryRouter><Inicio /></MemoryRouter>);
}

// Palabras como "indicadores" o "proyectos" aparecen en más de una
// tarjeta (p.ej. en la descripción de Tablero, "...su territorio y sus
// indicadores."), así que las aserciones de texto se acotan a la propia
// tarjeta (por su título exacto) en vez de buscar en toda la pantalla.
function contenedorDeTarjeta(tituloExacto) {
  return screen.getByText(tituloExacto).closest('.border.rounded-xl');
}

beforeEach(() => {
  obtenerResumenTarjetasInicioMock.mockResolvedValue(RESUMEN);
  obtenerAgendaMock.mockResolvedValue(ITEMS_AGENDA);
  puedeCrearProyectoMock.mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Inicio — bloque 3/1 (tarjetas de acceso: gateo por permiso, datos reales)', () => {
  it('con permiso de crear proyectos, la tarjeta "Nuevo proyecto" sí se renderiza', async () => {
    puedeCrearProyectoMock.mockReturnValue(true);
    renderInicio();
    expect(await screen.findByText('Da de alta un proyecto y define sus etapas')).toBeInTheDocument();
  });

  it('sin permiso de crear proyectos, la tarjeta "Nuevo proyecto" NO se renderiza en absoluto', async () => {
    puedeCrearProyectoMock.mockReturnValue(false);
    renderInicio();
    await screen.findByText('Seguimiento de proyectos');
    expect(screen.queryByText('Da de alta un proyecto y define sus etapas')).not.toBeInTheDocument();
  });

  it('las 4 tarjetas que vienen de GET /inicio/resumen-tarjetas muestran exactamente esos 4 valores', async () => {
    renderInicio();
    await screen.findByText('Seguimiento de proyectos');

    const seguimiento = within(contenedorDeTarjeta('Seguimiento de proyectos'));
    expect(seguimiento.getByText('12', { selector: 'span' })).toBeInTheDocument();
    expect(seguimiento.getByText(/proyectos que puedes consultar/)).toBeInTheDocument();

    const tablero = within(contenedorDeTarjeta('Tablero'));
    expect(tablero.getByText('5', { selector: 'span' })).toBeInTheDocument();
    expect(tablero.getByText(/proyectos que sigues/)).toBeInTheDocument();

    const indicadores = within(contenedorDeTarjeta('Indicadores'));
    expect(indicadores.getByText('8', { selector: 'span' })).toBeInTheDocument();
    expect(indicadores.getByText(/indicadores/)).toBeInTheDocument();

    const territorio = within(contenedorDeTarjeta('Territorio'));
    expect(territorio.getByText('3', { selector: 'span' })).toBeInTheDocument();
    expect(territorio.getByText(/estados con actividad/)).toBeInTheDocument();
  });

  it('"Mis actividades" sale de GET /agenda calculado con la misma función que usa esa pantalla, no de resumen-tarjetas', async () => {
    renderInicio();
    await screen.findByText('Seguimiento de proyectos');
    expect(obtenerAgendaMock).toHaveBeenCalled();
    // calcularResumenMisActividades(ITEMS_AGENDA) con periodo 'mes': las 4
    // caen dentro de la ventana (2 pendientes en el futuro, 1 vencida, 1
    // completada ya vencida pero completada) -> total=4; vencidas: solo
    // a3 (Pendiente y fecha pasada) -> 1 ("Completada" no cuenta como
    // vencida aunque su fecha ya pasó).
    const actividades = within(contenedorDeTarjeta('Mis actividades'));
    expect(actividades.getByText('4', { selector: 'span' })).toBeInTheDocument();
    expect(actividades.getByText(/actividades a tu cargo/)).toBeInTheDocument();
    expect(actividades.getByText(/1 vencida/)).toBeInTheDocument();
  });

  it('"Notificaciones" sale del Outlet context (misma cifra que la campanita), rotulada "pendientes" y no "sin leer"', async () => {
    renderInicio();
    await screen.findByText('Seguimiento de proyectos');
    const notificaciones = within(contenedorDeTarjeta('Notificaciones'));
    expect(notificaciones.getByText('6', { selector: 'span' })).toBeInTheDocument();
    expect(notificaciones.getByText(/pendientes/)).toBeInTheDocument();
    expect(notificaciones.queryByText(/sin leer/)).not.toBeInTheDocument();
  });
});

describe('Inicio — bloque 2 (color de navegación: nunca verde/amarillo/rojo)', () => {
  it('ninguna tarjeta de navegación usa clases de verde, amarillo o rojo', async () => {
    const { container } = renderInicio();
    await screen.findByText('Seguimiento de proyectos');
    // "vencida" en Mis actividades sí es rojo (urgencia, no navegación) —
    // se excluye de este chequeo por su texto, no por la clase.
    const tarjetas = Array.from(container.querySelectorAll('.border.rounded-xl'));
    for (const tarjeta of tarjetas) {
      const clasesIconoContenedor = tarjeta.querySelector('.w-9.h-9')?.className || '';
      expect(clasesIconoContenedor).not.toMatch(/verde|green|amber|yellow|rojo|red/);
    }
  });
});

describe('Inicio — bloque 3 (franja a la Guía de uso, reemplaza la sección desplegable)', () => {
  it('muestra la franja "¿Primera vez aquí?" enlazando a /guia-de-uso, y ya no la sección "Cómo funciona"', async () => {
    renderInicio();
    const franja = await screen.findByText('¿Primera vez aquí? Conoce cómo funciona el seguimiento');
    expect(franja.closest('a')).toHaveAttribute('href', '/guia-de-uso');
    expect(screen.queryByRole('button', { name: /cómo funciona el seguimiento/i })).not.toBeInTheDocument();
  });
});
