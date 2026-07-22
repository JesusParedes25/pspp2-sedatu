/**
 * ARCHIVO: TerritorioSelector.jsx
 * PROPÓSITO: Selector de territorio (Modo A: Estado+Municipio / Modo B: Zona
 *            Metropolitana, regla exclusiva) — extraído de EtapasAvancesMD
 *            para reusarse también desde las tarjetas expandibles (NodoCard).
 */
import { useState, useEffect } from 'react';
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

export default function TerritorioSelector({ data, onGuardar, soloLectura }) {
  const [catalogs, setCatalogs] = useState({ estados_geo: [], municipios: [], zm: [] });
  const [muniFilter, setMuniFilter] = useState(data.cve_ent || null);
  const [modoTerritorio, setModoTerritorio] = useState(() => data.id_zm ? 'zm' : 'estado');
  const [confirmCambioModo, setConfirmCambioModo] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [estRes, zmRes] = await Promise.all([client.get('/geo/estados'), client.get('/geo/zm')]);
        setCatalogs(prev => ({ ...prev, estados_geo: estRes.data.datos || [], zm: zmRes.data.datos || [] }));
      } catch (e) { console.error('Error cargando catálogos de territorio:', e); }
    })();
  }, []);

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
    const tieneData = nuevoModo === 'zm' ? (data.cve_ent || data.cve_mun) : data.id_zm;
    if (tieneData) setConfirmCambioModo(nuevoModo);
    else aplicarCambioModo(nuevoModo);
  }
  function aplicarCambioModo(modo) {
    setConfirmCambioModo(null);
    setModoTerritorio(modo);
    if (modo === 'zm') {
      if (data.cve_ent) onGuardar('cve_ent', null);
      if (data.cve_mun) onGuardar('cve_mun', null);
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

      {/* Modo A: Estado + Municipio */}
      <div
        onClick={() => !soloLectura && modoTerritorio !== 'estado' && requestCambioModo('estado')}
        className={`rounded-lg border-2 transition-all ${modoTerritorio === 'estado' ? 'border-[#7B1C3E] bg-[#fbf3f6]' : 'border-gray-200 bg-gray-50/80 opacity-60 cursor-pointer hover:opacity-75'}`}
      >
        <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${modoTerritorio === 'estado' ? 'border-[#7B1C3E] bg-[#7B1C3E]' : 'border-gray-400'}`}>
              {modoTerritorio === 'estado' && <div className="w-1 h-1 bg-white rounded-full" />}
            </div>
            <span className="text-[11px] font-semibold text-gray-700">Modo A · Estado</span>
          </div>
          {modoTerritorio !== 'estado' && <span className="text-[9px] text-gray-400">🔒 Bloqueado — elegiste el otro modo</span>}
        </div>
        {modoTerritorio === 'estado' && (
          <div className="px-3 pb-3 space-y-2">
            <p className="text-[10px] text-gray-400 leading-tight">Usar cuando el proyecto opera en un área específica de un estado.</p>
            <Select label="Estado" valor={data.cve_ent || ''}
              opciones={catalogs.estados_geo.map(e => ({ value: e.cve_ent, label: e.nombre }))}
              onChange={v => { setMuniFilter(v || null); onGuardar('cve_ent', v || null); if (!v) onGuardar('cve_mun', null); }}
              soloLectura={soloLectura} />
            <Select label="Municipio (opcional)" valor={data.cve_mun || ''}
              opciones={catalogs.municipios.map(m => ({ value: m.cvegeo, label: m.nombre }))}
              onChange={v => onGuardar('cve_mun', v || null)}
              soloLectura={soloLectura || !muniFilter} />
          </div>
        )}
      </div>

      {/* Modo B: Zona Metropolitana */}
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
    </div>
  );
}
