// @vitest-environment jsdom
/**
 * ARCHIVO: index.test.jsx
 * PROPÓSITO: AppRouter — cuando hay sesión (App.jsx ya decidió montar este
 *            router en vez de <Login/>) y la URL sigue en /login, no debe
 *            caer en el comodín "*" (Página no encontrada). Pasaba en dos
 *            momentos reales: justo después de un login exitoso (la URL no
 *            cambia sola, App.jsx solo cambia de <Login/> a este router) y
 *            cuando alguien ya autenticado entra a /login a mano. Antes
 *            /login no estaba registrada en ninguna parte de este árbol de
 *            rutas, así que ambos casos terminaban en el 404.
 *
 * Layout e Inicio se mockean para aislar la decisión de ruteo (a qué
 * elemento resuelve /login) de sus propias dependencias de datos — mismo
 * criterio que Header.test.jsx usa para su propia prueba de rutas.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AppRouter from '../index';

afterEach(cleanup);

vi.mock('../../components/layout/Layout', async () => {
  const { Outlet } = await import('react-router-dom');
  return { default: () => <Outlet /> };
});

vi.mock('../../pages/Inicio', () => ({
  default: () => <div>INICIO_STUB</div>,
}));

function renderAppRouterEn(pathname) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <AppRouter />
    </MemoryRouter>
  );
}

describe('AppRouter — /login con sesión activa', () => {
  it('justo después de un login exitoso (router ya montado, URL todavía en /login) no se queda en /login ni muestra el 404', () => {
    renderAppRouterEn('/login');
    expect(screen.getByText('INICIO_STUB')).toBeInTheDocument();
    expect(screen.queryByText('Página no encontrada')).not.toBeInTheDocument();
  });

  it('una persona ya autenticada que entra a /login por cualquier motivo es redirigida a Inicio, nunca ve el 404', () => {
    renderAppRouterEn('/login');
    expect(screen.getByText('INICIO_STUB')).toBeInTheDocument();
  });

  it('una ruta de verdad no mapeada sigue mostrando el 404 (el comodín no desapareció)', () => {
    renderAppRouterEn('/esto-no-existe');
    expect(screen.getByText('Página no encontrada')).toBeInTheDocument();
  });
});
