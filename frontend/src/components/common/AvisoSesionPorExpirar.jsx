/**
 * ARCHIVO: AvisoSesionPorExpirar.jsx
 * PROPÓSITO: Aviso 5 minutos antes de que la sesión caduque por
 *            inactividad, con un botón para seguir conectado.
 *
 * NOTA TÉCNICA: por qué existe
 * ─────────────────────────────────────────────────────────────────
 * La plataforma está llena de formularios largos (capturar avance,
 * registrar un riesgo, importar). Cerrar la sesión sin avisar perdería
 * lo que no se hubiera guardado todavía. Este aviso le da a la persona
 * una salida antes de que eso pase — ver useSesionActividad.js, que
 * decide CUÁNDO mostrarlo (5 min antes de expiraEn) y qué hace
 * "Seguir conectado" (renovar el token).
 * ─────────────────────────────────────────────────────────────────
 */
import { Clock } from 'lucide-react';
import { useSesionActividad } from '../../hooks/useSesionActividad';

function formatearRestante(segundos) {
  if (segundos === null) return '';
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function AvisoSesionPorExpirar() {
  const { mostrarAviso, segundosRestantes, continuarSesion } = useSesionActividad();

  if (!mostrarAviso) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4">
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-aviso-sesion"
      >
        <div className="flex items-start gap-3 px-6 pt-6 pb-4">
          <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0">
            <Clock size={18} className="text-amber-600" />
          </div>
          <div className="min-w-0">
            <h3 id="titulo-aviso-sesion" className="text-base font-semibold text-gray-900">
              Tu sesión está por cerrarse
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Por inactividad, en {formatearRestante(segundosRestantes)} minutos. Guarda lo que tengas abierto.
            </p>
          </div>
        </div>

        <div className="flex justify-end px-6 py-4 border-t border-gray-100">
          <button
            onClick={continuarSesion}
            className="px-4 py-2 text-sm font-medium text-white bg-guinda-600 rounded-lg hover:bg-guinda-700"
          >
            Seguir conectado
          </button>
        </div>
      </div>
    </div>
  );
}
