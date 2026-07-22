/**
 * ARCHIVO: generarReportePDF.js
 * PROPÓSITO: Genera un reporte PDF institucional completo del proyecto.
 *            Incluye portada, resumen ejecutivo, estructura de trabajo,
 *            pendientes, bloqueados, riesgos, evidencias e indicadores.
 *            Formato SEDATU / gob.mx v3.
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import client from '../api/client';
import * as evidenciasApi from '../api/evidencias';

// ─── Paleta institucional ──────────────────────────────────────
const C = {
  guinda:      [123, 28,  62],
  guindaOsc:   [ 97, 18,  50],
  dorado:      [165,127,  44],
  blanco:      [255,255, 255],
  grisTexto:   [ 84, 84,  84],
  grisClaro:   [229,229, 229],
  fondoClaro:  [251,243, 246],
  fondoNeutro: [245,245, 240],
  verde:       [ 34,197,  94],
  ambar:       [245,158,  11],
  rojo:        [239, 68,  68],
  grisNeutro:  [156,163, 175],
};

// ─── Helpers ───────────────────────────────────────────────────
const fmtDate  = d => d ? new Date(d).toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' }) : '—';
const fmtPct   = v => `${Math.round(parseFloat(v) || 0)}%`;
const limita   = (s, n) => s ? (s.length > n ? s.slice(0, n) + '…' : s) : '—';
const estadoStr = e => (e || 'Pendiente').replace(/_/g, ' ');
const semStr    = s => ({ verde:'Verde', ambar:'Ámbar', rojo:'Rojo', gris:'Sin datos' }[s] || s || '—');
const semColor  = s => ({ verde:C.verde, ambar:C.ambar, rojo:C.rojo, gris:C.grisNeutro }[s] || C.grisNeutro);

function nivelStr(tipo) {
  return tipo === 'etapa' ? 'Etapa' : tipo === 'accion' ? 'Acción' : 'Tarea';
}

// Flatten tree (etapas → acciones → subacciones)
function aplanarArbol(nodos) {
  const resultado = [];
  function recorrer(nodo, profundidad = 0) {
    // Infer tipo if not set
    let tipo = nodo.tipo;
    if (!tipo) {
      if (profundidad === 0) tipo = 'etapa';
      else if (nodo.tareas !== undefined || nodo.subacciones !== undefined) tipo = 'accion';
      else tipo = 'accion';
    }
    resultado.push({ ...nodo, tipo, profundidad });
    const hijos = nodo.acciones || nodo.subacciones || nodo.hijos || [];
    hijos.forEach(h => recorrer(h, profundidad + 1));
    (nodo.tareas || []).forEach(t => recorrer({ ...t, tipo: 'tarea' }, profundidad + 2));
  }
  (nodos || []).forEach(n => recorrer(n));
  return resultado;
}

// ─── Encabezado / pie de página ────────────────────────────────
function encabezadoPagina(doc, titulo, proyecto, paginaNum, totalPaginas) {
  const PW = 210;

  // Banda guinda
  doc.setFillColor(...C.guinda);
  doc.rect(0, 0, PW, 16, 'F');

  // Título de sección
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...C.blanco);
  doc.text('SEDATU — PSPP · Reporte de Seguimiento', 20, 10);
  doc.setFont('helvetica', 'normal');
  doc.text(limita(proyecto.nombre, 60), 20, 14);

  // Sección a la derecha
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(titulo, PW - 20, 10, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(`Pág. ${paginaNum}/${totalPaginas}`, PW - 20, 14.5, { align: 'right' });

  doc.setTextColor(...C.grisTexto);
}

// Pie
function piePagina(doc, proyecto) {
  const PW = 210, PH = 297;
  doc.setFillColor(...C.grisClaro);
  doc.rect(0, PH - 10, PW, 10, 'F');
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  doc.setFont('helvetica', 'normal');
  const fechaGen = new Date().toLocaleDateString('es-MX', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' });
  doc.text(`Generado el ${fechaGen}`, 20, PH - 3.5);
  doc.text('PSPP — Plataforma de Seguimiento de Proyectos Prioritarios · SEDATU', PW - 20, PH - 3.5, { align:'right' });
  doc.setTextColor(...C.grisTexto);
}

// ─── PORTADA ───────────────────────────────────────────────────
async function portada(doc, proyecto, logoDataURL) {
  const PW = 210, PH = 297;

  // Fondo banda superior guinda (100mm)
  doc.setFillColor(...C.guindaOsc);
  doc.rect(0, 0, PW, 100, 'F');

  // Línea dorada decorativa
  doc.setFillColor(...C.dorado);
  doc.rect(0, 100, PW, 2, 'F');

  // Logo SEDATU (blanco)
  if (logoDataURL) {
    try { doc.addImage(logoDataURL, 'PNG', 18, 12, 65, 14, undefined, 'FAST'); } catch { /* sin logo */ }
  }

  // "REPORTE DE SEGUIMIENTO"
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(...C.dorado);
  doc.text('REPORTE DE SEGUIMIENTO DE PROYECTO', 18, 42);

  // Nombre del proyecto
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...C.blanco);
  const nombreLines = doc.splitTextToSize(proyecto.nombre || 'Sin nombre', 170);
  doc.text(nombreLines, 18, 55);

  // DG y tipo
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(220, 185, 198);
  const subtitulo = [proyecto.dg_lider_siglas, proyecto.tipo?.replace(/_/g,' ')].filter(Boolean).join(' · ');
  doc.text(subtitulo, 18, 55 + nombreLines.length * 7.5 + 5);

  // Fecha de generación
  const hoy = new Date().toLocaleDateString('es-MX', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  doc.setFontSize(8.5);
  doc.setTextColor(200, 170, 183);
  doc.text(`Generado: ${hoy}`, 18, 95);

  // Cuerpo: metadatos del proyecto
  const yStart = 112;
  const items = [
    ['Estado',        estadoStr(proyecto.estado)],
    ['DG Líder',      [proyecto.dg_lider_siglas, proyecto.dg_lider_nombre].filter(Boolean).join(' — ')],
    ['Tipo',          proyecto.tipo?.replace(/_/g,' ') || '—'],
    ['Programa',      proyecto.programa_clave || '—'],
    ['Inicio progr.', fmtDate(proyecto.fecha_inicio)],
    ['Fin progr.',    fmtDate(proyecto.fecha_limite)],
    ['Avance global', fmtPct(proyecto.porcentaje_calculado)],
  ];

  let y = yStart;
  doc.setFontSize(9.5);

  // 2 columnas
  const col1 = items.slice(0, 4);
  const col2 = items.slice(4);
  const colW = 82;

  [[col1, 18], [col2, 18 + colW + 8]].forEach(([cols, xBase]) => {
    y = yStart;
    cols.forEach(([label, valor]) => {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...C.guinda);
      doc.text(label + ':', xBase, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...C.grisTexto);
      doc.text(limita(String(valor || '—'), 38), xBase + 28, y);
      y += 8;
    });
  });

  // Descripción
  if (proyecto.descripcion) {
    const yDesc = Math.max(y, yStart + 32) + 10;
    doc.setFillColor(...C.fondoNeutro);
    const descLines = doc.splitTextToSize(proyecto.descripcion, 168);
    const descH = descLines.length * 5.5 + 10;
    doc.rect(18, yDesc - 2, 172, descH, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...C.guinda);
    doc.text('Descripción', 22, yDesc + 4);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.grisTexto);
    doc.text(descLines, 22, yDesc + 10);
  }

  // Pie portada
  piePagina(doc, proyecto);
}

