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
const { calcularAvancePorcentaje } = require('../../utils/indicador-calculo');
const { registrarActividad } = require('../../utils/actividad-log');

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

// Actualiza un indicador y sincroniza sus metas/periodos por diff.
async function actualizar(indicadorId, datos, idUsuario = null) {
  validarComposicion(datos);
  validarDatosIndicador(datos);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const metaGlobal = datos.meta_global === '' || datos.meta_global == null ? null : parseFloat(datos.meta_global);
    const resultado = await client.query(`
      UPDATE indicadores SET
        nombre = $1, tipo = $2, unidad = $3,
        unidad_personalizada = $4, etiqueta_unidad = $5,
        meta_global = $6, temporalidad = $7, unidad_periodo = $8,
        anio_inicio = $9, anio_fin = $10,
        descripcion = $11, composicion = $12, tipo_grafico = $13,
        updated_at = NOW()
      WHERE id = $14
      RETURNING *
    `, [
      datos.nombre, datos.tipo, datos.unidad,
      datos.unidad_personalizada || null,
      datos.etiqueta_unidad || datos.unidad_personalizada || null,
      metaGlobal, datos.temporalidad || 'Global', datos.unidad_periodo || 'Anio',
      datos.anio_inicio || null, datos.anio_fin || null,
      datos.descripcion || null,
      datos.composicion === 'Categorias' ? 'Categorias' : 'Simple',
      datos.tipo_grafico === 'dona' ? 'dona' : 'barras',
      indicadorId
    ]);

    // Sincronizar metas/periodos por diff en vez de borrar y recrear
    // todo: borrar-y-recrear pisaba valor_actual de CADA periodo con
    // cualquier edición de metadatos (nombre, meta, etc.), no solo con
    // un cambio real a los periodos. Con 'Personalizado' agregar/quitar
    // periodos es una acción frecuente, así que perder el valor ya
    // capturado de los demás en cada guardado dejó de ser aceptable.
    // Filas entrantes con "id" existente → UPDATE (conserva
    // valor_actual); sin "id" → INSERT (periodo nuevo); filas que ya
    // no vienen en el arreglo entrante → DELETE (el usuario lo quitó).
    const entrantes = datos.metas_anuales || [];
    const { rows: existentes } = await client.query(
      'SELECT id FROM indicador_metas_anuales WHERE id_indicador = $1',
      [indicadorId]
    );
    const idsEntrantes = new Set(entrantes.filter(ma => ma.id).map(ma => ma.id));
    const idsAEliminar = existentes.map(e => e.id).filter(id => !idsEntrantes.has(id));

    if (idsAEliminar.length > 0) {
      await client.query(
        'DELETE FROM indicador_metas_anuales WHERE id = ANY($1)',
        [idsAEliminar]
      );
    }

    for (const ma of entrantes) {
      const anio = ma.anio === '' || ma.anio == null ? null : parseInt(ma.anio);
      const meta = ma.meta === '' || ma.meta == null ? 0 : parseFloat(ma.meta);
      const etiqueta = ma.etiqueta || null;
      if (ma.id) {
        await client.query(
          'UPDATE indicador_metas_anuales SET anio = $1, meta = $2, etiqueta = $3 WHERE id = $4 AND id_indicador = $5',
          [anio, meta, etiqueta, ma.id, indicadorId]
        );
      } else {
        await client.query(
          'INSERT INTO indicador_metas_anuales (id_indicador, anio, meta, etiqueta) VALUES ($1, $2, $3, $4)',
          [indicadorId, anio, meta, etiqueta]
        );
      }
    }

    // Mismo diff-upsert que arriba, aplicado a categorías: conserva
    // valor_actual de las que solo cambiaron de nombre/meta. "orden" se
    // recalcula siempre a partir de la posición en el arreglo entrante
    // (sin UI de reordenar en v1, solo agregar/quitar al final).
    const categoriasEntrantes = datos.categorias || [];
    const { rows: categoriasExistentes } = await client.query(
      'SELECT id FROM indicador_categorias WHERE id_indicador = $1',
      [indicadorId]
    );
    const idsCategoriasEntrantes = new Set(categoriasEntrantes.filter(c => c.id).map(c => c.id));
    const idsCategoriasAEliminar = categoriasExistentes.map(e => e.id).filter(id => !idsCategoriasEntrantes.has(id));

    if (idsCategoriasAEliminar.length > 0) {
      await client.query(
        'DELETE FROM indicador_categorias WHERE id = ANY($1)',
        [idsCategoriasAEliminar]
      );
    }

    let ordenCategoria = 0;
    for (const cat of categoriasEntrantes) {
      const meta = cat.meta === '' || cat.meta == null ? 0 : parseFloat(cat.meta);
      if (cat.id) {
        await client.query(
          'UPDATE indicador_categorias SET nombre = $1, meta = $2, orden = $3 WHERE id = $4 AND id_indicador = $5',
          [cat.nombre, meta, ordenCategoria++, cat.id, indicadorId]
        );
      } else {
        await client.query(
          'INSERT INTO indicador_categorias (id_indicador, nombre, meta, orden) VALUES ($1, $2, $3, $4)',
          [indicadorId, cat.nombre, meta, ordenCategoria++]
        );
      }
    }

    await client.query('COMMIT');

    await registrarActividad({
      id_proyecto: resultado.rows[0].id_proyecto,
      id_usuario: idUsuario,
      tipo: 'indicador',
      titulo: `Indicador "${resultado.rows[0].nombre}" actualizado`,
      entidad_tipo: 'Indicador',
      entidad_id: indicadorId,
    });

    return resultado.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
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
// el proyecto. Necesita .categorias igual que las otras funciones de
// listado: sin esto, el selector de categoría al vincular un nodo no
// tendría de dónde poblarse para un indicador que ya existía de antes.
async function listarTodosPorProyecto(proyectoId) {
  const indicadores = await pool.query(`
    SELECT i.*, e.nombre AS etapa_nombre
    FROM indicadores i
    LEFT JOIN etapas e ON e.id = i.id_etapa
    WHERE i.id_proyecto = $1 AND i.activo = true
    ORDER BY i.id_etapa NULLS FIRST, i.orden, i.created_at
  `, [proyectoId]);
  await cargarCategorias(pool, indicadores.rows);
  return indicadores.rows;
}

// Resumen de aportaciones a un indicador: meta, cuánto ya está comprometido, disponible
async function obtenerResumenAportaciones(indicadorId) {
  const resultado = await pool.query(`
    SELECT
      i.meta_global,
      i.unidad,
      i.unidad_personalizada,
      i.nombre,
      COALESCE(SUM(ai.aportacion), 0)::numeric AS total_aportado,
      COUNT(ai.id)::int AS num_acciones
    FROM indicadores i
    LEFT JOIN indicador_aportaciones ai ON ai.id_indicador = i.id
    WHERE i.id = $1
    GROUP BY i.id
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

/**
 * Recalcula valor_actual de un indicador según su modo_calculo.
 * - contar_completadas: cuenta acciones con estado='Completada' vinculadas
 * - porcentaje_promedio: promedio de porcentaje_avance de acciones vinculadas
 *
 * 'manual' y 'suma_manual' NO pasan por aquí — recalcularIndicadoresProyecto
 * ya los excluye. Un indicador manual se edita con PATCH /indicadores/:id/valor
 * (captura directa) o vía sus aportaciones (indicador_aportaciones, ver
 * aportaciones.queries.js::recalcularAportacionesProyecto) — nunca desde
 * esta función, que solo existió para los dos modos verdaderamente
 * automáticos.
 *
 * Si id_etapa no es null, solo cuenta acciones de esa etapa.
 */
async function recalcularIndicador(indicadorId, client = null) {
  const db = client || pool;
  const ind = await db.query(
    'SELECT id, modo_calculo, id_proyecto, id_etapa FROM indicadores WHERE id = $1',
    [indicadorId]
  );
  if (!ind.rows[0]) return null;
  const { modo_calculo, id_proyecto, id_etapa } = ind.rows[0];

  let valor = 0;
  if (modo_calculo === 'contar_completadas') {
    const filtroEtapa = id_etapa ? 'AND a.id_etapa = $2' : '';
    const params = id_etapa ? [id_proyecto, id_etapa] : [id_proyecto];
    const res = await db.query(`
      SELECT COUNT(*)::int AS total
      FROM acciones a
      WHERE a.id_proyecto = $1 AND a.estado = 'Completada'
        AND a.id_accion_padre IS NULL ${filtroEtapa}
    `, params);
    valor = res.rows[0].total;
  } else if (modo_calculo === 'porcentaje_promedio') {
    const filtroEtapa = id_etapa ? 'AND a.id_etapa = $2' : '';
    const params = id_etapa ? [id_proyecto, id_etapa] : [id_proyecto];
    const res = await db.query(`
      SELECT COALESCE(AVG(a.porcentaje_avance), 0)::numeric AS promedio
      FROM acciones a
      WHERE a.id_proyecto = $1 AND a.id_accion_padre IS NULL
        AND a.estado != 'Cancelada' ${filtroEtapa}
    `, params);
    valor = parseFloat(res.rows[0].promedio) || 0;
  } else {
    return null;
  }

  await db.query(
    'UPDATE indicadores SET valor_actual = $1, updated_at = NOW() WHERE id = $2',
    [valor, indicadorId]
  );
  return valor;
}

/**
 * Recalcula TODOS los indicadores auto-calculados de un proyecto.
 * Se invoca cuando cambia el estado de una acción. Inclusión explícita
 * (antes era `!= 'suma_manual'`, que de paso arrastraba 'manual' — la
 * causa de que un indicador manual se pusiera en cero solo con
 * cualquier cambio de estado, ver migración 068).
 */
async function recalcularIndicadoresProyecto(proyectoId, client = null) {
  const db = client || pool;
  const res = await db.query(
    `SELECT id FROM indicadores
     WHERE id_proyecto = $1 AND activo = true
       AND modo_calculo IN ('contar_completadas', 'porcentaje_promedio')`,
    [proyectoId]
  );
  for (const row of res.rows) {
    await recalcularIndicador(row.id, db);
  }
}

/**
 * Lista indicadores publicables para la plataforma externa.
 * Opcionalmente filtra por id_dg.
 */
async function listarPublicables(filtros = {}) {
  let where = "i.es_publicable = true AND i.activo = true";
  const params = [];
  if (filtros.id_dg) {
    params.push(filtros.id_dg);
    where += ` AND p.id_dg_lider = $${params.length}`;
  }
  const res = await pool.query(`
    SELECT
      i.id,
      i.nombre,
      i.tipo,
      i.unidad,
      i.unidad_personalizada,
      i.meta_global,
      i.valor_actual,
      i.modo_calculo,
      i.temporalidad,
      i.updated_at,
      p.id AS proyecto_id,
      p.nombre AS proyecto_nombre,
      dg.siglas AS dg_siglas,
      dg.nombre AS dg_nombre
    FROM indicadores i
    JOIN proyectos p ON p.id = i.id_proyecto AND p.deleted_at IS NULL AND p.estado != 'Cancelada'
    LEFT JOIN direcciones_generales dg ON dg.id = p.id_dg_lider
    WHERE ${where}
    ORDER BY dg.siglas, p.nombre, i.nombre
  `, params);

  return res.rows.map(r => {
    const meta = parseFloat(r.meta_global) || 0;
    const valor = parseFloat(r.valor_actual) || 0;
    const unidadLabel = r.unidad === 'Porcentaje' ? '%'
      : r.unidad === 'Moneda_MXN' ? '$MXN'
      : r.unidad_personalizada || '#';
    return {
      id: r.id,
      proyecto_id: r.proyecto_id,
      proyecto: r.proyecto_nombre,
      dg: r.dg_siglas,
      dg_nombre: r.dg_nombre,
      indicador: r.nombre,
      tipo: r.tipo,
      meta: meta,
      valor_actual: valor,
      porcentaje: calcularAvancePorcentaje(valor, meta),
      unidad: unidadLabel,
      modo_calculo: r.modo_calculo,
      ultima_actualizacion: r.updated_at,
    };
  });
}

/**
 * Captura manual directa del valor de un indicador — la pieza que hasta
 * ahora no existía: un indicador en modo 'manual' no tenía NINGÚN
 * endpoint para fijar su valor a mano (solo se podía poner en cero por
 * el bug de recalcularIndicadoresProyecto, ya corregido).
 *
 * temporalidad 'Global': set directo de valor_actual.
 * temporalidad 'Anual': upsert de indicador_metas_anuales.valor_actual
 * para ese año (crea la fila si no existía, sin tocar su meta si ya
 * tenía una) — valor_actual del indicador pasa a ser la SUMA de todos
 * sus años capturados, así el corte anual (indicador financiero) queda
 * completo: el número global es la suma de lo capturado año por año.
 *
 * Solo aplica a modo_calculo = 'manual' — lo valida el controller antes
 * de llamar aquí, para no pisar por accidente un valor auto-calculado.
 */
// { valor, id_periodo } — id_periodo es el id real de la fila de
// indicador_metas_anuales, no un año: con 'Personalizado' un año no
// identifica de forma confiable "cuál periodo". Usar el id de la fila
// deja un solo camino (UPDATE por id) para Año/Sexenio/Personalizado
// por igual, sin ramas por tipo de periodo. A diferencia de antes, el
// periodo ya no se autocrea aquí — siempre se define explícitamente en
// crear()/actualizar() antes de poder capturarle un valor.
// { valor, id_periodo, id_categoria } — composicion='Categorias' implica
// temporalidad='Global' por diseño (excluyentes), así que estas dos
// ramas nunca compiten por el mismo indicador: id_periodo identifica
// una fila de indicador_metas_anuales, id_categoria una de
// indicador_categorias, mismo shape de UPDATE-por-id y rollup por SUM
// para ambas.
async function establecerValorManual(indicadorId, { valor, id_periodo, id_categoria }, idUsuario = null) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [ind] } = await client.query(
      'SELECT temporalidad, composicion FROM indicadores WHERE id = $1', [indicadorId]
    );
    if (!ind) { await client.query('ROLLBACK'); return null; }

    if (ind.temporalidad === 'Anual') {
      if (id_periodo == null) {
        const err = new Error('Este indicador tiene corte por periodos: falta indicar cuál');
        err.statusCode = 400;
        throw err;
      }
      const { rows: [periodo] } = await client.query(
        'UPDATE indicador_metas_anuales SET valor_actual = $1 WHERE id = $2 AND id_indicador = $3 RETURNING id',
        [valor, id_periodo, indicadorId]
      );
      if (!periodo) {
        const err = new Error('El periodo indicado no existe para este indicador');
        err.statusCode = 404;
        throw err;
      }

      const { rows: [suma] } = await client.query(
        'SELECT COALESCE(SUM(valor_actual), 0)::numeric AS total FROM indicador_metas_anuales WHERE id_indicador = $1',
        [indicadorId]
      );
      await client.query(
        'UPDATE indicadores SET valor_actual = $1, updated_at = NOW() WHERE id = $2',
        [suma.total, indicadorId]
      );
    } else if (ind.composicion === 'Categorias') {
      if (id_categoria == null) {
        const err = new Error('Este indicador se compone de categorías: falta indicar cuál');
        err.statusCode = 400;
        throw err;
      }
      // Si la categoría ya tiene algún nodo aportándole, su valor se
      // calcula solo (mismo criterio de exclusión manual/automático que
      // ya usa el indicador completo vía modo_calculo) — escribirla a
      // mano aquí se perdería en el próximo recálculo automático.
      const { rows: [conAportacion] } = await client.query(
        'SELECT 1 FROM indicador_aportaciones WHERE id_indicador = $1 AND id_categoria = $2 LIMIT 1',
        [indicadorId, id_categoria]
      );
      if (conAportacion) {
        const err = new Error('Esta categoría se calcula automáticamente desde los nodos vinculados — no se puede editar a mano');
        err.statusCode = 409;
        err.codigo = 'CATEGORIA_CON_APORTACIONES';
        throw err;
      }
      const { rows: [categoria] } = await client.query(
        'UPDATE indicador_categorias SET valor_actual = $1 WHERE id = $2 AND id_indicador = $3 RETURNING id',
        [valor, id_categoria, indicadorId]
      );
      if (!categoria) {
        const err = new Error('La categoría indicada no existe para este indicador');
        err.statusCode = 404;
        throw err;
      }

      const { rows: [suma] } = await client.query(
        'SELECT COALESCE(SUM(valor_actual), 0)::numeric AS total FROM indicador_categorias WHERE id_indicador = $1',
        [indicadorId]
      );
      await client.query(
        'UPDATE indicadores SET valor_actual = $1, updated_at = NOW() WHERE id = $2',
        [suma.total, indicadorId]
      );
    } else {
      // Mismo criterio que la rama de categorías: si algún nodo ya
      // aporta a este indicador, su valor se calcula solo — el guard
      // de modo_calculo no basta por sí solo porque el wizard nunca lo
      // escribe (siempre queda en su default 'manual').
      const { rows: [conAportacion] } = await client.query(
        'SELECT 1 FROM indicador_aportaciones WHERE id_indicador = $1 LIMIT 1',
        [indicadorId]
      );
      if (conAportacion) {
        const err = new Error('Este indicador se calcula automáticamente desde los nodos vinculados — no se puede editar a mano');
        err.statusCode = 409;
        err.codigo = 'INDICADOR_CON_APORTACIONES';
        throw err;
      }
      await client.query(
        'UPDATE indicadores SET valor_actual = $1, updated_at = NOW() WHERE id = $2',
        [valor, indicadorId]
      );
    }

    const { rows: [actualizado] } = await client.query('SELECT * FROM indicadores WHERE id = $1', [indicadorId]);
    await client.query('COMMIT');

    await registrarActividad({
      id_proyecto: actualizado.id_proyecto,
      id_usuario: idUsuario,
      tipo: 'indicador',
      titulo: `Valor capturado para "${actualizado.nombre}"`,
      entidad_tipo: 'Indicador',
      entidad_id: indicadorId,
    });

    return actualizado;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
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
  recalcularIndicador,
  recalcularIndicadoresProyecto,
  listarPublicables,
  establecerValorManual,
};
