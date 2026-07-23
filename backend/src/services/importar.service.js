/**
 * ARCHIVO: importar.service.js
 * PROPÓSITO: Lógica central de importación universal.
 *
 * Responsabilidades:
 * - Aplicar config (columnMap, parentColumn, valueMap) a filas crudas
 * - Generar jerarquía de entidades (etapas, acciones, subacciones)
 * - Resolución geográfica estricta por clave INEGI
 * - Inserción relacional: evidencias y comentarios
 * - Resolución de padres por nombre de columna
 * - Detectar duplicados contra BD
 * - Ejecutar inserción transaccional (todo o nada)
 * - Preview sin tocar BD
 */
const pool = require('../db/pool');
const { recalcularPesosEtapa } = require('../db/queries/acciones.queries');
const { recalcularEtapa } = require('../utils/recalculos');
const { calcularSemaforo } = require('../utils/semaforo');

const ESTADOS_VALIDOS = ['Pendiente', 'En_proceso', 'Bloqueada', 'Completada', 'Cancelada'];
const SEMAFOROS_VALIDOS = ['verde', 'amarillo', 'naranja', 'rojo', 'gris', 'azul', 'negro'];
// acciones.tipo tiene un CHECK constraint que solo acepta estos dos valores
// (ver migración 001_tablas.sql). Cualquier otro texto libre del Excel del
// usuario (p.ej. "Actividad", "Normal", "Acción") debe traducirse aquí o el
// INSERT truena con "violates check constraint acciones_tipo_check".
const TIPOS_ACCION_VALIDOS = ['Accion_programada', 'Hito'];

// ─── Utilidades ────────────────────────────────────────────────

function emptyToNull(v) {
  if (v === '' || v == null || v === undefined) return null;
  return String(v).trim();
}

function toDate(v) {
  if (!v || String(v).trim() === '') return null;
  const limpio = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(limpio)) return limpio;
  const m = limpio.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const d = new Date(limpio);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  return null;
}

