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
import { TIPOS_INDICADOR, UNIDADES_INDICADOR, calcularMetasAnuales } from '../../utils/tiposIndicador';

export default function CamposIndicadorProyecto({ indicador, onCambio, mostrarDescripcion = true }) {
  const esDeCatalogo = !!indicador.id_catalogo;
  const etiquetaTipo = TIPOS_INDICADOR.find(t => t.valor === indicador.tipo)?.etiqueta || indicador.tipo;
  const etiquetaUnidad = indicador.unidad === 'Porcentaje' ? '%'
    : indicador.unidad === 'Moneda_MXN' ? '$ MXN'
    : indicador.unidad_personalizada || 'número';

  function cambiarTipo(nuevoTipo) {
    const patch = { tipo: nuevoTipo };
    // Valor por defecto inteligente: "Avance financiero" casi siempre
    // implica pesos y corte por ejercicio fiscal. Solo se aplica si el
    // usuario no había tocado esos campos todavía (siguen en su default
    // de fábrica) — nunca pisa una elección ya hecha a propósito.
    if (nuevoTipo === 'Avance_financiero' && indicador.unidad === 'Numero' && !indicador.unidad_personalizada) {
      patch.unidad = 'Moneda_MXN';
    }
    if (nuevoTipo === 'Avance_financiero' && indicador.temporalidad === 'Global' && indicador.metas_anuales.length === 0) {
      const anio = new Date().getFullYear();
      patch.temporalidad = 'Anual';
      patch.anio_inicio = anio;
      patch.anio_fin = anio;
      patch.metas_anuales = calcularMetasAnuales(anio, anio);
    }
    onCambio(patch);
  }

  function cambiarRangoAnual(inicio, fin) {
    onCambio({
      anio_inicio: inicio,
      anio_fin: fin,
      metas_anuales: calcularMetasAnuales(inicio, fin, indicador.metas_anuales),
    });
  }

  function elegirTemporalidad(valor) {
    const patch = { temporalidad: valor };
    if (valor === 'Anual' && indicador.metas_anuales.length === 0) {
      patch.metas_anuales = calcularMetasAnuales(indicador.anio_inicio, indicador.anio_fin);
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
          className="input-base text-sm" placeholder={indicador.unidad === 'Porcentaje' ? '100' : indicador.unidad === 'Moneda_MXN' ? '150000000' : '500'} />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Temporalidad</label>
        <div className="flex gap-4">
          <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
            <input type="radio" checked={indicador.temporalidad === 'Global'}
              onChange={() => elegirTemporalidad('Global')}
              className="text-guinda-500 focus:ring-guinda-500" />
            Meta global (sin desglose anual)
          </label>
          <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
            <input type="radio" checked={indicador.temporalidad === 'Anual'}
              onChange={() => elegirTemporalidad('Anual')}
              className="text-guinda-500 focus:ring-guinda-500" />
            Metas por ejercicio fiscal
          </label>
        </div>
      </div>

      {indicador.temporalidad === 'Anual' && (
        <div className="space-y-2 pl-4 border-l-2 border-blue-200">
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
              <div key={ma.anio} className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-10">{ma.anio}:</span>
                <input type="number" step="any" value={ma.meta}
                  onChange={e => {
                    const copia = [...indicador.metas_anuales];
                    copia[mi] = { ...copia[mi], meta: e.target.value };
                    onCambio({ metas_anuales: copia });
                  }}
                  className="input-base text-sm flex-1" placeholder="Meta para este año" />
              </div>
            ))}
          </div>
          {indicador.metas_anuales.length > 0 && (
            <p className="text-xs text-gray-400">
              Suma anual: {indicador.metas_anuales.reduce((s, m) => s + (parseFloat(m.meta) || 0), 0).toLocaleString()}
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
