/**
 * ARCHIVO: 00_estructura.js
 * PROPÓSITO: Asegurar que la estructura organizacional de SEDATU
 *            (subsecretarías, unidades responsables, direcciones
 *            generales y direcciones de área) exista en CUALQUIER
 *            entorno, producción incluida — agregando solo lo que falte.
 *
 * MINI-CLASE: completar un catálogo sin pisar lo que ya está capturado
 * ─────────────────────────────────────────────────────────────────
 * Es el mismo caso que los programas presupuestarios: la estructura del
 * Reglamento Interior (DOF 17/01/2025) vivía únicamente en un seeder
 * (`01_dgs`), y los seeders están apagados en producción porque ahí
 * mismo se siembran usuarios de demo y proyectos inventados. Resultado:
 * el catálogo de DGs y direcciones de área que administra el
 * superadministrador —el que también se usa al dar de alta usuarios—
 * quedó incompleto en el servidor.
 *
 * La diferencia con el seeder es qué se permite hacer con lo que YA
 * existe. `01_dgs` usa ON CONFLICT DO UPDATE: reescribe nombre y
 * adscripción de cada área en cada corrida. Eso está bien en una base
 * desechable y sería destructivo en producción, donde una DG pudo
 * haberse renombrado o recolgado a propósito desde la pantalla de
 * catálogos. Aquí NO se actualiza nada: cada área se inserta solo si no
 * está, y si está se toma su id tal cual para colgarle sus hijas.
 *
 * CÓMO SE DECIDE SI "YA ESTÁ": por siglas —que son UNIQUE en las cuatro
 * tablas— y además por nombre normalizado (minúsculas, sin acentos, sin
 * espacios de más). Lo segundo importa porque un área capturada a mano
 * pudo quedar con otras siglas ("DG OTU" en vez de "DGOTU"); mirar solo
 * las siglas insertaría un duplicado de algo que el usuario ya tiene, y
 * un catálogo con la misma dirección dos veces es peor que uno corto.
 *
 * SIGLAS LEGADAS: una base vieja puede traer la Subsecretaría de
 * Desarrollo Agrario como 'SDA' (y su UR como 'UR_SDA') en vez de los
 * nombres actuales 'SOAIP'/'UR_SOAIP'. Son la misma dependencia con el
 * nombre anterior, así que se reconocen como alias y se reutilizan; no
 * se renombran —eso sería tocar datos existentes— ni se duplican.
 *
 * SE SIEMBRA UNA SOLA VEZ: en cuanto la siembra ocurre queda anotada en
 * `siembra_inicial` (migración 055) y no se repite en los arranques
 * siguientes. Esto es lo que permite que el panel de administración
 * mande: un área que ahí se elimine o se renombre no reaparece ni se
 * revierte al reiniciar el backend. La lista de abajo es el punto de
 * partida de una instalación nueva, no una plantilla que se reimponga.
 * ─────────────────────────────────────────────────────────────────
 */
const pool = require('../pool');
const { yaSembrado, marcarSembrado } = require('./siembra');

const CLAVE_SIEMBRA = 'estructura_sedatu';

// ─── La estructura, conforme al Art. 2 del Reglamento Interior ────
// Es la fuente única: `01_dgs` (el seeder de desarrollo) consume estas
// mismas listas, para que no haya dos versiones que se desincronicen.

const SUBSECRETARIAS = [
  { nombre: 'Subsecretaría de Ordenamiento Territorial, Urbano y Vivienda', siglas: 'SOTUV' },
  // 'SDA' es como se llamaba antes esta subsecretaría en bases viejas.
  { nombre: 'Subsecretaría de Ordenamiento Agrario e Inventarios de la Propiedad', siglas: 'SOAIP', alias: ['SDA'] },
];

// UR_SOTUV y UR_SOAIP cuelgan de su subsecretaría; UAF y UAJ son
// Unidades autónomas, sin subsecretaría padre.
const UNIDADES_RESPONSABLES = [
  { nombre: 'Subsecretaría de OT, Urbano y Vivienda', siglas: 'UR_SOTUV', sub: 'SOTUV' },
  { nombre: 'Subsecretaría de Ordenamiento Agrario e Inventarios', siglas: 'UR_SOAIP', sub: 'SOAIP', alias: ['UR_SDA'] },
  { nombre: 'Unidad de Administración y Finanzas', siglas: 'UAF', sub: null },
  { nombre: 'Unidad de Asuntos Jurídicos', siglas: 'UAJ', sub: null },
];

