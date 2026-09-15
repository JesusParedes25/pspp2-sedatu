/**
 * ARCHIVO: ArbolPorProyecto.jsx
 * PROPÓSITO: Lista de items (vencidas, riesgos, actividad, estatus
 *            cualitativo) agrupada por proyecto —colapsable, un proyecto
 *            a la vez— y dentro de cada proyecto, un árbol real de
 *            Etapa › Acción › Tarea (mismo lenguaje visual que el árbol
 *            izquierdo de Seguimiento › Detalle: ícono y color por NIVEL,
 *            indentado por profundidad) en vez de un breadcrumb de texto
 *            plano. Reemplaza a AgrupadoPorProyecto + NodoBreadcrumb.
 *
 * items debe traer proyecto_nombre y, opcionalmente, dg_siglas, más los
 * campos de ruta que ya devuelven inicio.queries.js/carteras.queries.js:
 * etapa_nombre, accion_padre_nombre, accion_nombre, tarea_nombre.
 */
import { useState } from 'react';
import { ChevronRight, ChevronDown, FolderKanban } from 'lucide-react';
import { NIVELES } from '../../config/niveles';
import { construirArbol } from '../../utils/arbolPorNodo';

// conGuias (solo variante 'destacado'): en vez de indentar cada nivel a
// puro padding-left (el de siempre, sin nada que conecte visualmente un
// nivel con el siguiente), cada nodo envuelve a SUS hijos en su propia
// caja con borde izquierdo — el mismo patrón que ya usa GrupoProyecto
// para "esto pertenece a este proyecto", aplicado ahora también dentro
// del árbol para "esto pertenece a esta etapa/acción". Anidar cajas así
// genera solo la línea del padre más cercano en el true visual — no hace
// falta acarrear profundidad para calcular un padding.
function NodoRama({ nodo, profundidad, renderItem, renderPropio, conGuias }) {
  const info = NIVELES[nodo.tipo];
  const Icono = info.icono;

  const hijos = (
    <>
      {/* nodo.propio: el item ES este tramo de ruta (p. ej. una etapa que
          también aparece como item de su propia lista) — se renderiza
          pegado a su encabezado, con renderPropio si se dio uno (para
          distinguirlo visualmente de sus hijos reales), nunca como fila
          suelta aparte. */}
      {nodo.propio && (
        <div style={conGuias ? undefined : { paddingLeft: `${profundidad * 14}px` }}>
          {(renderPropio || renderItem)(nodo.propio)}
        </div>
      )}
      {nodo.items.map(item => (
        <div key={item.id} style={conGuias ? undefined : { paddingLeft: `${(profundidad + 1) * 14}px` }}>
          {renderItem(item)}
        </div>
      ))}
      {nodo.hijos.map(hijo => (
        <NodoRama key={`${hijo.tipo}:${hijo.nombre}`} nodo={hijo} profundidad={profundidad + 1} renderItem={renderItem} renderPropio={renderPropio} conGuias={conGuias} />
      ))}
    </>
  );

  if (conGuias) {
    return (
      <div>
        <div className="flex items-center gap-1.5 py-1">
          <Icono size={11} style={{ color: info.color }} className="flex-shrink-0" aria-hidden="true" />
          <span className="text-[11px] font-semibold text-gray-600 truncate">{nodo.nombre}</span>
        </div>
        <div className="ml-[5px] pl-3 border-l-2 border-gray-200">{hijos}</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-1.5 py-1" style={{ paddingLeft: `${profundidad * 14}px` }}>
        <Icono size={11} style={{ color: info.color }} className="flex-shrink-0" aria-hidden="true" />
        <span className="text-[11px] font-semibold text-gray-600 truncate">{nodo.nombre}</span>
      </div>
      {hijos}
    </div>
  );
}

// "compacto" (default, el de siempre): pensado para los widgets angostos
// de Tablero — texto chico, sin fondo. "destacado": para una página
// completa (Mis actividades) donde ese mismo encabezado chico se perdía
// entre las tarjetas de abajo y no se leía como algo clicable — una barra
// real con fondo, borde e ícono más grande, que cambia al pasar el mouse.
function GrupoProyecto({ nombre, dgSiglas, items, getProyectoId: _omit, renderItem, renderPropio, abiertoInicial, variante = 'compacto' }) {
  const [abierto, setAbierto] = useState(abiertoInicial);
  const { raiz, sueltos } = construirArbol(items);

  if (variante === 'destacado') {
    return (
      <div>
        <button
          type="button"
          onClick={() => setAbierto(a => !a)}
          className="flex items-center gap-2 w-full text-left px-3 py-2.5 rounded-lg bg-white border border-gray-200 hover:border-guinda-300 hover:bg-guinda-50/50 shadow-sm transition-colors group"
        >
          <span className="w-6 h-6 rounded-md bg-guinda-50 text-guinda-600 flex items-center justify-center flex-shrink-0 group-hover:bg-guinda-100">
            <FolderKanban size={13} />
          </span>
          <span className="text-sm font-bold text-gray-800 truncate flex-1">{nombre}</span>
          {dgSiglas && <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded flex-shrink-0">{dgSiglas}</span>}
          <span className="text-[11px] font-medium text-gray-400 flex-shrink-0">{items.length}</span>
          {abierto ? <ChevronDown size={16} className="text-gray-400 flex-shrink-0" /> : <ChevronRight size={16} className="text-gray-400 flex-shrink-0" />}
        </button>
        {abierto && (
          <div className="pl-3 border-l-2 border-gray-100 ml-4 mt-2">
            {sueltos.map(item => <div key={item.id}>{renderItem(item)}</div>)}
            {raiz.map(nodo => (
              <NodoRama key={`${nodo.tipo}:${nodo.nombre}`} nodo={nodo} profundidad={0} renderItem={renderItem} renderPropio={renderPropio} conGuias />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setAbierto(a => !a)}
        className="flex items-center gap-1.5 w-full text-left py-1 -ml-0.5 group"
      >
        {abierto ? <ChevronDown size={12} className="text-gray-400 flex-shrink-0" /> : <ChevronRight size={12} className="text-gray-400 flex-shrink-0" />}
        <FolderKanban size={11} className="text-guinda-400 flex-shrink-0" />
        <span className="text-[11px] font-bold text-guinda-700 truncate group-hover:underline">{nombre}</span>
        {dgSiglas && <span className="text-[9px] font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded flex-shrink-0">{dgSiglas}</span>}
      </button>
      {abierto && (
        <div className="pl-2.5 border-l-2 border-gray-100 ml-1">
          {sueltos.map(item => <div key={item.id}>{renderItem(item)}</div>)}
          {raiz.map(nodo => (
            <NodoRama key={`${nodo.tipo}:${nodo.nombre}`} nodo={nodo} profundidad={0} renderItem={renderItem} renderPropio={renderPropio} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ArbolPorProyecto({
  items = [],
  getProyectoId = item => item.proyecto_id ?? item.id_proyecto,
  renderItem,
  // Opcional: cómo renderizar el item que ES el propio nodo de un tramo de
  // ruta (ver construirArbol/nodo.propio) — p. ej. una etapa que además de
  // encabezar a sus acciones aparece ella misma en la lista. Sin esta prop
  // se usa renderItem igual que cualquier otro item (comportamiento previo,
  // sin cambios para quien no la pase).
  renderPropio,
  vacio = 'Nada que mostrar.',
  className = 'space-y-1',
  // 'compacto' (default): el de siempre, para los widgets de Tablero.
  // 'destacado': encabezado de proyecto con más peso visual — para
  // páginas completas donde el compacto se pierde entre las tarjetas.
  variante = 'compacto',
}) {
  if (items.length === 0) {
    return <p className="text-xs text-gray-400 italic">{vacio}</p>;
  }

  const grupos = [];
  const indice = new Map();
  for (const item of items) {
    const pid = getProyectoId(item);
    if (!indice.has(pid)) {
      indice.set(pid, grupos.length);
      grupos.push({ id: pid, nombre: item.proyecto_nombre || 'Proyecto', dgSiglas: item.dg_siglas, items: [] });
    }
    grupos[indice.get(pid)].items.push(item);
  }

  return (
    <div className={className}>
      {grupos.map(g => (
        <GrupoProyecto key={g.id} nombre={g.nombre} dgSiglas={g.dgSiglas} items={g.items} renderItem={renderItem} renderPropio={renderPropio} abiertoInicial={grupos.length <= 3} variante={variante} />
      ))}
    </div>
  );
}
