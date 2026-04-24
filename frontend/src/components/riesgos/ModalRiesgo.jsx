/**
 * ARCHIVO: ModalRiesgo.jsx
 * PROPÓSITO: Modal reutilizable para crear o editar un riesgo/problema.
 *
 * MINI-CLASE: Formularios con modo crear/editar
 * ─────────────────────────────────────────────────────────────────
 * Si recibe prop `riesgo`, entra en modo edición y pre-rellena
 * los campos. Si no, entra en modo creación. El formulario valida
 * campos obligatorios antes de enviar. Soporta cualquier nivel
 * jerárquico gracias a entidad_tipo + entidad_id.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

const TIPOS = ['Riesgo', 'Problema'];
const NIVELES = ['Bajo', 'Medio', 'Alto', 'Critico'];
const ESTADOS_RIESGO = ['Abierto', 'En_mitigacion', 'Resuelto', 'Cerrado'];

const NIVEL_COLORES = {
  Bajo:    'bg-green-100 text-green-700',
  Medio:   'bg-yellow-100 text-yellow-700',
  Alto:    'bg-orange-100 text-orange-700',
  Critico: 'bg-red-100 text-red-700',
};

/**
 * @param {object}   riesgo       - Riesgo existente (modo edición) o null (modo creación)
 * @param {string}   entidadTipo  - 'Proyecto'|'Etapa'|'Accion'|'Subaccion'
 * @param {string}   entidadId    - UUID de la entidad padre
 * @param {function} onGuardar    - Recibe los datos del formulario
 * @param {function} onCerrar     - Cierra el modal
 */
