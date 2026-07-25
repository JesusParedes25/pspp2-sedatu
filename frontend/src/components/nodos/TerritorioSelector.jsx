/**
 * ARCHIVO: TerritorioSelector.jsx
 * PROPÓSITO: Selector de territorio (Modo A: Estado + Municipios [múltiples] /
 *            Modo B: Zona Metropolitana, regla exclusiva) — extraído de
 *            EtapasAvancesMD para reusarse también desde las tarjetas
 *            expandibles (NodoCard). El prop `soportarZM` permite ocultar
 *            el Modo B (usado por tareas, que no tienen ese concepto).
 */
import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import client from '../../api/client';

function Select({ label, valor, opciones, onChange, soloLectura }) {
  if (soloLectura) {
    const actual = opciones.find(o => o.value === valor)?.label || valor || '—';
    return (
      <div>
        <span className="text-[10px] text-gray-400 uppercase tracking-wider block mb-0.5">{label}</span>
        <p className="text-xs text-gray-600">{actual}</p>
      </div>
    );
  }
  return (
    <div>
      <span className="text-[10px] text-gray-400 uppercase tracking-wider block mb-0.5">{label}</span>
      <select
        value={valor || ''}
        onChange={e => onChange(e.target.value)}
        className="text-xs border border-gray-200 rounded px-1.5 py-1 w-full bg-white focus:border-[#7B1C3E] outline-none"
      >
        <option value="">—</option>
        {opciones.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

// Selector múltiple de municipios: chips con lo ya elegido + checklist del
// catálogo filtrado por el estado seleccionado.
function MultiSelectMunicipios({ municipios, opciones, onChange, soloLectura }) {
  const lista = municipios || [];
  const seleccionados = new Set(lista.map(m => m.cve_mun));

  if (soloLectura) {
    return (
      <div>
        <span className="text-[10px] text-gray-400 uppercase tracking-wider block mb-0.5">Municipios</span>
        {lista.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {lista.map(m => (
              <span key={m.cve_mun} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{m.nombre}</span>
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

  return (
    <div>
      <span className="text-[10px] text-gray-400 uppercase tracking-wider block mb-0.5">
        Municipios (opcional{seleccionados.size > 0 ? ` · ${seleccionados.size} seleccionado${seleccionados.size !== 1 ? 's' : ''}` : ''})
      </span>
      {lista.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {lista.map(m => (
            <span key={m.cve_mun} className="flex items-center gap-1 text-[10px] bg-[#fbf3f6] text-[#7B1C3E] px-1.5 py-0.5 rounded-full">
              {m.nombre}
              <button type="button" onClick={() => toggle(m.cve_mun)} className="hover:text-red-600" title="Quitar">
                <X size={9} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="max-h-32 overflow-y-auto border border-gray-200 rounded bg-white divide-y divide-gray-50">
        {opciones.length === 0 ? (
          <p className="text-[11px] text-gray-400 px-2 py-1.5">Selecciona un estado primero</p>
        ) : opciones.map(o => (
          <label key={o.value} className="flex items-center gap-1.5 px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-50 cursor-pointer">
            <input
              type="checkbox"
              checked={seleccionados.has(o.value)}
              onChange={() => toggle(o.value)}
              className="accent-[#7B1C3E]"
            />
            {o.label}
          </label>
        ))}
      </div>
    </div>
  );
}

export default function TerritorioSelector({ data, onGuardar, soloLectura, soportarZM = true }) {
  const [catalogs, setCatalogs] = useState({ estados_geo: [], municipios: [], zm: [] });
  const [muniFilter, setMuniFilter] = useState(data.cve_ent || null);
  const [modoTerritorio, setModoTerritorio] = useState(() => data.id_zm ? 'zm' : 'estado');
  const [confirmCambioModo, setConfirmCambioModo] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const peticiones = [client.get('/geo/estados')];
        if (soportarZM) peticiones.push(client.get('/geo/zm'));
        const [estRes, zmRes] = await Promise.all(peticiones);
        setCatalogs(prev => ({ ...prev, estados_geo: estRes.data.datos || [], zm: zmRes?.data.datos || [] }));
      } catch (e) { console.error('Error cargando catálogos de territorio:', e); }
    })();
  }, [soportarZM]);

  useEffect(() => {
    if (!muniFilter) { setCatalogs(prev => ({ ...prev, municipios: [] })); return; }
    (async () => {
      try {
        const res = await client.get('/geo/municipios', { params: { cve_ent: muniFilter } });
        setCatalogs(prev => ({ ...prev, municipios: res.data.datos || [] }));
      } catch { setCatalogs(prev => ({ ...prev, municipios: [] })); }
    })();
  }, [muniFilter]);

  function requestCambioModo(nuevoModo) {
    const tieneData = nuevoModo === 'zm' ? (data.cve_ent || (data.municipios || []).length > 0) : data.id_zm;
    if (tieneData) setConfirmCambioModo(nuevoModo);
    else aplicarCambioModo(nuevoModo);
  }
  function aplicarCambioModo(modo) {
    setConfirmCambioModo(null);
    setModoTerritorio(modo);
    if (modo === 'zm') {
      if (data.cve_ent) onGuardar('cve_ent', null);
      if ((data.municipios || []).length > 0) onGuardar('municipios', []);
      setMuniFilter(null);
    } else if (data.id_zm) {
      onGuardar('id_zm', null);
    }
  }

  return (
    <div className="space-y-2">
      {confirmCambioModo && (
        <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-[11px] font-medium text-amber-800 mb-2">
            Cambiar de modo borrará el territorio actual. ¿Continuar?
          </p>
          <div className="flex gap-2">
            <button onClick={() => aplicarCambioModo(confirmCambioModo)}
              className="px-2.5 py-1 bg-amber-600 text-white rounded text-[11px] font-medium hover:bg-amber-700">
              Sí, cambiar
            </button>
            <button onClick={() => setConfirmCambioModo(null)}
              className="px-2.5 py-1 bg-white border border-gray-300 rounded text-[11px] hover:bg-gray-50">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Modo A: Estado + Municipios */}
      <div
        onClick={() => !soloLectura && modoTerritorio !== 'estado' && requestCambioModo('estado')}
        className={`rounded-lg border-2 transition-all ${modoTerritorio === 'estado' ? 'border-[#7B1C3E] bg-[#fbf3f6]' : 'border-gray-200 bg-gray-50/80 opacity-60 cursor-pointer hover:opacity-75'}`}
      >
        <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${modoTerritorio === 'estado' ? 'border-[#7B1C3E] bg-[#7B1C3E]' : 'border-gray-400'}`}>
              {modoTerritorio === 'estado' && <div className="w-1 h-1 bg-white rounded-full" />}
            </div>
            <span className="text-[11px] font-semibold text-gray-700">{soportarZM ? 'Modo A · Estado' : 'Estado'}</span>
          </div>
          {soportarZM && modoTerritorio !== 'estado' && <span className="text-[9px] text-gray-400">🔒 Bloqueado — elegiste el otro modo</span>}
        </div>
        {modoTerritorio === 'estado' && (
          <div className="px-3 pb-3 space-y-2">
            <p className="text-[10px] text-gray-400 leading-tight">Usar cuando el proyecto opera en un área específica de un estado.</p>
            <Select label="Estado" valor={data.cve_ent || ''}
              opciones={catalogs.estados_geo.map(e => ({ value: e.cve_ent, label: e.nombre }))}
              onChange={v => { setMuniFilter(v || null); onGuardar('cve_ent', v || null); if (!v) onGuardar('municipios', []); }}
              soloLectura={soloLectura} />
            <MultiSelectMunicipios
              municipios={data.municipios || []}
              opciones={catalogs.municipios.map(m => ({ value: m.cvegeo, label: m.nombre }))}
              onChange={lista => onGuardar('municipios', lista)}
              soloLectura={soloLectura || !muniFilter}
            />
          </div>
        )}
      </div>

      {/* Modo B: Zona Metropolitana */}
      {soportarZM && (
        <div
          onClick={() => !soloLectura && modoTerritorio !== 'zm' && requestCambioModo('zm')}
          className={`rounded-lg border-2 transition-all ${modoTerritorio === 'zm' ? 'border-[#7B1C3E] bg-[#fbf3f6]' : 'border-gray-200 bg-gray-50/80 opacity-60 cursor-pointer hover:opacity-75'}`}
        >
          <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${modoTerritorio === 'zm' ? 'border-[#7B1C3E] bg-[#7B1C3E]' : 'border-gray-400'}`}>
                {modoTerritorio === 'zm' && <div className="w-1 h-1 bg-white rounded-full" />}
              </div>
              <span className="text-[11px] font-semibold text-gray-700">Modo B · Zona Metropolitana</span>
            </div>
            {modoTerritorio !== 'zm' && <span className="text-[9px] text-gray-400">🔒 Bloqueado — elegiste el otro modo</span>}
          </div>
          {modoTerritorio === 'zm' && (
            <div className="px-3 pb-3 space-y-2">
              <p className="text-[10px] text-gray-400 leading-tight">La ZM ya contiene sus municipios y estados. No requiere elegir más.</p>
              <Select label="Zona Metropolitana" valor={data.id_zm ? String(data.id_zm) : ''}
                opciones={catalogs.zm.map(z => ({ value: String(z.gid), label: z.nombre }))}
                onChange={v => onGuardar('id_zm', v ? parseInt(v, 10) : null)}
                soloLectura={soloLectura} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
