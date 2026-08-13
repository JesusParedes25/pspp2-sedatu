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
  const pct = tieneMeta ? Math.min(100, (valor / meta) * 100) : null;
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
            style={{ width: `${pct}%`, backgroundColor: GUINDA }}
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