function normalizarTexto(t) {
  return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function mapearValor(valor, campo, valueMap) {
  if (!valueMap || !valueMap[campo]) return valor;
  const mapa = valueMap[campo];
  const normalizado = String(valor || '').trim();
  if (mapa[normalizado] !== undefined) return mapa[normalizado];
  for (const [k, v] of Object.entries(mapa)) {
    if (normalizarTexto(k) === normalizarTexto(normalizado)) return v;
  }
  return normalizado;
}

function toNumber(v) {
  if (v == null || v === '') return null;
  const n = parseFloat(String(v).replace(/[,%]/g, '').trim());
  return isNaN(n) ? null : n;
}

// ─── Resolución geográfica FLEXIBLE (clave INEGI o nombre) ─────

async function resolverGeografiaEstricta(entidades) {
  const geoWarnings = [];

  // Pre-cargar catálogos
  const { rows: estadosRows } = await pool.query('SELECT id, clave, nombre FROM cat_entidades_federativas');
  const estadosPorClave = {};
  const estadosPorNombre = {};
  for (const e of estadosRows) {
    estadosPorClave[e.clave] = e;
    estadosPorNombre[normalizarTexto(e.nombre)] = e;
  }

  const { rows: municipiosRows } = await pool.query('SELECT id, clave, clave_mun, nombre, id_entidad FROM cat_municipios');
  const municipiosPorClave = {};
  const municipiosPorClaveMun = {};
  const municipiosPorNombreEdo = {}; // idEntidad:nombreNorm → municipio
  for (const m of municipiosRows) {
    municipiosPorClave[m.clave] = m;
    municipiosPorClaveMun[`${m.id_entidad}:${m.clave_mun}`] = m;
    const key = `${m.id_entidad}:${normalizarTexto(m.nombre)}`;
    municipiosPorNombreEdo[key] = m;
  }

  function esNumerico(v) {
    return /^\d+$/.test(String(v).trim());
  }

  function resolverEstado(valor) {
    const v = String(valor).trim();
    if (esNumerico(v)) {
      const clave = v.padStart(2, '0');
      return estadosPorClave[clave] || null;
    }
    // Búsqueda por nombre normalizado
    const norm = normalizarTexto(v);
    if (estadosPorNombre[norm]) return estadosPorNombre[norm];
    // Fuzzy: buscar por inclusión parcial
    for (const [key, edo] of Object.entries(estadosPorNombre)) {
      if (key.includes(norm) || norm.includes(key)) return edo;
    }
    return null;
  }

  function resolverMunicipio(valor, estadoId, estadoClave) {
    const v = String(valor).trim();
    if (esNumerico(v)) {
      const claveMun = v.padStart(3, '0');
      const cvegeo = `${estadoClave}${claveMun}`;
      return municipiosPorClave[cvegeo] || municipiosPorClaveMun[`${estadoId}:${claveMun}`] || null;
    }
    // Búsqueda por nombre normalizado dentro del estado
    const norm = normalizarTexto(v);
    const key = `${estadoId}:${norm}`;
    if (municipiosPorNombreEdo[key]) return municipiosPorNombreEdo[key];
    // Fuzzy parcial
    for (const [k, mun] of Object.entries(municipiosPorNombreEdo)) {
      if (!k.startsWith(`${estadoId}:`)) continue;
      const munNorm = k.split(':')[1];
      if (munNorm.includes(norm) || norm.includes(munNorm)) return mun;
    }
    return null;
  }

  function resolverEntidad(ent) {
    const entFed = ent.campos.entidad_federativa;
    const mun = ent.campos.municipio;

    if (!entFed && !mun) {
      for (const hijo of ent.hijos || []) resolverEntidad(hijo);
      return;
    }

    ent.campos._cobertura = [];

    if (entFed) {
      const estado = resolverEstado(entFed);
      if (estado) {
        if (mun) {
          const municipio = resolverMunicipio(mun, estado.id, estado.clave);
          if (municipio) {
            ent.campos._cobertura.push({ id_estado: estado.id, id_municipio: municipio.id });
          } else {
            ent.campos._cobertura.push({ id_estado: estado.id, id_municipio: null });
            geoWarnings.push({
              fila: ent.filaOrigen,
              mensaje: `Municipio "${mun}" no encontrado en ${estado.nombre}`,
            });
          }
        } else {
          ent.campos._cobertura.push({ id_estado: estado.id, id_municipio: null });
        }
      } else {
        geoWarnings.push({
          fila: ent.filaOrigen,
          mensaje: `Entidad federativa "${entFed}" no encontrada en catálogo`,
        });
      }
    }

    // Limpiar campos temporales de geografía
    delete ent.campos.entidad_federativa;
    delete ent.campos.municipio;

    for (const hijo of ent.hijos || []) resolverEntidad(hijo);
  }

  for (const ent of entidades) resolverEntidad(ent);
  return geoWarnings;
}

// ─── Transformar filas crudas a entidades PSPP ─────────────────

function transformarFilas(dataRows, config, headers) {
  const entidades = [];
  const errores = [];
  const warnings = [];

  const { columnMap, valueMap, rowLevel, parentColumn } = config;

  // Mapa inverso: índice de columna → campo PSPP
  const colToField = {};
  if (columnMap) {
    for (const [colIdx, field] of Object.entries(columnMap)) {
      colToField[parseInt(colIdx)] = field;
    }
  }

  const nivelBase = (rowLevel || 'etapa').toLowerCase();

  for (let i = 0; i < dataRows.length; i++) {
    const fila = dataRows[i];
    const filaNum = i + 1;

    if (!fila || fila.every(c => !c || String(c).trim() === '')) continue;

    // Extraer campos planos de la fila según columnMap
    const campos = {};
    for (const [colIdx, field] of Object.entries(colToField)) {
      const idx = parseInt(colIdx);
      let valor = idx < fila.length ? fila[idx] : '';
      if (valueMap && valueMap[field]) {
        valor = mapearValor(valor, field, valueMap);
      }
      campos[field] = emptyToNull(valor);
    }

    // Extraer parentName si hay parentColumn configurada
    let parentName = null;
    if (parentColumn != null) {
      parentName = emptyToNull(parentColumn < fila.length ? fila[parentColumn] : '');
    }

    // Validar estado
    if (campos.estado && !ESTADOS_VALIDOS.includes(campos.estado)) {
      warnings.push({
        fila: filaNum,
        mensaje: `Estado "${campos.estado}" no es válido (${ESTADOS_VALIDOS.join(', ')}). Se usará "Pendiente".`,
      });
      campos.estado = 'Pendiente';
    }

    // Validar semáforo explícito
    if (campos.semaforo_explicito) {
      const semNorm = String(campos.semaforo_explicito).toLowerCase().trim();
      if (SEMAFOROS_VALIDOS.includes(semNorm)) {
        campos._semaforo = semNorm;
      } else {
        // Intentar calcular desde el valor textual
        const calculado = calcularSemaforo({
          semaforoExplicito: campos.semaforo_explicito,
          estado: campos.estado,
          porcentaje: campos.porcentaje_avance,
        });
        if (calculado) campos._semaforo = calculado;
      }
      delete campos.semaforo_explicito;
    } else if (campos.estado || campos.porcentaje_avance) {
      const calculado = calcularSemaforo({
        estado: campos.estado,
        porcentaje: campos.porcentaje_avance,
      });
      if (calculado) campos._semaforo = calculado;
    }

    // Procesar porcentaje_avance
    if (campos.porcentaje_avance) {
      const num = toNumber(campos.porcentaje_avance);
      campos.porcentaje_avance = num != null ? Math.min(100, Math.max(0, num)) : null;
    }

    // Procesar campos extra (_extra:clave → _campos_extra.clave)
    const camposExtra = {};
    for (const [k, v] of Object.entries(campos)) {
      if (k.startsWith('_extra:') && v != null) {
        camposExtra[k.replace('_extra:', '')] = v;
        delete campos[k];
      }
    }
    if (Object.keys(camposExtra).length > 0) campos._campos_extra = camposExtra;

    // Extraer campos relacionales (se procesan al insertar)
    const evidenciaLink = campos.evidencia_link || null;
    const comentario = campos.comentario || null;
    delete campos.evidencia_link;
    delete campos.comentario;

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

    // Derivar estado desde porcentaje si no hay estado explícito
    if (campos.porcentaje_avance != null && !campos.estado) {
      const pct = campos.porcentaje_avance;
      if (pct >= 100) campos.estado = 'Completada';
      else if (pct > 0) campos.estado = 'En_proceso';
    }

    const nombre = campos.nombre || `Fila ${filaNum}`;
    const entidad = {
      nivel: nivelBase,
      nombre,
      campos,
      parentName,
      evidenciaLink,
      comentario,
      hijos: [],
      filaOrigen: filaNum,
      warnings: [],
    };

    if (!nombre || nombre === `Fila ${filaNum}`) {
      entidad.warnings.push('Sin nombre detectado');
    }

    entidades.push(entidad);
  }

  return { entidades, errores, warnings };
}

// ─── Detección de duplicados ───────────────────────────────────

async function detectarDuplicados(entidades, proyectoId) {
  const duplicados = [];

  const { rows: etapasExistentes } = await pool.query(
    'SELECT id, nombre FROM etapas WHERE id_proyecto = $1',
    [proyectoId]
  );
  const nombresEtapas = new Set(etapasExistentes.map(e => normalizarTexto(e.nombre)));

  const { rows: accionesExistentes } = await pool.query(
    'SELECT id, nombre, id_accion_padre FROM acciones WHERE id_proyecto = $1',
    [proyectoId]
  );

  for (const ent of entidades) {
    if (ent.nivel === 'etapa') {
      if (nombresEtapas.has(normalizarTexto(ent.nombre))) {
        duplicados.push({
          fila: ent.filaOrigen,
          nivel: 'etapa',
          nombre: ent.nombre,
          mensaje: `Componente "${ent.nombre}" ya existe en el proyecto.`,
        });
      }
    } else if (ent.nivel === 'accion') {
      const existe = accionesExistentes.some(a =>
        normalizarTexto(a.nombre) === normalizarTexto(ent.nombre) && !a.id_accion_padre
      );
      if (existe) {
        duplicados.push({
          fila: ent.filaOrigen,
          nivel: 'accion',
          nombre: ent.nombre,
          mensaje: `Acción "${ent.nombre}" ya existe en el proyecto.`,
        });
      }
    } else if (ent.nivel === 'subaccion') {
      const existe = accionesExistentes.some(a =>
        normalizarTexto(a.nombre) === normalizarTexto(ent.nombre) && a.id_accion_padre
      );
      if (existe) {
        duplicados.push({
          fila: ent.filaOrigen,
          nivel: 'subaccion',
          nombre: ent.nombre,
          mensaje: `Tarea "${ent.nombre}" ya existe en el proyecto.`,
        });
      }
    }
  }

  return duplicados;
}

// ─── Preview (no toca BD) ──────────────────────────────────────

async function generarPreview(dataRows, config, headers, proyectoId) {
  const { entidades, errores, warnings } = transformarFilas(dataRows, config, headers);
  const duplicados = await detectarDuplicados(entidades, proyectoId);

  // Resolver geografía estricta si hay campos mapeados
  const tieneGeo = Object.values(config.columnMap || {}).some(f =>
    f === 'entidad_federativa' || f === 'municipio'
  );
  let geoWarnings = [];
  if (tieneGeo) {
    geoWarnings = await resolverGeografiaEstricta(entidades);
  }

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
    warnings: [...warnings, ...geoWarnings],
    duplicados,
  };
}

