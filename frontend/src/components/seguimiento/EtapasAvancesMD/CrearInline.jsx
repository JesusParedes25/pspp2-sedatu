/**
 * ARCHIVO: CrearInline.jsx
 * PROPÓSITO: Botón "+ Etapa/Acción/Tarea" con input inline (clic → nombre →
 *            Enter/Esc) reutilizado en el árbol y en el panel de detalle.
 *
 * MINI-CLASE: dos variantes, mismo mecanismo
 * ─────────────────────────────────────────────────────────────────
 * 'sutil' (default) es el enlace junto al encabezado de la lista de
 * hijos — mismo peso visual que los demás botones de ícono de esa
 * cabecera (filtros, cerrar): sin relleno de color, solo texto/ícono
 * gris que se resalta al pasar el mouse. 'destacado' es la misma acción
 * con el mismo peso que "Registrar avance"/"Reportar riesgo" en el
 * panel derecho, para quien no repara en el encabezado de la lista.
 * Dos entradas, una sola implementación: evita que crear un hijo se
 * comporte distinto según por dónde se abrió.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useRef } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { useJerarquiaProyecto } from '../../../hooks/useJerarquiaProyecto';
import { useEnvioUnico } from '../../../hooks/useEnvioUnico';

const CLASE_BOTON = {
  sutil: 'inline-flex items-center gap-1 text-[11px] font-medium text-gray-400 hover:text-guinda-600 hover:bg-gray-100 px-1.5 py-1 rounded transition-colors',
  destacado: 'w-full flex items-center justify-center gap-1.5 text-[12px] font-semibold px-3 py-2.5 rounded-lg border-2 border-dashed border-guinda-300 text-guinda-700 hover:bg-guinda-50 hover:border-guinda-400 transition-colors',
};

export default function CrearInline({ tipo, padreId, proyectoId, onCreado, etiqueta: etiquetaProp, variante = 'sutil' }) {
  const { crear } = useJerarquiaProyecto(proyectoId);
  const [activo, setActivo] = useState(false);
  const [nombre, setNombre] = useState('');
  const refInput = useRef(null);

  useEffect(() => {
    if (activo && refInput.current) refInput.current.focus();
  }, [activo]);

  const etiqueta = etiquetaProp || (tipo === 'etapa' ? 'Etapa' : tipo === 'accion' ? 'Acción' : 'Tarea');

  // Solo-Enter: sin candado síncrono, el autorepeat del teclado (mantener
  // Enter presionado) podía crear N nodos de golpe.
  const [guardar, guardando] = useEnvioUnico(async () => {
    if (!nombre.trim()) return;
    try {
      await crear(tipo, padreId, { nombre: nombre.trim() });
      setNombre('');
      setActivo(false);
      onCreado?.();
    } catch (err) {
      console.error(err);
    }
  });

  if (!activo) {
    return (
      <button onClick={() => setActivo(true)} className={CLASE_BOTON[variante] || CLASE_BOTON.sutil}>
        <Plus size={variante === 'destacado' ? 14 : 11} /> {etiqueta}
      </button>
    );
  }

  return (
    <div className={variante === 'destacado' ? 'flex items-center gap-1.5 w-full' : 'flex items-center gap-1 py-0.5 px-1'}>
      <input
        ref={refInput}
        value={nombre}
        onChange={e => setNombre(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') guardar(); if (e.key === 'Escape') { setActivo(false); setNombre(''); } }}
        onBlur={() => { if (!nombre.trim()) { setActivo(false); setNombre(''); } }}
        placeholder={`Nombre de ${tipo}...`}
        className={variante === 'destacado'
          ? 'text-xs border border-gray-300 rounded-lg px-2.5 py-2 flex-1 min-w-0 focus:border-[#7B1C3E] focus:ring-1 focus:ring-[#7B1C3E]/20 outline-none'
          : 'text-xs border border-gray-300 rounded px-1.5 py-0.5 flex-1 min-w-0 focus:border-[#7B1C3E] focus:ring-1 focus:ring-[#7B1C3E]/20 outline-none'}
        disabled={guardando}
      />
      {guardando && <Loader2 size={10} className="animate-spin text-gray-400" />}
    </div>
  );
}
