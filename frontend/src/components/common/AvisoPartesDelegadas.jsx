/**
 * ARCHIVO: AvisoPartesDelegadas.jsx
 * PROPÓSITO: Aviso para quien administra un proyecto cuando su lista de
 *            "Mis actividades"/Agenda quedó más chica porque delegó una
 *            etapa/acción/tarea a otra persona — la regla del "dueño más
 *            cercano" (docs/modelo-permisos.md, sección 16) deja de
 *            mostrarle lo delegado, y sin este aviso parecería que esas
 *            actividades simplemente se perdieron. No sustituye ningún
 *            permiso: quien delegó sigue pudiendo abrir y editar lo
 *            delegado, solo deja de aparecer en SU lista de pendientes.
 *
 * Mismo lenguaje visual que el toast "info" (bg-blue-50/border-blue-200,
 * icono Info) — es la convención ya establecida en la app para avisos
 * informativos, no una paleta nueva.
 */
import { Info } from 'lucide-react';

export default function AvisoPartesDelegadas({ visible }) {
  if (!visible) return null;
  return (
    <div className="flex items-start gap-2 text-xs text-blue-800 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
      <Info size={14} className="flex-shrink-0 text-blue-500 mt-0.5" />
      <span>No se muestran las partes que delegaste a otras personas. Puedes seguir abriéndolas y editándolas desde el proyecto; solo dejaron de aparecer aquí.</span>
    </div>
  );
}
