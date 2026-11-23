/**
 * ARCHIVO: correoTextos.js
 * PROPÓSITO: Redacción de todos los correos que manda la plataforma —
 * un único módulo, una función por situación, para que sea la fuente
 * que se lee al armar la relación de correos del sistema (entregable
 * DGTIC). Texto plano, sobrio e institucional: sin imágenes ni recursos
 * externos. El llamador siempre pasa el enlace y el destino ya armados
 * (ver utils/correo.js); este módulo solo redacta.
 */

// Mismo vocabulario que utils/etiquetas-funcion.js — "Solo lectura", no
// "Invitado": en un correo, "ahora eres Invitado" suena a que te
// invitaron a algo, no a que tu acceso es de solo ver.
const ETIQUETA_FUNCION = { captura: 'Colaborador', responsable: 'Responsable', lectura: 'Solo lectura' };
function etiquetaFuncion(funcion) {
  return ETIQUETA_FUNCION[funcion] || funcion;
}

function pie() {
  return '\n\n—\nPSPP — Plataforma de Seguimiento de Proyectos Prioritarios\nSecretaría de Desarrollo Agrario, Territorial y Urbano (SEDATU)\nEste es un correo automático; no respondas a esta dirección.';
}

// Situación 1: cuenta nueva (admin.controller.js::crearUsuario,
// ::reenviarInvitacion).
function invitacion({ nombre, inviteLink }) {
  return {
    asunto: 'Invitación a PSPP',
    texto: `Hola${nombre ? ` ${nombre}` : ''}:\n\n`
      + 'Se creó una cuenta para ti en PSPP, la Plataforma de Seguimiento de Proyectos Prioritarios de SEDATU.\n\n'
      + `Para activarla y establecer tu contraseña, visita el siguiente enlace (vigente por 30 días):\n${inviteLink}\n\n`
      + 'Si no esperabas este correo, puedes ignorarlo.'
      + pie(),
  };
}

// Situación 2: recuperación de contraseña (auth.controller.js::solicitarRecuperacion).
function recuperacion({ nombre, resetLink }) {
  return {
    asunto: 'Recuperación de contraseña — PSPP',
    texto: `Hola${nombre ? ` ${nombre}` : ''}:\n\n`
      + 'Recibimos una solicitud para restablecer la contraseña de tu cuenta en PSPP.\n\n'
      + `Para continuar, visita el siguiente enlace (vigente por 4 horas):\n${resetLink}\n\n`
      + 'Si no solicitaste este cambio, puedes ignorar este correo: tu contraseña actual seguirá funcionando.'
      + pie(),
  };
}

// Situación 3: asignación a un proyecto o a una parte de uno — cubre
// tanto "te invitaron a un proyecto" como "te invitaron a una etapa" (el
// mismo cuerpo, solo cambia `destino`). Hay algo que aceptar o rechazar,
// por eso el enlace lleva a notificaciones.
function asignacion({ nombre, quien, funcion, destino, enlace }) {
  return {
    asunto: 'Te asignaron en PSPP',
    texto: `Hola${nombre ? ` ${nombre}` : ''}:\n\n`
      + `${quien || 'Alguien'} te asignó como ${etiquetaFuncion(funcion)} en ${destino}.\n\n`
      + `Puedes revisarlo en:\n${enlace}`
      + pie(),
  };
}

// Situación 4: cambio de función de quien ya participaba — ya se aplicó,
// no hay nada que decidir, por eso el enlace lleva directo al proyecto o
// nodo en cuestión.
function cambioFuncion({ nombre, quien, funcion, destino, enlace }) {
  return {
    asunto: 'Cambió tu función en PSPP',
    texto: `Hola${nombre ? ` ${nombre}` : ''}:\n\n`
      + `${quien || 'Alguien'} cambió tu función en ${destino}. Ahora eres ${etiquetaFuncion(funcion)}.\n\n`
      + `Puedes revisarlo en:\n${enlace}`
      + pie(),
  };
}

// Situación 5: a quien solicitó participar, le aceptaron — ya se aplicó.
function solicitudAceptada({ nombre, quien, funcion, destino, enlace }) {
  return {
    asunto: 'Aceptaron tu solicitud en PSPP',
    texto: `Hola${nombre ? ` ${nombre}` : ''}:\n\n`
      + `${quien || 'Alguien'} aceptó tu solicitud. Ya puedes participar como ${etiquetaFuncion(funcion)} en ${destino}.\n\n`
      + `Puedes revisarlo en:\n${enlace}`
      + pie(),
  };
}

// Situación 6: a quien puede resolverla, alguien solicitó participar —
// hay algo que decidir, por eso el enlace lleva a notificaciones.
function solicitudPorResolver({ nombre, quien, funcion, destino, enlace }) {
  return {
    asunto: 'Solicitud de participación en PSPP',
    texto: `Hola${nombre ? ` ${nombre}` : ''}:\n\n`
      + `${quien || 'Alguien'} solicitó participar como ${etiquetaFuncion(funcion)} en ${destino}.\n\n`
      + `Puedes revisar la solicitud en:\n${enlace}`
      + pie(),
  };
}

module.exports = {
  etiquetaFuncion,
  invitacion,
  recuperacion,
  asignacion,
  cambioFuncion,
  solicitudAceptada,
  solicitudPorResolver,
};
