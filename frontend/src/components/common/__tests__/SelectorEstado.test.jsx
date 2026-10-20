// @vitest-environment jsdom
/**
 * ARCHIVO: SelectorEstado.test.jsx
 * PROPÓSITO: "El estado se declara adivinando" — cubre que el chip de
 *            estado se vea y se comporte como el control real que es:
 *            alcanzable por teclado (Enter/Espacio lo abren), con
 *            `aria-haspopup`, y que SIN permiso no ofrezca ningún
 *            control (ni `<button>`, ni chevron, ni cursor) — solo el
 *            badge estático que de verdad es.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import SelectorEstado from '../SelectorEstado';

vi.mock('../../../api/estado', () => ({
  cambiarEstado: vi.fn().mockResolvedValue({}),
  contarDescendientes: vi.fn().mockResolvedValue({ datos: {} }),
  restaurarEstadoAutomatico: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../../context/UIContext', () => ({
  useUI: () => ({ mostrarToast: vi.fn() }),
}));

afterEach(() => {
  cleanup();
});

describe('SelectorEstado — con permiso, es un control real', () => {
  it('es un <button> con aria-haspopup="listbox", alcanzable por teclado', () => {
    render(
      <SelectorEstado entidadTipo="Etapa" entidadId="e1" estadoActual="En_proceso" soloLectura={false} />
    );
    const boton = screen.getByRole('button');
    expect(boton).toHaveAttribute('aria-haspopup', 'listbox');
    boton.focus();
    expect(boton).toHaveFocus();
  });

  it('el popover empieza cerrado y Enter lo abre', () => {
    render(
      <SelectorEstado entidadTipo="Etapa" entidadId="e1" estadoActual="En_proceso" soloLectura={false} />
    );
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    const boton = screen.getByRole('button');
    fireEvent.keyDown(boton, { key: 'Enter' });
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('Espacio también lo abre', () => {
    render(
      <SelectorEstado entidadTipo="Etapa" entidadId="e1" estadoActual="En_proceso" soloLectura={false} />
    );
    const boton = screen.getByRole('button');
    fireEvent.keyDown(boton, { key: ' ' });
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('un clic también lo abre y lista las 5 opciones de estado', () => {
    render(
      <SelectorEstado entidadTipo="Etapa" entidadId="e1" estadoActual="En_proceso" soloLectura={false} />
    );
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getAllByRole('option')).toHaveLength(5);
  });
});

describe('SelectorEstado — sin permiso, no ofrece ningún control', () => {
  it('no renderiza ningún <button> ni aria-haspopup', () => {
    render(
      <SelectorEstado entidadTipo="Etapa" entidadId="e1" estadoActual="En_proceso" soloLectura={true} />
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(document.querySelector('[aria-haspopup]')).not.toBeInTheDocument();
  });

  it('el chip sigue mostrando el estado, solo que como badge estático', () => {
    render(
      <SelectorEstado entidadTipo="Etapa" entidadId="e1" estadoActual="En_proceso" soloLectura={true} />
    );
    expect(screen.getByText('En proceso')).toBeInTheDocument();
  });

  it('un clic no abre nada (no hay nada que abrir)', () => {
    render(
      <SelectorEstado entidadTipo="Etapa" entidadId="e1" estadoActual="En_proceso" soloLectura={true} />
    );
    fireEvent.click(screen.getByText('En proceso'));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
