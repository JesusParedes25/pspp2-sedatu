// @vitest-environment jsdom
/**
 * ARCHIVO: IndicadoresProyecto.test.jsx
 * PROPÓSITO: Parte 2.7 del encargo "Indicadores dentro del proyecto" —
 *            la pestaña nueva lista los indicadores del proyecto con
 *            sus datos reales, respeta el acceso de solo lectura (sin
 *            ninguna acción de cambio visible, backend aparte) y
 *            muestra un estado vacío explicativo en vez de una pantalla
 *            en blanco cuando el proyecto no mide nada todavía.
 *
 *            Suma del encargo de seguimiento (reportado tras probar en
 *            producción): la fila desplegada no mostraba el historial
 *            de movimientos, y registrar uno no refrescaba la fila sin
 *            recargar la página (la misma falla del PR #173 bloque G2,
 *            reaparecida aquí). Los dos últimos tests cubren eso.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import IndicadoresProyecto from '../IndicadoresProyecto';

vi.mock('../../../context/UIContext', () => ({
  useUI: () => ({ mostrarToast: vi.fn() }),
}));

let outletContextMock;
vi.mock('react-router-dom', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, useOutletContext: () => outletContextMock };
});

const listarTodosPorProyectoMock = vi.fn();
const obtenerAportacionesIndicadorMock = vi.fn();
const listarMovimientosIndicadorMock = vi.fn();
const crearMovimientoIndicadorMock = vi.fn();
vi.mock('../../../api/indicadores', () => ({
  listarTodosPorProyecto: (...args) => listarTodosPorProyectoMock(...args),
  obtenerAportacionesIndicador: (...args) => obtenerAportacionesIndicadorMock(...args),
  listarMovimientosIndicador: (...args) => listarMovimientosIndicadorMock(...args),
  crearMovimientoIndicador: (...args) => crearMovimientoIndicadorMock(...args),
  eliminarIndicadorConConfirm: vi.fn(),
  actualizarIndicador: vi.fn(),
  actualizarAportacion: vi.fn(),
  eliminarAportacion: vi.fn(),
  anularMovimientoIndicador: vi.fn(),
  crearIndicador: vi.fn(),
  crearAportacion: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function contextoProyecto(permisos) {
  outletContextMock = {
    proyecto: { id: 'p1', nombre: 'Proyecto de prueba' },
    proyectoId: 'p1',
    permisos,
    incrementarStats: vi.fn(),
  };
}

function renderPantalla() {
  return render(<MemoryRouter><IndicadoresProyecto /></MemoryRouter>);
}

const INDICADOR_INSTITUCIONAL = {
  id: 'ind-1', nombre: 'Viviendas mejoradas', unidad: 'Numero', etiqueta_unidad: 'viviendas',
  instrumento: 'PSEDATU 2025-2030', meta_global: 5000, valor_actual: 1200,
  fecha_corte: '2026-10-10', num_nodos: 2, composicion: 'Simple',
};
const INDICADOR_PLATAFORMA = {
  id: 'ind-2', nombre: 'Expedientes resueltos', unidad: 'Numero', etiqueta_unidad: 'expedientes',
  instrumento: null, tipo: 'Gestion', meta_global: null, valor_actual: 30,
  fecha_corte: null, num_nodos: 0, composicion: 'Simple',
};

describe('IndicadoresProyecto — listar', () => {
  it('muestra nombre, origen, meta/avance, fecha de último movimiento y número de nodos de cada indicador', async () => {
    contextoProyecto({ esSoloLectura: false });
    listarTodosPorProyectoMock.mockResolvedValue([INDICADOR_INSTITUCIONAL, INDICADOR_PLATAFORMA]);
    renderPantalla();

    await waitFor(() => expect(screen.getByText('Viviendas mejoradas')).toBeInTheDocument());
    expect(screen.getByText('Expedientes resueltos')).toBeInTheDocument();

    // Origen institucional (instrumento) vs. de la plataforma (tipo)
    expect(screen.getByText('PSEDATU 2025-2030')).toBeInTheDocument();
    expect(screen.getByText('Gestión')).toBeInTheDocument();

    // Meta/avance y nodos del indicador institucional
    expect(screen.getByText('2 nodos')).toBeInTheDocument();
    expect(screen.getByText('0 nodos')).toBeInTheDocument();
    expect(listarTodosPorProyectoMock).toHaveBeenCalledWith('p1');
  });
});

describe('IndicadoresProyecto — permisos de solo lectura', () => {
  it('sin acceso de edición no muestra "Vincular indicador" ni ninguna acción de cambio al expandir un renglón', async () => {
    contextoProyecto({ esSoloLectura: true });
    listarTodosPorProyectoMock.mockResolvedValue([INDICADOR_INSTITUCIONAL]);
    obtenerAportacionesIndicadorMock.mockResolvedValue([]);
    listarMovimientosIndicadorMock.mockResolvedValue([]);
    renderPantalla();

    await waitFor(() => expect(screen.getByText('Viviendas mejoradas')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Vincular indicador/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Viviendas mejoradas'));
    await waitFor(() => expect(obtenerAportacionesIndicadorMock).toHaveBeenCalledWith('ind-1'));

    expect(screen.queryByRole('button', { name: /Registrar movimiento/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Agregar nodo/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Desvincular indicador/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Cambiar meta|Definir meta/i })).not.toBeInTheDocument();
  });

  it('con acceso de edición SÍ muestra "Vincular indicador" y las acciones del renglón expandido', async () => {
    contextoProyecto({ esSoloLectura: false });
    listarTodosPorProyectoMock.mockResolvedValue([INDICADOR_INSTITUCIONAL]);
    obtenerAportacionesIndicadorMock.mockResolvedValue([]);
    listarMovimientosIndicadorMock.mockResolvedValue([]);
    renderPantalla();

    await waitFor(() => expect(screen.getByText('Viviendas mejoradas')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Vincular indicador/i })).toBeInTheDocument();

    fireEvent.click(screen.getByText('Viviendas mejoradas'));
    await waitFor(() => expect(screen.getByRole('button', { name: /Registrar movimiento/i })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Agregar nodo/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Desvincular indicador/i })).toBeInTheDocument();
    // Siempre visible, incluso en solo lectura: es navegación, no una mutación.
    expect(screen.getByRole('link', { name: /Ver detalle completo/i })).toBeInTheDocument();
  });
});

describe('IndicadoresProyecto — historial de movimientos en la fila desplegada', () => {
  it('muestra fecha, origen, cantidad con signo, acumulado y quién registró cada movimiento', async () => {
    contextoProyecto({ esSoloLectura: false });
    listarTodosPorProyectoMock.mockResolvedValue([INDICADOR_INSTITUCIONAL]);
    obtenerAportacionesIndicadorMock.mockResolvedValue([]);
    listarMovimientosIndicadorMock.mockResolvedValue([
      { id: 'm1', fecha: '2026-10-10', cantidad: '3', origen: 'manual', creador_nombre: 'Ana Reportera', anulado_en: null, nodo_nombre: null },
    ]);
    renderPantalla();

    await waitFor(() => expect(screen.getByText('Viviendas mejoradas')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Viviendas mejoradas'));

    await waitFor(() => expect(screen.getByText('Registro a mano')).toBeInTheDocument());
    expect(screen.getByText(/Ana Reportera/)).toBeInTheDocument();
    expect(screen.getByText('+3')).toBeInTheDocument();
    expect(screen.getByText(/acumulado: 3/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Anular/i })).toBeInTheDocument();
  });

  it('en solo lectura no ofrece la acción de Anular sobre un movimiento', async () => {
    contextoProyecto({ esSoloLectura: true });
    listarTodosPorProyectoMock.mockResolvedValue([INDICADOR_INSTITUCIONAL]);
    obtenerAportacionesIndicadorMock.mockResolvedValue([]);
    listarMovimientosIndicadorMock.mockResolvedValue([
      { id: 'm1', fecha: '2026-10-10', cantidad: '3', origen: 'manual', creador_nombre: 'Ana Reportera', anulado_en: null, nodo_nombre: null },
    ]);
    renderPantalla();

    await waitFor(() => expect(screen.getByText('Viviendas mejoradas')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Viviendas mejoradas'));

    await waitFor(() => expect(screen.getByText('Registro a mano')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Anular/i })).not.toBeInTheDocument();
  });
});

describe('IndicadoresProyecto — refresco sin recargar', () => {
  it('después de registrar un movimiento, el valor, la fecha y el historial de la fila se actualizan solos', async () => {
    contextoProyecto({ esSoloLectura: false });
    listarTodosPorProyectoMock
      .mockResolvedValueOnce([INDICADOR_INSTITUCIONAL])
      .mockResolvedValueOnce([{ ...INDICADOR_INSTITUCIONAL, valor_actual: 1203, fecha_corte: '2026-10-15' }]);
    obtenerAportacionesIndicadorMock.mockResolvedValue([]);
    listarMovimientosIndicadorMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'm1', fecha: '2026-10-15', cantidad: '3', origen: 'manual', creador_nombre: 'Ana Reportera', anulado_en: null, nodo_nombre: null }]);
    crearMovimientoIndicadorMock.mockResolvedValue({});
    renderPantalla();

    await waitFor(() => expect(screen.getByText('Viviendas mejoradas')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Viviendas mejoradas'));
    await waitFor(() => expect(listarMovimientosIndicadorMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: /Registrar movimiento/i }));
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));

    await waitFor(() => expect(crearMovimientoIndicadorMock).toHaveBeenCalled());
    // Sin recargar la página: la misma instancia del componente vuelve a
    // pedir la lista, los nodos y el historial de esta fila.
    await waitFor(() => expect(listarTodosPorProyectoMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(listarMovimientosIndicadorMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText(/Ana Reportera/)).toBeInTheDocument());
  });
});

describe('IndicadoresProyecto — estado vacío', () => {
  it('un proyecto sin indicadores muestra el mensaje explicativo y el botón para vincular el primero', async () => {
    contextoProyecto({ esSoloLectura: false });
    listarTodosPorProyectoMock.mockResolvedValue([]);
    renderPantalla();

    await waitFor(() => expect(screen.getByText(/todavía no mide ningún indicador/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Vincular el primero/i })).toBeInTheDocument();
  });

  it('en solo lectura, el estado vacío no ofrece el botón de vincular', async () => {
    contextoProyecto({ esSoloLectura: true });
    listarTodosPorProyectoMock.mockResolvedValue([]);
    renderPantalla();

    await waitFor(() => expect(screen.getByText(/todavía no mide ningún indicador/i)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Vincular/i })).not.toBeInTheDocument();
  });
});
