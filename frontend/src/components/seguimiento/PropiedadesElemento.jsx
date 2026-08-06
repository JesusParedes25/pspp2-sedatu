/**
 * ARCHIVO: PropiedadesElemento.jsx
 * PROPÓSITO: Rail de "Propiedades" de un nodo (etapa/acción/tarea) —
 *            Seguimiento (calculado vs. definido), Participantes,
 *            Clasificación y Territorio. Extraído de PanelDetalle para que
 *            "Detalle" (columna) y la futura vista "Diagrama" (drawer)
 *            monten exactamente el mismo componente, cada uno en su propio
 *            contenedor.
 *
 * MINI-CLASE: por qué es autosuficiente
 * ─────────────────────────────────────────────────────────────────
 * Solo recibe `nodo` ({tipo, id, data}), `permisos`, `onActualizado` y
 * `mostrarToast` — carga sus propios catálogos y calcula por su cuenta
 * (sem, esContenedor, hijos, fechaSugerida, etc.) a partir de `nodo.data`,
 * igual que antes hacía PanelDetalle. Así, quien lo monte (columna o
 * drawer) no necesita pasarle una docena de props ya calculadas.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect } from 'react';
import { Lock, Info } from 'lucide-react';
import { useJerarquiaProyecto } from '../../hooks/useJerarquiaProyecto';
import client from '../../api/client';
import SeccionMiembrosNodo from './SeccionMiembrosNodo';
import CampoFecha from '../common/CampoFecha';
import { formatFecha, estaVencida } from '../../utils/fecha';
import RailCard from './EtapasAvancesMD/RailCard';
import { CampoSelect, CampoAvance, CampoSemaforo, SelectorMunicipiosMultiple } from './EtapasAvancesMD/Campos';
import { ESTADOS, PRIORIDADES } from './EtapasAvancesMD/utils';

export default function PropiedadesElemento({ nodo, permisos, onActualizado, mostrarToast }) {
  const { tipo, id, data } = nodo;
  const { actualizar } = useJerarquiaProyecto();

  const [catalogs, setCatalogs] = useState({
    escalas: [], instrumentos: [], estados_geo: [], municipios: [], zm: [], usuarios: []
  });
  const [muniFilter, setMuniFilter] = useState(data.cve_ent || null);
  const [modoTerritorio, setModoTerritorio] = useState(() => data.id_zm ? 'zm' : 'estado');
  const [confirmCambioModo, setConfirmCambioModo] = useState(null);

  // El territorio depende de qué nodo está seleccionado — sin esto, al navegar
  // de un nodo en modo ZM a uno en modo Estado (o viceversa) el rail se queda
  // mostrando el modo del nodo anterior en vez de reflejar los datos reales.
  useEffect(() => {
    setModoTerritorio(data.id_zm ? 'zm' : 'estado');
    setMuniFilter(data.cve_ent || null);
    setConfirmCambioModo(null);
  }, [id]);

  // Cargar catálogos una vez
  useEffect(() => {
    (async () => {
      try {
        const [escRes, instRes, estRes, zmRes, usrRes] = await Promise.all([
          client.get('/catalogos/valores', { params: { tipo: 'escala_territorial' } }),
          client.get('/catalogos/valores', { params: { tipo: 'instrumento' } }),
          client.get('/geo/estados'),
          client.get('/geo/zm'),
          client.get('/catalogos/usuarios'),
        ]);
        setCatalogs({
          escalas: (escRes.data.datos || []).map(c => c.valor),
          instrumentos: (instRes.data.datos || []).map(c => c.valor),
          estados_geo: estRes.data.datos || [],
          municipios: [],
          zm: zmRes.data.datos || [],
          usuarios: usrRes.data.datos || [],
        });
      } catch (e) { console.error('Error cargando catálogos:', e); }
    })();
  }, [])

  // Cargar municipios cuando cambia el estado geográfico
  useEffect(() => {
    if (!muniFilter) { setCatalogs(prev => ({ ...prev, municipios: [] })); return; }
    (async () => {
      try {
        const res = await client.get('/geo/municipios', { params: { cve_ent: muniFilter } });
        setCatalogs(prev => ({ ...prev, municipios: res.data.datos || [] }));
      } catch { setCatalogs(prev => ({ ...prev, municipios: [] })); }
    })();
  }, [muniFilter]);

  const sem = data.semaforo_efectivo || 'gris';
  const avance = data.avance_efectivo ?? (tipo === 'etapa' ? parseFloat(data.porcentaje_calculado || 0) : parseFloat(data.porcentaje_avance || 0));
  const esContenedor = tipo === 'etapa' || (data.es_hoja === false);

  // Hijos — mismo cómputo que PanelDetalle, para poder sugerir fecha límite
  // desde ellos sin depender de que el padre nos lo pase ya calculado.
  const hijos = tipo === 'etapa'
    ? (data.acciones || []).map(a => ({ tipo: 'accion', nodo: a }))
    : tipo === 'accion'
      ? [
          ...(data.subacciones || []).map(s => ({ tipo: 'accion', nodo: s })),
          ...(data.tareas || []).map(t => ({ tipo: 'tarea', nodo: t })),
        ]
      : [];
  const subItemLabel = tipo === 'etapa' ? 'Acciones' : 'Tareas';

  async function guardarCampo(campo, valor) {
    try {
      await actualizar(tipo, id, campo, valor);
      mostrarToast('Actualizado', 'exito');
      onActualizado?.();
    } catch (err) {
      mostrarToast(err.response?.data?.mensaje || 'Error al actualizar', 'error');
    }
  }

  function requestCambioModo(nuevoModo) {
    const tieneData = nuevoModo === 'zm' ? (data.cve_ent || (data.municipios || []).length > 0) : data.id_zm;
    if (tieneData) { setConfirmCambioModo(nuevoModo); }
    else { aplicarCambioModo(nuevoModo); }
  }
  function aplicarCambioModo(modo) {
    setConfirmCambioModo(null);
    setModoTerritorio(modo);
    if (modo === 'zm') {
      if (data.cve_ent) guardarCampo('cve_ent', null);
      if ((data.municipios || []).length > 0) guardarCampo('municipios', []);
      setMuniFilter(null);
    } else {
      if (data.id_zm) guardarCampo('id_zm', null);
    }
  }

  const tooltipCalculado = 'Se calcula a partir de sus partes. Actualiza las tareas/acciones que contiene.';
  // La fecha de inicio de una ETAPA se recalcula automáticamente (la más
  // temprana entre sus acciones, ver recalcularEtapa en recalculos.js) cada
  // vez que cambia cualquier acción de la etapa — editarla a mano aquí no
  // sirve de nada porque se sobrescribe en el siguiente recálculo.
  const fechaInicioCalculada = tipo === 'etapa';
  const tooltipFechaInicio = 'La fecha de inicio de una etapa se calcula automáticamente como la más temprana entre sus acciones.';

  // "Fecha límite" cambia de nombre y de ayuda según el nivel — en una
  // etapa es un compromiso agregado que puede no coincidir con ninguna
  // fecha de sus acciones; en acción/tarea es simplemente su vencimiento.
  const labelFechaLimite = tipo === 'etapa' ? 'Fecha compromiso de la etapa'
    : tipo === 'tarea' ? 'Fecha límite de la tarea' : 'Fecha límite de la acción';
  const ayudaFechaLimite = tipo === 'etapa'
    ? 'Fecha objetivo de esta etapa; puede ser distinta a las fechas de sus acciones.' : null;

  // Si no hay fecha límite propia, sugerir la más tardía entre los hijos
  // (mismo criterio fecha_limite || fecha_fin que usa el resto de la app)
  // en vez de dejar el campo vacío sin explicación.
  const fechaSugerida = !data.fecha_limite && hijos.length > 0
    ? hijos.reduce((max, h) => {
        const f = h.nodo.fecha_limite || h.nodo.fecha_fin || null;
        return f && (!max || f > max) ? f : max;
      }, null)
    : null;

  return (
    <>
      {/* ── Tarjeta: Seguimiento ── */}
      <RailCard title="Seguimiento" defaultOpen={true}>
        {/* Bloque "calculado" — separación visual real (no solo un
            candado chico) de lo que se agrega automáticamente de los
            hijos vs. lo que se define en este nivel. */}
        {esContenedor && (
          <div className="mb-3 -mx-1 px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-lg">
            <div className="flex items-center gap-1 mb-2">
              <Lock size={10} className="text-gray-400" />
              <span className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Calculado desde sus acciones</span>
            </div>
            {/* Estatus */}
            <div className="mb-2">
              <span className="text-[10px] text-gray-400 uppercase tracking-wider block mb-0.5">Estatus</span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-600">{(data.estado || 'Pendiente').replace(/_/g, ' ')}</span>
                <span title={tooltipCalculado} className="w-3.5 h-3.5 rounded-full border border-gray-300 text-[9px] text-gray-400 flex items-center justify-center cursor-help font-bold flex-shrink-0">?</span>
              </div>
            </div>
            {/* Avance */}
            <div className="mb-1">
              <CampoAvance
                valor={data.avance_actual} avanceEfectivo={avance} esContenedor={true}
                estado={data.estado} onChange={() => {}}
                soloLectura={true}
              />
            </div>
            {/* Fecha inicio (solo etapa, ver fechaInicioCalculada) */}
            {fechaInicioCalculada && (
              <div className="mt-2">
                <span className="text-[10px] text-gray-400 uppercase tracking-wider block mb-0.5">Fecha inicio</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-600">{formatFecha(data.fecha_inicio) || 'Sin definir'}</span>
                  <span title={tooltipFechaInicio} className="w-3.5 h-3.5 rounded-full border border-gray-300 text-[9px] text-gray-400 flex items-center justify-center cursor-help font-bold flex-shrink-0">?</span>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mb-2">
          <span className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Definido para este nivel</span>
        </div>

        {!esContenedor && (
          <>
            {/* Estatus editable (solo nodos hoja) */}
            <div className="mb-2">
              <CampoSelect
                label="Estatus"
                valor={data.estado || 'Pendiente'} opciones={ESTADOS}
                onChange={v => guardarCampo('estado', v)}
                soloLectura={permisos.esSoloLectura} formatLabel={v => v.replace(/_/g, ' ')}
              />
            </div>
            {/* Sin campo de avance aquí a propósito: es hoja, y "Registrar
                avance" (en las acciones rápidas de arriba) ya cubre exactamente
                lo mismo — tenerlo dos veces confundía más de lo que ayudaba. */}
            {/* Fecha inicio editable (acción/tarea; en etapa siempre es calculada) */}
            <div className="mb-2">
              <CampoFecha
                label="Fecha inicio"
                valor={data.fecha_inicio ? data.fecha_inicio.substring(0, 10) : ''}
                onChange={v => guardarCampo('fecha_inicio', v || null)}
                soloLectura={permisos.esSoloLectura}
              />
            </div>
          </>
        )}

        {/* Semáforo (override manual — disponible en cualquier nivel) */}
        <div className="mb-2">
          <CampoSemaforo
            valor={data.semaforo} override={data.semaforo_override} efectivo={sem}
            onChange={v => guardarCampo('semaforo', v)} soloLectura={permisos.esSoloLectura}
          />
        </div>
        {/* Prioridad */}
        <div className="mb-2">
          <CampoSelect
            label="Prioridad" valor={data.prioridad || ''} opciones={PRIORIDADES}
            onChange={v => guardarCampo('prioridad', v)} soloLectura={permisos.esSoloLectura}
          />
        </div>
        {/* Fecha límite / compromiso — etiqueta y ayuda según nivel;
            sugiere una fecha desde los hijos cuando está vacía en vez de
            dejar un dd/mm/aaaa sin explicación. */}
        <div className="mb-2">
          <span className="text-[10px] text-gray-400 uppercase tracking-wider block mb-0.5">{labelFechaLimite}</span>
          {ayudaFechaLimite && <p className="text-[9px] text-gray-400 leading-snug mb-1">{ayudaFechaLimite}</p>}
          <CampoFecha
            valor={data.fecha_limite ? data.fecha_limite.substring(0, 10) : ''}
            onChange={v => guardarCampo('fecha_limite', v || null)}
            soloLectura={permisos.esSoloLectura}
          />
          {!data.fecha_limite && fechaSugerida && (
            <div className="mt-1 flex items-center gap-1 text-[10px] text-gray-500">
              <Info size={10} className="text-gray-400 flex-shrink-0" />
              <span>Sugerido según {subItemLabel.toLowerCase()}: {formatFecha(fechaSugerida)}</span>
              {!permisos.esSoloLectura && (
                <button
                  onClick={() => guardarCampo('fecha_limite', fechaSugerida)}
                  className="text-[#7B1C3E] hover:text-[#5a1430] font-medium underline underline-offset-2"
                >
                  Usar esta fecha
                </button>
              )}
            </div>
          )}
          {!data.fecha_limite && !fechaSugerida && (
            <p className="mt-1 text-[10px] text-gray-400 italic">Sin fecha definida</p>
          )}
        </div>

        {/* Responsable (siempre solo lectura) */}
        <div className="mb-2">
          <CampoSelect
            label="Responsable" valor={data.id_responsable || ''}
            opciones={catalogs.usuarios.map(u => ({ value: u.id, label: `${u.nombre_completo}${u.dg_siglas ? ' — ' + u.dg_siglas : ''}` }))}
            onChange={() => {}} soloLectura={true} useObjects
          />
        </div>
        {/* Última actualización */}
        <div>
          <span className="text-[10px] text-gray-400 uppercase tracking-wider block mb-0.5">Última actualización</span>
          <span className="text-xs text-gray-400">
            {data.updated_at ? new Date(data.updated_at).toLocaleString('es-MX') : '—'}
          </span>
        </div>
      </RailCard>

      {/* ── Tarjeta: Participantes ── */}
      <RailCard title="Participantes" defaultOpen={true}>
        <SeccionMiembrosNodo
          tipo={tipo}
          idNodo={id}
          permisos={permisos}
        />
      </RailCard>

      {/* ── Tarjetas solo para etapas y acciones ── */}
      {tipo !== 'tarea' && (<>
        <RailCard title="Clasificación" defaultOpen={false}>
          <CampoSelect
            label="Instrumento principal" valor={data.instrumento || ''}
            opciones={catalogs.instrumentos}
            onChange={v => guardarCampo('instrumento', v || null)}
            soloLectura={permisos.esSoloLectura}
          />
          <div className="mt-2">
            <CampoSelect
              label="Escala territorial" valor={data.escala_territorial || ''}
              opciones={catalogs.escalas}
              onChange={v => guardarCampo('escala_territorial', v || null)}
              soloLectura={permisos.esSoloLectura}
            />
          </div>
        </RailCard>

        <RailCard title="Territorio" defaultOpen={false}>
          {confirmCambioModo && (
            <div className="mb-3 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
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
            onClick={() => !permisos.esSoloLectura && modoTerritorio !== 'estado' && requestCambioModo('estado')}
            className={`rounded-lg border-2 transition-all mb-2 ${modoTerritorio === 'estado' ? 'border-[#7B1C3E] bg-[#fbf3f6]' : 'border-gray-200 bg-gray-50/80 opacity-60 cursor-pointer hover:opacity-75'}`}
          >
            <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${modoTerritorio === 'estado' ? 'border-[#7B1C3E] bg-[#7B1C3E]' : 'border-gray-400'}`}>
                  {modoTerritorio === 'estado' && <div className="w-1 h-1 bg-white rounded-full"/>}
                </div>
                <span className="text-[11px] font-semibold text-gray-700">Modo A · Estado</span>
              </div>
              {modoTerritorio !== 'estado' && <span className="text-[9px] text-gray-400">🔒 Bloqueado</span>}
            </div>
            {modoTerritorio === 'estado' && (
              <div className="px-3 pb-3 space-y-2">
                <p className="text-[10px] text-gray-400 leading-tight">Los municipios pueden ser de distintos estados — usa este selector solo para buscar y agregar, no borra lo ya elegido en otros estados.</p>
                <CampoSelect label="Buscar municipios de este estado" valor={data.cve_ent || ''}
                  opciones={catalogs.estados_geo.map(e => ({ value: e.cve_ent, label: e.nombre }))}
                  onChange={v => { setMuniFilter(v || null); guardarCampo('cve_ent', v || null); }}
                  soloLectura={permisos.esSoloLectura} useObjects/>
                <SelectorMunicipiosMultiple
                  municipios={data.municipios || []}
                  opciones={catalogs.municipios.map(m => ({ value: m.cvegeo, label: m.nombre }))}
                  onChange={lista => guardarCampo('municipios', lista)}
                  soloLectura={permisos.esSoloLectura || !muniFilter}
                  estadosCatalog={catalogs.estados_geo}
                />
              </div>
            )}
          </div>

          {/* Modo B: Zona Metropolitana */}
          <div
            onClick={() => !permisos.esSoloLectura && modoTerritorio !== 'zm' && requestCambioModo('zm')}
            className={`rounded-lg border-2 transition-all ${modoTerritorio === 'zm' ? 'border-[#7B1C3E] bg-[#fbf3f6]' : 'border-gray-200 bg-gray-50/80 opacity-60 cursor-pointer hover:opacity-75'}`}
          >
            <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${modoTerritorio === 'zm' ? 'border-[#7B1C3E] bg-[#7B1C3E]' : 'border-gray-400'}`}>
                  {modoTerritorio === 'zm' && <div className="w-1 h-1 bg-white rounded-full"/>}
                </div>
                <span className="text-[11px] font-semibold text-gray-700">Modo B · Zona Metropolitana</span>
              </div>
              {modoTerritorio !== 'zm' && <span className="text-[9px] text-gray-400">🔒 Bloqueado</span>}
            </div>
            {modoTerritorio === 'zm' && (
              <div className="px-3 pb-3 space-y-2">
                <p className="text-[10px] text-gray-400 leading-tight">La ZM ya contiene sus municipios y estados. No requiere elegir más.</p>
                <CampoSelect label="Zona Metropolitana" valor={data.id_zm ? String(data.id_zm) : ''}
                  opciones={catalogs.zm.map(z => ({ value: String(z.gid), label: z.nombre }))}
                  onChange={v => guardarCampo('id_zm', v ? parseInt(v, 10) : null)}
                  soloLectura={permisos.esSoloLectura} useObjects/>
              </div>
            )}
          </div>
        </RailCard>
      </>)}
    </>
  );
}
