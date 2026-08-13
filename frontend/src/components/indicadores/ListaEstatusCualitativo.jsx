/**
 * ARCHIVO: ListaEstatusCualitativo.jsx
 * PROPÓSITO: Mostrar los estatus cualitativos —la nota corta de texto
 *            libre por etapa, migración 047— en Tablero, Resumen de
 *            cartera y Panorama del proyecto.
 *
 * MINI-CLASE: el dato cualitativo junto al cuantitativo
 * ─────────────────────────────────────────────────────────────────
 * El avance dice "17%"; el estatus cualitativo dice por qué. Vivía
 * escondido: en el Tablero solo aparecía si el usuario pasaba el mouse
 * por la tarjeta correcta, y en el Panorama solo como nota suelta
 * dentro de las listas de acciones vencidas. En la práctica, alguien
 * se tomaba el trabajo de escribirlo y casi nadie lo leía.
 *
 * `dentroDeProyecto` decide si se escribe el nombre del proyecto: en
 * el Panorama ya se sabe cuál es y repetirlo en cada línea es ruido;
 * en Tablero y Cartera es justo lo que ubica la nota.
 * ─────────────────────────────────────────────────────────────────
 */
import { Link } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';

function fechaCorta(valor) {
  if (!valor) return null;
  try {
    return new Date(valor).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
  } catch { return null; }
}

export default function ListaEstatusCualitativo({
  items = [],
  dentroDeProyecto = false,
  vacio = 'Ninguna etapa tiene un estatus cualitativo capturado todavía.',
  maxAltura = 'max-h-80',
}) {
  if (items.length === 0) {
    return <p className="text-xs text-gray-400 italic">{vacio}</p>;
  }

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
              <p className="text-[11px] text-gray-500 min-w-0 truncate">
                {dentroDeProyecto
                  ? e.etapa_nombre
                  : `${e.proyecto_nombre} › ${e.etapa_nombre}${e.dg_siglas ? ` · ${e.dg_siglas}` : ''}`}
              </p>
              {fecha && <span className="text-[10px] text-gray-400 flex-shrink-0">{fecha}</span>}
            </div>
            <p className="text-xs text-gray-800 italic mt-0.5">"{e.estatus_cualitativo}"</p>
          </Link>
        );
      })}
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
