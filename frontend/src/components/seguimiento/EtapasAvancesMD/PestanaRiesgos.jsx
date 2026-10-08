/**
 * ARCHIVO: PestanaRiesgos.jsx
 * PROPÓSITO: Pestaña "Riesgos" del panel de Detalle (Fase 4) — tabla de
 *            consulta con alta propia (abre el mismo ModalRiesgo que antes
 *            vivía en "Más acciones"). Los endpoints de riesgos por etapa/
 *            acción ya agregaban descendientes de origen (confirmado antes
 *            de esta fase) — aquí solo se expone el control "Solo este
 *            elemento / Incluir elementos hijos" y la columna "Origen"
 *            que ya trae el backend.
 */
import { useEffect, useState, useCallback } from 'react';
import { Plus, Loader2, AlertTriangle } from 'lucide-react';
import * as riesgosApi from '../../../api/riesgos';
import ModalRiesgo from '../../riesgos/ModalRiesgo';
import { formatFecha } from '../../../utils/fecha';

const NIVEL_LABEL = { etapa: 'Etapa', accion: 'Acción', tarea: 'Tarea', subaccion: 'Acción' };
const ENTIDAD_TIPO_RIESGO = { etapa: 'Etapa', accion: 'Accion', tarea: 'Tarea' };
const NIVEL_COLOR = { Critico: 'bg-red-100 text-red-700', Alto: 'bg-orange-100 text-orange-700', Medio: 'bg-amber-100 text-amber-700', Bajo: 'bg-gray-100 text-gray-600' };
const ESTADO_COLOR = { Abierto: 'bg-red-50 text-red-600', En_mitigacion: 'bg-amber-50 text-amber-600', Resuelto: 'bg-green-50 text-green-600', Cerrado: 'bg-gray-100 text-gray-500' };

async function obtenerPorTipo(tipo, id, incluirHijos) {
  if (tipo === 'etapa') return riesgosApi.obtenerRiesgosEtapa(id, incluirHijos);
  if (tipo === 'tarea') return riesgosApi.obtenerRiesgosTarea(id);
  return riesgosApi.obtenerRiesgosAccion(id, incluirHijos);
}

