/**
 * ARCHIVO: CrearInline.jsx
 * PROPÓSITO: Botón "+ Etapa/Acción/Tarea" con input inline (clic → nombre →
 *            Enter/Esc) reutilizado en el árbol y en el panel de detalle.
 */
import { useState, useEffect, useRef } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { useJerarquiaProyecto } from '../../../hooks/useJerarquiaProyecto';

export default function CrearInline({ tipo, padreId, proyectoId, onCreado, etiqueta: etiquetaProp }) {
  const { crear } = useJerarquiaProyecto(proyectoId);
  const [activo, setActivo] = useState(false);
  const [nombre, setNombre] = useState('');
  const [guardando, setGuardando] = useState(false);
  const refInput = useRef(null);

  useEffect(() => {
    if (activo && refInput.current) refInput.current.focus();
  }, [activo]);

  const etiqueta = etiquetaProp || (tipo === 'etapa' ? '+ Etapa' : tipo === 'accion' ? '+ Acción' : '+ Tarea');

  async function guardar() {
    if (!nombre.trim() || guardando) return;
    setGuardando(true);
    try {
      await crear(tipo, padreId, { nombre: nombre.trim() });
      setNombre('');
      setActivo(false);
      onCreado?.();
    } catch (err) {
      console.error(err);
    } finally {
      setGuardando(false);
    }
  }

  if (!activo) {
    return (
      <button
        onClick={() => setActivo(true)}
        className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-[#7B1C3E] py-1 px-1 transition-colors"
      >
        <Plus size={10} /> {etiqueta}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1 py-0.5 px-1">
      <input
        ref={refInput}
        value={nombre}
        onChange={e => setNombre(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') guardar(); if (e.key === 'Escape') { setActivo(false); setNombre(''); } }}
        onBlur={() => { if (!nombre.trim()) { setActivo(false); setNombre(''); } }}
        placeholder={`Nombre de ${tipo}...`}
        className="text-xs border border-gray-300 rounded px-1.5 py-0.5 flex-1 min-w-0 focus:border-[#7B1C3E] focus:ring-1 focus:ring-[#7B1C3E]/20 outline-none"
        disabled={guardando}
      />
      {guardando && <Loader2 size={10} className="animate-spin text-gray-400" />}
    </div>
  );
}
