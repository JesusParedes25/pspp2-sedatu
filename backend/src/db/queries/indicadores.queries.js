/**
 * ARCHIVO: indicadores.queries.js
 * PROPÓSITO: Consultas SQL para el CRUD de indicadores de proyecto,
 *            incluyendo metas anuales y lectura agregada.
 *
 * MINI-CLASE: Indicadores presupuestarios en proyectos SEDATU
 * ─────────────────────────────────────────────────────────────────
 * Un proyecto puede tener N indicadores (avance físico, financiero,
 * monto, cobertura, etc.). Cada indicador tiene una meta global y
 * opcionalmente metas anuales desglosadas por ejercicio fiscal.
 * El campo acumulacion define cómo se agregan valores de acciones:
 * Suma (100+200=300), Ultimo_valor (solo el más reciente), o
 * Promedio. Las metas anuales se insertan/actualizan en lote
 * cuando el usuario configura temporalidad 'Anual'.
 * ─────────────────────────────────────────────────────────────────
 */
const pool = require('../pool');
const { registrarActividad } = require('../../utils/actividad-log');

// Bloque 7.5 del rediseño de Indicadores: cuando un indicador viene del
// catálogo (id_catalogo IS NOT NULL), su nombre/tipo/unidad/etiqueta son
// los del catálogo EN VIVO, no la copia que se guardó en `indicadores`
// al vincularlo — antes solo la API externa (/publico/indicadores) leía
// el catálogo directo, así que editar una entrada ahí parecía no surtir
// efecto en las pantallas internas aunque el consumidor externo ya lo
// veía. Se resuelve con una consulta aparte (en vez de un JOIN con
// columnas repetidas tipo "SELECT i.*, x AS nombre", ambiguo de leer y
// de depender de en qué orden pg resuelve el duplicado) porque estas
// funciones ya traen la fila completa con `i.*`. El costo es una
// consulta extra por llamada — páginas de detalle, no un endpoint de
// alta frecuencia, así que no vale la pena complicar el SQL por eso.
async function aplicarDefinicionCatalogo(filas) {
  const lista = Array.isArray(filas) ? filas : [filas];
  const idsCatalogo = [...new Set(lista.map(f => f?.id_catalogo).filter(Boolean))];
  if (idsCatalogo.length > 0) {
    const { rows: entradas } = await pool.query(
      'SELECT id, nombre, tipo, unidad, unidad_personalizada, etiqueta_unidad, instrumento FROM catalogo_indicadores WHERE id = ANY($1)',
      [idsCatalogo]
    );
    const porId = new Map(entradas.map(e => [e.id, e]));
    for (const f of lista) {
      const c = f?.id_catalogo && porId.get(f.id_catalogo);
      if (c) {
        f.nombre = c.nombre;
        f.tipo = c.tipo;
        f.unidad = c.unidad;
        f.unidad_personalizada = c.unidad_personalizada;
        f.etiqueta_unidad = c.etiqueta_unidad;
        // `instrumento` (Bloque 2 de "Indicadores dentro del proyecto"):
        // misma fuente que ya usa etiquetaOrigenIndicador() en el
        // frontend para pintar el chip "De la plataforma"/institucional
        // del catálogo — null cuando el indicador no viene de ningún
        // catálogo (id_catalogo NULL, este bloque ni se ejecuta) o
        // cuando la entrada del catálogo no tiene instrumento (creada
        // dentro de la plataforma).
        f.instrumento = c.instrumento;
      }
    }
  }
  return filas;
}

// Válida la combinación composicion/unidad antes de crear/actualizar —
// un indicador en Porcentaje no puede componerse de categorías: sumar
// porcentajes entre categorías no representa nada real, mismo criterio
// que ya excluye el combinado de porcentajes entre proyectos
// (TarjetaIndicadorGrupo). Se rechaza en vez de normalizar en
// silencio: esta combinación solo puede llegar por un bug del
// frontend (que ya la deshabilita), mejor que truene claro.
function validarComposicion(datos) {
  if (datos.composicion === 'Categorias' && datos.unidad === 'Porcentaje') {
    const err = new Error('Un indicador en porcentaje no puede componerse de categorías');
    err.statusCode = 400;
    err.codigo = 'CATEGORIAS_PORCENTAJE';
    throw err;
  }
}

