/**
 * ARCHIVO: NodoGhostEtapa.jsx
 * PROPÓSITO: Nodo fantasma "+ Etapa" al final de la columna raíz del
 *            organigrama — mismo patrón visual/de interacción que
 *            CrearInline (clic → input → Enter/Esc/blur), pero como nodo
 *            de React Flow en vez de un botón de lista.
 */
import { useState, useRef, useEffect } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { DIMENSIONES } from './NodoBase';
import { useEnvioUnico } from '../../../hooks/useEnvioUnico';

export default function NodoGhostEtapa({ data }) {
  const [activo, setActivo] = useState(false);
  const [nombre, setNombre] = useState('');
  const refInput = useRef(null);
  const { w, h } = DIMENSIONES.etapa;

  useEffect(() => { if (activo) refInput.current?.focus(); }, [activo]);

  // Solo-Enter: sin candado síncrono, el autorepeat del teclado podía
  // crear N etapas de golpe (mismo patrón que CrearInline.jsx).
  const [guardar, guardando] = useEnvioUnico(async () => {
    if (!nombre.trim()) return;
    await data.onCrear?.(nombre.trim());
    setNombre('');
    setActivo(false);
  });

  return (
    <div
      style={{ width: w, height: h }}
      className="rounded-lg border border-dashed border-gray-300 bg-gray-50/60 flex items-center justify-center hover:border-[#7B1C3E] hover:bg-white transition-colors"
    >
      {activo ? (
        <div className="flex items-center gap-1 px-2.5 w-full">
          <input
            ref={refInput}
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') guardar();
              if (e.key === 'Escape') { setActivo(false); setNombre(''); }
            }}
            onBlur={() => { if (!nombre.trim()) { setActivo(false); setNombre(''); } }}
            placeholder="Nombre de etapa..."
            className="text-xs border border-gray-300 rounded px-1.5 py-1 flex-1 min-w-0 focus:border-[#7B1C3E] focus:ring-1 focus:ring-[#7B1C3E]/20 outline-none"
            disabled={guardando}
          />
          {guardando && <Loader2 size={12} className="animate-spin text-gray-400 flex-shrink-0" />}
        </div>
      ) : (
        <button
          onClick={() => setActivo(true)}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-[#7B1C3E] font-medium"
        >
          <Plus size={14} /> Etapa
        </button>
      )}
    </div>
  );
}
