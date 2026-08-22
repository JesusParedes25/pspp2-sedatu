/**
 * ARCHIVO: FichaNodo.jsx
 * PROPÓSITO: Panel derecho del elemento seleccionado, en 4 grupos:
 *            a) Encabezado corto ("Etapa · Manzanillo") — el nombre
 *               completo, las insignias y el avance ya se ven en la
 *               columna central (Detalle) o en la tarjeta del canvas
 *               (Diagrama); repetirlos aquí era la duplicación que se
 *               quitó en este rediseño.
 *            b) Actividad — Registrar avance / Reportar riesgo (dentro
 *               de NodoCard, prop `agrupado`).
 *            c) Ficha — fechas, prioridad, instrumento, escala y modo de
 *               cálculo del avance, en lectura, con un enlace "Editar".
 *            d) Vinculación — Indicador / Territorio / Participante,
 *               también dentro de NodoCard (`agrupado`), que además baja
 *               Duplicar/Eliminar al pie del panel.
 *            Es el MISMO componente que monta tanto el rail de "Detalle"
 *            como el drawer de "Diagrama".
 *
 * MINI-CLASE: por qué NO incluye Actividad
 * ─────────────────────────────────────────────────────────────────
 * En "Detalle" el feed de Actividad vive al fondo de la columna central
 * (sigue a la selección, no al foco). En "Diagrama" vive en su propia
 * pestaña del drawer. En ambos casos es un componente hermano
 * (ActividadStream), no un hijo de esta ficha — así cada layout decide
 * dónde ponerlo sin que esta ficha tenga que saber en cuál de los dos
 * está montada. Por la misma razón "Comentar"/"Evidencia"/"Riesgos" ya
 * no tienen botón de VER aquí (NodoCard con `agrupado`): esa lectura ya
 * está a un lado, en ese mismo feed.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState } from 'react';
import { Pencil, X } from 'lucide-react';
import NodoCard from '../nodos/NodoCard';
import PropiedadesElemento from './PropiedadesElemento';
import LineageClicable from './LineageClicable';
import { formatFecha } from '../../utils/fecha';
import { NIVELES } from '../../config/niveles';
import { permisosDeNodo } from '../../hooks/usePermisos';

export default function FichaNodo({ nodo, proyectoId, permisos: permisosProyecto, ruta, onNavegarLineage, onActualizado, onEliminado, mostrarToast }) {
  const { tipo, id, data } = nodo;
  const permisos = permisosDeNodo(permisosProyecto, tipo, id);
  const nivel = NIVELES[tipo];
  const esContenedor = tipo === 'etapa' || data.es_hoja === false;
  const [editandoFicha, setEditandoFicha] = useState(false);

  return (
    // flex-1 (no h-full): en el drawer de Diagrama esta ficha comparte su
    // contenedor flex-col con la lista de "ir a hijo" que va debajo — con
    // h-full se llevaría el 100% del alto y esa lista no tendría espacio.
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* a) Encabezado corto */}
      <div className="flex-shrink-0 px-4 pt-3.5 pb-2.5 border-b border-gray-100">
        {ruta && <LineageClicable ruta={ruta} onNavegar={onNavegarLineage} className="mb-1" />}
        <p className="text-xs text-gray-500">
          <span className="font-medium text-gray-700">{nivel.label}</span> · {data.nombre}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pt-3 space-y-3">
        {/* b) Actividad — Registrar avance / Reportar riesgo / último registro */}
        <NodoCard
          tipo={tipo}
          nodo={data}
          esContenedor={esContenedor}
          proyectoId={proyectoId}
          permisos={permisos}
          onCambiado={onActualizado}
          // El nodo eliminado es justo el que esta ficha está mostrando, así
          // que el contenedor tiene que soltar la selección además de
          // recargar — si no, queda apuntando a un id que ya no existe.
          onEliminado={onEliminado}
          ocultarMetadataFooter
          ocultarCabecera
          defaultAbierto
          agrupado
        />

        {/* c) Ficha — resumen en lectura, "Editar" revela los mismos
            campos editables (PropiedadesElemento). */}
        <div className="border border-gray-200 rounded-lg px-3.5 py-3">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">Ficha</span>
            {!permisos.esSoloLectura && (
              <button
                onClick={() => setEditandoFicha(v => !v)}
                className="flex items-center gap-1 text-[11px] font-medium text-guinda-700 hover:text-guinda-800"
              >
                {editandoFicha ? <><X size={11} /> Cerrar</> : <><Pencil size={11} /> Editar</>}
              </button>
            )}
          </div>

          {editandoFicha ? (
            <PropiedadesElemento
              nodo={nodo}
              permisos={permisosProyecto}
              onActualizado={onActualizado}
              mostrarToast={mostrarToast}
            />
          ) : (
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
              {!esContenedor && (
                <div>
                  <span className="text-[10px] text-gray-400 block">Fecha inicio</span>
                  <span className="text-gray-700">{formatFecha(data.fecha_inicio) || 'Sin definir'}</span>
                </div>
              )}
              <div>
                <span className="text-[10px] text-gray-400 block">Fecha límite</span>
                <span className="text-gray-700">{formatFecha(data.fecha_limite) || 'Sin definir'}</span>
              </div>
              <div>
                <span className="text-[10px] text-gray-400 block">Prioridad</span>
                <span className="text-gray-700">{data.prioridad || 'Sin definir'}</span>
              </div>
              <div>
                <span className="text-[10px] text-gray-400 block">Avance</span>
                <span className="text-gray-700">{esContenedor ? 'Automático' : 'Manual'}</span>
              </div>
              {tipo !== 'tarea' && (
                <>
                  <div>
                    <span className="text-[10px] text-gray-400 block">Instrumento principal</span>
                    <span className="text-gray-700">{data.instrumento || 'Sin definir'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400 block">Escala territorial</span>
                    <span className="text-gray-700">{data.escala_territorial || 'Sin definir'}</span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
