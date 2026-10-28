// @vitest-environment jsdom
/**
 * ARCHIVO: ChipAportacion.test.jsx
 * PROPÓSITO: Bloque B1 reportado tras el PR #170 — una aportación sin
 *            cantidad (0 o nula, de un vínculo creado antes de que esto
 *            se exigiera) debe avisarse de forma visible en vez de
 *            mostrar solo el modo sin número, y "Guardar" no debe poder
 *            dejarla en 0 al editar.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ChipAportacion, { tieneCantidadValida } from '../ChipAportacion';

vi.mock('../../../api/indicadores', () => ({
  actualizarAportacion: vi.fn().mockResolvedValue({}),
  eliminarAportacion: vi.fn().mockResolvedValue({}),
}));

afterEach(() => cleanup());

const APORTACION_VALIDA = { id: 'ap-1', aportacion: 50, modo: 'al_concluir' };
const APORTACION_SIN_CANTIDAD = { id: 'ap-2', aportacion: 0, modo: 'proporcional' };

describe('tieneCantidadValida', () => {
  it('es falso para 0, null y undefined; verdadero para un número positivo', () => {
    expect(tieneCantidadValida({ aportacion: 0 })).toBe(false);
    expect(tieneCantidadValida({ aportacion: null })).toBe(false);
    expect(tieneCantidadValida({ aportacion: undefined })).toBe(false);
    expect(tieneCantidadValida({ aportacion: 10 })).toBe(true);
  });
});

describe('ChipAportacion — cabecera', () => {
  it('con cantidad > 0 muestra "N · Modo"', () => {
    render(<ChipAportacion ap={APORTACION_VALIDA} etiquetaPrincipal="Indicador X" mostrarToast={vi.fn()} onActualizado={vi.fn()} />);
    expect(screen.getByText('50 · Manual')).toBeInTheDocument();
  });

  it('sin cantidad muestra el aviso "Sin cantidad definida" en vez del modo solo', () => {
    render(<ChipAportacion ap={APORTACION_SIN_CANTIDAD} etiquetaPrincipal="Indicador Y" mostrarToast={vi.fn()} onActualizado={vi.fn()} />);
    expect(screen.getByText('Sin cantidad definida')).toBeInTheDocument();
    expect(screen.queryByText('Automático')).not.toBeInTheDocument();
  });
});

describe('ChipAportacion — editor expandido', () => {
  it('"Guardar" está deshabilitado mientras la cantidad sea 0', () => {
    render(<ChipAportacion ap={APORTACION_SIN_CANTIDAD} etiquetaPrincipal="Indicador Y" mostrarToast={vi.fn()} onActualizado={vi.fn()} />);
    fireEvent.click(screen.getByText('Indicador Y'));
    expect(screen.getByText('Guardar')).toBeDisabled();
    expect(screen.getByText('La cantidad debe ser mayor que 0.')).toBeInTheDocument();
  });

  it('escribir una cantidad positiva habilita "Guardar"', () => {
    render(<ChipAportacion ap={APORTACION_SIN_CANTIDAD} etiquetaPrincipal="Indicador Y" mostrarToast={vi.fn()} onActualizado={vi.fn()} />);
    fireEvent.click(screen.getByText('Indicador Y'));
    const input = screen.getByDisplayValue('0');
    fireEvent.change(input, { target: { value: '25' } });
    expect(screen.getByText('Guardar')).not.toBeDisabled();
  });
});
