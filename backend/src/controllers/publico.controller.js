/**
 * ARCHIVO: publico.controller.js
 * PROPÓSITO: API de salida para el tablero ejecutivo externo.
 *            Autenticada con token de servicio (api_tokens), NO con la
 *            sesión de un usuario.
 *
 * MINI-CLASE: qué contrato se le promete al consumidor
 * ─────────────────────────────────────────────────────────────────
 * Un consumidor externo no puede depender de nuestros nombres, que
 * cambian. La respuesta se organiza alrededor de dos identificadores
 * estables: `id` (el UUID del catálogo — la llave real con la que
 * guardar referencias) y `clave` (legible, para humanos, nunca se
 * regenera al editar — ver CAMPOS_EDITABLES en
 * catalogo-indicadores.queries.js, que no incluye `clave`).
 *
 * Es de SOLO LECTURA a propósito: la plataforma externa consulta, no
 * escribe. Cualquier escritura entraría por la app, con un usuario
 * real detrás y su registro de actividad.
 *
 * MINI-CLASE: `actualizado_en` vs. `fecha_corte` vs. `fecha_aporte`
 * ─────────────────────────────────────────────────────────────────
 * `actualizado_en` es `indicadores.updated_at`: se mueve con CUALQUIER
 * edición de la fila (renombrar, cambiar la meta, re-vincular el
 * catálogo), no solo con una captura de avance. `fecha_corte` es la
 * fecha del movimiento no anulado más reciente DE TODO EL PROYECTO
 * para este indicador. `fecha_aporte` (dentro de cada nodo) es lo
 * mismo pero acotado a ESE nodo — pueden ser distintas si varios
 * nodos aportan al mismo indicador en fechas distintas.
 *
 * MINI-CLASE: la meta es acumulada, no anual
 * ─────────────────────────────────────────────────────────────────
 * `indicador_metas_anuales` existe en el esquema pero está vacía en
 * producción (confirmado — ver el reporte del PR que agregó este
 * bloque): nadie captura metas por ejercicio fiscal todavía. `meta`/
 * `meta_total` son siempre la meta GLOBAL del indicador, de principio
 * a fin, nunca "la meta de este año". Compararla contra un presupuesto
 * anual da un número equivocado.
 * ─────────────────────────────────────────────────────────────────
 */
const pool = require('../db/pool');
const { calcularAvancePorcentaje } = require('../utils/indicador-calculo');

const HISTORICO_LIMITE_DEFAULT = 60;
const HISTORICO_LIMITE_MAXIMO = 365;

// Notas de mantenimiento interno que algún seeder/panel deja escritas en
// un campo de texto libre del catálogo (hoy `definicion`/`fuente`, ver
// backend/src/db/seeders/00_catalogo_indicadores_v1_sedatu.js) y que no
// deben salir en una API pensada para un consumidor externo. No se tocan
// en la base, solo se ocultan al armar esta respuesta.
const PREFIJO_NOTA_INTERNA = '⚠';
function quitarNotaInterna(texto) {
  if (!texto || !texto.trim().startsWith(PREFIJO_NOTA_INTERNA)) return texto;
  return null;
}

const ETIQUETA_MODO = { al_concluir: 'manual', proporcional: 'automatico' };
const ETIQUETA_TIPO_NODO = { etapa: 'Etapa', accion: 'Accion', tarea: 'Tarea' };

// ─── Identidad institucional (Bloque A) ──────────────────────────
// objetivo/estrategia/linea se derivan de codigo_linea_accion
// ("1.3.2" = objetivo 1, estrategia 1.3, línea 1.3.2) — mismo criterio
// que ya usa MigajaPsedatu.jsx en la interfaz. Solo aplica a PSEDATU;
// los otros instrumentos nunca traen codigo_linea_accion.
function derivarPsedatu(codigoLineaAccion) {
  if (!codigoLineaAccion) return { objetivo: null, estrategia: null, linea: null };
  const segmentos = codigoLineaAccion.split('.');
  return {
    objetivo: segmentos[0] || null,
    estrategia: segmentos.length >= 2 ? `${segmentos[0]}.${segmentos[1]}` : null,
    linea: segmentos.length >= 3 ? codigoLineaAccion : null,
  };
}

