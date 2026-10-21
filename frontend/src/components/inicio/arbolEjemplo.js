/**
 * ARCHIVO: arbolEjemplo.js
 * PROPÓSITO: Datos y geometría del árbol de ejemplo que comparten los dos
 *            diagramas de la Guía de uso (DiagramaJerarquia.jsx — bloque
 *            4.1 — y DiagramaHerenciaPermisos.jsx — bloque 4.2). "El mismo
 *            árbol" (como pide el bloque 4.2) significa, literalmente, los
 *            mismos 8 nodos y las mismas coordenadas en los dos — una sola
 *            fuente, no dos copias que puedan desalinearse.
 *
 *            Ejemplo real (no "Etapa 1 / Acción 1"): PTO de Manzanillo →
 *            Diagnóstico territorial → Integrar información base →
 *            Solicitar cartografía, con dos etapas hermanas y una segunda
 *            acción/tarea para que el árbol se vea como un árbol de
 *            verdad (ramas, no una fila).
 */
export const TREE_X0 = 112;
export const INDENT = 34;
export const BOX_W = 232;
export const BOX_H = 30;
export const ROW_STEP = 42;
export const Y0 = 22;

export const FILAS = [
  { id: 'proyecto', depth: 0, tipo: 'Proyecto', texto: 'PTO de Manzanillo', padre: null },
  { id: 'etapa1', depth: 1, tipo: 'Etapa', texto: 'Diagnóstico territorial', padre: 'proyecto' },
  { id: 'accion1', depth: 2, tipo: 'Acción', texto: 'Integrar información base', padre: 'etapa1' },
  { id: 'tarea1', depth: 3, tipo: 'Tarea', texto: 'Solicitar cartografía', padre: 'accion1' },
  { id: 'tarea2', depth: 3, tipo: 'Tarea', texto: 'Delimitar polígono de estudio', padre: 'accion1' },
  { id: 'accion2', depth: 2, tipo: 'Acción', texto: 'Elaborar diagnóstico integrado', padre: 'etapa1' },
  { id: 'etapa2', depth: 1, tipo: 'Etapa', texto: 'Formulación del plan', padre: 'proyecto' },
  { id: 'etapa3', depth: 1, tipo: 'Etapa', texto: 'Validación y aprobación', padre: 'proyecto' },
];

// Posición de cada fila (x/y de su caja, centro vertical, punto donde se
// "dobla" la línea que la conecta con su padre) + lookup por id para
// resolver el padre de cada fila al dibujar las ramas.
export function calcularFilas() {
  const filas = FILAS.map((f, i) => {
    const x = TREE_X0 + f.depth * INDENT;
    const y = Y0 + i * ROW_STEP;
    return { ...f, i, x, y, cy: y + BOX_H / 2, right: x + BOX_W, elbowX: x - INDENT * 0.55 };
  });
  const porId = Object.fromEntries(filas.map(f => [f.id, f]));
  return { filas, porId };
}

// Primera fila donde aparece cada nivel (Proyecto→Etapa→Acción→Tarea
// aparecen en ese orden exacto en las primeras 4 filas) — ahí se ancla el
// rótulo lateral de cada nivel.
export function primeraFilaPorTipo(filas) {
  const vistos = new Set();
  const resultado = [];
  for (const f of filas) {
    if (!vistos.has(f.tipo)) { vistos.add(f.tipo); resultado.push(f); }
  }
  return resultado;
}

export const ANCHO_DIAGRAMA = TREE_X0 + 3 * INDENT + BOX_W + 130;
export const ALTO_DIAGRAMA = Y0 + FILAS.length * ROW_STEP + 20;
