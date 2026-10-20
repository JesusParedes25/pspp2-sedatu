// @vitest-environment jsdom
/**
 * ARCHIVO: PropiedadesElemento.test.jsx
 * PROPÓSITO: Prueba (c) del bloque "El modal de captura, y cierre de lo
 *            pendiente" — "Instancia responsable" y "Enlace responsable"
 *            se quitaron del formulario de edición (bloque 2.5), pero un
 *            nodo que YA tenga valor guardado en alguno de los dos debe
 *            seguir mostrándolo en la ficha, ahora como texto de solo
 *            lectura (ya no como un <select> editable), y ese valor no
 *            debe viajar en el payload de "Guardar cambios" aunque el
 *            usuario edite otro campo.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import PropiedadesElemento from '../PropiedadesElemento';

vi.mock('../../../api/client', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { datos: [] } }),
  },
}));

const actualizarMock = vi.fn().mockResolvedValue({});
vi.mock('../../../hooks/useJerarquiaProyecto', () => ({
  useJerarquiaProyecto: () => ({ actualizar: actualizarMock }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const PERMISOS_EDITA = { esSoloLectura: false };

function nodoAccion(overrides = {}) {
  return {
    tipo: 'accion',
    id: 'a1',
    data: {
      nombre: 'Acción de prueba', estado: 'En_proceso', semaforo_efectivo: 'verde',
      porcentaje_avance: 10, es_hoja: true,
      fecha_inicio: null, fecha_limite: null,
      ...overrides,
    },
  };
}

describe('PropiedadesElemento — bloque 2.5 (Instancia/Enlace responsable ya no son editables)', () => {
  it('un nodo con instancia_responsable y enlace_responsable guardados los sigue mostrando, como texto', () => {
    render(
      <PropiedadesElemento
        nodo={nodoAccion({ instancia_responsable: 'Terrenos Nacionales', enlace_responsable: 'Juan Pérez' })}
        permisos={PERMISOS_EDITA}
        onActualizado={() => {}}
        mostrarToast={() => {}}
      />
    );
    expect(screen.getByText('Terrenos Nacionales')).toBeInTheDocument();
    expect(screen.getByText('Juan Pérez')).toBeInTheDocument();
    // Solo lectura: ya no hay ningún <select> para estos dos campos.
    expect(screen.queryByRole('combobox', { name: /instancia responsable/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /enlace responsable/i })).not.toBeInTheDocument();
  });

  it('un nodo sin esos valores no muestra la sección — no se piden al editar', () => {
    render(
      <PropiedadesElemento
        nodo={nodoAccion()}
        permisos={PERMISOS_EDITA}
        onActualizado={() => {}}
        mostrarToast={() => {}}
      />
    );
    expect(screen.queryByText(/instancia responsable/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/enlace responsable/i)).not.toBeInTheDocument();
  });

  it('editar otro campo y guardar no manda instancia_responsable/enlace_responsable en el payload', async () => {
    render(
      <PropiedadesElemento
        nodo={nodoAccion({ instancia_responsable: 'Terrenos Nacionales', enlace_responsable: 'Juan Pérez', observaciones: '' })}
        permisos={PERMISOS_EDITA}
        onActualizado={() => {}}
        mostrarToast={() => {}}
      />
    );
    const textarea = document.querySelector('textarea');
    fireEvent.change(textarea, { target: { value: 'Nueva observación' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));

    await vi.waitFor(() => expect(actualizarMock).toHaveBeenCalledTimes(1));
    const [, , cambios] = actualizarMock.mock.calls[0];
    expect(cambios).toEqual({ observaciones: 'Nueva observación' });
  });
});
