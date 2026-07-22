/**
 * ARCHIVO: admin.controller.js
 * PROPÓSITO: Endpoints de administración (solo superadmin).
 * - CRUD de valores en tabla catalogos
 * - Reemplazo transaccional de shapefiles geográficos
 */
const pool = require('../db/pool');
const XLSX = require('xlsx');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// ─── CATÁLOGOS ─────────────────────────────────────────────────

// GET /admin/catalogos — Lista todos los tipos con sus valores
async function listarCatalogos(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT id, tipo, valor, descripcion, orden, extensible, activo
       FROM catalogos ORDER BY tipo, orden, valor`
    );
    // Agrupar por tipo
    const agrupado = {};
    for (const r of rows) {
      if (!agrupado[r.tipo]) agrupado[r.tipo] = { tipo: r.tipo, extensible: r.extensible, valores: [] };
      agrupado[r.tipo].valores.push(r);
    }
    res.json({ datos: Object.values(agrupado), mensaje: 'Catálogos obtenidos' });
  } catch (err) { next(err); }
}

// POST /admin/catalogos — Agregar valor
async function agregarValorCatalogo(req, res, next) {
  try {
    const { tipo, valor, descripcion } = req.body;
    if (!tipo || !valor) {
      return res.status(400).json({ error: true, mensaje: 'Se requiere "tipo" y "valor".' });
    }
    const { rows: maxRows } = await pool.query(
      'SELECT COALESCE(MAX(orden), 0) + 1 AS sig FROM catalogos WHERE tipo = $1', [tipo]
    );
    const { rows } = await pool.query(
      `INSERT INTO catalogos (tipo, valor, descripcion, orden)
       VALUES ($1, $2, $3, $4) ON CONFLICT (tipo, valor) DO NOTHING RETURNING *`,
      [tipo, valor.trim(), descripcion || null, maxRows[0].sig]
    );
    if (rows.length === 0) {
      return res.status(409).json({ error: true, mensaje: 'El valor ya existe.' });
    }
    res.status(201).json({ datos: rows[0], mensaje: 'Valor agregado' });
  } catch (err) { next(err); }
}

// PUT /admin/catalogos/:id — Editar valor (sustituir texto)
async function editarValorCatalogo(req, res, next) {
  try {
    const { id } = req.params;
    const { valor, descripcion, orden } = req.body;
    const sets = [];
    const params = [];
    let idx = 1;
    if (valor !== undefined) { sets.push(`valor = $${idx++}`); params.push(valor.trim()); }
    if (descripcion !== undefined) { sets.push(`descripcion = $${idx++}`); params.push(descripcion); }
    if (orden !== undefined) { sets.push(`orden = $${idx++}`); params.push(orden); }
    if (sets.length === 0) {
      return res.status(400).json({ error: true, mensaje: 'Nada que actualizar.' });
    }
    params.push(id);
    const { rows } = await pool.query(
      `UPDATE catalogos SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, params
    );
    if (rows.length === 0) return res.status(404).json({ error: true, mensaje: 'No encontrado.' });
    res.json({ datos: rows[0], mensaje: 'Valor actualizado' });
  } catch (err) { next(err); }
}

// DELETE /admin/catalogos/:id — Desactivar (activo=false, no borrado físico)
async function desactivarValorCatalogo(req, res, next) {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      'UPDATE catalogos SET activo = false WHERE id = $1 RETURNING *', [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: true, mensaje: 'No encontrado.' });
    res.json({ datos: rows[0], mensaje: 'Valor desactivado' });
  } catch (err) { next(err); }
}

// PATCH /admin/catalogos/:id/reactivar — Reactivar
async function reactivarValorCatalogo(req, res, next) {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      'UPDATE catalogos SET activo = true WHERE id = $1 RETURNING *', [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: true, mensaje: 'No encontrado.' });
    res.json({ datos: rows[0], mensaje: 'Valor reactivado' });
  } catch (err) { next(err); }
}

// ─── GEOGRAFÍA: Reemplazo de shapefiles ──────────────────────

