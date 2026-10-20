// @vitest-environment jsdom
/**
 * ARCHIVO: FilaAcciones.test.jsx
 * PROPÓSITO: Bloque 3 (ronda de vocabulario) cambia lo que el usuario
 *            puede hacer sobre un nodo Completada — ya no solo ve un
 *            botón deshabilitado con tooltip, ahora hay una explicación
 *            siempre visible y un atajo de un clic ("Volver a En
 *            proceso"). Cubre exactamente eso: el botón sigue
 *            deshabilitado, el texto es visible sin pasar el mouse, el
 *            atajo llama a PUT /estado con los parámetros correctos
 *            (Etapa/Accion/Subaccion según el nodo) sin tocar avance ni
 *            hijos, y el atajo se oculta sin permiso para cambiar el
 *            estado de ese nodo.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import FilaAcciones from '../FilaAcciones';
import * as estadoApi from '../../../../api/estado';

vi.mock('../../../../api/estado', () => ({
  cambiarEstado: vi.fn().mockResolvedValue({}),
}));

const PERMISOS_BASE = {
  esSoloLectura: false,
  puedeCrearEtapa: true,
  puedeCrearAccion: true,
  puedeEliminar: true,
  puedeInvitar: true,
  puedeCambiarEstado: true,
};

function nodoEtapa(estado) {
  return { id: 'etapa-1', nombre: 'Etapa de prueba', estado, acciones: [] };
}

function nodoAccion(estado, { subaccion = false } = {}) {
  return {
    id: 'accion-1',
    nombre: 'Acción de prueba',
    estado,
    tareas: [],
    subacciones: [],
    id_accion_padre: subaccion ? 'accion-padre-1' : null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// RTL no limpia el DOM entre tests por su cuenta cuando `globals` está
// apagado en vitest.config.js (apagado a propósito para el resto de la
// suite, que son pruebas de lógica pura, no de componentes) — sin este
// afterEach, el render de un test queda montado y el siguiente test lo
// encuentra como un "elemento duplicado".
afterEach(() => {
  cleanup();
});

describe('FilaAcciones — botón "Agregar X" sobre un nodo Completada', () => {
  it('no deshabilita el botón ni muestra explicación cuando el nodo no está Completada', () => {
    render(
      <FilaAcciones
        tipo="etapa"
        nodo={nodoEtapa('En_proceso')}
        id="etapa-1"
        permisos={PERMISOS_BASE}
      />
    );
    expect(screen.getByRole('button', { name: /agregar acción/i })).not.toBeDisabled();
    expect(screen.queryByText(/marcada como Completada/i)).not.toBeInTheDocument();
  });

  it('deshabilita el botón y muestra la explicación SIEMPRE visible (sin simular hover)', () => {
    render(
      <FilaAcciones
        tipo="etapa"
        nodo={nodoEtapa('Completada')}
        id="etapa-1"
        permisos={PERMISOS_BASE}
      />
    );
    expect(screen.getByRole('button', { name: /agregar acción/i })).toBeDisabled();
    expect(
      screen.getByText(/Esta etapa está marcada como Completada\. Para agregar actividades, vuelve a ponerla En proceso\./i)
    ).toBeVisible();
  });

  it('con permiso para cambiar el estado, ofrece "Volver a En proceso" y llama a PUT /estado (Etapa) sin pasar por hijos', async () => {
    const onCambiado = vi.fn();
    render(
      <FilaAcciones
        tipo="etapa"
        nodo={nodoEtapa('Completada')}
        id="etapa-1"
        permisos={PERMISOS_BASE}
        onCambiado={onCambiado}
      />
    );

    const atajo = screen.getByRole('button', { name: /volver a en proceso/i });
    fireEvent.click(atajo);

    await waitFor(() => expect(estadoApi.cambiarEstado).toHaveBeenCalledTimes(1));
    expect(estadoApi.cambiarEstado).toHaveBeenCalledWith('Etapa', 'etapa-1', 'En_proceso');
    await waitFor(() => expect(onCambiado).toHaveBeenCalledTimes(1));
  });

  it('distingue Accion de Subaccion al armar el atajo, según id_accion_padre', async () => {
    render(
      <FilaAcciones
        tipo="accion"
        nodo={nodoAccion('Completada', { subaccion: true })}
        id="accion-1"
        permisos={PERMISOS_BASE}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /volver a en proceso/i }));

    await waitFor(() => expect(estadoApi.cambiarEstado).toHaveBeenCalledWith('Subaccion', 'accion-1', 'En_proceso'));
    // El mensaje usa el sustantivo correcto para una subacción.
    expect(screen.getByText(/Esta subacción está marcada como Completada/i)).toBeInTheDocument();
  });

  it('sin permiso para cambiar el estado de este nodo, muestra la explicación pero NO el atajo', () => {
    render(
      <FilaAcciones
        tipo="etapa"
        nodo={nodoEtapa('Completada')}
        id="etapa-1"
        permisos={{ ...PERMISOS_BASE, puedeCambiarEstado: false }}
      />
    );

    expect(screen.getByText(/marcada como Completada/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /volver a en proceso/i })).not.toBeInTheDocument();
  });
});
