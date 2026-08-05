/**
 * ARCHIVO: AvanceInlineArbol.jsx
 * PROPÓSITO: Edición rápida de % directo en la fila del árbol. Mismo patrón
 *            clic-para-editar que CeldaEditable de VistaLista, pero llamando
 *            al endpoint PATCH que ya usa el rail de "Propiedades"
 *            (avance_actual) — mismas validaciones de negocio del backend
 *            (0-99, rechazo si Bloqueada, etc.), solo un nuevo punto de entrada.
 */
import { useState, useEffect, useRef } from 'react';
import { useJerarquiaProyecto } from '../../../hooks/useJerarquiaProyecto';

export default function AvanceInlineArbol({ valor, tipo, nodoId, estado, onGuardado, mostrarToast }) {
  const { registrarAvance } = useJerarquiaProyecto();
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(String(Math.round(valor ?? 0)));
  const [guardando, setGuardando] = useState(false);
  const ref = useRef(null);

  useEffect(() => { setTexto(String(Math.round(valor ?? 0))); }, [valor]);
  useEffect(() => { if (editando && ref.current) { ref.current.focus(); ref.current.select(); } }, [editando]);

  async function confirmar() {
    setEditando(false);
    const nuevo = parseInt(texto, 10);
    if (isNaN(nuevo) || nuevo === Math.round(valor ?? 0)) { setTexto(String(Math.round(valor ?? 0))); return; }
    setGuardando(true);
    try {
      await registrarAvance(tipo, nodoId, nuevo);
      await onGuardado?.();
    } catch (err) {
      mostrarToast?.(err.response?.data?.mensaje || 'No se pudo actualizar el avance', 'error');
      setTexto(String(Math.round(valor ?? 0)));
    } finally {
      setGuardando(false);
    }
  }

  if (editando) {
    return (
      <input
        ref={ref}
        type="number"
        min={0}
        max={99}
        value={texto}
        onClick={e => e.stopPropagation()}
        onChange={e => setTexto(e.target.value)}
        onBlur={confirmar}
        onKeyDown={e => {
          if (e.key === 'Enter') e.target.blur();
          if (e.key === 'Escape') { setTexto(String(Math.round(valor ?? 0))); setEditando(false); }
        }}
        className="w-10 text-[10px] tabular-nums font-medium text-right border border-[#7B1C3E]/40 rounded px-0.5 py-0 outline-none focus:ring-1 focus:ring-[#7B1C3E]/20"
      />
    );
  }

  return (
    <button
      onClick={e => { e.stopPropagation(); setEditando(true); }}
      title="Clic para editar el avance"
      disabled={guardando}
      className="text-[10px] tabular-nums font-medium text-gray-400 hover:text-[#7B1C3E] hover:bg-[#7B1C3E]/5 rounded flex-shrink-0 w-8 text-right px-0.5 transition-colors"
    >
      {guardando ? '…' : `${Math.round(valor ?? 0)}%`}
    </button>
  );
}
