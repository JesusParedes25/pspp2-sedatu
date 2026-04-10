/**
 * ARCHIVO: EquipoProyecto.jsx
 * PROPÓSITO: Sección de equipo del proyecto — DGs participantes y responsables.
 *
 * MINI-CLASE: Equipo como vista transversal de responsables
 * ─────────────────────────────────────────────────────────────────
 * El equipo se compone de: (1) DG líder del proyecto, (2) DGs
 * participantes, (3) responsables de etapas, (4) responsables de
 * acciones. Esta vista agrupa a las personas por DG y muestra su
 * rol dentro del proyecto (líder, responsable de etapa X, etc.).
 * Es útil para entender quién participa y en qué parte del proyecto.
 * ─────────────────────────────────────────────────────────────────
 */
import { useMemo } from 'react';
import { Users, Crown, Briefcase, User } from 'lucide-react';

export default function EquipoProyecto({ proyecto, etapas = [] }) {
  // Construir mapa de equipo agrupado por DG
  const equipoPorDG = useMemo(() => {
    const mapa = {};

    // DG líder del proyecto
    if (proyecto?.dg_lider_siglas) {
      const clave = proyecto.dg_lider_siglas;
      if (!mapa[clave]) mapa[clave] = { siglas: clave, nombre: proyecto.dg_lider_nombre || clave, miembros: [] };
      if (proyecto.creador_nombre) {
        mapa[clave].miembros.push({
          nombre: proyecto.creador_nombre,
          rol: 'Creador del proyecto',
          tipo: 'lider',
        });
      }
    }

    // DGs participantes del proyecto
    if (proyecto?.dgs) {
      proyecto.dgs.forEach(dg => {
        const clave = dg.siglas || dg.dg_siglas;
        if (!mapa[clave]) mapa[clave] = { siglas: clave, nombre: dg.nombre || clave, miembros: [] };
      });
    }

    // Responsables de etapas
    etapas.forEach(etapa => {
      if (etapa.responsable_nombre) {
        const clave = etapa.dg_siglas || proyecto?.dg_lider_siglas || 'Sin DG';
        if (!mapa[clave]) mapa[clave] = { siglas: clave, nombre: clave, miembros: [] };

        // Evitar duplicados
        const yaExiste = mapa[clave].miembros.some(m => m.nombre === etapa.responsable_nombre);
        if (!yaExiste) {
          mapa[clave].miembros.push({
            nombre: etapa.responsable_nombre,
            rol: `Responsable de: ${etapa.nombre}`,
            tipo: 'etapa',
          });
        }
      }

      // Responsables de acciones dentro de la etapa
      if (etapa.acciones) {
        etapa.acciones.forEach(accion => {
          if (accion.responsable_nombre) {
            const clave = accion.dg_siglas || etapa.dg_siglas || 'Sin DG';
            if (!mapa[clave]) mapa[clave] = { siglas: clave, nombre: clave, miembros: [] };

            const yaExiste = mapa[clave].miembros.some(m => m.nombre === accion.responsable_nombre);
            if (!yaExiste) {
              mapa[clave].miembros.push({
                nombre: accion.responsable_nombre,
                rol: `Acción: ${accion.nombre}`,
                tipo: 'accion',
              });
            }
          }
        });
      }
    });

    return Object.values(mapa);
  }, [proyecto, etapas]);

  if (equipoPorDG.length === 0) {
    return (
      <div className="text-center py-8">
        <Users size={32} className="mx-auto text-gray-300 mb-2" />
        <p className="text-sm text-gray-400">Sin información de equipo</p>
        <p className="text-xs text-gray-300 mt-1">Los responsables se asignan en etapas y acciones</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {equipoPorDG.map(dg => (
        <div key={dg.siglas} className="card p-4">
          {/* Header DG */}
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-guinda-100 text-guinda-600 rounded-lg flex items-center justify-center">
              <Briefcase size={16} />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-900">{dg.siglas}</h4>
              {dg.nombre !== dg.siglas && (
                <p className="text-xs text-gray-400">{dg.nombre}</p>
              )}
            </div>
            <span className="ml-auto text-xs text-gray-400">
              {dg.miembros.length} persona(s)
            </span>
          </div>

          {/* Miembros */}
          {dg.miembros.length > 0 ? (
            <div className="space-y-2">
              {dg.miembros.map((miembro, i) => (
                <div key={i} className="flex items-center gap-3 py-1.5">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    miembro.tipo === 'lider' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {miembro.tipo === 'lider' ? <Crown size={14} /> : <User size={14} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800">{miembro.nombre}</p>
                    <p className="text-xs text-gray-400 truncate">{miembro.rol}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400">DG participante (sin responsables asignados aún)</p>
          )}
        </div>
      ))}
    </div>
  );
}
