/**
 * ARCHIVO: SelectorNodoArbol.jsx
 * PROPÓSITO: Elegir UN nodo (etapa/acción/subacción/tarea) de un
 *            proyecto para vincularlo a un indicador — reemplaza los 3
 *            `<select>` encadenados que tenía ModalVincularIndicador,
 *            sin buscador ni vista de conjunto.
 *
 * Deliberadamente NO reusa NodoArbol.jsx (el árbol de Seguimiento):
 * ese componente trae semáforo, edición rápida de avance y creación
 * inline de nodos — affordances de EDITAR que no tienen sentido en un
 * flujo que solo necesita SELECCIONAR. Se construye aparte, liviano,
 * reusando solo el patrón visual (fila indentada, expandir/colapsar) y
 * el mismo `arbol` que el modal ya cargaba (sin pedir nada nuevo al
 * backend).
 */
import { useState, useMemo, useEffect } from 'react';
import { ChevronRight, ChevronDown, Search } from 'lucide-react';

function normalizar(txt) {
  return (txt || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Etiqueta de nodo bloqueado — mismo criterio en toda la fila, para no
// repetir la lógica de "por qué no se puede elegir" en cada nivel.
function etiquetaBloqueo(tipo, id, puedeEditar, yaVinculado) {
  if (!puedeEditar(tipo, id)) return 'sin permiso';
  if (yaVinculado(tipo, id)) return 'ya vinculado';
  return null;
}

function Fila({ nodo, tipo, nivel, seleccionado, expandidos, onToggle, onSeleccionar, puedeEditar, yaVinculado, hijos }) {
  const tieneHijos = hijos.length > 0;
  const abierto = expandidos.has(nodo.id);
  const esSeleccionado = seleccionado?.tipo === tipo && seleccionado?.id === nodo.id;
  const bloqueo = etiquetaBloqueo(tipo, nodo.id, puedeEditar, yaVinculado);

  return (
    <div>
      <div
        className={`flex items-center gap-1 pr-2 rounded transition-colors ${
          esSeleccionado ? 'bg-guinda-50 text-guinda-700' : 'hover:bg-gray-50'
        }`}
        style={{ paddingLeft: `${nivel * 16 + 4}px` }}
      >
        <button
          type="button"
          onClick={() => tieneHijos && onToggle(nodo.id)}
          className="w-4 h-4 flex items-center justify-center flex-shrink-0"
        >
          {tieneHijos ? (
            abierto ? <ChevronDown size={12} className="text-gray-400" /> : <ChevronRight size={12} className="text-gray-400" />
          ) : <span className="w-3" />}
        </button>
        <button
          type="button"
          disabled={!!bloqueo}
          onClick={() => !bloqueo && onSeleccionar(tipo, nodo.id)}
          className="flex-1 text-left truncate py-1.5 min-w-0 disabled:cursor-not-allowed disabled:opacity-50"
          title={nodo.nombre}
        >
          <span className={`text-xs truncate block ${esSeleccionado ? 'font-semibold' : 'text-gray-700'}`}>
            {nodo.nombre}
            {bloqueo && <span className="text-gray-400 font-normal"> ({bloqueo})</span>}
          </span>
        </button>
      </div>
      {abierto && hijos.map(({ nodo: hijo, tipo: tipoHijo, hijos: nietos }) => (
        <Fila
          key={hijo.id}
          nodo={hijo}
          tipo={tipoHijo}
          nivel={nivel + 1}
          seleccionado={seleccionado}
          expandidos={expandidos}
          onToggle={onToggle}
          onSeleccionar={onSeleccionar}
          puedeEditar={puedeEditar}
          yaVinculado={yaVinculado}
          hijos={nietos}
        />
      ))}
    </div>
  );
}

// Arma, para una etapa, la lista de hijos con su tipo y sus propios
// hijos — acciones de primer nivel (sin id_accion_padre), y de cada
// una sus subacciones + tareas (mismo criterio que ya usaba el modal
// con los 3 selects, sin profundizar más allá de ese nivel).
function hijosDeEtapa(etapa) {
  const acciones = (etapa.acciones || []).filter(a => !a.id_accion_padre);
  return acciones.map(accion => ({
    nodo: accion,
    tipo: 'accion',
    hijos: [
      ...(accion.subacciones || []).map(s => ({ nodo: s, tipo: 'accion', hijos: [] })),
      ...(accion.tareas || []).map(t => ({ nodo: t, tipo: 'tarea', hijos: [] })),
    ],
  }));
}

// Filtra en cada nivel, no solo decide si mostrar la raíz — antes
// `coincideArbol` solo respondía sí/no para la etapa completa, así que
// una vez que una etapa "pasaba" (porque algún descendiente coincidía)
// se mostraban TODOS sus hijos, coincidieran o no. Esto arma un árbol
// nuevo con `hijos` ya filtrados en cada nivel: un nodo sobrevive si
// su propio nombre coincide, o si le queda al menos un hijo tras
// filtrar recursivamente.
function filtrarRama(rama, q) {
  if (!q) return rama;
  const hijosFiltrados = rama.hijos.map(h => filtrarRama(h, q)).filter(Boolean);
  const propioCoincide = normalizar(rama.nodo.nombre).includes(q);
  if (!propioCoincide && hijosFiltrados.length === 0) return null;
  return { ...rama, hijos: hijosFiltrados };
}

export default function SelectorNodoArbol({ etapas, valor, onSeleccionar, puedeEditar, yaVinculado }) {
  const [busqueda, setBusqueda] = useState('');
  const [expandidos, setExpandidos] = useState(new Set());
  const q = normalizar(busqueda);

  function toggle(id) {
    setExpandidos(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const ramas = useMemo(() => etapas.map(etapa => ({
    nodo: etapa,
    tipo: 'etapa',
    hijos: hijosDeEtapa(etapa),
  })).map(r => filtrarRama(r, q)).filter(Boolean), [etapas, q]);

  // Con texto de búsqueda, expandir automáticamente el camino hasta
  // cada coincidencia — si no, el usuario tendría que adivinar dónde
  // abrir para encontrar lo que ya escribió.
  useEffect(() => {
    if (!q) return;
    setExpandidos(prev => {
      const next = new Set(prev);
      function marcar(rama) {
        if (rama.hijos.length > 0) next.add(rama.nodo.id);
        rama.hijos.forEach(marcar);
      }
      ramas.forEach(marcar);
      return next;
    });
  }, [q, ramas]);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-gray-100 bg-gray-50">
        <Search size={12} className="text-gray-400 flex-shrink-0" />
        <input
          type="text"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar etapa, acción o tarea…"
          className="w-full text-xs bg-transparent outline-none placeholder:text-gray-400"
        />
      </div>
      <div className="max-h-56 overflow-y-auto py-1">
        <button
          type="button"
          onClick={() => onSeleccionar(null, null)}
          className={`w-full text-left px-2 py-1.5 text-xs transition-colors ${
            !valor ? 'bg-guinda-50 text-guinda-700 font-semibold' : 'text-gray-500 hover:bg-gray-50'
          }`}
        >
          — a nivel de todo el proyecto —
        </button>
        {ramas.map(({ nodo, tipo, hijos }) => (
          <Fila
            key={nodo.id}
            nodo={nodo}
            tipo={tipo}
            nivel={0}
            seleccionado={valor}
            expandidos={expandidos}
            onToggle={toggle}
            onSeleccionar={onSeleccionar}
            puedeEditar={puedeEditar}
            yaVinculado={yaVinculado}
            hijos={hijos}
          />
        ))}
        {ramas.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-3">Sin resultados para "{busqueda}"</p>
        )}
      </div>
    </div>
  );
}
