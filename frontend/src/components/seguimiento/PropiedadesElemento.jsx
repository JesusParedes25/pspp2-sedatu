/**
 * ARCHIVO: PropiedadesElemento.jsx
 * PROPÓSITO: Los campos de "Ficha" de un nodo (etapa/acción/tarea) —
 *            semáforo, prioridad, fechas, instrumento y escala
 *            territorial. Vive dentro del grupo "Ficha" del panel derecho
 *            (ver FichaNodo.jsx), que lo muestra en modo lectura y lo
 *            revela aquí, editable, tras el enlace "Editar".
 *
 * Participantes y Territorio dejaron de vivir aquí — son ahora vínculos
 * del grupo "Vinculación" (botones de NodoCard: Invitar participante,
 * Territorio), que ya cubren exactamente lo mismo (SeccionMiembrosNodo /
 * TerritorioSelector) sin duplicar la UI. Estatus cualitativo tampoco
 * vive aquí — se captura en el modal "Registrar avance". Y el Estatus
 * (Pendiente/En_proceso/Bloqueada/Completada/Cancelada) tampoco: vive en
 * FichaNodo, fuera del toggle "Editar" — es un SelectorEstado que guarda
 * solo y pasa por cambiarEstado() (motivo de bloqueo, cascada, auditoría),
 * gobernanza que un CampoSelect de este formulario no tenía.
 *
 * MINI-CLASE: por qué es autosuficiente
 * ─────────────────────────────────────────────────────────────────
 * Solo recibe `nodo` ({tipo, id, data}), `permisos` y `onActualizado` —
 * carga sus propios catálogos y calcula por su cuenta (sem, esContenedor)
 * a partir de `nodo.data`. Así, quien lo monte no necesita pasarle una
 * docena de props ya calculadas.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect } from 'react';
import { useJerarquiaProyecto } from '../../hooks/useJerarquiaProyecto';
import client from '../../api/client';
import CampoFecha from '../common/CampoFecha';
import { formatFecha } from '../../utils/fecha';
import { CampoSelect, CampoSemaforo } from './EtapasAvancesMD/Campos';
import { PRIORIDADES } from './EtapasAvancesMD/utils';
import { permisosDeNodo } from '../../hooks/usePermisos';

export default function PropiedadesElemento({ nodo, permisos: permisosProyecto, onActualizado, mostrarToast }) {
  const { tipo, id, data } = nodo;
  // Quien fue invitado solo a una etapa captura en ella y en lo que cuelga
  // de ella, no en el resto del proyecto.
  const permisos = permisosDeNodo(permisosProyecto, tipo, id);
  const { actualizar } = useJerarquiaProyecto();

  const [catalogs, setCatalogs] = useState({ escalas: [], instrumentos: [], usuarios: [] });

  // Cargar catálogos una vez
  useEffect(() => {
    (async () => {
      try {
        const [escRes, instRes, usrRes] = await Promise.all([
          client.get('/catalogos/valores', { params: { tipo: 'escala_territorial' } }),
          client.get('/catalogos/valores', { params: { tipo: 'instrumento' } }),
          client.get('/catalogos/usuarios'),
        ]);
        setCatalogs({
          escalas: (escRes.data.datos || []).map(c => c.valor),
          instrumentos: (instRes.data.datos || []).map(c => c.valor),
          usuarios: usrRes.data.datos || [],
        });
      } catch (e) { console.error('Error cargando catálogos:', e); }
    })();
  }, [])

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
      mostrarToast?.('Actualizado', 'exito');
      onActualizado?.();
    } catch (err) {
      mostrarToast?.(err.response?.data?.mensaje || 'Error al actualizar', 'error');
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
    <div>
      {/* Fila de resumen: Semáforo · Prioridad — se leen de un vistazo, como
          píldoras en línea. Estatus vive aparte, siempre visible arriba de
          este formulario (FichaNodo) — no se repite aquí. */}
      <div className="flex items-center gap-1.5 flex-wrap mb-3">
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

      {/* Fechas — mini-grid de 2 columnas (en nodo hoja; en contenedor la
          fecha de inicio se calcula sola, aquí solo va la fecha
          límite/compromiso, sola). */}
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

      {/* Instrumento/escala — no aplican a tarea (siempre hereda de su acción). */}
      {tipo !== 'tarea' && (
        <div className="grid grid-cols-2 gap-2.5 mb-3">
          <CampoSelect
            label="Instrumento principal" valor={data.instrumento || ''}
            opciones={catalogs.instrumentos}
            onChange={v => guardarCampo('instrumento', v || null)}
            soloLectura={permisos.esSoloLectura}
          />
          <CampoSelect
            label="Escala territorial" valor={data.escala_territorial || ''}
            opciones={catalogs.escalas}
            onChange={v => guardarCampo('escala_territorial', v || null)}
            soloLectura={permisos.esSoloLectura}
          />
        </div>
      )}

      {/* Modo de cálculo del avance — informativo, no editable: lo decide
          la estructura (si tiene hijos o no), no una casilla aparte. */}
      <div className="mb-3">
        <span className="text-[10px] text-gray-400 block mb-0.5">Avance</span>
        <p className="text-xs text-gray-600">
          {esContenedor ? 'Automático — se calcula a partir de sus partes.' : 'Manual — se registra con "Registrar avance".'}
        </p>
      </div>

      {/* Pie: Responsable + última actualización, en gris, discreto. */}
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
    </div>
  );
}
