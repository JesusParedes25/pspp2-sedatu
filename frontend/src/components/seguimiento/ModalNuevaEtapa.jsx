/**
 * ARCHIVO: ModalNuevaEtapa.jsx
 * PROPÓSITO: Modal para crear una nueva etapa dentro de un proyecto.
 *            Permite: (A) vincular indicadores del proyecto con meta parcial,
 *            y (B) crear indicadores propios de la etapa que pueden o no
 *            estar relacionados con los del proyecto.
 *
 * MINI-CLASE: Jerarquía de indicadores
 * ─────────────────────────────────────────────────────────────────
 * Nivel proyecto: KPIs globales (ej: "92 ZMs analizadas").
 * Nivel etapa: indicadores específicos (ej: "# municipios con
 *   restricción cartografiada"). Viven en la tabla indicadores con
 *   id_etapa != NULL. Las acciones pueden vincularse a cualquiera.
 * indicador_etapas: distribuye la meta de un indicador de proyecto
 *   entre etapas (cuánto aporta cada etapa al KPI global).
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import * as catalogosApi from '../../api/catalogos';
import { useAuth } from '../../context/AuthContext';

export default function ModalNuevaEtapa({ proyecto, etapas, onGuardar, onCerrar }) {
  const { usuario } = useAuth();
  const [dgs, setDgs] = useState([]);
  const [direccionesArea, setDireccionesArea] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [enviando, setEnviando] = useState(false);

  const [datos, setDatos] = useState({
    nombre: '',
    descripcion: '',
    id_dg: usuario?.id_dg || '',
    id_direccion_area: usuario?.id_direccion_area || '',
    id_responsable: usuario?.id || '',
    depende_de: '',
    tipo_meta: 'Sin_meta',
    meta_descripcion: '',
    meta_valor: '',
    meta_unidad: '',
    indicadores_asociados: [],
    indicadores_nuevos: [],
  });

  useEffect(() => {
    async function cargar() {
      try {
        const [resDgs, resDA, resUsuarios] = await Promise.all([
          catalogosApi.obtenerDGs(),
          catalogosApi.obtenerDireccionesArea(),
          catalogosApi.obtenerUsuarios(),
        ]);
        setDgs(resDgs.datos || []);
        setDireccionesArea(resDA.datos || []);
        setUsuarios(resUsuarios.datos || []);
      } catch (err) {
        console.error('Error cargando catálogos:', err);
      }
    }
    cargar();
  }, []);

  function actualizar(campo, valor) {
    setDatos(prev => ({ ...prev, [campo]: valor }));
  }

  // ── Indicadores del proyecto: vincular/desvincular ──
  function toggleIndicador(indicadorId) {
    setDatos(prev => {
      const existe = prev.indicadores_asociados.find(ia => ia.id_indicador === indicadorId);
      if (existe) {
        return { ...prev, indicadores_asociados: prev.indicadores_asociados.filter(ia => ia.id_indicador !== indicadorId) };
      }
      return { ...prev, indicadores_asociados: [...prev.indicadores_asociados, { id_indicador: indicadorId, meta_etapa: '' }] };
    });
  }

  function actualizarMetaIndicador(indicadorId, meta) {
    setDatos(prev => ({
      ...prev,
      indicadores_asociados: prev.indicadores_asociados.map(ia =>
        ia.id_indicador === indicadorId ? { ...ia, meta_etapa: meta } : ia
      )
    }));
  }

  // ── Indicadores nuevos propios de la etapa ──
  function agregarIndicadorNuevo() {
    setDatos(prev => ({
      ...prev,
      indicadores_nuevos: [...prev.indicadores_nuevos, {
        _key: Date.now(),
        nombre: '',
        tipo: 'Cobertura',
        unidad: 'Numero',
        unidad_personalizada: '',
        meta_global: '',
        descripcion: '',
      }]
    }));
  }

  function actualizarIndicadorNuevo(index, campo, valor) {
    setDatos(prev => ({
      ...prev,
      indicadores_nuevos: prev.indicadores_nuevos.map((ind, i) =>
        i === index ? { ...ind, [campo]: valor } : ind
      )
    }));
  }

  function eliminarIndicadorNuevo(index) {
    setDatos(prev => ({
      ...prev,
      indicadores_nuevos: prev.indicadores_nuevos.filter((_, i) => i !== index)
    }));
  }

  async function manejarSubmit(e) {
    e.preventDefault();
    if (!datos.nombre.trim()) return;
    setEnviando(true);
    try {
      await onGuardar({
        ...datos,
        id_dg: datos.id_dg || null,
        id_direccion_area: datos.id_direccion_area || null,
        id_responsable: datos.id_responsable || null,
        depende_de: datos.depende_de || null,
      });
    } finally {
      setEnviando(false);
    }
  }

  // Indicadores del proyecto
  const indicadores = proyecto?.indicadores || [];

  // DAs filtradas por DG seleccionada
  const dasFiltradas = direccionesArea.filter(da => {
    if (!datos.id_dg) return true;
    const dg = dgs.find(d => String(d.id) === String(datos.id_dg));
    return dg && da.dg_siglas === dg.siglas;
  });

  // Usuarios filtrados por DG seleccionada
  const usuariosFiltrados = usuarios.filter(u => {
    if (!datos.id_dg) return true;
    return String(u.id_dg) === String(datos.id_dg);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Nueva etapa</h2>
          <button onClick={onCerrar} className="p-1 rounded hover:bg-gray-100">
            <X size={18} className="text-gray-400" />
          </button>
        </div>

        <form onSubmit={manejarSubmit} className="p-5 space-y-4">
          {/* Nombre */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de la etapa *</label>
            <input type="text" value={datos.nombre} onChange={e => actualizar('nombre', e.target.value)}
              className="input-base" placeholder="Ej: Análisis de restricción territorial" required />
          </div>

          {/* Descripción */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
            <textarea value={datos.descripcion} onChange={e => actualizar('descripcion', e.target.value)}
              rows={2} className="input-base resize-none" placeholder="Descripción de lo que incluye esta etapa..." />
          </div>

          {/* DG y DA */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">DG responsable</label>
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

          {/* Responsable */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Responsable</label>
            <select value={datos.id_responsable} onChange={e => actualizar('id_responsable', e.target.value)} className="input-base text-sm">
              <option value="">Sin asignar</option>
              {usuariosFiltrados.map(u => (
                <option key={u.id} value={u.id}>{u.nombre_completo} — {u.cargo}</option>
              ))}
            </select>
          </div>

          {/* Depende de */}
          {etapas && etapas.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Depende de (secuencial)</label>
              <select value={datos.depende_de} onChange={e => actualizar('depende_de', e.target.value)} className="input-base text-sm">
                <option value="">Sin dependencia</option>
                {etapas.map(et => (
                  <option key={et.id} value={et.id}>#{et.orden} {et.nombre}</option>
                ))}
              </select>
            </div>
          )}

          {/* ═══ A) Vinculación con indicadores del proyecto ═══ */}
          {indicadores.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vincular indicadores del proyecto</label>
              <p className="text-xs text-gray-400 mb-2">Define cuánto aporta esta etapa a cada indicador global del proyecto.</p>
              <div className="space-y-2">
                {indicadores.map(ind => {
                  const asociado = datos.indicadores_asociados.find(ia => ia.id_indicador === ind.id);
                  const unidadLabel = ind.unidad === 'Porcentaje' ? '%' : ind.unidad === 'Moneda_MXN' ? '$MXN' : ind.unidad_personalizada || '#';

                  return (
                    <div key={ind.id} className={`border rounded-lg p-3 transition-colors ${asociado ? 'border-guinda-300 bg-guinda-50/30' : 'border-gray-200'}`}>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={!!asociado} onChange={() => toggleIndicador(ind.id)}
                          className="rounded border-gray-300 text-guinda-500 focus:ring-guinda-500" />
                        <span className="text-sm text-gray-800 flex-1">
                          {ind.nombre}
                          <span className="text-xs text-gray-400 ml-2">
                            (meta global: {Number(ind.meta_global).toLocaleString()} {unidadLabel})
                          </span>
                        </span>
                      </label>
                      {asociado && (
                        <div className="mt-2 ml-6 flex items-center gap-2">
                          <label className="text-xs text-gray-500">Meta de esta etapa:</label>
                          <input type="number" step="any" value={asociado.meta_etapa}
                            onChange={e => actualizarMetaIndicador(ind.id, e.target.value)}
                            className="input-base text-sm w-32" placeholder="0" />
                          <span className="text-xs text-gray-400">{unidadLabel}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ═══ B) Indicadores propios de la etapa ═══ */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700">Indicadores propios de esta etapa</label>
              <button type="button" onClick={agregarIndicadorNuevo}
                className="text-xs text-guinda-600 hover:text-guinda-800 flex items-center gap-1 font-medium">
                <Plus size={13} /> Agregar indicador
              </button>
            </div>
            <p className="text-xs text-gray-400 mb-2">Indicadores específicos que solo aplican a esta etapa (ej: # documentos revisados).</p>

            {datos.indicadores_nuevos.length === 0 ? (
              <p className="text-xs text-gray-300 italic text-center py-2">Sin indicadores propios</p>
            ) : (
              <div className="space-y-3">
                {datos.indicadores_nuevos.map((ind, idx) => (
                  <div key={ind._key} className="border border-gray-200 rounded-lg p-3 bg-gray-50/50 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <input type="text" value={ind.nombre}
                        onChange={e => actualizarIndicadorNuevo(idx, 'nombre', e.target.value)}
                        className="input-base text-sm flex-1" placeholder="Nombre del indicador *" required />
                      <button type="button" onClick={() => eliminarIndicadorNuevo(idx)}
                        className="p-1 text-gray-400 hover:text-red-500 rounded">
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <select value={ind.tipo} onChange={e => actualizarIndicadorNuevo(idx, 'tipo', e.target.value)}
                        className="input-base text-xs">
                        <option value="Cobertura">Cobertura</option>
                        <option value="Gestion">Gestión</option>
                        <option value="Resultado">Resultado</option>
                        <option value="Impacto">Impacto</option>
                      </select>
                      <select value={ind.unidad} onChange={e => actualizarIndicadorNuevo(idx, 'unidad', e.target.value)}
                        className="input-base text-xs">
                        <option value="Numero">Número</option>
                        <option value="Porcentaje">Porcentaje</option>
                        <option value="Moneda_MXN">Moneda MXN</option>
                        <option value="Otro">Otro</option>
                      </select>
                      <input type="number" step="any" value={ind.meta_global}
                        onChange={e => actualizarIndicadorNuevo(idx, 'meta_global', e.target.value)}
                        className="input-base text-xs" placeholder="Meta" />
                    </div>
                    {ind.unidad === 'Otro' && (
                      <input type="text" value={ind.unidad_personalizada}
                        onChange={e => actualizarIndicadorNuevo(idx, 'unidad_personalizada', e.target.value)}
                        className="input-base text-xs" placeholder="Unidad personalizada" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Botones */}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onCerrar} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={enviando || !datos.nombre.trim()} className="btn-primary">
              {enviando ? 'Creando...' : 'Crear etapa'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
