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
import { useState, useRef, forwardRef, useImperativeHandle } from 'react';
import { CheckCircle2, Lock, RotateCcw, ChevronDown } from 'lucide-react';
import { hijosDe } from './utils';
import { NIVELES } from '../../../config/niveles';
import { COLORES_SEMAFORO } from '../../common/SemaforoDot';
import LineageClicable from '../LineageClicable';
import SelectorEstado from '../../common/SelectorEstado';
import { CampoTextoInline } from './Campos';
import { useVolverAProceso } from '../../../hooks/useVolverAProceso';

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

const EncabezadoDetalle = forwardRef(function EncabezadoDetalle({ nodo, ruta, permisos, onNavegarLineage, onActualizado, mostrarToast, onGuardarCampo, onMarcarCompletada, onEditarFicha }, ref) {
  const { tipo, id, data } = nodo;
  const [descExpandida, setDescExpandida] = useState(false);
  const nivel = NIVELES[tipo];
  const esContenedor = tipo === 'etapa' || data.es_hoja === false;
  const sem = data.semaforo_efectivo || 'gris';
  const avance = data.avance_efectivo ?? (tipo === 'etapa' ? parseFloat(data.porcentaje_calculado || 0) : parseFloat(data.porcentaje_avance || 0));
  const hijos = hijosDe(tipo, data);
  // 2.3: "Cambiar estado" en el menú "Más acciones" de FilaAcciones.jsx
  // abre este MISMO SelectorEstado por ref, en vez de construir un
  // selector nuevo — PanelDetalle.jsx conecta este ref con ese menú.
  const refSelectorEstado = useRef(null);
  useImperativeHandle(ref, () => ({
    abrirSelectorEstado: () => refSelectorEstado.current?.abrir(),
  }), []);
  const sustantivoNodo = tipo === 'etapa' ? 'etapa' : tipo === 'tarea' ? 'tarea' : (data.id_accion_padre ? 'subacción' : 'acción');
  const { volverAProceso, volviendo } = useVolverAProceso({
    entidadTipo: entidadTipoDeNodo(tipo, data),
    entidadId: id,
    sustantivo: sustantivoNodo,
    mostrarToast,
    onCambiado: onActualizado,
  });

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
        <span className="inline-flex items-center gap-1">
          <span className="text-[10px] text-gray-400 uppercase tracking-wide">Estado</span>
          <SelectorEstado
            ref={refSelectorEstado}
            entidadTipo={entidadTipoDeNodo(tipo, data)}
            entidadId={id}
            estadoActual={data.estado || 'Pendiente'}
            estadoOverride={data.estado_override}
            esContenedor={esContenedor}
            onCambio={onActualizado}
            soloLectura={permisos.esSoloLectura}
          />
        </span>
        {data.prioridad && (
          permisos.esSoloLectura ? (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-gray-100 text-gray-600">
              Prioridad {data.prioridad}
            </span>
          ) : (
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => onEditarFicha?.('prioridad')}
              className="group inline-flex items-center gap-0.5 text-[10px] font-semibold px-2 py-0.5 rounded bg-gray-100 text-gray-600 cursor-pointer hover:bg-gray-200 outline-none focus-visible:ring-2 focus-visible:ring-guinda-500 focus-visible:ring-offset-1"
              title="Cambiar prioridad en Editar ficha"
            >
              Prioridad {data.prioridad}
              <ChevronDown size={11} className="text-gray-400 group-hover:text-gray-600 flex-shrink-0" />
            </button>
          )
        )}
        {hijos.length > 0 && (
          <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-500">
            {/* Bloque 4.2: singular con 1, nunca "1 acciones" */}
            {hijos.length} {(hijos.length === 1 ? nivel.hijoLabel || 'elemento' : nivel.hijoLabelPlural || 'elementos').toLowerCase()}
          </span>
        )}
        {/* Fase 3 del modelo de permisos — mismo permisos.esSoloLectura por
            nodo que ya oculta los controles de edición de este encabezado
            (ver CampoTextoInline/SelectorEstado arriba), no un cálculo
            propio del chip. */}
        {permisos.esSoloLectura && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-gray-100 text-gray-600">
            <Lock size={9} /> Consulta
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
            contenedor no se captura) y solo si falta por completar.
            Simétrico en el otro sentido: si el nodo YA está Completada
            (hoja o contenedor — a diferencia de "Marcar como completada",
            aquí sí aplica a un contenedor, porque es solo un cambio de
            estado, no una captura de avance), el mismo lugar ofrece
            "Volver a En proceso" en un clic — mismo hook
            (useVolverAProceso) que usa FilaAcciones.jsx para el atajo
            junto a "Agregar X" en un nodo completado, no una
            implementación nueva. */}
        {data.estado === 'Completada' ? (
          !permisos.esSoloLectura && (
            <button
              onClick={volverAProceso}
              disabled={volviendo}
              className="flex-shrink-0 flex items-center gap-1 text-[11px] font-medium text-guinda-600 hover:text-guinda-800 disabled:opacity-50"
            >
              <RotateCcw size={12} /> {volviendo ? 'Volviendo a En proceso…' : 'Volver a En proceso'}
            </button>
          )
        ) : (
          onMarcarCompletada && !permisos.esSoloLectura && (
            <button
              onClick={onMarcarCompletada}
              className="flex-shrink-0 flex items-center gap-1 text-[11px] font-medium text-green-700 hover:text-green-800"
            >
              <CheckCircle2 size={12} /> Marcar como completada
            </button>
          )
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
});

export default EncabezadoDetalle;