// area_sugerida guarda TODAS las URs separadas por "; " cuando el Excel
// fuente traía varias filas para el mismo nombre de Variable, cada una
// reportada por una UR distinta: el script externo de conversión que
// generó 00_catalogo_indicadores_v1_sedatu.js (ver su comentario de
// cabecera) las agrupa SIN perder ninguna antes de llegar aquí — no
// hay pérdida en este campo. Confirmado de forma empírica, no solo por
// el comentario: de las 1387 entradas del lote, exactamente 423 traen
// más de una UR, el mismo número que la Secretaría reportó al revisar
// el Excel a mano. La pérdida real de esas filas colapsadas (ver
// Bloque F del PR) es en `producto`, que sí es de un solo valor: en los
// 23 nombres donde las filas de origen reportaban bajo Productos
// distintos, solo uno sobrevivió.
function derivarAreaResponsable(areaSugerida) {
  if (!areaSugerida) return [];
  return areaSugerida.split(';').map(a => a.trim()).filter(Boolean);
}

// Mismo criterio que el chip "De la plataforma" del catálogo
// (FiltrosCatalogoIndicadores.jsx) y que el filtro ?dg=/?instrumento=
// de este archivo: instrumento NULL = lo dio de alta un usuario dentro
// de PSPP: "plataforma". Instrumento presente = viene de un documento
// institucional importado: "institucional".
function derivarOrigen(instrumento) {
  return instrumento ? 'institucional' : 'plataforma';
}

// ─── Territorio de un nodo (Bloque B) ────────────────────────────
// cve_ent (2 dígitos, en la fila del nodo) y cve_mun/cvegeo (5 dígitos,
// en las tablas puente etapa_municipios/accion_municipios/
// tarea_municipios, migración 042) YA SON claves INEGI reales — no son
// nombres de respaldo. geo_estados/geo_municipios (migración 022) dan
// el nombre de cada una. `cobertura_geografica` es un espejo derivado
// para el Mapa Territorial (sincronizarCobertura, ver acciones.
// controller.js); la fuente real sigue siendo cve_ent + las tablas
// puente, así que esta API lee de ahí directo, no del espejo.
function territorioVacio() {
  return { entidad: null, municipios: [] };
}
function territorioDe(nodo, geoEstados) {
  if (!nodo || !nodo.cve_ent) return territorioVacio();
  return {
    entidad: { cve_ent: nodo.cve_ent, nombre: geoEstados.get(nodo.cve_ent) || null },
    municipios: nodo.municipios || [],
  };
}
function territorioNoVacio(t) {
  return !!(t && (t.entidad || (t.municipios && t.municipios.length > 0)));
}

// La herencia de territorio en esta plataforma es una COPIA hecha una
// sola vez al crear el nodo (ver tareas.queries.js::crearTarea y
// acciones.queries.js::crear, que copian cve_ent/municipios del padre
// si el hijo no manda los suyos) — no hay ningún lookup dinámico al
// padre en el resto del código. territorio_efectivo reproduce ese
// mismo sentido de herencia pero en vivo, para los casos que la copia
// de creación no cubre: un nodo de antes de que existiera (migración
// 042/062) o uno al que le borraron su territorio después sin
// recapturar. tareas → su acción (y si esa acción es una subacción sin
// territorio propio, sigue hacia la acción padre, y de ahí a la
// etapa); acciones (y subacciones) → su etapa. Una etapa nunca hereda:
// es el nivel más alto con territorio en este esquema.
function territorioEfectivoAccion(accion, accionesPorId, etapasPorId, geoEstados) {
  const propio = territorioDe(accion, geoEstados);
  if (territorioNoVacio(propio)) return propio;
  if (accion.id_accion_padre) {
    const padre = accionesPorId.get(accion.id_accion_padre);
    if (padre) {
      const delPadre = territorioDe(padre, geoEstados);
      if (territorioNoVacio(delPadre)) return delPadre;
    }
  }
  const etapa = etapasPorId.get(accion.id_etapa);
  return etapa ? territorioDe(etapa, geoEstados) : territorioVacio();
}
function territorioEfectivoTarea(tarea, accionesPorId, etapasPorId, geoEstados) {
  const propio = territorioDe(tarea, geoEstados);
  if (territorioNoVacio(propio)) return propio;
  const accion = accionesPorId.get(tarea.id_accion);
  return accion ? territorioEfectivoAccion(accion, accionesPorId, etapasPorId, geoEstados) : territorioVacio();
}

