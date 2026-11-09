/**
 * ARCHIVO: boletos.controller.js
 * PROPÓSITO: Emitir boletos efímeros de archivo (utils/boletoArchivo.js).
 *
 * POST /evidencias/:id/boleto  { accion: 'ver' | 'descargar' }
 * POST /actividad/:id/boleto   { accion: 'ver' | 'descargar' }
 *
 * Estas rutas viven DESPUÉS de verificarToken: el boleto solo se pide con
 * la cabecera Authorization normal, nunca por URL. Además pasan por el
 * mismo middleware de visibilidad que la transmisión, así que no se emite
 * un boleto para algo que el usuario no puede ver. Al usarlo, la
 * transmisión vuelve a validar el permiso (pudo cambiar en esos segundos).
 */
const { emitirBoleto } = require('../utils/boletoArchivo');

const ACCIONES = ['ver', 'descargar'];
const RUTA_POR_TIPO = { evidencia: 'evidencias', actividad: 'actividad' };

function emitirBoletoPara(tipo) {
  return function emitirBoletoHandler(req, res, next) {
    try {
      const accion = req.body?.accion;
      if (!ACCIONES.includes(accion)) {
        return res.status(400).json({ error: true, mensaje: 'accion debe ser "ver" o "descargar"', codigo: 'ACCION_INVALIDA' });
      }
      const id = req.params.id;
      const { boleto, expiraEnSegundos } = emitirBoleto(req.usuario, { tipo, id, accion });
      // Un boleto es una credencial: que ningún caché intermedio lo guarde.
      res.setHeader('Cache-Control', 'no-store');
      return res.json({
        datos: {
          boleto,
          // Relativa a la base de la API (/api/v1 o la que use el despliegue).
          ruta: `/${RUTA_POR_TIPO[tipo]}/${encodeURIComponent(id)}/${accion}?boleto=${encodeURIComponent(boleto)}`,
          expira_en_segundos: expiraEnSegundos,
        },
        mensaje: 'Boleto emitido',
      });
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = {
  emitirBoletoEvidencia: emitirBoletoPara('evidencia'),
  emitirBoletoActividad: emitirBoletoPara('actividad'),
};
