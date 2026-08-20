/**
 * ARCHIVO: exportar.service.js
 * PROPÓSITO: Construir el archivo descargable (Excel o CSV) con la
 *            estructura completa de un proyecto: Etapa → Acción →
 *            Subacción → Tarea.
 *
 * MINI-CLASE: exportar no es el espejo de importar
 * ─────────────────────────────────────────────────────────────────
 * El importador lee 3 hojas (Etapas/Acciones/Tareas) porque esa es la
 * jerarquía mínima que necesita para crear un proyecto. Pero el árbol
 * real tiene 4 niveles — las acciones pueden colgar subacciones de sí
 * mismas (`id_accion_padre`) — y esta exportación existe para que el
 * usuario se lleve TODO lo que ve en Seguimiento, no solo lo que el
 * importador sabría releer. Por eso no se prometen columnas idénticas
 * a las del importador ni un viaje de ida y vuelta perfecto: el criterio
 * es que el archivo sea un reflejo fiel y legible del proyecto, en
 * Excel con una hoja por nivel, y en CSV como una sola tabla aplanada
 * con columna "Nivel" para no perder la jerarquía en un formato que no
 * admite más de una hoja.
 *
 * La fuente de los datos es la misma que ya arma "Seguimiento" y el
 * reporte PDF: `avanceSemaforo.obtenerSubarbol` por etapa (ver
 * etapas.controller.obtenerArbol). No se duplica ninguna consulta ni
 * ningún cálculo de avance/semáforo — solo se recorre el árbol que ya
 * existe y se aplana a filas de hoja de cálculo.
 * ─────────────────────────────────────────────────────────────────
 */
const XLSX = require('xlsx');

const ESTADO_LEGIBLE = e => (e || 'Pendiente').replace(/_/g, ' ');
const SEMAFORO_LEGIBLE = { verde: 'Verde', ambar: 'Ámbar', rojo: 'Rojo', gris: 'Sin datos' };
const semaforoLegible = s => SEMAFORO_LEGIBLE[s] || '—';
// `pg` devuelve las columnas DATE como objetos Date de JS. String(date)
// da "Thu Jan 01 2026 00:00:00 GMT..." — hay que pedir el ISO explícito
// antes de recortar, o la fecha exportada sale ilegible.
const soloFecha = f => {
  if (!f) return '';
  const iso = f instanceof Date ? f.toISOString() : String(f);
  return iso.slice(0, 10);
};

// ─── Recorrido del árbol → filas planas por nivel ──────────────

function filaEtapa(etapa) {
  return {
    'Nombre': etapa.nombre,
    'Descripción': etapa.descripcion || '',
    'Estado': ESTADO_LEGIBLE(etapa.estado),
    'Prioridad': etapa.prioridad || '',
    'Avance %': etapa.avance_efectivo ?? '',
    'Semáforo': semaforoLegible(etapa.semaforo_efectivo),
    'Fecha inicio': soloFecha(etapa.fecha_inicio),
    'Fecha fin': soloFecha(etapa.fecha_fin || etapa.fecha_limite),
    'Responsable': etapa.responsable_nombre || '',
    'DG responsable': etapa.responsable_dg_siglas || '',
    'Instancia responsable': etapa.instancia_responsable || '',
    'Enlace responsable': etapa.enlace_responsable || '',
    'Observaciones': etapa.observaciones || '',
  };
}

function filaAccion(accion, etapaNombre, accionPadreNombre) {
  return {
    'Etapa': etapaNombre,
    'Acción padre': accionPadreNombre || '',
    'Nombre': accion.nombre,
    'Tipo': accion.tipo === 'Hito' ? 'Hito' : 'Acción programada',
    'Descripción': accion.descripcion || '',
    'Estado': ESTADO_LEGIBLE(accion.estado),
    'Prioridad': accion.prioridad || '',
    'Avance %': accion.avance_efectivo ?? '',
    'Semáforo': semaforoLegible(accion.semaforo_efectivo),
    'Fecha inicio': soloFecha(accion.fecha_inicio),
    'Fecha límite': soloFecha(accion.fecha_fin || accion.fecha_limite),
    'Responsable': accion.responsable_nombre || '',
    'DG responsable': accion.responsable_dg_siglas || '',
    'Instancia responsable': accion.instancia_responsable || '',
    'Enlace responsable': accion.enlace_responsable || '',
    'Observaciones': accion.observaciones || '',
    'Motivo de bloqueo': accion.motivo_bloqueo || '',
  };
}

function filaTarea(tarea, etapaNombre, accionNombre) {
  return {
    'Etapa': etapaNombre,
    'Acción': accionNombre,
    'Nombre': tarea.nombre,
    'Estado': ESTADO_LEGIBLE(tarea.estado),
    'Prioridad': tarea.prioridad || '',
    'Avance %': tarea.avance_efectivo ?? '',
    'Semáforo': semaforoLegible(tarea.semaforo_efectivo),
    'Fecha inicio': soloFecha(tarea.fecha_inicio),
    'Fecha límite': soloFecha(tarea.fecha_limite),
    'Responsable': tarea.responsable_nombre || '',
    'Observaciones': tarea.observaciones || '',
  };
}

