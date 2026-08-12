/**
 * ARCHIVO: main.jsx
 * PROPÓSITO: Punto de entrada de la app React. Monta el árbol de componentes.
 *
 * MINI-CLASE: React.StrictMode y el árbol de providers
 * ─────────────────────────────────────────────────────────────────
 * StrictMode ejecuta efectos y renders dos veces en desarrollo para
 * detectar bugs sutiles (no afecta producción). BrowserRouter
 * habilita React Router para SPA navigation. AuthProvider y
 * UIProvider son Context providers que comparten estado global
 * (usuario autenticado, toasts) sin pasar props manualmente.
 * ─────────────────────────────────────────────────────────────────
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { UIProvider } from './context/UIContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* basename toma la misma ruta base del build (vite.config.js →
        `base`, expuesta como import.meta.env.BASE_URL). Sin esto, un build
        servido bajo un subpath (p. ej. /pspp/) rompía el ruteo: las rutas
        están declaradas sin prefijo, así que ninguna coincidía y todo caía
        en el catch-all que redirige al Tablero. Con base '/' (el caso
        actual) BASE_URL es '/' y esto no cambia nada. */}
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthProvider>
        <UIProvider>
          <App />
        </UIProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