// ─── Confirmar importación (transaccional) ─────────────────────

async function ejecutarImportacion(dataRows, config, headers, proyectoId, skipDuplicados = true) {
  const { entidades, errores } = transformarFilas(dataRows, config, headers);

  if (errores.length > 0) {
    throw new Error(`Hay ${errores.length} error(es) que impiden la importación. Use preview primero.`);
  }

  // Resolver geografía estricta antes de insertar
  const tieneGeo = Object.values(config.columnMap || {}).some(f =>
    f === 'entidad_federativa' || f === 'municipio'
  );
  if (tieneGeo) {
    await resolverGeografiaEstricta(entidades);
  }

  const duplicados = await detectarDuplicados(entidades, proyectoId);

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
      evidencias_creadas: 0,
      comentarios_creados: 0,
      duplicados_saltados: 0,
    };

    const dupSet = new Set(duplicados.map(d => `${d.nivel}:${normalizarTexto(d.nombre)}`));
    const rowLevel = (config.rowLevel || 'etapa').toLowerCase();

    // Pre-cargar etapas y acciones existentes para resolver padres por nombre
    const { rows: etapasExistentes } = await client.query(
      'SELECT id, nombre FROM etapas WHERE id_proyecto = $1',
      [proyectoId]
    );
    const etapaPorNombre = {};
    for (const e of etapasExistentes) etapaPorNombre[normalizarTexto(e.nombre)] = e.id;

    const { rows: accionesExistentes } = await client.query(
      'SELECT id, nombre FROM acciones WHERE id_proyecto = $1 AND id_accion_padre IS NULL',
      [proyectoId]
    );
    const accionPorNombre = {};
    for (const a of accionesExistentes) accionPorNombre[normalizarTexto(a.nombre)] = a.id;

    // Set para trackear IDs de etapas que necesitan recálculo de pesos
    const etapasParaRecalculo = new Set();

    // userId para evidencias y comentarios (usamos null si no disponible)
    // Note: req.usuario.id would be ideal but service doesn't have access;
    // the controller should pass it. For now, we use a project creator fallback.
    const { rows: proyectoRows } = await client.query(
      'SELECT id_creador FROM proyectos WHERE id = $1', [proyectoId]
    );
    const userId = proyectoRows[0]?.id_creador || null;

    // ─── Helper: insertar evidencia relacional ─────────────
    async function insertarEvidencia(entidadId, link) {
      if (!link) return;
      const linkStr = String(link).trim();
      if (!linkStr) return;
      await client.query(`
        INSERT INTO evidencias (nombre_archivo, nombre_original, ruta_minio, tipo_archivo, categoria, id_accion, id_autor)
        VALUES ($1, $2, $3, 'link', 'Otro', $4, $5)
      `, [linkStr, linkStr, linkStr, entidadId, userId]);
      resultado.evidencias_creadas++;
    }

    // ─── Helper: insertar comentario relacional ────────────
    async function insertarComentario(entidadTipo, entidadId, contenido) {
      if (!contenido) return;
      const contenidoStr = String(contenido).trim();
      if (!contenidoStr) return;
      await client.query(`
        INSERT INTO comentarios (entidad_tipo, entidad_id, contenido, id_autor)
        VALUES ($1, $2, $3, $4)
      `, [entidadTipo, entidadId, contenidoStr, userId]);
      resultado.comentarios_creados++;
    }

    // ─── Insertar entidad según nivel ──────────────────────
    for (const ent of entidades) {
      const key = `${ent.nivel}:${normalizarTexto(ent.nombre)}`;
      if (skipDuplicados && dupSet.has(key)) {
        resultado.duplicados_saltados++;
        continue;
      }

      if (ent.nivel === 'etapa') {
        ordenEtapa++;
        const porcentaje = ent.campos.porcentaje_avance != null
          ? ent.campos.porcentaje_avance : 0;

        const { rows } = await client.query(`
          INSERT INTO etapas (nombre, descripcion, orden, tipo_meta, id_proyecto,
                              fecha_inicio, fecha_fin, estado, semaforo, porcentaje_calculado, campos_extra)
          VALUES ($1, $2, $3, 'Sin_meta', $4, $5, $6, $7, $8, $9, $10)
          RETURNING id
        `, [
          ent.nombre,
          emptyToNull(ent.campos.descripcion),
          ordenEtapa,
          proyectoId,
          ent.campos.fecha_inicio || null,
          ent.campos.fecha_fin || null,
          ent.campos.estado || 'Pendiente',
          ent.campos._semaforo || null,
          porcentaje,
          JSON.stringify(ent.campos._campos_extra || {}),
        ]);
        const etapaId = rows[0].id;
        resultado.etapas_creadas++;

        // Register for parent resolution
        etapaPorNombre[normalizarTexto(ent.nombre)] = etapaId;

        // Cobertura geográfica
        if (ent.campos._cobertura) {
          for (const cob of ent.campos._cobertura) {
            await client.query(
              `INSERT INTO cobertura_geografica (tipo_entidad, id_entidad, id_estado, id_municipio)
               VALUES ('etapa', $1, $2, $3) ON CONFLICT DO NOTHING`,
              [etapaId, cob.id_estado, cob.id_municipio || null]
            );
          }
        }

        // Comentario relacional
        if (ent.comentario) {
          await insertarComentario('Etapa', etapaId, ent.comentario);
        }

        etapasParaRecalculo.add(etapaId);

      } else if (ent.nivel === 'accion') {
        // Resolver padre (componente) por nombre
        let etapaId = null;
        if (ent.parentName) {
          etapaId = etapaPorNombre[normalizarTexto(ent.parentName)] || null;
          // Si no existe, crear componente padre automáticamente
          if (!etapaId) {
            ordenEtapa++;
            const { rows: newEtapa } = await client.query(`
              INSERT INTO etapas (nombre, orden, tipo_meta, id_proyecto, estado)
              VALUES ($1, $2, 'Sin_meta', $3, 'Pendiente')
              RETURNING id
            `, [ent.parentName, ordenEtapa, proyectoId]);
            etapaId = newEtapa[0].id;
            etapaPorNombre[normalizarTexto(ent.parentName)] = etapaId;
            resultado.etapas_creadas++;
            etapasParaRecalculo.add(etapaId);
          }
        }

        const fechaInicio = ent.campos.fecha_inicio;
        const fechaFin = ent.campos.fecha_fin;

        const { rows } = await client.query(`
          INSERT INTO acciones (
            nombre, descripcion, tipo, fecha_inicio, fecha_fin,
            estado, porcentaje_avance, id_etapa, id_proyecto, semaforo, campos_extra
          ) VALUES ($1, $2, 'Accion_programada', $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING id
        `, [
          ent.nombre,
          emptyToNull(ent.campos.descripcion),
          fechaInicio || new Date().toISOString().split('T')[0],
          fechaFin || fechaInicio || new Date().toISOString().split('T')[0],
          ent.campos.estado || 'Pendiente',
          ent.campos.porcentaje_avance || 0,
          etapaId,
          proyectoId,
          ent.campos._semaforo || null,
          JSON.stringify(ent.campos._campos_extra || {}),
        ]);
        const accionId = rows[0].id;
        resultado.acciones_creadas++;

        // Register for parent resolution (tareas)
        accionPorNombre[normalizarTexto(ent.nombre)] = accionId;

        // Cobertura geográfica
        if (ent.campos._cobertura) {
          for (const cob of ent.campos._cobertura) {
            await client.query(
              `INSERT INTO cobertura_geografica (tipo_entidad, id_entidad, id_estado, id_municipio)
               VALUES ('accion', $1, $2, $3) ON CONFLICT DO NOTHING`,
              [accionId, cob.id_estado, cob.id_municipio || null]
            );
          }
        }

        // Evidencia relacional
        if (ent.evidenciaLink) {
          await insertarEvidencia(accionId, ent.evidenciaLink);
        }

        // Comentario relacional
        if (ent.comentario) {
          await insertarComentario('Accion', accionId, ent.comentario);
        }

        if (etapaId) etapasParaRecalculo.add(etapaId);

      } else if (ent.nivel === 'subaccion') {
        // Resolver padre (acción) por nombre
        let accionPadreId = null;
        let etapaId = null;
        if (ent.parentName) {
          accionPadreId = accionPorNombre[normalizarTexto(ent.parentName)] || null;
          if (accionPadreId) {
            // Obtener etapa de la acción padre
            const { rows: padreRows } = await client.query(
              'SELECT id_etapa FROM acciones WHERE id = $1', [accionPadreId]
            );
            etapaId = padreRows[0]?.id_etapa || null;
          }
          // Si no existe la acción padre, crear automáticamente
          if (!accionPadreId) {
            // Necesitamos una etapa; usar o crear una por defecto
            let etapaDefault = etapaPorNombre[normalizarTexto('General')] || null;
            if (!etapaDefault) {
              ordenEtapa++;
              const { rows: newE } = await client.query(`
                INSERT INTO etapas (nombre, orden, tipo_meta, id_proyecto, estado)
                VALUES ('General', $1, 'Sin_meta', $2, 'Pendiente')
                RETURNING id
              `, [ordenEtapa, proyectoId]);
              etapaDefault = newE[0].id;
              etapaPorNombre[normalizarTexto('General')] = etapaDefault;
              resultado.etapas_creadas++;
              etapasParaRecalculo.add(etapaDefault);
            }
            etapaId = etapaDefault;
            const { rows: newA } = await client.query(`
              INSERT INTO acciones (nombre, tipo, fecha_inicio, fecha_fin, estado, id_etapa, id_proyecto)
              VALUES ($1, 'Accion_programada', $2, $3, 'Pendiente', $4, $5)
              RETURNING id
            `, [ent.parentName, new Date().toISOString().split('T')[0], new Date().toISOString().split('T')[0], etapaId, proyectoId]);
            accionPadreId = newA[0].id;
            accionPorNombre[normalizarTexto(ent.parentName)] = accionPadreId;
            resultado.acciones_creadas++;
          }
        }

        const fechaInicio = ent.campos.fecha_inicio;
        const fechaFin = ent.campos.fecha_fin;

        const { rows } = await client.query(`
          INSERT INTO acciones (
            nombre, descripcion, tipo, fecha_inicio, fecha_fin,
            estado, porcentaje_avance, id_accion_padre, id_etapa, id_proyecto, semaforo, campos_extra
          ) VALUES ($1, $2, 'Accion_programada', $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING id
        `, [
          ent.nombre,
          emptyToNull(ent.campos.descripcion),
          fechaInicio || new Date().toISOString().split('T')[0],
          fechaFin || fechaInicio || new Date().toISOString().split('T')[0],
          ent.campos.estado || 'Pendiente',
          ent.campos.porcentaje_avance || 0,
          accionPadreId,
          etapaId,
          proyectoId,
          ent.campos._semaforo || null,
          JSON.stringify(ent.campos._campos_extra || {}),
        ]);
        const subaccionId = rows[0].id;
        resultado.subacciones_creadas++;

        // Evidencia relacional
        if (ent.evidenciaLink) {
          await insertarEvidencia(subaccionId, ent.evidenciaLink);
        }

        // Comentario relacional
        if (ent.comentario) {
          await insertarComentario('Accion', subaccionId, ent.comentario);
        }
      }
    }

    // Recalcular pesos y progreso de todas las etapas afectadas
    for (const etapaId of etapasParaRecalculo) {
      await recalcularPesosEtapa(etapaId, client);
      await recalcularEtapa(etapaId, client);
    }

    // Recalcular indicadores auto-calculados del proyecto
    const { recalcularIndicadoresProyecto } = require('../db/queries/indicadores.queries');
    await recalcularIndicadoresProyecto(proyectoId, client);

    await client.query('COMMIT');
    return resultado;

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Multi-hoja: importación formato universal ──────────────

