/**
 * ARCHIVO: solicitudes.controller.js
 * PROPÓSITO: Endpoints de solicitudes de participación — pedir entrar a un
 *            proyecto, y aceptarlas o declinarlas.
 *
 * MINI-CLASE: quién puede hacer qué aquí
 * ─────────────────────────────────────────────────────────────────
 * Solicitar lo puede hacer cualquiera que vea el proyecto —o sea, casi
 * todos, porque la visibilidad es total— salvo quien ya participa o ya
 * tiene una invitación esperando respuesta: pedir lo que ya se tiene solo
 * genera ruido para quien decide.
 *
 * Resolverla la puede hacer quien designa participantes en ese proyecto,
 * que es exactamente la misma facultad que invitar (puedeGestionarParti-
 * cipantes). Si aceptar una solicitud exigiera un permiso distinto al de
 * invitar, habría dos maneras de meter gente al proyecto con dos reglas
 * distintas, que es como se abren los huecos.
 * ─────────────────────────────────────────────────────────────────
 */
const solicitudesQueries = require('../db/queries/solicitudes.queries');
const { puedeGestionarParticipantes } = require('../utils/autorizacion');
const { crearNotificacion } = require('../utils/notificaciones');
const pool = require('../db/pool');

const FUNCIONES = ['responsable', 'colaborador'];

async function nombreProyecto(idProyecto) {
  const { rows } = await pool.query('SELECT nombre FROM proyectos WHERE id = $1', [idProyecto]);
  return rows[0]?.nombre || 'un proyecto';
}

// POST /proyectos/:id/solicitudes — { funcion, motivo }
async function crear(req, res, next) {
  try {
    const idProyecto = req.params.id;
    const { funcion, motivo } = req.body || {};
    if (funcion && !FUNCIONES.includes(funcion)) {
      return res.status(400).json({ error: true, mensaje: `funcion debe ser una de: ${FUNCIONES.join(', ')}` });
    }

    const { rows: existe } = await pool.query(
      'SELECT 1 FROM proyectos WHERE id = $1 AND deleted_at IS NULL', [idProyecto]
    );
    if (!existe[0]) {
      return res.status(404).json({ error: true, mensaje: 'Proyecto no encontrado', codigo: 'NO_ENCONTRADO' });
    }

    const resultado = await solicitudesQueries.crear({
      idProyecto, idUsuario: req.usuario.id, funcion, motivo,
    });

    if (resultado.yaParticipa) {
      return res.status(409).json({
        error: true, codigo: 'YA_PARTICIPA',
        mensaje: `Ya participas en este proyecto como ${resultado.funcion}.`,
      });
    }
    if (resultado.invitacionPendiente) {
      return res.status(409).json({
        error: true, codigo: 'INVITACION_PENDIENTE',
        mensaje: `Ya te invitaron a este proyecto como ${resultado.funcion}. Responde la invitación en Notificaciones.`,
      });
    }
    if (resultado.duplicada) {
      return res.status(409).json({
        error: true, codigo: 'SOLICITUD_DUPLICADA',
        mensaje: 'Ya tienes una solicitud pendiente en este proyecto.',
      });
    }

    // Avisar a quienes pueden resolverla.
    const nombre = await nombreProyecto(idProyecto);
    const destinatarios = await solicitudesQueries.destinatariosDe(idProyecto);
    const textoMotivo = resultado.solicitud.motivo ? ` Motivo: ${resultado.solicitud.motivo}` : '';
    for (const idUsuario of destinatarios) {
      if (idUsuario === req.usuario.id) continue;
      await crearNotificacion({
        tipo: 'Solicitud',
        mensaje: `${req.usuario.nombre_completo} solicita participar en el proyecto "${nombre}" `
          + `como ${resultado.solicitud.funcion}.${textoMotivo}`,
        entidadTipo: 'Proyecto',
        entidadId: idProyecto,
        idUsuario,
      });
    }

    res.status(201).json({ datos: resultado.solicitud, mensaje: 'Solicitud enviada' });
  } catch (err) { next(err); }
}

