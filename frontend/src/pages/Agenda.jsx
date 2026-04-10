/**
 * ARCHIVO: Agenda.jsx
 * PROPÓSITO: Página de agenda con acciones pendientes del usuario,
 *            con vista de calendario (predeterminada) y vista de lista.
 *
 * MINI-CLASE: Agenda como vista personal de pendientes
 * ─────────────────────────────────────────────────────────────────
 * La agenda muestra las acciones asignadas al usuario autenticado.
 * Tiene dos vistas intercambiables:
 * (1) Calendario — vista mensual con celdas por día. Cada celda
 *     muestra dots o chips de las acciones que vencen ese día.
 *     Al hacer click en un día se expande para ver detalles.
 * (2) Lista — acciones agrupadas por urgencia (vencidas, esta semana,
 *     próximas) como antes.
 * El calendario se muestra por defecto.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Clock, AlertCircle, List, ChevronLeft, ChevronRight, X } from 'lucide-react';
import * as accionesApi from '../api/acciones';
import EstadoChip from '../components/common/EstadoChip';
import EmptyState from '../components/common/EmptyState';

const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// Color del dot según urgencia
function colorDot(fechaFin) {
  const ahora = new Date();
  const fecha = new Date(fechaFin);
  if (fecha < ahora) return 'bg-red-500';
  const enUnaSemana = new Date(ahora.getTime() + 7 * 86400000);
  if (fecha <= enUnaSemana) return 'bg-orange-400';
  return 'bg-blue-400';
}

export default function Agenda() {
  const [acciones, setAcciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [vista, setVista] = useState('calendario'); // 'calendario' | 'lista'
  const [mesActual, setMesActual] = useState(() => {
    const hoy = new Date();
    return new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  });
  const [diaSeleccionado, setDiaSeleccionado] = useState(null);

  useEffect(() => {
    async function cargar() {
      try {
        const res = await accionesApi.obtenerAgenda();
        setAcciones(res.datos || []);
      } catch (err) {
        console.error('Error cargando agenda:', err);
      } finally {
        setCargando(false);
      }
    }
    cargar();
  }, []);

  // ── Datos para la vista de lista ──
  const ahora = new Date();
  const enUnaSemana = new Date(ahora.getTime() + 7 * 86400000);
  const vencidas = acciones.filter(a => new Date(a.fecha_fin) < ahora);
  const estaSemana = acciones.filter(a => {
    const f = new Date(a.fecha_fin);
    return f >= ahora && f <= enUnaSemana;
  });
  const proximas = acciones.filter(a => new Date(a.fecha_fin) > enUnaSemana);

  // ── Datos para la vista de calendario ──
  const diasDelMes = useMemo(() => {
    const anio = mesActual.getFullYear();
    const mes = mesActual.getMonth();
    const primerDia = new Date(anio, mes, 1);
    const ultimoDia = new Date(anio, mes + 1, 0);

    // Calcular el día de inicio de la semana (lunes = 0)
    let inicioSemana = primerDia.getDay() - 1;
    if (inicioSemana < 0) inicioSemana = 6; // Domingo

    const dias = [];

    // Días del mes anterior (relleno)
    for (let i = inicioSemana - 1; i >= 0; i--) {
      const fecha = new Date(anio, mes, -i);
      dias.push({ fecha, esMesActual: false, acciones: [] });
    }

    // Días del mes actual
    for (let d = 1; d <= ultimoDia.getDate(); d++) {
      const fecha = new Date(anio, mes, d);
      const fechaStr = fecha.toISOString().slice(0, 10);
      const accionesDia = acciones.filter(a => {
        const fin = new Date(a.fecha_fin).toISOString().slice(0, 10);
        return fin === fechaStr;
      });
      dias.push({ fecha, esMesActual: true, acciones: accionesDia });
    }

    // Rellenar hasta completar filas de 7
    while (dias.length % 7 !== 0) {
      const d = dias.length - inicioSemana - ultimoDia.getDate() + 1;
      const fecha = new Date(anio, mes + 1, d);
      dias.push({ fecha, esMesActual: false, acciones: [] });
    }

    return dias;
  }, [mesActual, acciones]);

  // Acciones del día seleccionado
  const accionesDiaSeleccionado = useMemo(() => {
    if (!diaSeleccionado) return [];
    const sel = diaSeleccionado.toISOString().slice(0, 10);
    return acciones.filter(a => new Date(a.fecha_fin).toISOString().slice(0, 10) === sel);
  }, [diaSeleccionado, acciones]);

  // Navegación de meses
  function mesAnterior() {
    setMesActual(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
    setDiaSeleccionado(null);
  }
  function mesSiguiente() {
    setMesActual(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
    setDiaSeleccionado(null);
  }
  function irAHoy() {
    const hoy = new Date();
    setMesActual(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
    setDiaSeleccionado(null);
  }

  // ¿Es hoy?
  const hoyStr = new Date().toISOString().slice(0, 10);

  if (cargando) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-1/4" />
        {[1, 2, 3].map(i => <div key={i} className="h-16 bg-gray-200 rounded" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header con toggle de vista */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agenda</h1>
          <p className="text-sm text-gray-500 mt-1">Tus acciones pendientes organizadas por fecha</p>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setVista('calendario')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              vista === 'calendario' ? 'bg-white text-guinda-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <CalendarDays size={14} />
            Calendario
          </button>
          <button
            onClick={() => setVista('lista')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              vista === 'lista' ? 'bg-white text-guinda-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <List size={14} />
            Lista
          </button>
        </div>
      </div>

      {acciones.length === 0 ? (
        <EmptyState
          icono={CalendarDays}
          titulo="Sin pendientes"
          subtitulo="No tienes acciones pendientes con fecha de vencimiento próxima. ¡Buen trabajo!"
        />
      ) : vista === 'calendario' ? (
        /* ═══ VISTA CALENDARIO ═══ */
        <div className="space-y-4">
          {/* Nav del mes */}
          <div className="card p-4">
            <div className="flex items-center justify-between mb-4">
              <button onClick={mesAnterior} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                <ChevronLeft size={18} className="text-gray-500" />
              </button>
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-gray-800">
                  {MESES[mesActual.getMonth()]} {mesActual.getFullYear()}
                </h2>
                <button onClick={irAHoy} className="text-xs text-guinda-500 hover:text-guinda-700 font-medium">
                  Hoy
                </button>
              </div>
              <button onClick={mesSiguiente} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                <ChevronRight size={18} className="text-gray-500" />
              </button>
            </div>

            {/* Encabezado días de la semana */}
            <div className="grid grid-cols-7 gap-px mb-1">
              {DIAS_SEMANA.map(dia => (
                <div key={dia} className="text-center text-xs font-medium text-gray-400 py-2">
                  {dia}
                </div>
              ))}
            </div>

            {/* Grid de días */}
            <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden">
              {diasDelMes.map((dia, i) => {
                const fechaStr = dia.fecha.toISOString().slice(0, 10);
                const esHoy = fechaStr === hoyStr;
                const estaSeleccionado = diaSeleccionado && diaSeleccionado.toISOString().slice(0, 10) === fechaStr;
                const tieneAcciones = dia.acciones.length > 0;

                return (
                  <button
                    key={i}
                    onClick={() => tieneAcciones && setDiaSeleccionado(dia.fecha)}
                    className={`min-h-[72px] p-1.5 text-left transition-colors relative ${
                      dia.esMesActual ? 'bg-white' : 'bg-gray-50'
                    } ${tieneAcciones ? 'hover:bg-guinda-50 cursor-pointer' : 'cursor-default'} ${
                      estaSeleccionado ? 'ring-2 ring-guinda-400 ring-inset' : ''
                    }`}
                  >
                    <span className={`text-xs font-medium block mb-1 ${
                      esHoy ? 'w-5 h-5 bg-guinda-500 text-white rounded-full flex items-center justify-center' :
                      dia.esMesActual ? 'text-gray-700' : 'text-gray-300'
                    }`}>
                      {dia.fecha.getDate()}
                    </span>

                    {/* Dots de acciones (máximo 3 visibles + indicador) */}
                    {dia.acciones.length > 0 && (
                      <div className="flex flex-wrap gap-0.5">
                        {dia.acciones.slice(0, 3).map((a, j) => (
                          <span key={j} className={`w-1.5 h-1.5 rounded-full ${colorDot(a.fecha_fin)}`} />
                        ))}
                        {dia.acciones.length > 3 && (
                          <span className="text-[9px] text-gray-400">+{dia.acciones.length - 3}</span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Leyenda */}
            <div className="flex items-center gap-4 mt-3 text-[10px] text-gray-400">
              <span className="flex items-center gap-1"><span className="w-2 h-2 bg-red-500 rounded-full" /> Vencida</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 bg-orange-400 rounded-full" /> Esta semana</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 bg-blue-400 rounded-full" /> Próxima</span>
            </div>
          </div>

          {/* Detalle del día seleccionado */}
          {diaSeleccionado && accionesDiaSeleccionado.length > 0 && (
            <div className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">
                  {diaSeleccionado.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
                </h3>
                <button onClick={() => setDiaSeleccionado(null)} className="p-1 rounded hover:bg-gray-100">
                  <X size={14} className="text-gray-400" />
                </button>
              </div>
              <div className="space-y-2">
                {accionesDiaSeleccionado.map(accion => (
                  <FilaAccion key={accion.id} accion={accion} />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ═══ VISTA LISTA ═══ */
        <div className="space-y-6">
          {vencidas.length > 0 && (
            <SeccionAgenda titulo="Vencidas" icono={AlertCircle} colorIcono="text-red-500" colorBorde="border-l-red-500" acciones={vencidas} />
          )}
          {estaSemana.length > 0 && (
            <SeccionAgenda titulo="Esta semana" icono={Clock} colorIcono="text-orange-500" colorBorde="border-l-orange-500" acciones={estaSemana} />
          )}
          {proximas.length > 0 && (
            <SeccionAgenda titulo="Próximas" icono={CalendarDays} colorIcono="text-blue-500" colorBorde="border-l-blue-500" acciones={proximas} />
          )}
        </div>
      )}
    </div>
  );
}

// Sub-componente: fila de acción (reutilizable en calendario y lista)
function FilaAccion({ accion }) {
  return (
    <div className="flex items-center gap-4 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{accion.nombre}</p>
        <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
          {accion.proyecto_nombre && (
            <Link to={`/proyectos/${accion.proyecto_id}`} className="text-guinda-500 hover:underline truncate max-w-48">
              {accion.proyecto_nombre}
            </Link>
          )}
          {accion.etapa_nombre && <span className="text-gray-400 truncate">/ {accion.etapa_nombre}</span>}
        </div>
      </div>
      <EstadoChip estado={accion.estado} />
      <span className="text-sm font-medium text-gray-500 w-12 text-right">
        {parseFloat(accion.porcentaje_avance || 0).toFixed(0)}%
      </span>
      <span className="text-xs text-gray-400 w-20 text-right flex-shrink-0">
        {new Date(accion.fecha_fin).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
      </span>
    </div>
  );
}

// Sub-componente: sección agrupada de la agenda (vista lista)
function SeccionAgenda({ titulo, icono: Icono, colorIcono, colorBorde, acciones }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Icono size={18} className={colorIcono} />
        <h2 className="text-sm font-semibold text-gray-700">{titulo}</h2>
        <span className="text-xs text-gray-400">({acciones.length})</span>
      </div>
      <div className="space-y-2">
        {acciones.map(accion => (
          <div key={accion.id} className={`card border-l-4 ${colorBorde} p-4 flex items-center gap-4`}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{accion.nombre}</p>
              <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                {accion.proyecto_nombre && (
                  <Link to={`/proyectos/${accion.proyecto_id}`} className="text-guinda-500 hover:underline truncate max-w-48">
                    {accion.proyecto_nombre}
                  </Link>
                )}
                {accion.etapa_nombre && <span className="text-gray-400 truncate">/ {accion.etapa_nombre}</span>}
              </div>
            </div>
            <EstadoChip estado={accion.estado} />
            <span className="text-sm font-medium text-gray-500 w-12 text-right">
              {parseFloat(accion.porcentaje_avance || 0).toFixed(0)}%
            </span>
            <span className="text-xs text-gray-400 w-20 text-right flex-shrink-0">
              {new Date(accion.fecha_fin).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
