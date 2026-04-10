/**
 * ARCHIVO: router/index.jsx
 * PROPÓSITO: Definición de todas las rutas de la aplicación con React Router.
 *
 * MINI-CLASE: React Router y SPA navigation
 * ─────────────────────────────────────────────────────────────────
 * En una SPA (Single Page Application), el navegador no recarga la
 * página al cambiar de ruta. React Router intercepta los clicks en
 * links y renderiza el componente correspondiente sin hacer una
 * petición HTTP al servidor. El Layout envuelve todas las rutas
 * protegidas para mantener sidebar y header visibles. La ruta "*"
 * captura URLs no definidas y redirige al inicio.
 * ─────────────────────────────────────────────────────────────────
 */
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import Inicio from '../pages/Inicio';
import ListadoProyectos from '../pages/proyectos/ListadoProyectos';
import NuevoProyecto from '../pages/proyectos/NuevoProyecto';
import DetalleProyecto from '../pages/proyectos/DetalleProyecto';
import Agenda from '../pages/Agenda';
import Evidencias from '../pages/Evidencias';
import Notificaciones from '../pages/Notificaciones';

export default function AppRouter() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Inicio />} />
        <Route path="proyectos" element={<ListadoProyectos />} />
        <Route path="proyectos/nuevo" element={<NuevoProyecto />} />
        <Route path="proyectos/:id" element={<DetalleProyecto />} />
        <Route path="agenda" element={<Agenda />} />
        <Route path="evidencias" element={<Evidencias />} />
        <Route path="notificaciones" element={<Notificaciones />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
