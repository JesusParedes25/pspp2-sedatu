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
import { Info, SlidersHorizontal, Users, Tag, MapPin, Pencil } from 'lucide-react';
import { useJerarquiaProyecto } from '../../hooks/useJerarquiaProyecto';
import client from '../../api/client';
import SeccionMiembrosNodo from './SeccionMiembrosNodo';
import CampoFecha from '../common/CampoFecha';
import { formatFecha, estaVencida } from '../../utils/fecha';
import RailCard from './EtapasAvancesMD/RailCard';
import { CampoSelect, CampoSemaforo, CampoTextoInline, SelectorMunicipiosMultiple } from './EtapasAvancesMD/Campos';
import { ESTADOS, PRIORIDADES } from './EtapasAvancesMD/utils';
import { permisosDeNodo } from '../../hooks/usePermisos';

export default function PropiedadesElemento({ nodo, permisos: permisosProyecto, proyectoId, onActualizado, mostrarToast }) {
  const { tipo, id, data } = nodo;
  // Quien fue invitado solo a una etapa captura en ella y en lo que cuelga
  // de ella, no en el resto del proyecto.
  const permisos = permisosDeNodo(permisosProyecto, tipo, id);
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
      {/* ── Tarjeta: Definido en este nivel ── */}
      {/* El bloque "calculado desde sus X" / "avance editable" ya NO vive
          aquí — se movió a BloqueCalculado/BloqueEditable, montados por
          quien use este componente (PanelDetalle, PanelDrawer) justo
          arriba, fuera de esta tarjeta colapsable. Esta tarjeta solo
          cubre lo que se define en ESTE nivel sin importar si es
          contenedor u hoja (semáforo, prioridad, fecha límite, responsable),
          más estatus/fecha-inicio cuando sí se editan aquí (nodo hoja). */}
      <RailCard title="Definido en este nivel" icono={SlidersHorizontal} defaultOpen={true}>
        {/* Fila de resumen: Estatus (solo hoja) · Semáforo · Prioridad —
            los tres campos que se leen de un vistazo, como píldoras en
            línea en vez de una lista vertical de campos idénticos. */}
        <div className="flex items-center gap-1.5 flex-wrap mb-3">
          {!esContenedor && (
            <CampoSelect
              label="Estatus" variante="chip"
              valor={data.estado || 'Pendiente'} opciones={ESTADOS}
              onChange={v => guardarCampo('estado', v)}
              soloLectura={permisos.esSoloLectura} formatLabel={v => v.replace(/_/g, ' ')}
            />
          )}
          <CampoSemaforo
            variante="chip"
            valor={data.semaforo} override={data.semaforo_override} efectivo={sem}
            onChange={v => guardarCampo('semaforo', v)} soloLectura={permisos.esSoloLectura}
          />
          <CampoSelect
            label="Prioridad" variante="chip"
            valor={data.prioridad || ''} opciones={PRIORIDADES}
            onChange={v => guardarCampo('prioridad', v)} soloLectura={permisos.esSoloLectura}
          />
        </div>

        {/* Estatus cualitativo — una frase corta, texto libre, escrita a
            mano ("¿cómo va esto ahora mismo?"). Distinto de Estatus
            (enum rígido), Semáforo (color calculado) y Avance (número):
            es la única señal narrativa, pensada para verse de un
            vistazo en Tablero y Panorama del proyecto. Cada cambio
            también queda en el historial de Actividad de este nodo.
            Envuelto en una caja con borde punteado + ícono de lápiz: sin
            eso, el texto en cursiva se leía como una nota informativa
            cualquiera, no como un campo capturable (bug reportado). */}
        <div className="mb-3">
          <label className="text-[10px] text-gray-400 font-medium uppercase tracking-wide block mb-0.5">
            Estatus cualitativo
          </label>
          <div className={`flex items-center gap-1.5 border border-dashed rounded-md px-2 py-1.5 ${permisos.esSoloLectura ? 'border-gray-100' : 'border-gray-300 bg-gray-50/60'}`}>
            <CampoTextoInline
              valor={data.estatus_cualitativo || ''}
              campo="estatus_cualitativo"
              onGuardar={v => guardarCampo('estatus_cualitativo', v)}
              soloLectura={permisos.esSoloLectura}
              placeholder="¿Cómo va esto ahora mismo?"
              className="text-xs text-gray-700 italic flex-1 min-w-0"
              maxLength={100}
            />
            {!permisos.esSoloLectura && <Pencil size={11} className="text-gray-400 flex-shrink-0" />}
          </div>
        </div>

        {/* Fechas — mini-grid de 2 columnas (en nodo hoja; en contenedor la
            fecha de inicio ya se ve en el bloque calculado de arriba, aquí
            solo va la fecha límite/compromiso, sola). */}
        <div className={`grid gap-2.5 mb-3 ${esContenedor ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {!esContenedor && (
            <CampoFecha
              label="Fecha inicio"
              valor={data.fecha_inicio ? data.fecha_inicio.substring(0, 10) : ''}
              onChange={v => guardarCampo('fecha_inicio', v || null)}
              soloLectura={permisos.esSoloLectura}
            />
          )}
          <div>
            <span className="text-[10px] text-gray-400 block mb-0.5">{labelFechaLimite}</span>
            <CampoFecha
              valor={data.fecha_limite ? data.fecha_limite.substring(0, 10) : ''}
              onChange={v => guardarCampo('fecha_limite', v || null)}
              soloLectura={permisos.esSoloLectura}
            />
          </div>
        </div>
        {ayudaFechaLimite && <p className="text-[10px] text-gray-400 leading-snug -mt-2 mb-2.5">{ayudaFechaLimite}</p>}
        {!data.fecha_limite && fechaSugerida && (
          <div className="flex items-center gap-1 text-[10px] text-gray-500 -mt-2 mb-2.5">
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

        {/* Pie de tarjeta: Responsable + última actualización, en gris,
            discreto — información de contexto, no algo que se edite aquí. */}
        <div className="pt-2.5 border-t border-gray-100 flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs text-gray-600">
            {(() => {
              const resp = catalogs.usuarios.find(u => u.id === data.id_responsable);
              return resp ? `${resp.nombre_completo}${resp.dg_siglas ? ' — ' + resp.dg_siglas : ''}` : 'Sin responsable asignado';
            })()}
          </span>
          <span className="text-[10px] text-gray-400 flex-shrink-0" title="Última actualización">
            {data.updated_at ? new Date(data.updated_at).toLocaleString('es-MX') : '—'}
          </span>
        </div>
      </RailCard>

      {/* ── Tarjeta: Participantes ── */}
      <RailCard title="Participantes" icono={Users} defaultOpen={true}>
        <SeccionMiembrosNodo
          tipo={tipo}
          idNodo={id}
          permisos={permisos}
          idProyecto={proyectoId}
          nombreNodo={data.nombre}
        />
      </RailCard>

      {/* ── Tarjetas solo para etapas y acciones ── */}
      {tipo !== 'tarea' && (<>
        <RailCard title="Clasificación" icono={Tag} defaultOpen={false}>
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

        <RailCard title="Territorio" icono={MapPin} defaultOpen={false}>
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

          {/* Selector segmentado (tipo tab) en vez de dos tarjetas de radio
              apiladas con candado — mismo cambio de modo, menos alto y sin
              el emoji 🔒 (inconsistente con los íconos lucide del resto). */}
          <div className="inline-flex bg-gray-100 rounded-lg p-0.5 mb-3 w-full">
            <button
              type="button"
              onClick={() => !permisos.esSoloLectura && modoTerritorio !== 'estado' && requestCambioModo('estado')}
              disabled={permisos.esSoloLectura}
              className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${modoTerritorio === 'estado' ? 'bg-white text-guinda-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Estado
            </button>
            <button
              type="button"
              onClick={() => !permisos.esSoloLectura && modoTerritorio !== 'zm' && requestCambioModo('zm')}
              disabled={permisos.esSoloLectura}
              className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${modoTerritorio === 'zm' ? 'bg-white text-guinda-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Zona Metropolitana
            </button>
          </div>

          {modoTerritorio === 'estado' ? (
            <div className="space-y-2">
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
          ) : (
            <div className="space-y-2">
              <p className="text-[10px] text-gray-400 leading-tight">La ZM ya contiene sus municipios y estados. No requiere elegir más.</p>
              <CampoSelect label="Zona Metropolitana" valor={data.id_zm ? String(data.id_zm) : ''}
                opciones={catalogs.zm.map(z => ({ value: String(z.gid), label: z.nombre }))}
                onChange={v => guardarCampo('id_zm', v ? parseInt(v, 10) : null)}
                soloLectura={permisos.esSoloLectura} useObjects/>
            </div>
          )}
        </RailCard>
      </>)}
    </>
  );
}
