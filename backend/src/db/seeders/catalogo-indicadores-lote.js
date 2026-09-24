/**
 * ARCHIVO: catalogo-indicadores-lote.js
 * PROPÓSITO: Sembrar (o simular) un LOTE versionado de entradas del
 *            catálogo de indicadores — el mecanismo que hace posible
 *            importar un Excel institucional nuevo sin duplicar lo ya
 *            cargado y sin chocar con entradas reales de producción.
 *
 * MINI-CLASE: siembra versionada, no de una sola vez
 * ─────────────────────────────────────────────────────────────────
 * asegurarEstructura()/asegurarProgramas() siembran UNA vez para
 * siempre (una sola marca fija en siembra_inicial). Esto es distinto:
 * cada Excel nuevo que llegue de otra dirección general es un LOTE con
 * su propia claveLote, independiente de los anteriores — v1, v2, v3...
 * pueden convivir, cada uno corriendo una sola vez.
 *
 * Antes de insertar cada entrada, verifica colisión de NOMBRE EXACTO
 * contra el catálogo real completo (no solo contra este lote) — así
 * nunca pisa una entrada de un lote previo ni una creada a mano por un
 * usuario. Además reporta (sin bloquear) posibles duplicados NO
 * exactos vía pg_trgm, el mismo mecanismo que ya usa buscarSimilares()
 * en el alta manual — útil para que un admin revise si conviene
 * fusionar después.
 * ─────────────────────────────────────────────────────────────────
 */
const pool = require('../pool');
const { yaSembrado, marcarSembrado } = require('./siembra');
const { generarClave, claveDisponible } = require('../queries/catalogo-indicadores.queries');

/**
 * @param {string} claveLote  Identificador único de este lote (marca en siembra_inicial).
 * @param {Array}  entradas   Objetos { nombre, tipo, unidad, unidad_personalizada,
 *                             etiqueta_unidad, definicion, referencia, instrumento,
 *                             area_sugerida, producto, codigo_linea_accion, activo }.
 * @param {object} opciones
 * @param {boolean} opciones.dryRun  Si es true, corre toda la lógica de
 *   detección (colisiones, posibles duplicados, cuántos se
 *   insertarían) pero NUNCA escribe en la base ni marca el lote como
 *   sembrado — es la pieza que permite, más adelante, un botón "Vista
 *   previa" antes de confirmar un import desde una pantalla de admin.
 */
async function sembrarLoteCatalogoIndicadores(claveLote, entradas, { dryRun = false } = {}) {
  const client = await pool.connect();
  try {
    if (!dryRun && await yaSembrado(client, claveLote)) {
      console.log(`  · Catálogo de indicadores — lote "${claveLote}": ya sembrado, se omite.`);
      return { insertados: 0, colisiones: [], posiblesDuplicados: [], yaSembrado: true };
    }

    await client.query('BEGIN');

    // Marca de corte para "posible duplicado": solo cuenta como señal
    // útil una similitud contra algo que YA existía antes de este lote
    // (otro lote, o una entrada creada a mano). Sin este corte, cada
    // fila nueva se compara también contra sus propias hermanas recién
    // insertadas en esta misma corrida — con ~1400 indicadores del
    // mismo dominio (mismo fraseo "Número de...", "Porcentaje de...")
    // eso dispara cientos de falsos positivos: no es que se parezcan
    // por error, es que el catálogo real así es.
    const { rows: [{ ahora }] } = await client.query('SELECT NOW() AS ahora');

    let insertados = 0;
    const colisiones = [];
    const posiblesDuplicados = [];
    const vistosEnEsteLote = new Set();

    for (const e of entradas) {
      const nombreNorm = (e.nombre || '').trim();
      const claveNorm = nombreNorm.toLowerCase();
      if (!nombreNorm) continue;

      if (vistosEnEsteLote.has(claveNorm)) {
        colisiones.push({ nombre: nombreNorm, motivo: 'duplicado dentro del mismo lote' });
        continue;
      }
      vistosEnEsteLote.add(claveNorm);

      const { rows: [existente] } = await client.query(
        'SELECT id, clave FROM catalogo_indicadores WHERE lower(trim(nombre)) = lower($1)',
        [nombreNorm]
      );
      if (existente) {
        colisiones.push({ nombre: nombreNorm, clave_existente: existente.clave, motivo: 'ya existe (nombre exacto)' });
        continue;
      }

      // No bloquea, solo informa — mismo umbral/mecanismo que ya usa
      // buscarSimilares() en el alta manual, acotado a lo que existía
      // ANTES de este lote (ver comentario de "ahora" arriba).
      const { rows: similares } = await client.query(
        `SELECT clave, nombre, similarity(lower(nombre), lower($1)) AS score
         FROM catalogo_indicadores
         WHERE lower(nombre) % lower($1) AND created_at < $2
         ORDER BY score DESC LIMIT 3`,
        [nombreNorm, ahora]
      );
      if (similares.length > 0) {
        posiblesDuplicados.push({ nombre: nombreNorm, similares });
      }

      if (!dryRun) {
        const clave = await claveDisponible(generarClave(nombreNorm), client);
        await client.query(`
          INSERT INTO catalogo_indicadores
            (clave, nombre, tipo, unidad, unidad_personalizada, etiqueta_unidad,
             definicion, referencia, instrumento, area_sugerida, producto,
             codigo_linea_accion, activo)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        `, [clave, nombreNorm, e.tipo || 'Otro', e.unidad || 'Numero',
            e.unidad_personalizada || null, e.etiqueta_unidad || null,
            e.definicion || null, e.referencia || null,
            e.instrumento || null, e.area_sugerida || null,
            e.producto || null, e.codigo_linea_accion || null,
            e.activo !== false]);
      }
      insertados++;
    }

    if (!dryRun) {
      await marcarSembrado(client, claveLote,
        `Lote "${claveLote}": ${insertados} agregados, ${colisiones.length} colisión(es), ${posiblesDuplicados.length} posible(s) duplicado(s) no exacto(s).`);
      await client.query('COMMIT');
      console.log(`  ✓ Catálogo de indicadores — lote "${claveLote}": ${insertados} agregados de ${entradas.length}.`);
    } else {
      await client.query('ROLLBACK'); // vista previa: nunca persiste nada
      console.log(`  · [dry run] Lote "${claveLote}": se insertarían ${insertados} de ${entradas.length}.`);
    }

    if (colisiones.length > 0) {
      console.warn(`  ⚠ ${colisiones.length} nombre(s) ya existían y NO se crean:`);
      for (const c of colisiones) {
        console.warn(`      - "${c.nombre}"${c.clave_existente ? ` (clave "${c.clave_existente}")` : ''} — ${c.motivo}`);
      }
    }
    if (posiblesDuplicados.length > 0) {
      console.warn(`  ⚠ ${posiblesDuplicados.length} entrada(s) nueva(s) se parecen a una ya existente (revisar si conviene fusionar después):`);
      for (const d of posiblesDuplicados) {
        console.warn(`      - "${d.nombre}" ~ "${d.similares[0].nombre}" (${d.similares[0].clave})`);
      }
    }

    return { insertados, colisiones, posiblesDuplicados };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { sembrarLoteCatalogoIndicadores };
