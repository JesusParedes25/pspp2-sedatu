/**
 * ARCHIVO: ModalNuevaAccion.jsx
 * PROPÓSITO: Modal para crear una nueva acción, ya sea dentro de una
 *            etapa o directamente en el proyecto.
 *
 * MINI-CLASE: Acciones y su vínculo con indicadores
 * ─────────────────────────────────────────────────────────────────
 * Una acción es la unidad atómica de trabajo. Es el ÚNICO nivel
 * donde el porcentaje se edita manualmente. Cada acción puede
 * vincularse a indicadores vía la tabla accion_indicador.
 * Regla de cascada: si la acción pertenece a una etapa, solo ve
 * los indicadores de ESA etapa. Si es acción directa del proyecto
 * (sin etapa), solo ve los indicadores de nivel proyecto.
 *
 * Aporte en cascada: cada acción puede aportar a un indicador con
 * valor manual o distribución equitativa. La distribución calcula
 * (disponible / 1) porque se crea una acción a la vez. El backend
 * valida que la suma nunca supere meta_global.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect } from 'react';
import { X, BarChart3, Divide, PenLine } from 'lucide-react';
import * as catalogosApi from '../../api/catalogos';
import * as etapasApi from '../../api/etapas';
import * as indicadoresApi from '../../api/indicadores';
import { useAuth } from '../../context/AuthContext';

// ── Componente de tarjeta de indicador reutilizable ─────────────
// Se usa tanto en ModalNuevaAccion como en DrawerAccion (subacciones)
export function TarjetaIndicadorCascada({ ind, asociado, resumen, color, onToggle, onCambioModo, onCambioValor }) {
  const unidadLabel = ind.unidad === 'Porcentaje' ? '%' : ind.unidad === 'Moneda_MXN' ? '$MXN' : ind.unidad_personalizada || '#';
  const meta = parseFloat(ind.meta_global) || 0;
  const totalAportado = resumen?.total_aportado ?? 0;
  const disponible = resumen?.disponible ?? meta;
  const pctComprometido = meta > 0 ? Math.min(100, (totalAportado / meta) * 100) : 0;
  const valorNum = parseFloat(asociado?.valor_aportado) || 0;
  const excede = valorNum > disponible && disponible >= 0;

  const esGuinda = color === 'guinda';
  const accentBg = esGuinda ? 'bg-guinda-50/20' : 'bg-amber-50/20';
  const accentBorder = esGuinda ? 'border-guinda-300' : 'border-amber-300';
  const accentText = esGuinda ? 'text-guinda-600' : 'text-amber-600';
  const accentCheck = esGuinda ? 'text-guinda-500 focus:ring-guinda-500' : 'text-amber-500 focus:ring-amber-500';
  const barColor = esGuinda ? 'bg-guinda-400' : 'bg-amber-400';
  const separatorBorder = esGuinda ? 'border-guinda-100' : 'border-amber-100';

  return (
    <div className={`border rounded-lg transition-all ${asociado ? `${accentBorder} ${accentBg}` : 'border-gray-200'}`}>
      {/* Fila principal: checkbox + nombre + mini barra de progreso */}
      <label className="flex items-center gap-2.5 p-2.5 cursor-pointer">
        <input type="checkbox" checked={!!asociado} onChange={onToggle}
          className={`rounded border-gray-300 ${accentCheck} flex-shrink-0`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <BarChart3 size={12} className={asociado ? accentText : 'text-gray-300'} />
            <span className="text-sm font-medium text-gray-800 truncate">{ind.nombre}</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            {/* Mini barra de cuánto se ha comprometido */}
            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden max-w-[120px]">
              <div className={`h-full rounded-full transition-all ${barColor}`}
                style={{ width: `${pctComprometido}%` }} />
            </div>
            <span className="text-[10px] text-gray-400 tabular-nums flex-shrink-0">
              {Number(totalAportado).toLocaleString()} / {Number(meta).toLocaleString()} {unidadLabel}
            </span>
            <span className={`text-[10px] font-semibold tabular-nums flex-shrink-0 ${
              disponible <= 0 ? 'text-red-500' : 'text-emerald-600'
            }`}>
              ({Number(disponible).toLocaleString()} disp.)
            </span>
          </div>
        </div>
      </label>

      {/* Panel expandido: modo de aportación */}
      {asociado && (
        <div className={`px-3 pb-3 pt-1 border-t ${separatorBorder} space-y-2`}>
          {/* Selector de modo */}
          <div className="flex gap-1">
            {[
              { modo: 'manual', label: 'Manual', icono: PenLine },
              { modo: 'equitativo', label: 'Equitativo', icono: Divide },
            ].map(({ modo, label, icono: Icono }) => (
              <button key={modo} type="button"
                onClick={() => onCambioModo(ind.id, modo)}
                className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all ${
                  asociado.modo === modo
                    ? `${esGuinda ? 'bg-guinda-100 text-guinda-700' : 'bg-amber-100 text-amber-700'} shadow-sm`
                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                }`}>
                <Icono size={11} /> {label}
              </button>
            ))}
          </div>

          {/* Campo de valor */}
          {asociado.modo === 'manual' && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 flex-shrink-0">Aporta:</span>
              <input
                type="number" step="any" min="0"
                max={disponible > 0 ? disponible : undefined}
                value={asociado.valor_aportado}
                onChange={e => onCambioValor(ind.id, e.target.value)}
                className={`input-base text-sm w-28 py-1 ${excede ? 'border-red-400 ring-1 ring-red-200' : ''}`}
                placeholder="0"
              />
              <span className="text-xs text-gray-400">{unidadLabel}</span>
              {excede && <span className="text-[10px] text-red-500 font-medium">Excede lo disponible</span>}
            </div>
          )}

          {asociado.modo === 'equitativo' && (
            <div className="flex items-center gap-2 px-2.5 py-1.5 bg-white/60 rounded-lg border border-dashed border-gray-200">
              <Divide size={12} className="text-gray-400" />
              <span className="text-xs text-gray-600">
                Aportará <span className="font-bold tabular-nums">{Number(disponible).toLocaleString()}</span> {unidadLabel}
                <span className="text-gray-400 ml-1">(todo lo disponible)</span>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ModalNuevaAccion({ proyecto, etapaId, onGuardar, onCerrar }) {
  const { usuario } = useAuth();
  const [dgs, setDgs] = useState([]);
  const [direccionesArea, setDireccionesArea] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [enviando, setEnviando] = useState(false);

  const hoy = new Date().toISOString().split('T')[0];
  const enUnMes = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

  const [datos, setDatos] = useState({
    nombre: '',
    descripcion: '',
    tipo: 'Accion_programada',
    fecha_inicio: hoy,
    fecha_fin: enUnMes,
    id_dg: usuario?.id_dg || '',
    id_direccion_area: usuario?.id_direccion_area || '',
    id_responsable: usuario?.id || '',
    indicadores_asociados: [],
  });

  const [indicadoresEtapa, setIndicadoresEtapa] = useState([]);
  // Resumen de aportaciones por indicador: { [indicadorId]: { meta_global, total_aportado, disponible } }
  const [resumenes, setResumenes] = useState({});

  useEffect(() => {
    async function cargar() {
      try {
        const promesas = [
          catalogosApi.obtenerDGs(),
          catalogosApi.obtenerDireccionesArea(),
          catalogosApi.obtenerUsuarios(),
        ];
        if (etapaId) {
          promesas.push(etapasApi.obtenerIndicadoresEtapa(etapaId));
        }
        const resultados = await Promise.all(promesas);
        setDgs(resultados[0].datos || []);
        setDireccionesArea(resultados[1].datos || []);
        setUsuarios(resultados[2].datos || []);
        if (etapaId && resultados[3]) {
          setIndicadoresEtapa(resultados[3].datos || []);
        }
      } catch (err) {
        console.error('Error cargando catálogos:', err);
      }
    }
    cargar();
  }, [etapaId]);

  // Regla de cascada: si hay etapa → solo indicadores de etapa;
  // si es acción directa → solo indicadores del proyecto.
  const indicadoresProyecto = etapaId ? [] : (proyecto?.indicadores || []);
  const todosIndicadores = [...indicadoresProyecto, ...indicadoresEtapa];

  useEffect(() => {
    if (todosIndicadores.length === 0) return;
    async function cargarResumenes() {
      const resultados = await Promise.allSettled(
        todosIndicadores.map(ind => indicadoresApi.obtenerResumenAportaciones(ind.id))
      );
      const mapa = {};
      todosIndicadores.forEach((ind, i) => {
        if (resultados[i].status === 'fulfilled') {
          mapa[ind.id] = resultados[i].value.datos;
        }
      });
      setResumenes(mapa);
    }
    cargarResumenes();
  }, [todosIndicadores.length]);

  function actualizar(campo, valor) {
    setDatos(prev => ({ ...prev, [campo]: valor }));
  }

  function toggleIndicador(indicadorId) {
    setDatos(prev => {
      const existe = prev.indicadores_asociados.find(ia => ia.id_indicador === indicadorId);
      if (existe) {
        return { ...prev, indicadores_asociados: prev.indicadores_asociados.filter(ia => ia.id_indicador !== indicadorId) };
      }
      return { ...prev, indicadores_asociados: [...prev.indicadores_asociados, { id_indicador: indicadorId, valor_aportado: '', modo: 'manual' }] };
    });
  }

  function cambiarModo(indicadorId, modo) {
    setDatos(prev => ({
      ...prev,
      indicadores_asociados: prev.indicadores_asociados.map(ia => {
        if (ia.id_indicador !== indicadorId) return ia;
        if (modo === 'equitativo') {
          const disp = resumenes[indicadorId]?.disponible ?? 0;
          return { ...ia, modo, valor_aportado: disp > 0 ? String(disp) : '0' };
        }
        return { ...ia, modo, valor_aportado: '' };
      }),
    }));
  }

  function actualizarAportacion(indicadorId, valor) {
    setDatos(prev => ({
      ...prev,
      indicadores_asociados: prev.indicadores_asociados.map(ia =>
        ia.id_indicador === indicadorId ? { ...ia, valor_aportado: valor } : ia
      ),
    }));
  }

  async function manejarSubmit(e) {
    e.preventDefault();
    if (!datos.nombre.trim() || !datos.fecha_inicio || !datos.fecha_fin) return;
    setEnviando(true);
    try {
      await onGuardar({
        ...datos,
        id_dg: datos.id_dg || null,
        id_direccion_area: datos.id_direccion_area || null,
        id_responsable: datos.id_responsable || null,
      });
    } finally {
      setEnviando(false);
    }
  }

  const dasFiltradas = direccionesArea.filter(da => {
    if (!datos.id_dg) return true;
    const dg = dgs.find(d => String(d.id) === String(datos.id_dg));
    return dg && da.dg_siglas === dg.siglas;
  });

  const usuariosFiltrados = usuarios.filter(u => {
    if (!datos.id_dg) return true;
    return String(u.id_dg) === String(datos.id_dg);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {etapaId ? 'Nueva acción en etapa' : 'Nueva acción directa'}
          </h2>
          <button onClick={onCerrar} className="p-1 rounded hover:bg-gray-100">
            <X size={18} className="text-gray-400" />
          </button>
        </div>

        <form onSubmit={manejarSubmit} className="p-5 space-y-4">
          {/* Nombre */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de la acción *</label>
            <input type="text" value={datos.nombre} onChange={e => actualizar('nombre', e.target.value)}
              className="input-base" placeholder="Ej: Procesar datos INEGI de la ZM Guadalajara" required />
          </div>

          {/* Descripción */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
            <textarea value={datos.descripcion} onChange={e => actualizar('descripcion', e.target.value)}
              rows={2} className="input-base resize-none" placeholder="Detalle de la acción..." />
          </div>

          {/* Tipo y Fechas */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
              <select value={datos.tipo} onChange={e => actualizar('tipo', e.target.value)} className="input-base text-sm">
                <option value="Accion_programada">Acción programada</option>
                <option value="Hito">Hito</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Fecha inicio *</label>
              <input type="date" value={datos.fecha_inicio} onChange={e => actualizar('fecha_inicio', e.target.value)}
                className="input-base text-sm" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Fecha fin *</label>
              <input type="date" value={datos.fecha_fin} onChange={e => actualizar('fecha_fin', e.target.value)}
                className="input-base text-sm" required />
            </div>
          </div>

          {/* DG, DA, Responsable */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">DG</label>
              <select value={datos.id_dg} onChange={e => actualizar('id_dg', e.target.value)} className="input-base text-sm">
                <option value="">Misma del proyecto</option>
                {dgs.map(dg => <option key={dg.id} value={dg.id}>{dg.siglas}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Dirección de área</label>
              <select value={datos.id_direccion_area} onChange={e => actualizar('id_direccion_area', e.target.value)} className="input-base text-sm">
                <option value="">Sin especificar</option>
                {dasFiltradas.map(da => <option key={da.id} value={da.id}>{da.siglas}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Responsable</label>
            <select value={datos.id_responsable} onChange={e => actualizar('id_responsable', e.target.value)} className="input-base text-sm">
              <option value="">Sin asignar</option>
              {usuariosFiltrados.map(u => (
                <option key={u.id} value={u.id}>{u.nombre_completo} — {u.cargo}</option>
              ))}
            </select>
          </div>

          {/* ── Aporte a indicadores en cascada ── */}
          {todosIndicadores.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-0.5">Aporte a indicadores</label>
              <p className="text-[11px] text-gray-400 mb-2">
                Marca los indicadores a los que esta acción contribuye. Si no marcas ninguno, la acción no aporta a ningún indicador.
              </p>
              <div className="space-y-2">
                {todosIndicadores.map(ind => (
                  <TarjetaIndicadorCascada
                    key={ind.id}
                    ind={ind}
                    asociado={datos.indicadores_asociados.find(ia => ia.id_indicador === ind.id)}
                    resumen={resumenes[ind.id]}
                    color={ind.id_etapa ? 'amber' : 'guinda'}
                    onToggle={() => toggleIndicador(ind.id)}
                    onCambioModo={cambiarModo}
                    onCambioValor={actualizarAportacion}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Botones */}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onCerrar} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={enviando || !datos.nombre.trim()} className="btn-primary">
              {enviando ? 'Creando...' : 'Crear acción'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
