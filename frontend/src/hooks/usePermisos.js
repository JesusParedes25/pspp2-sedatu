/**
 * ARCHIVO: usePermisos.js
 * PROPÓSITO: Hook que calcula los permisos del usuario según su rol,
 *            DG y relación con el proyecto.
 *
 * MINI-CLASE: Roles y permisos en PSPP
 * ─────────────────────────────────────────────────────────────────
 * PSPP tiene 4 roles jerárquicos:
 * • Ejecutivo — ve TODO, crea/edita/elimina TODO (Subsecretario)
 * • Directivo — ve todo, crea/edita en su DG (Director de Área)
 * • Responsable — ve su DG + participaciones, crea/edita lo suyo
 * • Operativo — ve su DG, solo edita sus acciones asignadas
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
      esEjecutivo: rol === 'Ejecutivo',
      esDirectivo: rol === 'Directivo',
      esResponsable: rol === 'Responsable',
      esOperativo: rol === 'Operativo',
      puedeCrearProyecto: rol !== 'Operativo',
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
      esParticipante: false,
      esSoloLectura: true,
    };

    if (!usuario || !proyecto) return sinPermisos;

    const rol = usuario.rol;
    const esMismaDG = usuario.id_dg === proyecto.id_dg_lider;
    const esCreador = usuario.id === proyecto.id_creador;

    // Verificar si el usuario participa en el proyecto (líder o colaborador)
    const esParticipante = esMismaDG || esCreador;

    // Ejecutivo: todo
    if (rol === 'Ejecutivo') {
      return {
        puedeEditar: true,
        puedeEliminar: true,
        puedeCrearEtapa: true,
        puedeCrearAccion: true,
        puedeEditarAccion: true,
        puedeCambiarEstado: true,
        esParticipante: true,
        esSoloLectura: false,
      };
    }

    // Directivo: crea/edita en su DG, ve todo
    if (rol === 'Directivo') {
      return {
        puedeEditar: esMismaDG || esCreador,
        puedeEliminar: esCreador,
        puedeCrearEtapa: esMismaDG || esCreador,
        puedeCrearAccion: esMismaDG,
        puedeEditarAccion: esMismaDG,
        puedeCambiarEstado: esMismaDG || esCreador,
        esParticipante,
        esSoloLectura: !esMismaDG && !esCreador,
      };
    }

    // Responsable: crea/edita en su DG si participa
    if (rol === 'Responsable') {
      return {
        puedeEditar: esCreador,
        puedeEliminar: false,
        puedeCrearEtapa: esParticipante,
        puedeCrearAccion: esParticipante,
        puedeEditarAccion: esParticipante,
        puedeCambiarEstado: esParticipante,
        esParticipante,
        esSoloLectura: !esParticipante,
      };
    }

    // Operativo: solo edita sus acciones asignadas
    if (rol === 'Operativo') {
      return {
        puedeEditar: false,
        puedeEliminar: false,
        puedeCrearEtapa: false,
        puedeCrearAccion: esMismaDG,
        puedeEditarAccion: esMismaDG,
        puedeCambiarEstado: false,
        esParticipante: esMismaDG,
        esSoloLectura: !esMismaDG,
      };
    }

    return sinPermisos;
  }, [usuario, proyecto]);
}