// Traducción de estatus UI → estatus interno BD
const TRADUCCION_ESTATUS = {
  'no iniciado':          'Pendiente',
  'pendiente':            'Pendiente',
  'sin iniciar':          'Pendiente',
  'en proceso':           'En_proceso',
  'en progreso':          'En_proceso',
  'en curso':             'En_proceso',
  'en espera':            'Bloqueada',
  'bloqueado':            'Bloqueada',
  'bloqueada':            'Bloqueada',
  'en espera/bloqueado':  'Bloqueada',
  'concluido':            'Completada',
  'concluida':            'Completada',
  'completado':           'Completada',
  'completada':           'Completada',
  'terminado':            'Completada',
  'terminada':            'Completada',
  'finalizado':           'Completada',
  'no aplica':            'Cancelada',
  'cancelado':            'Cancelada',
  'cancelada':            'Cancelada',
};

function traducirEstatus(valor) {
  if (!valor) return { estado: 'Pendiente', warning: null };
  const limpio = String(valor).trim();
  if (ESTADOS_VALIDOS.includes(limpio)) return { estado: limpio, warning: null };
  const norm = normalizarTexto(limpio);
  const traducido = TRADUCCION_ESTATUS[norm];
  if (traducido) return { estado: traducido, warning: null };
  return { estado: 'Pendiente', warning: `Estatus no reconocido: "${limpio}" → se usará "Pendiente"` };
}

