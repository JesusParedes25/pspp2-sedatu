/**
 * ARCHIVO: ListaEstatusCualitativo.jsx
 * PROPÓSITO: Mostrar los estatus cualitativos —la nota corta de texto
 *            libre por etapa/acción/tarea, migración 047— en Tablero,
 *            Resumen de cartera y Panorama del proyecto.
 *
 * MINI-CLASE: el dato cualitativo junto al cuantitativo
 * ─────────────────────────────────────────────────────────────────
 * El avance dice "17%"; el estatus cualitativo dice por qué. Vivía
 * escondido: en el Tablero solo aparecía si el usuario pasaba el mouse
 * por la tarjeta correcta, y en el Panorama solo como nota suelta
 * dentro de las listas de acciones vencidas. En la práctica, alguien
 * se tomaba el trabajo de escribirlo y casi nadie lo leía. Además,
 * hasta hace poco solo se leía a nivel etapa aunque el modal lo captura
 * en los tres niveles — cada item trae `tipo_nodo` para distinguirlos.
 *
 * `dentroDeProyecto` decide si se escribe el nombre del proyecto: en
 * el Panorama ya se sabe cuál es y repetirlo en cada línea es ruido;
 * en Tablero y Cartera es justo lo que ubica la nota — por eso, cuando es
 * false, además se agrupa por proyecto y se arma un árbol real de
 * Etapa › Acción › Tarea (ArbolPorProyecto, mismo lenguaje visual que el
 * árbol izquierdo de Seguimiento › Detalle) en vez de un breadcrumb de
 * texto — con varios proyectos mezclados hacía falta algo más visual
 * para ubicar rápido de cuál se está hablando y en qué nivel.
 * ─────────────────────────────────────────────────────────────────
 */
import { Link } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import { breadcrumbInternoEstatusCualitativo } from '../../utils/estatusCualitativo';
import ArbolPorProyecto from '../common/ArbolPorProyecto';

function fechaCorta(valor) {
  if (!valor) return null;
  try {
    return new Date(valor).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
  } catch { return null; }
}

export default function ListaEstatusCualitativo({
  items = [],
  dentroDeProyecto = false,
  vacio = 'Nada tiene un estatus cualitativo capturado todavía.',
  maxAltura = 'max-h-80',
}) {
  if (items.length === 0) {
    return <p className="text-xs text-gray-400 italic">{vacio}</p>;
  }

  // Dentro del Panorama de un proyecto ya se sabe cuál es — lista plana,
  // solo el breadcrumb interno de texto (Etapa › Acción › Tarea).
  if (dentroDeProyecto) {
    return (
      <div className={`space-y-2.5 ${maxAltura} overflow-y-auto`}>
        {items.map(e => {
          const fecha = fechaCorta(e.estatus_cualitativo_fecha);
          return (
            <Link
              key={e.id}
              to={`/proyectos/${e.id_proyecto}?tab=seguimiento&nodo=${e.id}`}
              className="block p-2.5 rounded-lg hover:bg-teal-50 border border-transparent hover:border-teal-100 transition"
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[11px] text-gray-500 min-w-0 truncate">{breadcrumbInternoEstatusCualitativo(e)}</p>
                {fecha && <span className="text-[10px] text-gray-400 flex-shrink-0">{fecha}</span>}
              </div>
              <p className="text-xs text-gray-800 italic mt-0.5">"{e.estatus_cualitativo}"</p>
            </Link>
          );
        })}
      </div>
    );
  }

  // Varios proyectos mezclados (Tablero, Resumen de cartera): agrupado por
  // proyecto, con un árbol de jerarquía en vez de un breadcrumb de texto.
  return (
    <div className={`${maxAltura} overflow-y-auto pr-1`}>
      <ArbolPorProyecto
        items={items}
        getProyectoId={e => e.id_proyecto}
        vacio={vacio}
        renderItem={e => {
          const fecha = fechaCorta(e.estatus_cualitativo_fecha);
          return (
            <Link
              key={e.id}
              to={`/proyectos/${e.id_proyecto}?tab=seguimiento&nodo=${e.id}`}
              className="block py-1 px-1.5 -ml-1.5 rounded hover:bg-teal-50 transition"
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-xs text-gray-800 italic">"{e.estatus_cualitativo}"</p>
                {fecha && <span className="text-[10px] text-gray-400 flex-shrink-0">{fecha}</span>}
              </div>
            </Link>
          );
        }}
      />
    </div>
  );
}

// Encabezado con el mismo ícono y color en las tres vistas, para que se
// reconozca como la misma sección al cambiar de pantalla.
export function TituloEstatusCualitativo({ children = 'Estatus cualitativo' }) {
  return (
    <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5 text-guinda-700">
      <MessageSquare size={14} className="text-teal-600" /> {children}
    </h2>
  );
}