// ─── Tabla helper ──────────────────────────────────────────────
function seccionTitulo(doc, titulo, y, color = C.guinda) {
  doc.setFillColor(...color);
  doc.rect(20, y, 4, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...color);
  doc.text(titulo, 27, y + 5.5);
  doc.setTextColor(...C.grisTexto);
  return y + 12;
}

// ─── RESUMEN EJECUTIVO ─────────────────────────────────────────
function paginaResumen(doc, proyecto, etapas, stats, totalPaginas) {
  doc.addPage();
  encabezadoPagina(doc, 'Resumen ejecutivo', proyecto, 2, totalPaginas);

  const todosNodos = aplanarArbol(etapas);
  const soloPrincipales = todosNodos.filter(n => n.tipo === 'etapa');
  const soloPrincipalesAcc = todosNodos.filter(n => n.tipo === 'accion');
  const todasTareas = todosNodos.filter(n => n.tipo === 'tarea');

  const counts = {
    etapas:     { total: soloPrincipales.length, completadas: soloPrincipales.filter(n => n.estado === 'Terminado').length, bloqueadas: soloPrincipales.filter(n => n.semaforo === 'rojo').length },
    acciones:   { total: soloPrincipalesAcc.length, completadas: soloPrincipalesAcc.filter(n => n.estado === 'Terminado').length, bloqueadas: soloPrincipalesAcc.filter(n => n.semaforo === 'rojo').length },
    tareas:     { total: todasTareas.length, completadas: todasTareas.filter(n => n.estado === 'Terminado').length },
    pendientes: todosNodos.filter(n => n.estado === 'Pendiente').length,
    en_proceso: todosNodos.filter(n => n.estado === 'En_proceso').length,
    terminados: todosNodos.filter(n => n.estado === 'Terminado').length,
    cancelados: todosNodos.filter(n => n.estado === 'Cancelado').length,
    sem_verde:  todosNodos.filter(n => n.semaforo === 'verde').length,
    sem_ambar:  todosNodos.filter(n => n.semaforo === 'ambar').length,
    sem_rojo:   todosNodos.filter(n => n.semaforo === 'rojo').length,
  };

  let y = 26;

  // Avance global — barra
  y = seccionTitulo(doc, 'Avance global del proyecto', y);
  const pct = parseFloat(proyecto.porcentaje_calculado) || 0;
  const semColor_ = { verde:C.verde, ambar:C.ambar, rojo:C.rojo, gris:C.grisNeutro }[proyecto.semaforo] || C.grisNeutro;

  doc.setFontSize(26);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.guinda);
  doc.text(`${Math.round(pct)}%`, 25, y + 10);

  // Barra de progreso
  doc.setFillColor(...C.grisClaro);
  doc.rect(55, y, 130, 8, 'F');
  if (pct > 0) {
    doc.setFillColor(...semColor_);
    doc.rect(55, y, Math.min(130, 130 * pct / 100), 8, 'F');
  }
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.grisTexto);
  doc.text(`Semáforo: ${semStr(proyecto.semaforo)}`, 55, y + 14);
  doc.text(`Fechas: ${fmtDate(proyecto.fecha_inicio)} → ${fmtDate(proyecto.fecha_limite)}`, 55, y + 19);

  y += 26;

  // Métricas en 3 cajas
  const cajas = [
    { label: 'Etapas',   total: counts.etapas.total,   ok: counts.etapas.completadas,   bloq: counts.etapas.bloqueadas },
    { label: 'Acciones', total: counts.acciones.total, ok: counts.acciones.completadas, bloq: counts.acciones.bloqueadas },
    { label: 'Tareas',   total: counts.tareas.total,   ok: counts.tareas.completadas,   bloq: 0 },
  ];

  const cajaW = 52, cajaH = 28, cajaX = 20;
  cajas.forEach((c, i) => {
    const cx = cajaX + i * (cajaW + 7);
    doc.setFillColor(...C.fondoClaro);
    doc.rect(cx, y, cajaW, cajaH, 'F');
    doc.setFillColor(...C.guinda);
    doc.rect(cx, y, cajaW, 5, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...C.blanco);
    doc.text(c.label.toUpperCase(), cx + cajaW / 2, y + 3.8, { align: 'center' });

    doc.setFontSize(18); doc.setFont('helvetica', 'bold'); doc.setTextColor(...C.guinda);
    doc.text(String(c.total), cx + cajaW / 2, y + 17, { align: 'center' });

    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 120, 80);
    doc.text(`✓ ${c.ok} terminadas`, cx + 4, y + 23);
    if (c.bloq > 0) {
      doc.setTextColor(...C.rojo);
      doc.text(`✗ ${c.bloq} en rojo`, cx + 4, y + 27);
    }
  });

  y += cajaH + 10;

  // Distribución de estados
  y = seccionTitulo(doc, 'Distribución por estado', y);
  autoTable(doc, {
    startY: y,
    margin: { left: 20, right: 20 },
    head: [['Estado', 'Cantidad', 'Semáforo Verde', 'Ámbar', 'Rojo']],
    body: [
      ['Pendiente',  counts.pendientes, '', '', ''],
      ['En proceso', counts.en_proceso, '', '', ''],
      ['Terminado',  counts.terminados, counts.sem_verde, counts.sem_ambar, counts.sem_rojo],
      ['Cancelado',  counts.cancelados, '', '', ''],
    ],
    headStyles: { fillColor: C.guinda, textColor: C.blanco, fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 8, textColor: C.grisTexto },
    alternateRowStyles: { fillColor: C.fondoNeutro },
    columnStyles: { 0: { fontStyle: 'bold' } },
    tableWidth: 170,
  });

  piePagina(doc, proyecto);
}