// Variantes comunes que un usuario podría escribir para "Hito" — cualquier
// otra cosa (incluyendo vacío) cae a 'Accion_programada', el valor por defecto.
const TRADUCCION_TIPO_HITO = ['hito', 'milestone', 'entregable'];

function traducirTipoAccion(valor) {
  if (!valor) return 'Accion_programada';
  const limpio = String(valor).trim();
  if (TIPOS_ACCION_VALIDOS.includes(limpio)) return limpio;
  const norm = normalizarTexto(limpio);
  return TRADUCCION_TIPO_HITO.includes(norm) ? 'Hito' : 'Accion_programada';
}

/**
 * Trunca un string para que quepa en un varchar(n).
 */
function truncar(valor, maxLen) {
  if (!valor) return valor;
  return String(valor).length > maxLen ? String(valor).substring(0, maxLen) : valor;
}

/**
 * Extrae un valor de una fila usando el mapeo.
 * mapeo es { propKey: colIndex }
 */
function valorMapeado(fila, mapeo, propKey) {
  const idx = mapeo[propKey];
  if (idx === undefined || idx === -1 || idx >= fila.length) return null;
  const v = fila[idx];
  return v != null ? String(v).trim() : null;
}

/**
 * Genera preview para formato multi-hoja con mapeo completo.
 */
