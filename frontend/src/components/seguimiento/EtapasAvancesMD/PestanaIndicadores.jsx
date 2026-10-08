/**
 * ARCHIVO: PestanaIndicadores.jsx
 * PROPÓSITO: Pestaña "Indicadores" del panel de Detalle (Fase 4) — tabla
 *            de consulta con alta propia (reusa TabIndicadores dentro del
 *            modal "Vincular indicador"), agregando por omisión las
 *            aportaciones de los descendientes del nodo con columna
 *            "Origen" y el control "Solo este elemento / Incluir
 *            elementos hijos".
 */
import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Loader2, BarChart3 } from 'lucide-react';
import * as indicadoresApi from '../../../api/indicadores';
import ModalAccionNodo from './ModalAccionNodo';
import TabIndicadores from '../TabIndicadores';

const NIVEL_LABEL = { etapa: 'Etapa', accion: 'Acción', tarea: 'Tarea' };
const MODO_LABEL = { proporcional: 'Proporcional al avance', al_concluir: 'Al concluir' };

function etiquetaUnidad(ap) {
  if (ap.unidad === 'Otra' || ap.unidad === 'Personalizada') return ap.etiqueta_unidad || ap.unidad_personalizada || '';
  return ap.unidad_personalizada || ap.unidad || '';
}

export default function PestanaIndicadores({ tipo, id, nodo, proyectoId, permisos, onCambiado, mostrarToast, onContador, onNavegarNodo, altaSolicitada, onAltaConsumida }) {
  const [incluirHijos, setIncluirHijos] = useState(true);
  const [aportaciones, setAportaciones] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [mostrarAlta, setMostrarAlta] = useState(false);

  // Atajo "Vincular indicador" de "Más acciones" (FilaAcciones.jsx vía
  // PestanasDetalle.jsx) — mismo modal que el botón "+ Vincular indicador"
  // de aquí abajo, solo que disparado desde fuera de esta pestaña.
  useEffect(() => {
    if (altaSolicitada) { setMostrarAlta(true); onAltaConsumida?.(); }
  }, [altaSolicitada, onAltaConsumida]);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await indicadoresApi.obtenerAportacionesNodo(tipo, id, incluirHijos);
      const datos = res.datos || [];
      setAportaciones(datos);
      if (incluirHijos) onContador?.(datos.length);
    } catch {
      setAportaciones([]);
      if (incluirHijos) onContador?.(0);
    } finally {
      setCargando(false);
    }
  }, [tipo, id, incluirHijos, onContador]);

  useEffect(() => { cargar(); }, [cargar]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
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
        {!permisos?.esSoloLectura && (
          <button
            onClick={() => setMostrarAlta(true)}
            className="flex items-center gap-1 text-[12px] font-medium text-guinda-700 hover:text-guinda-800"
          >
            <Plus size={13} /> Vincular indicador
          </button>
        )}
      </div>

      {cargando ? (
        <p className="text-xs text-gray-400 py-4 flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Cargando indicadores...</p>
      ) : (aportaciones || []).length === 0 ? (
        <p className="text-xs text-gray-400 py-4">Este elemento no aporta a ningún indicador.</p>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="text-left font-medium px-3 py-2">Indicador</th>
                <th className="text-left font-medium px-3 py-2">Aportación</th>
                <th className="text-left font-medium px-3 py-2">Modo</th>
                <th className="text-left font-medium px-3 py-2">Origen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {aportaciones.map(ap => (
                <tr key={ap.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <Link to={`/indicadores/${ap.id_indicador}`} className="flex items-center gap-1.5 text-gray-700 hover:text-guinda-700 font-medium">
                      <BarChart3 size={12} className="text-gray-400 flex-shrink-0" />
                      <span className="truncate max-w-[220px]">{ap.indicador_nombre}</span>
                      {ap.categoria_nombre && <span className="text-[10px] text-gray-400">· {ap.categoria_nombre}</span>}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-gray-600">
                    {Number(ap.aportacion).toLocaleString('es-MX')}{etiquetaUnidad(ap) ? ` ${etiquetaUnidad(ap)}` : ''}
                  </td>
                  <td className="px-3 py-2 text-gray-500">{MODO_LABEL[ap.modo] || ap.modo}</td>
                  <td className="px-3 py-2">
                    {ap.origen ? (
                      <button
                        onClick={() => onNavegarNodo?.(ap.origen.tipo, ap.origen.id)}
                        className="text-[11px] text-gray-500 hover:text-guinda-700 hover:underline"
                      >
                        {NIVEL_LABEL[ap.origen.tipo] || ap.origen.tipo} · {ap.origen.nombre || 'Sin nombre'}
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
        <ModalAccionNodo titulo="Vincular indicador" onCerrar={() => { setMostrarAlta(false); cargar(); onCambiado?.(); }}>
          <TabIndicadores tipo={tipo} nodoId={id} nodoNombre={nodo?.nombre} proyectoId={proyectoId} soloLectura={permisos?.esSoloLectura} />
        </ModalAccionNodo>
      )}
    </div>
  );
}
