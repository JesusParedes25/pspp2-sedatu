/**
 * ARCHIVO: DiagramaJerarquia.jsx
 * PROPÓSITO: Apoyo visual del bloque 4.3a de "PSPP v2.0 · Pantalla de
 *            Inicio" — el esquema Proyecto › Etapa › Acción › Tarea con
 *            la flecha "el avance sube solo". SVG en línea, sin
 *            librerías: dos variantes (horizontal/vertical) alternadas
 *            por Tailwind, para que a 400px de ancho el esquema se apile
 *            en vertical en vez de encogerse hasta ser ilegible.
 */
const NIVELES = ['Proyecto', 'Etapa', 'Acción', 'Tarea'];
const GUINDA = '#7B1C3E';

function Caja({ x, y, w, h, texto }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={6} fill="#fbf3f6" stroke={GUINDA} strokeWidth={1.2} />
      <text x={x + w / 2} y={y + h / 2 + 4} textAnchor="middle" fontSize={12} fontWeight={600} fill="#4e0e27">{texto}</text>
    </g>
  );
}

function DiagramaHorizontal() {
  const w = 140, h = 40, y = 70, gap = 40;
  const xs = NIVELES.map((_, i) => 10 + i * (w + gap));
  return (
    <svg viewBox="0 0 650 150" className="w-full h-auto" role="img" aria-label="Proyecto se divide en Etapa, Etapa en Acción, Acción en Tarea; el avance sube solo desde Tarea hasta Proyecto">
      <defs>
        <marker id="flecha-h-nivel" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto">
          <path d="M0,0 L7,3.5 L0,7 Z" fill={GUINDA} />
        </marker>
        <marker id="flecha-h-sube" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill="#9f7aea" transform="rotate(225 4 4)" />
        </marker>
      </defs>
      {NIVELES.map((n, i) => <Caja key={n} x={xs[i]} y={y} w={w} h={h} texto={n} />)}
      {xs.slice(0, -1).map((x, i) => (
        <line key={i} x1={x + w} y1={y + h / 2} x2={x + w + gap} y2={y + h / 2} stroke={GUINDA} strokeWidth={1.5} markerEnd="url(#flecha-h-nivel)" />
      ))}
      {/* "el avance sube solo": arco de Tarea (última caja) de regreso a Proyecto (primera) */}
      <path
        d={`M ${xs[3] + w / 2} ${y - 2} C ${xs[3] + w / 2} 18, ${xs[0] + w / 2} 18, ${xs[0] + w / 2} ${y - 2}`}
        fill="none" stroke="#9f7aea" strokeWidth={1.5} markerEnd="url(#flecha-h-sube)"
      />
      <text x="330" y="14" textAnchor="middle" fontSize={11} fontWeight={600} fill="#7c3aed">el avance sube solo</text>
    </svg>
  );
}

function DiagramaVertical() {
  const w = 130, h = 38, x = 10, gap = 38;
  const ys = NIVELES.map((_, i) => 10 + i * (h + gap));
  const xArco = x + w + 45;
  return (
    <svg viewBox="0 0 250 340" className="w-full h-auto" role="img" aria-label="Proyecto se divide en Etapa, Etapa en Acción, Acción en Tarea; el avance sube solo desde Tarea hasta Proyecto">
      <defs>
        <marker id="flecha-v-nivel" markerWidth="7" markerHeight="7" refX="3.5" refY="5.5" orient="auto">
          <path d="M0,0 L7,0 L3.5,7 Z" fill={GUINDA} />
        </marker>
        <marker id="flecha-v-sube" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill="#9f7aea" transform="rotate(135 4 4)" />
        </marker>
      </defs>
      {NIVELES.map((n, i) => <Caja key={n} x={x} y={ys[i]} w={w} h={h} texto={n} />)}
      {ys.slice(0, -1).map((yPos, i) => (
        <line key={i} x1={x + w / 2} y1={yPos + h} x2={x + w / 2} y2={yPos + h + gap} stroke={GUINDA} strokeWidth={1.5} markerEnd="url(#flecha-v-nivel)" />
      ))}
      {/* "el avance sube solo": arco de Tarea (última caja) de regreso a Proyecto (primera) */}
      <path
        d={`M ${x + w + 2} ${ys[3] + h / 2} C ${xArco} ${ys[3] + h / 2}, ${xArco} ${ys[0] + h / 2}, ${x + w + 2} ${ys[0] + h / 2}`}
        fill="none" stroke="#9f7aea" strokeWidth={1.5} markerEnd="url(#flecha-v-sube)"
      />
      <text x={xArco + 8} y={(ys[0] + ys[3]) / 2 + h / 2 - 4} fontSize={10} fontWeight={600} fill="#7c3aed">
        <tspan x={xArco + 8} dy="0">el avance</tspan>
        <tspan x={xArco + 8} dy="13">sube solo</tspan>
      </text>
    </svg>
  );
}

export default function DiagramaJerarquia() {
  return (
    <>
      {/* Ancho FIJO (no max-width) + overflow-x-auto: a 400px de ancho de
          pantalla, el sidebar fijo de la plataforma (256px, ver
          Sidebar.jsx — una limitación preexistente del layout, no de
          esta pantalla) deja muy poco espacio real a esta tarjeta. Con
          max-width nada más, el SVG (w-full) se encogía hasta volverse
          ilegible (~49px, medido). Un ancho fijo de 190px evita eso: el
          texto siempre se lee. Cuando esos 190px no caben en su columna,
          en vez de salirse del viewport sin control (desbordando hacia
          la derecha más allá de los 400px), overflow-x-auto lo vuelve un
          scroll horizontal contenido DENTRO del propio esquema —
          preferible según la instrucción explícita ("que se apile en
          vertical en vez de encogerse hasta ser ilegible"). */}
      <div className="block sm:hidden w-full overflow-x-auto"><div className="w-[190px]"><DiagramaVertical /></div></div>
      <div className="hidden sm:block"><DiagramaHorizontal /></div>
    </>
  );
}