// Valida montos y nombres de la definición del indicador — sin esto,
// el servidor aceptaba (y persistía) una meta_global negativa, una
// categoría con monto negativo, una categoría sin nombre, o dos
// categorías con el mismo nombre, mostrando igual el toast de éxito.
// La vía de aportación de nodos (aportaciones.controller.js::crear)
// ya rechaza montos negativos desde antes — este es el hueco paralelo
// en la definición del indicador/categorías.
function validarDatosIndicador(datos) {
  if (datos.meta_global !== '' && datos.meta_global != null) {
    const metaGlobal = parseFloat(datos.meta_global);
    if (Number.isFinite(metaGlobal) && metaGlobal < 0) {
      const err = new Error('La meta global no puede ser negativa');
      err.statusCode = 400;
      err.codigo = 'META_GLOBAL_NEGATIVA';
      throw err;
    }
  }

  const categorias = datos.categorias || [];
  const nombresVistos = new Set();
  for (const cat of categorias) {
    const nombre = (cat.nombre || '').trim();
    if (nombre === '') {
      const err = new Error('Cada categoría necesita un nombre');
      err.statusCode = 400;
      err.codigo = 'CATEGORIA_SIN_NOMBRE';
      throw err;
    }

    const clave = nombre.toLowerCase();
    if (nombresVistos.has(clave)) {
      const err = new Error(`Ya existe una categoría llamada "${nombre}"`);
      err.statusCode = 400;
      err.codigo = 'CATEGORIA_NOMBRE_DUPLICADO';
      throw err;
    }
    nombresVistos.add(clave);

    if (cat.meta !== '' && cat.meta != null) {
      const meta = parseFloat(cat.meta);
      if (Number.isFinite(meta) && meta < 0) {
        const err = new Error(`La meta de la categoría "${nombre}" no puede ser negativa`);
        err.statusCode = 400;
        err.codigo = 'CATEGORIA_META_NEGATIVA';
        throw err;
      }
    }
  }
}

// Carga en lote las categorías de varios indicadores (mismo patrón de
// batching ya usado para metas_anuales en cada función de este
// archivo) y las anexa como `.categorias` a cada fila de `indicadores`.
async function cargarCategorias(db, indicadores) {
  if (indicadores.length === 0) return;
  const ids = indicadores.map(i => i.id);
  const { rows: categorias } = await db.query(
    'SELECT * FROM indicador_categorias WHERE id_indicador = ANY($1) ORDER BY orden, created_at',
    [ids]
  );
  const porIndicador = {};
  for (const c of categorias) {
    if (!porIndicador[c.id_indicador]) porIndicador[c.id_indicador] = [];
    porIndicador[c.id_indicador].push(c);
  }
  for (const ind of indicadores) {
    ind.categorias = porIndicador[ind.id] || [];
  }
}

// Lista indicadores de nivel proyecto (id_etapa IS NULL) con sus metas anuales
async function listarPorProyecto(proyectoId) {
  const indicadores = await pool.query(`
    SELECT * FROM indicadores
    WHERE id_proyecto = $1 AND id_etapa IS NULL AND activo = true
    ORDER BY orden, created_at
  `, [proyectoId]);

  // Cargar metas anuales de todos los indicadores del proyecto
  if (indicadores.rows.length > 0) {
    const ids = indicadores.rows.map(i => i.id);
    const metas = await pool.query(`
      SELECT * FROM indicador_metas_anuales
      WHERE id_indicador = ANY($1)
      ORDER BY anio, created_at
    `, [ids]);

    const metasPorIndicador = {};
    for (const m of metas.rows) {
      if (!metasPorIndicador[m.id_indicador]) {
        metasPorIndicador[m.id_indicador] = [];
      }
      metasPorIndicador[m.id_indicador].push(m);
    }

    for (const ind of indicadores.rows) {
      ind.metas_anuales = metasPorIndicador[ind.id] || [];
    }
  }

  await cargarCategorias(pool, indicadores.rows);
  await aplicarDefinicionCatalogo(indicadores.rows);
  return indicadores.rows;
}

// Un solo indicador por su id, con el nombre del proyecto/DG dueño y
// sus metas/periodos — usado por la pantalla de detalle del módulo de
// Indicadores. No existía ningún GET-por-id de un solo indicador
// antes de esto, solo endpoints de listado.
async function obtenerPorId(indicadorId) {
  const { rows: [indicador] } = await pool.query(`
    SELECT i.*, p.nombre AS proyecto_nombre, p.id AS proyecto_id,
      dg.siglas AS dg_siglas, dg.nombre AS dg_nombre
    FROM indicadores i
    JOIN proyectos p ON p.id = i.id_proyecto
    LEFT JOIN direcciones_generales dg ON dg.id = p.id_dg_lider
    WHERE i.id = $1 AND i.activo = true
  `, [indicadorId]);
  if (!indicador) return null;

  const { rows: metas } = await pool.query(
    'SELECT * FROM indicador_metas_anuales WHERE id_indicador = $1 ORDER BY anio NULLS LAST, created_at',
    [indicadorId]
  );
  indicador.metas_anuales = metas;

  const { rows: categorias } = await pool.query(
    'SELECT * FROM indicador_categorias WHERE id_indicador = $1 ORDER BY orden, created_at',
    [indicadorId]
  );
  indicador.categorias = categorias;

  await aplicarDefinicionCatalogo(indicador);
  return indicador;
}