const DIRECCIONES_GENERALES = [
  // === SOTUV (7 DGs) ===
  { nombre: 'Dirección General de Ordenamiento Territorial y Urbano', siglas: 'DGOTU', ur: 'UR_SOTUV' },
  { nombre: 'Dirección General de Ordenamiento Metropolitano y Regional', siglas: 'DGOMR', ur: 'UR_SOTUV' },
  { nombre: 'Dirección General de Política Territorial y Movilidad', siglas: 'DGPTM', ur: 'UR_SOTUV' },
  { nombre: 'Dirección General de Política de Vivienda', siglas: 'DGPV', ur: 'UR_SOTUV' },
  { nombre: 'Dirección General de Gestión Integral de Riesgos de Desastres y Cambio Climático', siglas: 'DGGIRDCC', ur: 'UR_SOTUV' },
  { nombre: 'Dirección General de Infraestructura y Equipamiento', siglas: 'DGIE', ur: 'UR_SOTUV' },
  { nombre: 'Dirección General de Obras Comunitarias', siglas: 'DGOC', ur: 'UR_SOTUV' },
  // === SOAIP (6 DGs) ===
  { nombre: 'Dirección General de Resoluciones Presidenciales y Expropiaciones', siglas: 'DGRPE', ur: 'UR_SOAIP' },
  { nombre: 'Dirección General de Terrenos Nacionales', siglas: 'DGTN', ur: 'UR_SOAIP' },
  { nombre: 'Dirección General de Inventarios y Modernización Registral y Catastral', siglas: 'DGIMRC', ur: 'UR_SOAIP' },
  { nombre: 'Dirección General de Concertación Agraria y Mediación', siglas: 'DGICAM', ur: 'UR_SOAIP' },
  { nombre: 'Dirección General de Vinculación del Sector Agrario', siglas: 'DGVSA', ur: 'UR_SOAIP' },
  { nombre: 'Dirección General de Igualdad de Género en la Propiedad Social', siglas: 'DGIGPS', ur: 'UR_SOAIP' },
  // === UAF (4 DGs) ===
  { nombre: 'Dirección General de Programación y Presupuesto', siglas: 'DGPP', ur: 'UAF' },
  { nombre: 'Dirección General de Capital Humano y Desarrollo Organizacional', siglas: 'DGCHDO', ur: 'UAF' },
  { nombre: 'Dirección General de Recursos Materiales y Servicios Generales', siglas: 'DGRMS', ur: 'UAF' },
  { nombre: 'Dirección General de Tecnologías de la Información y Comunicaciones', siglas: 'DGTIC', ur: 'UAF' },
  // === Adscritas al titular (sin UR padre) ===
  { nombre: 'Dirección General de Planeación y Desarrollo Institucional', siglas: 'DGPDI', ur: null },
  { nombre: 'Dirección General de Coordinación de Oficinas de Representación', siglas: 'DGCOR', ur: null },
];

const DIRECCIONES_AREA = [
  // DGOTU
  { nombre: 'Dirección de Análisis en Ordenamiento Territorial', siglas: 'DAOT', dg: 'DGOTU' },
  { nombre: 'Dirección de Instrumentos de Planeación Urbana', siglas: 'DIPU', dg: 'DGOTU' },
  { nombre: 'Dirección de Normatividad Urbana', siglas: 'DNU', dg: 'DGOTU' },
  // DGOMR
  { nombre: 'Dirección de Planeación Metropolitana', siglas: 'DPM', dg: 'DGOMR' },
  { nombre: 'Dirección de Desarrollo Regional', siglas: 'DDR', dg: 'DGOMR' },
  // DGPV
  { nombre: 'Dirección de Análisis de Vivienda', siglas: 'DAV', dg: 'DGPV' },
  { nombre: 'Dirección de Política Habitacional', siglas: 'DPH', dg: 'DGPV' },
  // DGPTM
  { nombre: 'Dirección de Movilidad Sustentable', siglas: 'DMS', dg: 'DGPTM' },
  // DGGIRDCC
  { nombre: 'Dirección de Gestión de Riesgos', siglas: 'DGR', dg: 'DGGIRDCC' },
  // DGTIC
  { nombre: 'Dirección de Sistemas de Información', siglas: 'DSI', dg: 'DGTIC' },
  { nombre: 'Dirección de Infraestructura Tecnológica', siglas: 'DIT', dg: 'DGTIC' },
];

// Normalización para comparar nombres: minúsculas, sin acentos y con
// los espacios colapsados. Es el mismo criterio que ya usa la migración
// 049 para el catálogo de indicadores.
const NOMBRE_NORMALIZADO = `
  regexp_replace(
    translate(lower(trim(nombre)), 'áéíóúüñ', 'aeiouun'),
    '\\s+', ' ', 'g')
`;

/**
 * Busca un área ya existente por siglas (incluidas las legadas) o por
 * nombre normalizado. Devuelve la fila o null.
 */
async function buscarExistente(client, tabla, { nombre, siglas, alias = [] }) {
  const todasLasSiglas = [siglas, ...alias];
  const { rows } = await client.query(`
    SELECT id, siglas, nombre
      FROM ${tabla}
     WHERE siglas = ANY($1::varchar[])
        OR ${NOMBRE_NORMALIZADO} = regexp_replace(
             translate(lower(trim($2::text)), 'áéíóúüñ', 'aeiouun'),
             '\\s+', ' ', 'g')
     -- Si coincide por siglas exactas y por nombre a la vez, gana la
     -- coincidencia por las siglas canónicas: es la identificación más
     -- fuerte de las dos.
     ORDER BY (siglas = $3) DESC
     LIMIT 1
  `, [todasLasSiglas, nombre, siglas]);

  return rows[0] || null;
}