// ─── EQUIPO ────────────────────────────────────────────────────
function paginaEquipo(doc, proyecto, miembros, paginaNum, totalPaginas) {
  doc.addPage();
  encabezadoPagina(doc, 'Equipo del proyecto', proyecto, paginaNum, totalPaginas);
  let y = 26;
  y = seccionTitulo(doc, 'Miembros del proyecto', y);

  if (!miembros.length) {
    doc.setFontSize(9); doc.setTextColor(...C.grisNeutro);
    doc.text('Sin miembros registrados.', 20, y); y += 10;
  } else {
    autoTable(doc, {
      startY: y,
      margin: { left: 20, right: 20 },
      head: [['Nombre', 'Correo', 'Rol en proyecto', 'DG', 'Cargo']],
      body: miembros.map(m => [
        m.nombre_completo || '—',
        m.correo || '—',
        m.rol || '—',
        m.dg_siglas || '—',
        limita(m.cargo || '—', 35),
      ]),
      headStyles: { fillColor: C.guinda, textColor: C.blanco, fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8, textColor: C.grisTexto },
      alternateRowStyles: { fillColor: C.fondoNeutro },
      tableWidth: 170,
    });
  }
  piePagina(doc, proyecto);
}

// ─── ESTRUCTURA DE TRABAJO ────────────────────────────────────
function paginaEstructura(doc, proyecto, etapas, paginaNum, totalPaginas) {
  doc.addPage();
  encabezadoPagina(doc, 'Estructura de trabajo', proyecto, paginaNum, totalPaginas);
  let y = 26;
  y = seccionTitulo(doc, 'Etapas, acciones y tareas', y);

  const todos = aplanarArbol(etapas);
  if (!todos.length) {
    doc.setFontSize(9); doc.setTextColor(...C.grisNeutro);
    doc.text('Sin estructura de trabajo registrada.', 20, y);
  } else {
    const filas = todos.map(n => {
      const indent = '  '.repeat(n.profundidad);
      const pct = Math.round(parseFloat(n.avance_actual ?? n.porcentaje_calculado) || 0);
      return [
        `${indent}${nivelStr(n.tipo)}`,
        limita(n.nombre || '—', 50),
        estadoStr(n.estado),
        semStr(n.semaforo),
        `${pct}%`,
        limita(n.responsable_nombre || '—', 25),
        fmtDate(n.fecha_inicio),
        fmtDate(n.fecha_limite),
      ];
    });

    autoTable(doc, {
      startY: y,
      margin: { left: 20, right: 20 },
      head: [['Tipo','Nombre','Estado','Semáforo','Avance','Responsable','Inicio','Fin']],
      body: filas,
      headStyles: { fillColor: C.guinda, textColor: C.blanco, fontStyle: 'bold', fontSize: 7 },
      bodyStyles: { fontSize: 7, textColor: C.grisTexto },
      alternateRowStyles: { fillColor: C.fondoNeutro },
      columnStyles: {
        0: { cellWidth: 14 },
        1: { cellWidth: 50 },
        2: { cellWidth: 22 },
        3: { cellWidth: 18 },
        4: { cellWidth: 14 },
        5: { cellWidth: 24 },
        6: { cellWidth: 14 },
        7: { cellWidth: 14 },
      },
      didParseCell: (data) => {
        if (data.section === 'body') {
          const n = todos[data.row.index];
          if (n?.profundidad === 0) {
            data.cell.styles.fillColor = C.fondoClaro;
            data.cell.styles.fontStyle = 'bold';
          }
          if (data.column.index === 3 && data.section === 'body') {
            const sem = n?.semaforo;
            const color = { verde:C.verde, ambar:C.ambar, rojo:C.rojo }[sem];
            if (color) data.cell.styles.textColor = color;
          }
        }
      },
      tableWidth: 170,
    });
  }
  piePagina(doc, proyecto);
}

