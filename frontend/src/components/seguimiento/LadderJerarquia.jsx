/**
 * ARCHIVO: LadderJerarquia.jsx
 * PROPÓSITO: "Escalera de tipos" — Etapa › Acción › Tarea, con el nivel
 *            actual resaltado en su color. Responde "¿qué clase de nivel
 *            es este, y qué existe arriba/abajo?" — complementa al lineage
 *            (que responde "¿cuál es mi parentela concreta?").
 */
import { ORDEN_NIVELES, NIVELES } from '../../config/niveles';

export default function LadderJerarquia({ tipoActual, compacto = false }) {
  return (
    <div className={`flex items-center gap-1 ${compacto ? 'text-[10px]' : 'text-xs'}`} aria-label="Jerarquía de niveles">
      {ORDEN_NIVELES.map((tipo, i) => {
        const nivel = NIVELES[tipo];
        const activo = tipo === tipoActual;
        const Icono = nivel.icono;
        return (
          <span key={tipo} className="flex items-center gap-1">
            {i > 0 && <span className="text-gray-300" aria-hidden="true">›</span>}
            <span
              className="flex items-center gap-1 font-medium"
              style={{ color: activo ? nivel.color : '#9ca3af' }}
              aria-current={activo ? 'true' : undefined}
            >
              <Icono size={compacto ? 10 : 12} aria-hidden="true" />
              {nivel.label}
            </span>
          </span>
        );
      })}
    </div>
  );
}
