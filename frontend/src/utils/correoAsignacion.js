/**
 * ARCHIVO: correoAsignacion.js
 * PROPÓSITO: Correo de aviso a alguien que YA TIENE CUENTA cuando se le
 * asigna una función (responsable/colaborador) en un proyecto o en una
 * etapa/acción/tarea puntual — distinto del correo de invitación a una
 * cuenta nueva (ese vive en AdminCatalogos.jsx, enviarCorreoInvitacion,
 * disparado al crear el usuario, no al asignarlo a algo).
 *
 * Mismo criterio que ese: EmailJS corre en el navegador
 * (@emailjs/browser) — las credenciales (incluido el id de este
 * template, emailjs_template_id_asignacion) viven en configuracion_sistema
 * y se leen vía GET /admin/config/publico (público, sin autenticación —
 * ver admin.controller.js::obtenerConfigPublico). El superadmin crea el
 * template en EmailJS y pega su id en Configuración; nunca se escribe en
 * el código.
 *
 * Variables que debe aceptar el template en EmailJS:
 *   to_name               — nombre de quien recibe la asignación
 *   to_email              — correo de quien recibe la asignación
 *   nombre_quien_asigna   — quién hizo la asignación
 *   destino               — a qué proyecto o a qué parte ("el proyecto
 *                            «X»" / "la etapa «Y» del proyecto «X»")
 *   funcion               — con qué función (etiqueta legible)
 *   notificaciones_link   — URL a /notificaciones, para aceptar o rechazar
 *
 * Si falta configuración o falla el envío, el fallo es SILENCIOSO: la
 * asignación ya quedó guardada (lo importante) y no debe caerse por
 * esto — mismo criterio que enviarCorreoInvitacion. Se devuelve
 * { enviado: false, motivo } para que quien llama pueda avisar si quiere,
 * nunca para bloquear.
 */
import emailjs from '@emailjs/browser';
import { obtenerConfigPublico } from '../api/admin';

function enlaceNotificaciones() {
  const base = import.meta.env.BASE_URL || '/';
  const conSlash = base.endsWith('/') ? base : `${base}/`;
  return `${window.location.origin}${conSlash}notificaciones`;
}

export async function enviarCorreoAsignacion({ nombreDestino, correoDestino, nombreQuienAsigna, destino, funcion }) {
  try {
    const json = await obtenerConfigPublico();
    const cfg = json.datos || {};
    if (cfg.emailjs_enabled !== 'true') return { enviado: false, motivo: 'correo_deshabilitado' };
    const { emailjs_service_id: svcId, emailjs_template_id_asignacion: tplId, emailjs_public_key: pubKey } = cfg;
    if (!svcId || !tplId || !pubKey) return { enviado: false, motivo: 'sin_configuracion' };
    await emailjs.send(svcId, tplId, {
      to_name: nombreDestino,
      to_email: correoDestino,
      nombre_quien_asigna: nombreQuienAsigna || 'Alguien',
      destino,
      funcion,
      notificaciones_link: enlaceNotificaciones(),
    }, pubKey);
    return { enviado: true };
  } catch (err) {
    console.error('[correoAsignacion] Error al enviar correo de asignación:', err);
    return { enviado: false, motivo: 'error_envio' };
  }
}
