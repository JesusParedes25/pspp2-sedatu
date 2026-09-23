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
    meta_global: '', temporalidad: 'Global', unidad_periodo: 'Anio',
    anio_inicio: anio, anio_fin: anio,
    metas_anuales: [], composicion: 'Simple', tipo_grafico: 'barras',
    categorias: [], descripcion: '', _abierto: true,
  };
}

// Filas de metas por año para un rango [inicio, fin], conservando la
// meta (y el id real, necesario para el upsert por diff del backend) de
// los años que se repiten.
export function calcularMetasAnuales(inicio, fin, existentes = []) {
  const nuevas = [];
  for (let a = inicio; a <= fin; a++) {
    const previa = existentes.find(m => m.anio === a);
    nuevas.push({ id: previa?.id, anio: a, meta: previa?.meta ?? '' });
  }
  return nuevas;
}

// Igual que calcularMetasAnuales pero en bloques de 6 años calendario a
// partir de "inicio" (ej. 2018→2018-2024, 2024→2024-2030) — el usuario
// define su propio año de arranque, no se codifican fechas reales de
// sexenios mexicanos. "fin" es el último año que el bloque debe cubrir;
// el último bloque generado es el primero cuyo rango llega a "fin" o más.
export function calcularMetasSexenio(inicio, fin, existentes = []) {
  const nuevas = [];
  for (let a = inicio; a < fin || nuevas.length === 0; a += 6) {
    const previa = existentes.find(m => m.anio === a);
    const finBloque = a + 6;
    nuevas.push({ id: previa?.id, anio: a, etiqueta: `${a}–${finBloque}`, meta: previa?.meta ?? '' });
  }
  return nuevas;
}

// Fila en blanco para "+ agregar periodo" en modo Personalizado — sin
// año calendario real, el usuario define su propia etiqueta.
export function nuevoPeriodoPersonalizado() {
  return { anio: null, etiqueta: '', meta: '' };
}

// Fila en blanco para "+ agregar categoría" — un indicador por
// categorías (composicion='Categorias') es una lista de nombres libres
// que suman al total, sin año/periodo asociado en esta versión.
export function nuevaCategoria() {
  return { nombre: '', meta: '' };
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
