// @vitest-environment jsdom
/**
 * ARCHIVO: ConfirmDialog.test.jsx
 * PROPÓSITO: Regresión — un clic en el fondo oscuro de un modal NO debe
 *            cerrarlo, solo un control explícito (aquí, "Cancelar" o
 *            "Confirmar"). Esto ya se había resuelto una vez y se
 *            reintrodujo sin que ninguna prueba lo detectara; esta
 *            prueba existe para que una futura regresión sí falle aquí.
 *            ConfirmDialog es el diálogo de confirmación reusado en ~10
 *            pantallas (eliminar proyecto, cartera, etc.), así que
 *            fijarlo aquí cubre a todos sus usos de una sola vez.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import ConfirmDialog from '../ConfirmDialog';

afterEach(cleanup);

describe('ConfirmDialog — clic en el fondo no cierra el diálogo', () => {
  it('clic en el backdrop no llama a onCancelar; clic en "Cancelar" sí', () => {
    const onCancelar = vi.fn();
    const onConfirmar = vi.fn();
    const { container, getByText } = render(
      <ConfirmDialog
        abierto
        titulo="Eliminar"
        mensaje="¿Seguro?"
        onConfirmar={onConfirmar}
        onCancelar={onCancelar}
      />
    );

    const backdrop = container.querySelector('.absolute.inset-0');
    fireEvent.click(backdrop);
    expect(onCancelar).not.toHaveBeenCalled();

    fireEvent.click(getByText('Cancelar'));
    expect(onCancelar).toHaveBeenCalledTimes(1);
  });

  it('clic en "Confirmar" llama a onConfirmar', () => {
    const onConfirmar = vi.fn();
    const { getByText } = render(
      <ConfirmDialog abierto titulo="Eliminar" mensaje="¿Seguro?" onConfirmar={onConfirmar} onCancelar={() => {}} />
    );
    fireEvent.click(getByText('Confirmar'));
    expect(onConfirmar).toHaveBeenCalledTimes(1);
  });
});
