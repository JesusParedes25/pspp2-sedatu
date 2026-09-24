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

// Sugerencias en vivo para el combobox de "Producto" (Informe de
// Gobierno/Labores, donde no hay código jerárquico) — acotado por
// instrumento porque el usuario pidió agrupar "primero por instrumento
// y después por producto".
async function listarProductos(busqueda, instrumento) {
  const condiciones = ['producto IS NOT NULL', 'activo = true'];
  const valores = [];
  if (busqueda) {
    valores.push(`%${busqueda}%`);
    condiciones.push(`producto ILIKE $${valores.length}`);
  }
  if (instrumento) {
    valores.push(instrumento);
    condiciones.push(`instrumento = $${valores.length}`);
  }
  const { rows } = await pool.query(
    `SELECT DISTINCT producto FROM catalogo_indicadores WHERE ${condiciones.join(' AND ')} ORDER BY producto LIMIT 20`,
    valores
  );
  return rows.map(r => r.producto);
}

// Códigos de línea de acción del PSEDATU realmente presentes en el
// catálogo — no un catálogo estático de objetivos/estrategias
// codificado a mano (quedaría desactualizado si cambia el plan
// sectorial). El frontend deriva los 2 niveles del filtro (objetivo =
// primer segmento, estrategia = primeros dos) de esta lista.
async function listarLineasAccion() {
  const { rows } = await pool.query(
    `SELECT DISTINCT codigo_linea_accion FROM catalogo_indicadores
     WHERE instrumento = 'PSEDATU 2025-2030' AND codigo_linea_accion IS NOT NULL AND activo = true
     ORDER BY codigo_linea_accion`
  );
  return rows.map(r => r.codigo_linea_accion);
}

