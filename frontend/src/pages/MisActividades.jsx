/**
 * ARCHIVO: MisActividades.jsx
 * PROPÓSITO: Módulo "Mis actividades" — pestañas Pendientes (nodos donde el
 *            usuario es responsable/asignado, no completados) y Agenda
 *            (el módulo de Agenda existente, embebido tal cual).
 */
import { useState, useEffect, useMemo } from 'react';
import { ListChecks, CalendarDays, AlertTriangle, Clock, TrendingUp } from 'lucide-react';
import * as accionesApi from '../api/acciones';
import NodoCard from '../components/nodos/NodoCard';
import Agenda from './Agenda';

const PERIODOS = [
  { id: 'semana', label: 'Semana', dias: 7 },
  { id: 'mes', label: 'Mes', dias: 30 },
  { id: 'trimestre', label: 'Trimestre', dias: 90 },
  { id: 'anio', label: 'Año', dias: 365 },
];

const PERMISOS_PROPIOS = { esSoloLectura: false, puedeInvitar: true, puedeCrearAccion: false };

function diasRestantes(fecha) {
  if (!fecha) return null;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const [y, m, d] = String(fecha).slice(0, 10).split('-').map(Number);
  if (!y) return null;
  return Math.ceil((new Date(y, m - 1, d) - hoy) / 86400000);
}

export default function MisActividades() {
  const [tab, setTab] = useState('pendientes');
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [periodo, setPeriodo] = useState('mes');

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

  const pendientes = useMemo(
    () => items.filter(it => it.estado !== 'Completada' && it.estado !== 'Cancelada'),
    [items]
  );

  const filtrados = useMemo(() => {
    const dias = PERIODOS.find(p => p.id === periodo)?.dias ?? 30;
    return pendientes
      .filter(it => {
        const d = diasRestantes(it.fecha_fin);
        return d === null || d <= dias; // sin fecha se incluye siempre; vencidas también (d negativo)
      })
      .sort((a, b) => {
        const da = diasRestantes(a.fecha_fin); const db = diasRestantes(b.fecha_fin);
        if (da === null) return 1; if (db === null) return -1;
        return da - db;
      });
  }, [pendientes, periodo]);

  const resumen = useMemo(() => {
    const vencidas = pendientes.filter(it => (diasRestantes(it.fecha_fin) ?? 1) < 0).length;
    const proximas = pendientes.filter(it => { const d = diasRestantes(it.fecha_fin); return d !== null && d >= 0 && d <= 7; }).length;
    const enProceso = pendientes.filter(it => it.estado === 'En_proceso').length;
    return { total: pendientes.length, vencidas, proximas, enProceso };
  }, [pendientes]);

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
          {/* Resumen */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { lbl: 'Actualizado', val: resumen.total, cls: 'text-gray-800', I: ListChecks, iconCls: 'text-gray-400' },
              { lbl: 'Vencidas', val: resumen.vencidas, cls: resumen.vencidas > 0 ? 'text-red-600' : 'text-gray-800', I: AlertTriangle, iconCls: 'text-red-400' },
              { lbl: 'Próximas (≤7d)', val: resumen.proximas, cls: 'text-amber-600', I: Clock, iconCls: 'text-amber-400' },
              { lbl: 'En proceso', val: resumen.enProceso, cls: 'text-gray-800', I: TrendingUp, iconCls: 'text-blue-400' },
            ].map(s => (
              <div key={s.lbl} className="card p-3.5">
                <div className="flex items-center gap-1.5 mb-1"><s.I size={13} className={s.iconCls} /><span className="text-xs text-gray-500">{s.lbl}</span></div>
                <div className={`text-2xl font-bold ${s.cls}`}>{s.val}</div>
              </div>
            ))}
          </div>

          {/* Filtro de periodo */}
          <div className="flex gap-1.5">
            {PERIODOS.map(p => (
              <button key={p.id} onClick={() => setPeriodo(p.id)}
                className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${periodo === p.id ? 'bg-guinda-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                {p.label}
              </button>
            ))}
          </div>

          {/* Lista */}
          {cargando ? (
            <div className="space-y-2 animate-pulse">{[1, 2, 3].map(i => <div key={i} className="h-14 bg-gray-200 rounded-lg" />)}</div>
          ) : filtrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <ListChecks size={32} className="mb-2 text-gray-200" />
              <p className="text-sm">Sin pendientes en este periodo.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtrados.map(it => {
                const breadcrumb = [it.proyecto_nombre, it.etapa_nombre, it.accion_nombre].filter(Boolean).join(' › ');
                return (
                  <NodoCard
                    key={`${it.tipo}-${it.id}`}
                    tipo={it.tipo}
                    nodo={it}
                    esContenedor={false}
                    proyectoId={it.proyecto_id}
                    permisos={PERMISOS_PROPIOS}
                    breadcrumb={breadcrumb}
                    onProyectoClick={`/proyectos/${it.proyecto_id}?tab=seguimiento&nodo=${it.id}`}
                    onCambiado={cargar}
                  />
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <Agenda />
      )}
    </div>
  );
}
