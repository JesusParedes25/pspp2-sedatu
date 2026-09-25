/**
 * ARCHIVO: MigajaPsedatu.jsx
 * PROPÓSITO: Migaja de pan ("Objetivo 1 › Estrategia 1.3 › Línea 1.3.2")
 *            para una entrada del catálogo del PSEDATU 2025-2030 — mueve
 *            el objetivo/estrategia/código de línea de acción de filtro
 *            (donde el usuario tenía que saber el número de antemano) a
 *            metadato visible directo en la tarjeta.
 *
 * Muestra solo el número mientras no haya título oficial cargado
 * (`titulos` viene de psedatu_objetivos/psedatu_estrategias, migración
 * 076 — tablas nuevas, vacías hasta que alguien cargue los títulos
 * reales) — nunca rompe ni se ve incompleta por faltar el título.
 */
const TRUNCAR = 60;

function truncar(texto) {
  return texto.length > TRUNCAR ? `${texto.slice(0, TRUNCAR)}…` : texto;
}

export default function MigajaPsedatu({ codigoLineaAccion, instrumento, titulos }) {
  if (instrumento !== 'PSEDATU 2025-2030' || !codigoLineaAccion) return null;

  const segmentos = codigoLineaAccion.split('.');
  const claveObjetivo = segmentos[0];
  const claveEstrategia = segmentos.length >= 2 ? `${segmentos[0]}.${segmentos[1]}` : null;
  // Los 9 indicadores compuestos por fórmula viven directo en
  // objetivo.estrategia (2 segmentos) sin una línea de acción debajo.
  const esLinea = segmentos.length >= 3;

  const tituloObjetivo = titulos?.objetivos?.[claveObjetivo];
  const tituloEstrategia = claveEstrategia ? titulos?.estrategias?.[claveEstrategia] : null;

  const partes = [
    { etiqueta: `Objetivo ${claveObjetivo}`, titulo: tituloObjetivo },
  ];
  if (claveEstrategia) {
    partes.push({ etiqueta: `Estrategia ${claveEstrategia}`, titulo: tituloEstrategia });
  }
  if (esLinea) {
    partes.push({ etiqueta: `Línea ${codigoLineaAccion}`, titulo: null });
  }

  return (
    <p className="text-[11px] text-gray-500" title={codigoLineaAccion}>
      {partes.map((p, i) => (
        <span key={p.etiqueta}>
          {i > 0 && <span className="text-gray-300 mx-1">›</span>}
          <span title={p.titulo || undefined}>
            {p.etiqueta}{p.titulo ? `: ${truncar(p.titulo)}` : ''}
          </span>
        </span>
      ))}
    </p>
  );
}
