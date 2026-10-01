/**
 * ARCHIVO: GestorUsuariosProyecto.jsx
 * PROPÓSITO: Gestor de usuarios del proyecto — quién participa, en qué
 *            función y en qué alcance (todo el proyecto, o una etapa/
 *            acción/tarea puntual). Vivía a media altura de "Panorama
 *            del proyecto" (PanoramaProyecto.jsx), mezclado con consulta
 *            de avance/indicadores/riesgos; se extrajo tal cual (mismo
 *            componente, mismas funciones, solo en archivo propio) para
 *            vivir en Configuración → "Equipo y permisos", que es donde
 *            de verdad pertenece administrar personas.
 *
 * Self-contenido: hace su propio fetch de `obtenerPanorama` (que ya
 * trae `miembros` con el detalle de alcance/nodo que esta pantalla
 * necesita) en vez de depender de un padre que también cargue
 * indicadores/riesgos/cobertura que aquí no hacen falta.
 */
import { useState, useEffect, useCallback } from 'react';
import { Users, UserPlus, Layers, Trash2, Search, Loader2, X } from 'lucide-react';
import { NIVELES } from '../../config/niveles';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { usePermisosProyecto } from '../../hooks/usePermisos';
import { obtenerPanorama, crearInvitacion, agregarMiembro, eliminarMiembro } from '../../api/miembros';
import { agregarMiembroNodo, actualizarRolNodo, eliminarMiembroNodo } from '../../api/nodo-miembros';
import client from '../../api/client';
import BotonSolicitarParticipar from './BotonSolicitarParticipar';

const GUINDA = '#7B1C3E';
const ETIQUETA_ALCANCE = { etapa: 'etapa', accion: 'acción', tarea: 'tarea' };

