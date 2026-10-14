/**
 * ARCHIVO: BandaConsulta.jsx
 * PROPÓSITO: Fase 3 del modelo de permisos (docs/modelo-permisos.md,
 *            "estado de consulta en la interfaz") — reemplaza la fila de
 *            acciones (Registrar avance/Agregar hijo/Más acciones) cuando
 *            el usuario no tiene captura en este nodo. Los botones se
 *            QUITAN, no se deshabilitan: uno apagado invita a un clic que
 *            nunca responde. El criterio de "sin captura aquí" es el
 *            mismo `permisos.esSoloLectura` por nodo que ya usaba
 *            FilaAcciones para deshabilitar sus propios controles —
 *            PanelDetalle.jsx decide cuál de las dos mostrar, ninguna
 *            calcula el permiso por su cuenta.
 *
 * El panel de detalle en sí NO se atenúa (solo el árbol) — esta banda es
 * texto normal, a opacidad plena: aquí es donde la persona está leyendo,
 * y apagarlo haría incómodo lo único que sí puede hacer.
 */
import BotonSolicitarParticipar from '../../proyectos/BotonSolicitarParticipar';

const ETIQUETA_TIPO = { etapa: 'esta etapa', accion: 'esta acción', tarea: 'esta tarea', proyecto: 'este proyecto' };

export default function BandaConsulta({ tipo, nodo, proyecto, permisosProyecto }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4 p-3 rounded-lg border border-gray-200 bg-gray-50">
      <p className="text-[12px] text-gray-600 leading-relaxed">
        Estás en modo consulta. No participas en {ETIQUETA_TIPO[tipo] || 'este elemento'}. Puedes leer
        todo lo que hay aquí, incluidos documentos, riesgos y bitácora, pero no registrar avances ni
        adjuntar archivos.
      </p>
      <BotonSolicitarParticipar
        proyecto={proyecto}
        permisos={permisosProyecto}
        nodo={{ tipo, id: nodo.id, nombre: nodo.nombre }}
        className="flex-shrink-0"
      />
    </div>
  );
}
