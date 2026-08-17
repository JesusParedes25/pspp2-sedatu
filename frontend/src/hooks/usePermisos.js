/**
 * ARCHIVO: usePermisos.js
 * PROPÓSITO: Decirle a la interfaz qué puede hacer el usuario en un
 *            proyecto y en cada nodo suyo.
 *
 * MINI-CLASE: perfil, función y quién manda de verdad
 * ─────────────────────────────────────────────────────────────────
 * Dos cosas distintas, con dos nombres distintos:
 *
 *   • PERFIL — lo que la persona es en la Secretaría. No cambia de
 *     proyecto en proyecto. Vive en usuarios.rol:
 *       superadmin — administra la plataforma
 *       ejecutivo  — ve todo y designa participantes en cualquier
 *                    proyecto; edita los de su DG
 *       direccion  — edita y da seguimiento a los de su DG
 *       enlace     — captura en los proyectos donde participa
 *       externo    — participa solo en lo que se le asigna
 *
 *   • FUNCIÓN — lo que hace en ESTE proyecto (o en esta etapa/acción).
 *     Vive en proyecto_usuarios.rol y nodo_miembros.rol:
 *       responsable / colaborador / invitado
 *
 * Regla corta: el perfil dice DÓNDE alcanza, la función dice QUÉ hace.
 *
 * MINI-CLASE: por qué este hook le pregunta al servidor
 * ─────────────────────────────────────────────────────────────────
 * Se puede invitar a alguien a una etapa suelta en vez de al proyecto
 * entero. Desde entonces "¿puede editar?" no tiene una sola respuesta
 * por proyecto: depende del nodo, y el navegador no conoce
 * nodo_miembros. Deducirlo aquí garantizaba desincronización con el
 * servidor —campos editables que la API rechaza, o botones escondidos
 * a quien sí podía—, así que se consulta /proyectos/:id/mis-permisos y
 * esa respuesta manda. El cálculo local queda solo como valor
 * provisional mientras llega, y aplica las mismas reglas.
 * ─────────────────────────────────────────────────────────────────
 */
