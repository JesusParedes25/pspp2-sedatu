/**
 * ARCHIVO: MisActividades.jsx
 * PROPÓSITO: Módulo "Mis actividades" — pestañas Pendientes (nodos donde el
 *            usuario es responsable/asignado) y Agenda (el módulo de Agenda
 *            existente, embebido tal cual).
 *
 * MINI-CLASE: filtro de rango vs. filtro de estado
 * ─────────────────────────────────────────────────────────────────
 * Los botones Semana/Mes/Trimestre/Año filtran por CUÁNDO vence algo,
 * pero solo hacia el FUTURO — qué tan lejos quiero ver lo que todavía no
 * pasa. Lo ya vencido nunca se recorta por periodo, sin importar hace
 * cuánto: un periodo corto no es "ignora lo viejo", es "no me
 * adelantes tanto lo que aún no llega". Las tarjetas Vencidas/
 * Próximas/En proceso/Completadas filtran por QUÉ ESTADO tiene. Ambos
 * filtros se combinan con AND, y los dos parten de la MISMA base ya
 * recortada por periodo (disponiblesPeriodo): primero se recorta al
 * rango de fechas elegido, y de ahí se separa por estado. Los conteos
 * de las tarjetas también salen de esa misma base — así son siempre
 * el número exacto de resultados que aparecen al hacer clic en una,
 * sin importar el periodo activo (antes los conteos ignoraban el
 * periodo, así que una tarjeta podía marcar "30" con la lista
 * mostrando solo 3, o vacía, según el periodo elegido).
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ListChecks, CalendarDays, AlertTriangle, Clock, TrendingUp, CheckCircle2, X, MessageSquare, ChevronDown } from 'lucide-react';
import * as accionesApi from '../api/acciones';
import NodoCard from '../components/nodos/NodoCard';
import ActividadStream from '../components/nodos/ActividadStream';
import ArbolPorProyecto from '../components/common/ArbolPorProyecto';
import { COLORES_SEMAFORO } from '../components/common/SemaforoDot';
import { formatFecha } from '../utils/fecha';
import { NIVELES } from '../config/niveles';
import Agenda from './Agenda';

const PERIODOS = [
  { id: 'semana', label: 'Semana', dias: 7 },
  { id: 'mes', label: 'Mes', dias: 30 },
  { id: 'trimestre', label: 'Trimestre', dias: 90 },
  { id: 'anio', label: 'Año', dias: 365 },
];

// Tarjetas de estado convertidas en filtros — 'total' (Actualizado) no es
// filtrable, es solo informativa, según lo pedido explícitamente.
const FILTROS_ESTADO = [
  { id: 'vencidas', lbl: 'Vencidas', I: AlertTriangle, iconCls: 'text-red-400', activoCls: 'bg-red-600 text-white' },
  { id: 'proximas', lbl: 'Próximas (≤7d)', I: Clock, iconCls: 'text-amber-400', activoCls: 'bg-amber-500 text-white' },
  { id: 'enProceso', lbl: 'En proceso', I: TrendingUp, iconCls: 'text-blue-400', activoCls: 'bg-blue-600 text-white' },
  { id: 'completadas', lbl: 'Completadas', I: CheckCircle2, iconCls: 'text-emerald-400', activoCls: 'bg-emerald-600 text-white' },
];

const PERMISOS_PROPIOS = { esSoloLectura: false, puedeInvitar: true, puedeCrearAccion: false };

function diasRestantes(fecha) {
  if (!fecha) return null;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const [y, m, d] = String(fecha).slice(0, 10).split('-').map(Number);
  if (!y) return null;
  return Math.ceil((new Date(y, m - 1, d) - hoy) / 86400000);
}

// A qué categorías de estado pertenece un ítem (puede ser varias a la vez,
// ej. "vencida" y nada más, o ninguna si está Pendiente sin vencer).
function categoriasDe(it) {
  const cats = new Set();
  const activo = it.estado !== 'Completada' && it.estado !== 'Cancelada';
  const d = diasRestantes(it.fecha_fin);
  if (activo && d !== null && d < 0) cats.add('vencidas');
  if (activo && d !== null && d >= 0 && d <= 7) cats.add('proximas');
  if (it.estado === 'En_proceso') cats.add('enProceso');
  if (it.estado === 'Completada') cats.add('completadas');
  return cats;
}

export default function MisActividades() {
  const [tab, setTab] = useState('pendientes');
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [periodo, setPeriodo] = useState('mes');
  const [filtrosEstado, setFiltrosEstado] = useState(() => new Set());
  // Tarjetas expandidas ahora mismo (NodoCard avisa vía onToggleAbierto) —
  // solo mientras una tarjeta está abierta se ofrece el acceso a su
  // Actividad (Comentarios/Evidencia/Riesgos), para no abultar la lista
  // colapsada con un enlace que nadie pidió ver todavía.
  const [abiertos, setAbiertos] = useState(() => new Set());
  // Para cuáles tarjetas abiertas, además, se pidió ver su Actividad —
  // independiente de "abiertos": abrir la tarjeta no carga el feed solo,
  // hay que pedirlo explícitamente (mismo criterio que la pestaña
  // "Actividad" del drawer de Diagrama).
  const [actividadAbierta, setActividadAbierta] = useState(() => new Set());

  async function cargar() {
    setCargando(true);
    try {
      const res = await accionesApi.obtenerAgenda();
      setItems(res.datos || []);
    } catch (err) {
      console.error('Error cargando pendientes:', err);
    } finally { setCargando(false); }
  }

  useEffect(() => { cargar(); }, []);

  function toggleFiltroEstado(id) {
    setFiltrosEstado(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function marcarAbierto(key, abierto) {
    setAbiertos(prev => {
      const next = new Set(prev);
      abierto ? next.add(key) : next.delete(key);
      return next;
    });
    // Al cerrar la tarjeta, también se oculta su Actividad — evita que
    // quede "recordada" abierta y reaparezca ya cargada si se vuelve a
    // expandir mucho después, con datos que pudieron cambiar.
    if (!abierto) setActividadAbierta(prev => { if (!prev.has(key)) return prev; const next = new Set(prev); next.delete(key); return next; });
  }

  function toggleActividad(key) {
    setActividadAbierta(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  // Base: nunca se muestran Canceladas (no hay tarjeta/filtro para eso).
  const disponibles = useMemo(() => items.filter(it => it.estado !== 'Cancelada'), [items]);

  // Base recortada por periodo — "qué tan lejos en el FUTURO quiero ver"
  // (Semana ⊆ Mes ⊆ Trimestre ⊆ Año), nunca "qué tan viejo puede ser lo
  // que ya venció": un item ya vencido (d < 0) siempre se incluye, sin
  // importar el periodo elegido. Antes la ventana era simétrica
  // (d >= -dias && d <= dias), así que una tarea vencida hace más de 30
  // días desaparecía por completo del periodo "Mes" — incluso con el
  // chip "Vencidas" activo, que se filtra DESPUÉS de este recorte (ver
  // porEstado) y por lo tanto heredaba el mismo hueco: literalmente lo
  // contrario de lo que se espera al pedir ver las vencidas. Tanto los
  // conteos de las tarjetas como la lista parten de esta misma base,
  // para que sea imposible que se desincronicen entre sí (antes los
  // conteos se calculaban sobre `disponibles` sin recortar, y la lista
  // sí lo recortaba — una tarjeta podía marcar "30" con la lista
  // mostrando 3, o vacía).
  const disponiblesPeriodo = useMemo(() => {
    const dias = PERIODOS.find(p => p.id === periodo)?.dias ?? 30;
    return disponibles.filter(it => {
      const d = diasRestantes(it.fecha_fin);
      return d === null || d < 0 || d <= dias;
    });
  }, [disponibles, periodo]);

  // Filtro de estado. Sin selección ("Todas") = comportamiento actual:
  // excluye Completadas. Con selección, un ítem entra si coincide con
  // CUALQUIERA de los filtros activos (OR entre chips, AND con el rango,
  // ya aplicado en disponiblesPeriodo).
  const porEstado = useMemo(() => {
    if (filtrosEstado.size === 0) return disponiblesPeriodo.filter(it => it.estado !== 'Completada');
    return disponiblesPeriodo.filter(it => {
      const cats = categoriasDe(it);
      for (const f of filtrosEstado) if (cats.has(f)) return true;
      return false;
    });
  }, [disponiblesPeriodo, filtrosEstado]);

  const filtrados = useMemo(() => [...porEstado].sort((a, b) => {
    const da = diasRestantes(a.fecha_fin); const db = diasRestantes(b.fecha_fin);
    if (da === null) return 1; if (db === null) return -1;
    return da - db;
  }), [porEstado]);

  // Conteos de las tarjetas: salen de disponiblesPeriodo, así que
  // siempre coinciden con lo que se ve al hacer clic en una tarjeta con
  // el periodo activo.
  const resumen = useMemo(() => {
    const activos = disponiblesPeriodo.filter(it => it.estado !== 'Completada');
    const vencidas = activos.filter(it => categoriasDe(it).has('vencidas')).length;
    const proximas = activos.filter(it => categoriasDe(it).has('proximas')).length;
    const enProceso = activos.filter(it => it.estado === 'En_proceso').length;
    const completadas = disponiblesPeriodo.filter(it => it.estado === 'Completada').length;
    return { total: activos.length, vencidas, proximas, enProceso, completadas };
  }, [disponiblesPeriodo]);

  const CONTEO_POR_FILTRO = { vencidas: resumen.vencidas, proximas: resumen.proximas, enProceso: resumen.enProceso, completadas: resumen.completadas };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mis actividades</h1>
        <p className="text-sm text-gray-500 mt-0.5">Tus etapas, acciones y tareas asignadas — y tu agenda.</p>
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {[{ id: 'pendientes', lbl: 'Pendientes', I: ListChecks }, { id: 'agenda', lbl: 'Agenda', I: CalendarDays }].map(({ id, lbl, I }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-md transition-all ${tab === id ? 'bg-white text-guinda-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            <I size={13} />{lbl}
          </button>
        ))}
      </div>

      {tab === 'pendientes' ? (
        <div className="space-y-4">
          {/* Resumen — "Actualizado" es informativo; el resto son filtros clicables */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="card p-3.5">
              <div className="flex items-center gap-1.5 mb-1"><ListChecks size={13} className="text-gray-400" /><span className="text-xs text-gray-500">Actualizado</span></div>
              <div className="text-2xl font-bold text-gray-800">{resumen.total}</div>
            </div>
            {FILTROS_ESTADO.map(f => {
              const activo = filtrosEstado.has(f.id);
              return (
                <button
                  key={f.id}
                  onClick={() => toggleFiltroEstado(f.id)}
                  title={`Filtrar por ${f.lbl.toLowerCase()}`}
                  className={`card p-3.5 text-left transition-colors ${activo ? 'ring-2 ring-offset-1 ring-guinda-400' : 'hover:bg-gray-50'}`}
                >
                  <div className="flex items-center gap-1.5 mb-1"><f.I size={13} className={f.iconCls} /><span className="text-xs text-gray-500">{f.lbl}</span></div>
                  <div className={`inline-flex items-center justify-center text-2xl font-bold rounded-md px-1.5 ${activo ? f.activoCls : 'text-gray-800'}`}>
                    {CONTEO_POR_FILTRO[f.id]}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Filtro de periodo + limpiar filtros de estado */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {PERIODOS.map(p => (
              <button key={p.id} onClick={() => setPeriodo(p.id)}
                className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${periodo === p.id ? 'bg-guinda-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                {p.label}
              </button>
            ))}
            {filtrosEstado.size > 0 && (
              <button onClick={() => setFiltrosEstado(new Set())}
                className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full text-guinda-600 hover:bg-guinda-50">
                <X size={11} /> Limpiar filtros ({filtrosEstado.size})
              </button>
            )}
            {filtrosEstado.size === 0 && (
              <span className="text-xs text-gray-400 px-1">{filtrados.length} resultado{filtrados.length !== 1 ? 's' : ''}</span>
            )}
          </div>

          {/* Lista — agrupada por proyecto, colapsable, mismo componente que
              ya usa Tablero (ArbolPorProyecto: un árbol real Etapa › Acción
              › Tarea dentro de cada proyecto). Grid de ancho automático
              (auto-fit): cada tarjeta pide entre 380 y 480px, y el navegador
              acomoda tantas columnas como quepan — ni una sola columna
              angosta con medio panel vacío (pantalla ancha, pocas
              columnas fijas) ni tarjetas estiradas sin necesidad (pantalla
              angosta, columnas de más). Sin límite de ancho manual que
              adivinar. */}
          {cargando ? (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(380px,480px))] gap-4 animate-pulse">{[1, 2, 3, 4].map(i => <div key={i} className="h-14 bg-gray-200 rounded-lg" />)}</div>
          ) : filtrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <ListChecks size={32} className="mb-2 text-gray-200" />
              <p className="text-sm">Sin actividades con los filtros seleccionados.</p>
            </div>
          ) : (
            <ArbolPorProyecto
              items={filtrados}
              vacio="Sin actividades con los filtros seleccionados."
              className="grid grid-cols-[repeat(auto-fit,minmax(380px,480px))] gap-x-6 gap-y-4 items-start"
              variante="destacado"
              // Una etapa siempre es contenedor (su avance se calcula de
              // sus acciones) y una acción lo es cuando tiene subacciones o
              // tareas propias (es_hoja=false) — en ambos casos, mostrarla
              // como si fuera una tarjeta accionable más (checkbox,
              // "Registrar avance"...) insinúa algo que no se puede hacer.
              // Se muestra como una fila compacta de solo información,
              // pegada al encabezado que ya la nombra, no como una tarjeta
              // duplicada aparte (ver es_hoja en construirArbol).
              renderPropio={it => <FilaNodoResumen key={it.id} it={it} />}
              renderItem={it => {
                  const key = `${it.tipo}-${it.id}`;
                  const mostrarActividad = actividadAbierta.has(key);
                  return (
                    <div className="py-0.5">
                      <NodoCard
                        tipo={it.tipo}
                        nodo={it}
                        // Todo lo que llega aquí (no a renderPropio) ya es
                        // hoja real: etapa nunca llega, y una acción con
                        // es_hoja=false tampoco (ver construirArbol) — solo
                        // queda esContenedor=false para lo que sí llega.
                        esContenedor={false}
                        proyectoId={it.proyecto_id}
                        permisos={PERMISOS_PROPIOS}
                        // El proyecto/etapa/acción ya se ve en los
                        // encabezados del árbol que envuelve esta tarjeta —
                        // repetir la ruta completa aquí era redundante. El
                        // enlace se conserva, solo con texto corto.
                        breadcrumb="Ver en proyecto"
                        onProyectoClick={`/proyectos/${it.proyecto_id}?tab=seguimiento&nodo=${it.id}`}
                        onCambiado={cargar}
                        // Homologado con el rail de Seguimiento/Detalle y el
                        // drawer de Diagrama (FichaNodo.jsx): Comentar/
                        // Evidencia/Riesgos se sacan del grid de botones —
                        // se recuperan abajo, bajo demanda, vía Actividad.
                        agrupado
                        onToggleAbierto={abierto => marcarAbierto(key, abierto)}
                      />
                      {abiertos.has(key) && (
                        <div className="mt-1 ml-1">
                          <button
                            onClick={() => toggleActividad(key)}
                            className="flex items-center gap-1.5 text-[11px] font-medium text-gray-400 hover:text-guinda-600 transition-colors"
                          >
                            <MessageSquare size={12} />
                            Comentarios, evidencia y riesgos
                            <ChevronDown size={11} className={`transition-transform ${mostrarActividad ? 'rotate-180' : ''}`} />
                          </button>
                          {mostrarActividad && (
                            <div className="card p-3.5 mt-1.5">
                              <ActividadStream tipo={it.tipo} id={it.id} titulo={it.nombre} />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                }}
              />
          )}
        </div>
      ) : (
        <Agenda />
      )}
    </div>
  );
}

// ─── Fila compacta de nodo contenedor (solo información, sin acción
// directa) ──────────────────────────────────────────────────────────
// Una etapa siempre es contenedor; una acción lo es cuando tiene
// subacciones o tareas propias (es_hoja=false) — en ambos casos su
// avance/estado se calculan de sus hijos, nunca se registran a mano.
// Mostrarla con las mismas afordancias que una tarjeta accionable
// (checkbox, "Registrar avance") insinuaba algo que no se puede hacer.
// Aquí es solo lectura: ícono+color del nivel (mismo criterio que el
// resto del árbol) + semáforo + fecha + responsable, con un enlace para
// ir a verla/gestionarla en el proyecto.
function FilaNodoResumen({ it }) {
  const info = NIVELES[it.tipo];
  const Icono = info.icono;
  const fecha = it.fecha_limite || it.fecha_fin;
  return (
    <div className="flex items-center gap-2 py-1 text-[11px] text-gray-500">
      <Icono size={11} className="flex-shrink-0" style={{ color: info.color }} />
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORES_SEMAFORO[it.semaforo_efectivo || it.semaforo || 'gris'] }} />
      {fecha && <span className="flex-shrink-0">Vence {formatFecha(fecha)}</span>}
      {it.responsable_nombre && <span className="truncate">· {it.responsable_nombre}</span>}
      <Link
        to={`/proyectos/${it.proyecto_id}?tab=seguimiento&nodo=${it.id}`}
        className="ml-auto flex-shrink-0 text-guinda-600 hover:underline font-medium"
      >
        Ver {info.label.toLowerCase()}
      </Link>
    </div>
  );
}
