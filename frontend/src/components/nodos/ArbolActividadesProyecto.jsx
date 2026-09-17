/**
 * ARCHIVO: ArbolActividadesProyecto.jsx
 * PROPÓSITO: Lista de actividades (etapas/acciones/tareas) agrupadas por
 *            proyecto, con árbol real Etapa › Acción › Tarea (ArbolPorProyecto,
 *            variante 'destacado') y tarjetas accionables de verdad —
 *            Registrar avance, Reportar riesgo, Adjuntar documento... —
 *            en vez de una tarjeta de solo lectura.
 *
 * Es el MISMO componente para "Mis actividades > Pendientes" y para el
 * panel de un día en "Mis actividades > Agenda > Calendario": antes cada
 * uno tenía su propia presentación (una con árbol+tarjetas accionables,
 * la otra una lista plana de solo lectura sin agrupar por proyecto) para
 * la misma clase de dato (etapas/acciones/tareas con fecha) — reusar este
 * componente evita que las dos vistas seres lean como dos productos
 * distintos, y cualquier mejora futura (como la línea de jerarquía o el
 * caso de nodo contenedor) aplica a ambas por igual.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare, ChevronDown } from 'lucide-react';
import NodoCard from './NodoCard';
import FilaCompacta from './FilaCompacta';
import ActividadStream from './ActividadStream';
import ArbolPorProyecto from '../common/ArbolPorProyecto';
import { COLORES_SEMAFORO } from '../common/SemaforoDot';
import { formatFecha } from '../../utils/fecha';
import { NIVELES } from '../../config/niveles';

const PERMISOS_PROPIOS = { esSoloLectura: false, puedeInvitar: true, puedeCrearAccion: false };

const CLASE_GRID_DEFAULT = 'grid grid-cols-[repeat(auto-fit,minmax(380px,480px))] gap-x-6 gap-y-4 items-start';

// ─── Fila compacta de nodo contenedor (solo información, sin acción
// directa) ──────────────────────────────────────────────────────────
// Una etapa siempre es contenedor; una acción lo es cuando tiene
// subacciones o tareas propias (es_hoja=false) — en ambos casos su
// avance/estado se calculan de sus hijos, nunca se registran a mano.
// Mostrarla con las mismas afordancias que una tarjeta accionable
// (checkbox, "Registrar avance") insinuaba algo que no se puede hacer.
// Aquí es solo lectura: ícono+color del nivel (mismo criterio que el
// resto del árbol) + semáforo + fecha + responsable, con un enlace para
// ir a verla/gestionarla en el proyecto.
function FilaNodoResumen({ it }) {
  const info = NIVELES[it.tipo];
  const Icono = info.icono;
  const fecha = it.fecha_limite || it.fecha_fin;
  return (
    <div className="flex items-center gap-2 py-1 text-[11px] text-gray-500">
      <Icono size={11} className="flex-shrink-0" style={{ color: info.color }} />
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORES_SEMAFORO[it.semaforo_efectivo || it.semaforo || 'gris'] }} />
      {fecha && <span className="flex-shrink-0">Vence {formatFecha(fecha)}</span>}
      {it.responsable_nombre && <span className="truncate">· {it.responsable_nombre}</span>}
      <Link
        to={`/proyectos/${it.proyecto_id}?tab=seguimiento&nodo=${it.id}`}
        className="ml-auto flex-shrink-0 text-guinda-600 hover:underline font-medium"
      >
        Ver {info.label.toLowerCase()}
      </Link>
    </div>
  );
}

export default function ArbolActividadesProyecto({ items, onCambiado, vacio = 'Nada que mostrar.', className, densidad = 'completa' }) {
  // Tarjetas expandidas ahora mismo (NodoCard avisa vía onToggleAbierto) —
  // solo mientras una tarjeta está abierta se ofrece el acceso a su
  // Actividad (Comentarios/Evidencia/Riesgos), para no abultar la lista
  // colapsada con un enlace que nadie pidió ver todavía.
  const [abiertos, setAbiertos] = useState(() => new Set());
  // Para cuáles tarjetas abiertas, además, se pidió ver su Actividad —
  // independiente de "abiertos": abrir la tarjeta no carga el feed solo,
  // hay que pedirlo explícitamente (mismo criterio que la pestaña
  // "Actividad" del drawer de Diagrama).
  const [actividadAbierta, setActividadAbierta] = useState(() => new Set());
  // En modo 'compacta', cada item arranca como FilaCompacta (una línea) y
  // pasa a NodoCard completa solo cuando se pide expandirla — para listas
  // largas (p. ej. "Vencidas" con 200+) donde una tarjeta completa por
  // item de entrada es demasiado peso visual. 'completa' (default) no
  // cambia nada para quien no pase este prop.
  const [expandidos, setExpandidos] = useState(() => new Set());

  function marcarAbierto(key, abierto) {
    setAbiertos(prev => {
      const next = new Set(prev);
      abierto ? next.add(key) : next.delete(key);
      return next;
    });
    // Al cerrar la tarjeta, también se oculta su Actividad — evita que
    // quede "recordada" abierta y reaparezca ya cargada si se vuelve a
    // expandir mucho después, con datos que pudieron cambiar.
    if (!abierto) setActividadAbierta(prev => { if (!prev.has(key)) return prev; const next = new Set(prev); next.delete(key); return next; });
  }

  function toggleActividad(key) {
    setActividadAbierta(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  return (
    <ArbolPorProyecto
      items={items}
      vacio={vacio}
      className={className || CLASE_GRID_DEFAULT}
      variante="destacado"
      // Una etapa siempre es contenedor (su avance se calcula de sus
      // acciones) y una acción lo es cuando tiene subacciones o tareas
      // propias (es_hoja=false) — en ambos casos, mostrarla como si fuera
      // una tarjeta accionable más (checkbox, "Registrar avance"...)
      // insinúa algo que no se puede hacer. Se muestra como una fila
      // compacta de solo información, pegada al encabezado que ya la
      // nombra, no como una tarjeta duplicada aparte (ver es_hoja en
      // construirArbol).
      renderPropio={it => <FilaNodoResumen key={it.id} it={it} />}
      renderItem={it => {
        const key = `${it.tipo}-${it.id}`;
        const mostrarActividad = actividadAbierta.has(key);
        if (densidad === 'compacta' && !expandidos.has(key)) {
          return (
            <FilaCompacta
              key={key}
              it={it}
              onExpandir={() => setExpandidos(prev => new Set(prev).add(key))}
            />
          );
        }
        return (
          <div className="py-0.5">
            <NodoCard
              tipo={it.tipo}
              nodo={it}
              // Todo lo que llega aquí (no a renderPropio) ya es hoja
              // real: etapa nunca llega, y una acción con es_hoja=false
              // tampoco (ver construirArbol) — solo queda esContenedor=
              // false para lo que sí llega.
              esContenedor={false}
              proyectoId={it.proyecto_id}
              permisos={PERMISOS_PROPIOS}
              // El proyecto/etapa/acción ya se ve en los encabezados del
              // árbol que envuelve esta tarjeta — repetir la ruta
              // completa aquí era redundante. El enlace se conserva,
              // solo con texto corto.
              breadcrumb="Ver en proyecto"
              onProyectoClick={`/proyectos/${it.proyecto_id}?tab=seguimiento&nodo=${it.id}`}
              onCambiado={onCambiado}
              // Homologado con el rail de Seguimiento/Detalle y el
              // drawer de Diagrama (FichaNodo.jsx): Comentar/Evidencia/
              // Riesgos se sacan del grid de botones — se recuperan
              // abajo, bajo demanda, vía Actividad.
              agrupado
              onToggleAbierto={abierto => marcarAbierto(key, abierto)}
            />
            {abiertos.has(key) && (
              <div className="mt-1 ml-1">
                <button
                  onClick={() => toggleActividad(key)}
                  className="flex items-center gap-1.5 text-[11px] font-medium text-gray-400 hover:text-guinda-600 transition-colors"
                >
                  <MessageSquare size={12} />
                  Comentarios, evidencia y riesgos
                  <ChevronDown size={11} className={`transition-transform ${mostrarActividad ? 'rotate-180' : ''}`} />
                </button>
                {mostrarActividad && (
                  <div className="card p-3.5 mt-1.5">
                    <ActividadStream tipo={it.tipo} id={it.id} titulo={it.nombre} />
                  </div>
                )}
              </div>
            )}
          </div>
        );
      }}
    />
  );
}
