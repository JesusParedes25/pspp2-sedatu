/**
 * ARCHIVO: eventosLineaTiempo.js
 * PROPÓSITO: Capa de datos compartida entre ResumenMensual.jsx (franja de
 *            texto por mes) y BitacoraCronologica.jsx (lista). Los dos
 *            componentes solo conocen el shape "evento" normalizado de
 *            aquí abajo, nunca las dos formas crudas distintas que trae
 *            cada pantalla (el feed por nodo de Detalle vs. la bitácora
 *            de proyecto). Esa normalización es la ÚNICA duplicación
 *            permitida entre las dos pantallas: todo lo demás (resumen,
 *            lista) es un solo componente montado dos veces.
 *
 *            Hasta el retiro del gráfico de línea del tiempo
 *            (LineaTiempoEventos.jsx, ver historial de git), este archivo
 *            también agrupaba eventos por día+carril para sus marcadores
 *            (agruparPorDiaYCarril/eventosDelMismoDia). Se quitaron junto
 *            con el gráfico al no tener ya ningún otro consumidor.
 *
 * Evento normalizado:
 *   { id, carril, avance, titulo, contenido, autorNombre, createdAt,
 *     nodo: {tipo,id,nombre}|null, raw }
 *   carril: 'avance' | 'documento' | 'indicador' | 'riesgo' | 'comentario' | 'equipo'
 *   avance: número 0-100 solo cuando carril==='avance' Y el evento trae un
 *           valor real (cambio_avance, o cambio_estatus a Completada/Pendiente)
 *   raw:    el evento crudo tal cual llegó, para que la pantalla que lo
 *           integra pueda seguir abriendo sus modales de detalle existentes
 *           (ModalRiesgo, detalle de archivo) sin que el componente
 *           compartido necesite saber nada de esos modales.
 */
import { diasEntre } from './marcadoresTiempo';
import { formatearEstado } from './estados';

// ─── Normalizadores (la única pieza que difiere entre pantallas) ───

// Desde actividad.queries.js::obtenerActividadNodo (pestaña Actividad de
// Detalle) — tipo_evento/contenido/archivo_nombre/metadata/autor_nombre.
export function normalizarEventoNodo(item) {
  let avance = null;
  let carril = 'comentario';
  let titulo = item.contenido || '';

  switch (item.tipo_evento) {
    case 'cambio_avance':
      if (item.metadata?.avance_actual != null) avance = Math.round(parseFloat(item.metadata.avance_actual));
      carril = 'avance';
      titulo = avance != null ? `Avance actualizado a ${avance}%` : (item.contenido || 'Avance actualizado');
      break;
    case 'cambio_estatus':
      if (item.metadata?.estado === 'Completada') avance = 100;
      else if (item.metadata?.estado === 'Pendiente') avance = 0;
      carril = avance != null ? 'avance' : 'comentario';
      titulo = item.metadata?.estado ? `Estado: ${formatearEstado(item.metadata.estado)}` : (item.contenido || 'Estado actualizado');
      break;
    case 'estatus_cualitativo':
      carril = 'comentario';
      titulo = item.contenido || 'Nota de avance';
      break;
    case 'archivo':
      carril = 'documento';
      titulo = item.archivo_nombre || item.contenido || 'Documento adjuntado';
      break;
    case 'riesgo':
      carril = 'riesgo';
      titulo = item.contenido || 'Riesgo reportado';
      break;
    case 'miembro':
      carril = 'equipo';
      titulo = item.contenido || 'Cambio de equipo';
      break;
    case 'comentario':
    default:
      carril = 'comentario';
      titulo = item.contenido || 'Comentario';
  }

  return {
    id: item.id, carril, avance, titulo, contenido: item.contenido,
    autorNombre: item.autor_nombre, createdAt: item.created_at, nodo: null, raw: item,
  };
}

const CARRIL_DE_CATEGORIA = {
  comentario: 'comentario', archivo: 'documento', riesgo: 'riesgo',
  miembro: 'equipo', indicador: 'indicador', estado: 'comentario',
};

