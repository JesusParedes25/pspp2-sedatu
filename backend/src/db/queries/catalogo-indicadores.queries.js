/**
 * ARCHIVO: catalogo-indicadores.queries.js
 * PROPÓSITO: Catálogo único de indicadores — la definición canónica que
 *            los proyectos eligen en vez de teclear el nombre a mano.
 *
 * MINI-CLASE: por qué la clave no se edita
 * ─────────────────────────────────────────────────────────────────
 * `clave` es el identificador que va a consumir la plataforma externa
 * cuando se exponga el avance por API. Si se pudiera cambiar, un
 * indicador renombrado aparecería del otro lado como uno nuevo y la
 * serie histórica se partiría en dos. Por eso se fija al crear y
 * después solo se editan nombre, descripción, definición y fuente.
 * Retirar un indicador es desactivarlo, no borrarlo: los proyectos
 * que ya lo usan conservan su referencia.
 * ─────────────────────────────────────────────────────────────────
 */
const pool = require('../pool');

// Mismo criterio que el backfill de la migración 049, para que una
// entrada creada desde la app y una sembrada tengan claves del mismo
// estilo: minúsculas, sin acentos, separadas por guiones.
function generarClave(nombre) {
  return (nombre || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // quita acentos
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'indicador';
}

async function claveDisponible(base, db) {
  let clave = base;
  let intento = 1;
  // La clave es UNIQUE; si el nombre choca con uno existente se numera.
  while (true) {
    const { rows } = await db.query('SELECT 1 FROM catalogo_indicadores WHERE clave = $1', [clave]);
    if (rows.length === 0) return clave;
    intento++;
    clave = `${base}-${intento}`;
  }
}

// Busca entradas del catálogo parecidas a `nombre` por similitud de texto
// (pg_trgm, misma convención que buscarEstadosFuzzy/buscarMunicipiosFuzzy
// en geografia.queries.js), no coincidencia exacta — para ofrecerlas ANTES
// de crear una nueva entrada que en realidad ya existe con otra redacción
// (acentos, espacios, singular/plural). No bloquea nada por sí sola: es
// una sugerencia para quien decide, con el número de proyectos que ya usan
// cada una para ayudar a decidir informado.
async function buscarSimilares(nombre, excluirId = null) {
  const texto = (nombre || '').trim();
  if (!texto) return [];
  const params = [texto];
  let filtroExcluir = '';
  if (excluirId) {
    params.push(excluirId);
    filtroExcluir = `AND c.id != $${params.length}`;
  }
  const { rows } = await pool.query(`
    SELECT c.id, c.clave, c.nombre, c.tipo, c.unidad, c.activo,
      similarity(LOWER(c.nombre), LOWER($1)) AS score,
      (SELECT COUNT(DISTINCT i.id_proyecto)
         FROM indicadores i
         JOIN proyectos p ON p.id = i.id_proyecto AND p.deleted_at IS NULL
        WHERE i.id_catalogo = c.id) AS usos
    FROM catalogo_indicadores c
    WHERE (LOWER(c.nombre) % LOWER($1) OR LOWER(c.nombre) LIKE LOWER($1) || '%')
      ${filtroExcluir}
    ORDER BY score DESC
    LIMIT 5
  `, params);
  return rows.map(r => ({ ...r, usos: parseInt(r.usos, 10) || 0 }));
}

// Lista el catálogo. `usos` dice en cuántos proyectos se está usando —
// es el dato que necesita quien administra para saber si puede retirar
// una entrada sin dejar a nadie colgado.
async function listar({ busqueda, incluirInactivos = false } = {}) {
  const condiciones = [];
  const valores = [];
  if (!incluirInactivos) condiciones.push('c.activo = true');
  if (busqueda) {
    valores.push(`%${busqueda}%`);
    condiciones.push(`(c.nombre ILIKE $${valores.length} OR c.clave ILIKE $${valores.length})`);
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

  const { rows } = await pool.query(`
    SELECT c.*,
      u.nombre_completo AS creador_nombre,
      (SELECT COUNT(DISTINCT i.id_proyecto)
         FROM indicadores i
         JOIN proyectos p ON p.id = i.id_proyecto AND p.deleted_at IS NULL
        WHERE i.id_catalogo = c.id) AS usos
    FROM catalogo_indicadores c
    LEFT JOIN usuarios u ON u.id = c.creado_por
    ${where}
    ORDER BY c.activo DESC, c.nombre
  `, valores);

  return rows.map(r => ({ ...r, usos: parseInt(r.usos, 10) || 0 }));
}

async function obtener(id) {
  const { rows } = await pool.query('SELECT * FROM catalogo_indicadores WHERE id = $1', [id]);
  return rows[0] || null;
}

// Dónde se está usando: la vista que necesita quien administra antes de
// tocar una entrada, y el esqueleto de lo que la API externa tendrá que
// devolver (meta y avance por proyecto para un mismo indicador).
async function uso(id) {
  const { rows } = await pool.query(`
    SELECT p.id AS proyecto_id, p.nombre AS proyecto_nombre, p.estado,
           dg.siglas AS dg_siglas,
           i.id AS indicador_id, i.nombre AS indicador_nombre,
           i.meta_global, i.valor_actual, i.activo
      FROM indicadores i
      JOIN proyectos p ON p.id = i.id_proyecto AND p.deleted_at IS NULL
      LEFT JOIN direcciones_generales dg ON dg.id = p.id_dg_lider
     WHERE i.id_catalogo = $1
     ORDER BY p.nombre
  `, [id]);
  return rows.map(r => ({
    ...r,
    meta_global: r.meta_global == null ? null : parseFloat(r.meta_global),
    valor_actual: r.valor_actual == null ? null : parseFloat(r.valor_actual),
  }));
}

async function crear(datos, usuarioId) {
  const nombre = (datos.nombre || '').trim();
  if (!nombre) {
    const err = new Error('El indicador necesita un nombre');
    err.statusCode = 400;
    err.codigo = 'CAMPOS_REQUERIDOS';
    throw err;
  }

  // Evita que dos personas creen "el mismo" indicador con distinta
  // capitalización — el catálogo perdería su razón de ser.
  const { rows: repetido } = await pool.query(
    'SELECT id, nombre FROM catalogo_indicadores WHERE lower(trim(nombre)) = lower($1)', [nombre]
  );
  if (repetido.length > 0) {
    const err = new Error(`Ya existe un indicador llamado "${repetido[0].nombre}" en el catálogo`);
    err.statusCode = 409;
    err.codigo = 'DUPLICADO';
    err.existente = repetido[0];
    throw err;
  }

  const clave = await claveDisponible(generarClave(nombre), pool);
  const { rows } = await pool.query(`
    INSERT INTO catalogo_indicadores (
      clave, nombre, descripcion, tipo, unidad, unidad_personalizada,
      etiqueta_unidad, definicion, fuente, creado_por
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    RETURNING *
  `, [
    clave, nombre, datos.descripcion || null,
    datos.tipo || 'Otro', datos.unidad || 'Numero',
    datos.unidad_personalizada || null,
    datos.etiqueta_unidad || datos.unidad_personalizada || null,
    datos.definicion || null, datos.fuente || null, usuarioId || null,
  ]);
  return rows[0];
}

// `clave` queda deliberadamente fuera: ver la mini-clase de arriba.
const CAMPOS_EDITABLES = [
  'nombre', 'descripcion', 'tipo', 'unidad', 'unidad_personalizada',
  'etiqueta_unidad', 'definicion', 'fuente',
];

async function actualizar(id, datos) {
  // Antes, renombrar no chequeaba nada — se podía dejar dos entradas con
  // el mismo nombre exacto sin ningún aviso. Mismo criterio de bloqueo
  // que crear(), excluyendo la propia entrada que se está editando.
  if (datos.nombre !== undefined) {
    const nombre = (datos.nombre || '').trim();
    const { rows: repetido } = await pool.query(
      'SELECT id, nombre FROM catalogo_indicadores WHERE lower(trim(nombre)) = lower($1) AND id != $2',
      [nombre, id]
    );
    if (repetido.length > 0) {
      const err = new Error(`Ya existe un indicador llamado "${repetido[0].nombre}" en el catálogo`);
      err.statusCode = 409;
      err.codigo = 'DUPLICADO';
      err.existente = repetido[0];
      throw err;
    }
  }

  const sets = [];
  const valores = [];
  for (const campo of CAMPOS_EDITABLES) {
    if (datos[campo] === undefined) continue;
    valores.push(datos[campo] === '' ? null : datos[campo]);
    sets.push(`${campo} = $${valores.length}`);
  }
  if (sets.length === 0) return obtener(id);

  valores.push(id);
  const { rows } = await pool.query(
    `UPDATE catalogo_indicadores SET ${sets.join(', ')}, updated_at = NOW()
      WHERE id = $${valores.length} RETURNING *`,
    valores
  );
  return rows[0] || null;
}

async function cambiarActivo(id, activo) {
  const { rows } = await pool.query(
    'UPDATE catalogo_indicadores SET activo = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
    [activo, id]
  );
  return rows[0] || null;
}

// Fusiona 2+ entradas duplicadas del catálogo en una sola. Retirar una
// entrada (cambiarActivo) nunca arregló la fragmentación que ya existe:
// las pantallas de agregados (Tablero/Cartera) agrupan por
// indicadores.id_catalogo sin fijarse si esa entrada del catálogo sigue
// activa, así que un proyecto vinculado a una entrada retirada quedaba
// huérfano — su dato dejaba de sumar en cualquier lado. Fusionar reapunta
// TODOS los indicadores de proyecto de las entradas perdedoras hacia la
// que sobrevive, y entonces sí las retira — a partir de ahí sí vuelven a
// sumar juntos.
async function fusionar(idSobrevive, idsFusionar) {
  const perdedores = idsFusionar.filter(id => id !== idSobrevive);
  if (perdedores.length === 0) {
    const err = new Error('No hay entradas distintas que fusionar');
    err.statusCode = 400;
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: existen } = await client.query(
      'SELECT id FROM catalogo_indicadores WHERE id = ANY($1)',
      [[idSobrevive, ...perdedores]]
    );
    if (existen.length !== perdedores.length + 1) {
      const err = new Error('Alguna de las entradas ya no existe');
      err.statusCode = 404;
      throw err;
    }

    const { rows: reapuntados } = await client.query(
      'UPDATE indicadores SET id_catalogo = $1, updated_at = NOW() WHERE id_catalogo = ANY($2) RETURNING id, id_proyecto',
      [idSobrevive, perdedores]
    );

    await client.query(
      'UPDATE catalogo_indicadores SET activo = false, updated_at = NOW() WHERE id = ANY($1)',
      [perdedores]
    );

    const { rows: sobreviviente } = await client.query(
      'SELECT * FROM catalogo_indicadores WHERE id = $1', [idSobrevive]
    );

    await client.query('COMMIT');
    return {
      sobreviviente: sobreviviente[0],
      proyectos_reapuntados: reapuntados.length,
      ids_retirados: perdedores,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { listar, obtener, uso, crear, actualizar, cambiarActivo, generarClave, buscarSimilares, fusionar };