async function generarPreviewMultiHoja(hojas, configMultiHoja, proyectoId) {
  const hojasConfig = configMultiHoja.hojas;
  const arbol = [];
  const warnings = [];

  // Compatibilidad: usar mapeo si existe, sino caer a idCol/nombreCol/refCol
  function getMapeo(hCfg) {
    if (hCfg.mapeo) return hCfg.mapeo;
    const m = {};
    if (hCfg.idCol !== undefined && hCfg.idCol !== -1) m.id_enlace = hCfg.idCol;
    if (hCfg.nombreCol !== undefined && hCfg.nombreCol !== -1) m.nombre = hCfg.nombreCol;
    if (hCfg.refCol !== undefined && hCfg.refCol !== -1) m.id_padre = hCfg.refCol;
    return m;
  }

  // Hoja 1: Etapas / Contenedores
  const h1 = hojasConfig[0];
  const m1 = getMapeo(h1);
  const datosEtapas = hojas[h1.indice];
  const etapasMap = {};

  for (let i = 0; i < datosEtapas.filas.length; i++) {
    const fila = datosEtapas.filas[i];
    const id = valorMapeado(fila, m1, 'id_enlace') || '';
    const nombre = valorMapeado(fila, m1, 'nombre') || `Etapa ${i + 1}`;
    if (!id) { warnings.push({ hoja: h1.nombre, fila: i + 2, mensaje: 'Fila sin ID, se omitirá.' }); continue; }

    const estatusRaw = valorMapeado(fila, m1, 'estatus');
    const { estado, warning: wEst } = traducirEstatus(estatusRaw);
    if (wEst) warnings.push({ hoja: h1.nombre, fila: i + 2, mensaje: wEst });

    etapasMap[id] = { nombre, fila, acciones: [] };
    arbol.push({
      id, nombre, nivel: 'etapa', acciones: [],
      estatus: estado,
      prioridad: valorMapeado(fila, m1, 'prioridad'),
      categoria: valorMapeado(fila, m1, 'categoria'),
    });
  }

  // Hoja 2: Acciones / Ítems
  if (hojasConfig.length >= 2) {
    const h2 = hojasConfig[1];
    const m2 = getMapeo(h2);
    const datosAcciones = hojas[h2.indice];
    const accionesMap = {};

    for (let i = 0; i < datosAcciones.filas.length; i++) {
      const fila = datosAcciones.filas[i];
      const id = valorMapeado(fila, m2, 'id_enlace') || `acc_${i}`;
      const ref = valorMapeado(fila, m2, 'id_padre') || '';
      const nombre = valorMapeado(fila, m2, 'nombre') || `Acción ${i + 1}`;

      if (!ref || !etapasMap[ref]) {
        warnings.push({ hoja: h2.nombre, fila: i + 2, mensaje: `Referencia "${ref}" no encontrada en etapas.` });
        continue;
      }

      const estatusRaw = valorMapeado(fila, m2, 'estatus');
      const { estado, warning: wEst } = traducirEstatus(estatusRaw);
      if (wEst) warnings.push({ hoja: h2.nombre, fila: i + 2, mensaje: wEst });

      const nodoAcc = { id, nombre, nivel: 'accion', tareas: [], estatus: estado };
      accionesMap[id] = { nombre, ref, fila, tareas: [] };
      const nodoEtapa = arbol.find(e => e.id === ref);
      if (nodoEtapa) nodoEtapa.acciones.push(nodoAcc);
    }

    // Hoja 3: Tareas / Sub-ítems (opcional)
    if (hojasConfig.length >= 3) {
      const h3 = hojasConfig[2];
      const m3 = getMapeo(h3);
      const datosTareas = hojas[h3.indice];

      for (let i = 0; i < datosTareas.filas.length; i++) {
        const fila = datosTareas.filas[i];
        const ref = valorMapeado(fila, m3, 'id_padre') || '';
        const nombre = valorMapeado(fila, m3, 'nombre') || `Tarea ${i + 1}`;

        if (!ref || !accionesMap[ref]) {
          warnings.push({ hoja: h3.nombre, fila: i + 2, mensaje: `Referencia "${ref}" no encontrada en acciones.` });
          continue;
        }
        accionesMap[ref].tareas.push({ nombre, nivel: 'subaccion' });
        // Actualizar árbol
        for (const etapa of arbol) {
          const acc = etapa.acciones.find(a => a.id === ref);
          if (acc) { acc.tareas.push({ nombre, nivel: 'subaccion' }); break; }
        }
      }
    }

    // Calcular conteo de tareas
    var totalTareas = 0;
    for (const e of arbol) for (const a of e.acciones) totalTareas += (a.tareas?.length || 0);

    return {
      arbol,
      conteo: {
        etapas: Object.keys(etapasMap).length,
        acciones: Object.keys(accionesMap).length,
        subacciones: totalTareas,
      },
      warnings,
    };
  }

  // Solo 1 hoja
  return { arbol, conteo: { etapas: Object.keys(etapasMap).length, acciones: 0, subacciones: 0 }, warnings };
}

