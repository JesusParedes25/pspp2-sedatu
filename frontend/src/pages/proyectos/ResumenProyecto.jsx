/**
 * ARCHIVO: ResumenProyecto.jsx
 * PROPÓSITO: Ruta /proyectos/:id/resumen — antes "Panorama del
 *            proyecto". Envuelve PanoramaProyecto (sin cambios internos)
 *            y traduce sus clics en nodos/riesgos a la ruta real de
 *            Seguimiento (antes era un cambio de pestaña en la misma
 *            página vía ?tab=&nodo=&riesgo=).
 */
import { useNavigate, useOutletContext } from 'react-router-dom';
import PanoramaProyecto from '../../components/seguimiento/PanoramaProyecto';
import { irANodoProyecto } from '../../utils/navegacionProyecto';

export default function ResumenProyecto() {
  const { proyecto, etapas, proyectoId, statsKey } = useOutletContext();
  const navigate = useNavigate();

  function onNavegarNodo(nodoId, riesgoId) {
    irANodoProyecto(navigate, proyectoId, nodoId, riesgoId);
  }

  return (
    <PanoramaProyecto proyecto={proyecto} etapas={etapas} proyectoId={proyectoId} refreshKey={statsKey} onNavegarNodo={onNavegarNodo} />
  );
}
