/**
 * ARCHIVO: correoAsignacion.js
 * PROPÓSITO: Correo de aviso a alguien que YA TIENE CUENTA cuando pasa
 * algo con su participación — lo asignan a un proyecto o a una parte,
 * le aceptan una solicitud, o le cambian la función — distinto del
 * correo de invitación a una cuenta nueva (ese vive en
 * AdminCatalogos.jsx, enviarCorreoInvitacion, disparado al crear el
 * usuario, no al asignarlo a algo).
 *
 * MINI-CLASE: por qué esta plantilla vive en SU PROPIA cuenta de EmailJS
 * ─────────────────────────────────────────────────────────────────
 * El plan gratuito de EmailJS da 2 plantillas por cuenta. Con la de
 * invitación ya ocupando una, esta ("asignación de participación")
 * necesita vivir en una CUENTA DISTINTA — no comparte service_id ni
 * public_key con la de invitación, cada una tiene su trío COMPLETO e
 * INDEPENDIENTE de credenciales (ver migración 082 y
 * TabConfiguracion en AdminCatalogos.jsx, bloque "Asignación de
 * participación"). Si falta cualquiera de los 3 campos de este trío,
 * el correo simplemente no se envía (motivo:'sin_configuracion',
 * registrado con console.warn) — nunca hereda nada del trío de
 * invitación ni de ningún otro valor compartido.
 *
 * Una sola plantilla cubre las 4 situaciones: el TEXTO viaja como
 * variable (titulo/mensaje/texto_boton/enlace), ya armado por la
 * plataforma — la plantilla de EmailJS solo lo pinta, nunca decide la
 * redacción. Variables que debe aceptar el template en EmailJS:
 *   to_name        — nombre de quien recibe
 *   to_email       — correo de quien recibe
 *   titulo         — encabezado del correo (sirve también para el asunto)
 *   mensaje        — la frase principal, ya armada por la plataforma
 *   destino        — nombre del proyecto o de la parte
 *   funcion        — etiqueta visible: Colaborador, Responsable, Solo lectura
 *   texto_boton    — texto del botón
 *   enlace         — a dónde lleva el botón
 *
 * LIMITACIÓN CONOCIDA (ver docs/modelo-permisos.md, sección 15.2): este
 * envío ocurre en el navegador de quien asigna (@emailjs/browser, igual
 * que el correo de invitación) — es de MEJOR ESFUERZO, no garantizado.
 * Si quien asigna cierra la pestaña de inmediato después de la acción,
 * el correo puede no llegar a salir. La notificación dentro de la
 * plataforma (crearNotificacion, en el backend) es la que sí es
 * confiable, porque la escribe el servidor — por eso toda asignación
 * registra ambas, nunca solo el correo.
 */
import emailjs from '@emailjs/browser';
import { obtenerConfigPublico } from '../api/admin';

// Mismo vocabulario que backend/src/utils/etiquetas-funcion.js —
// "Solo lectura", no "Invitado": en un correo, "ahora eres Invitado"
// suena a que te invitaron a algo, no a que tu acceso es de solo ver.
export const ETIQUETA_FUNCION_CORREO = {
  captura: 'Colaborador',
  responsable: 'Responsable',
  lectura: 'Solo lectura',
};
export function etiquetaFuncionCorreo(funcion) {
  return ETIQUETA_FUNCION_CORREO[funcion] || funcion;
}

const ETIQUETA_NODO = { etapa: 'la etapa', accion: 'la acción', tarea: 'la tarea' };

// "el proyecto «Y»" o "la etapa «X» del proyecto «Y»" — la misma frase
// se usa como variable `destino` y, embebida, dentro de `mensaje` (ver
// los composers de abajo) para no inventar una variable `proyecto`
// aparte.
export function construirDestino({ alcance, nodoTipo, nodoNombre, proyectoNombre }) {
  const nombreProyecto = proyectoNombre || '';
  if (!alcance || alcance === 'proyecto') return `el proyecto «${nombreProyecto}»`;
  const etiqueta = ETIQUETA_NODO[nodoTipo] || 'el elemento';
  return `${etiqueta} «${nodoNombre || ''}» del proyecto «${nombreProyecto}»`;
}

// Ruta relativa (sin dominio) al proyecto o al nodo exacto — mismo
// deep-link que ya usa el resto de la app (?tab=seguimiento&nodo=).
export function construirRuta({ proyectoId, alcance, nodoId }) {
  if (!alcance || alcance === 'proyecto') return `proyectos/${proyectoId}`;
  return `proyectos/${proyectoId}?tab=seguimiento&nodo=${nodoId}`;
}

