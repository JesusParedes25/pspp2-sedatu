/**
 * ARCHIVO: Campos.jsx
 * PROPÓSITO: Campos editables inline reutilizados por el rail de
 *            "Propiedades" (PanelDetalle) — texto, select, avance,
 *            semáforo y el selector múltiple de municipios.
 */
import { useState, useEffect, useRef } from 'react';
import { Lock } from 'lucide-react';
import { COLORES_SEMAFORO } from '../../common/SemaforoDot';

// ─── Campo texto inline (click-to-edit) ──────────────────────
export function CampoTextoInline({ valor, campo, onGuardar, soloLectura, placeholder, className, multiline }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(valor || '');
  const ref = useRef(null);

  useEffect(() => { setTexto(valor || ''); }, [valor]);
  useEffect(() => { if (editando && ref.current) ref.current.focus(); }, [editando]);

  function confirmar() {
    setEditando(false);
    if (texto.trim() !== (valor || '').trim()) onGuardar(texto.trim() || null);
  }

  if (soloLectura || !editando) {
    return (
      <div
        onClick={() => !soloLectura && setEditando(true)}
        className={`${className} ${!soloLectura ? 'cursor-pointer hover:bg-gray-50 rounded px-1 -mx-1' : ''} ${!valor && !soloLectura ? 'italic text-gray-300' : ''}`}
        title={!soloLectura ? 'Clic para editar' : undefined}
      >
        {valor || placeholder || '—'}
      </div>
    );
  }

  if (multiline) {
    return (
      <textarea
        ref={ref}
        value={texto}
        onChange={e => setTexto(e.target.value)}
        onBlur={confirmar}
        onKeyDown={e => { if (e.key === 'Escape') { setTexto(valor || ''); setEditando(false); } }}
        placeholder={placeholder}
        rows={2}
        className={`${className} w-full border border-[#7B1C3E]/30 rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-[#7B1C3E]/20 resize-none`}
      />
    );
  }

  return (
    <input
      ref={ref}
      value={texto}
      onChange={e => setTexto(e.target.value)}
      onBlur={confirmar}
      onKeyDown={e => { if (e.key === 'Enter') confirmar(); if (e.key === 'Escape') { setTexto(valor || ''); setEditando(false); } }}
      placeholder={placeholder}
      className={`${className} w-full border border-[#7B1C3E]/30 rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-[#7B1C3E]/20`}
    />
  );
}

// ─── Campos editables inline ───────────────────────────────────
export function CampoEditable({ label, valor, soloLectura }) {
  return (
    <div>
      <span className="text-[10px] text-gray-400 uppercase tracking-wider block mb-0.5">{label}</span>
      <span className="text-xs text-gray-700">{valor}</span>
    </div>
  );
}

export function CampoSelect({ label, valor, opciones, onChange, soloLectura, formatLabel, useObjects }) {
  const displayVal = useObjects
    ? (opciones.find(o => o.value === valor)?.label || valor || '—')
    : (formatLabel ? formatLabel(valor) : valor || '—');
  if (soloLectura) return <CampoEditable label={label} valor={displayVal} soloLectura />;
  return (
    <div>
      <span className="text-[10px] text-gray-400 uppercase tracking-wider block mb-0.5">{label}</span>
      <select
        value={valor}
        onChange={e => onChange(e.target.value)}
        className="text-xs border border-gray-200 rounded px-1.5 py-0.5 w-full bg-white focus:border-[#7B1C3E] outline-none"
      >
        <option value="">—</option>
        {useObjects
          ? opciones.map(o => <option key={o.value} value={o.value}>{o.label}</option>)
          : opciones.map(o => <option key={o} value={o}>{formatLabel ? formatLabel(o) : o}</option>)
        }
      </select>
    </div>
  );
}

// Selector múltiple de municipios (mismo patrón que TerritorioSelector.jsx,
// duplicado aquí porque este panel usa su propio CampoSelect/CampoEditable).
// La lista seleccionada puede acumular municipios de distintos estados —
// el <select> de Estado de arriba solo filtra qué se muestra para buscar,
// no borra lo ya elegido en otros estados. Cada chip muestra su estado
// entre paréntesis para no confundir municipios del mismo nombre.
export function SelectorMunicipiosMultiple({ municipios, opciones, onChange, soloLectura, estadosCatalog = [] }) {
  const lista = municipios || [];
  const seleccionados = new Set(lista.map(m => m.cve_mun));
  const [busqueda, setBusqueda] = useState('');

  const nombreEstado = (cveMun) => estadosCatalog.find(e => e.cve_ent === cveMun.slice(0, 2))?.nombre;

  if (soloLectura) {
    return (
      <div>
        <span className="text-[10px] text-gray-400 uppercase tracking-wider block mb-0.5">Municipios</span>
        {lista.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {lista.map(m => (
              <span key={m.cve_mun} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
                {m.nombre}{nombreEstado(m.cve_mun) ? ` (${nombreEstado(m.cve_mun)})` : ''}
              </span>
            ))}
          </div>
        ) : <p className="text-xs text-gray-600">—</p>}
      </div>
    );
  }

  function toggle(cvegeo) {
    const next = seleccionados.has(cvegeo)
      ? [...seleccionados].filter(c => c !== cvegeo)
      : [...seleccionados, cvegeo];
    onChange(next);
  }

  const opcionesFiltradas = busqueda.trim()
    ? opciones.filter(o => o.label.toLowerCase().includes(busqueda.trim().toLowerCase()))
    : opciones;

  return (
    <div>
      <span className="text-[10px] text-gray-400 uppercase tracking-wider block mb-0.5">
        Municipios (opcional{seleccionados.size > 0 ? ` · ${seleccionados.size} seleccionado${seleccionados.size !== 1 ? 's' : ''}` : ''})
      </span>
      {lista.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {lista.map(m => (
            <span key={m.cve_mun} className="flex items-center gap-1 text-[10px] bg-[#fbf3f6] text-[#7B1C3E] px-1.5 py-0.5 rounded-full">
              {m.nombre}{nombreEstado(m.cve_mun) ? ` (${nombreEstado(m.cve_mun)})` : ''}
              <button type="button" onClick={() => toggle(m.cve_mun)} className="hover:text-red-600" title="Quitar">×</button>
            </span>
          ))}
        </div>
      )}
      {opciones.length > 0 && (
        <input
          type="text"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar municipio…"
          className="w-full text-[11px] border border-gray-200 rounded px-2 py-1 mb-1 bg-white focus:border-[#7B1C3E] outline-none"
        />
      )}
      <div className="max-h-32 overflow-y-auto border border-gray-200 rounded bg-white divide-y divide-gray-50">
        {opciones.length === 0 ? (
          <p className="text-[11px] text-gray-400 px-2 py-1.5">Elige un estado arriba para buscar sus municipios</p>
        ) : opcionesFiltradas.length === 0 ? (
          <p className="text-[11px] text-gray-400 px-2 py-1.5">Sin resultados para "{busqueda}"</p>
        ) : opcionesFiltradas.map(o => (
          <label key={o.value} className="flex items-center gap-1.5 px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-50 cursor-pointer">
            <input type="checkbox" checked={seleccionados.has(o.value)} onChange={() => toggle(o.value)} className="accent-[#7B1C3E]" />
            {o.label}
          </label>
        ))}
      </div>
    </div>
  );
}

