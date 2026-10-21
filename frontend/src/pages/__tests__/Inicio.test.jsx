// @vitest-environment jsdom
/**
 * ARCHIVO: Inicio.test.jsx
 * PROPÓSITO: "PSPP v2.0 · Inicio, color y la guía de uso" — el
 *            concentrador en la ruta raíz.
 *
 *   - Bloque 1: CADA tarjeta muestra el dato que trae su propia fuente —
 *     las 4 de GET /inicio/resumen-tarjetas tal cual, "Mis actividades"
 *     y "Notificaciones" desde el Outlet context (ver Layout.jsx:
 *     useMisPendientes/useCentroNotificaciones se piden UNA vez ahí y se
 *     comparten, en vez de que Inicio.jsx pida /agenda por su cuenta —
 *     antes duplicaba la llamada que ya hacía el sidebar Y, al no
 *     desenvolver bien la respuesta, dejaba la tarjeta en blanco; ver
 *     useMisPendientes.test.js para la prueba de esa forma real de
 *     respuesta). Incluye una prueba explícita de que el número SÍ se
 *     pinta (no solo que la fuente es la correcta) — es justo lo que se
 *     rompió y ninguna prueba anterior lo atrapaba.
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

// El Outlet context es la ÚNICA fuente de "Mis actividades" y
// "Notificaciones" para esta pantalla (ver Layout.jsx) — se mockea
// directo, sin pasar por accionesApi.obtenerAgenda, que ya no vive aquí.
let outletContextMock;
vi.mock('react-router-dom', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, useOutletContext: () => outletContextMock };
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
  puedeCrearProyectoMock.mockReturnValue(true);
  // Deliberadamente distinto del total de "Mis actividades" (4) para que
  // las aserciones por número no choquen entre sí.
  outletContextMock = {
    notificacionesSinLeer: 6,
    misActividadesResumen: { total: 4, vencidas: 1, proximas: 0 },
    cargandoMisActividades: false,
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Inicio — bloque 3/1 (tarjetas de acceso: gateo por permiso, datos reales)', () => {
  it('con permiso de crear proyectos, el botón "Nuevo proyecto" sí se renderiza, enlazando a /proyectos/nuevo', async () => {
    puedeCrearProyectoMock.mockReturnValue(true);
    renderInicio();
    const boton = await screen.findByText('Nuevo proyecto');
    expect(boton.closest('a')).toHaveAttribute('href', '/proyectos/nuevo');
  });

  it('sin permiso de crear proyectos, el botón "Nuevo proyecto" NO se renderiza en absoluto', async () => {
    puedeCrearProyectoMock.mockReturnValue(false);
    renderInicio();
    await screen.findByText('Seguimiento de proyectos');
    expect(screen.queryByText('Nuevo proyecto')).not.toBeInTheDocument();
  });

  it('las 4 tarjetas que vienen de GET /inicio/resumen-tarjetas muestran exactamente esos 4 valores', async () => {
    renderInicio();
    await screen.findByText('Seguimiento de proyectos');

    const seguimiento = within(contenedorDeTarjeta('Seguimiento de proyectos'));
    expect(seguimiento.getByText('12', { selector: 'span' })).toBeInTheDocument();
    expect(seguimiento.getByText(/proyectos que puedes consultar/)).toBeInTheDocument();

    const tablero = within(contenedorDeTarjeta('Tablero General'));
    expect(tablero.getByText('5', { selector: 'span' })).toBeInTheDocument();
    expect(tablero.getByText(/proyectos que sigues/)).toBeInTheDocument();

    const indicadores = within(contenedorDeTarjeta('Indicadores'));
    expect(indicadores.getByText('8', { selector: 'span' })).toBeInTheDocument();
    expect(indicadores.getByText(/indicadores/)).toBeInTheDocument();

    const territorio = within(contenedorDeTarjeta('Territorio'));
    expect(territorio.getByText('3', { selector: 'span' })).toBeInTheDocument();
    expect(territorio.getByText(/estados con actividad/)).toBeInTheDocument();
  });

  it('"Mis actividades" pinta el número que trae el Outlet context (misma fuente que el badge del sidebar)', async () => {
    renderInicio();
    await screen.findByText('Seguimiento de proyectos');
    const actividades = within(contenedorDeTarjeta('Mis actividades'));
    expect(actividades.getByText('4', { selector: 'span' })).toBeInTheDocument();
    expect(actividades.getByText(/actividades a tu cargo/)).toBeInTheDocument();
    expect(actividades.getByText(/1 vencida/)).toBeInTheDocument();
  });

  // Regresión directa del bug reportado: la tarjeta se quedaba en blanco
  // (sin número, sin "Cargando…", nada) porque el cálculo tronaba antes
  // de llegar aquí y el estado se quedaba en null silenciosamente. Esta
  // prueba falla si "Mis actividades" no pinta NINGÚN texto de datos —
  // a diferencia de la prueba de arriba, que solo compara el número
  // correcto, esta comprueba que haya ALGO (dato real o "Cargando…")
  // donde antes había un div vacío.
  it('"Mis actividades" nunca se queda sin ningún contenido en su línea de datos — ni en blanco mientras carga, ni en blanco con dato ya resuelto', async () => {
    // Caso 1: todavía cargando — debe mostrar el indicador de carga, no un div vacío.
    outletContextMock = { ...outletContextMock, misActividadesResumen: null, cargandoMisActividades: true };
    const { unmount } = renderInicio();
    await screen.findByText('Seguimiento de proyectos');
    const actividadesCargando = within(contenedorDeTarjeta('Mis actividades'));
    expect(actividadesCargando.getByText(/Cargando/)).toBeInTheDocument();
    unmount();

    // Caso 2: ya resuelto — debe mostrar el número, no quedarse vacío.
    outletContextMock = { ...outletContextMock, misActividadesResumen: { total: 4, vencidas: 1, proximas: 0 }, cargandoMisActividades: false };
    renderInicio();
    await screen.findByText('Seguimiento de proyectos');
    const actividadesListo = within(contenedorDeTarjeta('Mis actividades'));
    const lineaDatos = actividadesListo.getByText(/actividades a tu cargo/).closest('div');
    expect(lineaDatos.textContent.trim()).not.toBe('');
    expect(lineaDatos.textContent).toMatch(/\d/);
  });

  it('"Notificaciones" sale del Outlet context (misma cifra que la campanita), rotulada "pendientes" y no "sin leer"', async () => {
    renderInicio();
    await screen.findByText('Seguimiento de proyectos');
    const notificaciones = within(contenedorDeTarjeta('Notificaciones'));
    const numero = notificaciones.getByText('6', { selector: 'span' });
    expect(numero).toBeInTheDocument();
    // "pendientes" también aparece en uno de los puntos de la tarjeta
    // ("Ver solicitudes pendientes") — se acota a la línea de datos (el
    // contenedor directo del número) para no chocar con esa coincidencia.
    const lineaDatos = numero.closest('div');
    expect(lineaDatos.textContent).toMatch(/pendientes/);
    expect(lineaDatos.textContent).not.toMatch(/sin leer/);
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

describe('Inicio — bloque 3 (atajo discreto a la Guía de uso, ya no una franja ancha)', () => {
  it('muestra un link "Guía de uso" enlazando a /guia-de-uso, y ya no la franja ni la sección "Cómo funciona"', async () => {
    renderInicio();
    const link = await screen.findByText('Guía de uso');
    expect(link.closest('a')).toHaveAttribute('href', '/guia-de-uso');
    expect(screen.queryByText('¿Primera vez aquí? Conoce cómo funciona el seguimiento')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cómo funciona el seguimiento/i })).not.toBeInTheDocument();
  });
});
