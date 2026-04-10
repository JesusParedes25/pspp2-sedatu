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
    <BrowserRouter>
      <AuthProvider>
        <UIProvider>
          <App />
        </UIProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
