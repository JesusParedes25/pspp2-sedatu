// @vitest-environment jsdom
/**
 * ARCHIVO: Header.test.jsx
 * PROPÓSITO: La migaja de pan genérica cae a "Detalle" para cualquier
 *            segmento de URL que no esté en `nombresRutas` — la Guía de
 *            uso (/guia-de-uso) nunca se agregó a ese mapeo y por eso
 *            mostraba "Inicio / Detalle" en vez de "Inicio / Guía de
 *            uso". Esta prueba fija el rótulo correcto para que una
 *            futura ruta nueva no vuelva a quedar en el fallback
 *            genérico sin que nadie lo note.
 */
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Header from '../Header';

vi.mock('../../../api/proyectos', () => ({
  listarProyectos: vi.fn().mockResolvedValue({ datos: { proyectos: [] } }),
}));

function renderHeaderEn(pathname) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <Header />
    </MemoryRouter>
  );
}

describe('Header — migaja de pan', () => {
  it('en /guia-de-uso muestra "Guía de uso", no el fallback genérico "Detalle"', () => {
    renderHeaderEn('/guia-de-uso');
    expect(screen.getByText('Guía de uso')).toBeInTheDocument();
    expect(screen.queryByText('Detalle')).not.toBeInTheDocument();
  });

  it('una ruta de verdad no mapeada sigue cayendo a "Detalle" (el fallback no desapareció)', () => {
    renderHeaderEn('/algo-no-mapeado');
    expect(screen.getByText('Detalle')).toBeInTheDocument();
  });
});