// Lista el catálogo. `usos` dice en cuántos proyectos se está usando —
// es el dato que necesita quien administra para saber si puede retirar
// una entrada sin dejar a nadie colgado.
// La versión anterior traía "usos"/"dgs" con dos subconsultas
// correlacionadas por fila — baratas una por una, pero ejecutadas para
// CADA entrada del catálogo en la carga inicial (sin filtro) hacían
// perceptible el ~2s de apertura del selector. Un solo LEFT JOIN +
// GROUP BY resuelve lo mismo en una pasada. `p.id IS NOT NULL` filtra
// dentro del COUNT/array_agg en vez de en el WHERE — un WHERE ahí
// convertiría el LEFT JOIN en un INNER JOIN de facto y excluiría del
// resultado las entradas del catálogo sin ningún proyecto vinculado.
async function listar({ busqueda, incluirInactivos = false, instrumento, producto, objetivo, estrategia } = {}) {
  const condiciones = [];
  const valores = [];
  if (!incluirInactivos) condiciones.push('c.activo = true');
  if (busqueda) {
    // Amplía la búsqueda a producto/area_sugerida además de
    // nombre/clave — con 1387+ entradas importadas, un usuario suele
    // recordar el tema ("vivienda") antes que el nombre exacto del
    // indicador.
    valores.push(`%${busqueda}%`);
    condiciones.push(`(c.nombre ILIKE $${valores.length} OR c.clave ILIKE $${valores.length} OR c.producto ILIKE $${valores.length} OR c.area_sugerida ILIKE $${valores.length})`);
  }
  if (instrumento) {
    valores.push(instrumento);
    condiciones.push(`c.instrumento = $${valores.length}`);
  }
  if (producto) {
    valores.push(producto);
    condiciones.push(`c.producto = $${valores.length}`);
  }
  // objetivo/estrategia derivan de codigo_linea_accion ("objetivo.estrategia.línea")
  // por prefijo — solo tienen sentido para PSEDATU, pero no hace falta
  // repetir ese filtro aquí: un codigo_linea_accion no-PSEDATU siempre es NULL.
  if (objetivo) {
    valores.push(`${objetivo}.%`);
    condiciones.push(`c.codigo_linea_accion LIKE $${valores.length}`);
  }
  if (estrategia) {
    // Prefijo (líneas de acción "estrategia.N") + exacto (el propio
    // código de 2 niveles, para los indicadores compuestos que viven
    // directo en objetivo.estrategia sin una línea de acción debajo).
    valores.push(`${estrategia}.%`, estrategia);
    condiciones.push(`(c.codigo_linea_accion LIKE $${valores.length - 1} OR c.codigo_linea_accion = $${valores.length})`);
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  // Sin texto de búsqueda, un tope evita traer + agregar el catálogo
  // completo de una sola vez — con texto ya viene acotado por el
  // ILIKE, no hace falta.
  const limite = busqueda ? '' : 'LIMIT 50';

  const { rows } = await pool.query(`
    SELECT c.*,
      u.nombre_completo AS creador_nombre,
      COUNT(DISTINCT CASE WHEN p.id IS NOT NULL THEN i.id_proyecto END) AS usos,
      -- DGs que lo usan, para el resumen en línea de la fila colapsada
      -- ("3 proyectos · DGOTU, DGPV") — evita un GET /uso por cada fila
      -- solo para mostrar ese resumen.
      COALESCE(array_agg(DISTINCT dg.siglas ORDER BY dg.siglas) FILTER (WHERE dg.siglas IS NOT NULL), ARRAY[]::text[]) AS dgs
    FROM catalogo_indicadores c
    LEFT JOIN usuarios u ON u.id = c.creado_por
    LEFT JOIN indicadores i ON i.id_catalogo = c.id
    LEFT JOIN proyectos p ON p.id = i.id_proyecto AND p.deleted_at IS NULL
    LEFT JOIN direcciones_generales dg ON dg.id = p.id_dg_lider
    ${where}
    GROUP BY c.id, u.nombre_completo
    ORDER BY c.activo DESC, c.nombre
    ${limite}
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

// Qué etapa/acción/tarea, de cualquier proyecto, aporta a este
// indicador de catálogo — la "ficha" del catálogo lo muestra junto a
// "proyectos vinculados" para no quedarse solo en el nivel de
// proyecto. Cruza indicador_aportaciones (ya trae etapa/acción/tarea
// por separado, exactamente una de las tres) contra todos los
// indicadores de proyecto ligados a esta entrada del catálogo.
async function obtenerNodosVinculados(id) {
  const { rows } = await pool.query(`
    SELECT
      CASE WHEN ap.id_etapa IS NOT NULL THEN 'etapa'
           WHEN ap.id_accion IS NOT NULL THEN 'accion'
           ELSE 'tarea' END AS tipo_nodo,
      COALESCE(e.nombre, a.nombre, t.nombre) AS nombre_nodo,
      COALESCE(ap.id_etapa, ap.id_accion, ap.id_tarea) AS id_nodo,
      p.id AS proyecto_id, p.nombre AS proyecto_nombre, dg.siglas AS dg_siglas,
      ap.modo, ap.aportacion, i.id AS indicador_id
    FROM indicador_aportaciones ap
    JOIN indicadores i ON i.id = ap.id_indicador
    JOIN proyectos p ON p.id = i.id_proyecto AND p.deleted_at IS NULL
    LEFT JOIN direcciones_generales dg ON dg.id = p.id_dg_lider
    LEFT JOIN etapas e ON e.id = ap.id_etapa
    LEFT JOIN acciones a ON a.id = ap.id_accion
    LEFT JOIN tareas t ON t.id = ap.id_tarea
    WHERE i.id_catalogo = $1
    ORDER BY p.nombre, nombre_nodo
  `, [id]);
  return rows.map(r => ({ ...r, aportacion: r.aportacion == null ? null : parseFloat(r.aportacion) }));
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
      etiqueta_unidad, definicion, fuente, creado_por,
      instrumento, area_sugerida, producto, codigo_linea_accion, referencia
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
    RETURNING *
  `, [
    clave, nombre, datos.descripcion || null,
    datos.tipo || 'Otro', datos.unidad || 'Numero',
    datos.unidad_personalizada || null,
    datos.etiqueta_unidad || datos.unidad_personalizada || null,
    datos.definicion || null, datos.fuente || null, usuarioId || null,
    // Metadatos de importación institucional — opcionales, el alta
    // manual desde SelectorIndicadorCatalogo.jsx no los pide y quedan
    // NULL (un usuario normal no etiqueta de qué informe viene algo
    // que está creando él mismo).
    datos.instrumento || null, datos.area_sugerida || null,
    datos.producto || null, datos.codigo_linea_accion || null,
    datos.referencia || null,
  ]);
  return rows[0];
}

// `clave` queda deliberadamente fuera: ver la mini-clase de arriba.
const CAMPOS_EDITABLES = [
  'nombre', 'descripcion', 'tipo', 'unidad', 'unidad_personalizada',
  'etiqueta_unidad', 'definicion', 'fuente',
  'instrumento', 'area_sugerida', 'producto', 'codigo_linea_accion', 'referencia',
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

  // Cambiar tipo o unidad de una entrada que YA tiene proyectos
  // vinculados alteraría el significado de valores ya capturados (un
  // valor capturado como "Numero" pasaría a leerse como "Porcentaje"
  // sin que nadie lo haya recapturado) — se bloquea sin excepción,
  // igual que ya bloquean CATEGORIA_CON_APORTACIONES/
  // INDICADOR_CON_APORTACIONES en indicadores.queries.js. El resto de
  // campos (nombre, definicion, referencia, producto, etc.) siguen
  // editables aunque la entrada ya esté en uso — solo tipo/unidad
  // cambian el significado de un número ya capturado.
  const cambiaTipoOUnidad = datos.tipo !== undefined || datos.unidad !== undefined;
  if (cambiaTipoOUnidad) {
    const { rows: [actual] } = await pool.query(
      'SELECT tipo, unidad FROM catalogo_indicadores WHERE id = $1', [id]
    );
    if (actual) {
      const tipoCambia = datos.tipo !== undefined && datos.tipo !== actual.tipo;
      const unidadCambia = datos.unidad !== undefined && datos.unidad !== actual.unidad;
      if (tipoCambia || unidadCambia) {
        const { rows: [{ n }] } = await pool.query(
          'SELECT COUNT(*)::int AS n FROM indicadores WHERE id_catalogo = $1', [id]
        );
        if (n > 0) {
          const err = new Error(`Este indicador ya está vinculado a ${n} proyecto(s) — cambiar tipo o unidad alteraría el significado de valores ya capturados. Si necesitas un indicador distinto, crea uno nuevo.`);
          err.statusCode = 409;
          err.codigo = 'CATALOGO_EN_USO';
          throw err;
        }
      }
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

module.exports = { listar, obtener, uso, obtenerNodosVinculados, crear, actualizar, cambiarActivo, generarClave, claveDisponible, buscarSimilares, fusionar, listarProductos, listarLineasAccion };
