/**
 * ARCHIVO: correo.js
 * PROPÓSITO: Única interfaz de envío de correo del backend. Todo el
 * sistema manda correo a través de enviarCorreo() — ningún controlador
 * usa nodemailer directo ni ningún componente del frontend conoce
 * credenciales de correo.
 *
 * NOTA TÉCNICA: SMTP_HOST es el interruptor, no el momento del despliegue
 * ─────────────────────────────────────────────────────────────────
 * Sin SMTP_HOST el envío queda deshabilitado: se avisa una vez al
 * arrancar (avisarSiDeshabilitado, llamado desde server.js) y cada
 * intento omitido se registra en el log con destinatario y motivo. Con
 * SMTP_HOST definida, el envío se intenta de verdad; si el relevo no
 * responde, el error queda en el log pero nunca se propaga — quien llama
 * (crear usuario, pedir recuperación, asignar a un proyecto...) ya
 * completó su operación antes de intentar esto, o la completa igual.
 * ─────────────────────────────────────────────────────────────────
 */
const nodemailer = require('nodemailer');

let transportador = null;

function construirTransportador() {
  if (transportador) return transportador;
  transportador = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PUERTO) || 587,
    secure: process.env.SMTP_SEGURO === 'true',
    auth: (process.env.SMTP_USUARIO || process.env.SMTP_CONTRASENA)
      ? { user: process.env.SMTP_USUARIO, pass: process.env.SMTP_CONTRASENA }
      : undefined,
    // El relevo puede estar mal configurado o inalcanzable — estos topes
    // evitan que una petición HTTP que manda correo en línea se quede
    // colgada esperando una conexión que nunca va a cerrar.
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
  });
  return transportador;
}

// Un solo aviso en el log al arrancar — ver server.js::iniciar().
function avisarSiDeshabilitado() {
  if (!process.env.SMTP_HOST) {
    console.warn('[correo] SMTP_HOST no está definida: el envío de correo queda deshabilitado. Define las variables SMTP_* (ver deploy/README.md) para activarlo.');
  }
}

// Nunca lanza: la operación que disparó este correo (crear usuario, pedir
// recuperación, asignar a un proyecto...) ya se completó o se completa
// igual aunque el envío falle u omita.
async function enviarCorreo({ para, asunto, texto }) {
  if (!para) {
    console.warn(`[correo] Envío omitido ("${asunto}"): destinatario sin correo registrado.`);
    return { enviado: false, motivo: 'sin_destinatario' };
  }
  if (!process.env.SMTP_HOST) {
    console.warn(`[correo] Envío omitido a ${para} ("${asunto}"): SMTP_HOST no está configurada.`);
    return { enviado: false, motivo: 'smtp_no_configurado' };
  }
  try {
    const remitenteNombre = process.env.CORREO_REMITENTE_NOMBRE || 'PSPP';
    const remitente = process.env.CORREO_REMITENTE || process.env.SMTP_USUARIO;
    await construirTransportador().sendMail({
      from: `"${remitenteNombre}" <${remitente}>`,
      to: para,
      subject: asunto,
      text: texto,
    });
    return { enviado: true };
  } catch (err) {
    console.error(`[correo] Error al enviar a ${para} ("${asunto}"):`, err.message);
    return { enviado: false, motivo: 'error_transporte' };
  }
}

function enlaceBase() {
  return (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
}

function enlaceNotificaciones() {
  return `${enlaceBase()}/notificaciones`;
}

// Enlace al proyecto, o al nodo exacto cuando aplica — mismo deep-link
// que ya usa el resto de la app (?tab=seguimiento&nodo=).
function enlaceProyecto(proyectoId, { tipoNodo, idNodo } = {}) {
  if (!tipoNodo) return `${enlaceBase()}/proyectos/${proyectoId}`;
  return `${enlaceBase()}/proyectos/${proyectoId}?tab=seguimiento&nodo=${idNodo}`;
}

const ETIQUETA_NODO_DESTINO = { etapa: 'la etapa', accion: 'la acción', tarea: 'la tarea' };

// "el proyecto «Y»" o "la etapa «X» del proyecto «Y»" — texto reusado en
// los cuerpos de correoTextos.js (asignación, cambio de función,
// solicitud aceptada y por resolver).
function destinoTexto({ tipoNodo, nombreNodo, nombreProyecto }) {
  if (!tipoNodo) return `el proyecto «${nombreProyecto || ''}»`;
  return `${ETIQUETA_NODO_DESTINO[tipoNodo] || 'el elemento'} «${nombreNodo || ''}» del proyecto «${nombreProyecto || ''}»`;
}

module.exports = {
  enviarCorreo,
  avisarSiDeshabilitado,
  enlaceNotificaciones,
  enlaceProyecto,
  destinoTexto,
};
