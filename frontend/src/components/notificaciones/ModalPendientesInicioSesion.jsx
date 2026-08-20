/**
 * ARCHIVO: ModalPendientesInicioSesion.jsx
 * PROPÓSITO: Al iniciar sesión, si hay invitaciones o solicitudes
 *            esperando respuesta, mostrarlas de entrada en un modal que
 *            se puede resolver ahí mismo o posponer.
 *
 * MINI-CLASE: interrumpir solo cuando de verdad conviene
 * ─────────────────────────────────────────────────────────────────
 * Antes, un pendiente solo se veía si la persona entraba a Notificaciones
 * por su cuenta — con la campanita sin contarlo bien (ver useCentroNotifi-
 * caciones), era fácil ni enterarse. Mostrarlo justo al entrar aprovecha
 * el único momento en que el usuario ya está prestando atención a la
 * pantalla completa, sin competir con el trabajo que ya tenía abierto.
 *
 * Se dispara con `sesionRecienIniciada` (AuthContext), que SOLO se
 * enciende cuando login() se acaba de completar en esta pestaña — nunca
 * al restaurar sesión en un refresh. Así no se vuelve una interrupción
 * repetida cada vez que se recarga la página a medio trabajar.
 *
 * Cerrar, "Más tarde" y resolver-hasta-vaciar terminan en lo mismo:
 * marcarSesionVista() apaga la señal para el resto de la sesión. Nada
 * queda sin resolver por esto — sigue todo en Notificaciones.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { misInvitaciones } from '../../api/miembros';
import { solicitudesPorResolver } from '../../api/solicitudes';
import InvitacionesPendientes from './InvitacionesPendientes';
import SolicitudesPorResolver from './SolicitudesPorResolver';

export default function ModalPendientesInicioSesion({ onResuelto }) {
  const { sesionRecienIniciada, marcarSesionVista } = useAuth();
  const navigate = useNavigate();
  const [invitaciones, setInvitaciones] = useState(null); // null = todavía no se sabe
  const [solicitudes, setSolicitudes] = useState(null);

  const cargar = useCallback(async () => {
    const [inv, sol] = await Promise.all([
      misInvitaciones().catch(() => []),
      solicitudesPorResolver().catch(() => []),
    ]);
    setInvitaciones(inv);
    setSolicitudes(sol);
    // Nada que mostrar (o ya se resolvió todo): no interrumpir con un
    // modal vacío. Esto es también lo que lo cierra solo cuando la
    // última pendiente se acaba de resolver adentro del modal.
    if (inv.length === 0 && sol.length === 0) marcarSesionVista();
    // La campanita del header pide su propio resumen cada 30s — sin
    // esto, alguien que acaba de aceptar algo aquí vería el número
    // viejo hasta el siguiente polling, como si su acción no hubiera
    // contado.
    onResuelto?.();
  }, [marcarSesionVista, onResuelto]);

  useEffect(() => {
    if (sesionRecienIniciada) cargar();
  }, [sesionRecienIniciada, cargar]);

  if (!sesionRecienIniciada) return null;
  // Todavía cargando el primer chequeo, o ya se determinó que no hay nada.
  if (invitaciones === null || (invitaciones.length === 0 && solicitudes.length === 0)) return null;

  const totalPendiente = invitaciones.length + solicitudes.length;

  function cerrar() {
    marcarSesionVista();
  }

  function irANotificaciones() {
    marcarSesionVista();
    navigate('/notificaciones');
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-[9999] flex items-center justify-center p-4" onClick={cerrar}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Antes de empezar</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {totalPendiente === 1
                ? 'Tienes 1 pendiente por resolver.'
                : `Tienes ${totalPendiente} pendientes por resolver.`}
              {' '}Puedes atenderlos ahora o dejarlos para después.
            </p>
          </div>
          <button onClick={cerrar} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg flex-shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          <InvitacionesPendientes invitaciones={invitaciones} onRespondida={cargar} />
          <SolicitudesPorResolver solicitudes={solicitudes} onRespondida={cargar} />
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 flex-shrink-0">
          <button onClick={irANotificaciones} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
            Ver en Notificaciones
          </button>
          <button onClick={cerrar} className="px-4 py-2 text-sm font-medium text-white bg-guinda-700 rounded-lg hover:bg-guinda-600">
            Más tarde, seguir trabajando
          </button>
        </div>
      </div>
    </div>
  );
}
