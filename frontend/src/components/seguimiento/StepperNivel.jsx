/**
 * ARCHIVO: StepperNivel.jsx
 * PROPÓSITO: Indicador visual de profundidad — Proyecto › Etapa › Acción ›
 *            Tarea — en la columna central de Detalle. Reemplaza a
 *            LadderJerarquia (texto con el nivel actual en color): aquí
 *            cada nivel es un círculo con su propio ícono, y el estado se
 *            lee de un vistazo — relleno + halo el nivel actual, relleno
 *            liso los ya recorridos (siempre Proyecto y lo que esté antes
 *            del actual), punteado y vacío los que faltan, con su
 *            etiqueta genérica (no hay nada seleccionado ahí todavía). La
 *            estructura es siempre la misma — 4 pasos fijos — sin
 *            importar en qué nodo del árbol esté el usuario, para que la
 *            profundidad se lea siempre en el mismo lugar.
 */
import { FolderKanban } from 'lucide-react';
import { ORDEN_NIVELES, NIVELES } from '../../config/niveles';

const PASO_PROYECTO = { label: 'Proyecto', icono: FolderKanban, color: '#374151' };
const PASOS = ['proyecto', ...ORDEN_NIVELES];

export default function StepperNivel({ tipoActual, compacto = false }) {
  const idxActual = PASOS.indexOf(tipoActual);
  const tam = compacto ? 20 : 24;
  const tamIcono = compacto ? 10 : 12;

  return (
    <div className="flex items-center" aria-label="Nivel en la jerarquía del proyecto">
      {PASOS.map((tipo, i) => {
        const nivel = tipo === 'proyecto' ? PASO_PROYECTO : NIVELES[tipo];
        const Icono = nivel.icono;
        const esActual = i === idxActual;
        const esFuturo = i > idxActual;

        return (
          <div key={tipo} className="flex items-center">
            {i > 0 && (
              <div
                className={`${compacto ? 'w-3' : 'w-5'} h-px flex-shrink-0`}
                style={esFuturo ? { borderTop: '1px dashed #d1d5db' } : { backgroundColor: '#d1d5db' }}
                aria-hidden="true"
              />
            )}
            <div className="flex flex-col items-center gap-0.5" title={nivel.label}>
              <div
                className="flex items-center justify-center rounded-full flex-shrink-0"
                style={{
                  width: tam, height: tam,
                  backgroundColor: esFuturo ? '#fff' : nivel.color,
                  border: esFuturo ? '1.5px dashed #d1d5db' : 'none',
                  boxShadow: esActual ? `0 0 0 3px ${nivel.color}33` : 'none',
                }}
              >
                <Icono size={tamIcono} color={esFuturo ? '#d1d5db' : '#fff'} aria-hidden="true" />
              </div>
              {!compacto && (
                <span
                  className="text-[9px] font-medium leading-none"
                  style={{ color: esFuturo ? '#d1d5db' : esActual ? nivel.color : '#6b7280' }}
                >
                  {nivel.label}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