export default function ModalRiesgo({ riesgo, entidadTipo, entidadId, onGuardar, onCerrar }) {
  const editando = !!riesgo;

  const [form, setForm] = useState({
    titulo: '',
    descripcion: '',
    causa: '',
    impacto: '',
    nivel: 'Medio',
    tipo: 'Riesgo',
    estado: 'Abierto',
    medida_mitigacion: '',
    fecha_limite_resolucion: '',
  });
  const [errores, setErrores] = useState({});
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (riesgo) {
      setForm({
        titulo: riesgo.titulo || '',
        descripcion: riesgo.descripcion || '',
        causa: riesgo.causa || '',
        impacto: riesgo.impacto || '',
        nivel: riesgo.nivel || 'Medio',
        tipo: riesgo.tipo || 'Riesgo',
        estado: riesgo.estado || 'Abierto',
        medida_mitigacion: riesgo.medida_mitigacion || '',
        fecha_limite_resolucion: riesgo.fecha_limite_resolucion
          ? riesgo.fecha_limite_resolucion.substring(0, 10)
          : '',
      });
    }
  }, [riesgo]);

  function cambiarCampo(campo, valor) {
    setForm(prev => ({ ...prev, [campo]: valor }));
    if (errores[campo]) setErrores(prev => ({ ...prev, [campo]: null }));
  }

  function validar() {
    const e = {};
    if (!form.titulo.trim()) e.titulo = 'El título es obligatorio';
    if (!form.nivel) e.nivel = 'El nivel es obligatorio';
    if (!form.tipo) e.tipo = 'El tipo es obligatorio';
    setErrores(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(ev) {
    ev.preventDefault();
    if (!validar()) return;
    setGuardando(true);
    try {
      const datos = {
        ...form,
        entidad_tipo: entidadTipo,
        entidad_id: entidadId,
        fecha_limite_resolucion: form.fecha_limite_resolucion || null,
      };
      await onGuardar(datos);
    } catch (err) {
      setErrores({ _general: err.response?.data?.mensaje || err.message || 'Error al guardar' });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">
            {editando ? 'Editar riesgo' : 'Nuevo riesgo'}
          </h3>
          <button onClick={onCerrar} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        {/* Form scrollable */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {errores._general && (
            <div className="px-3 py-2 bg-red-50 text-red-700 text-sm rounded-lg">{errores._general}</div>
          )}

          {/* Título */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Título *</label>
            <input
              type="text"
              value={form.titulo}
              onChange={e => cambiarCampo('titulo', e.target.value)}
              className={`w-full h-9 px-3 text-sm border rounded-lg outline-none focus:ring-2 ${
                errores.titulo ? 'border-red-400 focus:ring-red-300' : 'border-gray-300 focus:ring-blue-300'
              }`}
              placeholder="Ej: Retraso en aprobación de presupuesto"
            />
            {errores.titulo && <p className="text-xs text-red-500 mt-0.5">{errores.titulo}</p>}
          </div>

          {/* Tipo + Nivel (inline) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tipo *</label>
              <div className="flex gap-2">
                {TIPOS.map(t => (
                  <button key={t} type="button"
                    onClick={() => cambiarCampo('tipo', t)}
                    className={`flex-1 h-9 text-sm rounded-lg border font-medium transition-colors ${
                      form.tipo === t
                        ? 'bg-guinda-50 border-guinda-300 text-guinda-700'
                        : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                    }`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nivel *</label>
              <div className="flex gap-1.5">
                {NIVELES.map(n => (
                  <button key={n} type="button"
                    onClick={() => cambiarCampo('nivel', n)}
                    className={`flex-1 h-9 text-xs rounded-lg border font-medium transition-colors ${
                      form.nivel === n
                        ? `${NIVEL_COLORES[n]} border-current`
                        : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                    }`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Estado (solo en edición) */}
          {editando && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Estado</label>
              <div className="flex gap-1.5">
                {ESTADOS_RIESGO.map(e => (
                  <button key={e} type="button"
                    onClick={() => cambiarCampo('estado', e)}
                    className={`flex-1 h-9 text-xs rounded-lg border font-medium transition-colors ${
                      form.estado === e
                        ? 'bg-blue-50 border-blue-300 text-blue-700'
                        : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                    }`}>
                    {e.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Descripción */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Descripción</label>
            <textarea
              value={form.descripcion}
              onChange={e => cambiarCampo('descripcion', e.target.value)}
              rows={2}
              className="w-full border border-gray-300 rounded-lg p-3 text-sm resize-none outline-none focus:ring-2 focus:ring-blue-300"
              placeholder="Describe el riesgo o problema..."
            />
          </div>

          {/* Causa + Impacto */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Causa</label>
              <textarea
                value={form.causa}
                onChange={e => cambiarCampo('causa', e.target.value)}
                rows={2}
                className="w-full border border-gray-300 rounded-lg p-3 text-sm resize-none outline-none focus:ring-2 focus:ring-blue-300"
                placeholder="¿Qué lo causa?"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Impacto</label>
              <textarea
                value={form.impacto}
                onChange={e => cambiarCampo('impacto', e.target.value)}
                rows={2}
                className="w-full border border-gray-300 rounded-lg p-3 text-sm resize-none outline-none focus:ring-2 focus:ring-blue-300"
                placeholder="¿Qué efecto tiene?"
              />
            </div>
          </div>

          {/* Medida de mitigación */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Medida de mitigación</label>
            <textarea
              value={form.medida_mitigacion}
              onChange={e => cambiarCampo('medida_mitigacion', e.target.value)}
              rows={2}
              className="w-full border border-gray-300 rounded-lg p-3 text-sm resize-none outline-none focus:ring-2 focus:ring-blue-300"
              placeholder="¿Cómo se mitiga?"
            />
          </div>

          {/* Fecha límite */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Fecha límite de resolución</label>
            <input
              type="date"
              value={form.fecha_limite_resolucion}
              onChange={e => cambiarCampo('fecha_limite_resolucion', e.target.value)}
              className="h-9 px-3 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
        </form>

        {/* Footer */}
        <div className="flex gap-3 justify-end px-5 py-4 border-t border-gray-100">
          <button type="button" onClick={onCerrar}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
            Cancelar
          </button>
          <button type="submit" disabled={guardando}
            onClick={handleSubmit}
            className="px-4 py-2 text-sm bg-guinda-500 text-white rounded-lg hover:bg-guinda-600 disabled:opacity-50 font-medium">
            {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear riesgo'}
          </button>
        </div>
      </div>
    </div>
  );
}
