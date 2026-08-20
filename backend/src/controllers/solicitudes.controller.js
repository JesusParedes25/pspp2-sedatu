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
const { puedeGestionarParticipantes, obtenerProyectoIdDeNodo } = require('../utils/autorizacion');
const { crearNotificacion } = require('../utils/notificaciones');
const pool = require('../db/pool');

const FUNCIONES = ['responsable', 'colaborador'];
// 'invitado' —ver sin capturar— solo tiene sentido en un nodo y para gente
// ajena a la Secretaría; a nivel proyecto no existe.
const FUNCIONES_NODO = ['responsable', 'colaborador', 'invitado'];

const ETIQUETA_NODO = { etapa: 'la etapa', accion: 'la acción', tarea: 'la tarea' };

// De qué nodo habla la ruta. Las rutas de nodo son
// POST /etapas|acciones|tareas/:id/solicitudes.
function nodoDeLaRuta(req) {
  if (req.params.etapaId) return { tipoNodo: 'etapa', idNodo: req.params.etapaId };
  if (req.params.accionId) return { tipoNodo: 'accion', idNodo: req.params.accionId };
  if (req.params.tareaId) return { tipoNodo: 'tarea', idNodo: req.params.tareaId };
  return {};
}

async function nombreProyecto(idProyecto) {
  const { rows } = await pool.query('SELECT nombre FROM proyectos WHERE id = $1', [idProyecto]);
  return rows[0]?.nombre || 'un proyecto';
}

const TABLA_NODO = { etapa: 'etapas', accion: 'acciones', tarea: 'tareas' };

async function nombreNodo(tipoNodo, idNodo) {
  const tabla = TABLA_NODO[tipoNodo];
  if (!tabla || !idNodo) return null;
  const { rows } = await pool.query(`SELECT nombre FROM ${tabla} WHERE id = $1`, [idNodo]);
  return rows[0]?.nombre || null;
}

// "la etapa «Diagnóstico» del proyecto «X»" o "el proyecto «X»", según el
// alcance. Se arma una vez y se reutiliza en los dos avisos (el que llega
// a quien decide y el que vuelve a quien pidió).
function describirDestino({ esDeNodo, tipoNodo, nombreDelNodo, nombreDelProyecto }) {
  return esDeNodo
    ? `${ETIQUETA_NODO[tipoNodo]} "${nombreDelNodo || 'sin nombre'}" del proyecto "${nombreDelProyecto}"`
    : `el proyecto "${nombreDelProyecto}"`;
}

