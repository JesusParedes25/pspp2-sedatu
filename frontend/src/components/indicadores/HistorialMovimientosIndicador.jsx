/**
 * ARCHIVO: HistorialMovimientosIndicador.jsx
 * PROPÓSITO: Lista de movimientos de un indicador (fecha, origen,
 *            cantidad con signo, acumulado que dejó, quién lo
 *            registró, acción de Anular) — extraída de
 *            DetalleIndicador.jsx para reusarla tal cual en la fila
 *            desplegada de la pestaña Indicadores de un proyecto
 *            (IndicadoresProyecto.jsx), que antes solo mostraba los
 *            nodos que aportan y no tenía ninguna forma de ver qué
 *            movimiento subió el valor ni quién lo registró sin salir
 *            a "Mis indicadores".
 *
 * `limite` (opcional): si se pasa, solo se muestran los `limite`
 * movimientos más recientes (el API ya los entrega del más reciente al
 * más antiguo) y, si hay más, un enlace a `enlaceVerTodos` en vez de
 * volcar decenas de renglones dentro de una fila desplegada —
 * DetalleIndicador.jsx no pasa `limite` (ahí es la pantalla completa, se
 * sigue mostrando todo como siempre).
 *
 * `soloLectura` (opcional): oculta la acción de Anular. DetalleIndicador
 * no la pasa (no tiene contexto de permisos de proyecto — su propio
 * criterio ya documentado es mostrar los controles siempre y dejar que
 * un 403 real se traduzca en un toast); IndicadoresProyecto.jsx sí la
 * pasa, con el mismo `permisos.esSoloLectura` que ya gobierna las demás
 * acciones de esa pestaña.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Ban } from 'lucide-react';
import * as indicadoresApi from '../../api/indicadores';
import { formatearMoneda } from '../../utils/formatoMoneda';
import { formatFecha } from '../../utils/fecha';

const NIVEL_LABEL = { etapa: 'Etapa', accion: 'Acción', tarea: 'Tarea' };

// "Se completó 'X'" / "Registro a mano de Y" — el origen de un
// movimiento, en una frase. `nota` ya trae el detalle que puso
// procesarCambioNodo ("Actividad completada", "Avance de la actividad
// vinculada: 60%"...) para los automáticos; para los manuales con nodo
// (registrados desde la pestaña Indicadores de un nodo en Seguimiento)
// no hay nota prefabricada, así que se compone aquí.
export function descripcionOrigenMovimiento(m) {
  const nodo = m.nodo_nombre ? `${NIVEL_LABEL[m.nodo_tipo] || ''} "${m.nodo_nombre}"` : null;
  if (m.origen === 'migracion') return m.nota || 'Valor migrado de la versión anterior';
  if (m.origen === 'manual') return nodo ? `Registro a mano de ${nodo}` : (m.nota || 'Registro a mano');
  return nodo ? `${nodo}: ${m.nota || 'actualizada'}` : (m.nota || 'Actividad vinculada');
}

export default function HistorialMovimientosIndicador({
  movimientos, cargando, esMoneda, soloLectura, onActualizado, mostrarToast, limite, enlaceVerTodos,
}) {
  const [anulando, setAnulando] = useState(null); // id del movimiento con el campo de motivo abierto
  const [motivo, setMotivo] = useState('');
  const [procesando, setProcesando] = useState(false);

  // Orden cronológico ascendente para acumular, conservando el orden
  // DESC (más reciente arriba) para mostrar — un movimiento anulado no
  // suma al acumulado (coincide con cómo recalcularValorActual excluye
  // los anulados), pero se deja ver tachado en su lugar en el tiempo.
  const conAcumulado = (() => {
    const asc = [...movimientos].reverse();
    let acumulado = 0;
    const calculados = asc.map(m => {
      if (!m.anulado_en) acumulado += parseFloat(m.cantidad);
      return { ...m, acumuladoTrasEste: acumulado };
    });
    return calculados.reverse();
  })();

  const visibles = limite ? conAcumulado.slice(0, limite) : conAcumulado;
  const ocultos = conAcumulado.length - visibles.length;

  async function confirmarAnular(movimientoId) {
    if (!motivo.trim()) return;
    setProcesando(true);
    try {
      await indicadoresApi.anularMovimientoIndicador(movimientoId, motivo.trim());
      mostrarToast('Movimiento anulado', 'exito');
      setAnulando(null);
      setMotivo('');
      onActualizado();
    } catch (err) {
      mostrarToast(err.response?.data?.mensaje || 'No se pudo anular el movimiento', 'error');
    } finally {
      setProcesando(false);
    }
  }

  if (cargando) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
        <Loader2 size={13} className="animate-spin" /> Cargando…
      </div>
    );
  }

  if (conAcumulado.length === 0) {
    return <p className="text-xs text-gray-500">Todavía no hay ningún movimiento registrado.</p>;
  }

  return (
    <div>
      <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
        {visibles.map(m => {
          const anulado = !!m.anulado_en;
          const cantidad = parseFloat(m.cantidad);
          return (
            <div key={m.id} className={`px-3 py-2 text-xs ${anulado ? 'opacity-50' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div className={`min-w-0 ${anulado ? 'line-through' : ''}`}>
                  <p className="text-gray-700">{descripcionOrigenMovimiento(m)}</p>
                  <p className="text-[10px] text-gray-400">
                    {formatFecha(m.fecha)}{m.creador_nombre ? ` · ${m.creador_nombre}` : ''}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={`font-medium tabular-nums ${anulado ? 'line-through text-gray-400' : cantidad < 0 ? 'text-red-600' : 'text-gray-700'}`}>
                    {cantidad > 0 ? '+' : ''}{esMoneda ? formatearMoneda(cantidad) : cantidad.toLocaleString('es-MX')}
                  </p>
                  <p className="text-[10px] text-gray-400 tabular-nums">
                    acumulado: {esMoneda ? formatearMoneda(m.acumuladoTrasEste) : m.acumuladoTrasEste.toLocaleString('es-MX')}
                  </p>
                </div>
              </div>
              {anulado ? (
                <p className="text-[10px] text-gray-400 mt-1">
                  Anulado por {m.anulador_nombre || 'alguien'}{m.motivo_anulacion ? `: ${m.motivo_anulacion}` : ''}
                </p>
              ) : soloLectura ? null : anulando === m.id ? (
                <div className="flex items-center gap-1.5 mt-1.5">
                  <input
                    autoFocus
                    value={motivo}
                    onChange={e => setMotivo(e.target.value)}
                    placeholder="Motivo de la anulación"
                    className="flex-1 text-[11px] border border-gray-300 rounded px-2 py-1 focus:border-guinda-500 focus:ring-1 focus:ring-guinda-500/20 outline-none"
                  />
                  <button
                    onClick={() => confirmarAnular(m.id)}
                    disabled={procesando || !motivo.trim()}
                    className="text-[11px] font-medium text-red-600 hover:underline disabled:opacity-40"
                  >
                    Confirmar
                  </button>
                  <button onClick={() => { setAnulando(null); setMotivo(''); }} className="text-[11px] text-gray-400 hover:text-gray-600">
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setAnulando(m.id); setMotivo(''); }}
                  className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-red-600 mt-1"
                >
                  <Ban size={10} /> Anular
                </button>
              )}
            </div>
          );
        })}
      </div>
      {ocultos > 0 && enlaceVerTodos && (
        <Link to={enlaceVerTodos} className="block text-center text-[11px] font-medium text-guinda-600 hover:underline mt-1.5">
          Ver los {ocultos} movimiento{ocultos !== 1 ? 's' : ''} más antiguo{ocultos !== 1 ? 's' : ''}
        </Link>
      )}
    </div>
  );
}
