/**
 * ARCHIVO: PanelDetalle.jsx
 * PROPÓSITO: Columna central (identidad de nivel de la rama ENFOCADA,
 *            lista de hijos navegable/expandible, Actividad al fondo
 *            atada a la SELECCIÓN) + rail derecho (ficha de la selección).
 *            "Foco" es la rama que muestra el centro (cambia solo desde el
 *            árbol izquierdo o el lineage); "selección" es el elemento
 *            cuya ficha muestra la derecha y cuya actividad muestra el
 *            feed (cambia también al hacer clic en un hijo del centro, sin
 *            mover el foco). Ver EtapasAvancesMD/index.jsx para el estado.
 */
import { useState, useEffect } from 'react';
import { ChevronRight, Layers, X } from 'lucide-react';
import { useJerarquiaProyecto } from '../../../hooks/useJerarquiaProyecto';
import ActividadStream from '../../nodos/ActividadStream';
import { COLORES_SEMAFORO } from '../../common/SemaforoDot';
import { NIVELES } from '../../../config/niveles';
import EmblemaNivel from '../EmblemaNivel';
import LadderJerarquia from '../LadderJerarquia';
import LineageClicable from '../LineageClicable';
import FichaNodo from '../FichaNodo';
import ListaHijos from '../ListaHijos';
import { CampoTextoInline } from './Campos';
import { resolverRutaConIds, hijosDe } from './utils';

