/**
 * ARCHIVO: 00_programas.js
 * PROPÓSITO: Asegurar que el catálogo de programas presupuestarios del
 *            Ramo 15 exista en CUALQUIER entorno, producción incluida.
 *            Es la lista que alimenta el desplegable "Programa
 *            presupuestario" al crear o editar un proyecto.
 *
 * MINI-CLASE: catálogo institucional ≠ datos de demostración
 * ─────────────────────────────────────────────────────────────────
 * Los seeders (01_dgs, 02_usuarios, 03_programas, 04_proyectos_ejemplo)
 * solo corren fuera de producción: insertan usuarios de demo con
 * contraseña conocida y proyectos inventados, y volver a sembrarlos en
 * cada reinicio del contenedor pisaría la base real. Esa decisión es
 * correcta, pero arrastró consigo algo que sí hace falta en producción:
 * los programas presupuestarios. El formulario los pedía, el endpoint
 * los servía y el desplegable los sabía pintar — solo que la tabla
 * `programas` estaba vacía en el servidor, así que la única opción
 * visible era "Sin programa específico".
 *
 * La distinción es qué clase de dato es cada uno. Un programa
 * presupuestario del Ramo 15 no es un dato de ejemplo: es una clave de
 * la estructura programática de SHCP, igual de real en dev que en
 * producción, y sin ella un proyecto no se puede vincular a su Pp. Por
 * eso vive aquí, junto a `00_superadmin`, que es el otro dato que debe
 * existir siempre.
 *
 * POR QUÉ `DO NOTHING` Y NO `DO UPDATE`: en producción alguien pudo
 * haber corregido a mano el nombre o la unidad responsable de un Pp, o
 * haberlo dado de baja con `activo = false`. Reescribirlo en cada
 * arranque borraría esa corrección sin avisar. Aquí solo se insertan
 * las claves que faltan; lo que ya está en la base se respeta tal cual.
 * El seeder de desarrollo (03_programas) sí actualiza, porque ahí la
 * base es desechable y conviene que refleje esta lista al día.
 *
 * SE SIEMBRA UNA SOLA VEZ: hecha la siembra queda anotada en
 * `siembra_inicial` (migración 055) y no se repite. A partir de ahí el
 * catálogo se administra desde el panel —pestaña "Programas"—, y un
 * programa que ahí se elimine no reaparece al reiniciar el backend.
 * ─────────────────────────────────────────────────────────────────
 */
const pool = require('../pool');
const { yaSembrado, marcarSembrado } = require('./siembra');

const CLAVE_SIEMBRA = 'programas_ramo15';

/**
 * Estructura programática del Ramo 15 (Desarrollo Agrario, Territorial
 * y Urbano). La clave sigue la nomenclatura SHCP: una letra de
 * modalidad (S=subsidio, E=prestación de servicios, P=planeación,
 * U=subsidio específico, K=inversión, G=regulación, L=obligación,
 * M=gasto administrativo) seguida de un número.
 *
 * `ur` (unidad responsable) es quién opera el Pp. Además de informar,
 * el formulario lo usa para agrupar: los programas cuya UR menciona las
 * siglas de la DG del proyecto salen primero, bajo "Programas de
 * <SIGLAS>". Por eso las siglas escritas aquí deben coincidir con las
 * de `01_dgs` — si se escriben de otra forma, el agrupado deja de
 * funcionar y todo cae en "Otros programas".
 *
 * Nota 2026: SHCP implementó una simplificación programática que
 * redujo 38.9% de los Pp a nivel federal. Esta lista usa las claves
 * conocidas de 2025 — actualizables por administradores si cambian.
 */
