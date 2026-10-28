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
import { Plus, Loader2, BarChart3, TrendingUp, AlertTriangle } from 'lucide-react';
import * as indicadoresApi from '../../../api/indicadores';
import ModalAccionNodo from './ModalAccionNodo';
import TabIndicadores from '../TabIndicadores';
import ModalRegistrarMovimiento from '../../indicadores/ModalRegistrarMovimiento';
import { MODOS_APORTACION, tieneCantidadValida } from '../../indicadores/ChipAportacion';

const NIVEL_LABEL = { etapa: 'Etapa', accion: 'Acción', tarea: 'Tarea' };

function etiquetaModo(modo) {
  return MODOS_APORTACION.find(m => m.valor === modo)?.etiqueta || modo;
}

function etiquetaUnidad(ap) {
  if (ap.unidad === 'Otra' || ap.unidad === 'Personalizada') return ap.etiqueta_unidad || ap.unidad_personalizada || '';
  return ap.unidad_personalizada || ap.unidad || '';
}

// Corregir, en el lugar, una aportación que quedó sin cantidad (0 o
// nula) — sin esto, la única forma de arreglarla era a través del
// editor del chip en la otra pantalla ("Indicadores" dentro del nodo).
// Solo para la aportación de ESTE nodo (ver gating de "Registrar" más
// abajo): la de un descendiente se corrige desde su propio nodo.
function CorregirCantidad({ ap, onCorregido }) {
  const [valor, setValor] = useState('');
  const [guardando, setGuardando] = useState(false);
  const esValido = Number(valor) > 0;

  async function guardar() {
    if (!esValido) return;
    setGuardando(true);
    try {
      await indicadoresApi.actualizarAportacion(ap.id, { valor_aportacion: parseFloat(valor) });
      onCorregido();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="number" step="any" min="0"
        value={valor}
        onChange={e => setValor(e.target.value)}
        placeholder="cantidad"
        className="w-20 text-[11px] border border-amber-300 rounded px-1.5 py-0.5 focus:border-guinda-500 outline-none"
      />
      <button
        onClick={guardar}
        disabled={guardando || !esValido}
        className="text-[11px] font-medium text-guinda-700 hover:underline disabled:opacity-40 disabled:no-underline"
      >
        Guardar
      </button>
    </span>
  );
}

export default function PestanaIndicadores({ tipo, id, nodo, proyectoId, permisos, onCambiado, mostrarToast, onContador, onNavegarNodo, altaSolicitada, onAltaConsumida }) {
  const [incluirHijos, setIncluirHijos] = useState(true);
  const [aportaciones, setAportaciones] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [mostrarAlta, setMostrarAlta] = useState(false);
  // Indicador al que se le va a registrar un movimiento a mano (Bloque 4
  // del encargo) — null = modal cerrado. Se guarda la aportación
  // completa, no solo el id, porque el modal necesita el nombre del
  // indicador para el encabezado.
  const [registrandoMovimiento, setRegistrandoMovimiento] = useState(null);

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
        <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="text-left font-medium px-3 py-2">Indicador</th>
                <th className="text-left font-medium px-3 py-2">Aportación</th>
                <th className="text-left font-medium px-3 py-2">Origen</th>
                <th className="text-left font-medium px-3 py-2"></th>
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
                  <td className="px-3 py-2">
                    {tieneCantidadValida(ap) ? (
                      <span className="text-gray-600">
                        {Number(ap.aportacion).toLocaleString('es-MX')}{etiquetaUnidad(ap) ? ` ${etiquetaUnidad(ap)}` : ''} · {etiquetaModo(ap.modo)}
                      </span>
                    ) : (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full"
                          title="El indicador no se mueve aunque este elemento avance, hasta que se defina una cantidad."
                        >
                          <AlertTriangle size={11} /> Sin cantidad definida
                        </span>
                        {!permisos?.esSoloLectura && !ap.origen && (
                          <CorregirCantidad ap={ap} onCorregido={() => { cargar(); onCambiado?.(); }} />
                        )}
                      </div>
                    )}
                  </td>
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
                  <td className="px-3 py-2 text-right">
                    {/* Solo para la aportación de ESTE nodo, no las heredadas de
                        un hijo (ap.origen) — un movimiento a mano aquí debe
                        quedar atribuido a este nodo, no a uno ajeno. */}
                    {!permisos?.esSoloLectura && !ap.origen && (
                      <button
                        onClick={() => setRegistrandoMovimiento(ap)}
                        title="Registrar movimiento a mano"
                        className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-guinda-700"
                      >
                        <TrendingUp size={12} /> Registrar
                      </button>
                    )}
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

      {registrandoMovimiento && (
        <ModalRegistrarMovimiento
          indicadorId={registrandoMovimiento.id_indicador}
          indicadorNombre={registrandoMovimiento.indicador_nombre}
          idNodoOrigen={id}
          onCerrar={() => setRegistrandoMovimiento(null)}
          onRegistrado={() => { setRegistrandoMovimiento(null); cargar(); onCambiado?.(); mostrarToast?.('Movimiento registrado', 'exito'); }}
        />
      )}
    </div>
  );
}