// ─── ACTIVIDADES PENDIENTES ────────────────────────────────────
function paginaPendientes(doc, proyecto, etapas, paginaNum, totalPaginas) {
  doc.addPage();
  encabezadoPagina(doc, 'Actividades pendientes', proyecto, paginaNum, totalPaginas);
  let y = 26;

  const todos = aplanarArbol(etapas);
  const pendientes = todos.filter(n => n.estado === 'Pendiente' || n.estado === 'En_proceso');
  const vencidas = pendientes.filter(n => n.fecha_limite && new Date(n.fecha_limite) < new Date());

  y = seccionTitulo(doc, `Pendientes y en proceso (${pendientes.length} nodos)`, y);

  if (!pendientes.length) {
    doc.setFontSize(9); doc.setTextColor(...C.verde);
    doc.text('¡Sin actividades pendientes! Todas están terminadas o canceladas.', 20, y); y += 12;
  } else {
    // Primero las vencidas
    if (vencidas.length) {
      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...C.rojo);
      doc.text(`⚠ ${vencidas.length} actividad(es) VENCIDA(S) (fecha límite superada)`, 20, y); y += 6;
      doc.setFont('helvetica', 'normal'); doc.setTextColor(...C.grisTexto);
    }

    const filas = pendientes
      .sort((a, b) => (a.fecha_limite || '9999') < (b.fecha_limite || '9999') ? -1 : 1)
      .map(n => {
        const pct = Math.round(parseFloat(n.avance_actual ?? n.porcentaje_calculado) || 0);
        const vencida = n.fecha_limite && new Date(n.fecha_limite) < new Date();
        return [
          nivelStr(n.tipo),
          limita(n.nombre || '—', 55),
          estadoStr(n.estado),
          semStr(n.semaforo),
          `${pct}%`,
          limita(n.responsable_nombre || '—', 22),
          fmtDate(n.fecha_limite),
          vencida ? '⚠ Vencida' : '',
        ];
      });

    autoTable(doc, {
      startY: y,
      margin: { left: 20, right: 20 },
      head: [['Tipo','Nombre','Estado','Semáforo','Avance','Responsable','Fin progr.','Alerta']],
      body: filas,
      headStyles: { fillColor: [180, 60, 60], textColor: C.blanco, fontStyle: 'bold', fontSize: 7.5 },
      bodyStyles: { fontSize: 7.5, textColor: C.grisTexto },
      alternateRowStyles: { fillColor: C.fondoNeutro },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 7 && data.cell.raw === '⚠ Vencida') {
          data.cell.styles.textColor = C.rojo;
          data.cell.styles.fontStyle = 'bold';
        }
      },
      tableWidth: 170,
    });
  }
  piePagina(doc, proyecto);
}

