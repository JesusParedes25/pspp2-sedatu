/**
 * TabIndicadores.jsx
 * Pestaña "Indicadores" del panel central de detalle de nodo.
 *
 * Rediseñada — antes mostraba TODOS los indicadores del proyecto como
 * tarjetas completas (realizado/meta/barra/unidad) estén o no vinculados
 * a este nodo, con el aviso de "no aporta" hasta el final de la tarjeta;
 * mezclaba "qué indicadores tiene el proyecto" con "a cuáles aporta este
 * nodo" en una sola pantalla. Ahora solo muestra a qué aporta ESTE nodo
 * — chips compactos, uno por indicador — con un botón para vincular más
 * (abre el wizard del módulo de Indicadores, con este nodo ya elegido) y
 * edición del modo/valor de cada aportación ya existente, con la
 * explicación de qué hace cada modo (antes ausente).
 */
import { useState, useEffect, useCallback } from 'react';
import { Link2, Loader2, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import * as indicadoresApi from '../../api/indicadores';
import { useUI } from '../../context/UIContext';
import ModalVincularIndicador from '../indicadores/ModalVincularIndicador';

const MODOS = [
  { valor: 'al_concluir', etiqueta: 'Manual', ayuda: 'Tú escribes el número. Cuenta cuando esto se complete.' },
  { valor: 'proporcional', etiqueta: 'Automático', ayuda: 'Se calcula solo, proporcional a su avance.' },
];

export default function TabIndicadores({ tipo, nodoId, nodoNombre, proyectoId, soloLectura }) {
  const { mostrarToast } = useUI();
  const [aportaciones, setAportaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarWizard, setMostrarWizard] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await indicadoresApi.obtenerAportacionesNodo(tipo, nodoId);
      setAportaciones(res?.datos || []);
    } catch (e) {
      console.error('Error cargando aportaciones:', e);
    } finally {
      setCargando(false);
    }
  }, [tipo, nodoId]);

  useEffect(() => { cargar(); }, [cargar]);

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-10 gap-2 text-gray-400">
        <Loader2 size={18} className="animate-spin" />
        <span className="text-sm">Cargando…</span>
      </div>
    );
  }

  return (
    <div className="p-5 space-y-2">
      {aportaciones.length === 0 ? (
        <div className="flex items-center justify-between gap-2 text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
          <span>Este nodo no aporta a ningún indicador.</span>
          {!soloLectura && (
            <button onClick={() => setMostrarWizard(true)} className="text-xs font-medium text-guinda-700 hover:underline flex-shrink-0">
              Vincular
            </button>
          )}
        </div>
      ) : (
        <>
          {aportaciones.map(ap => (
            <ChipAportacion key={ap.id} ap={ap} soloLectura={soloLectura} onActualizado={cargar} mostrarToast={mostrarToast} />
          ))}
          {!soloLectura && (
            <button
              onClick={() => setMostrarWizard(true)}
              className="w-full flex items-center justify-center gap-1.5 py-2 border border-dashed border-gray-200 rounded-lg text-xs font-medium text-gray-500 hover:text-guinda-700 hover:border-guinda-200 transition-colors"
            >
              <Link2 size={12} /> Vincular a otro indicador
            </button>
          )}
        </>
      )}

      {mostrarWizard && (
        <ModalVincularIndicador
          proyectoPreseleccionado={{ id: proyectoId }}
          nodoPreseleccionado={{ tipo, id: nodoId, nombre: nodoNombre }}
          onCerrar={() => setMostrarWizard(false)}
          onVinculado={() => { setMostrarWizard(false); cargar(); }}
        />
      )}
    </div>
  );
}

function ChipAportacion({ ap, soloLectura, onActualizado, mostrarToast }) {
  const [abierto, setAbierto] = useState(false);
  const [modo, setModo] = useState(ap.modo);
  const [valor, setValor] = useState(ap.aportacion ?? '');
  const [guardando, setGuardando] = useState(false);

  const modoInfo = MODOS.find(m => m.valor === ap.modo) || MODOS[0];

  async function guardar() {
    setGuardando(true);
    try {
      await indicadoresApi.actualizarAportacion(ap.id, {
        modo,
        valor_aportacion: valor === '' ? 0 : parseFloat(valor),
      });
      mostrarToast('Aportación actualizada', 'exito');
      onActualizado();
    } catch (e) {
      mostrarToast(e.response?.data?.mensaje || 'Error al actualizar', 'error');
    } finally {
      setGuardando(false);
    }
  }

  async function desvincular() {
    setGuardando(true);
    try {
      await indicadoresApi.eliminarAportacion(ap.id);
      mostrarToast('Desvinculado', 'exito');
      onActualizado();
    } catch (e) {
      mostrarToast(e.response?.data?.mensaje || 'Error al desvincular', 'error');
      setGuardando(false);
    }
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setAbierto(v => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-sm text-gray-800 truncate">{ap.indicador_nombre}</span>
        <span className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[10px] text-gray-400">{modoInfo.etiqueta}</span>
          {abierto ? <ChevronDown size={13} className="text-gray-400" /> : <ChevronRight size={13} className="text-gray-400" />}
        </span>
      </button>
      {abierto && (
        <div className="px-3 pb-3 pt-1 border-t border-gray-100 space-y-2">
          <div className="flex gap-1.5">
            {MODOS.map(m => (
              <button
                key={m.valor}
                type="button"
                disabled={soloLectura}
                onClick={() => setModo(m.valor)}
                className={`flex-1 text-left px-2.5 py-1.5 rounded-md border text-xs transition-colors ${
                  modo === m.valor ? 'border-guinda-300 bg-guinda-50/50' : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <span className="font-medium text-gray-800 block">{m.etiqueta}</span>
                <span className="text-[10px] text-gray-500 leading-snug">{m.ayuda}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number" step="any" min="0"
              value={valor}
              onChange={e => setValor(e.target.value)}
              disabled={soloLectura}
              className="w-24 text-xs border border-gray-300 rounded px-2 py-1 focus:border-guinda-500 focus:ring-1 focus:ring-guinda-500/20 outline-none disabled:opacity-60"
            />
            {!soloLectura && (
              <>
                <button
                  onClick={guardar}
                  disabled={guardando || (modo === ap.modo && Number(valor) === Number(ap.aportacion))}
                  className="text-xs font-medium text-guinda-700 hover:underline disabled:opacity-40 disabled:no-underline"
                >
                  Guardar
                </button>
                <button
                  onClick={desvincular}
                  disabled={guardando}
                  className="ml-auto text-gray-400 hover:text-red-500 transition-colors p-0.5 rounded"
                  title="Desvincular"
                >
                  {guardando ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