import { useMemo, useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { obtenerMisPermisos } from '../api/proyectos';

// Permisos globales (no dependen de un proyecto)
export function usePermisosGlobales() {
  const { usuario } = useAuth();

  return useMemo(() => {
    if (!usuario) return { puedeCrearProyecto: false, esEjecutivo: false };

    const rol = usuario.rol;

    return {
      esSuperadmin: rol === 'superadmin',
      esEjecutivo: rol === 'ejecutivo' || rol === 'superadmin',
      esDireccion: rol === 'direccion',
      esEnlace: rol === 'enlace',
      esExterno: rol === 'externo',
      puedeCrearProyecto: rol !== 'externo',
    };
  }, [usuario]);
}

// ─── Caché de la respuesta del servidor ───────────────────────────
// Tres componentes distintos piden los permisos del mismo proyecto
// (detalle, panorama, modal de edición). Sin caché serían tres
// peticiones idénticas por pantalla.
const cache = new Map();

function clavePermisos(idProyecto, idUsuario) {
  return `${idProyecto}::${idUsuario}`;
}

function pedirPermisos(idProyecto, idUsuario) {
  const clave = clavePermisos(idProyecto, idUsuario);
  if (!cache.has(clave)) {
    cache.set(clave, obtenerMisPermisos(idProyecto).catch(err => {
      cache.delete(clave);   // que un fallo de red no se quede pegado
      throw err;
    }));
  }
  return cache.get(clave);
}

// Invalidar tras invitar, aceptar o retirar a alguien.
export function olvidarPermisos(idProyecto) {
  for (const clave of [...cache.keys()]) {
    if (clave.startsWith(`${idProyecto}::`)) cache.delete(clave);
  }
}

const SIN_NODOS = { etapa: [], accion: [], tarea: [] };

// Permisos contextuales para un proyecto específico
export function usePermisosProyecto(proyecto) {
  const { usuario } = useAuth();
  const [servidor, setServidor] = useState(null);

  const idProyecto = proyecto?.id;
  const idUsuario = usuario?.id;

  useEffect(() => {
    if (!idProyecto || !idUsuario) { setServidor(null); return undefined; }
    let vigente = true;
    pedirPermisos(idProyecto, idUsuario)
      .then(datos => { if (vigente) setServidor(datos); })
      .catch(() => { if (vigente) setServidor(null); });
    return () => { vigente = false; };
  }, [idProyecto, idUsuario]);

  return useMemo(() => {
    const sinPermisos = {
      puedeEditar: false,
      puedeEliminar: false,
      puedeCrearEtapa: false,
      puedeCrearAccion: false,
      puedeEditarAccion: false,
      puedeCambiarEstado: false,
      puedeInvitar: false,
      esParticipante: false,
      esSoloLectura: true,
      puedeEditarNodo: () => false,
    };

    if (!usuario || !proyecto) return sinPermisos;

    const rol = usuario.rol;
    const esMismaDG = !!usuario.id_dg && usuario.id_dg === proyecto.id_dg_lider;
    const esCreador = usuario.id === proyecto.id_creador;
    const funcionProyecto = proyecto.rol_usuario_actual;
    const esResponsableProyecto = funcionProyecto === 'responsable';
    // Participar es estar escrito en el proyecto. Pertenecer al área que
    // lo lidera ya NO cuenta como participar: si el área tiene que
    // capturar, a alguien de esa área se le invita, y así queda quién.
    const participa = esCreador || !!funcionProyecto;

    // ── Cálculo local (provisional, mientras responde el servidor) ──
    let local;
    if (rol === 'superadmin') {
      local = { editaFicha: true, captura: true, elimina: true, invita: true };
    } else if (rol === 'ejecutivo') {
      const mandaAqui = esMismaDG || esCreador || esResponsableProyecto;
      // Designa participantes en toda la Secretaría; edita y elimina solo
      // en su propia Dirección General.
      local = { editaFicha: mandaAqui, captura: mandaAqui, elimina: mandaAqui, invita: true };
    } else if (rol === 'direccion') {
      const mandaAqui = esMismaDG || esCreador || esResponsableProyecto;
      local = {
        editaFicha: mandaAqui,
        captura: mandaAqui,
        elimina: esCreador || esResponsableProyecto,
        invita: mandaAqui,
      };
    } else {
      // enlace y externo: solo lo que se les haya asignado explícitamente.
      const editaFicha = esCreador || esResponsableProyecto;
      local = { editaFicha, captura: participa, elimina: editaFicha, invita: editaFicha };
    }

    // ── La respuesta del servidor manda ──
    const editaFicha = servidor ? servidor.puede_editar_ficha : local.editaFicha;
    const captura = servidor ? servidor.puede_capturar_proyecto : local.captura;
    const elimina = servidor ? servidor.puede_eliminar : local.elimina;
    const invita = servidor ? servidor.puede_gestionar_participantes : local.invita;
    const nodos = servidor?.nodos_editables || SIN_NODOS;

    return {
      puedeEditar: editaFicha,
      puedeEliminar: elimina,
      puedeCrearEtapa: captura,
      puedeCrearAccion: captura,
      puedeEditarAccion: captura,
      puedeCambiarEstado: captura,
      puedeInvitar: invita,
      esParticipante: participa || captura,
      esSoloLectura: !captura,

      // ¿Puede capturar en ESTE nodo? Vale con poder en todo el proyecto
      // o con tenerlo asignado. La lista del servidor ya viene expandida
      // hacia abajo: si te asignaron una etapa, sus acciones y tareas
      // vienen incluidas.
      puedeEditarNodo: (tipo, id) => {
        if (captura) return true;
        if (!tipo || !id) return false;
        return (nodos[tipo] || []).includes(id);
      },
      // true si el usuario solo puede capturar en partes del proyecto:
      // sirve para explicarle por qué ve unos campos editables y otros no.
      capturaParcial: !captura && (nodos.etapa.length + nodos.accion.length + nodos.tarea.length) > 0,
    };
  }, [usuario, proyecto, servidor]);
}

// ─── Permisos acotados a un nodo ──────────────────────────────────
// Devuelve una copia de `permisos` donde esSoloLectura ya considera si
// este nodo en particular es editable. Los componentes que pintan un
// nodo la usan al entrar y el resto de su código sigue igual: así la
// regla vive en un solo lugar y no en treinta lecturas de
// `permisos.esSoloLectura` repartidas por la pantalla.
const TIPO_CANONICO = { etapa: 'etapa', accion: 'accion', subaccion: 'accion', tarea: 'tarea' };

export function permisosDeNodo(permisos, tipo, id) {
  if (!permisos) return permisos;
  const canonico = TIPO_CANONICO[tipo];
  // Tipo desconocido (o sin id): se queda con el permiso del proyecto.
  if (!canonico || !id || typeof permisos.puedeEditarNodo !== 'function') return permisos;

  const puede = permisos.puedeEditarNodo(canonico, id);
  if (puede === !permisos.esSoloLectura) return permisos;   // sin cambios, evita re-render

  return {
    ...permisos,
    esSoloLectura: !puede,
    puedeCrearAccion: puede,
    puedeEditarAccion: puede,
    puedeCambiarEstado: puede,
  };
}