const PROGRAMAS_RAMO15 = [
  // === SUBSIDIOS (S) ===
  { nombre: 'Programa de Vivienda Social', clave: 'S177', tipo: 'S_Subsidio', ef: 2026,
    ur: 'CONAVI', desc: 'Disminuir la carencia de vivienda adecuada en población de bajos ingresos mediante vivienda nueva y mejoramiento' },
  { nombre: 'Programa de Mejoramiento Urbano', clave: 'S273', tipo: 'S_Subsidio', ef: 2026,
    ur: 'SEDATU (DGIE/DGOC/DGOTU)', desc: 'Mejorar condiciones de habitabilidad en ZAP mediante equipamiento, espacios públicos, infraestructura básica y programas de OT' },
  { nombre: 'Programa Nacional de Reconstrucción', clave: 'S213', tipo: 'S_Subsidio', ef: 2026,
    ur: 'SEDATU', desc: 'Reconstrucción de viviendas e infraestructura dañadas por desastres naturales' },

  // === PRESTACIÓN DE SERVICIOS (E) ===
  { nombre: 'Procuración de Justicia Agraria', clave: 'E001', tipo: 'E_Prestacion_Servicios', ef: 2026,
    ur: 'Procuraduría Agraria', desc: 'Asesoría jurídica, representación legal y conciliación agraria para sujetos agrarios' },
  { nombre: 'Programa de Atención de Conflictos Agrarios', clave: 'E002', tipo: 'E_Prestacion_Servicios', ef: 2026,
    ur: 'DGICAM', desc: 'Solución de controversias por propiedad o posesión de tierra rural, pueblos indígenas y afromexicanos' },
  { nombre: 'Ordenamiento y Regulación de la Propiedad Rural', clave: 'E003', tipo: 'E_Prestacion_Servicios', ef: 2026,
    ur: 'INSUS / DGRPE / DGTN', desc: 'Regularización de tenencia de tierra rural, emisión de documentos, certeza jurídica' },
  { nombre: 'Registro e Identificación de la Propiedad Social', clave: 'E006', tipo: 'E_Prestacion_Servicios', ef: 2026,
    ur: 'RAN', desc: 'Registro y certificación de derechos ejidales y comunales' },
  { nombre: 'Gestión Integral de Riesgos de Desastres', clave: 'E007', tipo: 'E_Prestacion_Servicios', ef: 2026,
    ur: 'DGGIRDCC', desc: 'Prevención, mitigación y atención de riesgos en asentamientos humanos' },
  { nombre: 'Modernización de Registros Públicos y Catastros', clave: 'E014', tipo: 'E_Prestacion_Servicios', ef: 2026,
    ur: 'DGIMRC', desc: 'Modernización y vinculación registral y catastral con entidades federativas' },

  // === PLANEACIÓN Y POLÍTICA (P) ===
  { nombre: 'Modernización del Catastro Rural Nacional', clave: 'P003', tipo: 'P_Planeacion', ef: 2026,
    ur: 'RAN', desc: 'Actualización de información de núcleos agrarios mediante sistemas institucionales' },
  { nombre: 'Conducción e Instrumentación de la Política Nacional de Vivienda', clave: 'P004', tipo: 'P_Planeacion', ef: 2026,
    ur: 'DGPV', desc: 'Coordinación de la política de vivienda con organismos nacionales' },
  { nombre: 'Política de Desarrollo Urbano y Ordenamiento del Territorio', clave: 'P005', tipo: 'P_Planeacion', ef: 2026,
    ur: 'DGOTU / DGPTM / DGOMR', desc: 'Formulación, seguimiento y evaluación de instrumentos de OT y desarrollo urbano' },

  // === INVERSIÓN (K) ===
  { nombre: 'Estudios y Proyectos para el Desarrollo Regional, Agrario, Metropolitano y Urbano', clave: 'K049', tipo: 'K_Inversion', ef: 2026,
    ur: 'SEDATU (varias DGs)', desc: 'Proyectos de inversión pública para infraestructura, equipamiento y conectividad' },

  // === SUBSIDIOS ESPECÍFICOS (U) ===
  { nombre: 'Programa de Vivienda para el Bienestar', clave: 'U050', tipo: 'U_Subsidio_Especifico', ef: 2026,
    ur: 'CONAVI / DGPV', desc: 'Programa de vivienda en las 92 zonas metropolitanas — incluye el análisis de aptitud territorial DAOT' },

  // === REGULACIÓN (G) ===
  { nombre: 'Regulación del Sector Agrario', clave: 'G001', tipo: 'G_Regulacion', ef: 2026,
    ur: 'SEDATU', desc: 'Marco normativo y regulatorio del sector agrario' },

  // === OBLIGACIONES (L) ===
  { nombre: 'Obligaciones Jurídicas Ineludibles', clave: 'L001', tipo: 'L_Obligacion', ef: 2026,
    ur: 'UAJ / SEDATU', desc: 'Cumplimiento de ejecutorias, adquisición de predios e indemnizaciones por expropiación' },

  // === GASTO ADMINISTRATIVO (M) ===
  { nombre: 'Actividades de Apoyo Administrativo', clave: 'M001', tipo: 'M_Gasto_Administrativo', ef: 2026,
    ur: 'UAF', desc: 'Operación administrativa: RRHH, presupuesto, TICs, recursos materiales' },
];