// ─── BLOQUEADOS / SEMÁFORO ROJO ────────────────────────────────
function paginaBloqueados(doc, proyecto, etapas, paginaNum, totalPaginas) {
  doc.addPage();
  encabezadoPagina(doc, 'Actividades bloqueadas / en riesgo', proyecto, paginaNum, totalPaginas);
  let y = 26;

  const todos = aplanarArbol(etapas);
  const enRiesgo = todos.filter(n => n.semaforo === 'rojo' || n.semaforo === 'ambar');
  const rojos    = enRiesgo.filter(n => n.semaforo === 'rojo');
  const ambares  = enRiesgo.filter(n => n.semaforo === 'ambar');

  y = seccionTitulo(doc, `En riesgo o bloqueados (${enRiesgo.length} nodos)`, y);

  if (!enRiesgo.length) {
    doc.setFontSize(9); doc.setTextColor(...C.verde);
    doc.text('¡Sin actividades en rojo o ámbar!', 20, y); y += 12;
  } else {
    if (rojos.length) {
      doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...C.rojo);
      doc.text(`🔴 ${rojos.length} en semáforo ROJO (bloqueado / crítico)`, 20, y); y += 5;
      doc.setFont('helvetica', 'normal'); doc.setTextColor(...C.grisTexto);
    }
    if (ambares.length) {
      doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...C.ambar);
      doc.text(`🟡 ${ambares.length} en semáforo ÁMBAR (en seguimiento)`, 20, y); y += 5;
      doc.setFont('helvetica', 'normal'); doc.setTextColor(...C.grisTexto);
    }
    y += 3;

    const filas = enRiesgo.map(n => {
      const pct = Math.round(parseFloat(n.avance_actual ?? n.porcentaje_calculado) || 0);
      return [
        nivelStr(n.tipo),
        limita(n.nombre || '—', 55),
        estadoStr(n.estado),
        semStr(n.semaforo),
        `${pct}%`,
        limita(n.responsable_nombre || '—', 22),
        fmtDate(n.fecha_limite),
      ];
    });

    autoTable(doc, {
      startY: y,
      margin: { left: 20, right: 20 },
      head: [['Tipo','Nombre','Estado','Semáforo','Avance','Responsable','Fin progr.']],
      body: filas,
      headStyles: { fillColor: C.guinda, textColor: C.blanco, fontStyle: 'bold', fontSize: 7.5 },
      bodyStyles: { fontSize: 7.5, textColor: C.grisTexto },
      alternateRowStyles: { fillColor: C.fondoNeutro },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 3) {
          const sem = enRiesgo[data.row.index]?.semaforo;
          if (sem === 'rojo') data.cell.styles.textColor = C.rojo;
          if (sem === 'ambar') data.cell.styles.textColor = C.ambar;
          data.cell.styles.fontStyle = 'bold';
        }
      },
      tableWidth: 170,
    });
  }
  piePagina(doc, proyecto);
}

