/**
 * ARCHIVO: PanelDrawer.jsx
 * PROPÓSITO: Panel lateral (slide-over) que se abre al hacer clic en un
 *            nodo del Diagrama — dos pestañas, "Propiedades" (avance,
 *            acciones rápidas, lista de hijos navegable y el mismo rail
 *            de PropiedadesElemento que usa "Detalle") y "Actividad"
 *            (ActividadStream). Se llama "Propiedades" y no "Detalle" para
 *            no chocar con el nombre de la subpestaña "Detalle" de al lado.
 */
import { useEffect, useState } from 'react';
import { X, ChevronRight } from 'lucide-react';
import NodoCard from '../../nodos/NodoCard';
import ActividadStream from '../../nodos/ActividadStream';
import PropiedadesElemento from '../PropiedadesElemento';
import CrearInline from '../EtapasAvancesMD/CrearInline';
import { COLORES_SEMAFORO, CHIP_BG } from '../../common/SemaforoDot';

const TIPO_LABEL = { etapa: 'ETAPA', accion: 'ACCIÓN', tarea: 'TAREA' };
const TIPO_HIJO = { etapa: 'accion', accion: 'tarea' };
const TIPO_HIJO_LABEL = { accion: 'Acción', tarea: 'Tarea' };

// Sin backdrop a pantalla completa a propósito: a diferencia del rail móvil
// de "Detalle" (que sí necesita bloquear todo lo de atrás), aquí el lienzo
// debe seguir siendo interactivo con el drawer abierto — clic en otro nodo
// simplemente cambia el contenido del drawer, y clic en el lienzo vacío lo
// cierra (ver onPaneClick en index.jsx). Un backdrop bloqueante tapaba el
// NodeToolbar flotante del nodo seleccionado e interceptaba sus clics.
export default function PanelDrawer({ nodo, proyectoId, permisos, onActualizado, mostrarToast, onCerrar, onNavegar }) {
  const { tipo, id, data } = nodo;
  const [tab, setTab] = useState('propiedades');

  useEffect(() => {
    function onKeyDown(e) { if (e.key === 'Escape') onCerrar(); }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCerrar]);

  const sem = data.semaforo_efectivo || 'gris';
  const estado = data.estado || 'Pendiente';
  const avance = data.avance_efectivo ?? (tipo === 'etapa' ? parseFloat(data.porcentaje_calculado || 0) : parseFloat(data.porcentaje_avance || 0));
  const esContenedor = tipo === 'etapa' || data.es_hoja === false;
  const tipoHijo = TIPO_HIJO[tipo] || null;
  const tipoHijoLabel = TIPO_HIJO_LABEL[tipoHijo] || null;

  const hijos = tipo === 'etapa'
    ? (data.acciones || [])
    : tipo === 'accion'
      ? [...(data.subacciones || []), ...(data.tareas || [])]
      : [];

  const completadosHijos = hijos.filter(h => h.estado === 'Completada').length;

  return (
    <aside className="fixed right-0 top-0 bottom-0 w-full sm:w-[44vw] sm:max-w-[640px] sm:min-w-[420px] bg-white z-40 shadow-2xl flex flex-col border-l border-gray-200">
      <div className="relative px-4 pt-3.5 border-b border-gray-100 flex-shrink-0">
        <button onClick={onCerrar} className="absolute top-2.5 right-2.5 p-1.5 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100">
          <X size={16} />
        </button>

        <div className="flex items-center gap-1.5 flex-wrap pr-8 mb-2">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#7B1C3E] text-white uppercase tracking-wider">
            {TIPO_LABEL[tipo]}
          </span>
          <span
            className="text-[10px] font-semibold px-2 py-0.5 rounded"
            style={{ backgroundColor: CHIP_BG[sem], color: COLORES_SEMAFORO[sem] }}
          >
            {estado.replace(/_/g, ' ')}
          </span>
          {esContenedor && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-500">calculado</span>
          )}
          {data.prioridad && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-500">{data.prioridad}</span>
          )}
        </div>

        <p className="text-base font-bold text-gray-900 leading-snug mb-3" title={data.nombre}>{data.nombre}</p>

        <div className="flex items-center gap-4">
          <button
            onClick={() => setTab('propiedades')}
            className={`text-[13px] font-semibold pb-2.5 border-b-2 -mb-px transition-colors ${
              tab === 'propiedades' ? 'text-[#7B1C3E] border-[#7B1C3E]' : 'text-gray-400 border-transparent hover:text-gray-600'
            }`}
          >
            Propiedades
          </button>
          <button
            onClick={() => setTab('actividad')}
            className={`text-[13px] font-semibold pb-2.5 border-b-2 -mb-px transition-colors ${
              tab === 'actividad' ? 'text-[#7B1C3E] border-[#7B1C3E]' : 'text-gray-400 border-transparent hover:text-gray-600'
            }`}
          >
            Actividad
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'propiedades' ? (
          <>
            {/* ── Avance destacado ── */}
            <div className="px-4 pt-4 pb-1">
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-2xl font-bold tabular-nums" style={{ color: COLORES_SEMAFORO[sem] }}>
                  {Math.round(avance)}%
                </span>
                {hijos.length > 0 && (
                  <span className="text-[11px] text-gray-400">
                    {completadosHijos} de {hijos.length} {(tipoHijoLabel || '').toLowerCase()}
                    {hijos.length > 1 ? 's' : ''} completada{hijos.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${Math.min(avance, 100)}%`, backgroundColor: COLORES_SEMAFORO[sem] }} />
              </div>
            </div>

            {/* ── Acciones rápidas + secciones contextuales (comentar, adjuntar, riesgos, territorio…) ── */}
            <div className="px-3 pt-3">
              <NodoCard
                tipo={tipo}
                nodo={data}
                esContenedor={esContenedor}
                proyectoId={proyectoId}
                permisos={permisos}
                onCambiado={onActualizado}
                ocultarMetadataFooter
                ocultarCabecera
                defaultAbierto
              />
            </div>

            {/* ── Lista de hijos — navegación sin salir del drawer ── */}
            {tipoHijo && (
              <div className="px-3 pt-3">
                {hijos.length > 0 && (
                  <div className="space-y-1.5 mb-2">
                    {hijos.map(h => (
                      <button
                        key={h.id}
                        onClick={() => onNavegar(h.id)}
                        title={h.nombre}
                        className="w-full flex items-center gap-2 px-2.5 py-2 border border-gray-200 rounded-lg hover:border-[#7B1C3E] hover:bg-[#7B1C3E]/5 text-left transition-colors"
                      >
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORES_SEMAFORO[h.semaforo_efectivo || 'gris'] }} />
                        <span className="flex-1 min-w-0 text-xs text-gray-700 truncate">{h.nombre}</span>
                        <span className="text-xs font-medium text-gray-500 flex-shrink-0 tabular-nums">
                          {Math.round(h.avance_efectivo ?? h.porcentaje_avance ?? h.porcentaje_calculado ?? 0)}%
                        </span>
                        <ChevronRight size={12} className="text-gray-300 flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
                {permisos.puedeCrearAccion && (
                  <CrearInline tipo={tipoHijo} padreId={id} proyectoId={proyectoId} onCreado={onActualizado} />
                )}
              </div>
            )}

            <div className="pt-2 pb-3 border-t border-gray-100 mt-2">
              <PropiedadesElemento
                nodo={nodo}
                permisos={permisos}
                onActualizado={onActualizado}
                mostrarToast={mostrarToast}
              />
            </div>
          </>
        ) : (
          <div className="px-3 py-3">
            <ActividadStream tipo={tipo} id={id} />
          </div>
        )}
      </div>
    </aside>
  );
}
