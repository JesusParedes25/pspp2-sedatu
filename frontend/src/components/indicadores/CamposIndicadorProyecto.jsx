/**
 * ARCHIVO: CamposIndicadorProyecto.jsx
 * PROPÓSITO: Campos para definir el indicador DE UN PROYECTO (meta,
 *            descripción) — usado por "Crear proyecto", "Editar
 *            proyecto", el wizard de vincular indicador y la ficha de
 *            detalle, para que un cambio de criterio se haga una vez.
 *
 * Bloque 7 del rediseño de Indicadores: "temporalidad por periodos" y
 * "composición por categorías" (con su "tipo de gráfica") se quitaron
 * de este formulario — en producción casi no se usaban (0 indicadores
 * reales con valor capturado por periodo; solo 2 por categorías, uno de
 * ellos de prueba) y complicaban la captura para el 99% de los casos,
 * que son un solo valor. Las tablas/columnas correspondientes
 * (indicador_metas_anuales, indicador_categorias, composicion,
 * tipo_grafico) NO se tocan: lo ya capturado sigue intacto y visible
 * donde ya se mostraba, solo deja de ofrecerse como opción al crear o
 * editar.
 */
import {
  TIPOS_INDICADOR, UNIDADES_INDICADOR,
} from '../../utils/tiposIndicador';

export default function CamposIndicadorProyecto({ indicador, onCambio, mostrarDescripcion = true }) {
  const esDeCatalogo = !!indicador.id_catalogo;
  const etiquetaTipo = TIPOS_INDICADOR.find(t => t.valor === indicador.tipo)?.etiqueta || indicador.tipo;
  const etiquetaUnidad = indicador.unidad === 'Porcentaje' ? '%'
    : indicador.unidad === 'Moneda_MXN' ? '$ MXN'
    : indicador.unidad_personalizada || 'número';

  function cambiarTipo(nuevoTipo) {
    const patch = { tipo: nuevoTipo };
    // "Avance financiero" casi siempre implica pesos — solo se sugiere
    // si el usuario no había tocado la unidad todavía (sigue en su
    // default de fábrica), nunca pisa una elección ya hecha a propósito.
    if (nuevoTipo === 'Avance_financiero' && indicador.unidad === 'Numero' && !indicador.unidad_personalizada) {
      patch.unidad = 'Moneda_MXN';
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
          Nombre del indicador {esDeCatalogo && <span className="font-normal text-gray-400">(del catálogo)</span>}
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
              <select value={indicador.unidad} onChange={e => onCambio({ unidad: e.target.value })} className="input-base text-sm">
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
        {!indicador.meta_global && (
          <p className="text-[11px] text-gray-400 mt-1">
            Sin meta, este indicador reporta el número pero no puede calcular porcentaje de avance.
          </p>
        )}
      </div>

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