// ─── ETAPAS TERMINADAS ─────────────────────────────────────────
function paginaTerminados(doc, proyecto, etapas, paginaNum, totalPaginas) {
  doc.addPage();
  encabezadoPagina(doc, 'Etapas y acciones completadas', proyecto, paginaNum, totalPaginas);
  let y = 26;
  const todos = aplanarArbol(etapas);
  const terminados = todos.filter(n => n.estado === 'Terminado');

  y = seccionTitulo(doc, `Completados (${terminados.length} nodos)`, y);

  if (!terminados.length) {
    doc.setFontSize(9); doc.setTextColor(...C.grisNeutro);
    doc.text('Sin nodos terminados todavía.', 20, y);
  } else {
    autoTable(doc, {
      startY: y,
      margin: { left: 20, right: 20 },
      head: [['Tipo','Nombre','Avance','Responsable','Fecha inicio','Fecha fin']],
      body: terminados.map(n => {
        const pct = Math.round(parseFloat(n.avance_actual ?? n.porcentaje_calculado) || 0);
        return [nivelStr(n.tipo), limita(n.nombre,'—'), `${pct}%`, limita(n.responsable_nombre||'—',28), fmtDate(n.fecha_inicio), fmtDate(n.fecha_limite)];
      }),
      headStyles: { fillColor: [34,120,60], textColor: C.blanco, fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8, textColor: C.grisTexto },
      alternateRowStyles: { fillColor: [240,252,244] },
      tableWidth: 170,
    });
  }
  piePagina(doc, proyecto);
}

