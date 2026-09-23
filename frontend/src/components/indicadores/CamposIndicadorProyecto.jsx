/**
 * ARCHIVO: CamposIndicadorProyecto.jsx
 * PROPÓSITO: Campos para definir el indicador DE UN PROYECTO (meta,
 *            temporalidad, año fiscal, metas por año) — antes eran 3
 *            implementaciones copiadas y ya divergentes: el formulario
 *            de "Crear proyecto", el de "Editar proyecto" (a la que se
 *            le olvidó bloquear nombre/tipo/unidad cuando el indicador
 *            viene del catálogo — si se editaban ahí, el proyecto
 *            quedaba desincronizado del catálogo compartido) y el paso
 *            2 del wizard de vincular indicador, que ni siquiera tenía
 *            temporalidad/año — por eso era imposible marcar un
 *            indicador financiero como "por ejercicio fiscal" desde
 *            ahí. Ahora los tres usan este mismo componente.
 *
 * `onCambio` recibe un PARCHE (objeto con uno o varios campos a la
 * vez), no un solo (campo, valor) — necesario para el valor por
 * defecto inteligente de abajo, que cambia 3 campos de un golpe; llamar
 * a un mutador de un solo campo tres veces seguidas en el mismo evento
 * pierde los dos primeros cambios si el padre arma el arreglo desde un
 * closure ya obsoleto (pasaba en las 3 implementaciones anteriores).
 */
import { X } from 'lucide-react';
import {
  TIPOS_INDICADOR, UNIDADES_INDICADOR,
  calcularMetasAnuales, calcularMetasSexenio, nuevoPeriodoPersonalizado, nuevaCategoria,
} from '../../utils/tiposIndicador';

const GENERADOR_POR_UNIDAD_PERIODO = { Anio: calcularMetasAnuales, Sexenio: calcularMetasSexenio };

// El radio de arriba es uno solo con 3 opciones (en vez de "Temporalidad"
// cruzado con "¿Cómo se compone?" por separado) porque, siendo
// excluyentes por diseño, dos radios independientes generarían una 4ª
// combinación inválida (Anual + Categorías) que habría que bloquear a
// mano — con una sola opción elegida a la vez no hay estado inválido
// que prevenir.
function modoDesgloseDe(indicador) {
  if (indicador.composicion === 'Categorias') return 'categorias';
  if (indicador.temporalidad === 'Anual') return 'periodos';
  return 'simple';
}

