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
 * Cerrar y "Ahora no" terminan en lo mismo: marcarSesionVista() apaga la
 * señal para el resto de la sesión. Nada queda sin resolver por esto —
 * sigue todo disponible en Notificaciones.
 *
 * MINI-CLASE: jerarquía de un modal con dos acciones distintas
 * ─────────────────────────────────────────────────────────────────
 * Resolver un pendiente (Aceptar/Declinar, dentro de cada tarjeta) es la
 * acción que este modal existe para ofrecer; posponerlo es la salida,
 * no el objetivo. Por eso el botón con el color institucional vive
 * dentro de cada tarjeta, y el pie del modal solo tiene un botón neutro
 * para salir — nunca al revés. Los componentes que listan invitaciones
 * y solicitudes son los mismos que usa la página de Notificaciones
 * (ocultarEncabezado solo apaga su título propio aquí adentro, para no
 * duplicar el encabezado del modal); si se ven bien en la página, se
 * ven bien aquí.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Inbox } from 'lucide-react';
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
  // Con un solo tipo presente no hace falta repetir "Invitaciones" o
  // "Solicitudes" — el título del modal ya lo dice. La distinción solo
  // aporta cuando ambos coexisten en la misma pantalla.
  const hayAmbosTipos = invitaciones.length > 0 && solicitudes.length > 0;

  function cerrar() {
    marcarSesionVista();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4" onClick={cerrar}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-pendientes-inicio"
      >
        <div className="flex items-start gap-3 px-6 pt-6 pb-4 flex-shrink-0">
          <div className="w-10 h-10 rounded-full bg-guinda-50 flex items-center justify-center flex-shrink-0">
            <Inbox size={18} className="text-guinda-600" />
          </div>
          <div className="min-w-0">
            <h3 id="titulo-pendientes-inicio" className="text-base font-semibold text-gray-900">
              {totalPendiente === 1 ? 'Tienes 1 pendiente por resolver' : `Tienes ${totalPendiente} pendientes por resolver`}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Acéptalos o declínalos aquí mismo, o ciérralo y revísalos más tarde en Notificaciones.
            </p>
          </div>
        </div>

        <div className="px-6 pb-2 space-y-5 overflow-y-auto border-t border-gray-100 pt-4">
          {invitaciones.length > 0 && (
            <div className="space-y-2">
              {hayAmbosTipos && (
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Invitaciones</p>
              )}
              <InvitacionesPendientes invitaciones={invitaciones} onRespondida={cargar} ocultarEncabezado />
            </div>
          )}
          {solicitudes.length > 0 && (
            <div className="space-y-2">
              {hayAmbosTipos && (
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Solicitudes de participación</p>
              )}
              <SolicitudesPorResolver solicitudes={solicitudes} onRespondida={cargar} ocultarEncabezado />
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0">
          <button
            onClick={() => { marcarSesionVista(); navigate('/notificaciones'); }}
            className="text-xs text-gray-500 hover:text-guinda-700 hover:underline"
          >
            Ver todo en Notificaciones
          </button>
          <button
            onClick={cerrar}
            className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Ahora no
          </button>
        </div>
      </div>
    </div>
  );
}