// ─── RIESGOS ───────────────────────────────────────────────────
function paginaRiesgos(doc, proyecto, riesgos, paginaNum, totalPaginas) {
  doc.addPage();
  encabezadoPagina(doc, 'Registro de riesgos', proyecto, paginaNum, totalPaginas);
  let y = 26;
  y = seccionTitulo(doc, `Riesgos del proyecto (${riesgos.length})`, y);

  if (!riesgos.length) {
    doc.setFontSize(9); doc.setTextColor(...C.grisNeutro);
    doc.text('Sin riesgos registrados.', 20, y);
  } else {
    autoTable(doc, {
      startY: y,
      margin: { left: 20, right: 20 },
      head: [['Título','Nivel','Estado','Prob.','Impacto','Responsable','Etapa / Acción']],
      body: riesgos.map(r => [
        limita(r.titulo||'—', 38),
        r.nivel || '—',
        r.estado || '—',
        r.probabilidad || '—',
        r.impacto || '—',
        limita(r.responsable_nombre || '—', 22),
        limita(r.etapa_nombre || r.accion_nombre || '—', 28),
      ]),
      headStyles: { fillColor: [180, 80, 20], textColor: C.blanco, fontStyle: 'bold', fontSize: 7.5 },
      bodyStyles: { fontSize: 7.5, textColor: C.grisTexto },
      alternateRowStyles: { fillColor: [255, 248, 240] },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 1) {
          const nivel = riesgos[data.row.index]?.nivel;
          const nColor = { Critico: C.rojo, Alto:[220,80,20], Medio:C.ambar, Bajo:[80,160,80] };
          if (nColor[nivel]) { data.cell.styles.textColor = nColor[nivel]; data.cell.styles.fontStyle = 'bold'; }
        }
      },
      tableWidth: 170,
    });
  }
  piePagina(doc, proyecto);
}

// ─── EVIDENCIAS ────────────────────────────────────────────────
function paginaEvidencias(doc, proyecto, evidencias, paginaNum, totalPaginas) {
  doc.addPage();
  encabezadoPagina(doc, 'Archivos y evidencias', proyecto, paginaNum, totalPaginas);
  let y = 26;
  y = seccionTitulo(doc, `Evidencias registradas (${evidencias.length})`, y);

  if (!evidencias.length) {
    doc.setFontSize(9); doc.setTextColor(...C.grisNeutro);
    doc.text('Sin evidencias registradas.', 20, y);
  } else {
    // Agrupar por categoría
    const porCategoria = {};
    evidencias.forEach(e => {
      const cat = e.categoria || 'Sin categoría';
      if (!porCategoria[cat]) porCategoria[cat] = [];
      porCategoria[cat].push(e);
    });

    autoTable(doc, {
      startY: y,
      margin: { left: 20, right: 20 },
      head: [['Categoría','Nombre del archivo','Notas','Subido por','Fecha','Etapa']],
      body: Object.entries(porCategoria).flatMap(([cat, items]) =>
        items.map((e, i) => [
          i === 0 ? cat : '',
          limita(e.nombre_original || e.nombre || '—', 40),
          limita(e.notas || '—', 30),
          limita(e.autor_nombre || '—', 22),
          fmtDate(e.created_at),
          limita(e.etapa_nombre || '—', 25),
        ])
      ),
      headStyles: { fillColor: C.guinda, textColor: C.blanco, fontStyle: 'bold', fontSize: 7.5 },
      bodyStyles: { fontSize: 7.5, textColor: C.grisTexto },
      alternateRowStyles: { fillColor: C.fondoNeutro },
      columnStyles: { 0: { fontStyle: 'bold', textColor: C.guinda } },
      tableWidth: 170,
    });
  }
  piePagina(doc, proyecto);
}

// ─── INDICADORES ───────────────────────────────────────────────
function paginaIndicadores(doc, proyecto, indicadores, paginaNum, totalPaginas) {
  if (!indicadores.length) return;
  doc.addPage();
  encabezadoPagina(doc, 'Indicadores de resultado', proyecto, paginaNum, totalPaginas);
  let y = 26;
  y = seccionTitulo(doc, `Indicadores del proyecto (${indicadores.length})`, y);

  autoTable(doc, {
    startY: y,
    margin: { left: 20, right: 20 },
    head: [['Nombre','Tipo','Meta global','Valor actual','% Avance','Unidad','Etapa']],
    body: indicadores.map(ind => {
      const meta = parseFloat(ind.meta_global) || 0;
      const val  = parseFloat(ind.valor_actual) || 0;
      const pct  = meta > 0 ? Math.min(100, Math.round((val/meta)*100)) : null;
      return [
        limita(ind.nombre||'—',40),
        ind.tipo||'—',
        meta > 0 ? meta.toLocaleString() : '—',
        val > 0 ? val.toLocaleString() : '—',
        pct !== null ? `${pct}%` : '—',
        ind.etiqueta_unidad || ind.unidad || '—',
        limita(ind.etapa_nombre||'—',30),
      ];
    }),
    headStyles: { fillColor: [30, 80, 150], textColor: C.blanco, fontStyle: 'bold', fontSize: 7.5 },
    bodyStyles: { fontSize: 7.5, textColor: C.grisTexto },
    alternateRowStyles: { fillColor: [240, 244, 255] },
    tableWidth: 170,
  });
  piePagina(doc, proyecto);
}

