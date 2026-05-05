/**
 * ARCHIVO: importar.service.js
 * PROPÓSITO: Lógica central de importación universal.
 *
 * Responsabilidades:
 * - Aplicar config (columnMap, pivotBlocks, valueMap, hierarchy) a filas crudas
 * - Generar jerarquía de entidades (etapas, acciones, subacciones)
 * - Detectar duplicados contra BD
 * - Ejecutar inserción transaccional (todo o nada)
 * - Preview sin tocar BD
 */
const pool = require('../db/pool');
const { recalcularPesosEtapa } = require('../db/queries/acciones.queries');

const ESTADOS_VALIDOS = ['Pendiente', 'En_proceso', 'Bloqueada', 'Completada', 'Cancelada'];

// ─── Utilidades ────────────────────────────────────────────────

function emptyToNull(v) {
  if (v === '' || v == null || v === undefined) return null;
  return String(v).trim();
}

function toDate(v) {
  if (!v || String(v).trim() === '') return null;
  const limpio = String(v).trim();
  // Aceptar YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(limpio)) return limpio;
  // Aceptar DD/MM/YYYY
  const m = limpio.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  // Aceptar fechas tipo Date object stringified
  const d = new Date(limpio);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  return null; // No lanzar error, marcar como warning
}

function normalizarTexto(t) {
  return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function mapearValor(valor, campo, valueMap) {
  if (!valueMap || !valueMap[campo]) return valor;
  const mapa = valueMap[campo];
  const normalizado = String(valor || '').trim();
  // Buscar exacto primero
  if (mapa[normalizado] !== undefined) return mapa[normalizado];
  // Buscar case-insensitive
  for (const [k, v] of Object.entries(mapa)) {
    if (normalizarTexto(k) === normalizarTexto(normalizado)) return v;
  }
  return normalizado;
}

// ─── Transformar filas crudas a entidades PSPP ─────────────────

/**
 * Transforma filas crudas + config en un array de entidades jerárquicas.
 * NO toca la BD. Es puro cálculo.
 * @param {any[][]} dataRows - Filas de datos (arrays de valores)
 * @param {object} config - Configuración de la plantilla
 * @param {string[]} headers - Encabezados detectados
 * @returns {{ entidades: object[], errores: object[], warnings: object[] }}
 */
function transformarFilas(dataRows, config, headers) {
  const entidades = []; // { nivel, nombre, campos, hijos[], filaOrigen, warnings[] }
  const errores = [];
  const warnings = [];

  const { columnMap, pivotBlocks, valueMap, hierarchy, rowLevel } = config;

  // Mapa inverso: índice de columna → campo PSPP
  const colToField = {};
  if (columnMap) {
    for (const [colIdx, field] of Object.entries(columnMap)) {
      colToField[parseInt(colIdx)] = field;
    }
  }

  // Determinar nivel base de cada fila
  const nivelBase = (rowLevel || 'etapa').toLowerCase();

  // Contexto para jerarquía
  let etapaActual = null;
  let accionActual = null;

  for (let i = 0; i < dataRows.length; i++) {
    const fila = dataRows[i];
    const filaNum = i + 1; // 1-indexed para mensajes

    // Saltar filas completamente vacías
    if (!fila || fila.every(c => !c || String(c).trim() === '')) continue;

    // Determinar nivel de esta fila
    let nivel;
    if (hierarchy && hierarchy.enabled && hierarchy.column != null) {
      const valorNivel = String(fila[hierarchy.column] || '').trim().toUpperCase();
      const mapped = hierarchy.valueMap || {};
      // Buscar en valueMap del hierarchy
      nivel = null;
      for (const [k, v] of Object.entries(mapped)) {
        if (k.toUpperCase() === valorNivel) { nivel = v; break; }
      }
      if (!nivel) {
        // Intentar por normalización
        if (valorNivel.includes('SUB')) nivel = 'subaccion';
        else if (valorNivel.includes('ACC') || valorNivel.includes('ACCI')) nivel = 'accion';
        else if (valorNivel.includes('ETA')) nivel = 'etapa';
        else {
          warnings.push({ fila: filaNum, mensaje: `Nivel no reconocido: "${fila[hierarchy.column]}", se asume "${nivelBase}"` });
          nivel = nivelBase;
        }
      }
    } else {
      nivel = nivelBase;
    }

    // Extraer campos planos de la fila según columnMap
    const campos = {};
    for (const [colIdx, field] of Object.entries(colToField)) {
      const idx = parseInt(colIdx);
      let valor = idx < fila.length ? fila[idx] : '';
      // Aplicar valueMap si corresponde
      if (valueMap && valueMap[field]) {
        valor = mapearValor(valor, field, valueMap);
      }
      campos[field] = emptyToNull(valor);
    }

    // Validar estado si está mapeado
    if (campos.estado && !ESTADOS_VALIDOS.includes(campos.estado)) {
      warnings.push({
        fila: filaNum,
        mensaje: `Estado "${campos.estado}" no es válido (${ESTADOS_VALIDOS.join(', ')}). Se usará "Pendiente".`,
      });
      campos.estado = 'Pendiente';
    }

    // Parsear fechas
    for (const campoFecha of ['fecha_inicio', 'fecha_fin']) {
      if (campos[campoFecha]) {
        const parsed = toDate(campos[campoFecha]);
        if (!parsed && campos[campoFecha]) {
          warnings.push({ fila: filaNum, mensaje: `Fecha "${campos[campoFecha]}" en campo ${campoFecha} no reconocida, se dejará vacía.` });
        }
        campos[campoFecha] = parsed;
      }
    }

    // Construir entidad base
    const nombre = campos.nombre || campos.nombre_accion || `Fila ${filaNum}`;
    const entidad = {
      nivel,
      nombre,
      campos,
      hijos: [],
      filaOrigen: filaNum,
      warnings: [],
    };

    // Validar nombre
    if (!nombre || nombre === `Fila ${filaNum}`) {
      entidad.warnings.push('Sin nombre detectado');
    }

    // Procesar pivot blocks → generar acciones/subacciones hijas
    if (pivotBlocks && pivotBlocks.length > 0) {
      for (const block of pivotBlocks) {
        const hijoCampos = {};
        let tieneData = false;

        for (const [colIdx, field] of Object.entries(block.fieldMap)) {
          const idx = parseInt(colIdx);
          let valor = idx < fila.length ? fila[idx] : '';
          if (valor && String(valor).trim()) tieneData = true;
          if (valueMap && valueMap[field]) {
            valor = mapearValor(valor, field, valueMap);
          }
          hijoCampos[field] = emptyToNull(valor);
        }

        // Validar estado del hijo
        if (hijoCampos.estado && !ESTADOS_VALIDOS.includes(hijoCampos.estado)) {
          warnings.push({
            fila: filaNum,
            mensaje: `Estado "${hijoCampos.estado}" en bloque "${block.name}" no es válido. Se usará "Pendiente".`,
          });
          hijoCampos.estado = 'Pendiente';
        }

        // Parsear fechas del hijo
        for (const campoFecha of ['fecha_inicio', 'fecha_fin']) {
          if (hijoCampos[campoFecha]) {
            hijoCampos[campoFecha] = toDate(hijoCampos[campoFecha]);
          }
        }

        // Solo crear hijo si hay al menos un dato
        if (tieneData) {
          entidad.hijos.push({
            nivel: block.createsLevel || 'accion',
            nombre: block.name,
            campos: hijoCampos,
            filaOrigen: filaNum,
            warnings: [],
          });
        }
      }
    }

    // Registrar en jerarquía
    if (nivel === 'etapa') {
      etapaActual = entidad;
      accionActual = null;
      entidades.push(entidad);
    } else if (nivel === 'accion') {
      accionActual = entidad;
      if (etapaActual && hierarchy && hierarchy.enabled) {
        // Hierarchy mode: acciones son hijas de la última etapa
        etapaActual.hijos.push(entidad);
      } else {
        // Flat mode: acciones van al nivel raíz (padre se asigna después)
        entidades.push(entidad);
      }
    } else if (nivel === 'subaccion') {
      if (accionActual && hierarchy && hierarchy.enabled) {
        accionActual.hijos.push(entidad);
      } else {
        entidades.push(entidad);
      }
    }
  }

  return { entidades, errores, warnings };
}

// ─── Detección de duplicados ───────────────────────────────────

async function detectarDuplicados(entidades, proyectoId, parentEntityId) {
  const duplicados = [];

  // Cargar etapas existentes del proyecto
  const { rows: etapasExistentes } = await pool.query(
    'SELECT id, nombre FROM etapas WHERE id_proyecto = $1',
    [proyectoId]
  );
  const nombresEtapas = new Set(etapasExistentes.map(e => normalizarTexto(e.nombre)));

  // Cargar acciones existentes del proyecto
  const { rows: accionesExistentes } = await pool.query(
    'SELECT id, nombre, id_etapa, id_accion_padre FROM acciones WHERE id_proyecto = $1',
    [proyectoId]
  );

  for (const ent of entidades) {
    if (ent.nivel === 'etapa') {
      if (nombresEtapas.has(normalizarTexto(ent.nombre))) {
        duplicados.push({
          fila: ent.filaOrigen,
          nivel: 'etapa',
          nombre: ent.nombre,
          mensaje: `Etapa "${ent.nombre}" ya existe en el proyecto.`,
        });
      }
    }

    // Chequear hijos pivotados o jerárquicos
    for (const hijo of ent.hijos || []) {
      if (hijo.nivel === 'accion') {
        // Para acciones del pivot, chequear si ya existe una con el mismo nombre
        // bajo alguna etapa del proyecto
        const existe = accionesExistentes.some(a =>
          normalizarTexto(a.nombre) === normalizarTexto(hijo.nombre) && !a.id_accion_padre
        );
        if (existe) {
          duplicados.push({
            fila: hijo.filaOrigen,
            nivel: 'accion',
            nombre: hijo.nombre,
            mensaje: `Acción "${hijo.nombre}" ya existe en el proyecto.`,
          });
        }
      }
    }
  }

  return duplicados;
}

// ─── Preview (no toca BD) ──────────────────────────────────────

async function generarPreview(dataRows, config, headers, proyectoId) {
  const { entidades, errores, warnings } = transformarFilas(dataRows, config, headers);
  const duplicados = await detectarDuplicados(entidades, proyectoId, config.parentEntityId);

  // Contar entidades
  let totalEtapas = 0;
  let totalAcciones = 0;
  let totalSubacciones = 0;

  function contarRecursivo(ents) {
    for (const e of ents) {
      if (e.nivel === 'etapa') totalEtapas++;
      else if (e.nivel === 'accion') totalAcciones++;
      else if (e.nivel === 'subaccion') totalSubacciones++;
      if (e.hijos) contarRecursivo(e.hijos);
    }
  }
  contarRecursivo(entidades);

  return {
    entidades,
    conteo: { etapas: totalEtapas, acciones: totalAcciones, subacciones: totalSubacciones },
    errores,
    warnings,
    duplicados,
  };
}

// ─── Confirmar importación (transaccional) ─────────────────────

async function ejecutarImportacion(dataRows, config, headers, proyectoId, skipDuplicados = true) {
  const { entidades, errores, warnings } = transformarFilas(dataRows, config, headers);

  if (errores.length > 0) {
    throw new Error(`Hay ${errores.length} error(es) que impiden la importación. Use preview primero.`);
  }

  const duplicados = await detectarDuplicados(entidades, proyectoId, config.parentEntityId);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Obtener max orden existente para etapas
    const maxOrden = await client.query(
      'SELECT COALESCE(MAX(orden), 0) AS max_orden FROM etapas WHERE id_proyecto = $1',
      [proyectoId]
    );
    let ordenEtapa = maxOrden.rows[0].max_orden;

    const resultado = {
      etapas_creadas: 0,
      acciones_creadas: 0,
      subacciones_creadas: 0,
      duplicados_saltados: 0,
    };

    const dupSet = new Set(duplicados.map(d => `${d.nivel}:${normalizarTexto(d.nombre)}`));

    // Resolver parentEntityId si rowLevel no es etapa
    let parentEtapaId = null;
    let parentAccionId = null;
    const rowLevel = (config.rowLevel || 'etapa').toLowerCase();

    if (rowLevel === 'accion' && config.parentEntityId) {
      parentEtapaId = config.parentEntityId;
    } else if (rowLevel === 'subaccion' && config.parentEntityId) {
      parentAccionId = config.parentEntityId;
      // Obtener etapa del padre
      const { rows } = await client.query('SELECT id_etapa FROM acciones WHERE id = $1', [config.parentEntityId]);
      if (rows[0]) parentEtapaId = rows[0].id_etapa;
    }

    // Set para trackear IDs de etapas que necesitan recálculo de pesos
    const etapasParaRecalculo = new Set();

    async function insertarEntidad(ent, padreEtapaId, padreAccionId) {
      const key = `${ent.nivel}:${normalizarTexto(ent.nombre)}`;

      if (skipDuplicados && dupSet.has(key)) {
        resultado.duplicados_saltados++;
        return null;
      }

      if (ent.nivel === 'etapa') {
        ordenEtapa++;
        const { rows } = await client.query(`
          INSERT INTO etapas (nombre, descripcion, orden, tipo_meta, id_proyecto,
                              fecha_inicio, fecha_fin, estado)
          VALUES ($1, $2, $3, 'Sin_meta', $4, $5, $6, $7)
          RETURNING id
        `, [
          ent.nombre,
          emptyToNull(ent.campos.descripcion),
          ordenEtapa,
          proyectoId,
          toDate(ent.campos.fecha_inicio),
          toDate(ent.campos.fecha_fin),
          ent.campos.estado || 'Pendiente',
        ]);
        const etapaId = rows[0].id;
        resultado.etapas_creadas++;

        // Insertar hijos (acciones pivotadas o jerárquicas)
        for (const hijo of ent.hijos || []) {
          await insertarEntidad(hijo, etapaId, null);
        }

        etapasParaRecalculo.add(etapaId);
        return etapaId;

      } else if (ent.nivel === 'accion') {
        const etapaId = padreEtapaId || parentEtapaId;
        const fechaInicio = toDate(ent.campos.fecha_inicio);
        const fechaFin = toDate(ent.campos.fecha_fin);

        const { rows } = await client.query(`
          INSERT INTO acciones (
            nombre, descripcion, tipo, fecha_inicio, fecha_fin,
            estado, id_etapa, id_proyecto
          ) VALUES ($1, $2, 'Accion_programada', $3, $4, $5, $6, $7)
          RETURNING id
        `, [
          ent.nombre,
          emptyToNull(ent.campos.descripcion),
          fechaInicio || new Date().toISOString().split('T')[0],
          fechaFin || fechaInicio || new Date().toISOString().split('T')[0],
          ent.campos.estado || 'Pendiente',
          etapaId,
          proyectoId,
        ]);
        const accionId = rows[0].id;
        resultado.acciones_creadas++;

        if (etapaId) etapasParaRecalculo.add(etapaId);

        // Insertar sub-hijos (subacciones)
        for (const hijo of ent.hijos || []) {
          await insertarEntidad(hijo, etapaId, accionId);
        }

        return accionId;

      } else if (ent.nivel === 'subaccion') {
        const etapaId = padreEtapaId || parentEtapaId;
        const accionPadreId = padreAccionId || parentAccionId;
        const fechaInicio = toDate(ent.campos.fecha_inicio);
        const fechaFin = toDate(ent.campos.fecha_fin);

        await client.query(`
          INSERT INTO acciones (
            nombre, descripcion, tipo, fecha_inicio, fecha_fin,
            estado, id_accion_padre, id_etapa, id_proyecto
          ) VALUES ($1, $2, 'Accion_programada', $3, $4, $5, $6, $7, $8)
        `, [
          ent.nombre,
          emptyToNull(ent.campos.descripcion),
          fechaInicio || new Date().toISOString().split('T')[0],
          fechaFin || fechaInicio || new Date().toISOString().split('T')[0],
          ent.campos.estado || 'Pendiente',
          accionPadreId,
          etapaId,
          proyectoId,
        ]);
        resultado.subacciones_creadas++;
        return null;
      }
    }

    // Insertar todas las entidades raíz
    for (const ent of entidades) {
      await insertarEntidad(ent, null, null);
    }

    // Recalcular pesos de todas las etapas afectadas
    for (const etapaId of etapasParaRecalculo) {
      await recalcularPesosEtapa(etapaId, client);
    }

    await client.query('COMMIT');
    return resultado;

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  transformarFilas,
  detectarDuplicados,
  generarPreview,
  ejecutarImportacion,
  normalizarTexto,
  ESTADOS_VALIDOS,
};