// Crea un indicador con sus metas anuales opcionales
// Si datos.id_etapa viene, es un indicador de nivel etapa; si no, es de proyecto.
async function crear(proyectoId, datos, client = null, creadorId = null) {
  const db = client || pool;
  validarComposicion(datos);
  validarDatosIndicador(datos);

  // Sanitizar campos numéricos: convertir "" a null
  const metaGlobal = datos.meta_global === '' || datos.meta_global == null ? null : parseFloat(datos.meta_global);
  const anioInicio = datos.anio_inicio === '' || datos.anio_inicio == null ? null : parseInt(datos.anio_inicio);
  const anioFin = datos.anio_fin === '' || datos.anio_fin == null ? null : parseInt(datos.anio_fin);
  const orden = datos.orden === '' || datos.orden == null ? 1 : parseInt(datos.orden);
  const idEtapa = datos.id_etapa || null;

  const resultado = await db.query(`
    INSERT INTO indicadores (
      id_proyecto, id_etapa, nombre, tipo, unidad, unidad_personalizada,
      etiqueta_unidad, meta_global, temporalidad, unidad_periodo,
      anio_inicio, anio_fin, descripcion, orden, id_catalogo, id_creador,
      composicion, tipo_grafico
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
    RETURNING *
  `, [
    proyectoId, idEtapa, datos.nombre, datos.tipo, datos.unidad,
    datos.unidad_personalizada || null,
    datos.etiqueta_unidad || datos.unidad_personalizada || null, metaGlobal,
    datos.temporalidad || 'Global',
    // unidad_periodo solo importa cuando temporalidad='Anual' (Año/
    // Sexenio/Personalizado); para 'Global' se guarda el default sin
    // que nada lo use.
    datos.unidad_periodo || 'Anio',
    anioInicio, anioFin,
    datos.descripcion || null, orden,
    // Enlace opcional al catálogo: lo manda el selector del formulario.
    // Sigue siendo válido capturar un indicador suelto (id_catalogo NULL),
    // que es como quedaron todos los anteriores a la migración 049.
    datos.id_catalogo || null,
    // Quién dio de alta este indicador. Lo necesita la API externa para
    // atribuir el dato, y sirve para saber a quién preguntarle.
    creadorId || datos.id_creador || null,
    // composicion/tipo_grafico solo importan cuando hay algo que
    // desglosar (temporalidad='Anual' o composicion='Categorias'); para
    // un indicador simple quedan con su default sin que nada los use.
    datos.composicion === 'Categorias' ? 'Categorias' : 'Simple',
    datos.tipo_grafico === 'dona' ? 'dona' : 'barras',
  ]);

  const indicador = resultado.rows[0];

  // Insertar metas/periodos si hay desglose temporal. "anio" puede venir
  // vacío para un periodo Personalizado (no representa un año
  // calendario) — solo "meta" es obligatorio, no "anio".
  if (datos.metas_anuales && datos.metas_anuales.length > 0) {
    for (const ma of datos.metas_anuales) {
      const metaAnual = ma.meta === '' || ma.meta == null ? 0 : parseFloat(ma.meta);
      const anio = ma.anio === '' || ma.anio == null ? null : parseInt(ma.anio);
      const etiqueta = ma.etiqueta || null;
      await db.query(`
        INSERT INTO indicador_metas_anuales (id_indicador, anio, meta, etiqueta)
        VALUES ($1, $2, $3, $4)
      `, [indicador.id, anio, metaAnual, etiqueta]);
    }
  }
  indicador.metas_anuales = datos.metas_anuales || [];

  // Insertar categorías si el indicador se compone de ellas. "orden" es
  // la posición en el arreglo entrante — sin UI de reordenar en v1,
  // solo agregar/quitar.
  if (datos.categorias && datos.categorias.length > 0) {
    let orden = 0;
    for (const cat of datos.categorias) {
      const metaCat = cat.meta === '' || cat.meta == null ? 0 : parseFloat(cat.meta);
      await db.query(`
        INSERT INTO indicador_categorias (id_indicador, nombre, meta, orden)
        VALUES ($1, $2, $3, $4)
      `, [indicador.id, cat.nombre, metaCat, orden++]);
    }
  }
  indicador.categorias = datos.categorias || [];

  await registrarActividad({
    id_proyecto: proyectoId,
    id_usuario: creadorId || datos.id_creador || null,
    tipo: 'indicador',
    titulo: `Indicador "${indicador.nombre}" creado`,
    entidad_tipo: 'Indicador',
    entidad_id: indicador.id,
    client: client || undefined,
  });

  return indicador;
}

