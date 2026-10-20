// @vitest-environment jsdom
/**
 * ARCHIVO: EncabezadoDetalle.test.jsx
 * PROPÓSITO: Bloque 2.4 ("El estado se declara adivinando") — el atajo
 *            junto a la barra de avance tiene que ser simétrico: "Marcar
 *            como completada" cuando el nodo NO está Completada, "Volver
 *            a En proceso" cuando SÍ lo está — nunca los dos a la vez,
 *            y el segundo solo con permiso de edición.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { forwardRef } from 'react';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup } from '@testing-library/react';
import EncabezadoDetalle from '../EncabezadoDetalle';

vi.mock('../../../common/SelectorEstado', () => ({
  // La real es forwardRef (2.3: EncabezadoDetalle la abre por ref desde
  // el menú "Más acciones") — el stub lo imita para no ensuciar la
  // prueba con el warning de React por un ref a un componente función.
  default: forwardRef((props, ref) => <div ref={ref} data-testid="selector-estado-stub" />),
}));
vi.mock('../../LineageClicable', () => ({
  default: () => <div data-testid="lineage-stub" />,
}));
vi.mock('../Campos', () => ({
  CampoTextoInline: ({ valor }) => <div data-testid="nombre-stub">{valor}</div>,
}));
vi.mock('../../../../api/estado', () => ({
  cambiarEstado: vi.fn().mockResolvedValue({}),
}));

afterEach(() => {
  cleanup();
});

function nodo(estado, overrides = {}) {
  return {
    tipo: 'accion',
    id: 'a1',
    data: { nombre: 'Acción de prueba', estado, acciones: [], tareas: [], subacciones: [], ...overrides },
  };
}

const PERMISOS_EDITA = { esSoloLectura: false };
const PERMISOS_CONSULTA = { esSoloLectura: true };

describe('EncabezadoDetalle — simetría del atajo junto a la barra de avance', () => {
  it('nodo NO completado, con permiso: ofrece "Marcar como completada"', () => {
    render(
      <EncabezadoDetalle
        nodo={nodo('En_proceso')}
        ruta={[]}
        permisos={PERMISOS_EDITA}
        onGuardarCampo={() => {}}
        onMarcarCompletada={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: /marcar como completada/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /volver a en proceso/i })).not.toBeInTheDocument();
  });

  it('nodo Completada, con permiso: ofrece "Volver a En proceso" y NO "Marcar como completada"', () => {
    render(
      <EncabezadoDetalle
        nodo={nodo('Completada')}
        ruta={[]}
        permisos={PERMISOS_EDITA}
        onGuardarCampo={() => {}}
        onMarcarCompletada={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: /volver a en proceso/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /marcar como completada/i })).not.toBeInTheDocument();
  });

  it('nodo Completada, SIN permiso (solo lectura): no ofrece ningún atajo', () => {
    render(
      <EncabezadoDetalle
        nodo={nodo('Completada')}
        ruta={[]}
        permisos={PERMISOS_CONSULTA}
        onGuardarCampo={() => {}}
        onMarcarCompletada={() => {}}
      />
    );
    expect(screen.queryByRole('button', { name: /volver a en proceso/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /marcar como completada/i })).not.toBeInTheDocument();
  });

  it('nodo NO completado, SIN onMarcarCompletada (nodo contenedor): no ofrece "Marcar como completada"', () => {
    render(
      <EncabezadoDetalle
        nodo={nodo('En_proceso')}
        ruta={[]}
        permisos={PERMISOS_EDITA}
        onGuardarCampo={() => {}}
        onMarcarCompletada={undefined}
      />
    );
    expect(screen.queryByRole('button', { name: /marcar como completada/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /volver a en proceso/i })).not.toBeInTheDocument();
  });
});
