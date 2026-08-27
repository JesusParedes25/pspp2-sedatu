/**
 * ARCHIVO: duplicar.queries.js
 * PROPÓSITO: Duplicar la ESTRUCTURA de un proyecto existente hacia uno
 *            nuevo — varios proyectos repiten el mismo armazón de
 *            etapas/acciones/tareas y capturarlo de cero cada vez es
 *            trabajo mecánico.
 *
 * MINI-CLASE: copiar estructura, no historia
 * ─────────────────────────────────────────────────────────────────
 * El proyecto nuevo arranca EN BLANCO en todo lo que representa
 * trabajo ya hecho: estado Pendiente, avance 0, sin semáforo, sin
 * comentarios, riesgos, actividad ni bitácora. Copiar eso haría que
 * el proyecto nuevo naciera mintiendo sobre su progreso.
 *
 * Lo que sí viaja es la forma: la jerarquía completa y los datos que
 * la describen (nombres, descripciones, tipos, prioridades, orden,
 * pesos, metas). Lo demás es opcional y lo decide quien duplica:
 * fechas, territorio, indicadores, participantes y archivos.
 *
 * Todo ocurre en UNA transacción: si algo falla a medio camino no
 * queda un proyecto a medias que alguien tenga que limpiar a mano.
 * ─────────────────────────────────────────────────────────────────
 */
const pool = require('../pool');
const { minioClient, BUCKET } = require('../../utils/minio');
const { recalcularPesosEtapa } = require('./acciones.queries');
const { recalcularEtapa, recalcularProyecto } = require('../../utils/recalculos');
const { sincronizarCobertura } = require('./cobertura-sync.queries');

// Campos del proyecto que describen QUÉ es (viajan siempre). Se dejan
// fuera a propósito: estado y porcentaje_calculado (progreso), fechas
// (opcionales), id_creador (lo es quien duplica), imagen_url (la portada
// es identidad visual del original) y deleted_at.
const CAMPOS_PROYECTO = [
  'descripcion', 'tipo', 'meta_descripcion', 'es_prioritario', 'ciclo_anual',
  'dependencia_externa', 'descripcion_dependencia', 'tiene_subproyectos',
  'id_dg_lider', 'id_direccion_area_lider', 'id_programa', 'categoria',
  'instrumento', 'escala_territorial', 'fase_actual', 'financiamiento',
  'ejercicio_fiscal', 'instancia_solicitante', 'prioridad', 'observaciones',
  'columnas_schema',
];

/**
 * @param {string} idOrigen  proyecto a copiar
 * @param {object} opciones  { nombre, incluir: {fechas, territorio, indicadores, participantes, archivos} }
 * @param {string} creadorId usuario que duplica — queda como creador y responsable
 */
