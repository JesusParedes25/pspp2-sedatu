/**
 * ARCHIVO: FichaNodo.jsx
 * PROPÓSITO: Ficha única del elemento seleccionado — encabezado sticky
 *            (lineage + chip de nivel + badges + título), avance grande,
 *            bloque de origen del avance (calculado o editable), acciones
 *            completas en dos grupos (sin acordeón) y las propiedades del
 *            nivel. Es el MISMO componente que monta tanto el rail de
 *            "Detalle" como el drawer de "Diagrama" — cada uno lo coloca
 *            en su propio contenedor con su propio scroll; esta ficha no
 *            sabe ni le importa cuál de los dos es.
 *
 * MINI-CLASE: por qué NO incluye Actividad
 * ─────────────────────────────────────────────────────────────────
 * En "Detalle" el feed de Actividad vive al fondo de la columna central
 * (sigue a la selección, no al foco). En "Diagrama" vive en su propia
 * pestaña del drawer. En ambos casos es un componente hermano
 * (ActividadStream), no un hijo de esta ficha — así cada layout decide
 * dónde ponerlo sin que esta ficha tenga que saber en cuál de los dos
 * está montada.
 * ─────────────────────────────────────────────────────────────────
 */
import { useRef } from 'react';
import NodoCard from '../nodos/NodoCard';
import PropiedadesElemento from './PropiedadesElemento';
import CrearInline from './EtapasAvancesMD/CrearInline';
import LineageClicable from './LineageClicable';
import BloqueCalculado from './BloqueCalculado';
import BloqueEditable from './BloqueEditable';
import { COLORES_SEMAFORO, CHIP_BG } from '../common/SemaforoDot';
import { NIVELES } from '../../config/niveles';
import { prefersReducedMotion } from '../../utils/motion';

export default function FichaNodo({ nodo, proyectoId, permisos, ruta, onNavegarLineage, onActualizado, onEliminado, mostrarToast }) {
  const { tipo, id, data } = nodo;
  const nivel = NIVELES[tipo];
  // El botón "Registrar avance" (dentro de NodoCard, más abajo) y el bloque
  // editable del avance viven los dos aquí adentro — el scroll-hacia-el-
  // bloque es enteramente interno a esta ficha, no necesita salir de ella.
  const avanceRef = useRef(null);
  const sem = data.semaforo_efectivo || 'gris';
  const estado = data.estado || 'Pendiente';
  const avance = data.avance_efectivo ?? (tipo === 'etapa' ? parseFloat(data.porcentaje_calculado || 0) : parseFloat(data.porcentaje_avance || 0));
  const esContenedor = tipo === 'etapa' || data.es_hoja === false;

  const hijos = tipo === 'etapa'
    ? (data.acciones || [])
    : tipo === 'accion'
      ? [...(data.subacciones || []), ...(data.tareas || [])]
      : [];
  const completadosHijos = hijos.filter(h => h.estado === 'Completada').length;

  function irARegistrarAvance() {
    avanceRef.current?.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'nearest' });
    avanceRef.current?.focus();
  }

  return (
    // flex-1 (no h-full): en el drawer de Diagrama esta ficha comparte su
    // contenedor flex-col con la lista de "ir a hijo" que va debajo — con
    // h-full se llevaría el 100% del alto y esa lista no tendría espacio.
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Cabecera pegajosa — lineage corto + chip de nivel (ícono y color
          propios, nunca el color de estatus) + badge de estatus + badge
          "calculado" + título. */}
      <div className="flex-shrink-0 px-4 pt-3.5 pb-3 border-b border-gray-100">
        {ruta && <LineageClicable ruta={ruta} onNavegar={onNavegarLineage} className="mb-1.5" />}
        <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
          <span
            className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider text-white"
            style={{ backgroundColor: nivel.color }}
          >
            <nivel.icono size={10} aria-hidden="true" />
            {nivel.label}
          </span>
          <span
            className="text-[10px] font-semibold px-2 py-0.5 rounded"
            style={{ backgroundColor: CHIP_BG[sem], color: COLORES_SEMAFORO[sem] }}
          >
            {estado.replace(/_/g, ' ')}
          </span>
          {esContenedor && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-500">calculado</span>
          )}
          {data.prioridad && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-500">{data.prioridad}</span>
          )}
        </div>
        <p className="text-base font-bold text-gray-900 leading-snug truncate" title={data.nombre}>{data.nombre}</p>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pt-3">
        {/* Avance destacado */}
        <div className="px-1 pb-1">
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-2xl font-bold tabular-nums" style={{ color: COLORES_SEMAFORO[sem] }}>
              {Math.round(avance)}%
            </span>
            <span className="text-[11px] text-gray-400">
              {esContenedor
                ? (hijos.length > 0 ? `${completadosHijos} de ${hijos.length} completadas` : 'Se recalcula solo')
                : 'Trabajo directo'}
            </span>
          </div>
        </div>

        {/* Origen del avance: calculado o editable */}
        {esContenedor ? (
          <BloqueCalculado
            tipo={tipo}
            estado={estado}
            avance={avance}
            fechaInicio={data.fecha_inicio}
            mostrarFechaInicio={tipo === 'etapa'}
            sem={sem}
          />
        ) : (
          <BloqueEditable
            ref={avanceRef}
            tipo={tipo}
            nodo={data}
            avanceEfectivo={avance}
            soloLectura={permisos.esSoloLectura}
            onCambiado={onActualizado}
          />
        )}

        {/* Acciones completas, en dos grupos — sin acordeón */}
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
          onRegistrarAvanceClick={esContenedor ? undefined : irARegistrarAvance}
        />

        {/* Crear hijo — autonombrado, desaparece en nivel hoja */}
        {!permisos.esSoloLectura && permisos.puedeCrearAccion && nivel.hijoTipo && (
          <div className="mt-1.5 border border-dashed border-gray-200 rounded-lg px-2.5 py-1">
            <CrearInline tipo={nivel.hijoTipo} padreId={id} proyectoId={proyectoId} onCreado={onActualizado} />
          </div>
        )}

        <div className="pt-3 pb-3">
          <PropiedadesElemento
            nodo={nodo}
            permisos={permisos}
            onActualizado={onActualizado}
            mostrarToast={mostrarToast}
          />
        </div>
      </div>
    </div>
  );
}
