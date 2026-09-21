/**
 * ARCHIVO: formatoMoneda.js
 * PROPÓSITO: Formato compartido para indicadores unidad='Moneda_MXN'.
 *
 * Antes cada pantalla mostraba el número crudo (mismo `toLocaleString`
 * que cualquier otro indicador) y le pegaba el sufijo "MXN"/"$MXN" a
 * mano — ni signo de peso real, ni separador de miles garantizado, ni
 * decimales. Un indicador financiero se leía igual que uno de conteo
 * ("1.2M MXN" en vez de "$1,200,000.00"). Esto centraliza el único
 * formato correcto para usarlo en todos lados por igual.
 */
const formatterCompleto = new Intl.NumberFormat('es-MX', {
  style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2,
});

// Sin decimales — para donde el centavo no aporta nada (tarjetas, listas).
const formatterEntero = new Intl.NumberFormat('es-MX', {
  style: 'currency', currency: 'MXN', maximumFractionDigits: 0,
});

export function formatearMoneda(valor, { decimales = true } = {}) {
  const n = parseFloat(valor);
  if (valor == null || isNaN(n)) return '—';
  return (decimales ? formatterCompleto : formatterEntero).format(n);
}

// Abreviado para tarjetas y listas densas: $1.2M, $850k — mismo corte
// que formatoCorto() de TarjetaIndicador, con el signo $ real en vez
// del sufijo "MXN" suelto.
export function formatearMonedaCorta(valor) {
  const n = parseFloat(valor);
  if (valor == null || isNaN(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(1).replace(/\.0$/, '')}MMM`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (abs >= 1e4) return `$${(n / 1e3).toFixed(1).replace(/\.0$/, '')}k`;
  return formatearMoneda(n, { decimales: false });
}

// Etiqueta de unidad de un indicador — un solo lugar para el ternario
// Porcentaje/Moneda_MXN/personalizada que estaba copiado en ~7 archivos
// (formularios de alta/edición de indicadores y las tarjetas de
// consulta), cada uno con su propia variación menor ('$MXN' vs '$ MXN'
// vs 'MXN' a secas).
export function etiquetaUnidadIndicador(ind) {
  if (ind.unidad === 'Porcentaje') return '%';
  if (ind.unidad === 'Moneda_MXN') return '$ MXN';
  return ind.etiqueta_unidad || ind.unidad_personalizada || '';
}
