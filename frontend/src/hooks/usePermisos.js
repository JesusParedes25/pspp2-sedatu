/**
 * ARCHIVO: usePermisos.js
 * PROPÓSITO: Hook que calcula los permisos del usuario según su rol,
 *            DG y relación con el proyecto.
 *
 * MINI-CLASE: Roles y permisos en PSPP
 * ─────────────────────────────────────────────────────────────────
 * PSPP tiene 5 roles:
 * • superadmin — acceso total al sistema
 * • ejecutivo  — ve TODO y designa participantes en cualquier proyecto;
 *                edita y elimina solo en su DG (Subsecretario)
 * • direccion  — ve todo, crea/edita en su DG (Director de Área)
 * • enlace     — ve su DG + participaciones, crea/edita lo suyo
 * • externo    — ve su DG, solo edita sus acciones asignadas
 *
 * Los permisos se calculan comparando el rol del usuario, su DG,
 * y si participa en el proyecto (como líder o colaborador).
 * ─────────────────────────────────────────────────────────────────
 */
import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';

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

// Permisos contextuales para un proyecto específico
export function usePermisosProyecto(proyecto) {
  const { usuario } = useAuth();

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
    };

    if (!usuario || !proyecto) return sinPermisos;

    const rol = usuario.rol;
    const esMismaDG = usuario.id_dg === proyecto.id_dg_lider;
    const esCreador = usuario.id === proyecto.id_creador;
    const rolProyecto = proyecto.rol_usuario_actual;
    const esResponsableProyecto = rolProyecto === 'responsable';
    const esParticipante = esMismaDG || esCreador || !!rolProyecto;

    // superadmin: sin límites (administra la plataforma).
    if (rol === 'superadmin') {
      return {
        puedeEditar: true,
        puedeEliminar: true,
        puedeCrearEtapa: true,
        puedeCrearAccion: true,
        puedeEditarAccion: true,
        puedeCambiarEstado: true,
        puedeInvitar: true,
        esParticipante: true,
        esSoloLectura: false,
      };
    }

    // ejecutivo: consulta toda la Secretaría y designa participantes en
    // cualquier proyecto —coordinar quién atiende cada asunto es propio
    // del cargo—, pero edita y elimina únicamente en los proyectos de su
    // propia Dirección General (o en los que creó / donde es responsable).
    // La información sustantiva la captura el área responsable. Misma
    // regla que aplica el backend en autorizacion.js.
    if (rol === 'ejecutivo') {
      const mandaAqui = esMismaDG || esCreador || esResponsableProyecto;
      return {
        puedeEditar: mandaAqui,
        puedeEliminar: mandaAqui,
        puedeCrearEtapa: mandaAqui,
        puedeCrearAccion: mandaAqui,
        puedeEditarAccion: mandaAqui,
        puedeCambiarEstado: mandaAqui,
        puedeInvitar: true,
        esParticipante: true,
        esSoloLectura: !mandaAqui,
      };
    }

    // direccion: crea/edita en su DG, ve todo
    if (rol === 'direccion') {
      const puedeEditar = esMismaDG || esCreador || esResponsableProyecto;
      return {
        puedeEditar,
        puedeEliminar: esCreador || esResponsableProyecto,
        puedeCrearEtapa: esMismaDG || esCreador,
        puedeCrearAccion: esMismaDG,
        puedeEditarAccion: esMismaDG,
        puedeCambiarEstado: esMismaDG || esCreador,
        puedeInvitar: puedeEditar,
        esParticipante,
        esSoloLectura: !esMismaDG && !esCreador,
      };
    }

    // enlace: crea/edita en su DG si participa
    if (rol === 'enlace') {
      const puedeEditar = esCreador || esResponsableProyecto;
      return {
        puedeEditar,
        puedeEliminar: esCreador || esResponsableProyecto,
        puedeCrearEtapa: esParticipante,
        puedeCrearAccion: esParticipante,
        puedeEditarAccion: esParticipante,
        puedeCambiarEstado: esParticipante,
        puedeInvitar: puedeEditar,
        esParticipante,
        esSoloLectura: !esParticipante,
      };
    }

    // externo: solo edita sus acciones asignadas
    if (rol === 'externo') {
      return {
        puedeEditar: false,
        puedeEliminar: false,
        puedeCrearEtapa: false,
        puedeCrearAccion: esMismaDG,
        puedeEditarAccion: esMismaDG,
        puedeCambiarEstado: false,
        puedeInvitar: false,
        esParticipante: esMismaDG,
        esSoloLectura: !esMismaDG,
      };
    }

    return sinPermisos;
  }, [usuario, proyecto]);
}