/**
 * Inserta el área si no existe. Nunca modifica una fila existente.
 * Devuelve { id, insertada }.
 */
async function asegurarArea(client, tabla, area, columnasPadre = {}) {
  const existente = await buscarExistente(client, tabla, area);
  if (existente) return { id: existente.id, insertada: false };

  const columnas = ['nombre', 'siglas', ...Object.keys(columnasPadre)];
  const valores = [area.nombre, area.siglas, ...Object.values(columnasPadre)];
  const marcadores = valores.map((_, i) => `$${i + 1}`);

  const { rows } = await client.query(`
    INSERT INTO ${tabla} (${columnas.join(', ')})
    VALUES (${marcadores.join(', ')})
    ON CONFLICT (siglas) DO NOTHING
    RETURNING id
  `, valores);

  // El DO NOTHING solo puede saltar si otra corrida la insertó entre la
  // búsqueda y este INSERT; en ese caso nos quedamos con la que ganó.
  if (rows[0]) return { id: rows[0].id, insertada: true };

  const { rows: yaEstaba } = await client.query(
    `SELECT id FROM ${tabla} WHERE siglas = $1`, [area.siglas]);
  return { id: yaEstaba[0]?.id || null, insertada: false };
}

/**
 * Siembra la estructura organizacional la primera vez que se ejecuta,
 * agregando únicamente lo que falte. Corre en todos los entornos,
 * producción incluida; si la siembra ya está anotada, no hace nada.
 */
async function asegurarEstructura() {
  const client = await pool.connect();

  try {
    if (await yaSembrado(client, CLAVE_SIEMBRA)) {
      console.log('  · Estructura SEDATU: la administra el panel (siembra inicial ya hecha)');
      return null;
    }

    await client.query('BEGIN');

    const cuenta = { subsecretarias: 0, unidades: 0, dgs: 0, areas: 0 };
    const idSub = {};
    const idUr = {};
    const idDg = {};

    for (const sub of SUBSECRETARIAS) {
      const { id, insertada } = await asegurarArea(client, 'subsecretarias', sub);
      idSub[sub.siglas] = id;
      if (insertada) cuenta.subsecretarias += 1;
    }

    for (const ur of UNIDADES_RESPONSABLES) {
      const { id, insertada } = await asegurarArea(client, 'unidades_responsables', ur, {
        id_subsecretaria: ur.sub ? (idSub[ur.sub] || null) : null,
      });
      idUr[ur.siglas] = id;
      if (insertada) cuenta.unidades += 1;
    }

    for (const dg of DIRECCIONES_GENERALES) {
      const { id, insertada } = await asegurarArea(client, 'direcciones_generales', dg, {
        id_unidad_responsable: dg.ur ? (idUr[dg.ur] || null) : null,
      });
      idDg[dg.siglas] = id;
      if (insertada) cuenta.dgs += 1;
    }

    for (const da of DIRECCIONES_AREA) {
      const { insertada } = await asegurarArea(client, 'direcciones_area', da, {
        id_dg: idDg[da.dg] || null,
      });
      if (insertada) cuenta.areas += 1;
    }

    const agregadas = cuenta.subsecretarias + cuenta.unidades + cuenta.dgs + cuenta.areas;

    // La marca va dentro de la misma transacción: o quedan las áreas y
    // la marca, o no queda ninguna de las dos. Si se guardara aparte y
    // el proceso muriera en medio, el siguiente arranque volvería a
    // sembrar sobre lo ya sembrado.
    await marcarSembrado(client, CLAVE_SIEMBRA,
      `Siembra inicial al arrancar el backend: ${agregadas} área(s) agregadas.`);

    await client.query('COMMIT');

    if (agregadas > 0) {
      console.log(`  ✓ Estructura SEDATU: ${agregadas} área(s) agregadas ` +
        `(${cuenta.subsecretarias} subsecretarías, ${cuenta.unidades} unidades, ` +
        `${cuenta.dgs} DGs, ${cuenta.areas} direcciones de área)`);
    } else {
      console.log('  ✓ Estructura SEDATU al día: nada que agregar');
    }

    return cuenta;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = asegurarEstructura;
module.exports.asegurarEstructura = asegurarEstructura;
module.exports.SUBSECRETARIAS = SUBSECRETARIAS;
module.exports.UNIDADES_RESPONSABLES = UNIDADES_RESPONSABLES;
module.exports.DIRECCIONES_GENERALES = DIRECCIONES_GENERALES;
module.exports.DIRECCIONES_AREA = DIRECCIONES_AREA;
