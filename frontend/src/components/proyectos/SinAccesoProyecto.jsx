/**
 * ARCHIVO: SinAccesoProyecto.jsx
 * PROPÓSITO: Paso 12 DGTIC — la visibilidad de proyecto ahora también
 *            restringe la lectura (antes solo restringía captura), así
 *            que abrir un proyecto al que no se tiene acceso ya no
 *            carga su contenido. Esta pantalla reemplaza por completo
 *            al encabezado + secciones de DetalleProyectoLayout.jsx
 *            cuando eso pasa: nunca muestra avance, etapas ni actividad
 *            de un proyecto que la persona no puede ver — solo lo
 *            mínimo para orientarse (nombre, DG) y el mismo botón de
 *            solicitar participación que ya existe en "Participantes".
 *
 * Los listados (Inicio, Tablero, /proyectos) siguen mostrando el nombre
 * de todos los proyectos a propósito — esta pantalla es la otra mitad
 * de ese trato: se puede saber que el proyecto existe sin poder ver su
 * contenido, y siempre queda la vía de pedir acceso.
 */
import { Lock } from 'lucide-react';
import BotonSolicitarParticipar from './BotonSolicitarParticipar';

export default function SinAccesoProyecto({ proyecto, permisos }) {
  const dg = proyecto?.dg_lider_siglas
    ? `${proyecto.dg_lider_siglas}${proyecto.direccion_area_lider_siglas ? ` / ${proyecto.direccion_area_lider_siglas}` : ''}`
    : null;

  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
        <Lock size={28} className="text-gray-400" />
      </div>
      <h1 className="text-lg font-semibold text-gray-900 mb-1 max-w-md">{proyecto?.nombre || 'Este proyecto'}</h1>
      {dg && <p className="text-sm font-medium text-guinda-600 mb-3">{dg}</p>}
      <p className="text-sm text-gray-500 max-w-sm mb-5">
        No tienes acceso a este proyecto. Si tu trabajo aporta aquí, puedes solicitar participar.
      </p>
      <BotonSolicitarParticipar proyecto={proyecto} permisos={permisos} />
    </div>
  );
}