/**
 * Inserta los programas que falten en la tabla `programas`.
 *
 * @param {object} opciones
 * @param {boolean} opciones.actualizar  Si es true, además de insertar los
 *   que faltan reescribe los que ya existen con los valores de esta lista.
 *   Solo lo usa el seeder de desarrollo; en producción SIEMPRE va en false.
 */
async function asegurarProgramas({ actualizar = false } = {}) {
  // ON CONFLICT (clave) funciona gracias al UNIQUE que agrega la
  // migración 004; las migraciones corren antes que esto en el arranque.
  const alConflicto = actualizar
    ? `DO UPDATE SET
         nombre             = EXCLUDED.nombre,
         tipo               = EXCLUDED.tipo,
         ejercicio_fiscal   = EXCLUDED.ejercicio_fiscal,
         unidad_responsable = EXCLUDED.unidad_responsable,
         descripcion        = EXCLUDED.descripcion,
         activo             = true`
    : 'DO NOTHING';

  const client = await pool.connect();
  try {
    // El seeder de desarrollo pasa `actualizar: true` y se salta la
    // marca a propósito: ahí sí se quiere refrescar la lista en cada
    // arranque. En producción nunca entra por ese camino.
    if (!actualizar && await yaSembrado(client, CLAVE_SIEMBRA)) {
      console.log('  · Catálogo de programas: lo administra el panel (siembra inicial ya hecha)');
      return 0;
    }

    await client.query('BEGIN');

    let insertados = 0;
    for (const p of PROGRAMAS_RAMO15) {
      const resultado = await client.query(`
        INSERT INTO programas (nombre, clave, tipo, ejercicio_fiscal, activo, unidad_responsable, descripcion)
        VALUES ($1, $2, $3, $4, true, $5, $6)
        ON CONFLICT (clave) ${alConflicto}
        RETURNING id
      `, [p.nombre, p.clave, p.tipo, p.ef, p.ur, p.desc]);

      // Con DO NOTHING, una clave que ya existía no devuelve fila: eso es
      // exactamente lo que queremos contar como "ya estaba".
      if (resultado.rowCount > 0) insertados += 1;
    }

    // Dentro de la transacción, por lo mismo que en 00_estructura: o
    // quedan los programas y la marca, o no queda ninguno de los dos.
    await marcarSembrado(client, CLAVE_SIEMBRA,
      `Siembra inicial: ${insertados} programa(s) agregados.`);

    await client.query('COMMIT');

    if (actualizar) {
      console.log('  ✓ Programas presupuestarios Ramo 15:', PROGRAMAS_RAMO15.length);
    } else if (insertados > 0) {
      console.log(`  ✓ Catálogo de programas: ${insertados} programa(s) agregados (${PROGRAMAS_RAMO15.length} en total)`);
    } else {
      console.log('  ✓ Catálogo de programas al día:', PROGRAMAS_RAMO15.length);
    }

    return insertados;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = asegurarProgramas;
module.exports.asegurarProgramas = asegurarProgramas;
module.exports.PROGRAMAS_RAMO15 = PROGRAMAS_RAMO15;