// POST /proyectos/:id/solicitudes                      — { funcion, motivo }
// POST /etapas|acciones|tareas/:id/solicitudes          — { funcion, motivo }
//
// Mismo endpoint conceptual con dos alcances: todo el proyecto, o solo la
// parte donde la persona tiene algo que aportar. Pedir el proyecto entero
// cuando solo se va a trabajar en una etapa es pedir de más, y quien
// decide lo nota.
async function crear(req, res, next) {
  try {
    const { tipoNodo, idNodo } = nodoDeLaRuta(req);
    const esDeNodo = !!tipoNodo;
    const { funcion, motivo } = req.body || {};

    const permitidas = esDeNodo ? FUNCIONES_NODO : FUNCIONES;
    if (funcion && !permitidas.includes(funcion)) {
      return res.status(400).json({ error: true, mensaje: `funcion debe ser una de: ${permitidas.join(', ')}` });
    }

    // De un nodo se sube al proyecto: es lo que determina quién decide y a
    // quién avisar, y de paso confirma que el nodo existe.
    const idProyecto = esDeNodo
      ? await obtenerProyectoIdDeNodo(tipoNodo, idNodo)
      : req.params.id;
    if (!idProyecto) {
      return res.status(404).json({ error: true, mensaje: 'No se encontró el proyecto de este elemento', codigo: 'NO_ENCONTRADO' });
    }

    const { rows: existe } = await pool.query(
      'SELECT 1 FROM proyectos WHERE id = $1 AND deleted_at IS NULL', [idProyecto]
    );
    if (!existe[0]) {
      return res.status(404).json({ error: true, mensaje: 'Proyecto no encontrado', codigo: 'NO_ENCONTRADO' });
    }

    const resultado = await solicitudesQueries.crear({
      idProyecto, idUsuario: req.usuario.id, funcion, motivo, tipoNodo, idNodo,
    });

    if (resultado.yaParticipaEnNodo) {
      return res.status(409).json({
        error: true, codigo: 'YA_PARTICIPA_EN_NODO',
        mensaje: `Ya participas aquí como ${resultado.funcion}.`,
      });
    }

    if (resultado.yaParticipa) {
      return res.status(409).json({
        error: true, codigo: 'YA_PARTICIPA',
        mensaje: esDeNodo
          ? `Ya participas en todo el proyecto como ${resultado.funcion}, así que ya puedes trabajar aquí.`
          : `Ya participas en este proyecto como ${resultado.funcion}.`,
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
    const nombreDelNodo = esDeNodo ? await nombreNodo(tipoNodo, idNodo) : null;
    const destino = describirDestino({ esDeNodo, tipoNodo, nombreDelNodo, nombreDelProyecto: nombre });
    const destinatarios = await solicitudesQueries.destinatariosDe(idProyecto);
    const textoMotivo = resultado.solicitud.motivo ? ` Motivo: ${resultado.solicitud.motivo}` : '';
    for (const idUsuario of destinatarios) {
      if (idUsuario === req.usuario.id) continue;
      await crearNotificacion({
        tipo: 'Solicitud',
        mensaje: `${req.usuario.nombre_completo} solicita participar en ${destino} `
          + `como ${resultado.solicitud.funcion}.${textoMotivo}`,
        // Se apunta al nodo cuando lo hay: al hacer clic, quien decide cae
        // exactamente en la etapa de la que le están hablando.
        entidadTipo: esDeNodo ? ({ etapa: 'Etapa', accion: 'Accion', tarea: 'Tarea' })[tipoNodo] : 'Proyecto',
        entidadId: esDeNodo ? idNodo : idProyecto,
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

// GET /solicitudes-resueltas — lo que ESTE usuario ya aceptó o declinó,
// para que quede un rastro de la decisión después de que la tarjeta
// pendiente desaparece de la bandeja.
async function resueltasPorMi(req, res, next) {
  try {
    const resueltas = await solicitudesQueries.resueltasPorUsuario(req.usuario.id);
    res.json({ datos: resueltas, mensaje: 'Solicitudes resueltas' });
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
    const esDeNodo = !!solicitud.id_nodo;
    const destino = describirDestino({
      esDeNodo,
      tipoNodo: solicitud.tipo_nodo,
      nombreDelNodo: await nombreNodo(solicitud.tipo_nodo, solicitud.id_nodo),
      nombreDelProyecto: nombre,
    });
    const base = acepta
      ? `${req.usuario.nombre_completo} aceptó tu solicitud: ya participas en ${destino} como ${resuelta.funcion}.`
      : `${req.usuario.nombre_completo} declinó tu solicitud para participar en ${destino}.`;
    await crearNotificacion({
      tipo: 'RespuestaSolicitud',
      mensaje: resuelta.motivo_respuesta ? `${base} ${resuelta.motivo_respuesta}` : base,
      entidadTipo: esDeNodo ? ({ etapa: 'Etapa', accion: 'Accion', tarea: 'Tarea' })[solicitud.tipo_nodo] : 'Proyecto',
      entidadId: esDeNodo ? solicitud.id_nodo : solicitud.id_proyecto,
      idUsuario: solicitud.id_usuario,
    });

    res.json({ datos: resuelta, mensaje: acepta ? 'Solicitud aceptada' : 'Solicitud declinada' });
  } catch (err) { next(err); }
}

module.exports = { crear, listarDeProyecto, mias, porResolver, resueltasPorMi, responder };