/**
 * Ejecuta importación transaccional para formato multi-hoja con mapeo completo.
 */
async function ejecutarImportacionMultiHoja(hojas, configMultiHoja, proyectoId) {
  const hojasConfig = configMultiHoja.hojas;

  function getMapeo(hCfg) {
    if (hCfg.mapeo) return hCfg.mapeo;
    const m = {};
    if (hCfg.idCol !== undefined && hCfg.idCol !== -1) m.id_enlace = hCfg.idCol;
    if (hCfg.nombreCol !== undefined && hCfg.nombreCol !== -1) m.nombre = hCfg.nombreCol;
    if (hCfg.refCol !== undefined && hCfg.refCol !== -1) m.id_padre = hCfg.refCol;
    return m;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const resultado = { etapas_creadas: 0, acciones_creadas: 0, subacciones_creadas: 0 };

    const { rows: [{ max_orden }] } = await client.query(
      'SELECT COALESCE(MAX(orden), 0) AS max_orden FROM etapas WHERE id_proyecto = $1', [proyectoId]
    );
    let ordenEtapa = max_orden;

    const etapaIdMap = {};
    const accionIdMap = {};
    const etapasParaRecalculo = new Set();

    // ─── Hoja 1: Etapas / Contenedores ──────────────
    const h1 = hojasConfig[0];
    const m1 = getMapeo(h1);
    const datosEtapas = hojas[h1.indice];

    for (let i = 0; i < datosEtapas.filas.length; i++) {
      const fila = datosEtapas.filas[i];
      const idLocal = valorMapeado(fila, m1, 'id_enlace') || '';
      if (!idLocal) continue;

      const nombre = valorMapeado(fila, m1, 'nombre') || `Etapa ${i + 1}`;
      const descripcion = emptyToNull(valorMapeado(fila, m1, 'descripcion'));
      const fechaInicio = toDate(valorMapeado(fila, m1, 'fecha_inicio'));
      const fechaFin = toDate(valorMapeado(fila, m1, 'fecha_final'));
      const { estado } = traducirEstatus(valorMapeado(fila, m1, 'estatus'));
      const prioridad = truncar(emptyToNull(valorMapeado(fila, m1, 'prioridad')), 50);
      const categoria = emptyToNull(valorMapeado(fila, m1, 'categoria'));
      const instrumento = emptyToNull(valorMapeado(fila, m1, 'instrumento'));
      const escalaTerritorial = emptyToNull(valorMapeado(fila, m1, 'escala_territorial'));
      const enlaceResponsable = emptyToNull(valorMapeado(fila, m1, 'enlace_responsable'));
      const observaciones = emptyToNull(valorMapeado(fila, m1, 'comentarios'));

      ordenEtapa++;
      const { rows } = await client.query(`
        INSERT INTO etapas (nombre, descripcion, orden, tipo_meta, id_proyecto,
          fecha_inicio, fecha_fin, estado, prioridad, enlace_responsable, observaciones)
        VALUES ($1, $2, $3, 'Sin_meta', $4, $5, $6, $7, $8, $9, $10)
        RETURNING id
      `, [nombre, descripcion, ordenEtapa, proyectoId, fechaInicio, fechaFin, estado,
          prioridad, enlaceResponsable, observaciones]);

      etapaIdMap[idLocal] = rows[0].id;
      etapasParaRecalculo.add(rows[0].id);
      resultado.etapas_creadas++;
    }

    // ─── Hoja 2: Acciones / Ítems ───────────────────
    if (hojasConfig.length >= 2) {
      const h2 = hojasConfig[1];
      const m2 = getMapeo(h2);
      const datosAcciones = hojas[h2.indice];

      for (let i = 0; i < datosAcciones.filas.length; i++) {
        const fila = datosAcciones.filas[i];
        const idLocal = valorMapeado(fila, m2, 'id_enlace') || `acc_${i}`;
        const refEtapa = valorMapeado(fila, m2, 'id_padre') || '';
        const etapaBdId = etapaIdMap[refEtapa];
        if (!etapaBdId) continue;

        const nombre = valorMapeado(fila, m2, 'nombre') || `Acción ${i + 1}`;
        const descripcion = emptyToNull(valorMapeado(fila, m2, 'descripcion'));
        const { estado } = traducirEstatus(valorMapeado(fila, m2, 'estatus'));
        const prioridad = truncar(emptyToNull(valorMapeado(fila, m2, 'prioridad')), 50);
        const tipo = traducirTipoAccion(valorMapeado(fila, m2, 'tipo'));
        const responsable = emptyToNull(valorMapeado(fila, m2, 'responsable'));
        const fechaInicio = toDate(valorMapeado(fila, m2, 'fecha_inicio')) || new Date().toISOString().split('T')[0];
        const fechaFin = toDate(valorMapeado(fila, m2, 'fecha_limite')) || fechaInicio;
        const enlaceResponsable = emptyToNull(valorMapeado(fila, m2, 'enlace_responsable'));
        const observaciones = emptyToNull(valorMapeado(fila, m2, 'riesgos'));

        const { rows } = await client.query(`
          INSERT INTO acciones (nombre, descripcion, tipo, fecha_inicio, fecha_fin, estado,
            porcentaje_avance, id_etapa, id_proyecto, prioridad, enlace_responsable, observaciones)
          VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $8, $9, $10, $11)
          RETURNING id
        `, [nombre, descripcion, tipo, fechaInicio, fechaFin, estado,
            etapaBdId, proyectoId, prioridad, enlaceResponsable, observaciones]);

        accionIdMap[idLocal] = rows[0].id;
        etapasParaRecalculo.add(etapaBdId);
        resultado.acciones_creadas++;
      }
    }

    // ─── Hoja 3: Tareas / Sub-ítems (opcional) ──────
    if (hojasConfig.length >= 3) {
      const h3 = hojasConfig[2];
      const m3 = getMapeo(h3);
      const datosTareas = hojas[h3.indice];

      for (let i = 0; i < datosTareas.filas.length; i++) {
        const fila = datosTareas.filas[i];
        const refAccion = valorMapeado(fila, m3, 'id_padre') || '';
        const accionBdId = accionIdMap[refAccion];
        if (!accionBdId) continue;

        const nombre = valorMapeado(fila, m3, 'nombre') || `Tarea ${i + 1}`;
        const descripcion = emptyToNull(valorMapeado(fila, m3, 'descripcion'));
        const { estado } = traducirEstatus(valorMapeado(fila, m3, 'estatus'));
        const prioridad = truncar(emptyToNull(valorMapeado(fila, m3, 'prioridad')), 50);
        const fechaInicio = toDate(valorMapeado(fila, m3, 'fecha_inicio')) || new Date().toISOString().split('T')[0];
        const fechaFin = toDate(valorMapeado(fila, m3, 'fecha_limite')) || fechaInicio;

        const { rows: padreRows } = await client.query('SELECT id_etapa FROM acciones WHERE id = $1', [accionBdId]);
        const etapaId = padreRows[0]?.id_etapa || null;

        await client.query(`
          INSERT INTO acciones (nombre, descripcion, tipo, fecha_inicio, fecha_fin, estado,
            porcentaje_avance, id_accion_padre, id_etapa, id_proyecto, prioridad)
          VALUES ($1, $2, 'Accion_programada', $3, $4, $5, 0, $6, $7, $8, $9)
        `, [nombre, descripcion, fechaInicio, fechaFin, estado, accionBdId, etapaId, proyectoId, prioridad]);

        resultado.subacciones_creadas++;
      }
    }

    // Recalcular
    for (const etapaId of etapasParaRecalculo) {
      await recalcularPesosEtapa(etapaId, client);
      await recalcularEtapa(etapaId, client);
    }

    const { recalcularIndicadoresProyecto } = require('../db/queries/indicadores.queries');
    await recalcularIndicadoresProyecto(proyectoId, client);

    await client.query('COMMIT');
    return resultado;

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Extrae campos de una fila basándose en los headers, excluyendo ciertos campos.
 */
function extraerCamposPorHeader(headers, fila, excluir = []) {
  const campos = {};
  const excluirSet = new Set(excluir.map(e => normalizarTexto(e)));
  for (let i = 0; i < headers.length; i++) {
    const h = normalizarTexto(headers[i]);
    if (excluirSet.has(h) || !h) continue;
    const valor = fila[i] != null ? String(fila[i]).trim() : '';
    if (valor) campos[h] = valor;
  }
  return campos;
}

module.exports = {
  transformarFilas,
  detectarDuplicados,
  generarPreview,
  ejecutarImportacion,
  generarPreviewMultiHoja,
  ejecutarImportacionMultiHoja,
  normalizarTexto,
  ESTADOS_VALIDOS,
};