// Desde bitacora.queries.js::obtenerBitacoraProyecto (módulo Bitácora) —
// categoria/titulo/contenido/nodo_tipo/nodo_id/nodo_nombre/metadata, ya
// con el título armado del lado del servidor.
export function normalizarEventoBitacora(item) {
  let avance = null;
  if (item.categoria === 'avance') {
    if (item.metadata?.avance_actual != null) avance = Math.round(parseFloat(item.metadata.avance_actual));
    else if (item.metadata?.estado === 'Completada') avance = 100;
    else if (item.metadata?.estado === 'Pendiente') avance = 0;
  }
  const carril = avance != null ? 'avance' : (CARRIL_DE_CATEGORIA[item.categoria] || 'comentario');
  return {
    id: item.id, carril, avance, titulo: item.titulo, contenido: item.contenido,
    autorNombre: item.autor_nombre, createdAt: item.created_at,
    nodo: item.nodo_id ? { tipo: item.nodo_tipo, id: item.nodo_id, nombre: item.nodo_nombre } : null,
    raw: item,
  };
}

// ─── Agrupación y resumen (compartidos de verdad) ───

const ETIQUETA_CONTEO = {
  documento: n => `${n} documento${n === 1 ? '' : 's'}`,
  indicador: n => `${n} indicador${n === 1 ? '' : 'es'}`,
  riesgo: n => `${n} riesgo${n === 1 ? '' : 's'}`,
  comentario: n => `${n} comentario${n === 1 ? '' : 's'}`,
  equipo: n => `${n} cambio${n === 1 ? '' : 's'} de equipo`,
};

// Una entrada de texto por columna (mes o trimestre) — la "red de
// seguridad" que describe en español lo que contiene cada una, para
// quien no lee gráficos. `columnas` ya viene de generarColumnas().
export function resumenPorColumna(eventos, columnas) {
  return columnas.map(col => {
    const delPeriodo = eventos.filter(ev => {
      const t = new Date(ev.createdAt).getTime();
      return t >= col.inicio.getTime() && t < col.fin.getTime();
    });
    const avances = delPeriodo
      .filter(e => e.carril === 'avance' && e.avance != null)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const conteos = {};
    for (const ev of delPeriodo) {
      if (ev.carril === 'avance') continue;
      conteos[ev.carril] = (conteos[ev.carril] || 0) + 1;
    }
    const partes = [];
    if (avances.length > 0) {
      partes.push(`${avances.length} de avance, cerró en ${avances[avances.length - 1].avance}%`);
    }
    for (const carril of Object.keys(conteos)) {
      const fmt = ETIQUETA_CONTEO[carril];
      partes.push(fmt ? fmt(conteos[carril]) : `${conteos[carril]} ${carril}`);
    }
    return {
      key: col.key, label: col.label, labelLargo: col.labelLargo,
      texto: partes.length > 0 ? partes.join(' · ') : 'sin movimiento',
      total: delPeriodo.length,
    };
  });
}

// Asigna a cada evento el avance que tenía el elemento justo en ese
// momento (el último valor conocido antes o en esa fecha) — para la
// columna de avance de la bitácora cronológica. `eventosDesc` viene
// ordenado más reciente primero, como el resto de la app.
export function conAvanceEnElMomento(eventosDesc) {
  const asc = [...eventosDesc].reverse();
  let actual = null;
  const porId = new Map();
  for (const ev of asc) {
    if (ev.carril === 'avance' && ev.avance != null) actual = ev.avance;
    porId.set(ev.id, actual);
  }
  return eventosDesc.map(ev => ({ ...ev, avanceEnElMomento: porId.get(ev.id) }));
}

// Huecos de inactividad de `umbralDias` o más entre eventos consecutivos
// (ordenados más reciente primero) — el renglón "N días sin movimiento"
// de la bitácora cronológica.
export function detectarHuecos(eventosDesc, umbralDias = 10) {
  const huecos = [];
  for (let i = 0; i < eventosDesc.length - 1; i++) {
    const masReciente = eventosDesc[i];
    const masAntiguo = eventosDesc[i + 1];
    const dias = diasEntre(masReciente.createdAt, masAntiguo.createdAt);
    if (dias >= umbralDias) {
      huecos.push({ trasId: masReciente.id, dias, desde: masAntiguo.createdAt, hasta: masReciente.createdAt });
    }
  }
  return huecos;
}