// GET /proyectos/:id/solicitudes?estado=pendiente
async function listarDeProyecto(req, res, next) {
  try {
    const permitido = await puedeGestionarParticipantes({ usuario: req.usuario, idProyecto: req.params.id });
    if (!permitido) {
      return res.status(403).json({ error: true, mensaje: 'No tienes permisos para ver las solicitudes de este proyecto' });
    }
    const solicitudes = await solicitudesQueries.listarDeProyecto(req.params.id, req.query.estado);
    res.json({ datos: solicitudes, mensaje: 'Solicitudes del proyecto' });
  } catch (err) { next(err); }
}

// GET /mis-solicitudes
async function mias(req, res, next) {
  try {
    res.json({ datos: await solicitudesQueries.listarDeUsuario(req.usuario.id), mensaje: 'Mis solicitudes' });
  } catch (err) { next(err); }
}

// GET /solicitudes-por-resolver — bandeja del que decide, de todos sus proyectos
async function porResolver(req, res, next) {
  try {
    const pendientes = await solicitudesQueries.pendientesQuePuedeResolver(req.usuario);
    res.json({ datos: pendientes, mensaje: 'Solicitudes por resolver' });
  } catch (err) { next(err); }
}

// POST /solicitudes/:id/responder — { respuesta: 'aceptar'|'declinar', motivo }
//
// Declinar NO exige motivo, al revés que rechazar una invitación. La
// asimetría es intencional: quien rechaza una invitación deja un hueco de
// trabajo que alguien más tiene que cubrir, y el motivo es lo que permite
// reasignarlo. Declinar una solicitud no deja hueco — el proyecto sigue
// como estaba — y obligar a justificar cada "no" ante alguien de otra área
// invita a no responder.
async function responder(req, res, next) {
  try {
    const { respuesta, motivo } = req.body || {};
    if (!['aceptar', 'declinar'].includes(respuesta)) {
      return res.status(400).json({ error: true, mensaje: "respuesta debe ser 'aceptar' o 'declinar'" });
    }

    const solicitud = await solicitudesQueries.obtener(req.params.id);
    if (!solicitud) {
      return res.status(404).json({ error: true, mensaje: 'Solicitud no encontrada' });
    }
    if (solicitud.estado !== 'pendiente') {
      return res.status(409).json({ error: true, mensaje: 'Esta solicitud ya fue respondida.' });
    }

    const permitido = await puedeGestionarParticipantes({ usuario: req.usuario, idProyecto: solicitud.id_proyecto });
    if (!permitido) {
      return res.status(403).json({ error: true, mensaje: 'No tienes permisos para resolver solicitudes de este proyecto' });
    }

    const acepta = respuesta === 'aceptar';
    const resuelta = await solicitudesQueries.responder({
      idSolicitud: req.params.id,
      idQuienResuelve: req.usuario.id,
      acepta,
      motivoRespuesta: motivo,
    });
    if (!resuelta) {
      return res.status(409).json({ error: true, mensaje: 'Esta solicitud ya fue respondida.' });
    }

    const nombre = await nombreProyecto(solicitud.id_proyecto);
    const base = acepta
      ? `${req.usuario.nombre_completo} aceptó tu solicitud: ya participas en el proyecto "${nombre}" como ${resuelta.funcion}.`
      : `${req.usuario.nombre_completo} declinó tu solicitud para participar en el proyecto "${nombre}".`;
    await crearNotificacion({
      tipo: 'RespuestaSolicitud',
      mensaje: resuelta.motivo_respuesta ? `${base} ${resuelta.motivo_respuesta}` : base,
      entidadTipo: 'Proyecto',
      entidadId: solicitud.id_proyecto,
      idUsuario: solicitud.id_usuario,
    });

    res.json({ datos: resuelta, mensaje: acepta ? 'Solicitud aceptada' : 'Solicitud declinada' });
  } catch (err) { next(err); }
}

module.exports = { crear, listarDeProyecto, mias, porResolver, responder };
