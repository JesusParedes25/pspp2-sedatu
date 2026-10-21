/**
 * ARCHIVO: MisActividades.jsx
 * PROPÓSITO: Módulo "Mis actividades" — pestañas Pendientes (nodos donde el
 *            usuario es responsable/asignado) y Agenda (el módulo de Agenda
 *            existente, embebido tal cual).
 *
 * MINI-CLASE: dos ejes distintos, dos grupos distintos
 * ─────────────────────────────────────────────────────────────────
 * "Por estado" y "Alertas" miden cosas diferentes y no son comparables
 * entre sí — por eso van en grupos separados, con encabezado, en vez de
 * una sola fila de cinco números. "Por estado" es una partición real de
 * `estado` (cada actividad cae en exactamente una categoría, por eso
 * suman el total exacto — ver agruparPorEstado). "Alertas" son
 * subconjuntos de lo no completado/cancelado por fecha límite: Vencidas
 * y Por vencer pueden traslaparse con cualquier categoría de "Por estado"
 * (una "En proceso" puede estar vencida) pero nunca entre sí, y no
 * forman parte de la suma del total — mezclar los dos ejes en una sola
 * fila de tarjetas es lo que hacía que 55+45+32 no sumara 180 y el
 * usuario leyera eso como un error de conteo.
 *
 * Los botones Semana/Mes/Trimestre/Año filtran por CUÁNDO vence algo,
 * pero solo hacia el FUTURO — qué tan lejos quiero ver lo que todavía no
 * pasa. Lo ya vencido nunca se recorta por periodo, sin importar hace
 * cuánto: un periodo corto no es "ignora lo viejo", es "no me
 * adelantes tanto lo que aún no llega". Ambos filtros (estado/alerta y
 * periodo) se combinan con AND, y los dos parten de la MISMA base ya
 * recortada por periodo (disponiblesPeriodo) — así los conteos de las
 * tarjetas son siempre el número exacto de resultados que aparecen al
 * hacer clic en una, sin importar el periodo activo.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ListChecks, CalendarDays, AlertTriangle, Clock, TrendingUp, CheckCircle2, Ban, ShieldAlert, X } from 'lucide-react';
import * as accionesApi from '../api/acciones';
import ArbolActividadesProyecto from '../components/nodos/ArbolActividadesProyecto';
import AvisoPartesDelegadas from '../components/common/AvisoPartesDelegadas';
import EmptyState from '../components/common/EmptyState';
import { formatearEstado } from '../utils/estados';
import Agenda from './Agenda';
import { PERIODOS, diasRestantes, disponiblesPorPeriodo, categoriasAlerta } from '../utils/resumenMisActividades';

// Grupo "Por estado": partición exacta de `estado` — cada actividad cae
// en EXACTAMENTE una de estas 5 categorías (igualdad directa, nunca un
// criterio derivado), así que sus conteos suman el total sin excepción.
// Bloqueadas y Canceladas solo se muestran como tarjeta si su conteo es
// > 0 (ver render), pero siempre participan en la suma.
const CATEGORIAS_ESTADO = [
  { id: 'sinIniciar', estado: 'Pendiente', I: ListChecks, iconCls: 'text-gray-400', activoCls: 'bg-gray-600 text-white', siempreVisible: true },
  { id: 'enProceso', estado: 'En_proceso', I: TrendingUp, iconCls: 'text-blue-400', activoCls: 'bg-blue-600 text-white', siempreVisible: true },
  { id: 'completadas', estado: 'Completada', I: CheckCircle2, iconCls: 'text-emerald-400', activoCls: 'bg-emerald-600 text-white', siempreVisible: true },
  { id: 'bloqueadas', estado: 'Bloqueada', I: ShieldAlert, iconCls: 'text-red-400', activoCls: 'bg-red-600 text-white', siempreVisible: false },
  { id: 'canceladas', estado: 'Cancelada', I: Ban, iconCls: 'text-gray-400', activoCls: 'bg-gray-500 text-white', siempreVisible: false },
];
const ESTADO_A_CATEGORIA = Object.fromEntries(CATEGORIAS_ESTADO.map(c => [c.estado, c.id]));

// Grupo "Alertas": subconjuntos de lo no completado/cancelado por fecha
// límite — pueden traslaparse con cualquier categoría de "Por estado"
// (una tarea "En proceso" puede estar vencida a la vez), nunca forman
// parte de la suma del total.
const CATEGORIAS_ALERTA = [
  { id: 'vencidas', lbl: 'Vencidas', I: AlertTriangle, iconCls: 'text-red-400', activoCls: 'bg-red-600 text-white' },
  // "Por vencer" queda amarrada al umbral del semáforo (DIAS_POR_VENCER,
  // SemaforoDot.jsx) en toda la plataforma — antes decía "Próximas (≤7d)"
  // con su propio 7 suelto, que podía desalinearse del semáforo sin que
  // nada lo notara.
  { id: 'proximas', lbl: 'Por vencer', I: Clock, iconCls: 'text-amber-400', activoCls: 'bg-amber-500 text-white' },
];

// Grupo "Por estado": partición exacta — recorre la lista una vez y cada
// ítem incrementa EXACTAMENTE un contador (ESTADO_A_CATEGORIA cubre los
// 5 valores del catálogo), así que la suma de los 5 siempre es
// items.length. Exportada para poder probarlo sin montar el componente.
export function agruparPorEstado(items) {
  const conteo = { sinIniciar: 0, enProceso: 0, completadas: 0, bloqueadas: 0, canceladas: 0 };
  for (const it of items) {
    const cat = ESTADO_A_CATEGORIA[it.estado];
    if (cat) conteo[cat]++;
  }
  return conteo;
}

export default function MisActividades() {
  // Respaldado en la URL (?tab=) para que el sidebar pueda enlazar
  // directo a cada pestaña y resaltar cuál está activa — mismo criterio
  // que ya usa ListadoProyectos.jsx con ?vista=.
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'pendientes';
  const setTab = (id) => setSearchParams(prev => { const next = new URLSearchParams(prev); next.set('tab', id); return next; });
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [periodo, setPeriodo] = useState('mes');
  const [filtrosEstado, setFiltrosEstado] = useState(() => new Set());
  // true si esta persona administra algún proyecto del que delegó al
  // menos una etapa/acción/tarea — ver AvisoPartesDelegadas.
  const [hayPartesDelegadas, setHayPartesDelegadas] = useState(false);
  // Si la petición falla, NUNCA se queda con items=[] mostrando 0 en
  // todo (eso parece "se perdieron tus actividades", no "falló la
  // red") — se muestra un estado de error explícito con botón de
  // reintentar, y items conserva lo que ya tenía cargado.
  const [errorCarga, setErrorCarga] = useState(false);

  async function cargar() {
    setCargando(true);
    setErrorCarga(false);
    try {
      const res = await accionesApi.obtenerAgenda();
      setItems(res.datos || []);
      setHayPartesDelegadas(!!res.hayPartesDelegadas);
    } catch (err) {
      console.error('Error cargando pendientes:', err);
      setErrorCarga(true);
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
  const disponiblesPeriodo = useMemo(() => disponiblesPorPeriodo(items, periodo), [items, periodo]);

  // Filtro de estado/alerta. Sin selección ("Todas") = comportamiento de
  // siempre: oculta Completadas y Canceladas (ninguna de las dos necesita
  // acción). Con selección, un ítem entra si coincide con CUALQUIERA de
  // los filtros activos (OR entre chips de los dos grupos, AND con el
  // rango, ya aplicado en disponiblesPeriodo).
  const porEstado = useMemo(() => {
    if (filtrosEstado.size === 0) {
      return disponiblesPeriodo.filter(it => it.estado !== 'Completada' && it.estado !== 'Cancelada');
    }
    return disponiblesPeriodo.filter(it => {
      const catEstado = ESTADO_A_CATEGORIA[it.estado];
      if (catEstado && filtrosEstado.has(catEstado)) return true;
      const catsAlerta = categoriasAlerta(it);
      for (const f of filtrosEstado) if (catsAlerta.has(f)) return true;
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
  // el periodo activo. "Por estado" es una partición exacta (suma el
  // total); "Alertas" son subconjuntos independientes, nunca se suman
  // al total ni entre sí con los de "Por estado".
  const resumen = useMemo(() => {
    const porEstadoConteo = agruparPorEstado(disponiblesPeriodo);
    let vencidas = 0, proximas = 0;
    for (const it of disponiblesPeriodo) {
      const cats = categoriasAlerta(it);
      if (cats.has('vencidas')) vencidas++;
      if (cats.has('proximas')) proximas++;
    }
    return { total: disponiblesPeriodo.length, ...porEstadoConteo, vencidas, proximas };
  }, [disponiblesPeriodo]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mis actividades</h1>
        <p className="text-sm text-gray-500 mt-0.5">Tus etapas, acciones y tareas asignadas, y tu agenda.</p>
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {[{ id: 'pendientes', lbl: 'Lista', I: ListChecks }, { id: 'agenda', lbl: 'Agenda', I: CalendarDays }].map(({ id, lbl, I }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-md transition-all ${tab === id ? 'bg-white text-guinda-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            <I size={13} />{lbl}
          </button>
        ))}
      </div>

      {tab === 'pendientes' ? (
        <div className="space-y-4">
          {errorCarga ? (
            <EmptyState
              icono={AlertTriangle}
              titulo="No se pudieron cargar las actividades"
              subtitulo="Hubo un problema al conectar con el servidor. Esto no significa que tus actividades se hayan perdido, intenta de nuevo."
              accion="Reintentar"
              onAccion={cargar}
            />
          ) : (
          <>
          <AvisoPartesDelegadas visible={hayPartesDelegadas} />

          {/* Total — encabeza, no es un filtro ni se mezcla con los grupos
              de abajo. "Por estado" y "Alertas" son dos ejes distintos (ver
              mini-clase arriba): cada uno con su propio encabezado, para
              que no vuelvan a leerse como una sola serie de números que
              "debería" sumar. */}
          <div className="card p-4 flex items-center gap-2.5">
            <ListChecks size={18} className="text-guinda-500 flex-shrink-0" />
            <span className="text-lg font-bold text-gray-900">{resumen.total}</span>
            <span className="text-sm text-gray-500">actividad{resumen.total !== 1 ? 'es' : ''} a mi cargo</span>
          </div>

          <div>
            <h2 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Por estado</h2>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {CATEGORIAS_ESTADO.filter(c => c.siempreVisible || resumen[c.id] > 0).map(c => {
                const activo = filtrosEstado.has(c.id);
                const lbl = formatearEstado(c.estado);
                return (
                  <button
                    key={c.id}
                    onClick={() => toggleFiltroEstado(c.id)}
                    title={`Filtrar por ${lbl.toLowerCase()}`}
                    className={`card p-3.5 text-left transition-colors ${activo ? 'ring-2 ring-offset-1 ring-guinda-400' : 'hover:bg-gray-50'}`}
                  >
                    <div className="flex items-center gap-1.5 mb-1"><c.I size={13} className={c.iconCls} /><span className="text-xs text-gray-500">{lbl}</span></div>
                    <div className={`inline-flex items-center justify-center text-2xl font-bold rounded-md px-1.5 ${activo ? c.activoCls : 'text-gray-800'}`}>
                      {resumen[c.id]}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <h2 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Alertas</h2>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {CATEGORIAS_ALERTA.map(f => {
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
                      {resumen[f.id]}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Filtro de periodo + limpiar filtros */}
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
            {filtrosEstado.size === 0 && resumen.completadas > 0 && (
              <button
                onClick={() => toggleFiltroEstado('completadas')}
                className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full text-gray-500 hover:bg-gray-100"
              >
                <CheckCircle2 size={11} className="text-emerald-400" />
                {resumen.completadas} completada{resumen.completadas !== 1 ? 's' : ''} oculta{resumen.completadas !== 1 ? 's' : ''} · Mostrar
              </button>
            )}
            {filtrosEstado.size === 0 && resumen.canceladas > 0 && (
              <button
                onClick={() => toggleFiltroEstado('canceladas')}
                className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full text-gray-500 hover:bg-gray-100"
              >
                <Ban size={11} className="text-gray-400" />
                {resumen.canceladas} cancelada{resumen.canceladas !== 1 ? 's' : ''} oculta{resumen.canceladas !== 1 ? 's' : ''} · Mostrar
              </button>
            )}
          </div>

          {/* Lista — ArbolActividadesProyecto: agrupada por proyecto,
              colapsable, con árbol real Etapa › Acción › Tarea (mismo
              ArbolPorProyecto que usa Tablero) y tarjetas accionables de
              verdad. Es el mismo componente que usa el panel de un día en
              Agenda > Calendario — una sola presentación para "lista de mis
              actividades", no dos. Grid de ancho automático (auto-fit):
              cada tarjeta pide entre 380 y 480px, el navegador acomoda
              tantas columnas como quepan, sin un ancho fijo que adivinar. */}
          {cargando ? (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(380px,480px))] gap-4 animate-pulse">{[1, 2, 3, 4].map(i => <div key={i} className="h-14 bg-gray-200 rounded-lg" />)}</div>
          ) : (
            <ArbolActividadesProyecto
              items={filtrados}
              onCambiado={cargar}
              vacio="Sin actividades con los filtros seleccionados."
            />
          )}
          </>
          )}
        </div>
      ) : (
        <Agenda />
      )}
    </div>
  );
}
