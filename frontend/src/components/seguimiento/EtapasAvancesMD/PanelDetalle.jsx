/**
 * ARCHIVO: PanelDetalle.jsx
 * PROPÓSITO: Columna central del nodo seleccionado (breadcrumb, título,
 *            descripción, avance, hijos, actividad) en la vista Detalle,
 *            más el contenedor del rail — el contenido del rail en sí vive
 *            en PropiedadesElemento (compartido con la futura vista
 *            Diagrama, que lo monta en un drawer en vez de esta columna).
 */
import { useState, useEffect } from 'react';
import { ChevronRight, Lock, Layers, X } from 'lucide-react';
import { useJerarquiaProyecto } from '../../../hooks/useJerarquiaProyecto';
import NodoCard from '../../nodos/NodoCard';
import ActividadStream from '../../nodos/ActividadStream';
import { estaVencida } from '../../../utils/fecha';
import { COLORES_SEMAFORO } from '../../common/SemaforoDot';
import PropiedadesElemento from '../PropiedadesElemento';
import CrearInline from './CrearInline';
import { CampoTextoInline } from './Campos';
import { resolverRutaNombres } from './utils';

export default function PanelDetalle({ nodo, proyectoId, permisos, onActualizado, mostrarToast, arbol, onSeleccionarNodo, onAbrirArbol }) {
  const { tipo, id, data } = nodo;
  const { actualizar } = useJerarquiaProyecto(proyectoId);
  const [railAbierto, setRailAbierto] = useState(false);
  const [descExpandida, setDescExpandida] = useState(false);

  useEffect(() => { setDescExpandida(false); setRailAbierto(false); }, [id]);

  const sem = data.semaforo_efectivo || 'gris';
  const avance = data.avance_efectivo ?? (tipo === 'etapa' ? parseFloat(data.porcentaje_calculado || 0) : parseFloat(data.porcentaje_avance || 0));
  const esContenedor = tipo === 'etapa' || (data.es_hoja === false);
  const tipoLabel = tipo === 'etapa' ? 'ETAPA' : (tipo === 'tarea' ? 'TAREA' : (data.id_accion_padre ? 'TAREA' : 'ACCIÓN'));

  // Hijos como tarjetas expandibles uniformes (PART 3): etapa → acciones;
  // acción → sus subacciones (acciones anidadas) + tareas (tabla propia).
  const hijos = tipo === 'etapa'
    ? (data.acciones || []).map(a => ({ tipo: 'accion', nodo: a, esContenedor: (a.tareas?.length > 0 || a.subacciones?.length > 0) }))
    : tipo === 'accion'
      ? [
          ...(data.subacciones || []).map(s => ({ tipo: 'accion', nodo: s, esContenedor: (s.tareas?.length > 0) })),
          ...(data.tareas || []).map(t => ({ tipo: 'tarea', nodo: t, esContenedor: false })),
        ]
      : [];
  const subItemLabel = tipo === 'etapa' ? 'Acciones' : 'Tareas';

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

  // Ruta de contexto (breadcrumb): a qué etapa/acción pertenece este nodo,
  // para no depender de mirar el panel central para saberlo.
  const ruta = resolverRutaNombres(arbol, id) || [data.nombre];

  // Resumen cuantitativo de hijos (solo si el nodo agrega de otros) — le da
  // respaldo concreto al % calculado sin tener que expandir el árbol.
  const resumenHijos = (() => {
    if (hijos.length === 0) return null;
    const completadas = hijos.filter(h => h.nodo.estado === 'Completada').length;
    const vencidas = hijos.filter(h =>
      !['Completada', 'Cancelada'].includes(h.nodo.estado) && estaVencida(h.nodo.fecha_limite || h.nodo.fecha_fin)
    ).length;
    const enProceso = hijos.filter(h => h.nodo.estado === 'En_proceso').length;
    let texto = `${completadas} de ${hijos.length} ${subItemLabel.toLowerCase()} completadas`;
    if (vencidas > 0) texto += ` · ${vencidas} vencida${vencidas > 1 ? 's' : ''}`;
    if (enProceso > 0) texto += ` · ${enProceso} en proceso`;
    return texto;
  })();

  return (
    <div className="flex flex-1 min-w-0 overflow-hidden h-full">

      {/* ── COLUMNA CENTRAL ─────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* Cabecera pegajosa */}
        <div className="flex-shrink-0 px-5 pt-4 border-b border-gray-100">
          {/* Fila 0: ruta de contexto — a qué etapa/acción pertenece este nodo */}
          <div className="text-[10px] text-gray-400 font-medium mb-1.5 truncate" title={`${tipoLabel} · ${ruta.join(' → ')}`}>
            {tipoLabel} · {ruta.join(' → ')}
          </div>

          {/* Fila 1: chips de tipo, estado y toggle de propiedades */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#7B1C3E] text-white uppercase tracking-wider">
              {tipoLabel}
            </span>
            {esContenedor && (
              <span className="flex items-center gap-0.5 text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                <Lock size={9} /> calculado
              </span>
            )}
            {data.prioridad && (
              <span className="text-[10px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                {data.prioridad}
              </span>
            )}
            {/* Botones responsive: hamburger árbol (< lg) y toggle rail (< xl) */}
            <div className="ml-auto flex items-center gap-1">
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

          {/* Fila 2: título editable */}
          <CampoTextoInline
            valor={data.nombre}
            campo="nombre"
            onGuardar={v => guardarCampo('nombre', v)}
            soloLectura={permisos.esSoloLectura}
            className="text-xl font-bold text-gray-900 leading-tight"
          />

          {/* Fila 3: descripción con clamp */}
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

          {/* Fila 4: barra de avance */}
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

        {/* Contenido: tarjetas de hijos (o la propia tarjeta si es hoja) + stream de actividad */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {hijos.length > 0 ? (
            <>
              {hijos.map(h => (
                <NodoCard
                  key={h.nodo.id}
                  tipo={h.tipo}
                  nodo={h.nodo}
                  esContenedor={h.esContenedor}
                  proyectoId={proyectoId}
                  permisos={permisos}
                  onCambiado={onActualizado}
                />
              ))}
              {permisos.puedeCrearAccion && (
                <CrearInline tipo={tipo === 'etapa' ? 'accion' : 'tarea'} padreId={id} proyectoId={proyectoId} onCreado={onActualizado} />
              )}
            </>
          ) : (
            <NodoCard
              tipo={tipo}
              nodo={data}
              esContenedor={esContenedor}
              proyectoId={proyectoId}
              permisos={permisos}
              onCambiado={onActualizado}
              ocultarMetadataFooter
              defaultAbierto
            />
          )}
          <ActividadStream tipo={tipo} id={id} />
        </div>
      </div>

      {/* ── RAIL DERECHO ────────────────────────────────────────── */}
      {/* Overlay para slide-over en pantallas < xl */}
      {railAbierto && (
        <div
          className="fixed inset-0 bg-black/20 z-20 xl:hidden"
          onClick={() => setRailAbierto(false)}
        />
      )}
      <aside
        className={[
          'flex-shrink-0 border-l border-gray-200 bg-white overflow-y-auto flex flex-col',
          /* Desktop: siempre visible como columna inline */
          'xl:w-[290px] xl:relative xl:translate-x-0',
          /* Móvil/tablet: slide-over controlado por estado */
          railAbierto
            ? 'fixed right-0 top-0 bottom-0 w-[290px] z-30 shadow-2xl translate-x-0'
            : 'fixed right-0 top-0 bottom-0 w-[290px] z-30 shadow-2xl translate-x-full xl:translate-x-0',
          'transition-transform duration-200',
        ].join(' ')}
      >
        {/* Botón de cierre visible solo en móvil */}
        <div className="xl:hidden flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex-shrink-0">
          <span className="text-xs font-semibold text-gray-600">Propiedades</span>
          <button onClick={() => setRailAbierto(false)} className="p-1 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-200">
            <X size={14} />
          </button>
        </div>

        <PropiedadesElemento
          nodo={nodo}
          permisos={permisos}
          onActualizado={onActualizado}
          mostrarToast={mostrarToast}
        />
      </aside>
    </div>
  );
}