export default function PanelDetalle({
  foco, seleccion, proyectoId, permisos, onActualizado, mostrarToast, arbol,
  expandidosCentro, onToggleCentro, onSeleccionarEnCentro, onNavegarFoco, onAbrirArbol,
}) {
  const { tipo, id, data } = foco;
  const { actualizar } = useJerarquiaProyecto(proyectoId);
  const [railAbierto, setRailAbierto] = useState(false);
  const [descExpandida, setDescExpandida] = useState(false);

  useEffect(() => { setDescExpandida(false); setRailAbierto(false); }, [id]);

  const nivel = NIVELES[tipo];
  const sem = data.semaforo_efectivo || 'gris';
  const avance = data.avance_efectivo ?? (tipo === 'etapa' ? parseFloat(data.porcentaje_calculado || 0) : parseFloat(data.porcentaje_avance || 0));
  const esContenedor = tipo === 'etapa' || (data.es_hoja === false);
  const hijos = hijosDe(tipo, data);

  // ─── PATCH handler (título/descripción de la columna central) ───
  async function guardarCampo(campo, valor) {
    try {
      await actualizar(tipo, id, campo, valor);
      mostrarToast('Actualizado', 'exito');
      onActualizado?.();
    } catch (err) {
      mostrarToast(err.response?.data?.mensaje || 'Error al actualizar', 'error');
    }
  }

  const rutaFoco = resolverRutaConIds(arbol, id) || [{ tipo, id, nombre: data.nombre }];
  const rutaSeleccion = seleccion.id === id ? rutaFoco : (resolverRutaConIds(arbol, seleccion.id) || [{ tipo: seleccion.tipo, id: seleccion.id, nombre: seleccion.data.nombre }]);

  const resumenHijos = (() => {
    if (hijos.length === 0) return null;
    const completadas = hijos.filter(h => h.nodo.estado === 'Completada').length;
    return `${completadas} de ${hijos.length} ${(nivel.hijoLabelPlural || '').toLowerCase()} completadas`;
  })();

  return (
    <div className="flex flex-1 min-w-0 overflow-hidden h-full">

      {/* ── COLUMNA CENTRAL ─────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* Cabecera pegajosa de la rama ENFOCADA — no cambia al seleccionar
            hijos, solo al elegir otra rama en el árbol o navegar la ruta. */}
        <div className="flex-shrink-0 px-5 pt-4 border-b border-gray-100">
          <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap min-w-0">
              <LadderJerarquia tipoActual={tipo} compacto />
              <LineageClicable ruta={rutaFoco} onNavegar={onNavegarFoco} />
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={onAbrirArbol}
                className="lg:hidden flex items-center gap-1 text-[10px] border border-gray-200 px-2 py-0.5 rounded text-gray-500 hover:bg-gray-50 transition-colors"
                title="Ver estructura"
              >
                <Layers size={10} />
              </button>
              <button
                onClick={() => setRailAbierto(v => !v)}
                className="xl:hidden flex items-center gap-1 text-[10px] border border-gray-200 px-2 py-0.5 rounded text-gray-500 hover:bg-gray-50 transition-colors"
              >
                Propiedades {railAbierto ? <X size={10} /> : <ChevronRight size={10} />}
              </button>
            </div>
          </div>

          <div className="mb-2.5">
            <EmblemaNivel tipo={tipo} esContenedor={esContenedor} estado={data.estado} sem={sem} />
          </div>

          <CampoTextoInline
            valor={data.nombre}
            campo="nombre"
            onGuardar={v => guardarCampo('nombre', v)}
            soloLectura={permisos.esSoloLectura}
            className="text-xl font-bold text-gray-900 leading-tight"
          />

          <div className="mt-1.5 mb-1">
            {permisos.esSoloLectura ? (
              <>
                <p className={`text-xs text-gray-500 leading-relaxed ${descExpandida ? '' : 'line-clamp-2'}`}>
                  {data.descripcion || <span className="italic text-gray-300">Sin descripción…</span>}
                </p>
                {(data.descripcion || '').length > 100 && (
                  <button onClick={() => setDescExpandida(v => !v)} className="text-[10px] text-[#7B1C3E] hover:text-[#5a1430] font-medium">
                    {descExpandida ? 'Ver menos' : 'Ver más'}
                  </button>
                )}
              </>
            ) : (
              <CampoTextoInline
                valor={data.descripcion || ''}
                campo="descripcion"
                onGuardar={v => guardarCampo('descripcion', v)}
                soloLectura={false}
                placeholder="Agregar descripción…"
                className="text-xs text-gray-500"
                multiline
              />
            )}
          </div>

          <div className="mt-2 flex items-center gap-3">
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${Math.min(avance, 100)}%`, backgroundColor: COLORES_SEMAFORO[sem] }}
              />
            </div>
            <span className="text-sm font-bold tabular-nums w-10 text-right" style={{ color: COLORES_SEMAFORO[sem] }}>
              {Math.round(avance)}%
            </span>
          </div>
          {resumenHijos && (
            <p className="text-[10px] text-gray-400 mt-1">{resumenHijos}</p>
          )}
        </div>

        {/* Lista de navegación de la rama enfocada (expande en sitio, sin
            botones de acción) + Actividad al fondo, atada a la SELECCIÓN */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          <ListaHijos
            tipo={tipo}
            esContenedor={esContenedor}
            hijos={hijos}
            expandidos={expandidosCentro}
            onToggle={onToggleCentro}
            seleccionId={seleccion.id}
            onSeleccionar={onSeleccionarEnCentro}
          />
          <ActividadStream tipo={seleccion.tipo} id={seleccion.id} titulo={seleccion.data.nombre} />
        </div>
      </div>

      {/* ── RAIL DERECHO — ficha de la SELECCIÓN ────────────────── */}
      {railAbierto && (
        <div
          className="fixed inset-0 bg-black/20 z-20 xl:hidden"
          onClick={() => setRailAbierto(false)}
        />
      )}
      <aside
        className={[
          'flex-shrink-0 border-l border-gray-200 bg-white overflow-hidden flex flex-col',
          'xl:w-[44vw] xl:max-w-[640px] xl:min-w-[420px] xl:relative xl:translate-x-0',
          railAbierto
            ? 'fixed right-0 top-0 bottom-0 w-[320px] max-w-[85vw] z-30 shadow-2xl translate-x-0'
            : 'fixed right-0 top-0 bottom-0 w-[320px] max-w-[85vw] z-30 shadow-2xl translate-x-full xl:translate-x-0',
          'transition-transform duration-200',
        ].join(' ')}
      >
        <div className="xl:hidden flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex-shrink-0">
          <span className="text-xs font-semibold text-gray-600">Propiedades</span>
          <button onClick={() => setRailAbierto(false)} className="p-1 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-200">
            <X size={14} />
          </button>
        </div>
        <FichaNodo
          key={seleccion.id}
          nodo={seleccion}
          proyectoId={proyectoId}
          permisos={permisos}
          ruta={rutaSeleccion}
          // Los ancestros que se ven aquí siempre están dentro de la rama ya
          // enfocada (la selección nunca sale de ahí) — así que subir de
          // nivel desde la ficha solo mueve la selección, no reconstruye el
          // centro ni resetea qué está expandido. Refocar de verdad solo
          // pasa desde el árbol o desde el lineage del propio encabezado
          // central (onNavegarFoco, arriba).
          onNavegarLineage={onSeleccionarEnCentro}
          onActualizado={onActualizado}
          mostrarToast={mostrarToast}
        />
      </aside>
    </div>
  );
}