export default function CamposIndicadorProyecto({ indicador, onCambio, mostrarDescripcion = true }) {
  const esDeCatalogo = !!indicador.id_catalogo;
  const unidadPeriodo = indicador.unidad_periodo || 'Anio';
  const esPorcentaje = indicador.unidad === 'Porcentaje';
  const modoDesglose = modoDesgloseDe(indicador);
  const etiquetaTipo = TIPOS_INDICADOR.find(t => t.valor === indicador.tipo)?.etiqueta || indicador.tipo;
  const etiquetaUnidad = indicador.unidad === 'Porcentaje' ? '%'
    : indicador.unidad === 'Moneda_MXN' ? '$ MXN'
    : indicador.unidad_personalizada || 'número';

  function cambiarTipo(nuevoTipo) {
    const patch = { tipo: nuevoTipo };
    // Valor por defecto inteligente: "Avance financiero" casi siempre
    // implica pesos y corte por ejercicio fiscal. Solo se aplica si el
    // usuario no había tocado esos campos todavía (siguen en su default
    // de fábrica) — nunca pisa una elección ya hecha a propósito. No
    // sugiere Sexenio: nadie lo pidió como default, solo como opción.
    if (nuevoTipo === 'Avance_financiero' && indicador.unidad === 'Numero' && !indicador.unidad_personalizada) {
      patch.unidad = 'Moneda_MXN';
    }
    if (nuevoTipo === 'Avance_financiero' && indicador.temporalidad === 'Global' && indicador.metas_anuales.length === 0) {
      const anio = new Date().getFullYear();
      patch.temporalidad = 'Anual';
      patch.unidad_periodo = 'Anio';
      patch.anio_inicio = anio;
      patch.anio_fin = anio;
      patch.metas_anuales = calcularMetasAnuales(anio, anio);
    }
    onCambio(patch);
  }

  function cambiarRangoAnual(inicio, fin) {
    const generar = GENERADOR_POR_UNIDAD_PERIODO[unidadPeriodo] || calcularMetasAnuales;
    onCambio({
      anio_inicio: inicio,
      anio_fin: fin,
      metas_anuales: generar(inicio, fin, indicador.metas_anuales),
    });
  }

  function elegirModoDesglose(modo) {
    if (modo === 'simple') {
      onCambio({ temporalidad: 'Global', composicion: 'Simple' });
    } else if (modo === 'periodos') {
      const patch = { temporalidad: 'Anual', composicion: 'Simple' };
      if (indicador.metas_anuales.length === 0) {
        // Un indicador que nació Global nunca tuvo anio_inicio/anio_fin
        // — generar con ambos en null producía una fila fantasma sin
        // año ni etiqueta (se veía como un ":" suelto). Mismo default
        // que ya usa indicadorProyectoVacio() para uno nuevo.
        const anioActual = new Date().getFullYear();
        const inicio = indicador.anio_inicio ?? anioActual;
        const fin = indicador.anio_fin ?? anioActual;
        patch.anio_inicio = inicio;
        patch.anio_fin = fin;
        const generar = GENERADOR_POR_UNIDAD_PERIODO[unidadPeriodo] || calcularMetasAnuales;
        patch.metas_anuales = generar(inicio, fin);
      }
      onCambio(patch);
    } else {
      const patch = { temporalidad: 'Global', composicion: 'Categorias' };
      if (!indicador.categorias || indicador.categorias.length === 0) {
        // Arranca con 2 filas en blanco: una sola "categoría" no es una
        // categorización.
        patch.categorias = [nuevaCategoria(), nuevaCategoria()];
      }
      onCambio(patch);
    }
  }

  // "¿Cada cuánto?" — cambiar de Año/Sexenio regenera las filas a partir
  // del mismo rango (conservando meta/id de lo que coincida); cambiar a
  // Personalizado no toca lo que ya había, solo asegura al menos una fila
  // en blanco para no aterrizar en una lista vacía sin salida.
  function cambiarUnidadPeriodo(valor) {
    const patch = { unidad_periodo: valor };
    const generar = GENERADOR_POR_UNIDAD_PERIODO[valor];
    if (generar) {
      patch.metas_anuales = generar(indicador.anio_inicio, indicador.anio_fin, indicador.metas_anuales);
    } else if (valor === 'Personalizado' && indicador.metas_anuales.length === 0) {
      patch.metas_anuales = [nuevoPeriodoPersonalizado()];
    }
    onCambio(patch);
  }

  function cambiarMetaPeriodo(indice, campo, valor) {
    const copia = [...indicador.metas_anuales];
    copia[indice] = { ...copia[indice], [campo]: valor };
    onCambio({ metas_anuales: copia });
  }

  function quitarPeriodo(indice) {
    onCambio({ metas_anuales: indicador.metas_anuales.filter((_, i) => i !== indice) });
  }

  function agregarPeriodoPersonalizado() {
    onCambio({ metas_anuales: [...indicador.metas_anuales, nuevoPeriodoPersonalizado()] });
  }

  function cambiarCategoria(indice, campo, valor) {
    const copia = [...(indicador.categorias || [])];
    copia[indice] = { ...copia[indice], [campo]: valor };
    onCambio({ categorias: copia });
  }

  function quitarCategoria(indice) {
    onCambio({ categorias: indicador.categorias.filter((_, i) => i !== indice) });
  }

  function agregarCategoria() {
    onCambio({ categorias: [...(indicador.categorias || []), nuevaCategoria()] });
  }

  // Un porcentaje sumado entre categorías no representa nada real
  // (mismo criterio que ya excluye el combinado de porcentajes entre
  // proyectos en TarjetaIndicadorGrupo) — si el usuario cambia la
  // unidad a Porcentaje mientras ya tenía Categorías elegido, se
  // regresa a Simple en el mismo patch.
  function cambiarUnidad(valor) {
    const patch = { unidad: valor };
    if (valor === 'Porcentaje' && indicador.composicion === 'Categorias') {
      patch.temporalidad = 'Global';
      patch.composicion = 'Simple';
    }
    onCambio(patch);
  }

  return (
    <div className="space-y-3">
      {/* Nombre, tipo y unidad definen la IDENTIDAD del indicador y viven
          en el catálogo: si se pudieran editar aquí, dos proyectos
          ligados a la misma entrada mostrarían cosas distintas y el
          consolidado dejaría de cuadrar. Para cambiar la definición se
          edita el catálogo (solo superadmin). */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Nombre del indicador {esDeCatalogo && <span className="font-normal text-gray-400">— del catálogo</span>}
        </label>
        {esDeCatalogo ? (
          <p className="text-sm text-gray-800 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">{indicador.nombre}</p>
        ) : (
          <input type="text" value={indicador.nombre} onChange={e => onCambio({ nombre: e.target.value })}
            className="input-base text-sm" placeholder="Ej: Viviendas construidas, Presupuesto ejercido..." />
        )}
      </div>

      {esDeCatalogo ? (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{etiquetaTipo}</span>
          <span>se mide en {etiquetaUnidad}</span>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
              <select value={indicador.tipo} onChange={e => cambiarTipo(e.target.value)} className="input-base text-sm">
                {TIPOS_INDICADOR.map(t => <option key={t.valor} value={t.valor}>{t.etiqueta}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Unidad de medida</label>
              <select value={indicador.unidad} onChange={e => cambiarUnidad(e.target.value)} className="input-base text-sm">
                {UNIDADES_INDICADOR.map(u => <option key={u.valor} value={u.valor}>{u.etiqueta}</option>)}
              </select>
            </div>
          </div>

          {indicador.unidad === 'Numero' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Etiqueta de la unidad</label>
              <input type="text" value={indicador.unidad_personalizada} onChange={e => onCambio({ unidad_personalizada: e.target.value })}
                className="input-base text-sm" placeholder="Ej: viviendas, hectáreas, ZMs, expedientes..." />
            </div>
          )}
        </>
      )}

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Meta global (opcional)</label>
        <input type="number" step="any" value={indicador.meta_global} onChange={e => onCambio({ meta_global: e.target.value })}
          className="input-base text-sm" placeholder={indicador.unidad === 'Porcentaje' ? '100' : indicador.unidad === 'Moneda_MXN' ? 'Ej. 1,500,000' : '500'} />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">¿Cómo se mide este indicador?</label>
        <div className="flex gap-4 flex-wrap">
          <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
            <input type="radio" checked={modoDesglose === 'simple'}
              onChange={() => elegirModoDesglose('simple')}
              className="text-guinda-500 focus:ring-guinda-500" />
            Un solo valor
          </label>
          <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
            <input type="radio" checked={modoDesglose === 'periodos'}
              onChange={() => elegirModoDesglose('periodos')}
              className="text-guinda-500 focus:ring-guinda-500" />
            Por periodos (año/sexenio/personalizado)
          </label>
          <label className={`flex items-center gap-1.5 text-sm cursor-pointer ${esPorcentaje ? 'text-gray-300 cursor-not-allowed' : 'text-gray-700'}`}>
            <input type="radio" checked={modoDesglose === 'categorias'} disabled={esPorcentaje}
              onChange={() => elegirModoDesglose('categorias')}
              className="text-guinda-500 focus:ring-guinda-500" />
            Por categorías
          </label>
        </div>
        {esPorcentaje && (
          <p className="text-[11px] text-gray-400 mt-1">
            Un porcentaje no se puede componer de categorías — sumarlas no representa nada real.
          </p>
        )}
      </div>

      {(modoDesglose === 'periodos' || modoDesglose === 'categorias') && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de gráfica</label>
          <div className="flex gap-4">
            {[['barras', 'Barras'], ['dona', 'Dona']].map(([valor, etiqueta]) => (
              <label key={valor} className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                <input type="radio" checked={(indicador.tipo_grafico || 'barras') === valor}
                  onChange={() => onCambio({ tipo_grafico: valor })}
                  className="text-guinda-500 focus:ring-guinda-500" />
                {etiqueta}
              </label>
            ))}
          </div>
        </div>
      )}

      {modoDesglose === 'periodos' && (
        <div className="space-y-2 pl-4 border-l-2 border-blue-200">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">¿Cada cuánto?</label>
            <div className="flex gap-4">
              {[['Anio', 'Año'], ['Sexenio', 'Sexenio'], ['Personalizado', 'Personalizado']].map(([valor, etiqueta]) => (
                <label key={valor} className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                  <input type="radio" checked={unidadPeriodo === valor}
                    onChange={() => cambiarUnidadPeriodo(valor)}
                    className="text-guinda-500 focus:ring-guinda-500" />
                  {etiqueta}
                </label>
              ))}
            </div>
          </div>

          {unidadPeriodo !== 'Personalizado' ? (
            <>
              <div className="flex gap-3 items-end">
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Año inicio</label>
                  <input type="number" value={indicador.anio_inicio}
                    onChange={e => cambiarRangoAnual(Number(e.target.value), indicador.anio_fin)}
                    className="input-base text-sm w-24" min="2020" max="2040" />
                </div>
                <span className="text-gray-400 pb-2">—</span>
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Año fin</label>
                  <input type="number" value={indicador.anio_fin}
                    onChange={e => cambiarRangoAnual(indicador.anio_inicio, Number(e.target.value))}
                    className="input-base text-sm w-24" min="2020" max="2040" />
                </div>
              </div>
              <div className="space-y-1">
                {indicador.metas_anuales.map((ma, mi) => (
                  <div key={ma.id || ma.anio} className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 w-16">{ma.etiqueta || ma.anio}:</span>
                    <input type="number" step="any" value={ma.meta}
                      onChange={e => cambiarMetaPeriodo(mi, 'meta', e.target.value)}
                      className="input-base text-sm flex-1" placeholder="Meta para este periodo" />
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="space-y-1">
              {indicador.metas_anuales.map((ma, mi) => (
                <div key={ma.id || `nuevo-${mi}`} className="flex items-center gap-2">
                  <input type="text" value={ma.etiqueta || ''}
                    onChange={e => cambiarMetaPeriodo(mi, 'etiqueta', e.target.value)}
                    className="input-base text-sm flex-1" placeholder="Etiqueta, ej: Q1 2026" />
                  <input type="number" step="any" value={ma.meta}
                    onChange={e => cambiarMetaPeriodo(mi, 'meta', e.target.value)}
                    className="input-base text-sm w-32" placeholder="Meta" />
                  <button type="button" onClick={() => quitarPeriodo(mi)}
                    className="p-1.5 text-gray-400 hover:text-red-500" title="Quitar periodo">
                    <X size={14} />
                  </button>
                </div>
              ))}
              <button type="button" onClick={agregarPeriodoPersonalizado}
                className="text-xs text-guinda-600 hover:text-guinda-700 font-medium pt-1">
                + agregar periodo
              </button>
            </div>
          )}

          {indicador.metas_anuales.length > 0 && (
            <p className="text-xs text-gray-400">
              Suma de periodos: {indicador.metas_anuales.reduce((s, m) => s + (parseFloat(m.meta) || 0), 0).toLocaleString()}
              {indicador.meta_global ? ` / Meta global: ${Number(indicador.meta_global).toLocaleString()}` : ''}
            </p>
          )}
        </div>
      )}

      {modoDesglose === 'categorias' && (
        <div className="space-y-2 pl-4 border-l-2 border-blue-200">
          <div className="space-y-1">
            {(indicador.categorias || []).map((cat, ci) => (
              <div key={cat.id || `nueva-${ci}`} className="flex items-center gap-2">
                <input type="text" value={cat.nombre || ''}
                  onChange={e => cambiarCategoria(ci, 'nombre', e.target.value)}
                  className="input-base text-sm flex-1" placeholder="Nombre de la categoría, ej: Solicitudes de validación" />
                <input type="number" step="any" value={cat.meta}
                  onChange={e => cambiarCategoria(ci, 'meta', e.target.value)}
                  className="input-base text-sm w-32" placeholder="Meta" />
                <button type="button" onClick={() => quitarCategoria(ci)}
                  className="p-1.5 text-gray-400 hover:text-red-500" title="Quitar categoría">
                  <X size={14} />
                </button>
              </div>
            ))}
            <button type="button" onClick={agregarCategoria}
              className="text-xs text-guinda-600 hover:text-guinda-700 font-medium pt-1">
              + agregar categoría
            </button>
          </div>

          {(indicador.categorias || []).length > 0 && (
            <p className="text-xs text-gray-400">
              Suma de categorías: {indicador.categorias.reduce((s, c) => s + (parseFloat(c.meta) || 0), 0).toLocaleString()}
              {indicador.meta_global ? ` / Meta global: ${Number(indicador.meta_global).toLocaleString()}` : ''}
            </p>
          )}
        </div>
      )}

      {mostrarDescripcion && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Descripción (opcional)</label>
          <input type="text" value={indicador.descripcion} onChange={e => onCambio({ descripcion: e.target.value })}
            className="input-base text-sm" placeholder="Contexto o fórmula de cálculo..." />
        </div>
      )}
    </div>
  );
}
