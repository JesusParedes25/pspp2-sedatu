/**
 * ARCHIVO: PanoramaProyecto.jsx
 * PROPÓSITO: Tab "Resumen" del proyecto — homologado con el dashboard
 *            "Tablero General" (Tablero.jsx), mismas secciones y mismo
 *            orden, acotado a un solo proyecto: Incidencia territorial
 *            (mapa real, no una lista de chips) + Nota de avance a la
 *            izquierda, Indicadores a la derecha; Acciones vencidas +
 *            Riesgos abiertos en la misma fila (lista completa con
 *            nivel, no solo un contador con link); Vencen en 14 días;
 *            Actividad reciente. El mapa es el MISMO componente que usa
 *            Tablero (`MapaTerritorialInicio`), pasándole
 *            `filtro.proyectoIds=[proyectoId]` en vez de los proyectos
 *            del usuario — no hay una fuente de datos nueva.
 */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Target, MapPin, AlertTriangle, Clock, Activity,
  TrendingUp, Shield, MessageSquare,
} from 'lucide-react';
import { obtenerPanorama } from '../../api/miembros';
import TarjetaIndicador from '../indicadores/TarjetaIndicador';
import GraficaIndicador from '../indicadores/GraficaIndicador';
import ListaEstatusCualitativo from '../indicadores/ListaEstatusCualitativo';
import MapaTerritorialInicio from '../inicio/MapaTerritorialInicio';

const GUINDA = '#7B1C3E';