// ─── FUNCIÓN PRINCIPAL ─────────────────────────────────────────
export async function generarReportePDF(proyectoId, proyecto) {
  // Carga de todos los datos en paralelo
  const [arbolRes, miembrosRes, riesgosRes, evidenciasRes, indicadoresRes] = await Promise.allSettled([
    client.get(`/proyectos/${proyectoId}/arbol`),
    client.get(`/proyectos/${proyectoId}/miembros`),
    client.get(`/proyectos/${proyectoId}/riesgos`),
    evidenciasApi.obtenerEvidenciasProyecto(proyectoId),
    client.get(`/proyectos/${proyectoId}/indicadores/todos`),
  ]);

  const etapas      = arbolRes.status === 'fulfilled'       ? (arbolRes.value.data.datos       || arbolRes.value.data       || []) : [];
  const miembros    = miembrosRes.status === 'fulfilled'    ? (miembrosRes.value.data.datos    || miembrosRes.value.data    || []) : [];
  const riesgos     = riesgosRes.status === 'fulfilled'     ? (riesgosRes.value.data.datos     || riesgosRes.value.data     || []) : [];
  const evidencias  = evidenciasRes.status === 'fulfilled'  ? (evidenciasRes.value.datos       || evidenciasRes.value       || []) : [];
  const indicadores = indicadoresRes.status === 'fulfilled' ? (indicadoresRes.value.data.datos || indicadoresRes.value.data || []) : [];

  // Logo
  let logoDataURL = null;
  try {
    const r = await fetch('/sedatu-logo.png');
    const b = await r.blob();
    logoDataURL = await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(b);
    });
  } catch { /* sin logo */ }

  // Número total de páginas (portada + secciones fijas + opcionales)
  const tieneIndicadores = indicadores.length > 0;
  const totalPaginas = 7 + (tieneIndicadores ? 1 : 0);

  // Inicializar documento
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  doc.setFont('helvetica', 'normal');

  // 1. Portada
  await portada(doc, proyecto, logoDataURL);

  // 2. Resumen ejecutivo
  paginaResumen(doc, proyecto, etapas, {}, totalPaginas);

  // 3. Equipo
  paginaEquipo(doc, proyecto, miembros, 3, totalPaginas);

  // 4. Estructura completa
  paginaEstructura(doc, proyecto, etapas, 4, totalPaginas);

  // 5. Pendientes
  paginaPendientes(doc, proyecto, etapas, 5, totalPaginas);

  // 6. Bloqueados / riesgo
  paginaBloqueados(doc, proyecto, etapas, 6, totalPaginas);

  // 7. Terminados
  paginaTerminados(doc, proyecto, etapas, 7, totalPaginas);

  // 8. Riesgos
  paginaRiesgos(doc, proyecto, riesgos, 8, totalPaginas);

  // 9. Evidencias
  paginaEvidencias(doc, proyecto, evidencias, 9, totalPaginas);

  // 10. Indicadores (opcional)
  if (tieneIndicadores) {
    paginaIndicadores(doc, proyecto, indicadores, 10, totalPaginas);
  }

  // Guardar
  const nombreArchivo = `Reporte_${(proyecto.nombre || 'Proyecto').replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s]/g,'_').slice(0,50)}_${new Date().toISOString().slice(0,10)}.pdf`;
  doc.save(nombreArchivo);
}
