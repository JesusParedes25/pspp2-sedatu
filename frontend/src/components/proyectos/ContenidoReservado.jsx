/**
 * ARCHIVO: ContenidoReservado.jsx
 * PROPÓSITO: Paso 14 DGTIC — comentarios, documentos/evidencias y riesgos
 *            dejaron de pasar por la visibilidad total entre internos y
 *            ahora exigen participación real (ver
 *            backend/src/utils/alcance-lectura.js,
 *            docs/modelo-permisos.md 5.1). Cuando el backend rechaza con
 *            SIN_PARTICIPACION, la pestaña correspondiente (Comentarios/
 *            Documentos/Riesgos) usa esto en vez de quedarse en blanco o
 *            mostrar un error — mismo lenguaje visual que
 *            SinAccesoProyecto.jsx (candado + texto + botón de solicitar
 *            participación), pero pensado para vivir DENTRO de una
 *            pestaña, no como pantalla completa.
 */
import { Lock } from 'lucide-react';
import BotonSolicitarParticipar from './BotonSolicitarParticipar';

export default function ContenidoReservado({ proyectoId, nodo, permisos, mensaje }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
      <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center mb-3">
        <Lock size={18} className="text-gray-400" />
      </div>
      <p className="text-sm text-gray-500 max-w-sm mb-4">
        {mensaje || 'Este contenido es solo para quienes participan en el proyecto. Si tu trabajo aporta aquí, puedes solicitar participar.'}
      </p>
      <BotonSolicitarParticipar proyecto={{ id: proyectoId }} permisos={permisos} nodo={nodo} />
    </div>
  );
}
