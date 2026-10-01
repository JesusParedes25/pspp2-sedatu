/**
 * ARCHIVO: BitacoraProyectoPage.jsx
 * PROPÓSITO: Ruta /proyectos/:id/bitacora — envoltorio delgado sobre
 *            BitacoraProyecto (que ya hace todo su propio fetch/estado,
 *            solo necesita el id del proyecto desde el contexto de ruta).
 */
import { useOutletContext } from 'react-router-dom';
import BitacoraProyecto from '../../components/seguimiento/BitacoraProyecto';

export default function BitacoraProyectoPage() {
  const { proyectoId } = useOutletContext();
  return <BitacoraProyecto proyectoId={proyectoId} />;
}
