/**
 * ARCHIVO: carrilesEventos.js
 * PROPÓSITO: Nombre, forma y color de cada carril de evento. Fuente
 *            ÚNICA usada por BitacoraCronologica.jsx (y, hasta su retiro,
 *            también por LineaTiempoEventos.jsx, ver historial de git),
 *            para que ningún componente tenga su propia copia de la
 *            paleta (que divergiría tarde o temprano).
 *
 * Colores ya validados contra contraste y daltonismo en ambos temas, se
 * usan tal cual, sin ajustarlos a ojo.
 */
export const NOMBRE_CARRIL = {
  documento: 'Documentos', indicador: 'Indicadores', riesgo: 'Riesgos',
  comentario: 'Comentarios', equipo: 'Equipo',
};

// 'avance' y 'comentario' comparten forma (círculo relleno) — se
// distinguen por posición (banda vs. carril) y color, no por forma.
export const FORMA_CARRIL = {
  avance: 'circulo', documento: 'cuadrado', indicador: 'rombo',
  riesgo: 'triangulo', comentario: 'circulo', equipo: 'circuloHueco',
};

export const COLORES_CLARO = {
  avance: '#a32a4d', documento: '#2272a8', riesgo: '#c94a1e',
  comentario: '#7a5ea8', indicador: '#008a74', equipo: '#8f6e0a',
};

export const COLORES_OSCURO = {
  avance: '#c4697f', documento: '#2f86bd', riesgo: '#cf7640',
  comentario: '#9b7ad6', indicador: '#3ba894', equipo: '#ad8c2a',
};

export function usaTemaOscuro() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

export function coloresActivos() {
  return usaTemaOscuro() ? COLORES_OSCURO : COLORES_CLARO;
}
