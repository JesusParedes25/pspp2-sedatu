/**
 * ARCHIVO: 03_programas.js
 * PROPÓSITO: Insertar los programas presupuestarios reales del Ramo 15
 *            (Desarrollo Agrario, Territorial y Urbano) conforme a la
 *            estructura programática de SHCP.
 *
 * MINI-CLASE: Estructura programática del Ramo 15
 * ─────────────────────────────────────────────────────────────────
 * Cada proyecto en SEDATU se vincula a un programa presupuestario (Pp).
 * La clave del Pp sigue la nomenclatura SHCP: una letra de modalidad
 * (S=subsidio, E=prestación de servicios, P=planeación, U=subsidio
 * específico, K=inversión, G=regulación, L=obligación, M=gasto
 * administrativo) seguida de un número. El campo unidad_responsable
 * indica quién opera el Pp (puede ser una DG interna o paraestatal).
 *
 * Nota 2026: SHCP implementó una simplificación programática que
 * redujo 38.9% de los Pp a nivel federal. Este seed usa las claves
 * conocidas de 2025 — actualizables por administradores si cambian.
 * ─────────────────────────────────────────────────────────────────
 */
const pool = require('../pool');

async function seedProgramas() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const programas = [
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

    const programaIds = {};
    for (const p of programas) {
      const resultado = await client.query(`
        INSERT INTO programas (nombre, clave, tipo, ejercicio_fiscal, activo, unidad_responsable, descripcion)
        VALUES ($1, $2, $3, $4, true, $5, $6)
        ON CONFLICT (clave) DO UPDATE SET
          nombre = EXCLUDED.nombre,
          tipo = EXCLUDED.tipo,
          ejercicio_fiscal = EXCLUDED.ejercicio_fiscal,
          unidad_responsable = EXCLUDED.unidad_responsable,
          descripcion = EXCLUDED.descripcion,
          activo = true
        RETURNING id
      `, [p.nombre, p.clave, p.tipo, p.ef, p.ur, p.desc]);

      programaIds[p.clave] = resultado.rows[0].id;
    }

    await client.query('COMMIT');
    console.log('  ✓ Programas presupuestarios Ramo 15:', Object.keys(programaIds).length);
    return programaIds;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = seedProgramas;
