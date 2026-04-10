/**
 * ARCHIVO: TarjetaProyecto.jsx
 * PROPÓSITO: Card resumen de un proyecto para el grid de ListadoProyectos.
 *
 * MINI-CLASE: Cards como unidad visual de información
 * ─────────────────────────────────────────────────────────────────
 * Cada tarjeta muestra un resumen compacto del proyecto: imagen
 * representativa (o gradiente por tipo), nombre, DG líder, estado,
 * porcentaje, y conteos clave. El click navega al detalle. Si el
 * proyecto tiene imagen_url, se muestra; si no, se genera un
 * gradiente determinístico basado en el tipo de proyecto.
 * ─────────────────────────────────────────────────────────────────
 */
import { Link } from 'react-router-dom';
import EstadoChip from '../common/EstadoChip';
import BarraProgreso from '../common/BarraProgreso';
import { Star, AlertTriangle, Building2, Map, FileText, Landmark, Wrench } from 'lucide-react';

// Gradientes y íconos por tipo de proyecto (para cuando no hay imagen)
const estilosPorTipo = {
  Obra:             { gradiente: 'from-amber-500 to-orange-600',    icono: Building2 },
  Programa:         { gradiente: 'from-blue-500 to-indigo-600',     icono: Landmark },
  Estudio:          { gradiente: 'from-purple-500 to-violet-600',   icono: FileText },
  Politica_publica: { gradiente: 'from-green-500 to-emerald-600',   icono: Landmark },
  Geoespacial:      { gradiente: 'from-teal-500 to-cyan-600',       icono: Map },
  Normativo:        { gradiente: 'from-rose-500 to-pink-600',       icono: FileText },
  Infraestructura:  { gradiente: 'from-sky-500 to-blue-600',        icono: Wrench },
};
const estiloDefault = { gradiente: 'from-guinda-500 to-guinda-700', icono: Building2 };

export default function TarjetaProyecto({ proyecto }) {
  const estilo = estilosPorTipo[proyecto.tipo] || estiloDefault;
  const IconoTipo = estilo.icono;

  return (
    <Link
      to={`/proyectos/${proyecto.id}`}
      className="card overflow-hidden hover:shadow-md transition-shadow block"
    >
      {/* Imagen representativa o gradiente */}
      <div className={`h-24 relative bg-gradient-to-br ${estilo.gradiente}`}>
        {proyecto.imagen_url ? (
          <img src={proyecto.imagen_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center opacity-20">
            <IconoTipo size={48} className="text-white" />
          </div>
        )}
        {/* Badge prioritario */}
        {proyecto.es_prioritario && (
          <div className="absolute top-2 right-2 bg-yellow-400 rounded-full p-1 shadow-sm">
            <Star size={12} className="text-yellow-800 fill-yellow-800" />
          </div>
        )}
        {/* DG en la imagen */}
        <div className="absolute bottom-2 left-2">
          <span className="text-[10px] font-bold text-white bg-black/30 px-2 py-0.5 rounded backdrop-blur-sm">
            {proyecto.dg_lider_siglas}
          </span>
        </div>
      </div>

      {/* Contenido */}
      <div className="p-4">
        {/* Nombre */}
        <h3 className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2 mb-2">
          {proyecto.nombre}
        </h3>

        {/* Estado, tipo y programa */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <EstadoChip estado={proyecto.estado} />
          <span className="text-xs text-gray-400">{proyecto.tipo?.replace(/_/g, ' ')}</span>
          {proyecto.programa_clave && (
            <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{proyecto.programa_clave}</span>
          )}
        </div>

        {/* Barra de progreso */}
        <BarraProgreso porcentaje={proyecto.porcentaje_calculado} className="mb-3" />

        {/* Métricas rápidas */}
        <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-gray-100">
          <span>{proyecto.total_etapas || 0} etapas</span>
          <span>{proyecto.acciones_pendientes || 0} pendientes</span>
          {parseInt(proyecto.riesgos_activos) > 0 && (
            <span className="flex items-center text-orange-500">
              <AlertTriangle size={12} className="mr-1" />
              {proyecto.riesgos_activos}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
