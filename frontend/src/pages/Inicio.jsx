/**
 * ARCHIVO: Inicio.jsx
 * PROPÓSITO: Dashboard principal con resumen de proyectos y pendientes del usuario.
 *
 * MINI-CLASE: Dashboard como punto de entrada
 * ─────────────────────────────────────────────────────────────────
 * El dashboard muestra un resumen ejecutivo: total de proyectos,
 * proyectos activos, acciones pendientes del usuario, y riesgos
 * críticos. Usa tarjetas con métricas y los últimos proyectos
 * modificados. Es la primera pantalla que ve el usuario al entrar.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FolderKanban, Clock, AlertTriangle, TrendingUp, Plus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useProyectos } from '../hooks/useProyectos';
import TarjetaProyecto from '../components/proyectos/TarjetaProyecto';

export default function Inicio() {
  const { usuario } = useAuth();
  const { proyectos, total, cargando } = useProyectos({ limite: 6 });

  // Métricas rápidas calculadas desde los proyectos cargados
  const activos = proyectos.filter(p => p.estado === 'En_proceso').length;
  const conRiesgos = proyectos.filter(p => parseInt(p.riesgos_activos) > 0).length;

  return (
    <div className="space-y-6">
      {/* Saludo */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Buen día, {usuario?.nombre_completo?.split(' ')[0]}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {usuario?.dg_siglas} — {new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Tarjetas de métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricaCard
          icono={FolderKanban}
          titulo="Total proyectos"
          valor={total}
          color="bg-guinda-50 text-guinda-600"
        />
        <MetricaCard
          icono={TrendingUp}
          titulo="En proceso"
          valor={activos}
          color="bg-blue-50 text-blue-600"
        />
        <MetricaCard
          icono={Clock}
          titulo="Pendientes"
          valor={proyectos.reduce((s, p) => s + parseInt(p.acciones_pendientes || 0), 0)}
          color="bg-yellow-50 text-yellow-600"
        />
        <MetricaCard
          icono={AlertTriangle}
          titulo="Con riesgos"
          valor={conRiesgos}
          color="bg-red-50 text-red-600"
        />
      </div>

      {/* Proyectos recientes */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Proyectos recientes</h2>
          <div className="flex gap-2">
            <Link to="/proyectos" className="btn-secondary text-xs">Ver todos</Link>
            <Link to="/proyectos/nuevo" className="btn-primary text-xs flex items-center gap-1">
              <Plus size={14} />
              Nuevo
            </Link>
          </div>
        </div>

        {cargando ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="card p-5 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-3" />
                <div className="h-3 bg-gray-200 rounded w-1/2 mb-3" />
                <div className="h-2 bg-gray-200 rounded w-full mb-3" />
                <div className="h-3 bg-gray-200 rounded w-1/3" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {proyectos.map(proyecto => (
              <TarjetaProyecto key={proyecto.id} proyecto={proyecto} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Sub-componente: tarjeta de métrica individual
function MetricaCard({ icono: Icono, titulo, valor, color }) {
  return (
    <div className="card p-4 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${color}`}>
        <Icono size={22} />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{valor}</p>
        <p className="text-xs text-gray-500">{titulo}</p>
      </div>
    </div>
  );
}
