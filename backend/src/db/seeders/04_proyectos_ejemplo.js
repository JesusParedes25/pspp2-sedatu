/**
 * ARCHIVO: 04_proyectos_ejemplo.js
 * PROPÓSITO: Insertar los 2 proyectos de ejemplo con etapas, acciones,
 *            evidencias, riesgos y comentarios completos y realistas.
 *
 * MINI-CLASE: Transacciones en PostgreSQL
 * ─────────────────────────────────────────────────────────────────
 * Todo este seeder se ejecuta dentro de una transacción (BEGIN/COMMIT).
 * Si cualquier INSERT falla, ROLLBACK deshace TODOS los cambios.
 * Esto garantiza que la BD nunca quede en un estado inconsistente
 * (ej: un proyecto sin sus etapas). Usamos client.query() en lugar
 * de pool.query() porque la transacción debe ejecutarse en la misma
 * conexión de principio a fin.
 * ─────────────────────────────────────────────────────────────────
 */
const pool = require('../pool');

async function seedProyectosEjemplo() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // ─── Limpiar proyectos de ejemplo anteriores ───────────────
    // evidencias.id_accion_fkey NO tiene ON DELETE CASCADE, así que
    // limpiamos en orden: evidencias → comentarios → riesgos →
    // notificaciones → acciones → etapas → indicadores → proyecto_dgs
    // → etiquetas → proyectos.
    const proyectosViejos = (await client.query(`
      SELECT id FROM proyectos WHERE nombre IN (
        'Análisis de aptitud territorial de suelo para vivienda en núcleos agrarios de las 92 Zonas Metropolitanas',
        'República Conectada — Análisis de aptitud territorial para infraestructura de telecomunicaciones'
      )
    `)).rows.map(r => r.id);

    if (proyectosViejos.length > 0) {
      const ids = proyectosViejos;
      // Evidencias referidas por acciones del proyecto
      await client.query(`DELETE FROM evidencias WHERE id_accion IN (SELECT id FROM acciones WHERE id_proyecto = ANY($1))`, [ids]);
      // Comentarios de etapas y acciones
      await client.query(`DELETE FROM comentarios WHERE entidad_tipo = 'Accion' AND entidad_id IN (SELECT id FROM acciones WHERE id_proyecto = ANY($1))`, [ids]);
      await client.query(`DELETE FROM comentarios WHERE entidad_tipo = 'Etapa' AND entidad_id IN (SELECT id FROM etapas WHERE id_proyecto = ANY($1))`, [ids]);
      await client.query(`DELETE FROM comentarios WHERE entidad_tipo = 'Proyecto' AND entidad_id = ANY($1)`, [ids]);
      // Riesgos
      await client.query(`DELETE FROM riesgos WHERE (entidad_tipo = 'Proyecto' AND entidad_id = ANY($1)) OR (entidad_tipo = 'Etapa' AND entidad_id IN (SELECT id FROM etapas WHERE id_proyecto = ANY($1)))`, [ids]);
      // Notificaciones referidas a etapas/acciones del proyecto
      await client.query(`DELETE FROM notificaciones WHERE entidad_id IN (SELECT id FROM etapas WHERE id_proyecto = ANY($1)) OR entidad_id IN (SELECT id FROM acciones WHERE id_proyecto = ANY($1))`, [ids]);
      // Acciones, etapas
      await client.query(`DELETE FROM acciones WHERE id_proyecto = ANY($1)`, [ids]);
      await client.query(`DELETE FROM etapas WHERE id_proyecto = ANY($1)`, [ids]);
      // Indicadores (nueva tabla)
      await client.query(`DELETE FROM indicadores WHERE id_proyecto = ANY($1)`, [ids]);
      // Participantes y etiquetas
      await client.query(`DELETE FROM proyecto_dgs WHERE id_proyecto = ANY($1)`, [ids]);
      await client.query(`DELETE FROM etiquetas WHERE id_proyecto = ANY($1)`, [ids]);
      // Finalmente los proyectos
      await client.query(`DELETE FROM proyectos WHERE id = ANY($1)`, [ids]);
    }

    // ─── Obtener IDs necesarios ────────────────────────────────
    const dgotu = (await client.query("SELECT id FROM direcciones_generales WHERE siglas = 'DGOTU'")).rows[0].id;
    const dgomr = (await client.query("SELECT id FROM direcciones_generales WHERE siglas = 'DGOMR'")).rows[0].id;
    const dgpv = (await client.query("SELECT id FROM direcciones_generales WHERE siglas = 'DGPV'")).rows[0].id;
    const daot = (await client.query("SELECT id FROM direcciones_area WHERE siglas = 'DAOT'")).rows[0].id;

    const jesus = (await client.query("SELECT id FROM usuarios WHERE correo = 'jesus.paredes@sedatu.gob.mx'")).rows[0].id;
    const enlaceRAN = (await client.query("SELECT id FROM usuarios WHERE correo = 'enlace.ran@sedatu.gob.mx'")).rows[0].id;
    const enlaceDGPV = (await client.query("SELECT id FROM usuarios WHERE correo = 'enlace.dgpv@sedatu.gob.mx'")).rows[0].id;
    const enlaceDGOMR = (await client.query("SELECT id FROM usuarios WHERE correo = 'enlace.dgomr@sedatu.gob.mx'")).rows[0].id;

    const programaVivienda = (await client.query("SELECT id FROM programas WHERE clave = 'U050'")).rows[0].id;
    const programaConectada = (await client.query("SELECT id FROM programas WHERE clave = 'K049'")).rows[0].id;

    // ═══════════════════════════════════════════════════════════
    // PROYECTO 1: Análisis de aptitud territorial
    // ═══════════════════════════════════════════════════════════
    const p1 = (await client.query(`
      INSERT INTO proyectos (
        nombre, descripcion, tipo, estado, meta_descripcion,
        tiene_indicador,
        es_prioritario, dependencia_externa, descripcion_dependencia,
        tiene_subproyectos, fecha_inicio, fecha_limite,
        porcentaje_calculado, id_dg_lider, id_direccion_area_lider,
        id_creador, id_programa
      ) VALUES (
        'Análisis de aptitud territorial de suelo para vivienda en núcleos agrarios de las 92 Zonas Metropolitanas',
        'El flujo metodológico depende de tres instituciones en cadena: DAOT genera el análisis de restricción → RAN cruza con delimitación de parcelas y solares → DGPV determina viabilidad final por vocación. Cualquier retraso en RAN o DGPV impacta directamente el cronograma total. Adicionalmente, la DGOMR provee la zonificación primaria metropolitana y la DOOTU aporta la zonificación del SITU.',
        'Analisis_tecnico', 'En_proceso',
        'Identificar y delimitar el suelo potencialmente apto para vivienda dentro de los núcleos agrarios de las 92 zonas metropolitanas del país, mediante análisis de restricción territorial a escala 1:50,000, integrando criterios ambientales, de riesgo de desastres, crecimiento urbano y medio físico.',
        true,
        true, true,
        'El flujo metodológico depende de tres instituciones en cadena: DAOT genera el análisis de restricción → RAN cruza con delimitación de parcelas y solares → DGPV determina viabilidad final por vocación. Cualquier retraso en RAN o DGPV impacta directamente el cronograma total.',
        false, '2025-01-15', '2027-03-01',
        0, $1, $2, $3, $4
      ) RETURNING id
    `, [dgotu, daot, jesus, programaVivienda])).rows[0].id;

    // ─── Indicadores del Proyecto 1 (tabla indicadores) ──────
    await client.query(`
      INSERT INTO indicadores (id_proyecto, nombre, tipo, unidad, unidad_personalizada,
        acumulacion, meta_global, valor_actual, temporalidad, orden, descripcion)
      VALUES ($1, 'Zonas metropolitanas con análisis de aptitud terminado',
        'Avance_fisico', 'Numero', 'zonas metropolitanas',
        'Suma', 92, 16, 'Global', 1,
        'Cuenta de ZMs con análisis de restricción territorial completado por DAOT')
    `, [p1]);
    await client.query(`
      INSERT INTO indicadores (id_proyecto, nombre, tipo, unidad, unidad_personalizada,
        acumulacion, meta_global, valor_actual, temporalidad, orden, descripcion)
      VALUES ($1, 'Hectáreas aptas para vivienda identificadas',
        'Cobertura', 'Numero', 'hectáreas',
        'Suma', 5000, 275.91, 'Global', 2,
        'Superficie total viable determinada por DGPV tras evaluación multifactorial')
    `, [p1]);

    // ─── Etiquetas del Proyecto 1 ──────────────────────────────
    const etiquetas = ['aptitud territorial', 'vivienda social', 'núcleos agrarios',
      'zonas metropolitanas', 'análisis de restricción', 'PostGIS', 'Python', 'geoespacial'];
    for (const etiqueta of etiquetas) {
      await client.query(
        'INSERT INTO etiquetas (nombre, id_proyecto) VALUES ($1, $2)',
        [etiqueta, p1]
      );
    }

    // ─── DGs participantes Proyecto 1 ──────────────────────────
    await client.query(`
      INSERT INTO proyecto_dgs (id_proyecto, id_dg, id_direccion_area, rol_en_proyecto, id_responsable)
      VALUES ($1, $2, $3, 'Lider', $4)
    `, [p1, dgotu, daot, jesus]);

    await client.query(`
      INSERT INTO proyecto_dgs (id_proyecto, id_dg, rol_en_proyecto, id_responsable)
      VALUES ($1, $2, 'Colaboradora', $3)
    `, [p1, dgomr, enlaceDGOMR]);

    await client.query(`
      INSERT INTO proyecto_dgs (id_proyecto, id_dg, rol_en_proyecto, id_responsable)
      VALUES ($1, $2, 'Colaboradora', $3)
    `, [p1, dgpv, enlaceDGPV]);

    // ─── ETAPA 1: Sistematización de instrumentos ──────────────
    const e1 = (await client.query(`
      INSERT INTO etapas (nombre, descripcion, orden, estado, porcentaje_calculado,
        fecha_inicio, fecha_fin, id_proyecto, id_dg, id_direccion_area, id_responsable)
      VALUES (
        'Sistematización de instrumentos de ordenamiento territorial',
        'Recopilación y validación de la zonificación primaria de los 92 ZMs. Incluye instrumentos metropolitanos (DGOMR) y municipales (PUMOT 2018-2024).',
        1, 'Completada', 100,
        '2025-01-15', '2025-03-15', $1, $2, $3, $4
      ) RETURNING id
    `, [p1, dgotu, daot, jesus])).rows[0].id;

    // Acciones de Etapa 1
    const a1_1 = (await client.query(`
      INSERT INTO acciones (nombre, tipo, estado, porcentaje_avance, fecha_inicio, fecha_fin,
        id_etapa, id_proyecto, id_dg, id_direccion_area, id_responsable)
      VALUES ('Recopilación de zonificación primaria metropolitana DGOMR',
        'Accion_programada', 'Completada', 100, '2025-01-15', '2025-02-10',
        $1, $2, $3, $4, $5) RETURNING id
    `, [e1, p1, dgotu, daot, jesus])).rows[0].id;

    const a1_2 = (await client.query(`
      INSERT INTO acciones (nombre, tipo, estado, porcentaje_avance, fecha_inicio, fecha_fin,
        id_etapa, id_proyecto, id_dg, id_direccion_area, id_responsable)
      VALUES ('Descarga de zonificación primaria municipal PUMOT 2018-2024 del SITU',
        'Accion_programada', 'Completada', 100, '2025-01-20', '2025-02-15',
        $1, $2, $3, $4, $5) RETURNING id
    `, [e1, p1, dgotu, daot, jesus])).rows[0].id;

    const a1_3 = (await client.query(`
      INSERT INTO acciones (nombre, tipo, estado, porcentaje_avance, fecha_inicio, fecha_fin,
        id_etapa, id_proyecto, id_dg, id_direccion_area, id_responsable)
      VALUES ('Validación de cobertura: identificación de 57 ZMs sin instrumento',
        'Accion_programada', 'Completada', 100, '2025-02-16', '2025-03-05',
        $1, $2, $3, $4, $5) RETURNING id
    `, [e1, p1, dgotu, daot, jesus])).rows[0].id;

    const a1_4 = (await client.query(`
      INSERT INTO acciones (nombre, tipo, estado, porcentaje_avance, fecha_inicio, fecha_fin,
        id_etapa, id_proyecto, id_dg, id_direccion_area, id_responsable)
      VALUES ('Recepción de núcleos agrarios en metrópolis del RAN',
        'Accion_programada', 'Completada', 100, '2025-02-01', '2025-03-15',
        $1, $2, $3, $4, $5) RETURNING id
    `, [e1, p1, dgotu, daot, jesus])).rows[0].id;

    // Evidencias de Etapa 1
    await client.query(`
      INSERT INTO evidencias (nombre_archivo, nombre_original, ruta_minio, tipo_archivo, categoria, notas, id_accion, id_autor)
      VALUES ('ZP_metropolitana_16_metropolis.zip', 'ZP_metropolitana_16_metropolis.zip', 'evidencias/p1/e1/ZP_metropolitana_16_metropolis.zip', 'application/zip', 'Geoespacial', '16 metrópolis con ZPZM', $1, $2)
    `, [a1_1, jesus]);

    await client.query(`
      INSERT INTO evidencias (nombre_archivo, nombre_original, ruta_minio, tipo_archivo, categoria, id_accion, id_autor)
      VALUES ('ZP_municipal_PUMOT_SITU.zip', 'ZP_municipal_PUMOT_SITU.zip', 'evidencias/p1/e1/ZP_municipal_PUMOT_SITU.zip', 'application/zip', 'Geoespacial', $1, $2)
    `, [a1_2, jesus]);

    await client.query(`
      INSERT INTO evidencias (nombre_archivo, nombre_original, ruta_minio, tipo_archivo, categoria, notas, id_accion, id_autor)
      VALUES ('diagnostico_instrumentos_OT_92ZMs.pdf', 'diagnostico_instrumentos_OT_92ZMs.pdf', 'evidencias/p1/e1/diagnostico_instrumentos_OT_92ZMs.pdf', 'application/pdf', 'Estudios', '57 sin instrumento, 16 con ZPZM DGOMR, 18 con ZPZM SITU, 5 con ambos', $1, $2)
    `, [a1_3, jesus]);

    await client.query(`
      INSERT INTO evidencias (nombre_archivo, nombre_original, ruta_minio, tipo_archivo, categoria, notas, id_accion, id_autor)
      VALUES ('nucleos_agrarios_metropolis_RAN.zip', 'nucleos_agrarios_metropolis_RAN.zip', 'evidencias/p1/e1/nucleos_agrarios_metropolis_RAN.zip', 'application/zip', 'Geoespacial', '7,402 núcleos agrarios totales, 22,381,204.75 ha', $1, $2)
    `, [a1_4, jesus]);

    // ─── ETAPA 2: Capas de restricción territorial ─────────────
    const e2 = (await client.query(`
      INSERT INTO etapas (nombre, descripcion, orden, estado, porcentaje_calculado,
        fecha_inicio, fecha_fin, id_proyecto, id_dg, id_direccion_area, id_responsable)
      VALUES (
        'Construcción de capas de restricción territorial',
        'Generación de las 9 capas temáticas de restricción a escala 1:50,000 que conforman el análisis.',
        2, 'Completada', 100,
        '2025-03-10', '2025-04-25', $1, $2, $3, $4
      ) RETURNING id
    `, [p1, dgotu, daot, jesus])).rows[0].id;

    // Acciones de Etapa 2 (7 acciones, todas completadas)
    const accionesE2 = [
      { nombre: 'Capa de restricción ambiental — ANP 300m buffer', fi: '2025-03-10', ff: '2025-03-20', evidencia: 'restriccion_ANP_300m.tif', notas: 'Distancia a Áreas Naturales Protegidas, buffer 300m' },
      { nombre: 'Capa de vegetación natural — INEGI Serie VII', fi: '2025-03-10', ff: '2025-03-20', evidencia: 'vegetacion_natural_SerieVII.tif', notas: null },
      { nombre: 'Capa de riesgo — susceptibilidad por inestabilidad de laderas', fi: '2025-03-21', ff: '2025-04-05', evidencia: 'susceptibilidad_laderas_remocion_masa.tif', notas: null },
      { nombre: 'Capa de riesgo — índice de inundabilidad (período retorno 100 años)', fi: '2025-03-21', ff: '2025-04-05', evidencia: 'inundabilidad_TR100.tif', notas: null },
      { nombre: 'Capa de conectividad — RNC distancia 500m', fi: '2025-04-06', ff: '2025-04-15', evidencia: 'conectividad_RNC_500m.tif', notas: 'Red Nacional de Caminos, buffer 500m' },
      { nombre: 'Capa de conectividad — localidades INEGI distancia 500m', fi: '2025-04-06', ff: '2025-04-15', evidencia: 'dist_localidades_500m.tif', notas: null },
      { nombre: 'Capas de medio físico — cuerpos y corrientes de agua 50m + pendiente >15°', fi: '2025-04-16', ff: '2025-04-25', evidencia: 'medio_fisico_agua_pendiente.tif', notas: '3 capas en un solo archivo: cuerpos agua 50m, corrientes 50m, pendiente >15 grados' },
    ];

    for (const accion of accionesE2) {
      const accionId = (await client.query(`
        INSERT INTO acciones (nombre, tipo, estado, porcentaje_avance, fecha_inicio, fecha_fin,
          id_etapa, id_proyecto, id_dg, id_direccion_area, id_responsable)
        VALUES ($1, 'Accion_programada', 'Completada', 100, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `, [accion.nombre, accion.fi, accion.ff, e2, p1, dgotu, daot, jesus])).rows[0].id;

      await client.query(`
        INSERT INTO evidencias (nombre_archivo, nombre_original, ruta_minio, tipo_archivo, categoria, notas, id_accion, id_autor)
        VALUES ($1, $1, $2, 'image/tiff', 'Geoespacial', $3, $4, $5)
      `, [accion.evidencia, `evidencias/p1/e2/${accion.evidencia}`, accion.notas, accionId, jesus]);
    }

    // ─── ETAPA 3: Flujo automatizado en Python ─────────────────
    const e3 = (await client.query(`
      INSERT INTO etapas (nombre, descripcion, orden, estado, porcentaje_calculado,
        fecha_inicio, fecha_fin, id_proyecto, id_dg, id_direccion_area, id_responsable)
      VALUES (
        'Implementación del flujo automatizado en Python',
        'Desarrollo e implementación del script Python que procesa de forma reproducible las capas de zonificación primaria, núcleos agrarios y restricción para generar automáticamente las capas de aptitud.',
        3, 'Completada', 100,
        '2025-04-26', '2025-06-30', $1, $2, $3, $4
      ) RETURNING id
    `, [p1, dgotu, daot, jesus])).rows[0].id;

    const accionesE3 = [
      { nombre: 'Diseño del flujo de procesamiento geoespacial', fi: '2025-04-26', ff: '2025-05-10', evidencia: 'diagrama_flujo_procesamiento.pdf', cat: 'Estudios' },
      { nombre: 'Implementación y pruebas del script Python', fi: '2025-05-11', ff: '2025-06-15', evidencia: 'script_aptitud_vivienda_v1.py', cat: 'Scripts', notas: 'Automatiza el procesamiento de las 9 capas de restricción' },
      { nombre: 'Validación del script con 4 ZMs de Oaxaca', fi: '2025-06-16', ff: '2025-06-30', evidencia: 'validacion_oaxaca_4ZMs.pdf', cat: 'Estudios' },
    ];

    for (const accion of accionesE3) {
      const accionId = (await client.query(`
        INSERT INTO acciones (nombre, tipo, estado, porcentaje_avance, fecha_inicio, fecha_fin,
          id_etapa, id_proyecto, id_dg, id_direccion_area, id_responsable)
        VALUES ($1, 'Accion_programada', 'Completada', 100, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `, [accion.nombre, accion.fi, accion.ff, e3, p1, dgotu, daot, jesus])).rows[0].id;

      await client.query(`
        INSERT INTO evidencias (nombre_archivo, nombre_original, ruta_minio, tipo_archivo, categoria, notas, id_accion, id_autor)
        VALUES ($1, $1, $2, 'application/octet-stream', $3, $4, $5, $6)
      `, [accion.evidencia, `evidencias/p1/e3/${accion.evidencia}`, accion.cat, accion.notas || null, accionId, jesus]);
    }

    // ─── ETAPA 4: Análisis por grupos de ZMs ───────────────────
    const e4 = (await client.query(`
      INSERT INTO etapas (nombre, descripcion, orden, estado,
        tipo_meta, meta_valor, meta_unidad, porcentaje_calculado,
        fecha_inicio, fecha_fin, id_proyecto, id_dg, id_direccion_area, id_responsable)
      VALUES (
        'Análisis por grupos de Zonas Metropolitanas (28 grupos)',
        'Procesamiento de los 28 grupos de ZMs priorizados por necesidad. Escala 1:50,000. 3 días hábiles por grupo.',
        4, 'En_proceso',
        'Cuantitativa', 28, 'grupos procesados', 36,
        '2025-07-01', '2026-03-31', $1, $2, $3, $4
      ) RETURNING id
    `, [p1, dgotu, daot, jesus])).rows[0].id;

    // Acciones completadas de Etapa 4 (Grupos 1-9)
    const gruposCompletados = [
      { nombre: 'Grupo 1 — Oaxaca (Juchitán, Oaxaca, Salina Cruz, Tehuantepec)', fi: '2025-07-01', ff: '2025-07-15', evidencia: 'aptitud_grupo1_oaxaca.zip', notas: '4 ZMs terminadas. Incluye núcleos agrarios con 275.91ha viables (DGPV)' },
      { nombre: 'Grupo 2 — Chiapas (Tapachula, Tuxtla Gutiérrez)', fi: '2025-07-14', ff: '2025-07-18', evidencia: 'aptitud_grupo2_chiapas.zip', notas: null },
      { nombre: 'Grupo 3 — Veracruz Sur (Acayucan, Coatzacoalcos, Minatitlán)', fi: '2025-07-15', ff: '2025-07-22', evidencia: 'aptitud_grupo3_ver_sur.zip', notas: null },
      { nombre: 'Grupo 4 — Veracruz Centro-Norte (Córdoba, Orizaba, Poza Rica, Xalapa)', fi: '2025-07-22', ff: '2025-07-31', evidencia: 'aptitud_grupo4_ver_centro.zip', notas: null },
      { nombre: 'Grupo 5 — Tabasco y Puebla Sur (Villahermosa, Tehuacán, Teziutlán)', fi: '2025-08-01', ff: '2025-08-08', evidencia: 'aptitud_grupo5_tab_pue.zip', notas: null },
      { nombre: 'Grupo 6 — Valle de México y Estado de México Norte', fi: '2025-08-09', ff: '2025-08-15', evidencia: 'aptitud_grupo6_vallemex.zip', notas: 'Ciudad de México, Toluca, Tianguistenco' },
      { nombre: 'Grupo 7 — Hidalgo y Tlaxcala', fi: '2025-08-16', ff: '2025-08-22', evidencia: 'aptitud_grupo7_hgo_tlax.zip', notas: 'Pachuca, Tulancingo, Atitalaquia, Tlaxcala-Apizaco, Huamantla' },
      { nombre: 'Grupo 8 — Morelos y Puebla Norte', fi: '2025-08-23', ff: '2025-09-05', evidencia: 'aptitud_grupo8_mor_pue.zip', notas: 'Cuernavaca, Cuautla, Ozumba, San Martín Texmelucan, Huauchinango, Puebla-Tlaxcala' },
      { nombre: 'Grupo 9 — Tamaulipas (Tampico)', fi: '2025-09-08', ff: '2025-09-15', evidencia: 'aptitud_grupo9_tamps.zip', notas: null },
    ];

    for (const grupo of gruposCompletados) {
      const accionId = (await client.query(`
        INSERT INTO acciones (nombre, tipo, estado, porcentaje_avance, fecha_inicio, fecha_fin,
          id_etapa, id_proyecto, id_dg, id_direccion_area, id_responsable)
        VALUES ($1, 'Accion_programada', 'Completada', 100, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `, [grupo.nombre, grupo.fi, grupo.ff, e4, p1, dgotu, daot, jesus])).rows[0].id;

      await client.query(`
        INSERT INTO evidencias (nombre_archivo, nombre_original, ruta_minio, tipo_archivo, categoria, notas, id_accion, id_autor)
        VALUES ($1, $1, $2, 'application/zip', 'Geoespacial', $3, $4, $5)
      `, [grupo.evidencia, `evidencias/p1/e4/${grupo.evidencia}`, grupo.notas, accionId, jesus]);
    }

    // Acción 4.10 — En proceso
    await client.query(`
      INSERT INTO acciones (nombre, tipo, estado, porcentaje_avance, fecha_inicio, fecha_fin,
        id_etapa, id_proyecto, id_dg, id_direccion_area, id_responsable)
      VALUES ('Grupo 10 — Noreste (Monterrey y ZMs NL)',
        'Accion_programada', 'En_proceso', 60, '2025-09-16', '2025-10-05',
        $1, $2, $3, $4, $5)
    `, [e4, p1, dgotu, daot, jesus]);

    // Acciones pendientes de Etapa 4
    const gruposPendientes = [
      { nombre: 'Grupos 11-15 — Occidente (Jalisco, Colima, Nayarit)', fi: '2025-10-06', ff: '2025-11-15' },
      { nombre: 'Grupos 16-20 — Norte (Chihuahua, Sonora, Baja California)', fi: '2025-11-16', ff: '2026-01-15' },
      { nombre: 'Grupos 21-25 — Bajío y Centro (Guanajuato, Querétaro, SLP)', fi: '2026-01-16', ff: '2026-02-28' },
      { nombre: 'Grupos 26-28 — Sureste (Yucatán, Campeche, QRoo)', fi: '2026-03-01', ff: '2026-03-31' },
    ];

    for (const grupo of gruposPendientes) {
      await client.query(`
        INSERT INTO acciones (nombre, tipo, estado, porcentaje_avance, fecha_inicio, fecha_fin,
          id_etapa, id_proyecto, id_dg, id_direccion_area, id_responsable)
        VALUES ($1, 'Accion_programada', 'Pendiente', 0, $2, $3, $4, $5, $6, $7, $8)
      `, [grupo.nombre, grupo.fi, grupo.ff, e4, p1, dgotu, daot, jesus]);
    }

    // ─── ETAPA 5: Procesamiento RAN ────────────────────────────
    const e5 = (await client.query(`
      INSERT INTO etapas (nombre, descripcion, orden, estado, porcentaje_calculado,
        fecha_inicio, fecha_fin, depende_de,
        id_proyecto, id_dg, id_responsable)
      VALUES (
        'Procesamiento RAN — cruce con parcelas y solares',
        'El RAN cruza la capa de aptitud DAOT con la delimitación de parcelas y solares de los núcleos agrarios. 1 día hábil por grupo.',
        5, 'En_proceso', 36,
        '2025-07-16', '2026-04-15', $1,
        $2, $3, $4
      ) RETURNING id
    `, [e4, p1, dgotu, enlaceRAN])).rows[0].id;

    // Acción 5.1 completada con evidencia
    const a5_1 = (await client.query(`
      INSERT INTO acciones (nombre, tipo, estado, porcentaje_avance, fecha_inicio, fecha_fin,
        id_etapa, id_proyecto, id_dg, id_responsable)
      VALUES ('RAN — cruce parcelas y solares Grupo 1 Oaxaca',
        'Accion_programada', 'Completada', 100, '2025-07-16', '2025-07-17',
        $1, $2, $3, $4) RETURNING id
    `, [e5, p1, dgotu, enlaceRAN])).rows[0].id;

    await client.query(`
      INSERT INTO evidencias (nombre_archivo, nombre_original, ruta_minio, tipo_archivo, categoria, id_accion, id_autor)
      VALUES ('RAN_cruce_parcelas_grupo1_oaxaca.zip', 'RAN_cruce_parcelas_grupo1_oaxaca.zip',
        'evidencias/p1/e5/RAN_cruce_parcelas_grupo1_oaxaca.zip', 'application/zip', 'Geoespacial', $1, $2)
    `, [a5_1, enlaceRAN]);

    // Acciones RAN grupos 2-9 completadas (sin evidencia detallada)
    for (let i = 2; i <= 9; i++) {
      await client.query(`
        INSERT INTO acciones (nombre, tipo, estado, porcentaje_avance, fecha_inicio, fecha_fin,
          id_etapa, id_proyecto, id_dg, id_responsable)
        VALUES ($1, 'Accion_programada', 'Completada', 100, $2, $3, $4, $5, $6, $7)
      `, [`RAN — cruce parcelas y solares Grupo ${i}`, `2025-07-${15 + i}`, `2025-07-${16 + i}`, e5, p1, dgotu, enlaceRAN]);
    }

    // Acciones RAN pendientes
    await client.query(`
      INSERT INTO acciones (nombre, tipo, estado, porcentaje_avance, fecha_inicio, fecha_fin,
        id_etapa, id_proyecto, id_dg, id_responsable)
      VALUES ('RAN — cruce parcelas y solares Grupo 10', 'Accion_programada', 'Pendiente', 0,
        '2025-10-06', '2025-10-07', $1, $2, $3, $4)
    `, [e5, p1, dgotu, enlaceRAN]);

    // ─── ETAPA 6: Determinación de viabilidad DGPV ─────────────
    const e6 = (await client.query(`
      INSERT INTO etapas (nombre, descripcion, orden, estado, porcentaje_calculado,
        fecha_inicio, fecha_fin, depende_de,
        id_proyecto, id_dg, id_responsable)
      VALUES (
        'Determinación de viabilidad por vocación — DGPV',
        'Evaluación multifactorial de predios con 5 categorías ponderadas: Riesgos (20%), Restricciones (10%), Equipamiento (10%), Conectividad (20%), Servicios básicos (40%). 15 días hábiles por grupo.',
        6, 'En_proceso', 4,
        '2025-07-18', '2026-12-31', $1,
        $2, $3, $4
      ) RETURNING id
    `, [e5, p1, dgpv, enlaceDGPV])).rows[0].id;

    const a6_1 = (await client.query(`
      INSERT INTO acciones (nombre, tipo, estado, porcentaje_avance, fecha_inicio, fecha_fin,
        id_etapa, id_proyecto, id_dg, id_responsable)
      VALUES ('DGPV — evaluación viabilidad 4 ZMs Oaxaca',
        'Accion_programada', 'Completada', 100, '2025-07-18', '2025-08-01',
        $1, $2, $3, $4) RETURNING id
    `, [e6, p1, dgpv, enlaceDGPV])).rows[0].id;

    await client.query(`
      INSERT INTO evidencias (nombre_archivo, nombre_original, ruta_minio, tipo_archivo, categoria, notas, id_accion, id_autor)
      VALUES ('DGPV_viabilidad_oaxaca_4ZMs.pdf', 'DGPV_viabilidad_oaxaca_4ZMs.pdf',
        'evidencias/p1/e6/DGPV_viabilidad_oaxaca_4ZMs.pdf', 'application/pdf', 'Estudios',
        '676 parcelas y 47 solares. 275.91 ha viables. 617.29 ha con consideraciones', $1, $2)
    `, [a6_1, enlaceDGPV]);

    await client.query(`
      INSERT INTO acciones (nombre, tipo, estado, porcentaje_avance, fecha_inicio, fecha_fin,
        id_etapa, id_proyecto, id_dg, id_responsable)
      VALUES ('DGPV — evaluación viabilidad Grupos 2-5',
        'Accion_programada', 'En_proceso', 30, '2025-08-05', '2025-11-15',
        $1, $2, $3, $4)
    `, [e6, p1, dgpv, enlaceDGPV]);

    await client.query(`
      INSERT INTO acciones (nombre, tipo, estado, porcentaje_avance, fecha_inicio, fecha_fin,
        id_etapa, id_proyecto, id_dg, id_responsable)
      VALUES ('DGPV — evaluación viabilidad Grupos 6-15',
        'Accion_programada', 'Pendiente', 0, '2025-11-16', '2026-04-30',
        $1, $2, $3, $4)
    `, [e6, p1, dgpv, enlaceDGPV]);

    await client.query(`
      INSERT INTO acciones (nombre, tipo, estado, porcentaje_avance, fecha_inicio, fecha_fin,
        id_etapa, id_proyecto, id_dg, id_responsable)
      VALUES ('DGPV — evaluación viabilidad Grupos 16-28',
        'Accion_programada', 'Pendiente', 0, '2026-05-01', '2026-12-31',
        $1, $2, $3, $4)
    `, [e6, p1, dgpv, enlaceDGPV]);

    // ─── ETAPA 7: Integración de resultados ────────────────────
    const e7 = (await client.query(`
      INSERT INTO etapas (nombre, descripcion, orden, estado, porcentaje_calculado,
        fecha_inicio, fecha_fin, depende_de,
        id_proyecto, id_dg, id_direccion_area, id_responsable)
      VALUES (
        'Integración de resultados y entrega final',
        'Consolidación de todos los productos y entrega formal.',
        7, 'Pendiente', 0,
        '2027-01-01', '2027-03-01', $1,
        $2, $3, $4, $5
      ) RETURNING id
    `, [e6, p1, dgotu, daot, jesus])).rows[0].id;

    await client.query(`
      INSERT INTO acciones (nombre, tipo, estado, porcentaje_avance, fecha_inicio, fecha_fin,
        id_etapa, id_proyecto, id_dg, id_direccion_area, id_responsable)
      VALUES ('Consolidación de capa nacional de aptitud para vivienda',
        'Accion_programada', 'Pendiente', 0, '2027-01-01', '2027-01-31',
        $1, $2, $3, $4, $5)
    `, [e7, p1, dgotu, daot, jesus]);

    await client.query(`
      INSERT INTO acciones (nombre, tipo, estado, porcentaje_avance, fecha_inicio, fecha_fin,
        id_etapa, id_proyecto, id_dg, id_direccion_area, id_responsable)
      VALUES ('Reporte metodológico final',
        'Accion_programada', 'Pendiente', 0, '2027-02-01', '2027-02-28',
        $1, $2, $3, $4, $5)
    `, [e7, p1, dgotu, daot, jesus]);

    await client.query(`
      INSERT INTO acciones (nombre, tipo, estado, porcentaje_avance, fecha_inicio, fecha_fin,
        id_etapa, id_proyecto, id_dg, id_direccion_area, id_responsable)
      VALUES ('Entrega formal a RAN y DGPV — cierre del proyecto',
        'Hito', 'Pendiente', 0, '2027-03-01', '2027-03-01',
        $1, $2, $3, $4, $5)
    `, [e7, p1, dgotu, daot, jesus]);

    // ─── Riesgos del Proyecto 1 ────────────────────────────────
    await client.query(`
      INSERT INTO riesgos (titulo, descripcion, causa, nivel, tipo, estado, medida_mitigacion, entidad_tipo, entidad_id, id_responsable, id_reportador)
      VALUES (
        '57 ZMs sin instrumento de ordenamiento territorial',
        'La mayoría de las ZMs carecen de zonificación primaria, lo que obliga a usar exclusivamente la capa de restricción para filtrar áreas no aptas. El resultado es menos preciso que en ZMs con instrumento.',
        'Rezago histórico en elaboración de instrumentos de planeación municipal',
        'Medio', 'Riesgo', 'En_mitigacion',
        'Coordinar con DGOMR la priorización de instrumentos para ZMs clave',
        'Proyecto', $1, $2, $2
      )
    `, [p1, jesus]);

    await client.query(`
      INSERT INTO riesgos (titulo, descripcion, causa, nivel, tipo, estado, entidad_tipo, entidad_id, id_responsable, id_reportador)
      VALUES (
        'Cronograma de 420 días hábiles para completar el 100%',
        'El flujo DAOT → RAN → DGPV requiere aproximadamente 420 días hábiles para completar las 92 ZMs. Cualquier interrupción en algún eslabón paraliza el flujo completo.',
        'Cadena de dependencias entre DAOT, RAN y DGPV sin margen de error',
        'Alto', 'Riesgo', 'Abierto',
        'Proyecto', $1, $2, $2
      )
    `, [p1, jesus]);

    await client.query(`
      INSERT INTO riesgos (titulo, descripcion, causa, nivel, tipo, estado, medida_mitigacion, entidad_tipo, entidad_id, id_responsable, id_reportador)
      VALUES (
        'Insumos cartográficos incompletos para ZMs del norte',
        'Algunas ZMs del noreste presentan capas de uso de suelo desactualizadas que pueden generar errores topológicos en el procesamiento.',
        'Actualización rezagada de insumos INEGI en estados del norte',
        'Medio', 'Problema', 'En_mitigacion',
        'Usar Serie VII de INEGI como insumo alternativo donde Serie VIII no esté disponible',
        'Etapa', $1, $2, $2
      )
    `, [e4, jesus]);

    // ─── Comentarios del Proyecto 1 ────────────────────────────
    const comentario1 = (await client.query(`
      INSERT INTO comentarios (entidad_tipo, entidad_id, contenido, id_autor, created_at)
      VALUES ('Etapa', $1,
        'Se implementó la automatización en Python para los grupos restantes. El script procesa de forma reproducible: zonificación primaria + núcleos agrarios + 9 capas de restricción → aptitud. Tiempo estimado de procesamiento por grupo: 3 días hábiles.',
        $2, '2025-08-05')
      RETURNING id
    `, [e4, jesus])).rows[0].id;

    await client.query(`
      INSERT INTO comentarios (entidad_tipo, entidad_id, contenido, id_autor, id_comentario_padre, created_at)
      VALUES ('Etapa', $1,
        'Confirmamos que la zonificación primaria de los 16 grupos con ZPZM ya está disponible en la carpeta compartida de Drive. Las ZMs sin instrumento usarán solo la capa de restricción.',
        $2, $3, '2025-08-06')
    `, [e4, enlaceDGOMR, comentario1]);

    await client.query(`
      INSERT INTO comentarios (entidad_tipo, entidad_id, contenido, id_autor, created_at)
      VALUES ('Accion', $1,
        'Resultados del análisis multifactorial para las 4 ZMs de Oaxaca: de 676 parcelas y 47 solares evaluados, 275.91 ha resultaron viables y 617.29 ha son viables con consideraciones adicionales (principalmente conectividad y servicios).',
        $2, '2025-08-01')
    `, [a6_1, enlaceDGPV]);

    // ═══════════════════════════════════════════════════════════
    // PROYECTO 2: República Conectada
    // ═══════════════════════════════════════════════════════════
    const p2 = (await client.query(`
      INSERT INTO proyectos (
        nombre, tipo, estado, meta_descripcion,
        tiene_indicador,
        es_prioritario, fecha_inicio, fecha_limite,
        porcentaje_calculado, id_dg_lider, id_direccion_area_lider,
        id_creador, id_programa
      ) VALUES (
        'República Conectada — Análisis de aptitud territorial para infraestructura de telecomunicaciones',
        'Analisis_tecnico', 'En_proceso',
        'Identificar y priorizar 500 localidades rurales sin conectividad con mayor aptitud territorial para la instalación de infraestructura de telecomunicaciones, considerando restricciones ambientales, de riesgo y de conectividad vial.',
        true,
        true, '2025-02-01', '2026-06-30',
        0, $1, $2, $3, $4
      ) RETURNING id
    `, [dgotu, daot, jesus, programaConectada])).rows[0].id;

    // ─── Indicadores del Proyecto 2 (tabla indicadores) ──────
    await client.query(`
      INSERT INTO indicadores (id_proyecto, nombre, tipo, unidad, unidad_personalizada,
        acumulacion, meta_global, valor_actual, temporalidad, orden, descripcion)
      VALUES ($1, 'Localidades analizadas',
        'Avance_fisico', 'Numero', 'localidades',
        'Suma', 500, 215, 'Global', 1,
        'Localidades rurales sin conectividad procesadas con análisis de aptitud territorial')
    `, [p2]);

    // DGs participantes Proyecto 2
    await client.query(`
      INSERT INTO proyecto_dgs (id_proyecto, id_dg, id_direccion_area, rol_en_proyecto, id_responsable)
      VALUES ($1, $2, $3, 'Lider', $4)
    `, [p2, dgotu, daot, jesus]);

    await client.query(`
      INSERT INTO proyecto_dgs (id_proyecto, id_dg, rol_en_proyecto, id_responsable)
      VALUES ($1, $2, 'Colaboradora', $3)
    `, [p2, dgomr, enlaceDGOMR]);

    // Etapa 1 de P2: Definición metodológica — Completada
    const p2e1 = (await client.query(`
      INSERT INTO etapas (nombre, descripcion, orden, estado, porcentaje_calculado,
        fecha_inicio, fecha_fin, id_proyecto, id_dg, id_direccion_area, id_responsable)
      VALUES (
        'Definición metodológica',
        'Establecimiento de criterios de aptitud territorial para infraestructura de telecomunicaciones.',
        1, 'Completada', 100,
        '2025-02-01', '2025-03-31', $1, $2, $3, $4
      ) RETURNING id
    `, [p2, dgotu, daot, jesus])).rows[0].id;

    const accionesP2E1 = [
      { nombre: 'Revisión bibliográfica de criterios de aptitud', fi: '2025-02-01', ff: '2025-02-15', evidencia: 'revision_bibliografica_telecom.pdf', cat: 'Estudios' },
      { nombre: 'Definición de variables de restricción y ponderación', fi: '2025-02-16', ff: '2025-03-10', evidencia: 'variables_restriccion_telecom.pdf', cat: 'Estudios' },
      { nombre: 'Validación metodológica con DGOMR', fi: '2025-03-11', ff: '2025-03-31', evidencia: 'validacion_metodologica_DGOMR.pdf', cat: 'Minutas' },
    ];

    for (const accion of accionesP2E1) {
      const accionId = (await client.query(`
        INSERT INTO acciones (nombre, tipo, estado, porcentaje_avance, fecha_inicio, fecha_fin,
          id_etapa, id_proyecto, id_dg, id_direccion_area, id_responsable)
        VALUES ($1, 'Accion_programada', 'Completada', 100, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `, [accion.nombre, accion.fi, accion.ff, p2e1, p2, dgotu, daot, jesus])).rows[0].id;

      await client.query(`
        INSERT INTO evidencias (nombre_archivo, nombre_original, ruta_minio, tipo_archivo, categoria, id_accion, id_autor)
        VALUES ($1, $1, $2, 'application/pdf', $3, $4, $5)
      `, [accion.evidencia, `evidencias/p2/e1/${accion.evidencia}`, accion.cat, accionId, jesus]);
    }

    // Etapa 2 de P2: Procesamiento geoespacial — En_proceso
    const p2e2 = (await client.query(`
      INSERT INTO etapas (nombre, descripcion, orden, estado, porcentaje_calculado,
        fecha_inicio, fecha_fin, id_proyecto, id_dg, id_direccion_area, id_responsable)
      VALUES (
        'Procesamiento geoespacial por entidad federativa',
        'Análisis de aptitud territorial para localidades sin conectividad por entidad federativa.',
        2, 'En_proceso', 43,
        '2025-04-01', '2026-03-31', $1, $2, $3, $4
      ) RETURNING id
    `, [p2, dgotu, daot, jesus])).rows[0].id;

    // 2 completadas
    const accionesP2E2Completadas = [
      { nombre: 'Procesamiento Oaxaca y Chiapas (85 localidades)', fi: '2025-04-01', ff: '2025-05-15' },
      { nombre: 'Procesamiento Veracruz y Tabasco (130 localidades)', fi: '2025-05-16', ff: '2025-07-15' },
    ];

    for (const accion of accionesP2E2Completadas) {
      await client.query(`
        INSERT INTO acciones (nombre, tipo, estado, porcentaje_avance, fecha_inicio, fecha_fin,
          id_etapa, id_proyecto, id_dg, id_direccion_area, id_responsable)
        VALUES ($1, 'Accion_programada', 'Completada', 100, $2, $3, $4, $5, $6, $7, $8)
      `, [accion.nombre, accion.fi, accion.ff, p2e2, p2, dgotu, daot, jesus]);
    }

    // 1 en proceso
    await client.query(`
      INSERT INTO acciones (nombre, tipo, estado, porcentaje_avance, fecha_inicio, fecha_fin,
        id_etapa, id_proyecto, id_dg, id_direccion_area, id_responsable)
      VALUES ('Procesamiento Centro y Bajío (185 localidades)',
        'Accion_programada', 'En_proceso', 40, '2025-07-16', '2025-11-30',
        $1, $2, $3, $4, $5)
    `, [p2e2, p2, dgotu, daot, jesus]);

    // 1 bloqueada
    await client.query(`
      INSERT INTO acciones (nombre, tipo, estado, porcentaje_avance, motivo_bloqueo, fecha_inicio, fecha_fin,
        id_etapa, id_proyecto, id_dg, id_direccion_area, id_responsable)
      VALUES ('Integración datos socioeconómicos CONEVAL',
        'Accion_programada', 'Bloqueada', 0,
        'En espera de convenio de colaboración con CONEVAL para acceso a datos de carencia por acceso a internet 2024',
        '2025-08-01', '2025-12-31',
        $1, $2, $3, $4, $5)
    `, [p2e2, p2, dgotu, daot, jesus]);

    // Etapa 3 de P2: Productos finales — Pendiente
    const p2e3 = (await client.query(`
      INSERT INTO etapas (nombre, descripcion, orden, estado, porcentaje_calculado,
        fecha_inicio, fecha_fin, id_proyecto, id_dg, id_direccion_area, id_responsable)
      VALUES (
        'Productos finales y entrega',
        'Consolidación de productos y entrega de resultados.',
        3, 'Pendiente', 0,
        '2026-04-01', '2026-06-30', $1, $2, $3, $4
      ) RETURNING id
    `, [p2, dgotu, daot, jesus])).rows[0].id;

    await client.query(`
      INSERT INTO acciones (nombre, tipo, estado, porcentaje_avance, fecha_inicio, fecha_fin,
        id_etapa, id_proyecto, id_dg, id_direccion_area, id_responsable)
      VALUES ('Mapa nacional de aptitud para telecomunicaciones',
        'Accion_programada', 'Pendiente', 0, '2026-04-01', '2026-05-31',
        $1, $2, $3, $4, $5)
    `, [p2e3, p2, dgotu, daot, jesus]);

    await client.query(`
      INSERT INTO acciones (nombre, tipo, estado, porcentaje_avance, fecha_inicio, fecha_fin,
        id_etapa, id_proyecto, id_dg, id_direccion_area, id_responsable)
      VALUES ('Reporte final y entrega a DGTIC',
        'Accion_programada', 'Pendiente', 0, '2026-06-01', '2026-06-30',
        $1, $2, $3, $4, $5)
    `, [p2e3, p2, dgotu, daot, jesus]);

    // Riesgo del Proyecto 2
    await client.query(`
      INSERT INTO riesgos (titulo, descripcion, causa, nivel, tipo, estado, entidad_tipo, entidad_id, id_responsable, id_reportador)
      VALUES (
        'Convenio CONEVAL pendiente de firma',
        'El acceso a datos de carencia por acceso a internet 2024 depende de un convenio de colaboración con CONEVAL que aún no se ha formalizado.',
        'Trámite administrativo pendiente entre SEDATU y CONEVAL',
        'Alto', 'Problema', 'Abierto',
        'Etapa', $1, $2, $2
      )
    `, [p2e2, jesus]);

    // ─── Recalcular porcentajes de ambos proyectos ─────────────
    // Proyecto 1: promedio de 7 etapas
    // E1=100, E2=100, E3=100, E4=36, E5=36, E6=4, E7=0 → ~53.71
    const p1Porcentaje = (100 + 100 + 100 + 36 + 36 + 4 + 0) / 7;
    await client.query(
      'UPDATE proyectos SET porcentaje_calculado = $1 WHERE id = $2',
      [p1Porcentaje.toFixed(2), p1]
    );

    // Proyecto 2: promedio de 3 etapas
    // E1=100, E2=43, E3=0 → ~47.67
    const p2Porcentaje = (100 + 43 + 0) / 3;
    await client.query(
      'UPDATE proyectos SET porcentaje_calculado = $1 WHERE id = $2',
      [p2Porcentaje.toFixed(2), p2]
    );

    // ─── Notificaciones de ejemplo ─────────────────────────────
    await client.query(`
      INSERT INTO notificaciones (tipo, mensaje, entidad_tipo, entidad_id, id_usuario)
      VALUES
        ('Vencimiento', 'La acción "Grupo 10 — Noreste" vence el 5 de octubre de 2025', 'Accion', $1, $2),
        ('Riesgo', 'Nuevo riesgo reportado: Insumos cartográficos incompletos para ZMs del norte', 'Etapa', $3, $2),
        ('AccionBloqueada', 'La acción "Integración datos socioeconómicos CONEVAL" fue bloqueada', 'Accion', $4, $2)
    `, [e4, jesus, e4, p2e2]);

    await client.query('COMMIT');

    console.log('  ✓ Proyecto 1: Análisis de aptitud territorial (7 etapas, ~40 acciones)');
    console.log('  ✓ Proyecto 2: República Conectada (3 etapas, ~9 acciones)');
    console.log('  ✓ Riesgos: 4');
    console.log('  ✓ Comentarios: 3');
    console.log('  ✓ Notificaciones: 3');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = seedProyectosEjemplo;
