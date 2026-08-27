/**
 * ARCHIVO: ModalCartera.jsx
 * PROPÓSITO: Formulario modal para crear o editar una cartera de
 *            proyectos. Mismo componente para ambos casos: si recibe
 *            `cartera` (prop), edita; si no, crea.
 */
import { useState, useEffect } from 'react';
import { X, Loader2, Briefcase } from 'lucide-react';
import * as carterasApi from '../../api/carteras';
import * as catalogosApi from '../../api/catalogos';
import { useUI } from '../../context/UIContext';
import { useEnvioUnico } from '../../hooks/useEnvioUnico';

export default function ModalCartera({ cartera, onCerrar, onGuardada }) {
  const { mostrarToast } = useUI();
  const esEdicion = !!cartera;
  const [dgs, setDgs] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [datos, setDatos] = useState({
    nombre: cartera?.nombre || '',
    descripcion: cartera?.descripcion || '',
    id_dg_lider: cartera?.id_dg_lider || '',
    id_responsable: cartera?.id_responsable || '',
    fecha_inicio: cartera?.fecha_inicio ? cartera.fecha_inicio.slice(0, 10) : '',
    fecha_fin: cartera?.fecha_fin ? cartera.fecha_fin.slice(0, 10) : '',
  });

  useEffect(() => {
    Promise.all([catalogosApi.obtenerDGs(), catalogosApi.obtenerUsuarios()])
      .then(([resDgs, resUsuarios]) => {
        setDgs(resDgs.datos);
        setUsuarios(resUsuarios.datos);
      })
      .catch(err => console.error('Error cargando catálogos:', err));
  }, []);

  function actualizar(campo, valor) {
    setDatos(prev => ({ ...prev, [campo]: valor }));
  }

  const [guardar, guardando] = useEnvioUnico(async () => {
    if (!datos.nombre.trim()) {
      mostrarToast('El nombre de la cartera es obligatorio', 'error');
      return;
    }
    try {
      const respuesta = esEdicion
        ? await carterasApi.actualizarCartera(cartera.id, datos)
        : await carterasApi.crearCartera(datos);
      mostrarToast(esEdicion ? 'Cartera actualizada' : 'Cartera creada', 'exito');
      onGuardada?.(respuesta.datos);
    } catch (err) {
      mostrarToast(err.response?.data?.mensaje || 'Error al guardar la cartera', 'error');
    }
  });

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4" onClick={onCerrar}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Briefcase size={17} className="text-guinda-500" />
            <h2 className="text-sm font-bold text-gray-900">{esEdicion ? 'Editar cartera' : 'Nueva cartera'}</h2>
          </div>
          <button onClick={onCerrar} className="p-1 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de la cartera *</label>
            <input type="text" value={datos.nombre} onChange={e => actualizar('nombre', e.target.value)}
              placeholder="Ej: 92 Zonas Metropolitanas" className="input-base" autoFocus />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
            <textarea value={datos.descripcion} onChange={e => actualizar('descripcion', e.target.value)}
              rows={2} className="input-base resize-none" placeholder="Describe brevemente qué agrupa esta cartera..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Dependencia líder</label>
              <select value={datos.id_dg_lider} onChange={e => actualizar('id_dg_lider', e.target.value)} className="input-base">
                <option value="">Sin especificar</option>
                {dgs.map(dg => <option key={dg.id} value={dg.id}>{dg.siglas}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Responsable</label>
              <select value={datos.id_responsable} onChange={e => actualizar('id_responsable', e.target.value)} className="input-base">
                <option value="">Sin especificar</option>
                {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre_completo}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Periodo — inicio</label>
              <input type="date" value={datos.fecha_inicio} onChange={e => actualizar('fecha_inicio', e.target.value)} className="input-base" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Periodo — fin</label>
              <input type="date" value={datos.fecha_fin} onChange={e => actualizar('fecha_fin', e.target.value)} className="input-base" />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-gray-100 bg-gray-50 rounded-b-xl">
          <button onClick={onCerrar} className="px-3.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg">
            Cancelar
          </button>
          <button onClick={guardar} disabled={guardando || !datos.nombre.trim()}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium bg-guinda-500 text-white rounded-lg hover:bg-guinda-600 disabled:opacity-40 disabled:cursor-not-allowed">
            {guardando && <Loader2 size={12} className="animate-spin" />}
            {esEdicion ? 'Guardar cambios' : 'Crear cartera'}
          </button>
        </div>
      </div>
    </div>
  );
}
