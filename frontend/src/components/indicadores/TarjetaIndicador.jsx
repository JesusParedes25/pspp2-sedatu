/**
 * ARCHIVO: TarjetaIndicador.jsx
 * PROPÓSITO: Cómo se ve UN indicador en cualquier vista de consulta
 *            (Tablero, Resumen de cartera y Panorama del proyecto).
 *
 * MINI-CLASE: el número antes que el porcentaje
 * ─────────────────────────────────────────────────────────────────
 * Antes, un indicador con meta mostraba solo "19%". Ese dato no
 * responde la pregunta que la gente hace de verdad: ¿19% de cuánto?
 * Un 19% de 64 fases y un 19% de 3 dictámenes exigen decisiones muy
 * distintas. Aquí el valor y la meta se muestran siempre, en grande
 * ("12 de 64 fases"), y el porcentaje acompaña como lectura rápida.
 *
 * Las tres vistas usaban tres copias distintas de esta tarjeta, que
 * ya habían divergido entre sí. Al unificarlas, un cambio de criterio
 * se hace una vez. `variante` ajusta la densidad — no el contenido —
 * porque en el Tablero conviven con otras tarjetas más chicas.
 * ─────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

const GUINDA = '#7B1C3E';

// Los agrupadores mostraban el valor crudo de la columna ("Avance_fisico",
// "Gestion"). Se traducen aquí, en el mismo módulo que la tarjeta, para
// que las tres vistas los escriban igual.
export const ETIQUETA_TIPO_INDICADOR = {
  Avance_fisico: 'Avance físico',
  Avance_financiero: 'Avance financiero',
  Cobertura: 'Cobertura',
  Beneficiarios: 'Beneficiarios',
  Gestion: 'Gestión',
  Otro: 'Otro',
};

// Cómo se llama la unidad al escribirla junto al número.
export function unidadDe(ind) {
  if (ind.unidad === 'Porcentaje') return '%';
  if (ind.unidad === 'Moneda_MXN') return 'MXN';
  return ind.etiqueta_unidad || ind.unidad_personalizada || '';
}

// Números grandes legibles de un vistazo: 1.2M en vez de 1,200,000.
// Debajo de 10 000 se muestra completo, que es el rango donde el dato
// exacto importa (dictámenes, acuerdos, zonas metropolitanas).
export function formatoCorto(n) {
  if (n == null || isNaN(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(1).replace(/\.0$/, '')}MMM`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (abs >= 1e4) return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}k`;
  return n.toLocaleString('es-MX', { maximumFractionDigits: 2 });
}

export default function TarjetaIndicador({ indicador, contexto = null, variante = 'normal', children }) {
  const meta = parseFloat(indicador.meta_global) || 0;
  const valor = parseFloat(indicador.valor_actual) || 0;
  const tieneMeta = meta > 0;
  // El % que se muestra en texto es el real, sin tope (un indicador
  // sobre-cumplido dice "142% de la meta" — información útil, no un error
  // a esconder). Solo la barra visual se topa en 100%, para no desbordar
  // su contenedor.
  const pct = tieneMeta ? (valor / meta) * 100 : null;
  const pctBarra = pct !== null ? Math.min(100, pct) : null;
  const unidad = unidadDe(indicador);
  const compacto = variante === 'compacto';

  return (
    <div className={`rounded-lg border border-gray-200 bg-white ${compacto ? 'p-2.5' : 'p-3'} hover:border-gray-300 transition-colors`}>
      {/* Encabezado: qué se mide y dónde */}
      <div className="min-w-0">
        <p className={`${compacto ? 'text-xs' : 'text-sm'} font-medium text-gray-800 leading-snug break-words`}>
          {indicador.nombre}
        </p>
        {contexto && (
          <p className="text-[10px] text-gray-500 leading-snug break-words mt-0.5">{contexto}</p>
        )}
      </div>

      {/* La cifra. Es lo que se lee primero, por eso va en grande y con
          tabular-nums (los dígitos alinean y no "bailan" al actualizar). */}
      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <span
            className={`${compacto ? 'text-lg' : 'text-2xl'} font-bold tabular-nums leading-none`}
            style={{ color: GUINDA }}
            title={valor.toLocaleString('es-MX')}
          >
            {formatoCorto(valor)}
          </span>
          {tieneMeta ? (
            <span className={`${compacto ? 'text-[10px]' : 'text-xs'} text-gray-500 ml-1.5`}>
              de {formatoCorto(meta)}{unidad ? ` ${unidad}` : ''}
            </span>
          ) : (
            unidad && (
              <span className={`${compacto ? 'text-[10px]' : 'text-xs'} text-gray-500 ml-1.5`}>{unidad}</span>
            )
          )}
        </div>

        {tieneMeta && (
          <span
            className={`${compacto ? 'text-xs' : 'text-sm'} font-semibold tabular-nums flex-shrink-0 px-1.5 py-0.5 rounded`}
            style={{ color: GUINDA, backgroundColor: 'rgba(123,28,62,0.07)' }}
          >
            {pct.toFixed(0)}%
          </span>
        )}
      </div>

      {tieneMeta ? (
        <div className={`${compacto ? 'mt-1.5 h-1.5' : 'mt-2 h-2'} bg-gray-100 rounded-full overflow-hidden`}>
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pctBarra}%`, backgroundColor: GUINDA }}
          />
        </div>
      ) : (
        // Sin meta no se dibuja una barra vacía: no hay nada que medir
        // contra qué, y una barra al 0% se lee como "no ha avanzado".
        <p className="mt-1.5 text-[10px] text-gray-400">Sin meta definida</p>
      )}

      {children}
    </div>
  );
}

// ─── Agrupar por indicador del catálogo ─────────────────────────
// Dos proyectos que eligen el mismo indicador del catálogo (mismo
// id_catalogo) miden lo mismo — mostrarlos como dos tarjetas sueltas
// obliga a sumarlas a mano. `agruparPorCatalogo` junta las filas que
// comparten id_catalogo; las que no están ligadas al catálogo (o son la
// única en su grupo) se quedan como venían, una tarjeta por fila.
export function agruparPorCatalogo(indicadores) {
  const grupos = {};
  const orden = [];
  for (const ind of indicadores) {
    const clave = ind.id_catalogo || `solo-${ind.id}`;
    if (!grupos[clave]) { grupos[clave] = []; orden.push(clave); }
    grupos[clave].push(ind);
  }
  return orden.map(clave => grupos[clave]);
}

// Tarjeta combinada para un grupo de 2+ proyectos sobre el mismo
// indicador del catálogo. Sumar tiene sentido para conteos y montos
// (10 solicitudes + 5 solicitudes = 15); para porcentajes no (40% + 60%
// no son "100%" de nada real), así que ahí se omite el número combinado
// y solo se ofrece el desglose por proyecto.
function TarjetaIndicadorGrupo({ grupo, variante = 'normal' }) {
  const [abierto, setAbierto] = useState(false);
  const compacto = variante === 'compacto';
  const esPorcentaje = grupo[0].unidad === 'Porcentaje';
  const unidad = unidadDe(grupo[0]);
  const totalValor = grupo.reduce((s, i) => s + (parseFloat(i.valor_actual) || 0), 0);
  const totalMeta = grupo.reduce((s, i) => s + (parseFloat(i.meta_global) || 0), 0);
  const tieneMeta = !esPorcentaje && totalMeta > 0;
  // Mismo criterio que TarjetaIndicador: texto sin tope, barra topada.
  const pct = tieneMeta ? (totalValor / totalMeta) * 100 : null;
  const pctBarra = pct !== null ? Math.min(100, pct) : null;

  return (
    <div className={`rounded-lg border border-gray-200 bg-white ${compacto ? 'p-2.5' : 'p-3'} hover:border-gray-300 transition-colors`}>
      <div className="flex items-start justify-between gap-2">
        <p className={`${compacto ? 'text-xs' : 'text-sm'} font-medium text-gray-800 leading-snug break-words min-w-0`}>
          {grupo[0].nombre}
        </p>
        <span className="shrink-0 text-[10px] font-medium text-guinda-700 bg-guinda-50 border border-guinda-100 px-1.5 py-0.5 rounded-full">
          {grupo.length} proyectos
        </span>
      </div>

      {esPorcentaje ? (
        <p className={`${compacto ? 'mt-1.5' : 'mt-2'} text-[11px] text-gray-500`}>
          Es un porcentaje — se mide por proyecto, no se combina en un solo dato.
        </p>
      ) : (
        <>
          <div className="mt-2 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <span
                className={`${compacto ? 'text-lg' : 'text-2xl'} font-bold tabular-nums leading-none`}
                style={{ color: GUINDA }}
                title={totalValor.toLocaleString('es-MX')}
              >
                {formatoCorto(totalValor)}
              </span>
              {tieneMeta ? (
                <span className={`${compacto ? 'text-[10px]' : 'text-xs'} text-gray-500 ml-1.5`}>
                  de {formatoCorto(totalMeta)}{unidad ? ` ${unidad}` : ''}
                </span>
              ) : (
                unidad && <span className={`${compacto ? 'text-[10px]' : 'text-xs'} text-gray-500 ml-1.5`}>{unidad}</span>
              )}
            </div>
            {tieneMeta && (
              <span
                className={`${compacto ? 'text-xs' : 'text-sm'} font-semibold tabular-nums flex-shrink-0 px-1.5 py-0.5 rounded`}
                style={{ color: GUINDA, backgroundColor: 'rgba(123,28,62,0.07)' }}
              >
                {pct.toFixed(0)}%
              </span>
            )}
          </div>
          {tieneMeta && (
            <div className={`${compacto ? 'mt-1.5 h-1.5' : 'mt-2 h-2'} bg-gray-100 rounded-full overflow-hidden`}>
              <div className="h-full rounded-full transition-all" style={{ width: `${pctBarra}%`, backgroundColor: GUINDA }} />
            </div>
          )}
        </>
      )}

      <button
        type="button"
        onClick={() => setAbierto(v => !v)}
        className="mt-2 flex items-center gap-1 text-[10px] font-medium text-gray-500 hover:text-guinda-600"
      >
        {abierto ? <ChevronUp size={11} /> : <ChevronDown size={11} />} Ver por proyecto
      </button>
      {abierto && (
        <div className="mt-1.5 pt-1.5 border-t border-gray-100 space-y-1">
          {grupo.map(ind => {
            const v = parseFloat(ind.valor_actual) || 0;
            const m = parseFloat(ind.meta_global) || 0;
            return (
              <div key={ind.id} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="text-gray-600 truncate">{[ind.proyecto_nombre, ind.dg_siglas].filter(Boolean).join(' · ')}</span>
                <span className="text-gray-500 tabular-nums flex-shrink-0">
                  {formatoCorto(v)}{m > 0 ? ` / ${formatoCorto(m)}` : ''}{unidad ? ` ${unidad}` : ''}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Envoltorio que decide, fila por fila, si hay que pintar la tarjeta
// normal (un solo proyecto) o la agrupada (2+ proyectos con el mismo
// id_catalogo) — lo que antes hacía cada vista (Tablero, Resumen de
// cartera) mapeando TarjetaIndicador directamente.
export function TarjetaIndicadorOAgrupada({ grupo, variante = 'normal' }) {
  if (grupo.length === 1) {
    const ind = grupo[0];
    return (
      <TarjetaIndicador
        indicador={ind}
        variante={variante}
        contexto={[ind.proyecto_nombre, ind.dg_siglas].filter(Boolean).join(' · ')}
      />
    );
  }
  return <TarjetaIndicadorGrupo grupo={grupo} variante={variante} />;
}