// Trae etapas/acciones/tareas (nombre, estado, cve_ent y municipios)
// para un conjunto de ids — en 2 pasadas porque los ids de acciones
// necesarios para resolver la herencia (padres de subacción, etapa de
// una tarea) solo se conocen DESPUÉS de la primera pasada. Pensado
// para decenas de nodos (el perfil real de producción), no miles.
async function resolverNodos(etapaIdsIniciales, accionIdsIniciales, tareaIdsIniciales) {
  async function etapasPorIds(ids) {
    if (ids.length === 0) return new Map();
    const { rows } = await pool.query(`
      SELECT e.id, e.nombre, e.estado, e.cve_ent,
        COALESCE(json_agg(json_build_object('cve_mun', em.cve_mun, 'nombre', gm.nombre) ORDER BY gm.nombre)
                 FILTER (WHERE em.cve_mun IS NOT NULL), '[]'::json) AS municipios
      FROM etapas e
      LEFT JOIN etapa_municipios em ON em.etapa_id = e.id
      LEFT JOIN geo_municipios gm ON gm.cvegeo = em.cve_mun
      WHERE e.id = ANY($1)
      GROUP BY e.id
    `, [ids]);
    return new Map(rows.map(r => [r.id, r]));
  }
  async function accionesPorIds(ids) {
    if (ids.length === 0) return new Map();
    const { rows } = await pool.query(`
      SELECT a.id, a.nombre, a.estado, a.cve_ent, a.id_etapa, a.id_accion_padre,
        COALESCE(json_agg(json_build_object('cve_mun', am.cve_mun, 'nombre', gm.nombre) ORDER BY gm.nombre)
                 FILTER (WHERE am.cve_mun IS NOT NULL), '[]'::json) AS municipios
      FROM acciones a
      LEFT JOIN accion_municipios am ON am.accion_id = a.id
      LEFT JOIN geo_municipios gm ON gm.cvegeo = am.cve_mun
      WHERE a.id = ANY($1)
      GROUP BY a.id
    `, [ids]);
    return new Map(rows.map(r => [r.id, r]));
  }
  async function tareasPorIds(ids) {
    if (ids.length === 0) return new Map();
    const { rows } = await pool.query(`
      SELECT t.id, t.nombre, t.estado, t.cve_ent, t.id_accion,
        COALESCE(json_agg(json_build_object('cve_mun', tm.cve_mun, 'nombre', gm.nombre) ORDER BY gm.nombre)
                 FILTER (WHERE tm.cve_mun IS NOT NULL), '[]'::json) AS municipios
      FROM tareas t
      LEFT JOIN tarea_municipios tm ON tm.tarea_id = t.id
      LEFT JOIN geo_municipios gm ON gm.cvegeo = tm.cve_mun
      WHERE t.id = ANY($1)
      GROUP BY t.id
    `, [ids]);
    return new Map(rows.map(r => [r.id, r]));
  }

  const tareasPorId = await tareasPorIds([...tareaIdsIniciales]);
  const accionIds = new Set(accionIdsIniciales);
  for (const t of tareasPorId.values()) if (t.id_accion) accionIds.add(t.id_accion);

  let accionesPorId = await accionesPorIds([...accionIds]);
  const accionPadreFaltantes = new Set();
  for (const a of accionesPorId.values()) {
    if (a.id_accion_padre && !accionesPorId.has(a.id_accion_padre)) accionPadreFaltantes.add(a.id_accion_padre);
  }
  if (accionPadreFaltantes.size > 0) {
    const extra = await accionesPorIds([...accionPadreFaltantes]);
    for (const [id, a] of extra) accionesPorId.set(id, a);
  }

  const etapaIds = new Set(etapaIdsIniciales);
  for (const a of accionesPorId.values()) if (a.id_etapa) etapaIds.add(a.id_etapa);
  const etapasPorId = await etapasPorIds([...etapaIds]);

  const { rows: geoEstadosRows } = await pool.query('SELECT cve_ent, nombre FROM geo_estados');
  const geoEstados = new Map(geoEstadosRows.map(r => [r.cve_ent, r.nombre]));

  return { etapasPorId, accionesPorId, tareasPorId, geoEstados };
}