// ─── Helpers ──────────────────────────────────────────────────
function fmt(f) {
  if (!f) return '-';
  return new Date(f).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function rel(fecha) {
  if (!fecha) return '';
  const diff = Date.now() - new Date(fecha).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'ahora';
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `hace ${d}d`;
  return fmt(fecha);
}

// ─── Sección Card wrapper ─────────────────────────────────────
function SeccionCard({ titulo, icono: Icono, children, className = '' }) {
  return (
    <section className={`bg-white ${className}`} style={{ borderRadius: '8px', border: '1px solid #E5E5E5', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
      <div className="flex items-center gap-2 px-5 py-3" style={{ borderBottom: '1px solid #E5E5E5' }}>
        {Icono && <Icono size={16} style={{ color: '#7B1C3E' }} />}
        <h3 className="text-sm font-semibold" style={{ color: '#7B1C3E' }}>{titulo}</h3>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

// ─── Componente principal ─────────────────────────────────────
export default function PanoramaProyecto({ proyecto, etapas, proyectoId, refreshKey, onNavegarNodo }) {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!proyectoId) return;
    setCargando(true);
    obtenerPanorama(proyectoId)
      .then(d => setDatos(d))
      .catch(() => {})
      .finally(() => setCargando(false));
  }, [proyectoId, refreshKey]);

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-guinda-600" />
      </div>
    );
  }

  if (!datos) return <p className="text-center text-gray-500 py-10">Error al cargar panorama</p>;

  const { indicadores, vencidos, por_vencer, riesgos, actividad, estatus_cualitativo = [] } = datos;

  return (
    <div className="space-y-5">
      {/* ═══ MAPA + INDICADORES — mismas dos columnas que Tablero
          General: izquierda mapa real (no chips) + nota de avance,
          derecha indicadores. Si no hay indicadores la izquierda ocupa
          todo el ancho, igual que en Tablero. ═══ */}
      <div className={`grid grid-cols-1 gap-5 ${indicadores.length > 0 ? 'lg:grid-cols-2' : ''}`}>
        <div className="space-y-5">
          <SeccionCard titulo="Incidencia territorial" icono={MapPin}>
            <MapaTerritorialInicio filtro={{ proyectoIds: [proyectoId] }} />
          </SeccionCard>

          {/* ═══ ESTATUS CUALITATIVO ═══
              Contraparte de los indicadores: el número dice cuánto, esto
              dice por qué. Aquí no se repite el nombre del proyecto en
              cada línea — ya se sabe cuál es. */}
          {estatus_cualitativo.length > 0 && (
            <SeccionCard titulo="Nota de avance" icono={MessageSquare}>
              <ListaEstatusCualitativo items={estatus_cualitativo} dentroDeProyecto maxAltura="max-h-72" />
            </SeccionCard>
          )}
        </div>

        {indicadores.length > 0 && (
          <SeccionCard titulo="Indicadores" icono={Target}>
            <div className="grid gap-4 sm:grid-cols-2">
              {indicadores.map(ind => (
                <IndicadorCard key={ind.id} indicador={ind} />
              ))}
            </div>
          </SeccionCard>
        )}
      </div>

      {/* ═══ ACCIONES VENCIDAS + RIESGOS ABIERTOS ═══ — misma fila que
          Tablero General: son las dos listas que de verdad piden acción
          ya; "Vencen en 14 días" es alerta temprana y va aparte, debajo.
          Riesgos ya no es un contador con link: es la lista completa
          (nivel + título), igual que en Tablero — cada uno abre
          directo el nodo y el riesgo en Seguimiento. */}
      {(vencidos.length > 0 || riesgos.length > 0) && (
        <div className={`grid grid-cols-1 gap-5 ${vencidos.length > 0 && riesgos.length > 0 ? 'md:grid-cols-2' : ''}`}>
          {vencidos.length > 0 && (
            <SeccionCard titulo="Acciones vencidas" icono={AlertTriangle}>
              <ul className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {vencidos.slice(0, 8).map(a => (
                  <li key={a.id}>
                    <button onClick={() => onNavegarNodo?.(a.id)} className="w-full flex items-start gap-2 text-left p-1 -m-1 rounded hover:bg-red-50 transition-colors">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm text-gray-800 truncate">{a.nombre}</p>
                        <p className="text-[11px] text-gray-500">
                          {a.id_accion_padre ? 'Subacción' : 'Acción'} · -{a.dias_atraso}d atraso
                        </p>
                        {a.estatus_cualitativo && (
                          <p className="text-[11px] text-gray-500 italic truncate mt-0.5">"{a.estatus_cualitativo}"</p>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </SeccionCard>
          )}
          {riesgos.length > 0 && (
            <SeccionCard titulo="Riesgos abiertos" icono={Shield}>
              <ul className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {riesgos.map(r => (
                  <li key={r.id}>
                    <button
                      onClick={() => onNavegarNodo?.(r.entidad_id, r.id)}
                      className="w-full flex items-center gap-1.5 text-left py-1 px-1.5 -ml-1.5 rounded hover:bg-orange-50 transition-colors"
                    >
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        r.nivel === 'Critico' ? 'bg-red-600' :
                        r.nivel === 'Alto' ? 'bg-orange-500' :
                        r.nivel === 'Medio' ? 'bg-yellow-500' : 'bg-gray-400'
                      }`} />
                      <p className="text-sm text-gray-800 truncate flex-1">{r.titulo}</p>
                      <span className="text-[11px] text-gray-400 flex-shrink-0">{r.nivel}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </SeccionCard>
          )}
        </div>
      )}

      {/* ═══ VENCEN EN 14 DÍAS ═══ */}
      {por_vencer.length > 0 && (
        <SeccionCard titulo="Vencen en 14 días" icono={Clock}>
          <ul className="space-y-2">
            {por_vencer.slice(0, 8).map(a => (
              <li key={a.id}>
                <button onClick={() => onNavegarNodo?.(a.id)} className="w-full flex items-start gap-2 text-left p-1 -m-1 rounded hover:bg-yellow-50 transition-colors">
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 mt-1.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm text-gray-800 truncate">{a.nombre}</p>
                    <p className="text-[11px] text-gray-500">
                      {a.id_accion_padre ? 'Subacción' : 'Acción'} · {a.dias_restantes}d restantes
                    </p>
                    {a.estatus_cualitativo && (
                      <p className="text-[11px] text-gray-500 italic truncate mt-0.5">"{a.estatus_cualitativo}"</p>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </SeccionCard>
      )}

      {/* ═══ ACTIVIDAD RECIENTE ═══ */}
      {actividad.length > 0 && (
        <SeccionCard titulo="Actividad reciente" icono={Activity}>
          <ul className="space-y-3">
            {actividad.slice(0, 10).map((ev, i) => {
              const icono = ev.tipo === 'comentario' ? <Activity size={12} />
                : ev.tipo === 'indicador' ? <Target size={12} />
                : <TrendingUp size={12} />;
              const color = ev.tipo === 'comentario' ? 'bg-purple-100 text-purple-600'
                : ev.tipo === 'indicador' ? 'bg-teal-100 text-teal-600'
                : 'bg-green-100 text-green-600';
              const etiqueta = ev.tipo === 'comentario' ? 'comentó'
                : ev.tipo === 'indicador' ? null // el título ya es la oración completa
                : 'subió evidencia';
              const contenido = (
                <>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${color}`}>
                    {icono}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-800">
                      {etiqueta ? (
                        <>
                          <span className="font-medium">{ev.actor}</span>
                          {' '}<span className="text-gray-500">{etiqueta}:</span>
                          {' '}<span className="text-gray-700 truncate">{ev.descripcion?.slice(0, 80)}</span>
                        </>
                      ) : (
                        <>
                          <span className="text-gray-700 truncate">{ev.descripcion?.slice(0, 80)}</span>
                          {' '}<span className="text-gray-500">· {ev.actor}</span>
                        </>
                      )}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{rel(ev.created_at)}</p>
                  </div>
                </>
              );
              return (
                <li key={i}>
                  {ev.tipo === 'indicador' ? (
                    <Link to={`/indicadores/${ev.entidad_id}`} className="w-full flex items-start gap-2.5 text-left p-1 -m-1 rounded hover:bg-purple-50 transition-colors">
                      {contenido}
                    </Link>
                  ) : (
                    <button onClick={() => onNavegarNodo?.(ev.entidad_id)} className="w-full flex items-start gap-2.5 text-left p-1 -m-1 rounded hover:bg-purple-50 transition-colors">
                      {contenido}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </SeccionCard>
      )}

    </div>
  );
}

// ─── Indicador Card ───────────────────────────────────────────
function IndicadorCard({ indicador }) {
  // La tarjeta es la compartida con Tablero y Resumen de cartera; aquí
  // se le agrega, como hijo, la gráfica del desglose (periodos o
  // categorías, excluyentes por diseño), que solo tiene sentido dentro
  // del proyecto. "etiqueta" cubre Sexenio ("2018–2024") y
  // Personalizado (texto libre, sin año calendario real — anio queda
  // NULL para esos); "anio" sigue siendo el fallback correcto para el
  // caso Año de siempre, donde nunca se guardó una etiqueta.
  const filas = indicador.composicion === 'Categorias'
    ? (indicador.categorias || []).map(c => ({
        etiqueta: c.etiqueta,
        meta: parseFloat(c.valor_meta) || 0,
        real: parseFloat(c.valor_real) || 0,
      }))
    : (indicador.metas_anuales || []).map(m => ({
        etiqueta: m.etiqueta || String(m.anio),
        meta: parseFloat(m.valor_meta) || 0,
        real: parseFloat(m.valor_real) || 0,
      }));

  return (
    <TarjetaIndicador
      indicador={indicador}
      contexto={indicador.etapa_nombre ? `Etapa: ${indicador.etapa_nombre}` : null}
    >
      <GraficaIndicador filas={filas} tipo={indicador.tipo_grafico} />
    </TarjetaIndicador>
  );
}
