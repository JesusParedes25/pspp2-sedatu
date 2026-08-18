/**
 * ARCHIVO: ModalEliminarProyecto.jsx
 * PROPÓSITO: Confirmación de eliminación de proyecto (soft delete) con
 *            varios avisos explícitos — el proyecto no se borra al
 *            instante: queda oculto y solo un superadmin puede
 *            restaurarlo desde la Papelera durante 30 días, tras los
 *            cuales se purga de forma permanente e irreversible.
 *
 * MINI-CLASE: cuánta fricción merece una acción destructiva
 * ─────────────────────────────────────────────────────────────────
 * Este modal pedía además escribir el nombre exacto del proyecto. Se
 * quitó: los nombres aquí son títulos largos de proyectos de gobierno
 * ("Análisis de aptitud territorial de suelo para vivienda en núcleos
 * agrarios de las 92 Zonas Metropolitanas"), así que transcribirlos no
 * hacía pensar a nadie — se copiaba y pegaba. La fricción caía sobre
 * quien sí tenía que borrar, y no frenaba al distraído.
 *
 * Queda la casilla, que es la que obliga a leer la consecuencia, y el
 * hecho de que el borrado es reversible 30 días. Eso es proporcional
 * al daño posible.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';

export default function ModalEliminarProyecto({ proyecto, onCerrar, onConfirmar, eliminando }) {
  const [entendido, setEntendido] = useState(false);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4" onClick={onCerrar}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <AlertTriangle size={17} className="text-red-500" />
            <h2 className="text-sm font-bold text-gray-900">Eliminar proyecto</h2>
          </div>
          <button onClick={onCerrar} className="p-1 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <p className="text-sm text-gray-700">
            Estás a punto de eliminar <strong>"{proyecto.nombre}"</strong>, con todas sus etapas, acciones, tareas, archivos, comentarios y riesgos.
          </p>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1.5">
            <p className="text-xs text-amber-800">⚠ El proyecto <strong>desaparecerá de inmediato</strong> para todos los usuarios.</p>
            <p className="text-xs text-amber-800">⏳ Quedará guardado en la papelera <strong>30 días</strong> — durante ese tiempo, puedes mandar correo a <strong>jesus.paredes@sedatu.gob.mx</strong> para restaurarlo desde Administración.</p>
            <p className="text-xs text-amber-800">🗑 Pasados los 30 días se <strong>borra de forma permanente e irreversible</strong></p>
          </div>

          <label className="flex items-start gap-2 text-xs text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={entendido}
              onChange={e => setEntendido(e.target.checked)}
              className="mt-0.5"
              autoFocus
            />
            Entiendo que esta acción oculta el proyecto de inmediato y que, pasados 30 días, se elimina para siempre.
          </label>
        </div>

        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-gray-100 bg-gray-50 rounded-b-xl">
          <button onClick={onCerrar} className="px-3.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg">
            Cancelar
          </button>
          <button
            onClick={onConfirmar}
            disabled={!entendido || eliminando}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {eliminando && <Loader2 size={12} className="animate-spin" />}
            Sí, eliminar proyecto
          </button>
        </div>
      </div>
    </div>
  );
}
