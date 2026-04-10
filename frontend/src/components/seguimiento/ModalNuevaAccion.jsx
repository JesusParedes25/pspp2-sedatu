/**
 * ARCHIVO: ModalNuevaAccion.jsx
 * PROPÓSITO: Modal para crear una nueva acción, ya sea dentro de una
 *            etapa o directamente en el proyecto.
 *
 * MINI-CLASE: Acciones y su vínculo con indicadores
 * ─────────────────────────────────────────────────────────────────
 * Una acción es la unidad atómica de trabajo. Es el ÚNICO nivel
 * donde el porcentaje se edita manualmente. Cada acción puede
 * vincularse a indicadores de nivel proyecto O de nivel etapa vía
 * la tabla accion_indicador. Cuando se crea dentro de una etapa,
 * el modal muestra ambos grupos para elegir.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import * as catalogosApi from '../../api/catalogos';
import * as etapasApi from '../../api/etapas';
import { useAuth } from '../../context/AuthContext';

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

  function actualizar(campo, valor) {
    setDatos(prev => ({ ...prev, [campo]: valor }));
  }

  function toggleIndicador(indicadorId) {
    setDatos(prev => {
      const existe = prev.indicadores_asociados.find(ia => ia.id_indicador === indicadorId);
      if (existe) {
        return { ...prev, indicadores_asociados: prev.indicadores_asociados.filter(ia => ia.id_indicador !== indicadorId) };
      }
      return { ...prev, indicadores_asociados: [...prev.indicadores_asociados, { id_indicador: indicadorId }] };
    });
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

  const indicadoresProyecto = proyecto?.indicadores || [];
  const todosIndicadores = [...indicadoresProyecto, ...indicadoresEtapa];

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

          {/* Vinculación con indicadores (proyecto + etapa) */}
          {todosIndicadores.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Indicadores asociados</label>
              <p className="text-xs text-gray-400 mb-2">Marca los indicadores a los que esta acción contribuirá.</p>
              <div className="space-y-1.5">
                {indicadoresProyecto.length > 0 && (
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Indicadores del proyecto</p>
                )}
                {indicadoresProyecto.map(ind => {
                  const asociado = datos.indicadores_asociados.find(ia => ia.id_indicador === ind.id);
                  const unidadLabel = ind.unidad === 'Porcentaje' ? '%' : ind.unidad === 'Moneda_MXN' ? '$MXN' : ind.unidad_personalizada || '#';
                  return (
                    <label key={ind.id} className={`flex items-center gap-2 p-2 border rounded-lg cursor-pointer transition-colors ${asociado ? 'border-guinda-300 bg-guinda-50/30' : 'border-gray-200 hover:border-gray-300'}`}>
                      <input type="checkbox" checked={!!asociado} onChange={() => toggleIndicador(ind.id)}
                        className="rounded border-gray-300 text-guinda-500 focus:ring-guinda-500" />
                      <span className="text-sm text-gray-800 flex-1">
                        {ind.nombre}
                        <span className="text-xs text-gray-400 ml-1">({Number(ind.meta_global).toLocaleString()} {unidadLabel})</span>
                      </span>
                    </label>
                  );
                })}
                {indicadoresEtapa.length > 0 && (
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mt-2">Indicadores de la etapa</p>
                )}
                {indicadoresEtapa.map(ind => {
                  const asociado = datos.indicadores_asociados.find(ia => ia.id_indicador === ind.id);
                  const unidadLabel = ind.unidad === 'Porcentaje' ? '%' : ind.unidad === 'Moneda_MXN' ? '$MXN' : ind.unidad_personalizada || '#';
                  return (
                    <label key={ind.id} className={`flex items-center gap-2 p-2 border rounded-lg cursor-pointer transition-colors ${asociado ? 'border-amber-300 bg-amber-50/30' : 'border-gray-200 hover:border-gray-300'}`}>
                      <input type="checkbox" checked={!!asociado} onChange={() => toggleIndicador(ind.id)}
                        className="rounded border-gray-300 text-amber-500 focus:ring-amber-500" />
                      <span className="text-sm text-gray-800 flex-1">
                        {ind.nombre}
                        <span className="text-xs text-amber-500 ml-1">(etapa · {Number(ind.meta_global).toLocaleString()} {unidadLabel})</span>
                      </span>
                    </label>
                  );
                })}
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