/**
 * Recorre el árbol de etapas (la misma forma que devuelve
 * GET /proyectos/:id/arbol) y arma las filas de cada hoja, más una
 * versión aplanada de todo el árbol para el CSV.
 */
function aplanar(etapas) {
  const filasEtapas = [];
  const filasAcciones = [];
  const filasTareas = [];
  const filasAplanadas = []; // para CSV: una tabla, columna "Nivel"

  for (const etapa of etapas) {
    filasEtapas.push(filaEtapa(etapa));
    filasAplanadas.push({ Nivel: 'Etapa', ...filaEtapa(etapa) });

    for (const accion of etapa.acciones || []) {
      filasAcciones.push(filaAccion(accion, etapa.nombre, ''));
      filasAplanadas.push({ Nivel: 'Acción', ...filaAccion(accion, etapa.nombre, '') });

      for (const tarea of accion.tareas || []) {
        filasTareas.push(filaTarea(tarea, etapa.nombre, accion.nombre));
        filasAplanadas.push({ Nivel: 'Tarea', ...filaTarea(tarea, etapa.nombre, accion.nombre) });
      }

      for (const sub of accion.subacciones || []) {
        filasAcciones.push(filaAccion(sub, etapa.nombre, accion.nombre));
        filasAplanadas.push({ Nivel: 'Subacción', ...filaAccion(sub, etapa.nombre, accion.nombre) });

        for (const tarea of sub.tareas || []) {
          filasTareas.push(filaTarea(tarea, etapa.nombre, sub.nombre));
          filasAplanadas.push({ Nivel: 'Tarea', ...filaTarea(tarea, etapa.nombre, sub.nombre) });
        }
      }
    }
  }

  return { filasEtapas, filasAcciones, filasTareas, filasAplanadas };
}

/**
 * Arma el workbook .xlsx: una hoja "Proyecto" con los datos generales
 * y una hoja por nivel de la jerarquía. Devuelve un Buffer listo para
 * enviar como descarga.
 */
function construirXlsx(proyecto, etapas) {
  const { filasEtapas, filasAcciones, filasTareas } = aplanar(etapas);

  const wb = XLSX.utils.book_new();

  const resumen = [
    ['Proyecto', proyecto.nombre],
    ['Descripción', proyecto.descripcion || ''],
    ['Tipo', ESTADO_LEGIBLE(proyecto.tipo)],
    ['Estado', ESTADO_LEGIBLE(proyecto.estado)],
    ['DG líder', proyecto.dg_lider_siglas ? `${proyecto.dg_lider_siglas} — ${proyecto.dg_lider_nombre}` : ''],
    ['Dirección de área líder', proyecto.direccion_area_lider_siglas
      ? `${proyecto.direccion_area_lider_siglas} — ${proyecto.direccion_area_lider_nombre}` : ''],
    ['Programa presupuestario', proyecto.programa_clave ? `${proyecto.programa_clave} — ${proyecto.programa_nombre}` : ''],
    ['Fecha inicio', soloFecha(proyecto.fecha_inicio)],
    ['Fecha límite', soloFecha(proyecto.fecha_limite)],
    // No hay un "avance del proyecto" como columna propia — se calcula
    // agregando el de las etapas, con una lógica que vive en Panorama.
    // No se reproduce aquí para no arriesgar un número que no coincida
    // con el que el usuario ya vio en la pantalla; el avance por etapa,
    // que sí es un dato directo y verificado, está en la hoja "Etapas".
    [],
    ['Exportado el', new Date().toISOString().slice(0, 10)],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumen), 'Proyecto');

  XLSX.utils.book_append_sheet(wb,
    XLSX.utils.json_to_sheet(filasEtapas.length ? filasEtapas : [{ 'Nombre': '(sin etapas)' }]), 'Etapas');
  XLSX.utils.book_append_sheet(wb,
    XLSX.utils.json_to_sheet(filasAcciones.length ? filasAcciones : [{ 'Nombre': '(sin acciones)' }]), 'Acciones');
  XLSX.utils.book_append_sheet(wb,
    XLSX.utils.json_to_sheet(filasTareas.length ? filasTareas : [{ 'Nombre': '(sin tareas)' }]), 'Tareas');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/**
 * Arma el CSV: una sola tabla aplanada con columna "Nivel", porque el
 * formato no admite varias hojas. Devuelve texto (UTF-8 con BOM, para
 * que Excel en Windows detecte los acentos sin configuración extra).
 */
function construirCsv(etapas) {
  const { filasAplanadas } = aplanar(etapas);
  const hoja = XLSX.utils.json_to_sheet(
    filasAplanadas.length ? filasAplanadas : [{ Nivel: '', Nombre: '(proyecto sin contenido)' }]
  );
  const csv = XLSX.utils.sheet_to_csv(hoja);
  return '﻿' + csv;
}

module.exports = { construirXlsx, construirCsv };