// Núcleo de la respuesta — lo comparten la ruta pública (autenticada con
// token, GET /publico/indicadores) y el probador de Administración > API
// (autenticado con la sesión del superadmin, nunca con el token: el
// token solo se guarda hasheado, así que el panel no podría usarlo ni
// si quisiera). Las dos rutas corren exactamente este mismo código —
// lo que el probador muestra es la respuesta real, no una simulación.
//
// `soloClave`: pedir un solo indicador por su clave estable — siempre
// se devuelve, tenga o no proyectos, esté activo o no en el catálogo:
// es una consulta puntual y deliberada de un consumidor que ya sabe qué
// busca, no el barrido general que `incluirTodos` controla.
// `incluirTodos`: sin esto, el barrido general (sin `soloClave`) se
// acota a indicadores con al menos un proyecto que los mida.
// `dg`/`instrumento`: filtros de fila, combinables entre sí y con lo
// anterior. `cveEnt` es distinto: no quita indicadores ni proyectos,
// solo recorta el arreglo `nodos` de cada proyecto a los que caen en
// esa entidad (Bloque D1 del encargo — el territorio vive en el nodo,
// no en el proyecto).
async function obtenerDatosIndicadores(opciones) {
  const { soloClave, historicoLimite, incluirTodos = false, dg = null, instrumento = null, cveEnt = null } = opciones;

  const condiciones = ['($1::text IS NULL OR c.clave = $1)'];
  const valores = [soloClave];
  if (dg) { valores.push(dg); condiciones.push(`dg.siglas = $${valores.length}`); }
  if (instrumento) { valores.push(instrumento); condiciones.push(`c.instrumento = $${valores.length}`); }

  const { rows } = await pool.query(`
    SELECT
      c.id            AS catalogo_id,
      c.clave, c.nombre, c.descripcion, c.tipo, c.unidad,
      c.unidad_personalizada, c.etiqueta_unidad, c.definicion, c.fuente,
      c.activo, c.instrumento, c.producto AS categoria, c.area_sugerida,
      c.codigo_linea_accion, c.referencia AS fuente_oficial,
      i.id            AS indicador_id,
      i.meta_global, i.valor_actual,
      p.id            AS proyecto_id,
      p.nombre        AS proyecto_nombre,
      p.estado        AS proyecto_estado,
      dg.siglas       AS dg_siglas,
      i.updated_at    AS actualizado_en
    FROM catalogo_indicadores c
    LEFT JOIN indicadores i ON i.id_catalogo = c.id AND i.activo = true
    LEFT JOIN proyectos p   ON p.id = i.id_proyecto AND p.deleted_at IS NULL AND p.estado != 'Cancelada'
    LEFT JOIN direcciones_generales dg ON dg.id = p.id_dg_lider
    WHERE ${condiciones.join(' AND ')}
    ORDER BY c.nombre, p.nombre
  `, valores);

  const idsIndicador = [...new Set(rows.map(r => r.indicador_id).filter(Boolean))];

  // ─── Movimientos: historico/periodos/fecha_corte/ultima_captura_por ───
  // Una fila por movimiento real, nunca agrupada por día a nivel SQL —
  // agrupar por fecha escondía que dos movimientos el mismo día (uno
  // proporcional +3, uno manual +1) son dos eventos distintos, de dos
  // nodos distintos, que un consumidor no puede separar si llegan ya
  // sumados (bug reportado: "el histórico muestra una sola entrada").
  const historicoPorIndicador = new Map();
  const periodosPorIndicador = new Map();
  const fechaCortePorIndicador = new Map();
  const ultimaCapturaPorPorIndicador = new Map();
  if (idsIndicador.length > 0) {
    const { rows: movs } = await pool.query(`
      SELECT m.id_indicador, m.fecha, m.cantidad, m.id_nodo_origen,
        u.nombre_completo AS registrado_por
      FROM indicador_movimientos m
      LEFT JOIN usuarios u ON u.id = m.creado_por
      WHERE m.id_indicador = ANY($1) AND m.anulado_en IS NULL
      ORDER BY m.id_indicador, m.fecha ASC, m.created_at ASC
    `, [idsIndicador]);

    const acumuladoPorIndicador = new Map();
    for (const m of movs) {
      const movimiento = parseFloat(m.cantidad);
      const acumulado = (acumuladoPorIndicador.get(m.id_indicador) || 0) + movimiento;
      acumuladoPorIndicador.set(m.id_indicador, acumulado);

      const entradaHist = { fecha: m.fecha, movimiento, acumulado, nodo_id: m.id_nodo_origen || null, registrado_por: m.registrado_por || null };
      if (!historicoPorIndicador.has(m.id_indicador)) historicoPorIndicador.set(m.id_indicador, []);
      historicoPorIndicador.get(m.id_indicador).push(entradaHist);

      fechaCortePorIndicador.set(m.id_indicador, m.fecha);
      ultimaCapturaPorPorIndicador.set(m.id_indicador, m.registrado_por || null);

      // `pg` entrega una columna DATE como objeto Date de JS — hay que
      // pasar por toISOString() para sacar "2026-09" de ahí; String(fecha)
      // a secas da el formato de Date.toString() ("Tue Sep 15 2026..."),
      // no un ISO, y slice(0,7) sobre eso sale "Tue Se" en vez del periodo.
      const fechaISO = m.fecha.toISOString().slice(0, 10);
      const periodo = fechaISO.slice(0, 7);
      if (!periodosPorIndicador.has(m.id_indicador)) periodosPorIndicador.set(m.id_indicador, new Map());
      const periodos = periodosPorIndicador.get(m.id_indicador);
      const actual = periodos.get(periodo) || { periodo, anio: parseInt(periodo.slice(0, 4), 10), movimiento: 0, acumulado_al_cierre: 0 };
      actual.movimiento += movimiento;
      actual.acumulado_al_cierre = acumulado;
      periodos.set(periodo, actual);
    }
    if (historicoLimite) {
      for (const [id, lista] of historicoPorIndicador) historicoPorIndicador.set(id, lista.slice(-historicoLimite));
    }
  }

  // ─── Nodos que aportan, con su territorio (Bloque B) ───
  const nodosPorIndicador = new Map();
  if (idsIndicador.length > 0) {
    const { rows: aportaciones } = await pool.query(`
      SELECT id, id_indicador, aportacion, modo, id_etapa, id_accion, id_tarea
      FROM indicador_aportaciones
      WHERE id_indicador = ANY($1)
    `, [idsIndicador]);

    const { rows: aportadoRows } = await pool.query(`
      SELECT id_indicador, id_nodo_origen,
        SUM(cantidad)::numeric AS aportado, MAX(fecha) AS fecha_aporte
      FROM indicador_movimientos
      WHERE id_indicador = ANY($1) AND id_nodo_origen IS NOT NULL AND anulado_en IS NULL
      GROUP BY id_indicador, id_nodo_origen
    `, [idsIndicador]);
    const aportadoPorNodo = new Map(aportadoRows.map(r => [`${r.id_indicador}|${r.id_nodo_origen}`, r]));

    const etapaIds = [], accionIds = [], tareaIds = [];
    for (const ap of aportaciones) {
      if (ap.id_etapa) etapaIds.push(ap.id_etapa);
      else if (ap.id_accion) accionIds.push(ap.id_accion);
      else if (ap.id_tarea) tareaIds.push(ap.id_tarea);
    }
    const { etapasPorId, accionesPorId, tareasPorId, geoEstados } = await resolverNodos(etapaIds, accionIds, tareaIds);

    for (const ap of aportaciones) {
      const tipo = ap.id_etapa ? 'etapa' : ap.id_accion ? 'accion' : 'tarea';
      const nodoId = ap.id_etapa || ap.id_accion || ap.id_tarea;
      const nodo = tipo === 'etapa' ? etapasPorId.get(nodoId) : tipo === 'accion' ? accionesPorId.get(nodoId) : tareasPorId.get(nodoId);
      if (!nodo) continue; // nodo borrado; la aportación debería haberse limpiado con él

      const territorioPropio = territorioDe(nodo, geoEstados);
      const territorioEfectivo = tipo === 'etapa' ? territorioPropio
        : tipo === 'accion' ? territorioEfectivoAccion(nodo, accionesPorId, etapasPorId, geoEstados)
        : territorioEfectivoTarea(nodo, accionesPorId, etapasPorId, geoEstados);

      const aportado = aportadoPorNodo.get(`${ap.id_indicador}|${nodoId}`);

      if (!nodosPorIndicador.has(ap.id_indicador)) nodosPorIndicador.set(ap.id_indicador, []);
      nodosPorIndicador.get(ap.id_indicador).push({
        nodo_id: nodoId,
        nombre: nodo.nombre,
        tipo: ETIQUETA_TIPO_NODO[tipo],
        estado: nodo.estado,
        aportacion_declarada: ap.aportacion == null ? null : parseFloat(ap.aportacion),
        modo: ETIQUETA_MODO[ap.modo] || ap.modo,
        aportado: aportado ? parseFloat(aportado.aportado) : 0,
        fecha_aporte: aportado ? aportado.fecha_aporte : null,
        territorio_propio: territorioPropio,
        territorio_efectivo: territorioEfectivo,
      });
    }
  }

  // ─── Ensamblado por clave, luego por proyecto ───
  const porClave = new Map();
  for (const r of rows) {
    if (!porClave.has(r.clave)) {
      const { objetivo, estrategia, linea } = derivarPsedatu(r.codigo_linea_accion);
      const sumable = r.unidad !== 'Porcentaje';
      porClave.set(r.clave, {
        id: r.catalogo_id,
        clave: r.clave,
        nombre: r.nombre,
        descripcion: r.descripcion,
        tipo: r.tipo,
        unidad: r.unidad,
        etiqueta_unidad: r.etiqueta_unidad || r.unidad_personalizada || null,
        definicion: quitarNotaInterna(r.definicion),
        fuente: quitarNotaInterna(r.fuente),
        fuente_oficial: r.fuente_oficial || null,
        activo: r.activo,
        instrumento: r.instrumento || null,
        categoria: r.categoria || null,
        objetivo, estrategia, linea,
        area_responsable: derivarAreaResponsable(r.area_sugerida),
        origen: derivarOrigen(r.instrumento),
        sumable,
        meta_total: sumable ? 0 : null,
        avance_total: sumable ? 0 : null,
        proyectos: [],
        _porDependencia: new Map(), // se descarta antes de responder; ver abajo
      });
    }
    const entrada = porClave.get(r.clave);
    // Un indicador del catálogo puede no estar usado por nadie todavía:
    // se devuelve igual, con totales en cero, para que el consumidor
    // conozca el universo completo y no solo lo que ya tiene datos.
    if (!r.indicador_id) continue;

    const meta = r.meta_global == null ? null : parseFloat(r.meta_global);
    const valor = r.valor_actual == null ? 0 : parseFloat(r.valor_actual);
    if (entrada.sumable) {
      entrada.meta_total += meta || 0;
      entrada.avance_total += valor;
    }

    const historico = historicoPorIndicador.get(r.indicador_id) || [];
    const periodos = [...(periodosPorIndicador.get(r.indicador_id) || new Map()).values()];

    entrada.proyectos.push({
      proyecto_id: r.proyecto_id,
      proyecto: r.proyecto_nombre,
      estado: r.proyecto_estado,
      dg: r.dg_siglas,
      meta,
      avance: valor,
      ultima_captura_por: ultimaCapturaPorPorIndicador.get(r.indicador_id) || null,
      actualizado_en: r.actualizado_en,
      fecha_corte: fechaCortePorIndicador.get(r.indicador_id) || null,
      historico,
      periodos,
      nodos: nodosPorIndicador.get(r.indicador_id) || [],
    });

    // por_dependencia (Bloque C1) — una entrada por DG, cuadrando exacto
    // con la suma de los proyectos de esa DG (se construye de la misma
    // pasada que llena `proyectos`, no de una agregación aparte).
    if (r.dg_siglas) {
      const porDep = entrada._porDependencia;
      const actual = porDep.get(r.dg_siglas) || {
        siglas: r.dg_siglas, suma_metas: entrada.sumable ? 0 : null, suma_avances: entrada.sumable ? 0 : null,
        num_proyectos: 0, fecha_corte_mas_reciente: null,
      };
      if (entrada.sumable) {
        actual.suma_metas += meta || 0;
        actual.suma_avances += valor;
      }
      actual.num_proyectos += 1;
      const fc = fechaCortePorIndicador.get(r.indicador_id) || null;
      if (fc && (!actual.fecha_corte_mas_reciente || fc > actual.fecha_corte_mas_reciente)) actual.fecha_corte_mas_reciente = fc;
      porDep.set(r.dg_siglas, actual);
    }
  }

  // Filtro de territorio (Bloque D1): recorta nodos, nunca quita
  // proyectos ni indicadores — "devolver el indicador con solo los
  // nodos de esa entidad", no un indicador distinto.
  if (cveEnt) {
    for (const entrada of porClave.values()) {
      for (const proyecto of entrada.proyectos) {
        proyecto.nodos = proyecto.nodos.filter(n => n.territorio_efectivo.entidad?.cve_ent === cveEnt);
      }
    }
  }

  let datos = [...porClave.values()].map(e => {
    const { _porDependencia, ...resto } = e;
    return {
      ...resto,
      porcentaje: e.sumable ? calcularAvancePorcentaje(e.avance_total, e.meta_total) : null,
      por_dependencia: [..._porDependencia.values()].sort((a, b) => a.siglas.localeCompare(b.siglas)),
    };
  });

  // Una consulta puntual por `clave` siempre devuelve su indicador,
  // tenga o no proyectos; el barrido general lo oculta por omisión
  // salvo que se pida `incluirTodos`.
  if (!soloClave && !incluirTodos) {
    datos = datos.filter(e => e.proyectos.length > 0);
  }

  return { generado_en: new Date().toISOString(), total: datos.length, datos };
}

