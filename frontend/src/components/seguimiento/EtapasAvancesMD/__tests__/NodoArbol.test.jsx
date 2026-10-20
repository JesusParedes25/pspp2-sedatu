// @vitest-environment jsdom
/**
 * ARCHIVO: NodoArbol.test.jsx
 * PROPÓSITO: Bloque 2 (navegación del árbol) — el renglón seleccionado
 *            tiene que leerse como "aquí estoy" (fondo + anillo + barra),
 *            pero SIN repetir el error exacto de Fase 3: una fila
 *            bloqueada y seleccionada nunca debe llevar el tono guinda
 *            que usa una fila donde sí se puede editar — eso la pintaría
 *            como si el usuario tuviera permiso justo al lado del
 *            candado que dice lo contrario.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup } from '@testing-library/react';
import NodoArbol from '../NodoArbol';

afterEach(() => {
  cleanup();
});

function nodo(nombre = 'Etapa de prueba') {
  return { id: 'n1', nombre, estado: 'En_proceso', semaforo_efectivo: 'verde', porcentaje_calculado: 40 };
}

function permisos(puedeEditar) {
  return { puedeEditarNodo: () => puedeEditar };
}

describe('NodoArbol — "aquí estoy" (bloque 2.1/2.2)', () => {
  it('fila asignada y seleccionada: fondo y anillo en tono guinda', () => {
    render(
      <NodoArbol nodo={nodo()} tipo="etapa" expandidos={new Set()} seleccionadoId="n1"
        onToggle={() => {}} onSelect={() => {}} permisos={permisos(true)} />
    );
    const fila = screen.getByRole('treeitem');
    expect(fila.className).toMatch(/bg-guinda-100/);
    expect(fila.className).toMatch(/ring-guinda-500/);
    // Nunca el tono gris de "bloqueada" en una fila que sí se puede editar.
    expect(fila.className).not.toMatch(/bg-gray-200/);
  });

  it('fila bloqueada y seleccionada: fondo y anillo grises, NUNCA guinda (el error de Fase 3)', () => {
    render(
      <NodoArbol nodo={nodo()} tipo="etapa" expandidos={new Set()} seleccionadoId="n1"
        onToggle={() => {}} onSelect={() => {}} permisos={permisos(false)} />
    );
    const fila = screen.getByRole('treeitem');
    expect(fila.className).toMatch(/bg-gray-200/);
    expect(fila.className).toMatch(/ring-gray-600/);
    expect(fila.className).not.toMatch(/bg-guinda-100/);
    expect(fila.className).not.toMatch(/ring-guinda/);
    // El candado sigue presente y visible sobre el fondo de selección.
    expect(screen.getByRole('img', { name: /sin permiso de edición/i })).toBeInTheDocument();
  });

  it('fila bloqueada y seleccionada se distingue de una bloqueada sin seleccionar', () => {
    render(
      <NodoArbol nodo={nodo()} tipo="etapa" expandidos={new Set()} seleccionadoId={null}
        onToggle={() => {}} onSelect={() => {}} permisos={permisos(false)} />
    );
    const fila = screen.getByRole('treeitem');
    expect(fila.className).toMatch(/bg-gray-150/);
    expect(fila.className).not.toMatch(/ring-1/);
  });
});
