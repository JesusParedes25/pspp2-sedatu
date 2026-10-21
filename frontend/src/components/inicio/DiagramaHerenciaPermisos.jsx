/**
 * ARCHIVO: DiagramaHerenciaPermisos.jsx
 * PROPÓSITO: Guía de uso, Parte 2 (bloque 4.2 de "PSPP v2.0 · Inicio,
 *            color y la guía de uso") — el mismo árbol de
 *            arbolEjemplo.js, con una persona asignada como Responsable
 *            en la etapa "Diagnóstico territorial". Marca que ese
 *            permiso alcanza a las acciones/tareas que cuelgan de ella
 *            (resaltadas) y que NO alcanza al proyecto ni a las etapas
 *            hermanas (en gris). Es la regla que más se malentiende de
 *            la plataforma (ver docs/modelo-permisos.md): un permiso
 *            baja, nunca sube ni se reparte entre hermanos.
 */
import { TREE_X0, INDENT, BOX_W, BOX_H, calcularFilas, primeraFilaPorTipo } from './arbolEjemplo';

const GUINDA = '#7B1C3E';
const GRIS = '#9ca3af';
const GRIS_LINEA = '#d1d5db';

// Nodos que SÍ reciben el permiso de Responsable asignado en "etapa1":
// ella misma y todo lo que cuelga de ella (sus acciones y las tareas de
// esas acciones) — nunca el proyecto, nunca sus etapas hermanas.
const ALCANZADOS = new Set(['etapa1', 'accion1', 'tarea1', 'tarea2', 'accion2']);

