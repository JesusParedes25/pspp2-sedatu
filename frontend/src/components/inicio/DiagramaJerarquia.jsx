/**
 * ARCHIVO: DiagramaJerarquia.jsx
 * PROPÓSITO: Guía de uso, Parte 1 (bloque 4.1 de "PSPP v2.0 · Inicio,
 *            color y la guía de uso") — un árbol de verdad (ramas +
 *            sangría, no una fila de cajas, que era el diagrama
 *            anterior) con un ejemplo real: PTO de Manzanillo →
 *            Diagnóstico territorial → Integrar información base →
 *            Solicitar cartografía. Rótulos de nivel a un costado
 *            (Proyecto/Etapa/Acción/Tarea) y, a la derecha, la flecha
 *            "el avance sube solo" de Tarea hasta Proyecto.
 *
 *            SVG en línea, sin librerías. Ancho FIJO (no width="100%")
 *            dentro de un contenedor con scroll horizontal propio: a
 *            400px de pantalla el sidebar fijo de la plataforma deja
 *            poco espacio real, y un SVG a porcentaje se encoge hasta
 *            volverse ilegible (ver la nota de este mismo archivo en la
 *            versión anterior). Con ancho fijo, el texto (12-13px) nunca
 *            se encoge: si no cabe, el contenedor se desplaza.
 */
import { TREE_X0, INDENT, BOX_W, BOX_H, ANCHO_DIAGRAMA, ALTO_DIAGRAMA, calcularFilas, primeraFilaPorTipo } from './arbolEjemplo';

const GUINDA = '#7B1C3E';
const MORADO = '#7c3aed';

export default function DiagramaJerarquia() {
  const { filas, porId } = calcularFilas();
  const rotulos = primeraFilaPorTipo(filas);
  const tarea1 = filas.find(f => f.id === 'tarea1');
  const proyecto = porId.proyecto;
  const xFlecha = TREE_X0 + 3 * INDENT + BOX_W + 55;

  return (
    <div className="w-full overflow-x-auto">
      <svg
        width={ANCHO_DIAGRAMA}
        height={ALTO_DIAGRAMA}
        viewBox={`0 0 ${ANCHO_DIAGRAMA} ${ALTO_DIAGRAMA}`}
        role="img"
        aria-label="Árbol de ejemplo: PTO de Manzanillo, con la etapa Diagnóstico territorial dividida en dos acciones, una de ellas (Integrar información base) dividida en dos tareas. El avance sube solo desde la tarea hasta el proyecto."
      >
        <defs>
          {/* orient="auto" ya rota el marcador según la tangente del
              trazo en cada extremo — con el punto (la punta) en x=8
              alineado al final del trazo (refX=8), la flecha apunta
              siempre hacia donde avanza el trazo, sin rotación manual. */}
          <marker id="jh-flecha-sube" markerWidth="8" markerHeight="8" refX="8" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill={MORADO} />
          </marker>
        </defs>

        {/* Ramas: una línea en escuadra por cada fila con padre — todas
            las de un mismo padre comparten el punto de partida (su
            "elbowX" depende solo de la profundidad del hijo), así que se
            superponen en el tramo compartido y se leen como un solo
            tronco con ramas, igual que un árbol de carpetas. */}
        {filas.filter(f => f.padre).map(f => {
          const padre = porId[f.padre];
          return (
            <path
              key={f.id}
              d={`M ${f.elbowX} ${padre.cy} V ${f.cy} H ${f.x}`}
              fill="none" stroke={GUINDA} strokeWidth={1.4} strokeLinecap="round"
            />
          );
        })}

        {/* Cajas */}
        {filas.map(f => (
          <g key={f.id}>
            <rect x={f.x} y={f.y} width={BOX_W} height={BOX_H} rx={6} fill="#fbf3f6" stroke={GUINDA} strokeWidth={1.2} />
            <text x={f.x + 12} y={f.cy + 4} fontSize={12.5} fontWeight={600} fill="#4e0e27">{f.texto}</text>
          </g>
        ))}

        {/* Rótulos de nivel, a un costado, anclados a la primera fila
            donde aparece cada uno (Proyecto→Etapa→Acción→Tarea aparecen
            en ese orden exacto en las primeras 4 filas) — la sangría
            hace el resto: cualquier caja alineada con esa misma columna
            es del mismo nivel, sin necesitar una guía punteada por fila
            (que, a esa distancia, chocaba con el propio texto del
            rótulo más largo, "PROYECTO"). */}
        {rotulos.map(f => (
          <text key={`rotulo-${f.tipo}`} x={f.x - 10} y={f.cy + 4} fontSize={12} fontWeight={700} fill="#9ca3af" textAnchor="end" letterSpacing="0.3">
            {f.tipo.toUpperCase()}
          </text>
        ))}

        {/* "el avance sube solo": de Tarea (primera) hasta Proyecto */}
        <path
          d={`M ${tarea1.right + 10} ${tarea1.cy} H ${xFlecha} V ${proyecto.cy} H ${proyecto.right + 10}`}
          fill="none" stroke={MORADO} strokeWidth={1.6} markerEnd="url(#jh-flecha-sube)"
        />
        <text x={xFlecha + 8} y={(tarea1.cy + proyecto.cy) / 2} fontSize={12} fontWeight={700} fill={MORADO}>
          <tspan x={xFlecha + 8} dy="-4">el avance</tspan>
          <tspan x={xFlecha + 8} dy="14">sube solo</tspan>
        </text>
      </svg>
    </div>
  );
}