export function enlaceAbsoluto(rutaRelativa) {
  const base = import.meta.env.BASE_URL || '/';
  const conSlash = base.endsWith('/') ? base : `${base}/`;
  const ruta = String(rutaRelativa || '').replace(/^\//, '');
  return `${window.location.origin}${conSlash}${ruta}`;
}

export function enlaceNotificaciones() {
  return enlaceAbsoluto('notificaciones');
}

// ─── Los 4 textos fijos (docs/modelo-permisos.md, sección 15.2) ───────
// Situación 1 y 2 llevan a notificaciones porque hay algo que aceptar o
// rechazar. Situación 3 y 4 llevan directo al trabajo porque ya no hay
// nada que decidir.

export function textosAsignacionProyecto({ quien, funcion, destino }) {
  return {
    titulo: 'Te asignaron a un proyecto',
    mensaje: `${quien || 'Alguien'} te asignó como ${funcion} en ${destino}.`,
    textoBoton: 'Ver mi invitación',
    enlace: enlaceNotificaciones(),
  };
}

export function textosAsignacionNodo({ quien, funcion, destino }) {
  return {
    titulo: 'Te asignaron a una parte de un proyecto',
    mensaje: `${quien || 'Alguien'} te asignó como ${funcion} en ${destino}.`,
    textoBoton: 'Ver mi invitación',
    enlace: enlaceNotificaciones(),
  };
}

export function textosSolicitudAceptada({ quien, funcion, destino, ruta }) {
  return {
    titulo: 'Aceptaron tu solicitud',
    mensaje: `${quien || 'Alguien'} aceptó tu solicitud. Ya puedes participar como ${funcion} en ${destino}.`,
    textoBoton: 'Ir al proyecto',
    enlace: enlaceAbsoluto(ruta),
  };
}

export function textosCambioFuncion({ quien, funcion, destino, ruta }) {
  return {
    titulo: 'Cambió tu función',
    mensaje: `${quien || 'Alguien'} cambió tu función en ${destino}. Ahora eres ${funcion}.`,
    textoBoton: 'Ir al proyecto',
    enlace: enlaceAbsoluto(ruta),
  };
}

// Situación 5: alguien solicita participar — a quienes resuelven la
// solicitud (destinatariosDe), no a quien la envía. Lleva a notificaciones
// porque hay algo que aceptar o rechazar, igual que 1 y 2.
export function textosSolicitud({ quien, funcion, destino }) {
  return {
    titulo: 'Solicitud de participación',
    mensaje: `${quien || 'Alguien'} solicitó participar como ${funcion} en ${destino}.`,
    textoBoton: 'Revisar solicitud',
    enlace: enlaceNotificaciones(),
  };
}

// Envía el correo. Devuelve { enviado: true } o { enviado: false, motivo }
// — nunca lanza: quien llama lo dispara sin esperar (fire-and-forget),
// la asignación/aceptación/cambio ya quedó guardado antes de intentar
// esto.
export async function enviarCorreoAsignacion({ nombreDestino, correoDestino, titulo, mensaje, destino, funcion, textoBoton, enlace }) {
  try {
    const json = await obtenerConfigPublico();
    const cfg = json.datos || {};
    const svcId = cfg.emailjs_asignacion_service_id;
    const tplId = cfg.emailjs_asignacion_template_id;
    const pubKey = cfg.emailjs_asignacion_public_key;
    if (!svcId || !tplId || !pubKey) {
      console.warn('[correoAsignacion] Trío de credenciales incompleto para "Asignación de participación" (Service ID / Template ID / Public Key): correo no enviado.');
      return { enviado: false, motivo: 'sin_configuracion' };
    }
    if (!correoDestino) {
      console.warn(`[correoAsignacion] "${nombreDestino || 'destinatario'}" no tiene correo registrado: correo no enviado.`);
      return { enviado: false, motivo: 'sin_correo_destino' };
    }
    await emailjs.send(svcId, tplId, {
      to_name: nombreDestino,
      to_email: correoDestino,
      titulo,
      mensaje,
      destino,
      funcion,
      texto_boton: textoBoton,
      enlace,
    }, pubKey);
    // Éxito silencioso a propósito en el resto del flujo (fire-and-forget),
    // pero logueado explícitamente aquí: EmailJS aceptó el envío no prueba
    // que el correo haya llegado al buzón (puede ir a spam, o la cuenta
    // de EmailJS puede rechazarlo después, fuera de lo que ve el
    // navegador) — este log es lo único que distingue "no se intentó
    // nada" de "se intentó y EmailJS lo aceptó" cuando se revisa la
    // consola después de una prueba.
    console.info(`[correoAsignacion] Enviado a ${correoDestino} ("${titulo}").`);
    return { enviado: true };
  } catch (err) {
    console.error(`[correoAsignacion] Error al enviar correo de asignación a ${correoDestino || 'destinatario sin correo'}:`, err);
    return { enviado: false, motivo: 'error_envio' };
  }
}