export function CampoAvance({ valor, avanceEfectivo, esContenedor, estado, onChange, soloLectura }) {
  const mostrado = valor != null ? valor : Math.round(avanceEfectivo);
  if (esContenedor) {
    return (
      <div>
        <span className="text-[10px] text-gray-400 uppercase tracking-wider block mb-0.5">Avance actual</span>
        <div className="flex items-center gap-1.5">
          <Lock size={10} className="text-gray-400" />
          <span className="text-xs text-gray-500">{mostrado}%</span>
        </div>
        <p className="text-[9px] text-gray-400 mt-0.5 italic leading-snug">El avance y el estatus se calculan a partir de sus partes. Para avanzar, actualiza las tareas/acciones que contiene.</p>
      </div>
    );
  }
  // Hoja: avance bloqueado si no es En_proceso
  const estadoActual = estado || 'Pendiente';
  const bloqueado = soloLectura || estadoActual === 'Completada' || estadoActual === 'Pendiente' || estadoActual === 'Bloqueada' || estadoActual === 'Cancelada';
  if (bloqueado) {
    const nota = estadoActual === 'Completada' ? 'Completada: 100%'
      : estadoActual === 'Pendiente' ? 'Pendiente: 0%'
      : estadoActual === 'Bloqueada' ? 'Bloqueada: avance congelado'
      : estadoActual === 'Cancelada' ? 'Cancelada' : '';
    return (
      <div>
        <span className="text-[10px] text-gray-400 uppercase tracking-wider block mb-0.5">Avance actual</span>
        <span className="text-xs text-gray-500">{mostrado}%</span>
        {nota && <p className="text-[9px] text-gray-400 mt-0.5 italic">{nota}</p>}
        <p className="text-[9px] text-gray-400 mt-0.5 italic leading-snug">{"Captura el avance parcial mientras está 'En proceso'. Marca 'Completada' para llegar al 100%."}</p>
      </div>
    );
  }
  return (
    <div>
      <span className="text-[10px] text-gray-400 uppercase tracking-wider block mb-0.5">Avance actual</span>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min="0"
          max="99"
          value={valor ?? 0}
          onChange={e => onChange(parseInt(e.target.value))}
          className="flex-1 h-1.5 accent-[#7B1C3E]"
        />
        <span className="text-xs font-bold tabular-nums w-8 text-right">{valor ?? 0}%</span>
      </div>
      <p className="text-[9px] text-gray-400 mt-0.5 italic leading-snug">Captura el avance parcial (0-99). Marca 'Completada' para llegar al 100%.</p>
    </div>
  );
}

export function CampoSemaforo({ valor, override, efectivo, onChange, soloLectura }) {
  const colorMostrado = override && valor ? valor : efectivo;
  if (soloLectura) {
    return (
      <div>
        <span className="text-[10px] text-gray-400 uppercase tracking-wider block mb-0.5">Semáforo</span>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: COLORES_SEMAFORO[colorMostrado] }} />
          <span className="text-xs capitalize">{colorMostrado}</span>
          {override && <span className="text-[8px] bg-gray-200 text-gray-600 px-1 rounded font-bold">M</span>}
        </div>
      </div>
    );
  }
  return (
    <div>
      <span className="text-[10px] text-gray-400 uppercase tracking-wider block mb-0.5">Semáforo</span>
      <div className="flex items-center gap-1.5">
        <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: COLORES_SEMAFORO[colorMostrado] }} />
        <select
          value={override ? valor : ''}
          onChange={e => onChange(e.target.value === '' ? null : e.target.value)}
          className="text-xs border border-gray-200 rounded px-1 py-0.5 bg-white focus:border-[#7B1C3E] outline-none"
        >
          <option value="">Automático</option>
          <option value="verde">🟢 Verde</option>
          <option value="ambar">🟡 Ámbar</option>
          <option value="rojo">🔴 Rojo</option>
          <option value="gris">⚪ Gris</option>
        </select>
        {override && <span className="text-[8px] bg-gray-200 text-gray-600 px-1 rounded font-bold">M</span>}
      </div>
    </div>
  );
}