async function duplicarProyecto(idOrigen, opciones, creadorId) {
  const incluir = opciones.incluir || {};
  const client = await pool.connect();
  // Objetos ya copiados en MinIO: si la transacción se cae hay que
  // borrarlos, porque MinIO no participa del rollback de Postgres.
  const objetosCopiados = [];

  try {
    await client.query('BEGIN');

    const { rows: [origen] } = await client.query(
      'SELECT * FROM proyectos WHERE id = $1 AND deleted_at IS NULL', [idOrigen]
    );
    if (!origen) {
      const err = new Error('El proyecto que intentas duplicar no existe');
      err.statusCode = 404;
      err.codigo = 'NO_ENCONTRADO';
      throw err;
    }

    // ─── 1. El proyecto ───
    const columnas = [...CAMPOS_PROYECTO];
    const valores = CAMPOS_PROYECTO.map(c => origen[c]);
    if (incluir.fechas) {
      columnas.push('fecha_inicio', 'fecha_limite');
      valores.push(origen.fecha_inicio, origen.fecha_limite);
    }
    columnas.push('nombre', 'id_creador', 'estado', 'porcentaje_calculado');
    valores.push(opciones.nombre, creadorId, 'Pendiente', 0);

    const marcadores = valores.map((_, i) => `$${i + 1}`).join(',');
    const { rows: [nuevo] } = await client.query(
      `INSERT INTO proyectos (${columnas.join(',')}) VALUES (${marcadores}) RETURNING *`,
      valores
    );

    // Mismo armado que crearProyecto: DG líder y el creador como
    // responsable (de esa fila dependen los permisos de gestión).
    await client.query(`
      INSERT INTO proyecto_dgs (id_proyecto, id_dg, id_direccion_area, rol_en_proyecto, id_responsable)
      VALUES ($1, $2, $3, 'Lider', $4)
    `, [nuevo.id, nuevo.id_dg_lider, nuevo.id_direccion_area_lider, creadorId]);

    await client.query(`
      INSERT INTO proyecto_usuarios (id_proyecto, id_usuario, rol, estado, aceptado_en)
      VALUES ($1, $2, 'responsable', 'aceptada', NOW())
      ON CONFLICT (id_proyecto, id_usuario) DO NOTHING
    `, [nuevo.id, creadorId]);

    if (incluir.participantes) {
      // Quien duplica ya quedó arriba como responsable; el ON CONFLICT
      // evita degradarlo si en el original era solo colaborador.
      await client.query(`
        -- Se conserva el estado que traían en el original: a quien ya
        -- había aceptado participar no se le vuelve a preguntar, y quien
        -- tenía la invitación pendiente sigue pendiente en la copia.
        INSERT INTO proyecto_usuarios (id_proyecto, id_usuario, rol, invitado_por, estado, aceptado_en)
        SELECT $1, id_usuario, rol, $2, estado, aceptado_en
          FROM proyecto_usuarios WHERE id_proyecto = $3
        ON CONFLICT (id_proyecto, id_usuario) DO NOTHING
      `, [nuevo.id, creadorId, idOrigen]);
    }

    // ─── 2. Etapas ───
    const mapaEtapas = new Map();   // id viejo -> id nuevo
    const { rows: etapas } = await client.query(
      'SELECT * FROM etapas WHERE id_proyecto = $1 ORDER BY orden NULLS LAST, created_at', [idOrigen]
    );
    for (const e of etapas) {
      const { rows: [nuevaEtapa] } = await client.query(`
        INSERT INTO etapas (
          id_proyecto, nombre, descripcion, orden, tipo, prioridad,
          tipo_meta, meta_descripcion, meta_valor, meta_unidad,
          instancia_responsable, enlace_responsable, observaciones,
          escala_territorial, instrumento, campos_extra,
          id_dg, id_direccion_area,
          fecha_inicio, fecha_fin, fecha_limite,
          cve_ent, cve_mun, id_zm, id_responsable,
          estado, avance_actual, avance_override, semaforo_override, porcentaje_calculado
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
          $19,$20,$21,$22,$23,$24,$25,
          'Pendiente', 0, false, false, 0
        ) RETURNING id
      `, [
        nuevo.id, e.nombre, e.descripcion, e.orden, e.tipo, e.prioridad,
        e.tipo_meta, e.meta_descripcion, e.meta_valor, e.meta_unidad,
        e.instancia_responsable, e.enlace_responsable, e.observaciones,
        e.escala_territorial, e.instrumento, e.campos_extra,
        e.id_dg, e.id_direccion_area,
        incluir.fechas ? e.fecha_inicio : null,
        incluir.fechas ? e.fecha_fin : null,
        incluir.fechas ? e.fecha_limite : null,
        incluir.territorio ? e.cve_ent : null,
        incluir.territorio ? e.cve_mun : null,
        incluir.territorio ? e.id_zm : null,
        incluir.participantes ? e.id_responsable : null,
      ]);
      mapaEtapas.set(e.id, nuevaEtapa.id);
    }

    // depende_de apunta a otra etapa: se resuelve al final, cuando ya
    // existen todas las nuevas.
    for (const e of etapas) {
      if (e.depende_de && mapaEtapas.has(e.depende_de)) {
        await client.query('UPDATE etapas SET depende_de = $1 WHERE id = $2',
          [mapaEtapas.get(e.depende_de), mapaEtapas.get(e.id)]);
      }
    }

    // ─── 3. Acciones y subacciones ───
    // Las subacciones cuelgan de otra acción (id_accion_padre), así que se
    // insertan las raíz primero para que el padre ya exista en el mapa.
    const mapaAcciones = new Map();
    const { rows: acciones } = await client.query(`
      SELECT * FROM acciones WHERE id_proyecto = $1 OR id_etapa = ANY($2::uuid[])
      ORDER BY (id_accion_padre IS NOT NULL), created_at
    `, [idOrigen, etapas.map(e => e.id)]);

    for (const a of acciones) {
      const { rows: [nuevaAccion] } = await client.query(`
        INSERT INTO acciones (
          id_proyecto, id_etapa, id_accion_padre, nombre, descripcion, tipo,
          prioridad, peso_porcentaje, instancia_responsable, enlace_responsable,
          observaciones, escala_territorial, instrumento, campos_extra,
          id_dg, id_direccion_area,
          fecha_inicio, fecha_fin, fecha_limite,
          cve_ent, cve_mun, id_zm, id_responsable,
          estado, porcentaje_avance, avance_actual, avance_override, semaforo_override
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
          $17,$18,$19,$20,$21,$22,$23,
          'Pendiente', 0, 0, false, false
        ) RETURNING id
      `, [
        a.id_proyecto ? nuevo.id : null,
        a.id_etapa ? mapaEtapas.get(a.id_etapa) || null : null,
        a.id_accion_padre ? mapaAcciones.get(a.id_accion_padre) || null : null,
        a.nombre, a.descripcion, a.tipo, a.prioridad, a.peso_porcentaje,
        a.instancia_responsable, a.enlace_responsable, a.observaciones,
        a.escala_territorial, a.instrumento, a.campos_extra,
        a.id_dg, a.id_direccion_area,
        incluir.fechas ? a.fecha_inicio : null,
        incluir.fechas ? a.fecha_fin : null,
        incluir.fechas ? a.fecha_limite : null,
        incluir.territorio ? a.cve_ent : null,
        incluir.territorio ? a.cve_mun : null,
        incluir.territorio ? a.id_zm : null,
        incluir.participantes ? a.id_responsable : null,
      ]);
      mapaAcciones.set(a.id, nuevaAccion.id);
    }

    // ─── 4. Tareas ───
    const mapaTareas = new Map();
    if (mapaAcciones.size > 0) {
      const { rows: tareas } = await client.query(
        'SELECT * FROM tareas WHERE id_accion = ANY($1::uuid[]) ORDER BY orden NULLS LAST, created_at',
        [[...mapaAcciones.keys()]]
      );
      for (const t of tareas) {
        const { rows: [nuevaTarea] } = await client.query(`
          INSERT INTO tareas (
            id_accion, nombre, descripcion, prioridad, orden, observaciones,
            fecha_inicio, fecha_limite, cve_ent, id_responsable,
            estado, avance_actual, avance_override, semaforo_override
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Pendiente',0,false,false)
          RETURNING id
        `, [
          mapaAcciones.get(t.id_accion), t.nombre, t.descripcion, t.prioridad,
          t.orden, t.observaciones,
          incluir.fechas ? t.fecha_inicio : null,
          incluir.fechas ? t.fecha_limite : null,
          incluir.territorio ? t.cve_ent : null,
          incluir.participantes ? t.id_responsable : null,
        ]);
        mapaTareas.set(t.id, nuevaTarea.id);
      }
    }

    // ─── 5. Territorio a nivel de municipios ───
    if (incluir.territorio) {
      const copiarMunicipios = async (tabla, columna, mapa) => {
        for (const [viejo, nuevoId] of mapa) {
          await client.query(
            `INSERT INTO ${tabla} (${columna}, cve_mun)
             SELECT $1, cve_mun FROM ${tabla} WHERE ${columna} = $2`,
            [nuevoId, viejo]
          );
        }
      };
      await copiarMunicipios('etapa_municipios', 'etapa_id', mapaEtapas);
      await copiarMunicipios('accion_municipios', 'accion_id', mapaAcciones);
      await copiarMunicipios('tarea_municipios', 'tarea_id', mapaTareas);

      // Espejo en cobertura_geografica (dashboard/Panorama/Vista Lista): el
      // territorio ya quedó copiado arriba en cve_ent/*_municipios, pero esa
      // tabla es un mirror aparte que nadie llena solo — sin esto, un
      // proyecto duplicado con "Territorio" activado se ve sin ubicación en
      // esas tres pantallas hasta que alguien vuelva a guardar el territorio
      // a mano en cada nodo. Nodos en modo Zona Metropolitana (id_zm) se
      // omiten a propósito, igual que en el PATCH manual (ver
      // acciones.controller.js/etapas.controller.js): esa tabla no soporta
      // ZM, solo estado/municipio.
      const sincronizarNodosCopiados = async (tipoNodo, tablaNodo, tablaMun, columnaMun, mapa) => {
        for (const nuevoId of mapa.values()) {
          const { rows: [nodo] } = await client.query(`SELECT cve_ent FROM ${tablaNodo} WHERE id = $1`, [nuevoId]);
          if (!nodo?.cve_ent) continue;
          const { rows: munis } = await client.query(
            `SELECT cve_mun FROM ${tablaMun} WHERE ${columnaMun} = $1`, [nuevoId]
          );
          await sincronizarCobertura(client, tipoNodo, nuevoId, nodo.cve_ent, munis.map(m => m.cve_mun));
        }
      };
      await sincronizarNodosCopiados('etapa', 'etapas', 'etapa_municipios', 'etapa_id', mapaEtapas);
      await sincronizarNodosCopiados('accion', 'acciones', 'accion_municipios', 'accion_id', mapaAcciones);
      await sincronizarNodosCopiados('tarea', 'tareas', 'tarea_municipios', 'tarea_id', mapaTareas);
    }

    // ─── 6. Indicadores ───
    // Viaja la DEFINICIÓN y la meta; el valor logrado no, igual que el
    // avance de los nodos. Las aportaciones registradas (accion_indicador,
    // indicador_aportaciones) tampoco: son historia del original.
    if (incluir.indicadores) {
      const { rows: indicadores } = await client.query(
        'SELECT * FROM indicadores WHERE id_proyecto = $1 ORDER BY orden NULLS LAST, created_at', [idOrigen]
      );
      for (const ind of indicadores) {
        const { rows: [nuevoInd] } = await client.query(`
          INSERT INTO indicadores (
            id_proyecto, id_etapa, nombre, tipo, unidad, unidad_personalizada,
            etiqueta_unidad, meta_global, temporalidad, anio_inicio, anio_fin,
            descripcion, orden, activo, modo_calculo, es_publicable, valor_actual,
            id_catalogo, id_creador
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,0,$17,$18)
          RETURNING id
        `, [
          nuevo.id,
          ind.id_etapa ? mapaEtapas.get(ind.id_etapa) || null : null,
          ind.nombre, ind.tipo, ind.unidad, ind.unidad_personalizada,
          ind.etiqueta_unidad, ind.meta_global, ind.temporalidad,
          ind.anio_inicio, ind.anio_fin, ind.descripcion, ind.orden,
          ind.activo, ind.modo_calculo, ind.es_publicable,
          // El vínculo al catálogo viaja (es la identidad del indicador);
          // el autor pasa a ser quien duplica, que es quien lo dio de alta
          // en ESTE proyecto.
          ind.id_catalogo || null, creadorId,
        ]);

        await client.query(`
          INSERT INTO indicador_metas_anuales (id_indicador, anio, meta, valor_actual)
          SELECT $1, anio, meta, 0 FROM indicador_metas_anuales WHERE id_indicador = $2
        `, [nuevoInd.id, ind.id]);

        const { rows: vinculos } = await client.query(
          'SELECT * FROM indicador_etapas WHERE id_indicador = $1', [ind.id]
        );
        for (const v of vinculos) {
          const etapaNueva = mapaEtapas.get(v.id_etapa);
          if (!etapaNueva) continue;
          await client.query(`
            INSERT INTO indicador_etapas (id_indicador, id_etapa, meta_etapa, valor_actual)
            VALUES ($1, $2, $3, 0)
          `, [nuevoInd.id, etapaNueva, v.meta_etapa]);
        }
      }
    }

    // ─── 7. Participantes por nodo ───
    if (incluir.participantes) {
      const porTipo = [['etapa', mapaEtapas], ['accion', mapaAcciones], ['tarea', mapaTareas]];
      for (const [tipoNodo, mapa] of porTipo) {
        for (const [viejo, nuevoId] of mapa) {
          await client.query(`
            INSERT INTO nodo_miembros (tipo_nodo, id_nodo, id_usuario, rol, id_invitado_por)
            SELECT tipo_nodo, $1, id_usuario, rol, $2
              FROM nodo_miembros WHERE tipo_nodo = $3 AND id_nodo = $4
          `, [nuevoId, creadorId, tipoNodo, viejo]);
        }
      }
    }

    // ─── 8. Archivos ───
    // Cada copia necesita su PROPIO objeto en MinIO: borrar una evidencia
    // hace removeObject, así que dos filas apuntando a la misma ruta harían
    // que borrar la copia dejara al original sin archivo.
    if (incluir.archivos) {
      const idsEtapa = [...mapaEtapas.keys()];
      const idsAccion = [...mapaAcciones.keys()];
      const { rows: evidencias } = await client.query(`
        SELECT * FROM evidencias
         WHERE (id_etapa = ANY($1::uuid[]) OR id_accion = ANY($2::uuid[]) OR id_subaccion = ANY($2::uuid[]))
           AND id_riesgo IS NULL
      `, [idsEtapa.length ? idsEtapa : [null], idsAccion.length ? idsAccion : [null]]);

      for (const ev of evidencias) {
        let rutaNueva = null;
        if (ev.ruta_minio) {
          rutaNueva = `${nuevo.id}/${Date.now()}-${ev.nombre_archivo}`;
          try {
            await minioClient.copyObject(BUCKET, rutaNueva, `/${BUCKET}/${ev.ruta_minio}`);
          } catch (errMinio) {
            // Sin esto el usuario recibía el error crudo del cliente MinIO
            // ("connect ECONNREFUSED ..."), que no le dice qué hacer.
            const e = new Error(
              'No se pudieron copiar los archivos adjuntos: el almacenamiento no está disponible. ' +
              'Vuelve a intentarlo, o duplica sin la opción "Archivos adjuntos".'
            );
            e.statusCode = 503;
            e.codigo = 'ALMACENAMIENTO_NO_DISPONIBLE';
            e.cause = errMinio;
            throw e;
          }
          objetosCopiados.push(rutaNueva);
        }
        await client.query(`
          INSERT INTO evidencias (
            nombre_archivo, nombre_original, ruta_minio, tipo_archivo, categoria,
            tamano_bytes, version, notas, fecha_generacion, url, tipo_medio,
            id_etapa, id_accion, id_subaccion, id_autor
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        `, [
          ev.nombre_archivo, ev.nombre_original, rutaNueva, ev.tipo_archivo,
          ev.categoria, ev.tamano_bytes, ev.version, ev.notas,
          ev.fecha_generacion, ev.url, ev.tipo_medio,
          ev.id_etapa ? mapaEtapas.get(ev.id_etapa) || null : null,
          ev.id_accion ? mapaAcciones.get(ev.id_accion) || null : null,
          ev.id_subaccion ? mapaAcciones.get(ev.id_subaccion) || null : null,
          creadorId,
        ]);
      }
    }

    await client.query('COMMIT');

    return {
      proyecto: nuevo,
      copiado: {
        etapas: mapaEtapas.size,
        acciones: mapaAcciones.size,
        tareas: mapaTareas.size,
      },
    };
  } catch (err) {
    await client.query('ROLLBACK');
    // Postgres ya revirtió; MinIO no sabe de transacciones.
    for (const ruta of objetosCopiados) {
      try { await minioClient.removeObject(BUCKET, ruta); } catch { /* mejor esfuerzo */ }
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Duplica una etapa DENTRO DEL MISMO PROYECTO, con toda su rama de
 * acciones/subacciones y tareas — el mismo criterio "copia independiente
 * y en blanco" que ya usa ModalDuplicarNodo para acción/tarea (mismo
 * nombre/descripción/tipo/prioridad, Pendiente, 0%, sin fechas ni
 * territorio ni participantes propios). A diferencia de acción/tarea, una
 * etapa no tiene varios padres posibles entre los que elegir —su único
 * contenedor es el proyecto, que ya está fijo— así que no hace falta un
 * selector de destino: se agrega como una etapa hermana más al final.
 *
 * @param {string} idEtapaOrigen  etapa a copiar
 */
async function duplicarEtapa(idEtapaOrigen) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [origen] } = await client.query('SELECT * FROM etapas WHERE id = $1', [idEtapaOrigen]);
    if (!origen) {
      const err = new Error('La etapa que intentas duplicar no existe');
      err.statusCode = 404;
      err.codigo = 'NO_ENCONTRADO';
      throw err;
    }

    const { rows: [{ max_orden }] } = await client.query(
      'SELECT COALESCE(MAX(orden), 0) AS max_orden FROM etapas WHERE id_proyecto = $1', [origen.id_proyecto]
    );

    const { rows: [nuevaEtapa] } = await client.query(`
      INSERT INTO etapas (
        id_proyecto, nombre, descripcion, orden, tipo, prioridad,
        tipo_meta, meta_descripcion, meta_valor, meta_unidad,
        instancia_responsable, enlace_responsable, observaciones,
        escala_territorial, instrumento, campos_extra, id_dg, id_direccion_area,
        estado, avance_actual, avance_override, semaforo_override, porcentaje_calculado
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
        'Pendiente', 0, false, false, 0)
      RETURNING *
    `, [
      origen.id_proyecto, origen.nombre, origen.descripcion, max_orden + 1, origen.tipo, origen.prioridad,
      origen.tipo_meta, origen.meta_descripcion, origen.meta_valor, origen.meta_unidad,
      origen.instancia_responsable, origen.enlace_responsable, origen.observaciones,
      origen.escala_territorial, origen.instrumento, origen.campos_extra, origen.id_dg, origen.id_direccion_area,
    ]);

    // Acciones (raíz primero, para que el padre ya exista en el mapa
    // cuando se inserten las subacciones).
    const mapaAcciones = new Map();
    const { rows: acciones } = await client.query(`
      SELECT * FROM acciones WHERE id_etapa = $1
      ORDER BY (id_accion_padre IS NOT NULL), created_at
    `, [idEtapaOrigen]);

    for (const a of acciones) {
      const { rows: [nuevaAccion] } = await client.query(`
        INSERT INTO acciones (
          id_proyecto, id_etapa, id_accion_padre, nombre, descripcion, tipo, prioridad, peso_porcentaje,
          instancia_responsable, enlace_responsable, observaciones,
          escala_territorial, instrumento, campos_extra, id_dg, id_direccion_area,
          estado, porcentaje_avance, avance_actual, avance_override, semaforo_override
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
          'Pendiente', 0, 0, false, false)
        RETURNING id
      `, [
        origen.id_proyecto,
        nuevaEtapa.id,
        a.id_accion_padre ? mapaAcciones.get(a.id_accion_padre) || null : null,
        a.nombre, a.descripcion, a.tipo, a.prioridad, a.peso_porcentaje,
        a.instancia_responsable, a.enlace_responsable, a.observaciones,
        a.escala_territorial, a.instrumento, a.campos_extra, a.id_dg, a.id_direccion_area,
      ]);
      mapaAcciones.set(a.id, nuevaAccion.id);
    }

    // Tareas
    let totalTareas = 0;
    if (mapaAcciones.size > 0) {
      const { rows: tareas } = await client.query(
        'SELECT * FROM tareas WHERE id_accion = ANY($1::uuid[]) ORDER BY orden NULLS LAST, created_at',
        [[...mapaAcciones.keys()]]
      );
      for (const t of tareas) {
        await client.query(`
          INSERT INTO tareas (
            id_accion, nombre, descripcion, prioridad, orden, observaciones,
            estado, avance_actual, avance_override, semaforo_override
          ) VALUES ($1,$2,$3,$4,$5,$6,'Pendiente',0,false,false)
        `, [mapaAcciones.get(t.id_accion), t.nombre, t.descripcion, t.prioridad, t.orden, t.observaciones]);
        totalTareas++;
      }
    }

    // Pesos parejos entre las acciones raíz recién creadas, igual que al
    // capturar una acción a mano — sin esto quedarían con el peso_porcentaje
    // que traía el original, que ya no suma 100% aquí porque puede haber
    // menos (o más) acciones que en la etapa de origen si alguna quedó fuera.
    await recalcularPesosEtapa(nuevaEtapa.id, client);
    await recalcularEtapa(nuevaEtapa.id, client);
    await recalcularProyecto(origen.id_proyecto, client);

    await client.query('COMMIT');

    return {
      etapa: nuevaEtapa,
      copiado: { acciones: mapaAcciones.size, tareas: totalTareas },
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { duplicarProyecto, duplicarEtapa };