function leerHistoricoLimite(query) {
  const pedido = parseInt(query.historico_limite, 10);
  if (!Number.isFinite(pedido) || pedido <= 0) return HISTORICO_LIMITE_DEFAULT;
  return Math.min(pedido, HISTORICO_LIMITE_MAXIMO);
}

function leerIncluirTodos(query) {
  return query.todos === '1' || query.todos === 'true';
}

function leerOpciones(query) {
  return {
    soloClave: query.clave || null,
    historicoLimite: leerHistoricoLimite(query),
    incluirTodos: leerIncluirTodos(query),
    dg: query.dg || null,
    instrumento: query.instrumento || null,
    cveEnt: query.cve_ent || null,
  };
}

// GET /publico/indicadores — autenticado con token (requiereApiToken).
async function indicadores(req, res, next) {
  try {
    res.json(await obtenerDatosIndicadores(leerOpciones(req.query)));
  } catch (err) { next(err); }
}

// GET /admin/api-tokens/probar — Administración > API, autenticado con
// la SESIÓN del superadmin (requiereRol, ver admin.routes.js), nunca
// con un token real: el token solo se guarda hasheado, ni este panel
// puede recuperarlo. Corre exactamente la misma consulta que la ruta
// pública — lo que se ve aquí es la respuesta real, no una simulación.
async function probar(req, res, next) {
  try {
    res.json(await obtenerDatosIndicadores(leerOpciones(req.query)));
  } catch (err) { next(err); }
}

module.exports = { indicadores, probar };