// Actualiza un indicador. Desde esta versión el formulario ya no ofrece
// temporalidad/composicion/tipo_grafico/categorías (ver el encargo de
// "versión final de Indicadores") — por eso esos campos y las filas de
// indicador_metas_anuales/indicador_categorias de un indicador existente
// NUNCA se tocan aquí, se hayan mandado o no en `datos`. Antes esta
// función los recibía siempre (el formulario viejo los mandaba todos) y
// defaulteaba a 'Simple'/'Global' cuando faltaban — con el formulario
// nuevo, que simplemente ya no los manda, ese default habría aplanado en
// silencio cualquier indicador Anual/Categorías con solo editarle el
// nombre. Quedan intactos para siempre; si algún día hace falta volver a
// editarlos, es una decisión aparte (ver Bloque 1 del encargo).
async function actualizar(indicadorId, datos, idUsuario = null) {
  validarDatosIndicador(datos);
  const metaGlobal = datos.meta_global === '' || datos.meta_global == null ? null : parseFloat(datos.meta_global);
  const resultado = await pool.query(`
    UPDATE indicadores SET
      nombre = $1, tipo = $2, unidad = $3,
      unidad_personalizada = $4, etiqueta_unidad = $5,
      meta_global = $6, descripcion = $7,
      updated_at = NOW()
    WHERE id = $8
    RETURNING *
  `, [
    datos.nombre, datos.tipo, datos.unidad,
    datos.unidad_personalizada || null,
    datos.etiqueta_unidad || datos.unidad_personalizada || null,
    metaGlobal, datos.descripcion || null,
    indicadorId
  ]);

  if (resultado.rows[0]) {
    await registrarActividad({
      id_proyecto: resultado.rows[0].id_proyecto,
      id_usuario: idUsuario,
      tipo: 'indicador',
      titulo: `Indicador "${resultado.rows[0].nombre}" actualizado`,
      entidad_tipo: 'Indicador',
      entidad_id: indicadorId,
    });
  }

  return resultado.rows[0] || null;
}

// Elimina (soft) un indicador
async function eliminar(indicadorId, idUsuario = null) {
  const resultado = await pool.query(`
    UPDATE indicadores SET activo = false, updated_at = NOW()
    WHERE id = $1 RETURNING id, id_proyecto, nombre
  `, [indicadorId]);
  const fila = resultado.rows[0];
  if (fila) {
    await registrarActividad({
      id_proyecto: fila.id_proyecto,
      id_usuario: idUsuario,
      tipo: 'indicador',
      titulo: `Indicador "${fila.nombre}" eliminado`,
      entidad_tipo: 'Indicador',
      entidad_id: fila.id,
    });
  }
  return fila || null;
}

// Lista indicadores de una etapa: propios (id_etapa) + asociados via indicador_aportaciones
async function listarPorEtapa(etapaId) {
  // 1. Indicadores propios de la etapa
  const propios = await pool.query(`
    SELECT i.*, NULL::numeric AS meta_etapa, NULL::uuid AS id_indicador_ref
    FROM indicadores i
    WHERE i.id_etapa = $1 AND i.activo = true
    ORDER BY i.orden, i.created_at
  `, [etapaId]);

  // 2. Indicadores del proyecto asociados a esta etapa via indicador_aportaciones
  const asociados = await pool.query(`
    SELECT i.*, ap.aportacion AS meta_etapa, ap.id_indicador AS id_indicador_ref
    FROM indicador_aportaciones ap
    JOIN indicadores i ON i.id = ap.id_indicador
    WHERE ap.id_etapa = $1 AND i.activo = true
    ORDER BY i.orden, i.created_at
  `, [etapaId]);

  const todos = [...propios.rows, ...asociados.rows];
  await aplicarDefinicionCatalogo(todos);

  if (todos.length > 0) {
    const ids = todos.map(i => i.id);
    const metas = await pool.query(`
      SELECT * FROM indicador_metas_anuales
      WHERE id_indicador = ANY($1) ORDER BY anio, created_at
    `, [ids]);

    const metasPorIndicador = {};
    for (const m of metas.rows) {
      if (!metasPorIndicador[m.id_indicador]) metasPorIndicador[m.id_indicador] = [];
      metasPorIndicador[m.id_indicador].push(m);
    }
    for (const ind of todos) {
      ind.metas_anuales = metasPorIndicador[ind.id] || [];
    }
  }

  await cargarCategorias(pool, todos);
  return todos;
}