// POST /admin/geo/reemplazar/:capa — Reemplazar shapefile (zip)
// capa = estados | municipios | zm
async function reemplazarShapefile(req, res, next) {
  try {
    const { capa } = req.params;
    if (!['estados', 'municipios', 'zm'].includes(capa)) {
      return res.status(400).json({ error: true, mensaje: 'Capa inválida. Use: estados, municipios, zm' });
    }
    if (!req.file) {
      return res.status(400).json({ error: true, mensaje: 'Se requiere un archivo .zip con el shapefile.' });
    }

    const AdmZip = require('adm-zip');
    const zip = new AdmZip(req.file.buffer);
    const entries = zip.getEntries();

    // Determinar si es geojson o shapefile
    const geojsonEntry = entries.find(e => e.entryName.endsWith('.geojson') || e.entryName.endsWith('.json'));
    const shpEntry = entries.find(e => e.entryName.endsWith('.shp'));

    if (!geojsonEntry && !shpEntry) {
      return res.status(400).json({ error: true, mensaje: 'El zip debe contener un .shp o .geojson.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const tablaDestino = capa === 'estados' ? 'geo_estados' : capa === 'municipios' ? 'geo_municipios' : 'geo_zm';

      if (geojsonEntry) {
        // Cargar GeoJSON directo
        const raw = geojsonEntry.getData().toString('utf8');
        const gj = JSON.parse(raw);
        if (!gj.features || gj.features.length === 0) {
          throw new Error('GeoJSON vacío o sin features.');
        }

        await client.query(`DELETE FROM ${tablaDestino}`);

        if (capa === 'zm') {
          for (const f of gj.features) {
            const p = f.properties;
            await client.query(
              `INSERT INTO geo_zm (cve_met, nombre, tipo, geom)
               VALUES ($1, $2, $3, ST_SetSRID(ST_GeomFromGeoJSON($4), 4326))
               ON CONFLICT (cve_met) DO UPDATE SET nombre=EXCLUDED.nombre, tipo=EXCLUDED.tipo, geom=EXCLUDED.geom`,
              [p.CVE_MET || p.cve_met, p.NOM_MET || p.nom_met || p.nombre, p.TIPO_MET || p.tipo_met || '', JSON.stringify(f.geometry)]
            );
          }
        } else if (capa === 'estados') {
          for (const f of gj.features) {
            const p = f.properties;
            const cve = p.CVE_ENT || p.cve_ent || p.ent || '';
            const nom = p.NOM_ENT || p.nom_ent || p.entidad || p.nombre || '';
            await client.query(
              `INSERT INTO geo_estados (cve_ent, nombre, geom)
               VALUES ($1, $2, ST_SetSRID(ST_GeomFromGeoJSON($3), 4326))
               ON CONFLICT (cve_ent) DO UPDATE SET nombre=EXCLUDED.nombre, geom=EXCLUDED.geom`,
              [cve.padStart(2, '0'), nom, JSON.stringify(f.geometry)]
            );
          }
        } else {
          for (const f of gj.features) {
            const p = f.properties;
            await client.query(
              `INSERT INTO geo_municipios (cvegeo, cve_ent, cve_mun, nombre, geom)
               VALUES ($1, $2, $3, $4, ST_SetSRID(ST_GeomFromGeoJSON($5), 4326))
               ON CONFLICT (cvegeo) DO UPDATE SET nombre=EXCLUDED.nombre, geom=EXCLUDED.geom`,
              [p.CVEGEO || p.cvegeo, p.CVE_ENT || p.cve_ent, p.CVE_MUN || p.cve_mun, p.NOM_MUN || p.nom_mun || p.nombre, JSON.stringify(f.geometry)]
            );
          }
        }
      } else {
        // Para .shp necesitamos ogr2ogr o shp2pgsql (en el contenedor)
        // En este contexto, almacenamos el zip y ejecutamos la carga asíncronamente
        return res.status(501).json({
          error: true,
          mensaje: 'Carga de .shp en caliente requiere ogr2ogr. Suba un .geojson dentro del zip, o use el script cargar-geo.sh.'
        });
      }

      // Recrear índice GIST
      await client.query(`REINDEX INDEX idx_${tablaDestino}_geom`);

      // Sincronizar catálogos normalizados
      if (capa === 'estados') {
        await client.query(`
          INSERT INTO cat_entidades_federativas (clave, nombre)
            SELECT cve_ent, nombre FROM geo_estados
          ON CONFLICT (clave) DO UPDATE SET nombre = EXCLUDED.nombre;
          UPDATE cat_entidades_federativas e SET geom = g.geom FROM geo_estados g WHERE e.clave = g.cve_ent;
        `);
      } else if (capa === 'municipios') {
        await client.query(`
          INSERT INTO cat_municipios (clave, clave_mun, nombre, id_entidad)
            SELECT g.cvegeo, g.cve_mun, g.nombre, e.id
            FROM geo_municipios g JOIN cat_entidades_federativas e ON g.cve_ent = e.clave
          ON CONFLICT (clave) DO UPDATE SET nombre = EXCLUDED.nombre;
          UPDATE cat_municipios m SET geom = g.geom FROM geo_municipios g WHERE m.clave = g.cvegeo;
        `);
      }

      await client.query('COMMIT');

      const { rows: countRows } = await pool.query(`SELECT COUNT(*)::int AS total FROM ${tablaDestino}`);
      res.json({ datos: { capa, total: countRows[0].total }, mensaje: `Capa ${capa} reemplazada exitosamente.` });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
}

// GET /admin/geo/zonas-metropolitanas — Lista ZMs para selector
async function obtenerZonasMetropolitanas(req, res, next) {
  try {
    const { rows } = await pool.query(
      'SELECT gid, cve_met, nombre, tipo FROM geo_zm ORDER BY nombre'
    );
    res.json({ datos: rows, mensaje: 'Zonas metropolitanas obtenidas' });
  } catch (err) { next(err); }
}

// ─── USUARIOS (CRUD superadmin) ────────────────────────────────

// GET /admin/usuarios
async function listarUsuarios(req, res, next) {
  try {
    const { rows } = await pool.query(`
      SELECT u.id, u.nombre_completo, u.correo, u.cargo, u.rol, u.activo,
             u.id_dg, dg.siglas AS dg_siglas, dg.nombre AS dg_nombre,
             u.id_direccion_area, da.siglas AS da_siglas, da.nombre AS da_nombre,
             u.created_at
      FROM usuarios u
      LEFT JOIN direcciones_generales dg ON dg.id = u.id_dg
      LEFT JOIN direcciones_area da ON da.id = u.id_direccion_area
      ORDER BY u.nombre_completo
    `);
    res.json({ datos: rows });
  } catch (err) { next(err); }
}

// POST /admin/usuarios — crear usuario (sin password; se envía link de activación)
async function crearUsuario(req, res, next) {
  try {
    const { nombre_completo, correo, cargo, rol, id_dg, id_direccion_area } = req.body;
    if (!nombre_completo || !correo || !rol) {
      return res.status(400).json({ error: true, mensaje: 'nombre_completo, correo y rol son requeridos' });
    }
    const { rows: exist } = await pool.query('SELECT id FROM usuarios WHERE correo = $1', [correo]);
    if (exist.length > 0) return res.status(409).json({ error: true, mensaje: 'Ya existe un usuario con ese correo' });

    // Crear con password temporal (usuario deberá activar cuenta)
    const tempHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
    const { rows } = await pool.query(
      `INSERT INTO usuarios (nombre_completo, correo, cargo, rol, id_dg, id_direccion_area, password_hash, activo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true) RETURNING id, nombre_completo, correo, cargo, rol`,
      [nombre_completo, correo, cargo || null, rol, id_dg || null, id_direccion_area || null, tempHash]
    );
    const usuario = rows[0];

    // Generar token de activación (30 días)
    const token = crypto.randomBytes(48).toString('hex');
    await pool.query(
      `INSERT INTO tokens_activacion (id_usuario, token, expira_en) VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
      [usuario.id, token]
    );

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const invite_link = `${baseUrl}/activar-cuenta?token=${token}`;

    res.status(201).json({ datos: { ...usuario, token, invite_link }, mensaje: 'Usuario creado' });
  } catch (err) { next(err); }
}

// PUT /admin/usuarios/:id — editar usuario
async function editarUsuario(req, res, next) {
  try {
    const { id } = req.params;
    const { nombre_completo, correo, cargo, rol, id_dg, id_direccion_area } = req.body;
    const sets = []; const params = []; let i = 1;
    if (nombre_completo !== undefined) { sets.push(`nombre_completo=$${i++}`); params.push(nombre_completo); }
    if (correo !== undefined) { sets.push(`correo=$${i++}`); params.push(correo); }
    if (cargo !== undefined) { sets.push(`cargo=$${i++}`); params.push(cargo); }
    if (rol !== undefined) { sets.push(`rol=$${i++}`); params.push(rol); }
    if (id_dg !== undefined) { sets.push(`id_dg=$${i++}`); params.push(id_dg || null); }
    if (id_direccion_area !== undefined) { sets.push(`id_direccion_area=$${i++}`); params.push(id_direccion_area || null); }
    if (sets.length === 0) return res.status(400).json({ error: true, mensaje: 'Nada que actualizar' });
    params.push(id);
    const { rows } = await pool.query(
      `UPDATE usuarios SET ${sets.join(', ')} WHERE id = $${i} RETURNING id, nombre_completo, correo, cargo, rol, id_dg, id_direccion_area`,
      params
    );
    if (!rows[0]) return res.status(404).json({ error: true, mensaje: 'Usuario no encontrado' });
    res.json({ datos: rows[0], mensaje: 'Usuario actualizado' });
  } catch (err) { next(err); }
}

// PATCH /admin/usuarios/:id/toggle — activar/desactivar
async function toggleUsuario(req, res, next) {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      'UPDATE usuarios SET activo = NOT activo WHERE id = $1 RETURNING id, activo', [id]
    );
    if (!rows[0]) return res.status(404).json({ error: true, mensaje: 'Usuario no encontrado' });
    res.json({ datos: rows[0], mensaje: rows[0].activo ? 'Usuario activado' : 'Usuario desactivado' });
  } catch (err) { next(err); }
}

// DELETE /admin/usuarios/:id — eliminar usuario permanentemente (solo superadmin)
async function eliminarUsuario(req, res, next) {
  try {
    const { id } = req.params;
    if (req.usuario.id === id) {
      return res.status(400).json({ error: true, mensaje: 'No puedes eliminar tu propia cuenta.' });
    }
    const { rows } = await pool.query(
      'DELETE FROM usuarios WHERE id = $1 RETURNING id, nombre_completo, correo',
      [id]
    );
    if (!rows[0]) return res.status(404).json({ error: true, mensaje: 'Usuario no encontrado' });
    res.json({ datos: rows[0], mensaje: 'Usuario eliminado permanentemente' });
  } catch (err) { next(err); }
}

// POST /admin/usuarios/:id/reenviar-invitacion — generar nuevo token
async function reenviarInvitacion(req, res, next) {
  try {
    const { id } = req.params;
    const { rows: u } = await pool.query('SELECT id, nombre_completo, correo FROM usuarios WHERE id = $1', [id]);
    if (!u[0]) return res.status(404).json({ error: true, mensaje: 'Usuario no encontrado' });
    await pool.query('UPDATE tokens_activacion SET usado = true WHERE id_usuario = $1', [id]);
    const token = crypto.randomBytes(48).toString('hex');
    await pool.query(
      `INSERT INTO tokens_activacion (id_usuario, token, expira_en) VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
      [id, token]
    );
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const invite_link = `${baseUrl}/activar-cuenta?token=${token}`;
    res.json({ datos: { ...u[0], token, invite_link }, mensaje: 'Invitación generada' });
  } catch (err) { next(err); }
}

// ─── ÁREAS (DGs y DAs) ─────────────────────────────────────────

// GET /admin/areas/dgs
async function listarDGs(req, res, next) {
  try {
    const { rows } = await pool.query(`
      SELECT dg.id, dg.nombre, dg.siglas, dg.descripcion, dg.es_externa, dg.secretaria_externa,
             dg.id_unidad_responsable, ur.siglas AS ur_siglas
      FROM direcciones_generales dg
      LEFT JOIN unidades_responsables ur ON ur.id = dg.id_unidad_responsable
      ORDER BY dg.siglas
    `);
    res.json({ datos: rows });
  } catch (err) { next(err); }
}

// POST /admin/areas/dgs
async function crearDG(req, res, next) {
  try {
    const { nombre, siglas, descripcion, id_unidad_responsable, es_externa, secretaria_externa } = req.body;
    if (!nombre || !siglas) return res.status(400).json({ error: true, mensaje: 'nombre y siglas son requeridos' });
    const { rows } = await pool.query(
      `INSERT INTO direcciones_generales (nombre, siglas, descripcion, id_unidad_responsable, es_externa, secretaria_externa)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [nombre, siglas, descripcion || null, id_unidad_responsable || null, es_externa || false, secretaria_externa || null]
    );
    res.status(201).json({ datos: rows[0], mensaje: 'DG creada' });
  } catch (err) { next(err); }
}

// PUT /admin/areas/dgs/:id
async function editarDG(req, res, next) {
  try {
    const { id } = req.params;
    const { nombre, siglas, descripcion, id_unidad_responsable, es_externa, secretaria_externa } = req.body;
    const { rows } = await pool.query(
      `UPDATE direcciones_generales SET nombre=$1, siglas=$2, descripcion=$3,
       id_unidad_responsable=$4, es_externa=$5, secretaria_externa=$6
       WHERE id=$7 RETURNING *`,
      [nombre, siglas, descripcion || null, id_unidad_responsable || null, es_externa || false, secretaria_externa || null, id]
    );
    if (!rows[0]) return res.status(404).json({ error: true, mensaje: 'DG no encontrada' });
    res.json({ datos: rows[0], mensaje: 'DG actualizada' });
  } catch (err) { next(err); }
}

// GET /admin/areas/das
async function listarDAs(req, res, next) {
  try {
    const { rows } = await pool.query(`
      SELECT da.id, da.nombre, da.siglas, da.id_dg,
             dg.siglas AS dg_siglas, dg.nombre AS dg_nombre
      FROM direcciones_area da
      LEFT JOIN direcciones_generales dg ON dg.id = da.id_dg
      ORDER BY dg.siglas, da.siglas
    `);
    res.json({ datos: rows });
  } catch (err) { next(err); }
}

// POST /admin/areas/das
async function crearDA(req, res, next) {
  try {
    const { nombre, siglas, id_dg } = req.body;
    if (!nombre || !siglas || !id_dg) return res.status(400).json({ error: true, mensaje: 'nombre, siglas e id_dg son requeridos' });
    const { rows } = await pool.query(
      'INSERT INTO direcciones_area (nombre, siglas, id_dg) VALUES ($1,$2,$3) RETURNING *',
      [nombre, siglas, id_dg]
    );
    res.status(201).json({ datos: rows[0], mensaje: 'DA creada' });
  } catch (err) { next(err); }
}

// PUT /admin/areas/das/:id
async function editarDA(req, res, next) {
  try {
    const { id } = req.params;
    const { nombre, siglas, id_dg } = req.body;
    const { rows } = await pool.query(
      'UPDATE direcciones_area SET nombre=$1, siglas=$2, id_dg=$3 WHERE id=$4 RETURNING *',
      [nombre, siglas, id_dg, id]
    );
    if (!rows[0]) return res.status(404).json({ error: true, mensaje: 'DA no encontrada' });
    res.json({ datos: rows[0], mensaje: 'DA actualizada' });
  } catch (err) { next(err); }
}

// ─── CONFIGURACIÓN DEL SISTEMA ─────────────────────────────────

// GET /admin/config
async function obtenerConfig(req, res, next) {
  try {
    const { rows } = await pool.query('SELECT clave, valor, descripcion FROM configuracion_sistema ORDER BY clave');
    res.json({ datos: rows });
  } catch (err) { next(err); }
}

// PUT /admin/config — { items: [{ clave, valor }] }
async function actualizarConfig(req, res, next) {
  try {
    const { items } = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: true, mensaje: 'items debe ser un arreglo' });
    for (const item of items) {
      await pool.query(
        `UPDATE configuracion_sistema SET valor=$1, updated_at=NOW(), updated_by=$2 WHERE clave=$3`,
        [item.valor ?? null, req.usuario.id, item.clave]
      );
    }
    res.json({ mensaje: 'Configuración actualizada' });
  } catch (err) { next(err); }
}

// GET /admin/config/publico — sin autenticación, solo para el frontend al enviar emails
async function obtenerConfigPublico(req, res, next) {
  try {
    const claves = ['emailjs_service_id', 'emailjs_template_id', 'emailjs_public_key', 'emailjs_enabled'];
    const { rows } = await pool.query(
      'SELECT clave, valor FROM configuracion_sistema WHERE clave = ANY($1)', [claves]
    );
    const cfg = Object.fromEntries(rows.map(r => [r.clave, r.valor]));
    res.json({ datos: cfg });
  } catch (err) { next(err); }
}

module.exports = {
  listarCatalogos,
  agregarValorCatalogo,
  editarValorCatalogo,
  desactivarValorCatalogo,
  reactivarValorCatalogo,
  reemplazarShapefile,
  obtenerZonasMetropolitanas,
  // Usuarios
  listarUsuarios,
  crearUsuario,
  editarUsuario,
  toggleUsuario,
  eliminarUsuario,
  reenviarInvitacion,
  // Áreas
  listarDGs,
  crearDG,
  editarDG,
  listarDAs,
  crearDA,
  editarDA,
  // Config
  obtenerConfig,
  actualizarConfig,
  obtenerConfigPublico,
};
