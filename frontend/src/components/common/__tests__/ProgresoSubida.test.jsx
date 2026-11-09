// @vitest-environment jsdom
/**
 * ARCHIVO: ProgresoSubida.test.jsx
 * PROPÓSITO: La barra de subida muestra el porcentaje y, al llegar al
 *            100 %, que el servidor está guardando (no que se trabó).
 */
import { describe, test, expect, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup } from '@testing-library/react';
import ProgresoSubida from '../ProgresoSubida';

afterEach(cleanup);

describe('ProgresoSubida', () => {
  test('porcentaje y valor accesible', () => {
    const { getByText, getByRole } = render(<ProgresoSubida nombre="entrevista.mp3" fraccion={0.42} />);
    expect(getByText('Subiendo… 42 %')).toBeInTheDocument();
    expect(getByText('entrevista.mp3')).toBeInTheDocument();
    expect(getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42');
  });

  test('al 100 % avisa que se está guardando', () => {
    const { getByText } = render(<ProgresoSubida nombre="a.zip" fraccion={1} />);
    expect(getByText('Guardando en el servidor…')).toBeInTheDocument();
  });

  test('sin total conocido no inventa un porcentaje', () => {
    const { getByText, getByRole } = render(<ProgresoSubida nombre="a.zip" fraccion={null} />);
    expect(getByText('Subiendo…')).toBeInTheDocument();
    expect(getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
  });
});
