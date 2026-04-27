/**
 * ARCHIVO: ModalEditarAccion.jsx
 * PROPÓSITO: Modal para editar una acción o subacción existente.
 *            Permite modificar nombre, descripción, tipo, fechas,
 *            responsable, DG y dirección de área.
 *
 * MINI-CLASE: Reutilización del formulario de acción
 * ─────────────────────────────────────────────────────────────────
 * Comparte la misma estructura visual que ModalNuevaAccion pero
 * pre-carga los datos existentes de la acción y llama a
 * PUT /acciones/:id al guardar.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import * as catalogosApi from '../../api/catalogos';
import * as accionesApi from '../../api/acciones';

export default function ModalEditarAccion({ accion, onGuardado, onCerrar }) {
  const [dgs, setDgs] = useState([]);
  const [direccionesArea, setDireccionesArea] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [cargando, setCargando] = useState(true);

  const fmtFecha = (f) => f ? new Date(f).toISOString().split('T')[0] : '';

  const [datos, setDatos] = useState({
    nombre: accion.nombre || '',
    descripcion: accion.descripcion || '',
    tipo: accion.tipo || 'Accion_programada',
    fecha_inicio: fmtFecha(accion.fecha_inicio),
    fecha_fin: fmtFecha(accion.fecha_fin),
    id_dg: accion.id_dg || '',
    id_direccion_area: accion.id_direccion_area || '',
    id_responsable: accion.id_responsable || '',
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
      } finally {
        setCargando(false);
      }
    }
    cargar();
  }, []);

  function actualizar(campo, valor) {
    setDatos(prev => ({ ...prev, [campo]: valor }));
  }

  async function manejarSubmit(e) {
    e.preventDefault();
    if (!datos.nombre.trim()) return;
    setEnviando(true);
    try {
      await accionesApi.actualizarAccion(accion.id, {
        ...datos,
        id_dg: datos.id_dg || null,
        id_direccion_area: datos.id_direccion_area || null,
        id_responsable: datos.id_responsable || null,
      });
      onGuardado && onGuardado();
      onCerrar();
    } catch (err) {
      alert(err.response?.data?.mensaje || 'Error al guardar');
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

  const esSubaccion = !!accion.id_accion_padre;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {esSubaccion ? 'Editar tarea' : 'Editar acción'}
          </h2>
          <button onClick={onCerrar} className="p-1 rounded hover:bg-gray-100">
            <X size={18} className="text-gray-400" />
          </button>
        </div>

        {cargando ? (
          <div className="p-8 text-center text-sm text-gray-400 animate-pulse">Cargando datos…</div>
        ) : (
          <form onSubmit={manejarSubmit} className="p-5 space-y-4">
            {/* Nombre */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
              <input type="text" value={datos.nombre} onChange={e => actualizar('nombre', e.target.value)}
                className="input-base" placeholder="Nombre de la acción" required />
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
                <label className="block text-xs font-medium text-gray-600 mb-1">Fecha inicio</label>
                <input type="date" value={datos.fecha_inicio} onChange={e => actualizar('fecha_inicio', e.target.value)}
                  className="input-base text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fecha fin</label>
                <input type="date" value={datos.fecha_fin} onChange={e => actualizar('fecha_fin', e.target.value)}
                  className="input-base text-sm" />
              </div>
            </div>

            {/* DG y DA */}
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

            {/* Botones */}
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onCerrar} className="btn-secondary">Cancelar</button>
              <button type="submit" disabled={enviando || !datos.nombre.trim()} className="btn-primary">
                {enviando ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
