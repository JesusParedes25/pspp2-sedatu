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

function NodoRama({ nodo, profundidad, renderItem }) {
  const info = NIVELES[nodo.tipo];
  const Icono = info.icono;
  return (
    <div>
      <div className="flex items-center gap-1.5 py-1" style={{ paddingLeft: `${profundidad * 14}px` }}>
        <Icono size={11} style={{ color: info.color }} className="flex-shrink-0" aria-hidden="true" />
        <span className="text-[11px] font-semibold text-gray-600 truncate">{nodo.nombre}</span>
      </div>
      {nodo.items.map(item => (
        <div key={item.id} style={{ paddingLeft: `${(profundidad + 1) * 14}px` }}>
          {renderItem(item)}
        </div>
      ))}
      {nodo.hijos.map(hijo => (
        <NodoRama key={`${hijo.tipo}:${hijo.nombre}`} nodo={hijo} profundidad={profundidad + 1} renderItem={renderItem} />
      ))}
    </div>
  );
}

function GrupoProyecto({ nombre, dgSiglas, items, getProyectoId: _omit, renderItem, abiertoInicial }) {
  const [abierto, setAbierto] = useState(abiertoInicial);
  const { raiz, sueltos } = construirArbol(items);

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
            <NodoRama key={`${nodo.tipo}:${nodo.nombre}`} nodo={nodo} profundidad={0} renderItem={renderItem} />
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
  vacio = 'Nada que mostrar.',
  className = 'space-y-1',
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
        <GrupoProyecto key={g.id} nombre={g.nombre} dgSiglas={g.dgSiglas} items={g.items} renderItem={renderItem} abiertoInicial={grupos.length <= 3} />
      ))}
    </div>
  );
}
