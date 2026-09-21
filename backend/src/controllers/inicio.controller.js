/**
 * ARCHIVO: inicio.controller.js
 * PROPÓSITO: Endpoint GET /inicio — dashboard personalizado del usuario.
 */
const inicioQueries = require('../db/queries/inicio.queries');
const carterasQueries = require('../db/queries/carteras.queries');
const pool = require('../db/pool');
const { alcanceProyectosUsuario } = require('../utils/alcanceProyectos');

// GET /inicio?proyecto_ids=id1,id2&cartera_id=xxx
// El filtro de Tablero (por uno/varios proyectos, o por cartera) se
// intersecta con el alcance real del usuario — nunca lo amplía, ni
// siquiera para ejecutivo (para quien la intersección es un no-op,
// porque su alcance ya es "todos"). proyecto_ids y cartera_id son
// mutuamente excluyentes; si llegan los dos, gana cartera_id.
async function obtenerInicio(req, res, next) {
  try {
    const usuario = req.usuario;
    let proyectoIds = await alcanceProyectosUsuario(usuario);

    const { proyecto_ids: proyectoIdsQuery, cartera_id: carteraIdQuery } = req.query;
    if (carteraIdQuery) {
      const idsCartera = new Set(await carterasQueries.obtenerProyectoIdsDeCartera(carteraIdQuery));
      proyectoIds = proyectoIds.filter(id => idsCartera.has(id));
    } else if (proyectoIdsQuery) {
      const pedidos = new Set(String(proyectoIdsQuery).split(',').map(s => s.trim()).filter(Boolean));
      proyectoIds = proyectoIds.filter(id => pedidos.has(id));
    }

    if (!proyectoIds || proyectoIds.length === 0) {
      return res.json({
        datos: {
          proyectos: [],
          vencidos: [],
          por_vencer: [],
          riesgos: [],
          mapa_incidencia: [],
          indicadores: [],
          actividad: []
        }
      });
    }

    const [proyectos, vencidos, porVencer, riesgos, mapaIncidencia, indicadores, actividad, estatusCualitativo] = await Promise.all([
      inicioQueries.obtenerProyectosUsuario(proyectoIds).then(rows => {
        // Convertir path de MinIO a URL proxy del backend — mismo criterio
        // que proyectos.controller.js (listar/obtenerPorId): la columna
        // guarda la ruta de MinIO, no una URL que el navegador pueda pedir
        // directo.
        for (const p of rows) {
          if (p.imagen_url) p.imagen_url = `/api/v1/proyectos/${p.id}/imagen`;
        }
        return rows;
      }),
      inicioQueries.obtenerVencidos(proyectoIds),
      inicioQueries.obtenerPorVencer(proyectoIds),
      inicioQueries.obtenerRiesgosAbiertos(proyectoIds),
      inicioQueries.obtenerMapaIncidencia(proyectoIds),
      inicioQueries.obtenerIndicadoresAgregados(proyectoIds),
      inicioQueries.obtenerActividadReciente(proyectoIds),
      inicioQueries.obtenerEstatusCualitativo(proyectoIds),
    ]);

    res.json({
      datos: {
        proyectos,
        vencidos,
        por_vencer: porVencer,
        riesgos,
        mapa_incidencia: mapaIncidencia,
        indicadores,
        actividad,
        estatus_cualitativo: estatusCualitativo
      }
    });
  } catch (err) {
    next(err);
  }
}

// GET /inicio/filtros/proyectos — lista liviana {id,nombre} para el
// selector del filtro de Tablero, ya acotada al alcance real del
// usuario (superadmin/ejecutivo ven todos los proyectos activos).
async function obtenerProyectosFiltro(req, res, next) {
  try {
    const proyectoIds = await alcanceProyectosUsuario(req.usuario);
    if (proyectoIds.length === 0) return res.json({ datos: [] });
    const { rows } = await pool.query(
      "SELECT id, nombre FROM proyectos WHERE deleted_at IS NULL AND estado != 'Cancelada' AND id = ANY($1) ORDER BY nombre",
      [proyectoIds]
    );
    res.json({ datos: rows });
  } catch (err) {
    next(err);
  }
}

// GET /inicio/filtros/carteras — lista liviana {id,nombre} de carteras
// para el selector del filtro de Tablero. Una cartera solo aparece como
// opción si al menos uno de sus proyectos está en el alcance del
// usuario — a diferencia de GET /carteras (catálogo global, por diseño:
// ver carteras.controller.js), este endpoint es específico del filtro
// de Tablero y sí respeta la misma restricción de participación que ya
// aplica el resto de esta página. Para superadmin/ejecutivo, cuyo
// alcance ya es "todos los proyectos activos", se devuelve el catálogo
// completo de carteras sin necesidad de intersectar nada.
async function obtenerCarterasFiltro(req, res, next) {
  try {
    const usuario = req.usuario;
    if (usuario.rol === 'superadmin' || usuario.rol === 'ejecutivo') {
      const { rows } = await pool.query('SELECT id, nombre FROM carteras ORDER BY nombre');
      return res.json({ datos: rows });
    }
    const proyectoIds = await alcanceProyectosUsuario(usuario);
    if (proyectoIds.length === 0) return res.json({ datos: [] });
    const { rows } = await pool.query(`
      SELECT DISTINCT c.id, c.nombre
      FROM carteras c
      JOIN cartera_proyecto cp ON cp.cartera_id = c.id
      WHERE cp.proyecto_id = ANY($1)
      ORDER BY c.nombre
    `, [proyectoIds]);
    res.json({ datos: rows });
  } catch (err) {
    next(err);
  }
}

module.exports = { obtenerInicio, obtenerProyectosFiltro, obtenerCarterasFiltro };
