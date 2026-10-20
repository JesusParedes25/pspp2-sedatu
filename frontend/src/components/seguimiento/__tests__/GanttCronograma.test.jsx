// @vitest-environment jsdom
/**
 * ARCHIVO: GanttCronograma.test.jsx
 * PROPÓSITO: Prueba de cierre del bloque 3.2 — el aviso "N actividades no
 *            se muestran aquí porque no tienen fechas capturadas" tiene
 *            que aparecer SOLO cuando el proyecto de verdad tiene nodos
 *            sin fecha, con el número exacto que devuelve el backend, y
 *            su botón "Ver cuáles" debe listarlos.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import GanttCronograma from '../GanttCronograma';

vi.mock('../../../api/acciones', () => ({
  obtenerAccionesEtapa: vi.fn().mockResolvedValue({ datos: [] }),
  obtenerSubacciones: vi.fn().mockResolvedValue({ datos: [] }),
}));
vi.mock('../../../api/tareas', () => ({
  obtenerTareasPorAccion: vi.fn().mockResolvedValue({ datos: [] }),
}));

const obtenerActividadesSinFechaMock = vi.fn();
vi.mock('../../../api/proyectos', () => ({
  obtenerActividadesSinFecha: (...args) => obtenerActividadesSinFechaMock(...args),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const ETAPAS = [{ id: 'e1', nombre: 'Etapa 1', fecha_inicio: '2026-01-01', fecha_fin: '2026-06-01', semaforo_efectivo: 'verde', avance_efectivo: 10, total_acciones: 0 }];

describe('GanttCronograma — aviso de actividades sin fecha (bloque 3.2)', () => {
  it('no muestra ningún aviso cuando no hay actividades sin fecha', async () => {
    obtenerActividadesSinFechaMock.mockResolvedValue({ total: 0, items: [] });
    render(<GanttCronograma proyectoId="p1" etapas={ETAPAS} fechaInicioProyecto="2026-01-01" fechaFinProyecto="2026-12-31" />);

    await waitFor(() => expect(obtenerActividadesSinFechaMock).toHaveBeenCalledWith('p1'));
    expect(screen.queryByText(/no se muestra/i)).not.toBeInTheDocument();
  });

  it('muestra el aviso con el número correcto y lista las actividades al pedirlo', async () => {
    obtenerActividadesSinFechaMock.mockResolvedValue({
      total: 3,
      items: [
        { id: 'a1', tipo: 'accion', nombre: 'Acción sin fecha', contexto: 'Etapa 1' },
        { id: 'e2', tipo: 'etapa', nombre: 'Etapa sin fecha', contexto: null },
        { id: 't1', tipo: 'tarea', nombre: 'Tarea sin fecha', contexto: 'Acción X' },
      ],
    });
    render(<GanttCronograma proyectoId="p1" etapas={ETAPAS} fechaInicioProyecto="2026-01-01" fechaFinProyecto="2026-12-31" />);

    await waitFor(() => expect(screen.getByText(/3 actividades no se muestran aquí porque no tienen fechas capturadas\./i)).toBeInTheDocument());

    expect(screen.queryByText('Acción sin fecha')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /ver cuáles/i }));
    expect(screen.getByText('Acción sin fecha')).toBeInTheDocument();
    expect(screen.getByText('Etapa sin fecha')).toBeInTheDocument();
    expect(screen.getByText('Tarea sin fecha')).toBeInTheDocument();
  });

  it('usa el singular cuando solo hay una actividad sin fecha', async () => {
    obtenerActividadesSinFechaMock.mockResolvedValue({
      total: 1,
      items: [{ id: 'a1', tipo: 'accion', nombre: 'Única sin fecha', contexto: null }],
    });
    render(<GanttCronograma proyectoId="p1" etapas={ETAPAS} fechaInicioProyecto="2026-01-01" fechaFinProyecto="2026-12-31" />);

    await waitFor(() => expect(screen.getByText(/1 actividad no se muestra aquí porque no tiene fechas capturadas\./i)).toBeInTheDocument());
  });
});
