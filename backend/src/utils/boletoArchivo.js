/**
 * ARCHIVO: boletoArchivo.js
 * PROPÓSITO: Boleto efímero para abrir o descargar UN archivo desde una URL,
 *            en lugar de poner el token de sesión en la URL.
 *
 * NOTA TÉCNICA: por qué existe
 * ─────────────────────────────────────────────────────────────────
 * <a href>, <iframe> y <img> no pueden mandar la cabecera Authorization.
 * Antes el frontend resolvía eso poniendo el JWT de sesión (48 h) en la
 * query (?token=...). En SEDATU la petición cruza un F5, el nginx
 * institucional y el contenedor: tres capas que registran URLs, así que
 * esa sesión completa quedaba escrita en texto claro en tres bitácoras.
 *
 * El boleto acota lo que se puede hacer con una URL filtrada:
 *   - QUIÉN: el usuario que lo pidió (se pide con la cabecera normal).
 *   - QUÉ: un objeto concreto ("evidencia:<id>" o "actividad:<id>").
 *   - PARA QUÉ: una acción ("ver" o "descargar").
 *   - CUÁNDO: 60 s por omisión (BOLETO_ARCHIVO_TTL_SEGUNDOS).
 * La vigencia se revisa al EMPEZAR la petición: una descarga larga que ya
 * empezó termina aunque el boleto caduque a la mitad.
 *
 * Sin estado: es un JWT firmado, no hay tabla. Para que no se pueda
 * confundir con un token de sesión (ni al revés) hay tres barreras
 * independientes:
 *   1. Otra clave: HMAC-SHA256(JWT_SECRET, etiqueta fija). Un boleto no
 *      pasa la firma de sesión y una sesión no pasa la firma de boleto.
 *   2. Otro propósito: claim `prp: "archivo"`, que el middleware de sesión
 *      rechaza explícitamente y que aquí es obligatorio.
 *   3. Otra audiencia: `aud: "pspp-archivo"`, obligatoria al verificar.
 * Rotar JWT_SECRET invalida sesiones y boletos a la vez.
 * ─────────────────────────────────────────────────────────────────
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const PROPOSITO = 'archivo';
const AUDIENCIA = 'pspp-archivo';
const TIPOS = new Set(['evidencia', 'actividad']);
const ACCIONES = new Set(['ver', 'descargar']);
const TTL_POR_OMISION = 60;
const TTL_MAXIMO = 15 * 60; // un valor absurdo en el entorno no reabre el hueco

function vigenciaSegundos() {
  const n = Number.parseInt(process.env.BOLETO_ARCHIVO_TTL_SEGUNDOS, 10);
  if (!Number.isFinite(n) || n <= 0) return TTL_POR_OMISION;
  return Math.min(n, TTL_MAXIMO);
}

function claveBoletos() {
  const secreto = process.env.JWT_SECRET;
  if (!secreto) throw new Error('JWT_SECRET no está definido');
  return crypto.createHmac('sha256', secreto).update('pspp:boleto-archivo:v1').digest();
}

class ErrorBoleto extends Error {
  constructor(codigo, mensaje) {
    super(mensaje);
    this.codigo = codigo;
    this.statusCode = 401;
  }
}

/**
 * @param {{id: string, rol?: string, id_dg?: any, id_direccion_area?: any}} usuario  req.usuario de una sesión válida
 * @param {{tipo: 'evidencia'|'actividad', id: string, accion: 'ver'|'descargar'}} destino
 * @returns {{boleto: string, expiraEnSegundos: number}}
 */
function emitirBoleto(usuario, { tipo, id, accion }) {
  if (!usuario?.id) throw new Error('emitirBoleto requiere un usuario autenticado');
  if (!TIPOS.has(tipo)) throw new Error(`Tipo de archivo inválido: ${tipo}`);
  if (!ACCIONES.has(accion)) throw new Error(`Acción inválida: ${accion}`);
  if (!id) throw new Error('emitirBoleto requiere el id del objeto');

  const expiraEnSegundos = vigenciaSegundos();
  const boleto = jwt.sign(
    {
      prp: PROPOSITO,
      obj: `${tipo}:${id}`,
      acc: accion,
      // Lo mismo que el middleware de visibilidad lee de req.usuario.
      rol: usuario.rol,
      id_dg: usuario.id_dg,
      id_direccion_area: usuario.id_direccion_area,
    },
    claveBoletos(),
    { algorithm: 'HS256', audience: AUDIENCIA, subject: String(usuario.id), expiresIn: expiraEnSegundos },
  );
  return { boleto, expiraEnSegundos };
}

/**
 * Verifica que `boleto` sea válido, vigente y emitido para exactamente
 * este objeto y esta acción. Devuelve el usuario que lo pidió.
 * @throws {ErrorBoleto} siempre con statusCode 401
 */
function verificarBoleto(boleto, { tipo, id, accion }) {
  let datos;
  try {
    datos = jwt.verify(boleto, claveBoletos(), { algorithms: ['HS256'], audience: AUDIENCIA });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new ErrorBoleto('BOLETO_EXPIRADO', 'El enlace del archivo caducó; vuelve a abrirlo desde la plataforma.');
    }
    throw new ErrorBoleto('BOLETO_INVALIDO', 'Enlace de archivo inválido.');
  }
  if (datos.prp !== PROPOSITO || !datos.sub) {
    throw new ErrorBoleto('BOLETO_INVALIDO', 'Enlace de archivo inválido.');
  }
  if (datos.obj !== `${tipo}:${id}` || datos.acc !== accion) {
    throw new ErrorBoleto('BOLETO_OTRO_OBJETO', 'Este enlace no corresponde a este archivo.');
  }
  return {
    id: datos.sub,
    rol: datos.rol,
    id_dg: datos.id_dg,
    id_direccion_area: datos.id_direccion_area,
  };
}

module.exports = {
  emitirBoleto,
  verificarBoleto,
  vigenciaSegundos,
  ErrorBoleto,
  PROPOSITO_BOLETO: PROPOSITO,
  TTL_POR_OMISION,
};