export default function DiagramaHerenciaPermisos() {
  const { filas, porId } = calcularFilas();
  const rotulos = primeraFilaPorTipo(filas);
  const etapa1 = porId.etapa1;
  const proyecto = porId.proyecto;
  const ultimaAlcanzada = filas.filter(f => ALCANZADOS.has(f.id)).slice(-1)[0];
  const ultimaFila = filas[filas.length - 1];
  // La altura del lienzo tiene que cubrir TODO el árbol (incluidas
  // etapa2/etapa3, en gris, que NO reciben el permiso) — no solo el
  // tramo resaltado, que normalmente termina antes.
  const alto = Math.max(ultimaAlcanzada.y, ultimaFila.y) + BOX_H + 40;
  // Tres elementos a la derecha de la etapa con el permiso, en orden de
  // cercanía: la persona (junto a la caja), "nunca hacia arriba" (un
  // salto corto y cercano a proyecto/etapa — por eso va primero, pegado
  // al árbol) y "hereda hacia abajo" (el trazo largo, más alejado).
  // Antes las dos flechas vivían muy separadas del árbol y se leían como
  // íconos sueltos sin relación visual con las cajas que describen.
  const xPersona = etapa1.right + 18;
  const xNunca = etapa1.right + 128;
  const xHereda = etapa1.right + 268;
  const ancho = xHereda + 150;

  return (
    <div className="w-full overflow-x-auto">
      <svg
        width={ancho}
        height={alto}
        viewBox={`0 0 ${ancho} ${alto}`}
        role="img"
        aria-label="Mismo árbol de ejemplo: una persona es Responsable de la etapa Diagnóstico territorial. El permiso alcanza a sus acciones y tareas (resaltadas), pero no al proyecto PTO de Manzanillo ni a las etapas hermanas (en gris). El permiso se hereda hacia abajo, nunca hacia arriba."
      >
        <defs>
          <marker id="hp-flecha-abajo" markerWidth="8" markerHeight="8" refX="4" refY="8" orient="auto">
            <path d="M0,0 L8,0 L4,8 Z" fill={GUINDA} />
          </marker>
          <marker id="hp-flecha-arriba-gris" markerWidth="8" markerHeight="8" refX="4" refY="0" orient="auto">
            <path d="M0,8 L8,8 L4,0 Z" fill={GRIS} />
          </marker>
        </defs>

        {/* Zona resaltada: un óvalo/rect suave detrás de etapa1 y todo lo
            que cuelga de ella, para que "hasta aquí llega el permiso" se
            vea de un vistazo, no solo se infiera de los bordes de cada
            caja. */}
        <rect
          x={etapa1.x - 10} y={etapa1.y - 8}
          width={BOX_W + 2 * INDENT + 20} height={(ultimaAlcanzada.y + BOX_H) - etapa1.y + 16}
          rx={10} fill="#7B1C3E" opacity={0.06}
        />

        {/* Ramas (todas, alcanzadas o no — la estructura del árbol es la
            misma; lo que cambia es a quién llega el permiso) */}
        {filas.filter(f => f.padre).map(f => {
          const padre = porId[f.padre];
          const vivo = ALCANZADOS.has(f.id);
          return (
            <path
              key={f.id}
              d={`M ${f.elbowX} ${padre.cy} V ${f.cy} H ${f.x}`}
              fill="none" stroke={vivo ? GUINDA : GRIS_LINEA} strokeWidth={1.4} strokeLinecap="round"
            />
          );
        })}

        {/* Cajas: alcanzadas en guinda sólido, proyecto y hermanas en gris
            apagado — la MISMA caja que el diagrama 4.1, solo con otro
            color, para que se lea como "mismo árbol, otra capa". */}
        {filas.map(f => {
          const vivo = ALCANZADOS.has(f.id);
          return (
            <g key={f.id}>
              <rect
                x={f.x} y={f.y} width={BOX_W} height={BOX_H} rx={6}
                fill={vivo ? '#fbf3f6' : '#f3f4f6'}
                stroke={vivo ? GUINDA : GRIS}
                strokeWidth={1.2}
                strokeDasharray={vivo ? undefined : '3,2'}
              />
              <text x={f.x + 12} y={f.cy + 4} fontSize={12.5} fontWeight={600} fill={vivo ? '#4e0e27' : '#6b7280'}>
                {f.texto}
              </text>
            </g>
          );
        })}

        {/* La persona, pegada a la etapa donde se le asignó el permiso —
            un glifo mínimo dibujado a mano (círculo + arco), no un ícono
            de librería: el encargo pide SVG en línea sin dependencias. */}
        <g>
          <circle cx={xPersona} cy={etapa1.cy} r={10} fill="#fbf3f6" stroke={GUINDA} strokeWidth={1.2} />
          <circle cx={xPersona} cy={etapa1.cy - 3} r={2.6} fill={GUINDA} />
          <path d={`M ${xPersona - 4.6} ${etapa1.cy + 5.5} a 4.6 4 0 0 1 9.2 0`} fill={GUINDA} />
          <text x={xPersona + 14} y={etapa1.cy + 4} fontSize={12} fontWeight={700} fill={GUINDA}>Responsable</text>
        </g>

        {/* Rótulos de nivel, igual que en el diagrama de jerarquía */}
        {rotulos.map(f => (
          <g key={`rotulo-${f.tipo}`}>
            <text x={f.x - 10} y={f.cy + 4} fontSize={12} fontWeight={700} fill="#9ca3af" textAnchor="end" letterSpacing="0.3">
              {f.tipo.toUpperCase()}
            </text>
          </g>
        ))}

        {/* "nunca hacia arriba": un salto corto, pegado al árbol — conecta
            visualmente SOLO proyecto y etapa1 (el único tramo donde el
            permiso podría, erróneamente, pensarse que sube), tachado y en
            gris. Va primero (más cerca del árbol) porque es un trazo
            corto: lejos del árbol se leía como un ícono suelto sin
            relación con ninguna caja. */}
        <line x1={xNunca} y1={etapa1.cy - 10} x2={xNunca} y2={proyecto.cy + 4} stroke={GRIS} strokeWidth={1.8} markerEnd="url(#hp-flecha-arriba-gris)" />
        <line x1={xNunca - 7} y1={(etapa1.cy + proyecto.cy) / 2} x2={xNunca + 7} y2={(etapa1.cy + proyecto.cy) / 2} stroke={GRIS} strokeWidth={2.2} />
        <text x={xNunca + 9} y={(etapa1.cy + proyecto.cy) / 2 + 4} fontSize={12} fontWeight={700} fill={GRIS}>
          <tspan x={xNunca + 9} dy="-5">nunca</tspan>
          <tspan x={xNunca + 9} dy="14">hacia arriba</tspan>
        </text>

        {/* "el permiso se hereda hacia abajo": el trazo largo, hasta el
            último nodo alcanzado — va más lejos del árbol porque abarca
            varias filas y necesita más aire para su etiqueta de dos
            líneas. */}
        <line x1={xHereda} y1={etapa1.cy + 10} x2={xHereda} y2={ultimaAlcanzada.cy} stroke={GUINDA} strokeWidth={1.8} markerEnd="url(#hp-flecha-abajo)" />
        <text x={xHereda + 9} y={(etapa1.cy + ultimaAlcanzada.cy) / 2 + 4} fontSize={12} fontWeight={700} fill={GUINDA}>
          <tspan x={xHereda + 9} dy="-5">el permiso se</tspan>
          <tspan x={xHereda + 9} dy="14">hereda hacia abajo</tspan>
        </text>
      </svg>
    </div>
  );
}
