/**
 * ARCHIVO: inicio.controller.js
 * PROPÓSITO: Endpoint GET /inicio — dashboard personalizado del usuario.
 */
const inicioQueries = require('../db/queries/inicio.queries');
const geografiaQueries = require('../db/queries/geografia.queries');
const pool = require('../db/pool');
const { alcanceProyectosUsuario, resolverProyectoIdsFiltro } = require('../utils/alcanceProyectos');

// GET /inicio?proyecto_ids=id1,id2&cartera_id=xxx
// El filtro de Tablero (por uno/varios proyectos, o por cartera) se
// intersecta con el alcance real del usuario — nunca lo amplía, ni
// siquiera para ejecutivo (para quien la intersección es un no-op,
// porque su alcance ya es "todos"). proyecto_ids y cartera_id son
// mutuamente excluyentes; si llegan los dos, gana cartera_id.
async function obtenerInicio(req, res, next) {
  try {
    const usuario = req.usuario;
    const proyectoIds = await resolverProyectoIdsFiltro(usuario, req.query);

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

// GET /inicio/resumen-tarjetas — los conteos que necesita la pantalla
// de Inicio (el concentrador, distinto del Tablero) para sus tarjetas
// de acceso. Son puros COUNT (o el conteo de filas de la MISMA consulta
// que ya alimenta la pantalla destino de cada tarjeta — nunca una
// consulta nueva que recalcule "lo mismo" con otro criterio: así fue
// como una ronda anterior terminó con cifras que no coincidían con sus
// pantallas, ver "PSPP v2.0 · Inicio, color y la guía de uso", bloque 1).
// "Mis actividades" NO vive aquí: su cifra depende de la ventana de
// periodo (igual que MisActividades.jsx) y se calcula en el frontend,
// sobre los mismos datos de GET /agenda, con
// utils/resumenMisActividades.js — ver Inicio.jsx.
async function obtenerResumenTarjetas(req, res, next) {
  try {
    const usuario = req.usuario;
    const proyectoIds = await alcanceProyectosUsuario(usuario);

    const [proyectosVisibles, proyectosSigue, indicadoresVisibles, estadosConActividad] = await Promise.all([
      inicioQueries.contarProyectosVisibles(),
      inicioQueries.contarProyectosUsuario(proyectoIds),
      inicioQueries.contarIndicadoresVisibles(proyectoIds),
      // Mismo cálculo que /inicio/mapa (MapaTerritorial.jsx): cve_ent
      // directo en etapas/acciones + etapa_municipios/accion_municipios,
      // NO la tabla cobertura_geografica (que una ronda anterior usaba
      // por error — nunca estuvo poblada con lo mismo, por eso la
      // tarjeta decía "0" con el mapa mostrando "4"). Se llama la MISMA
      // función en vez de reescribir su CTE: una fila por estado con
      // actividad, así que el conteo es su .length.
      geografiaQueries.obtenerMapaIncidenciaGeo(proyectoIds),
    ]);

    res.json({
      datos: {
        proyectos_visibles: proyectosVisibles,
        proyectos_sigue: proyectosSigue,
        indicadores_visibles: indicadoresVisibles,
        estados_con_actividad: estadosConActividad.length,
      }
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { obtenerInicio, obtenerProyectosFiltro, obtenerCarterasFiltro, obtenerResumenTarjetas };
