/**
 * ARCHIVO: EncabezadoDetalle.jsx
 * PROPÓSITO: Encabezado del panel derecho de Detalle (Fase 2 del
 *            rediseño) — ruta completa clicable, título editable en
 *            sitio, chips (nivel/estatus/prioridad/n° de hijos), avance
 *            con leyenda honesta sobre cómo se calcula, y descripción.
 *            Componente nuevo, propio de Detalle: no sustituye ni toca
 *            el encabezado corto de FichaNodo.jsx (ese sigue existiendo
 *            tal cual para Diagrama) — aquí se arma desde cero con las
 *            piezas ya compartidas (LineageClicable, CampoTextoInline,
 *            SelectorEstado) para no duplicar su lógica.
 *
 * El Estatus vive aquí como un SelectorEstado real (no un chip de solo
 * lectura): es el mismo control de siempre, con su propia gobernanza
 * (motivo de bloqueo, cascada a hijos, auditoría) — el chip visual que
 * ya trae EstadoChip por dentro es, literalmente, el chip que pedía el
 * encabezado, así que no hace falta un chip aparte solo para mostrar el
 * valor y otro control distinto para cambiarlo.
 */
import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { hijosDe } from './utils';
import { NIVELES } from '../../../config/niveles';
import { COLORES_SEMAFORO } from '../../common/SemaforoDot';
import LineageClicable from '../LineageClicable';
import SelectorEstado from '../../common/SelectorEstado';
import { CampoTextoInline } from './Campos';

function entidadTipoDeNodo(tipo, data) {
  if (tipo === 'etapa') return 'Etapa';
  if (tipo === 'accion') return data.id_accion_padre ? 'Subaccion' : 'Accion';
  return 'Tarea';
}

function leyendaAvance(tipo, esContenedor) {
  if (!esContenedor) return 'Se registra en este nivel.';
  if (tipo === 'etapa') return 'Calculado desde sus acciones.';
  return 'Calculado desde sus tareas.';
}

export default function EncabezadoDetalle({ nodo, ruta, permisos, onNavegarLineage, onActualizado, mostrarToast, onGuardarCampo, onMarcarCompletada }) {
  const { tipo, id, data } = nodo;
  const [descExpandida, setDescExpandida] = useState(false);
  const nivel = NIVELES[tipo];
  const esContenedor = tipo === 'etapa' || data.es_hoja === false;
  const sem = data.semaforo_efectivo || 'gris';
  const avance = data.avance_efectivo ?? (tipo === 'etapa' ? parseFloat(data.porcentaje_calculado || 0) : parseFloat(data.porcentaje_avance || 0));
  const hijos = hijosDe(tipo, data);

  return (
    <div className="pb-4 mb-4 border-b border-gray-100">
      <LineageClicable ruta={ruta} onNavegar={onNavegarLineage} className="mb-2" />

      <CampoTextoInline
        valor={data.nombre}
        campo="nombre"
        onGuardar={v => onGuardarCampo('nombre', v)}
        soloLectura={permisos.esSoloLectura}
        className="text-xl font-bold text-gray-900 leading-tight"
        iconoEditar
        requerido
      />

      <div className="flex items-center flex-wrap gap-1.5 mt-2.5">
        <span
          className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider text-white"
          style={{ backgroundColor: nivel.color }}
        >
          {nivel.label}
        </span>
        <SelectorEstado
          entidadTipo={entidadTipoDeNodo(tipo, data)}
          entidadId={id}
          estadoActual={data.estado || 'Pendiente'}
          estadoOverride={data.estado_override}
          esContenedor={esContenedor}
          onCambio={onActualizado}
          soloLectura={permisos.esSoloLectura}
        />
        {data.prioridad && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-gray-100 text-gray-600">
            Prioridad {data.prioridad}
          </span>
        )}
        {hijos.length > 0 && (
          <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-500">
            {hijos.length} {(nivel.hijoLabelPlural || 'elementos').toLowerCase()}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${Math.min(avance, 100)}%`, backgroundColor: COLORES_SEMAFORO[sem] }}
          />
        </div>
        <span className="text-base font-bold tabular-nums w-12 text-right" style={{ color: COLORES_SEMAFORO[sem] }}>
          {Math.round(avance)}%
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 mt-1">
        <p className="text-[11px] text-gray-400">{leyendaAvance(tipo, esContenedor)}</p>
        {/* Atajo directo para el caso más común al cerrar un pendiente —
            sin esto, marcar como completada exige abrir "Registrar
            avance" y tocar la casilla ahí. Solo en hojas (el avance de un
            contenedor no se captura) y solo si falta por completar. */}
        {onMarcarCompletada && !permisos.esSoloLectura && data.estado !== 'Completada' && (
          <button
            onClick={onMarcarCompletada}
            className="flex-shrink-0 flex items-center gap-1 text-[11px] font-medium text-green-700 hover:text-green-800"
          >
            <CheckCircle2 size={12} /> Marcar como completada
          </button>
        )}
      </div>

      <div className="mt-3">
        {permisos.esSoloLectura ? (
          <>
            <p className={`text-sm text-gray-600 leading-relaxed ${descExpandida ? '' : 'line-clamp-2'}`}>
              {data.descripcion || <span className="italic text-gray-300">Sin descripción.</span>}
            </p>
            {(data.descripcion || '').length > 100 && (
              <button onClick={() => setDescExpandida(v => !v)} className="text-[11px] text-guinda-700 hover:text-guinda-800 font-medium mt-0.5">
                {descExpandida ? 'Ver menos' : 'Ver más'}
              </button>
            )}
          </>
        ) : (
          <CampoTextoInline
            valor={data.descripcion || ''}
            campo="descripcion"
            onGuardar={v => onGuardarCampo('descripcion', v)}
            soloLectura={false}
            placeholder="Agregar descripción…"
            className="text-sm text-gray-600"
            multiline
          />
        )}
      </div>
    </div>
  );
}