export default function GestorUsuariosProyecto({ proyecto, proyectoId, etapas, abrirInvitarAlMontar = false }) {
  const { usuario } = useAuth();
  const { mostrarToast } = useUI();
  const permisos = usePermisosProyecto(proyecto);
  const [miembros, setMiembros] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [modalInvitar, setModalInvitar] = useState(false);

  // Atajo "Invitar persona" de la Portada: abre el modal de invitación
  // directo al llegar a este apartado.
  useEffect(() => {
    if (abrirInvitarAlMontar) setModalInvitar(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cargar = useCallback(() => {
    if (!proyectoId) return;
    return obtenerPanorama(proyectoId).then(d => setMiembros(d.miembros || []));
  }, [proyectoId]);

  useEffect(() => {
    if (!proyectoId) return;
    setCargando(true);
    cargar().catch(() => {}).finally(() => setCargando(false));
  }, [proyectoId, cargar]);

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={20} className="animate-spin text-guinda-600" />
      </div>
    );
  }

  const miembrosProyecto = miembros.filter(m => m.alcance === 'proyecto');
  const gruposPorNodo = Object.values(
    miembros.filter(m => m.alcance !== 'proyecto').reduce((acc, m) => {
      const clave = m.nodo_id || `${m.alcance}:${m.nodo_nombre}`;
      if (!acc[clave]) acc[clave] = { nodo_id: clave, nodo_tipo: m.nodo_tipo, nodo_nombre: m.nodo_nombre, miembros: [] };
      acc[clave].miembros.push(m);
      return acc;
    }, {})
  );

  async function handleEliminarMiembro(m) {
    const deQue = m.alcance === 'proyecto' ? 'del proyecto' : `de esa ${ETIQUETA_ALCANCE[m.nodo_tipo] || 'parte'}`;
    const esUnoMismo = m.id_usuario === usuario?.id;
    const pregunta = esUnoMismo
      ? `¿Salir ${deQue === 'del proyecto' ? 'del proyecto' : deQue}?`
      : `¿Quitar a ${m.nombre_completo} ${deQue}?`;
    if (!confirm(pregunta)) return;
    try {
      if (m.alcance === 'proyecto') {
        await eliminarMiembro(proyectoId, m.id_usuario);
      } else {
        await eliminarMiembroNodo(m.nodo_tipo, m.nodo_id, m.id_usuario);
      }
      await cargar();
      mostrarToast(esUnoMismo ? 'Saliste del proyecto' : `${m.nombre_completo} fue removido`, 'exito');
    } catch (e) {
      mostrarToast(e.response?.data?.mensaje || (esUnoMismo ? 'Error al salir del proyecto' : 'Error al quitar al usuario'), 'error');
    }
  }

  async function handleCambiarRol(m, nuevoRol) {
    if (nuevoRol === m.rol) return;
    try {
      if (m.alcance === 'proyecto') {
        await agregarMiembro(proyectoId, m.id_usuario, nuevoRol);
      } else {
        await actualizarRolNodo(m.nodo_tipo, m.nodo_id, m.id_usuario, nuevoRol);
      }
      await cargar();
      mostrarToast('Función actualizada', 'exito');
    } catch (e) {
      mostrarToast(e.response?.data?.mensaje || 'Error al cambiar la función', 'error');
    }
  }

  async function handleAmpliarATodoElProyecto(m) {
    if (!confirm(`¿Invitar a ${m.nombre_completo} a todo el proyecto como ${m.rol}? Podrá aceptar o rechazar la invitación.`)) return;
    try {
      await crearInvitacion(proyectoId, m.id_usuario, m.rol);
      await cargar();
      mostrarToast('Invitación enviada', 'exito');
    } catch (e) {
      mostrarToast(e.response?.data?.mensaje || 'Error al invitar al usuario', 'error');
    }
  }

  return (
    <section className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-800">
            Equipo del proyecto
            <span className="ml-1.5 text-gray-400 font-normal text-xs">
              ({miembros.length} persona{miembros.length !== 1 ? 's' : ''}
              {(() => {
                const dgs = [...new Set(miembros.map(m => m.dg_siglas).filter(Boolean))];
                return dgs.length > 0 ? ` · ${dgs.length} DG${dgs.length !== 1 ? 's' : ''}` : '';
              })()})
            </span>
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <BotonSolicitarParticipar proyecto={proyecto} permisos={permisos} />
          {permisos.puedeInvitar && (
            <>
              <button
                onClick={() => setModalInvitar('nodos')}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition"
                title="Asignar a una etapa, acción o tarea específica"
              >
                <Layers size={14} /> Asignar a una parte
              </button>
              <button
                onClick={() => setModalInvitar('proyecto')}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-guinda-200 text-guinda-700 hover:bg-guinda-50 transition"
              >
                <UserPlus size={14} /> Invitar a todo el proyecto
              </button>
            </>
          )}
        </div>
      </div>

      <div className="p-5 space-y-6">
        {miembros.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">Sin participantes registrados</p>
        ) : (
          <>
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2.5">
                Todo el proyecto
                <span className="ml-1 text-gray-400 font-normal normal-case">({miembrosProyecto.length})</span>
              </h4>
              {miembrosProyecto.length === 0 ? (
                <p className="text-xs text-gray-400">Nadie tiene acceso a todo el proyecto todavía.</p>
              ) : (
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                  {miembrosProyecto.map(m => (
                    <ParticipanteCard
                      key={`${m.id_usuario}-proyecto`}
                      miembro={m}
                      puedeGestionar={permisos.puedeInvitar && m.id_usuario !== usuario?.id}
                      puedeSalir={m.id_usuario === usuario?.id}
                      onEliminar={() => handleEliminarMiembro(m)}
                      onCambiarRol={nuevoRol => handleCambiarRol(m, nuevoRol)}
                    />
                  ))}
                </div>
              )}
            </div>

            {gruposPorNodo.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2.5">
                  Etapas, acciones y tareas
                  <span className="ml-1 text-gray-400 font-normal normal-case">
                    ({gruposPorNodo.reduce((n, g) => n + g.miembros.length, 0)})
                  </span>
                </h4>
                <div className="space-y-3">
                  {gruposPorNodo.map(grupo => {
                    const IconoNodo = NIVELES[grupo.nodo_tipo]?.icono || Layers;
                    return (
                      <div key={grupo.nodo_id} className="border border-gray-100 rounded-lg p-3 bg-gray-50/60">
                        <p className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                          <IconoNodo size={13} className="text-gray-400 flex-shrink-0" />
                          {grupo.nodo_nombre}
                          <span className="text-gray-400 font-normal">· {ETIQUETA_ALCANCE[grupo.nodo_tipo]}</span>
                        </p>
                        <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                          {grupo.miembros.map(m => (
                            <ParticipanteCard
                              key={`${m.id_usuario}-${grupo.nodo_id}`}
                              miembro={m}
                              puedeGestionar={permisos.puedeInvitar && m.id_usuario !== usuario?.id}
                              puedeSalir={m.id_usuario === usuario?.id}
                              onEliminar={() => handleEliminarMiembro(m)}
                              onCambiarRol={nuevoRol => handleCambiarRol(m, nuevoRol)}
                              onAmpliarATodoElProyecto={() => handleAmpliarATodoElProyecto(m)}
                              mostrarAlcance={false}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {modalInvitar && (
        <ModalInvitar
          proyectoId={proyectoId}
          etapas={etapas}
          alcanceInicial={modalInvitar === 'nodos' ? 'nodos' : 'proyecto'}
          onClose={() => setModalInvitar(false)}
          onInvitado={() => { setModalInvitar(false); cargar(); }}
        />
      )}
    </section>
  );
}

// ─── Participante Card ────────────────────────────────────────
const ROL_CFG = {
  responsable: { label: 'Responsable', bg: '#7B1C3E',  badgeCls: 'bg-guinda-100 text-guinda-700 border-guinda-200' },
  colaborador:  { label: 'Colaborador', bg: '#1e40af',  badgeCls: 'bg-blue-100 text-blue-700 border-blue-200' },
  invitado:     { label: 'Invitado',    bg: '#6b7280',  badgeCls: 'bg-gray-100 text-gray-600 border-gray-200' },
};

function iniciales(nombre) {
  if (!nombre) return '?';
  const parts = nombre.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function alcanceLabel(alcance, nodo_tipo, nodo_nombre) {
  if (!alcance || alcance === 'proyecto') return null;
  const tipoEs = ETIQUETA_ALCANCE[nodo_tipo || alcance] || 'parte';
  return `Asignado a: ${tipoEs}${nodo_nombre ? ` — ${nodo_nombre}` : ''}`;
}

function ParticipanteCard({ miembro: m, puedeGestionar, puedeSalir, onEliminar, onCambiarRol, onAmpliarATodoElProyecto, mostrarAlcance = true }) {
  const cfg = ROL_CFG[m.rol] || ROL_CFG.invitado;
  const scopeText = mostrarAlcance ? alcanceLabel(m.alcance, m.nodo_tipo, m.nodo_nombre) : null;
  const puedeCambiarRol = puedeGestionar && m.rol !== 'invitado';

  return (
    <div className="relative group border border-gray-200 rounded-xl p-3 bg-white hover:shadow-sm transition-shadow flex flex-col gap-2">
      {puedeGestionar && (
        <button
          onClick={onEliminar}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 text-gray-400 hover:text-red-500 rounded"
          title={m.alcance === 'proyecto' ? 'Quitar del proyecto' : 'Quitar de esta parte'}
        >
          <Trash2 size={13} />
        </button>
      )}

      <div className="flex items-center gap-2.5">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
          style={{ backgroundColor: cfg.bg }}
        >
          {iniciales(m.nombre_completo)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold text-gray-900 truncate leading-tight">{m.nombre_completo}</p>
          {puedeCambiarRol ? (
            <select
              value={m.rol}
              onChange={e => onCambiarRol(e.target.value)}
              onClick={e => e.stopPropagation()}
              className={`mt-0.5 text-[10px] font-medium pl-1.5 pr-1 py-0 rounded-full border outline-none cursor-pointer ${cfg.badgeCls}`}
            >
              <option value="colaborador">Colaborador</option>
              <option value="responsable">Responsable</option>
            </select>
          ) : (
            <span className={`inline-block text-[10px] font-medium px-1.5 py-0 rounded-full border mt-0.5 ${cfg.badgeCls}`}>
              {cfg.label}
            </span>
          )}
          {m.estado === 'pendiente' && (
            <span className="ml-1 inline-block text-[10px] font-medium px-1.5 py-0 rounded-full border bg-amber-50 text-amber-700 border-amber-200 mt-0.5">
              Invitación pendiente
            </span>
          )}
        </div>
      </div>

      <div className="text-[11px] text-gray-400 leading-snug">
        {[m.dg_siglas, m.da_siglas].filter(Boolean).join(' / ')}
        {m.cargo && <span className="ml-1 italic">· {m.cargo}</span>}
      </div>

      {m.correo && (
        <a
          href={`mailto:${m.correo}`}
          className="text-[11px] text-blue-600 hover:underline truncate block"
          title={m.correo}
        >
          {m.correo}
        </a>
      )}

      {puedeSalir && (
        <button
          onClick={onEliminar}
          className="text-[10px] font-medium text-red-500 hover:text-red-700 self-start"
        >
          Salir {m.alcance === 'proyecto' ? 'del proyecto' : `de esta ${ETIQUETA_ALCANCE[m.nodo_tipo] || 'parte'}`}
        </button>
      )}

      {m.alcance !== 'proyecto' && (
        <div className="flex items-center justify-between gap-2">
          {scopeText ? (
            <p className="text-[11px] text-amber-600 italic leading-tight truncate">{scopeText}</p>
          ) : <span />}
          {puedeGestionar && onAmpliarATodoElProyecto && (
            <button
              onClick={onAmpliarATodoElProyecto}
              className="text-[10px] font-medium text-guinda-600 hover:text-guinda-800 whitespace-nowrap flex-shrink-0"
              title="Enviar invitación a todo el proyecto"
            >
              + Todo el proyecto
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Modal Invitar ────────────────────────────────────────────
function ModalInvitar({ proyectoId, etapas, alcanceInicial = 'proyecto', onClose, onInvitado }) {
  const [dgs, setDgs] = useState([]);
  const [das, setDas] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [cargandoU, setCargandoU] = useState(false);
  const [filtros, setFiltros] = useState({ id_dg: '', id_da: '', nombre: '' });
  const [seleccionado, setSeleccionado] = useState(null);
  const [rol, setRol] = useState('colaborador');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [alcance, setAlcance] = useState(alcanceInicial);
  const [nodosSeleccionados, setNodosSeleccionados] = useState(new Set());

  useEffect(() => {
    client.get('/catalogos/dgs').then(r => setDgs(r.data.datos || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (filtros.id_dg) {
      client.get(`/catalogos/direcciones-area?id_dg=${filtros.id_dg}`).then(r => setDas(r.data.datos || [])).catch(() => {});
    } else {
      setDas([]);
    }
  }, [filtros.id_dg]);

  const buscarUsuarios = useCallback(async () => {
    setCargandoU(true);
    try {
      const params = new URLSearchParams({ excluir_proyecto: proyectoId });
      if (filtros.id_dg) params.set('id_dg', filtros.id_dg);
      if (filtros.id_da) params.set('id_direccion_area', filtros.id_da);
      if (filtros.nombre) params.set('nombre', filtros.nombre);
      const r = await client.get(`/catalogos/usuarios?${params}`);
      setUsuarios(r.data.datos || []);
    } catch {}
    finally { setCargandoU(false); }
  }, [filtros, proyectoId]);

  useEffect(() => { buscarUsuarios(); }, [buscarUsuarios]);

  function toggleNodo(tipo, id) {
    const key = `${tipo}-${id}`;
    setNodosSeleccionados(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleInvitar(e) {
    e.preventDefault();
    if (!seleccionado) return;
    if (alcance === 'nodos' && nodosSeleccionados.size === 0) {
      setError('Selecciona al menos una etapa o acción');
      return;
    }
    setEnviando(true); setError('');
    try {
      if (alcance === 'proyecto') {
        await crearInvitacion(proyectoId, seleccionado.id, rol);
      } else {
        const promesas = [];
        nodosSeleccionados.forEach(key => {
          const idx = key.indexOf('-');
          const tipo = key.slice(0, idx);
          const id = key.slice(idx + 1);
          promesas.push(agregarMiembroNodo(tipo, id, seleccionado.id, rol));
        });
        await Promise.all(promesas);
      }
      onInvitado();
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al agregar usuario');
    } finally { setEnviando(false); }
  }

  const dasFiltradas = filtros.id_dg ? das : [];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="text-base font-semibold text-gray-900">Invitar a participar</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
        </div>

        <div className="px-6 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Dirección General</label>
              <select value={filtros.id_dg} onChange={e => setFiltros(f => ({ ...f, id_dg: e.target.value, id_da: '' }))} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs">
                <option value="">— Todas —</option>
                {dgs.map(d => <option key={d.id} value={d.id}>{d.siglas}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Dirección de Área</label>
              <select value={filtros.id_da} onChange={e => setFiltros(f => ({ ...f, id_da: e.target.value }))} disabled={!filtros.id_dg} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs disabled:opacity-40">
                <option value="">— Todas —</option>
                {dasFiltradas.map(d => <option key={d.id} value={d.id}>{d.siglas}</option>)}
              </select>
            </div>
          </div>

          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={filtros.nombre}
              onChange={e => setFiltros(f => ({ ...f, nombre: e.target.value }))}
              placeholder="Buscar por nombre..."
              className="w-full border border-gray-300 rounded-lg pl-8 pr-3 py-1.5 text-sm"
            />
          </div>

          <div className="border border-gray-200 rounded-lg overflow-y-auto" style={{ maxHeight: 240 }}>
            {cargandoU ? (
              <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-guinda-600" /></div>
            ) : usuarios.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No se encontraron usuarios</p>
            ) : (
              usuarios.map(u => (
                <button key={u.id} onClick={() => setSeleccionado(u)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 border-b last:border-0 transition-colors ${
                    seleccionado?.id === u.id ? 'bg-guinda-50 border-l-2 border-l-guinda-600' : ''
                  }`}>
                  <div className="w-7 h-7 rounded-full bg-guinda-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-guinda-700">{u.nombre_completo?.charAt(0)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{u.nombre_completo}</p>
                    <p className="text-[11px] text-gray-400 truncate">{u.correo} · {u.dg_siglas}{u.direccion_area_siglas ? ` / ${u.direccion_area_siglas}` : ''}</p>
                  </div>
                  {seleccionado?.id === u.id && <div className="w-2 h-2 rounded-full bg-guinda-600 flex-shrink-0" />}
                </button>
              ))
            )}
          </div>

          {seleccionado && (
            <div className="space-y-2">
              <div className="p-3 bg-guinda-50 rounded-lg flex items-center gap-2">
                <span className="text-sm text-guinda-700 flex-1 truncate">✓ {seleccionado.nombre_completo}</span>
                <div>
                  <label className="text-xs text-gray-600 mr-1">Función:</label>
                  <select value={rol} onChange={e => setRol(e.target.value)} className="text-xs border border-gray-300 rounded px-2 py-1">
                    <option value="colaborador">Colaborador</option>
                    <option value="responsable">Responsable</option>
                    {seleccionado?.rol === 'externo' && <option value="invitado">Invitado</option>}
                  </select>
                </div>
              </div>

              <p className="text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-md p-2 leading-snug">
                La persona recibirá una invitación y podrá aceptarla o rechazarla.
                Hasta que la acepte no tendrá permisos aquí.
              </p>

              <div>
                <p className="text-xs font-medium text-gray-600 mb-1.5">Invitar a:</p>
                <div className="flex gap-4">
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input type="radio" name="alcance" value="proyecto" checked={alcance === 'proyecto'}
                      onChange={() => { setAlcance('proyecto'); setNodosSeleccionados(new Set()); }} />
                    <span>Todo el proyecto</span>
                  </label>
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input type="radio" name="alcance" value="nodos" checked={alcance === 'nodos'}
                      onChange={() => setAlcance('nodos')} />
                    <span>Etapas / acciones específicas</span>
                  </label>
                </div>
              </div>

              {alcance === 'nodos' && (
                <div className="border border-gray-200 rounded-lg max-h-40 overflow-y-auto p-2 space-y-0.5 bg-gray-50">
                  {(etapas || []).length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-2">Sin etapas disponibles</p>
                  ) : (etapas || []).map(etapa => (
                    <div key={etapa.id}>
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer font-medium py-0.5 hover:bg-white rounded px-1">
                        <input type="checkbox" checked={nodosSeleccionados.has(`etapa-${etapa.id}`)}
                          onChange={() => toggleNodo('etapa', etapa.id)} />
                        <span className="text-gray-700 truncate">{etapa.nombre}</span>
                      </label>
                      {(etapa.acciones || []).map(accion => (
                        <label key={accion.id} className="flex items-center gap-1.5 text-xs cursor-pointer ml-4 py-0.5 hover:bg-white rounded px-1">
                          <input type="checkbox" checked={nodosSeleccionados.has(`accion-${accion.id}`)}
                            onChange={() => toggleNodo('accion', accion.id)} />
                          <span className="text-gray-600 truncate">{accion.nombre}</span>
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && <p className="text-xs text-red-600 bg-red-50 p-2 rounded">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
          <button onClick={handleInvitar} disabled={!seleccionado || enviando}
            className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 flex items-center gap-2"
            style={{ backgroundColor: GUINDA }}>
            {enviando && <Loader2 size={14} className="animate-spin" />}
            Enviar invitación
          </button>
        </div>
      </div>
    </div>
  );
}