export default function PestanaRiesgos({ tipo, id, permisos, onCambiado, mostrarToast, onContador, onNavegarNodo, altaSolicitada, onAltaConsumida }) {
  const [incluirHijos, setIncluirHijos] = useState(true);
  const [riesgos, setRiesgos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [mostrarAlta, setMostrarAlta] = useState(false);
  const [riesgoEditando, setRiesgoEditando] = useState(null);

  // Atajo "Reportar riesgo" de "Más acciones" (FilaAcciones.jsx vía
  // PestanasDetalle.jsx) — mismo modal que el botón "+ Reportar riesgo"
  // de aquí abajo, solo que disparado desde fuera de esta pestaña.
  useEffect(() => {
    if (altaSolicitada) { setMostrarAlta(true); onAltaConsumida?.(); }
  }, [altaSolicitada, onAltaConsumida]);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await obtenerPorTipo(tipo, id, incluirHijos);
      const datos = res.datos || [];
      setRiesgos(datos);
      if (incluirHijos) onContador?.(datos.length);
    } catch {
      setRiesgos([]);
      if (incluirHijos) onContador?.(0);
    } finally {
      setCargando(false);
    }
  }, [tipo, id, incluirHijos, onContador]);

  useEffect(() => { cargar(); }, [cargar]);

  async function crear(datosForm) {
    await riesgosApi.crearRiesgo(datosForm);
    setMostrarAlta(false);
    mostrarToast?.('Riesgo reportado', 'exito');
    await cargar();
    onCambiado?.();
  }

  // Clic en una fila — la tabla solo trae lo necesario para listar (título,
  // nivel, estado...), así que hace falta traer el riesgo completo (causa,
  // impacto, medida de mitigación, responsable...) antes de poder editarlo.
  async function abrirRiesgo(riesgoId) {
    try {
      const { datos } = await riesgosApi.obtenerRiesgo(riesgoId);
      setRiesgoEditando(datos);
    } catch (err) {
      mostrarToast?.(err.response?.data?.mensaje || 'No se pudo abrir el riesgo', 'error');
    }
  }

  async function guardarRiesgoEditado(datosForm) {
    await riesgosApi.actualizarRiesgo(riesgoEditando.id, datosForm);
    setRiesgoEditando(null);
    mostrarToast?.('Riesgo actualizado', 'exito');
    await cargar();
    onCambiado?.();
  }

  const soloLectura = permisos?.esSoloLectura ?? true;

  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        {tipo !== 'tarea' ? (
          <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50">
            <button
              onClick={() => setIncluirHijos(false)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${!incluirHijos ? 'bg-white text-guinda-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Solo este elemento
            </button>
            <button
              onClick={() => setIncluirHijos(true)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${incluirHijos ? 'bg-white text-guinda-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Incluir elementos hijos
            </button>
          </div>
        ) : <div />}
        <button
          disabled={soloLectura}
          onClick={() => setMostrarAlta(true)}
          title={soloLectura ? 'Sin permiso para reportar riesgos en este elemento' : undefined}
          className="flex items-center gap-1 text-[12px] font-medium text-guinda-700 hover:text-guinda-800 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus size={13} /> Reportar riesgo
        </button>
      </div>

      {cargando ? (
        <p className="text-xs text-gray-400 py-4 flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Cargando riesgos...</p>
      ) : (riesgos || []).length === 0 ? (
        <p className="text-xs text-gray-400 py-4">Sin riesgos registrados.</p>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="text-left font-medium px-3 py-2">Riesgo</th>
                <th className="text-left font-medium px-3 py-2">Nivel</th>
                <th className="text-left font-medium px-3 py-2">Estado</th>
                <th className="text-left font-medium px-3 py-2">Responsable</th>
                <th className="text-left font-medium px-3 py-2">Fecha límite</th>
                <th className="text-left font-medium px-3 py-2">Origen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {riesgos.map(r => (
                <tr key={r.id} onClick={() => abrirRiesgo(r.id)} className="hover:bg-gray-50 cursor-pointer">
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-1.5 text-gray-700 font-medium">
                      <AlertTriangle size={12} className="text-amber-500 flex-shrink-0" />
                      <span className="truncate max-w-[220px]">{r.titulo}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${NIVEL_COLOR[r.nivel] || 'bg-gray-100 text-gray-600'}`}>{r.nivel}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${ESTADO_COLOR[r.estado] || 'bg-gray-100 text-gray-600'}`}>{(r.estado || '').replace('_', ' ')}</span>
                  </td>
                  <td className="px-3 py-2 text-gray-500">{r.responsable_nombre || 'Sin asignar'}</td>
                  <td className="px-3 py-2 text-gray-500">{formatFecha(r.fecha_limite_resolucion) || 'Sin definir'}</td>
                  <td className="px-3 py-2">
                    {r.origen ? (
                      <button
                        onClick={e => { e.stopPropagation(); onNavegarNodo?.(r.origen.tipo === 'Subaccion' ? 'accion' : (r.origen.tipo || '').toLowerCase(), r.origen.id); }}
                        className="text-[11px] text-gray-500 hover:text-guinda-700 hover:underline"
                      >
                        {NIVEL_LABEL[(r.origen.tipo || '').toLowerCase()] || r.origen.tipo} · {r.origen.nombre || 'Sin nombre'}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {mostrarAlta && (
        <ModalRiesgo
          entidadTipo={ENTIDAD_TIPO_RIESGO[tipo]}
          entidadId={id}
          onGuardar={crear}
          onCerrar={() => setMostrarAlta(false)}
        />
      )}

      {/* entidadTipo/entidadId del riesgo mismo (no del nodo que se está
          viendo aquí): con "Incluir elementos hijos" la tabla agrega
          riesgos de descendientes — usar tipo/id del nodo actual los
          habría reasignado en silencio al guardar. */}
      {riesgoEditando && (
        <ModalRiesgo
          riesgo={riesgoEditando}
          entidadTipo={riesgoEditando.entidad_tipo}
          entidadId={riesgoEditando.entidad_id}
          onGuardar={guardarRiesgoEditado}
          onCerrar={() => setRiesgoEditando(null)}
        />
      )}
    </div>
  );
}
