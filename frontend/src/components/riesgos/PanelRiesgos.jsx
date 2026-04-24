/**
 * ARCHIVO: PanelRiesgos.jsx
 * PROPÓSITO: Panel reutilizable que lista riesgos de cualquier entidad
 *            con botón para crear nuevos y editar existentes.
 *
 * MINI-CLASE: Panel polimórfico de riesgos
 * ─────────────────────────────────────────────────────────────────
 * Recibe entidadTipo + entidadId y carga los riesgos correspondientes
 * usando el endpoint correcto según el nivel jerárquico. Muestra
 * RiesgoCard para cada riesgo con opción de editar/eliminar. Abre
 * ModalRiesgo para crear o editar.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useCallback } from 'react';
import { Plus, Shield, AlertTriangle } from 'lucide-react';
import RiesgoCard from './RiesgoCard';
import ModalRiesgo from './ModalRiesgo';
import * as riesgosApi from '../../api/riesgos';

const CARGADORES = {
  Proyecto:  (id) => riesgosApi.obtenerRiesgosProyecto(id),
  Etapa:     (id) => riesgosApi.obtenerRiesgosEtapa(id),
  Accion:    (id) => riesgosApi.obtenerRiesgosAccion(id),
  Subaccion: (id) => riesgosApi.obtenerRiesgosSubaccion(id),
};

/**
 * @param {string}  entidadTipo  - 'Proyecto'|'Etapa'|'Accion'|'Subaccion'
 * @param {string}  entidadId    - UUID de la entidad
 * @param {boolean} soloLectura  - Deshabilita crear/editar/eliminar
 * @param {boolean} compacto     - Usa RiesgoCard en modo compacto
 */
export default function PanelRiesgos({ entidadTipo, entidadId, soloLectura = false, compacto = false }) {
  const [riesgos, setRiesgos] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [modal, setModal] = useState(null); // null | 'crear' | riesgoObj

  const cargar = useCallback(async () => {
    if (!entidadId || !CARGADORES[entidadTipo]) return;
    setCargando(true);
    try {
      const res = await CARGADORES[entidadTipo](entidadId);
      setRiesgos(res.datos || []);
    } catch {
      setRiesgos([]);
    } finally {
      setCargando(false);
    }
  }, [entidadTipo, entidadId]);

  useEffect(() => { cargar(); }, [cargar]);

  async function handleGuardar(datos) {
    if (modal && modal !== 'crear') {
      await riesgosApi.actualizarRiesgo(modal.id, datos);
    } else {
      await riesgosApi.crearRiesgo(datos);
    }
    setModal(null);
    await cargar();
  }

  async function handleEliminar(riesgoId) {
    if (!window.confirm('¿Eliminar este riesgo?')) return;
    try {
      await riesgosApi.eliminarRiesgo(riesgoId);
      await cargar();
    } catch (err) {
      alert(err.response?.data?.mensaje || 'Error al eliminar');
    }
  }

  const abiertos = riesgos.filter(r => !['Resuelto', 'Cerrado'].includes(r.estado));
  const resueltos = riesgos.filter(r => ['Resuelto', 'Cerrado'].includes(r.estado));

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Shield size={14} className="text-orange-500" />
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Riesgos y problemas
          </span>
          {riesgos.length > 0 && (
            <span className="text-[10px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full font-medium">
              {abiertos.length} abierto{abiertos.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        {!soloLectura && (
          <button
            onClick={() => setModal('crear')}
            className="flex items-center gap-1 text-xs text-guinda-600 hover:text-guinda-700 font-medium"
          >
            <Plus size={14} /> Registrar
          </button>
        )}
      </div>

      {/* Lista */}
      {cargando ? (
        <p className="text-xs text-gray-400 animate-pulse py-2">Cargando riesgos…</p>
      ) : riesgos.length === 0 ? (
        <p className="text-xs text-gray-300 py-2">Sin riesgos registrados</p>
      ) : (
        <div className="space-y-2">
          {abiertos.map(r => (
            <div key={r.id} className="group relative">
              <button
                onClick={() => !soloLectura && setModal(r)}
                className="w-full text-left"
              >
                <RiesgoCard riesgo={r} compacto={compacto} />
              </button>
              {!soloLectura && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleEliminar(r.id); }}
                  className="absolute top-2 right-2 text-gray-300 hover:text-red-500 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Eliminar"
                >
                  ✕
                </button>
              )}
            </div>
          ))}

          {resueltos.length > 0 && (
            <details className="mt-2">
              <summary className="text-[10px] text-gray-400 cursor-pointer hover:text-gray-600">
                {resueltos.length} resuelto{resueltos.length !== 1 ? 's' : ''}/cerrado{resueltos.length !== 1 ? 's' : ''}
              </summary>
              <div className="space-y-2 mt-2 opacity-60">
                {resueltos.map(r => (
                  <button key={r.id} onClick={() => !soloLectura && setModal(r)} className="w-full text-left">
                    <RiesgoCard riesgo={r} compacto={compacto} />
                  </button>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* Modal crear/editar */}
      {modal && (
        <ModalRiesgo
          riesgo={modal !== 'crear' ? modal : null}
          entidadTipo={entidadTipo}
          entidadId={entidadId}
          onGuardar={handleGuardar}
          onCerrar={() => setModal(null)}
        />
      )}
    </div>
  );
}
