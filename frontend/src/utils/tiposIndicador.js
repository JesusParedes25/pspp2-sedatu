/**
 * ARCHIVO: tiposIndicador.js
 * PROPÓSITO: Único catálogo de tipos/unidades de indicador — antes
 *            copiado, literal, en al menos 5 archivos (NuevoProyecto,
 *            ModalEditarProyecto, SelectorIndicadorCatalogo,
 *            CatalogoIndicadores, y como objeto en TarjetaIndicador).
 *            Mismo criterio que ya se aplicó a otros catálogos de esta
 *            plataforma: un solo lugar, todos importan de aquí.
 *
 * La base de datos permite un séptimo valor de `tipo` ('Monto') que
 * nunca se ofreció en ningún formulario — ver migración de limpieza
 * que lo retira del CHECK. No se incluye aquí a propósito.
 */
export const TIPOS_INDICADOR = [
  { valor: 'Avance_fisico', etiqueta: 'Avance físico' },
  { valor: 'Avance_financiero', etiqueta: 'Avance financiero' },
  { valor: 'Cobertura', etiqueta: 'Cobertura' },
  { valor: 'Beneficiarios', etiqueta: 'Beneficiarios' },
  { valor: 'Gestion', etiqueta: 'Gestión' },
  { valor: 'Otro', etiqueta: 'Otro' },
];

export const UNIDADES_INDICADOR = [
  { valor: 'Porcentaje', etiqueta: '% (porcentaje)' },
  { valor: 'Moneda_MXN', etiqueta: '$ MXN (pesos)' },
  { valor: 'Numero', etiqueta: 'Número (personalizable)' },
];

// Estado inicial de un indicador de proyecto en blanco — mismo objeto
// para los 3 lugares donde se puede crear uno (crear proyecto, editar
// proyecto, wizard de vincular/crear).
export function indicadorProyectoVacio() {
  const anio = new Date().getFullYear();
  return {
    nombre: '', tipo: 'Avance_fisico', unidad: 'Numero',
    unidad_personalizada: '',
    meta_global: '', temporalidad: 'Global',
    anio_inicio: anio, anio_fin: anio,
    metas_anuales: [], descripcion: '', _abierto: true,
  };
}

// Filas de metas por año para un rango [inicio, fin], conservando la
// meta ya capturada de los años que se repiten.
export function calcularMetasAnuales(inicio, fin, existentes = []) {
  const nuevas = [];
  for (let a = inicio; a <= fin; a++) {
    const previa = existentes.find(m => m.anio === a);
    nuevas.push({ anio: a, meta: previa?.meta ?? '' });
  }
  return nuevas;
}

// Valor por defecto inteligente al ARMAR un indicador nuevo a partir de
// una entrada del catálogo: "Avance financiero" casi siempre necesita
// corte por ejercicio fiscal. Se aplica una sola vez, al momento de
// elegir/crear la entrada del catálogo (antes de que el usuario toque
// nada) — nunca sobre un indicador que ya se estaba editando, para no
// pisar una elección hecha a propósito.
export function conDefaultsPorTipo(indicador) {
  if (indicador.tipo !== 'Avance_financiero' || indicador.temporalidad === 'Anual') return indicador;
  const anio = new Date().getFullYear();
  return {
    ...indicador,
    temporalidad: 'Anual',
    anio_inicio: anio,
    anio_fin: anio,
    metas_anuales: calcularMetasAnuales(anio, anio),
  };
}
