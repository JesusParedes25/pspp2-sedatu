/**
 * ARCHIVO: CatalogSelector.jsx
 * PROPÓSITO: Selector reutilizable que carga opciones de la tabla catalogos.
 *
 * Props:
 *   tipo       — Tipo de catálogo (ej: 'categoria', 'instrumento')
 *   value      — Valor seleccionado actualmente
 *   onChange   — Callback (valor) => void
 *   label      — Etiqueta del campo
 *   required   — Si es obligatorio
 *   className  — Clases adicionales para el contenedor
 */
import { useState, useEffect, useRef } from 'react';
import { Plus, Check, X } from 'lucide-react';
import * as catalogosApi from '../../api/catalogos';

const TIPOS_FIJOS = ['prioridad', 'estatus'];

export default function CatalogSelector({ tipo, value, onChange, label, required, className = '' }) {
  const [opciones, setOpciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarNuevo, setMostrarNuevo] = useState(false);
  const [nuevoValor, setNuevoValor] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const esExtensible = !TIPOS_FIJOS.includes(tipo);

  useEffect(() => {
    if (!tipo) return;
    setCargando(true);
    catalogosApi.obtenerValoresCatalogo(tipo)
      .then(res => setOpciones(res.datos || []))
      .catch(() => setOpciones([]))
      .finally(() => setCargando(false));
  }, [tipo]);

  useEffect(() => {
    if (mostrarNuevo && inputRef.current) {
      inputRef.current.focus();
    }
  }, [mostrarNuevo]);

  async function agregarNuevo() {
    const val = nuevoValor.trim();
    if (!val) return;
    setGuardando(true);
    setError(null);
    try {
      const res = await catalogosApi.agregarValorCatalogo(tipo, val);
      setOpciones(prev => [...prev, res.datos]);
      onChange(val);
      setNuevoValor('');
      setMostrarNuevo(false);
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al agregar');
    } finally {
      setGuardando(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      agregarNuevo();
    } else if (e.key === 'Escape') {
      setMostrarNuevo(false);
      setNuevoValor('');
      setError(null);
    }
  }

  return (
    <div className={className}>
      {label && (
        <label className="block text-xs font-medium text-gray-600 mb-1">
          {label} {required && <span className="text-red-400">*</span>}
        </label>
      )}
      <select
        value={value || ''}
        onChange={e => {
          if (e.target.value === '__nuevo__') {
            setMostrarNuevo(true);
            return;
          }
          onChange(e.target.value);
        }}
        className="input-base text-sm"
        required={required}
        disabled={cargando}
      >
        <option value="">— Seleccionar —</option>
        {opciones.map(op => (
          <option key={op.id} value={op.valor}>{op.valor}</option>
        ))}
        {esExtensible && <option value="__nuevo__">+ Agregar nuevo…</option>}
      </select>

      {mostrarNuevo && (
        <div className="flex items-center gap-1.5 mt-1.5">
          <input
            ref={inputRef}
            type="text"
            value={nuevoValor}
            onChange={e => setNuevoValor(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Nuevo valor…"
            className="input-base text-xs flex-1 py-1"
            disabled={guardando}
          />
          <button
            type="button"
            onClick={agregarNuevo}
            disabled={guardando || !nuevoValor.trim()}
            className="p-1 rounded bg-green-500 text-white hover:bg-green-600 disabled:opacity-40"
            title="Confirmar"
          >
            <Check size={12} />
          </button>
          <button
            type="button"
            onClick={() => { setMostrarNuevo(false); setNuevoValor(''); setError(null); }}
            className="p-1 rounded bg-gray-200 text-gray-500 hover:bg-gray-300"
            title="Cancelar"
          >
            <X size={12} />
          </button>
        </div>
      )}
      {error && <p className="text-[10px] text-red-500 mt-0.5">{error}</p>}
    </div>
  );
}
