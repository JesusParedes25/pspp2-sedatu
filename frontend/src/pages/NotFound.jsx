/**
 * ARCHIVO: NotFound.jsx
 * PROPÓSITO: Página para rutas que no existen. Antes el catch-all "*" del
 *            router redirigía en silencio al Tablero — quien seguía un
 *            enlace roto o viejo terminaba en Inicio sin ningún aviso de
 *            que la dirección a la que intentaba entrar no existe.
 */
import { useNavigate } from 'react-router-dom';
import { FileQuestion } from 'lucide-react';
import EmptyState from '../components/common/EmptyState';

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <EmptyState
      icono={FileQuestion}
      titulo="Página no encontrada"
      subtitulo="La dirección a la que intentas entrar no existe o ya no está disponible."
      accion="Ir al Tablero"
      onAccion={() => navigate('/')}
    />
  );
}
