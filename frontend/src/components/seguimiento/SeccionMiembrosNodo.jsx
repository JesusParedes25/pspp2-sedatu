/**
 * ARCHIVO: SeccionMiembrosNodo.jsx
 * PROPÓSITO: Quién trabaja en esta etapa, acción o tarea, y con qué función.
 *
 * MINI-CLASE: función, estado de la invitación y la función "invitado"
 * ─────────────────────────────────────────────────────────────────
 * FUNCIÓN es lo que la persona hace aquí: responsable, colaborador o
 * —solo para gente ajena a la Secretaría— invitado, que ve sin capturar.
 * No confundir con el PERFIL (usuarios.rol), que es lo que la persona es
 * en SEDATU y no cambia de un proyecto a otro.
 *
 * Agregar a alguien ya no lo mete de golpe: le llega una invitación que
 * puede aceptar o rechazar, y hasta entonces no tiene permisos. Por eso
 * cada miembro muestra el estado de su invitación.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useMemo } from 'react';
import { UserPlus, X, Search, Lock } from 'lucide-react';
import { obtenerUsuarios } from '../../api/catalogos';
import {
  listarMiembrosNodo,
  agregarMiembroNodo,
  actualizarRolNodo,
  eliminarMiembroNodo,
} from '../../api/nodo-miembros';

const ROLES = [
  { value: 'responsable', label: 'Responsable', color: 'bg-guinda-100 text-guinda-700' },
  { value: 'colaborador', label: 'Colaborador', color: 'bg-blue-100 text-blue-700' },
  // Ver sin capturar. Solo tiene sentido para usuarios de otra dependencia:
  // dentro de SEDATU la visibilidad ya es total, así que "invitar sin poder
  // capturar" no le agregaría nada a nadie. El servidor aplica la misma
  // regla (400 FUNCION_NO_APLICABLE).
  { value: 'invitado',    label: 'Invitado',    color: 'bg-gray-100 text-gray-600', soloExternos: true },
];

// Funciones ofrecibles a esta persona en particular.
function funcionesPara(usuario) {
  return ROLES.filter(r => !r.soloExternos || usuario?.rol === 'externo');
}

function rolConfig(rol) {
  return ROLES.find(r => r.value === rol) || ROLES[2];
}

const ESTADO_INVITACION = {
  pendiente: { texto: 'Invitación pendiente', clase: 'text-amber-600' },
  rechazada: { texto: 'Rechazó la invitación', clase: 'text-red-500' },
};

function Iniciales({ nombre, className = '' }) {
  const parts = (nombre || '').split(' ').filter(Boolean);
  const ini = parts.length >= 2
    ? parts[0][0] + parts[1][0]
    : (parts[0] ? parts[0].slice(0, 2) : '?');
  return (
    <div className={`w-7 h-7 rounded-full bg-guinda-100 text-guinda-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0 uppercase ${className}`}>
      {ini}
    </div>
  );
}

export default function SeccionMiembrosNodo({ tipo, idNodo, permisos }) {
  const [miembros, setMiembros] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [mostrarPicker, setMostrarPicker] = useState(false);
  const [todosUsuarios, setTodosUsuarios] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [seleccionado, setSeleccionado] = useState(null);
  const [rolNuevo, setRolNuevo] = useState('colaborador');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    cargar();
  }, [tipo, idNodo]);

  async function cargar() {
    setCargando(true);
    try {
      const data = await listarMiembrosNodo(tipo, idNodo);
      setMiembros(data || []);
    } catch { setMiembros([]); }
    finally { setCargando(false); }
  }

  async function abrirPicker() {
    setMostrarPicker(true);
    setBusqueda('');
    setSeleccionado(null);
    setRolNuevo('colaborador');
    setError('');
    if (todosUsuarios.length === 0) {
      try {
        const res = await obtenerUsuarios();
        setTodosUsuarios(res.datos || []);
      } catch { setTodosUsuarios([]); }
    }
  }

  const yaAgregados = useMemo(() => new Set(miembros.map(m => m.id_usuario)), [miembros]);

  const usuariosFiltrados = useMemo(() => {
    const q = busqueda.toLowerCase();
    return todosUsuarios.filter(u =>
      !yaAgregados.has(u.id) &&
      (u.nombre_completo?.toLowerCase().includes(q) || u.dg_siglas?.toLowerCase().includes(q))
    );
  }, [todosUsuarios, busqueda, yaAgregados]);

  async function confirmarAgregar() {
    if (!seleccionado) return;
    setGuardando(true);
    setError('');
    try {
      await agregarMiembroNodo(tipo, idNodo, seleccionado.id, rolNuevo);
      setMostrarPicker(false);
      await cargar();
    } catch (err) {
      // El servidor explica los dos casos que importan: la persona ya
      // participa en todo el proyecto, o la función no aplica para su
      // perfil. Tragarse el mensaje dejaba al usuario sin saber por qué
      // no pasó nada.
      setError(err.response?.data?.mensaje || 'No se pudo agregar a esta persona');
    } finally { setGuardando(false); }
  }

  async function cambiarRol(idUsuario, rol) {
    try {
      await actualizarRolNodo(tipo, idNodo, idUsuario, rol);
      setMiembros(prev => prev.map(m => m.id_usuario === idUsuario ? { ...m, rol } : m));
    } catch (err) {
      setError(err.response?.data?.mensaje || 'No se pudo cambiar la función');
      await cargar();
    }
  }

  async function quitar(idUsuario) {
    try {
      await eliminarMiembroNodo(tipo, idNodo, idUsuario);
      setMiembros(prev => prev.filter(m => m.id_usuario !== idUsuario));
    } catch (err) {
      console.error('Error al quitar miembro:', err);
    }
  }

  return (
    <div className="space-y-2">
      {/* Lista de miembros */}
      {cargando ? (
        <p className="text-xs text-gray-400 py-2">Cargando equipo...</p>
      ) : miembros.length === 0 ? (
        <p className="text-xs text-gray-400 py-1">Sin responsable ni miembros asignados.</p>
      ) : (
        <div className="space-y-1.5">
          {miembros.map(m => {
            const rc = rolConfig(m.rol);
            const esPrincipal = m.es_responsable_principal;
            return (
              <div key={m.id_usuario}
                className={`flex items-center gap-2 group rounded-lg px-1.5 py-0.5 ${
                  esPrincipal ? 'bg-guinda-50 border border-guinda-100' : ''
                }`}
              >
                <Iniciales nombre={m.nombre_completo} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800 truncate">{m.nombre_completo}</p>
                  {m.dg_siglas && <p className="text-[10px] text-gray-400">{m.dg_siglas}</p>}
                  {ESTADO_INVITACION[m.estado] && (
                    <p className={`text-[10px] ${ESTADO_INVITACION[m.estado].clase}`}>
                      {ESTADO_INVITACION[m.estado].texto}
                      {m.estado === 'rechazada' && m.motivo_rechazo ? `: ${m.motivo_rechazo}` : ''}
                    </p>
                  )}
                </div>
                {esPrincipal ? (
                  <span className={`flex items-center gap-0.5 text-[10px] font-medium px-2 py-0.5 rounded-full ${rc.color}`}>
                    <Lock size={9} />{rc.label}
                  </span>
                ) : permisos.puedeInvitar ? (
                  <select
                    value={m.rol}
                    onChange={e => cambiarRol(m.id_usuario, e.target.value)}
                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border-0 focus:ring-1 focus:ring-guinda-300 cursor-pointer ${rc.color}`}
                  >
                    {funcionesPara(m).map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                ) : (
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${rc.color}`}>{rc.label}</span>
                )}
                {!esPrincipal && permisos.puedeInvitar && (
                  <button
                    onClick={() => quitar(m.id_usuario)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-red-500 transition-all"
                    title="Quitar miembro"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {error && !mostrarPicker && (
        <p className="text-[11px] text-red-600 bg-red-50 border border-red-100 rounded-md p-2 leading-snug">{error}</p>
      )}

      {/* Botón / Panel agregar */}
      {permisos.puedeInvitar && !mostrarPicker && (
        <button
          onClick={abrirPicker}
          className="flex items-center gap-1 text-xs text-guinda-600 hover:text-guinda-800 font-medium mt-1"
        >
          <UserPlus size={13} />
          Agregar miembro
        </button>
      )}

      {mostrarPicker && (
        <div className="border border-gray-200 rounded-lg p-2.5 space-y-2 bg-gray-50">
          {/* Búsqueda */}
          <div className="relative">
            <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              autoFocus
              placeholder="Buscar usuario..."
              value={busqueda}
              onChange={e => { setBusqueda(e.target.value); setSeleccionado(null); }}
              className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 pl-6 bg-white focus:outline-none focus:border-guinda-300"
            />
          </div>

          {/* Lista filtrada */}
          <div className="max-h-36 overflow-y-auto space-y-0.5">
            {usuariosFiltrados.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-2">Sin resultados</p>
            ) : (
              usuariosFiltrados.slice(0, 20).map(u => (
                <button
                  key={u.id}
                  onClick={() => setSeleccionado(u)}
                  className={`w-full flex items-center gap-2 px-2 py-1 rounded text-left transition-colors ${
                    seleccionado?.id === u.id
                      ? 'bg-guinda-50 border border-guinda-200'
                      : 'hover:bg-white hover:border hover:border-gray-200'
                  }`}
                >
                  <Iniciales nombre={u.nombre_completo} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-800 truncate">{u.nombre_completo}</p>
                    {u.dg_siglas && <p className="text-[10px] text-gray-400">{u.dg_siglas}</p>}
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Función en este nodo */}
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-gray-500 font-medium whitespace-nowrap">Función:</label>
            <select
              value={rolNuevo}
              onChange={e => setRolNuevo(e.target.value)}
              className="flex-1 text-xs border border-gray-200 rounded-md px-2 py-1 bg-white focus:outline-none focus:border-guinda-300"
            >
              {funcionesPara(seleccionado).map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>

          {error && (
            <p className="text-[11px] text-red-600 bg-red-50 border border-red-100 rounded-md p-2 leading-snug">{error}</p>
          )}

          {/* Acciones */}
          <div className="flex gap-1.5 justify-end">
            <button
              onClick={() => setMostrarPicker(false)}
              className="px-3 py-1 text-xs text-gray-500 hover:text-gray-700 font-medium"
            >
              Cancelar
            </button>
            <button
              onClick={confirmarAgregar}
              disabled={!seleccionado || guardando}
              className="px-3 py-1 text-xs bg-guinda-600 text-white rounded-md hover:bg-guinda-700 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
            >
              {guardando ? 'Enviando...' : 'Enviar invitación'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