// Lista TODOS los indicadores de un proyecto (nivel proyecto + nivel etapa)
// — usada por ModalVincularIndicador para saber qué indicadores ya tiene
// el proyecto, y por la pestaña Indicadores del proyecto (Parte 2 del
// encargo "Indicadores dentro del proyecto") para administrarlos. Necesita
// .categorias igual que las otras funciones de listado: sin esto, el
// selector de categoría al vincular un nodo no tendría de dónde poblarse
// para un indicador que ya existía de antes.
//
// `fecha_corte`/`num_nodos` solo los necesita la pestaña del proyecto
// (ModalVincularIndicador los ignora sin problema) — se calculan en lote
// con 2 consultas más, mismo patrón de batching que cargarCategorias, en
// vez de un JOIN+GROUP BY sobre la consulta principal que complicaría leer
// esa consulta para gente que solo necesita las columnas de `indicadores`.
async function listarTodosPorProyecto(proyectoId) {
  const indicadores = await pool.query(`
    SELECT i.*, e.nombre AS etapa_nombre
    FROM indicadores i
    LEFT JOIN etapas e ON e.id = i.id_etapa
    WHERE i.id_proyecto = $1 AND i.activo = true
    ORDER BY i.id_etapa NULLS FIRST, i.orden, i.created_at
  `, [proyectoId]);
  await cargarCategorias(pool, indicadores.rows);
  await aplicarDefinicionCatalogo(indicadores.rows);

  if (indicadores.rows.length > 0) {
    const ids = indicadores.rows.map(i => i.id);
    const { rows: cortes } = await pool.query(`
      SELECT id_indicador, MAX(fecha) AS fecha_corte
      FROM indicador_movimientos
      WHERE id_indicador = ANY($1) AND anulado_en IS NULL
      GROUP BY id_indicador
    `, [ids]);
    const { rows: conteosNodos } = await pool.query(`
      SELECT id_indicador, COUNT(*)::int AS num_nodos
      FROM indicador_aportaciones
      WHERE id_indicador = ANY($1)
      GROUP BY id_indicador
    `, [ids]);
    const cortePorId = new Map(cortes.map(c => [c.id_indicador, c.fecha_corte]));
    const nodosPorId = new Map(conteosNodos.map(c => [c.id_indicador, c.num_nodos]));
    for (const ind of indicadores.rows) {
      ind.fecha_corte = cortePorId.get(ind.id) || null;
      ind.num_nodos = nodosPorId.get(ind.id) || 0;
    }
  }

  return indicadores.rows;
}

// Resumen de aportaciones a un indicador: meta, cuánto ya está comprometido, disponible
async function obtenerResumenAportaciones(indicadorId) {
  const resultado = await pool.query(`
    SELECT
      i.meta_global,
      COALESCE(c.unidad, i.unidad) AS unidad,
      COALESCE(c.unidad_personalizada, i.unidad_personalizada) AS unidad_personalizada,
      COALESCE(c.nombre, i.nombre) AS nombre,
      COALESCE(SUM(ai.aportacion), 0)::numeric AS total_aportado,
      COUNT(ai.id)::int AS num_acciones
    FROM indicadores i
    LEFT JOIN catalogo_indicadores c ON c.id = i.id_catalogo
    LEFT JOIN indicador_aportaciones ai ON ai.id_indicador = i.id
    WHERE i.id = $1
    GROUP BY i.id, c.id
  `, [indicadorId]);

  if (!resultado.rows[0]) return null;
  const r = resultado.rows[0];
  const metaGlobal = parseFloat(r.meta_global) || 0;
  const totalAportado = parseFloat(r.total_aportado) || 0;
  return {
    ...r,
    meta_global: metaGlobal,
    total_aportado: totalAportado,
    disponible: Math.max(0, metaGlobal - totalAportado),
  };
}

module.exports = {
  listarPorProyecto,
  obtenerPorId,
  listarPorEtapa,
  listarTodosPorProyecto,
  crear,
  actualizar,
  eliminar,
  obtenerResumenAportaciones,
};
