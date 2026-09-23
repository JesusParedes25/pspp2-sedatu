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
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, X, Pencil } from 'lucide-react';
import { formatearMonedaCorta, etiquetaUnidadIndicador } from '../../utils/formatoMoneda';
import { TIPOS_INDICADOR } from '../../utils/tiposIndicador';
import ModalEditarValorIndicador from './ModalEditarValorIndicador';

const GUINDA = '#7B1C3E';

// Los agrupadores mostraban el valor crudo de la columna ("Avance_fisico",
// "Gestion"). Se traducen aquí, en el mismo módulo que la tarjeta, para
// que las tres vistas los escriban igual — derivado del único catálogo
// de tipos en vez de copiado aparte.
export const ETIQUETA_TIPO_INDICADOR = Object.fromEntries(TIPOS_INDICADOR.map(t => [t.valor, t.etiqueta]));

// Cómo se llama la unidad al escribirla junto al número. Reexportado
// desde el módulo compartido (antes vivía duplicado, con variaciones
// menores, en ~7 archivos distintos).
export const unidadDe = etiquetaUnidadIndicador;

// Números grandes legibles de un vistazo: 1.2M en vez de 1,200,000.
// Debajo de 10 000 se muestra completo, que es el rango donde el dato
// exacto importa (dictámenes, acuerdos, zonas metropolitanas). Para
// indicadores de moneda se usa formatearMonedaCorta en su lugar (signo
// $ real, no un sufijo "MXN" suelto igual que cualquier otra unidad).
export function formatoCorto(n) {
  if (n == null || isNaN(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(1).replace(/\.0$/, '')}MMM`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (abs >= 1e4) return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}k`;
  return n.toLocaleString('es-MX', { maximumFractionDigits: 2 });
}

export default function TarjetaIndicador({ indicador, contexto = null, variante = 'normal', children, permitirEditarValor = false, onValorActualizado, enlazable = false }) {
  const [editandoValor, setEditandoValor] = useState(false);
  const meta = parseFloat(indicador.meta_global) || 0;
  const valor = parseFloat(indicador.valor_actual) || 0;
  const tieneMeta = meta > 0;
  // El % que se muestra en texto es el real, sin tope (un indicador
  // sobre-cumplido dice "142% de la meta" — información útil, no un error
  // a esconder). Solo la barra visual se topa en 100%, para no desbordar
  // su contenedor.
  const pct = tieneMeta ? (valor / meta) * 100 : null;
  const pctBarra = pct !== null ? Math.min(100, pct) : null;
  const esMoneda = indicador.unidad === 'Moneda_MXN';
  const unidad = unidadDe(indicador);
  const compacto = variante === 'compacto';
  // Editar valor manual solo tiene sentido si el indicador de verdad se
  // captura a mano (modo_calculo='manual') — para los automáticos el
  // valor lo pone el propio recálculo, ofrecer editarlo confundiría más
  // de lo que ayuda (parecería que "sirve" y el próximo recálculo lo
  // pisa sin aviso). En tarjetas enlazable (solo "Mis indicadores") el
  // lápiz queda fuera: la tarjeta completa ya es un link al detalle,
  // que tiene el mismo editor — mostrar las dos formas de llegar ahí
  // era ruido. En Tablero/Cartera/Panorama (sin página a la que ir)
  // el lápiz sigue siendo la única forma de editar, sin cambios.
  const puedeEditar = permitirEditarValor && indicador.modo_calculo === 'manual' && !enlazable;

  // El botón "editar valor" y el modal que abre nunca deben disparar la
  // navegación del <Link> cuando la tarjeta es enlazable — el modal se
  // renderiza fuera del Link (como hermano), y el botón corta el evento
  // antes de que llegue a burbujear hasta el <a>.
  const contenido = (
    <>
      {/* Encabezado: qué se mide y dónde */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={`${compacto ? 'text-xs' : 'text-sm'} font-medium text-gray-800 leading-snug break-words`}>
            {indicador.nombre}
          </p>
          {contexto && (
            <p className="text-[10px] text-gray-500 leading-snug break-words mt-0.5">{contexto}</p>
          )}
        </div>
        {puedeEditar && (
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditandoValor(true); }}
            title="Registrar valor"
            className="flex-shrink-0 p-1 text-gray-300 hover:text-guinda-600 rounded hover:bg-gray-50"
          >
            <Pencil size={12} />
          </button>
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
            {esMoneda ? formatearMonedaCorta(valor) : formatoCorto(valor)}
          </span>
          {tieneMeta ? (
            <span className={`${compacto ? 'text-[10px]' : 'text-xs'} text-gray-500 ml-1.5`}>
              de {esMoneda ? formatearMonedaCorta(meta) : `${formatoCorto(meta)}${unidad ? ` ${unidad}` : ''}`}
            </span>
          ) : (
            !esMoneda && unidad && (
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
    </>
  );

  const clasesTarjeta = `rounded-lg border border-gray-200 bg-white ${compacto ? 'p-2.5' : 'p-3'} transition-colors`;
  // Con el lápiz fuera, el clic en la tarjeta es la única forma de
  // entrar a editar — el hover tiene que dejarlo claro por sí solo.
  // La paleta "guinda" solo define 50/100/200/500/600/700/800 (ver
  // tailwind.config.cjs) — "300" no genera ninguna clase real, se
  // queda mudo. guinda-200 es el tono claro más cercano al borde
  // gris-200 de base, así que el cambio sí se nota.
  const clasesEnlazable = 'hover:border-guinda-200 hover:shadow-sm cursor-pointer';
  const clasesNormal = 'hover:border-gray-300';

  return (
    <>
      {enlazable ? (
        <Link to={`/indicadores/${indicador.id}`} className={`block ${clasesTarjeta} ${clasesEnlazable}`}>{contenido}</Link>
      ) : (
        <div className={`${clasesTarjeta} ${clasesNormal}`}>{contenido}</div>
      )}

      {editandoValor && (
        <ModalEditarValorIndicador
          indicador={indicador}
          onCerrar={() => setEditandoValor(false)}
          onGuardado={() => { setEditandoValor(false); onValorActualizado?.(); }}
        />
      )}
    </>
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
//
// "Ver por proyecto" no es solo una lista pasiva: cada fila es clicable
// y aísla la tarjeta a ese proyecto (con un chip "Quitar filtro" para
// regresar al combinado) — antes no había forma de ver un solo proyecto
// dentro de un agregado sin salir de la pantalla.
function TarjetaIndicadorGrupo({ grupo, variante = 'normal', permitirEditarValor = false, onValorActualizado, enlazable = false }) {
  const [abierto, setAbierto] = useState(false);
  const [proyectoAisladoId, setProyectoAisladoId] = useState(null);
  const [editandoValor, setEditandoValor] = useState(false);
  const compacto = variante === 'compacto';
  const esPorcentaje = grupo[0].unidad === 'Porcentaje';
  const esMoneda = grupo[0].unidad === 'Moneda_MXN';
  const unidad = unidadDe(grupo[0]);

  const aislado = proyectoAisladoId ? grupo.find(i => i.proyecto_id === proyectoAisladoId) : null;
  // Editar solo tiene sentido aislado a UN proyecto (el combinado es una
  // suma, no algo que se pueda "escribir") y solo si ese proyecto de
  // verdad captura el valor a mano. En modo enlazable esto nunca se
  // alcanza de todos modos: ahí cada fila de "Ver por proyecto" navega
  // directo al detalle en vez de aislar (ver abajo), así que `aislado`
  // se queda siempre null — el `&& !enlazable` es defensivo/explícito,
  // no cambia comportamiento observable.
  const puedeEditar = permitirEditarValor && !!aislado && aislado.modo_calculo === 'manual' && !enlazable;

  const valorMostrado = aislado
    ? parseFloat(aislado.valor_actual) || 0
    : grupo.reduce((s, i) => s + (parseFloat(i.valor_actual) || 0), 0);
  const metaMostrada = aislado
    ? parseFloat(aislado.meta_global) || 0
    : grupo.reduce((s, i) => s + (parseFloat(i.meta_global) || 0), 0);
  const tieneMeta = !esPorcentaje && metaMostrada > 0;
  // Mismo criterio que TarjetaIndicador: texto sin tope, barra topada.
  const pct = tieneMeta ? (valorMostrado / metaMostrada) * 100 : null;
  const pctBarra = pct !== null ? Math.min(100, pct) : null;

  return (
    <div className={`rounded-lg border border-gray-200 bg-white ${compacto ? 'p-2.5' : 'p-3'} hover:border-gray-300 transition-colors`}>
      <div className="flex items-start justify-between gap-2">
        <p className={`${compacto ? 'text-xs' : 'text-sm'} font-medium text-gray-800 leading-snug break-words min-w-0`}>
          {grupo[0].nombre}
        </p>
        <div className="flex items-center gap-1 flex-shrink-0">
          {puedeEditar && (
            <button
              type="button"
              onClick={() => setEditandoValor(true)}
              title="Registrar valor"
              className="p-1 text-gray-300 hover:text-guinda-600 rounded hover:bg-gray-50"
            >
              <Pencil size={12} />
            </button>
          )}
          {aislado ? (
            <button
              type="button"
              onClick={() => setProyectoAisladoId(null)}
              className="flex items-center gap-1 text-[10px] font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 border border-gray-200 px-1.5 py-0.5 rounded-full transition-colors"
              title="Volver al total combinado"
            >
              <X size={9} /> Quitar filtro
            </button>
          ) : (
            <span className="text-[10px] font-medium text-guinda-700 bg-guinda-50 border border-guinda-100 px-1.5 py-0.5 rounded-full">
              {grupo.length} proyectos
            </span>
          )}
        </div>
      </div>
      {aislado && (
        <p className="text-[10px] text-gray-400 -mt-1 mb-1 truncate">{[aislado.proyecto_nombre, aislado.dg_siglas].filter(Boolean).join(' · ')}</p>
      )}

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
                title={valorMostrado.toLocaleString('es-MX')}
              >
                {esMoneda ? formatearMonedaCorta(valorMostrado) : formatoCorto(valorMostrado)}
              </span>
              {tieneMeta ? (
                <span className={`${compacto ? 'text-[10px]' : 'text-xs'} text-gray-500 ml-1.5`}>
                  de {esMoneda ? formatearMonedaCorta(metaMostrada) : `${formatoCorto(metaMostrada)}${unidad ? ` ${unidad}` : ''}`}
                </span>
              ) : (
                !esMoneda && unidad && <span className={`${compacto ? 'text-[10px]' : 'text-xs'} text-gray-500 ml-1.5`}>{unidad}</span>
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

      {!aislado && (
        <button
          type="button"
          onClick={() => setAbierto(v => !v)}
          className="mt-2 flex items-center gap-1 text-[10px] font-medium text-gray-500 hover:text-guinda-600"
        >
          {abierto ? <ChevronUp size={11} /> : <ChevronDown size={11} />} Ver por proyecto
        </button>
      )}
      {abierto && !aislado && (
        <div className="mt-1.5 pt-1.5 border-t border-gray-100 space-y-1">
          {grupo.map(ind => {
            const v = parseFloat(ind.valor_actual) || 0;
            const m = parseFloat(ind.meta_global) || 0;
            const claseFila = "w-full flex items-center justify-between gap-2 text-[11px] hover:bg-gray-50 rounded px-1 -mx-1 py-0.5 transition-colors";
            const contenidoFila = (
              <>
                <span className="text-gray-600 truncate">{[ind.proyecto_nombre, ind.dg_siglas].filter(Boolean).join(' · ')}</span>
                <span className="text-gray-500 tabular-nums flex-shrink-0">
                  {esMoneda
                    ? `${formatearMonedaCorta(v)}${m > 0 ? ` / ${formatearMonedaCorta(m)}` : ''}`
                    : `${formatoCorto(v)}${m > 0 ? ` / ${formatoCorto(m)}` : ''}${unidad ? ` ${unidad}` : ''}`}
                </span>
              </>
            );
            // Enlazable: cada fila lleva directo al detalle de ESE
            // indicador (tiene más sentido ahora que existe esa
            // pantalla). En el resto de vistas (Tablero/Cartera/
            // Panorama) se conserva el "aislar en la misma tarjeta" de
            // siempre, sin cambios.
            return enlazable ? (
              <Link key={ind.id} to={`/indicadores/${ind.id}`} className={claseFila}>{contenidoFila}</Link>
            ) : (
              <button
                key={ind.id}
                type="button"
                onClick={() => { setProyectoAisladoId(ind.proyecto_id); setAbierto(false); }}
                className={claseFila}
              >
                {contenidoFila}
              </button>
            );
          })}
        </div>
      )}

      {editandoValor && aislado && (
        <ModalEditarValorIndicador
          indicador={aislado}
          onCerrar={() => setEditandoValor(false)}
          onGuardado={() => { setEditandoValor(false); onValorActualizado?.(); }}
        />
      )}
    </div>
  );
}

// Envoltorio que decide, fila por fila, si hay que pintar la tarjeta
// normal (un solo proyecto) o la agrupada (2+ proyectos con el mismo
// id_catalogo) — lo que antes hacía cada vista (Tablero, Resumen de
// cartera) mapeando TarjetaIndicador directamente.
export function TarjetaIndicadorOAgrupada({ grupo, variante = 'normal', permitirEditarValor = false, onValorActualizado, enlazable = false }) {
  if (grupo.length === 1) {
    const ind = grupo[0];
    return (
      <TarjetaIndicador
        indicador={ind}
        variante={variante}
        contexto={[ind.proyecto_nombre, ind.dg_siglas].filter(Boolean).join(' · ')}
        permitirEditarValor={permitirEditarValor}
        onValorActualizado={onValorActualizado}
        enlazable={enlazable}
      />
    );
  }
  return (
    <TarjetaIndicadorGrupo
      grupo={grupo}
      variante={variante}
      permitirEditarValor={permitirEditarValor}
      onValorActualizado={onValorActualizado}
      enlazable={enlazable}
    />
  );
}
