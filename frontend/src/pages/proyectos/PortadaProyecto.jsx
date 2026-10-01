/**
 * ARCHIVO: PortadaProyecto.jsx
 * PROPÓSITO: Primera pantalla al abrir un proyecto (ruta índice
 *            /proyectos/:id). Línea de contexto con números reales +
 *            rejilla de fichas hacia cada sección, cada una con sus
 *            propios contadores (de GET /proyectos/:id/portada-resumen,
 *            UNA sola llamada) y 1-2 atajos directos.
 *
 * La ficha "Configuración" se agrega en la Fase 2 de este rediseño,
 * cuando esa sección exista de verdad — no tiene sentido mostrar una
 * ficha que lleva a una ruta que todavía no existe.
 */
import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Settings, LayoutDashboard, FileText, BookText, Loader2, AlertTriangle, Clock } from 'lucide-react';
import * as proyectosApi from '../../api/proyectos';

function formatoFechaRelativa(iso) {
  if (!iso) return 'Sin movimientos todavía';
  const fecha = new Date(iso);
  const dias = Math.floor((Date.now() - fecha.getTime()) / 86400000);
  if (dias <= 0) return 'Hoy';
  if (dias === 1) return 'Ayer';
  if (dias < 30) return `Hace ${dias} días`;
  return fecha.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function FichaSeccion({ to, icono: Icono, titulo, descripcion, contadores, atajos, destacada, cargandoContadores }) {
  return (
    <div className={`relative bg-white border rounded-xl p-4 flex flex-col gap-2.5 transition-shadow hover:shadow-md ${
      destacada ? 'border-guinda-200 border-l-4 border-l-guinda-500' : 'border-gray-200'
    }`}>
      <Link to={to} className="absolute inset-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-guinda-400" aria-label={titulo} />
      <div className="flex items-center gap-2.5">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${destacada ? 'bg-guinda-50 text-guinda-600' : 'bg-gray-50 text-gray-500'}`}>
          <Icono size={18} />
        </div>
        <h3 className="text-sm font-semibold text-gray-900">{titulo}</h3>
      </div>
      <p className="text-xs text-gray-500 leading-relaxed">{descripcion}</p>
      <div className="text-xs text-gray-400 min-h-[16px]">
        {cargandoContadores ? (
          <span className="inline-flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> Cargando…</span>
        ) : contadores}
      </div>
      {atajos && atajos.length > 0 && (
        <div className="relative z-10 flex flex-wrap gap-x-3 gap-y-1 mt-auto pt-1">
          {atajos.map((a, i) => (
            <Link key={i} to={a.to} className="text-xs font-medium text-guinda-600 hover:text-guinda-800 hover:underline">
              {a.etiqueta}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PortadaProyecto() {
  const { proyecto, permisos, proyectoId } = useOutletContext();
  const [resumen, setResumen] = useState(null);
  const [cargandoResumen, setCargandoResumen] = useState(true);
  const [errorResumen, setErrorResumen] = useState(false);

  useEffect(() => {
    let cancelado = false;
    setCargandoResumen(true);
    setErrorResumen(false);
    proyectosApi.obtenerPortadaResumen(proyectoId)
      .then(datos => { if (!cancelado) setResumen(datos); })
      .catch(() => { if (!cancelado) setErrorResumen(true); })
      .finally(() => { if (!cancelado) setCargandoResumen(false); });
    return () => { cancelado = true; };
  }, [proyectoId]);

  const soloLectura = permisos?.esSoloLectura;

  return (
    <div className="space-y-5">
      {/* Línea de contexto — números, no tablero */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-4 py-2.5">
        {cargandoResumen ? (
          <span className="inline-flex items-center gap-1.5 text-gray-400"><Loader2 size={13} className="animate-spin" /> Calculando resumen…</span>
        ) : errorResumen ? (
          <span className="inline-flex items-center gap-1.5 text-amber-600"><AlertTriangle size={13} /> No se pudo cargar el resumen del proyecto.</span>
        ) : (
          <>
            <span><strong className="text-gray-700">{resumen.avance_pct}%</strong> de avance</span>
            <span className="text-gray-300">·</span>
            <span className={resumen.acciones_vencidas > 0 ? 'text-red-600 font-medium' : ''}>
              {resumen.acciones_vencidas} acción{resumen.acciones_vencidas !== 1 ? 'es' : ''} vencida{resumen.acciones_vencidas !== 1 ? 's' : ''}
            </span>
            <span className="text-gray-300">·</span>
            <span>{resumen.acciones_por_vencer} por vencer en 30 días</span>
            <span className="text-gray-300">·</span>
            <span className={resumen.riesgos_abiertos > 0 ? 'text-amber-600 font-medium' : ''}>
              {resumen.riesgos_abiertos} riesgo{resumen.riesgos_abiertos !== 1 ? 's' : ''} abierto{resumen.riesgos_abiertos !== 1 ? 's' : ''}
            </span>
            <span className="text-gray-300">·</span>
            <span className="inline-flex items-center gap-1 text-gray-400">
              <Clock size={12} /> Último movimiento: {formatoFechaRelativa(resumen.ultimo_movimiento?.created_at)}
            </span>
          </>
        )}
      </div>

      <div>
        <h2 className="text-base font-semibold text-gray-800">¿Qué quieres hacer en este proyecto?</h2>
        <p className="text-xs text-gray-400 mt-0.5">Elige una sección — cada una tiene su propio objetivo.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <FichaSeccion
          to={`/proyectos/${proyectoId}/seguimiento`}
          icono={Settings}
          titulo="Seguimiento"
          descripcion="Registra y actualiza el trabajo del proyecto: etapas, acciones y tareas, con su avance, responsable y fechas."
          cargandoContadores={cargandoResumen}
          contadores={!errorResumen && resumen && (
            <>{resumen.etapas_total} etapa{resumen.etapas_total !== 1 ? 's' : ''} · {resumen.acciones_vencidas} vencida{resumen.acciones_vencidas !== 1 ? 's' : ''} · {formatoFechaRelativa(resumen.ultimo_movimiento?.created_at)}</>
          )}
          atajos={soloLectura ? [] : [{ etiqueta: 'Ver lo vencido', to: `/proyectos/${proyectoId}/seguimiento` }]}
          destacada
        />
        <FichaSeccion
          to={`/proyectos/${proyectoId}/resumen`}
          icono={LayoutDashboard}
          titulo="Resumen"
          descripcion="Consulta cómo va el proyecto: avance, indicadores, riesgos y actividad reciente."
          cargandoContadores={cargandoResumen}
          contadores={!errorResumen && resumen && (
            <>{resumen.avance_pct}% de avance · {resumen.indicadores_total} indicador{resumen.indicadores_total !== 1 ? 'es' : ''} · {resumen.riesgos_abiertos} riesgo{resumen.riesgos_abiertos !== 1 ? 's' : ''} abierto{resumen.riesgos_abiertos !== 1 ? 's' : ''}</>
          )}
          atajos={[{ etiqueta: 'Ver riesgos', to: `/proyectos/${proyectoId}/resumen` }]}
        />
        <FichaSeccion
          to={`/proyectos/${proyectoId}/documentos`}
          icono={FileText}
          titulo="Documentos"
          descripcion="Consulta, sube y descarga los archivos y evidencias del proyecto."
          cargandoContadores={cargandoResumen}
          contadores={!errorResumen && resumen && (
            <>{resumen.documentos_total} documento{resumen.documentos_total !== 1 ? 's' : ''}</>
          )}
        />
        <FichaSeccion
          to={`/proyectos/${proyectoId}/bitacora`}
          icono={BookText}
          titulo="Bitácora"
          descripcion="Revisa el historial del proyecto: quién hizo qué y cuándo."
          cargandoContadores={cargandoResumen}
          contadores={!errorResumen && resumen && (
            <>Último: {formatoFechaRelativa(resumen.ultimo_movimiento?.created_at)}</>
          )}
        />
      </div>
    </div>
  );
}
