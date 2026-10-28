/**
 * ARCHIVO: usarCapturaCategorias.js
 * PROPÓSITO: Mostrar el último valor conocido de cada categoría de un
 *            indicador composicion='Categorias'. Dejó de ser editable:
 *            el viejo PATCH /indicadores/:id/valor con id_categoria se
 *            retiró junto con el resto de la captura directa (ver
 *            usarCapturaValorIndicador) y el nuevo historial de
 *            movimientos no tiene noción de categoría — solo totaliza
 *            por indicador (Bloque 7 del encargo: "la funcionalidad de
 *            meta dividida en categorías se quita"). Las categorías y su
 *            último valor siguen en la base tal cual estaban — esto solo
 *            deja de ofrecer un botón que ya no tiene a dónde escribir,
 *            en vez de dejarlo fallar con un error de red.
 */
import { useState, useEffect } from 'react';

export function usarCapturaCategorias(indicador, categoriasConAportacion = new Set()) {
  const categorias = indicador.categorias || [];
  const sinCategorias = categorias.length === 0;

  const [valores, setValores] = useState(() => Object.fromEntries(categorias.map(c => [c.id, c.valor_actual ?? ''])));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  // Si se recarga el indicador (tras guardar, o desde otra pantalla), el
  // formulario se resincroniza con lo real.
  useEffect(() => {
    setValores(Object.fromEntries(categorias.map(c => [c.id, c.valor_actual ?? ''])));
  }, [indicador]); // eslint-disable-line react-hooks/exhaustive-deps

  function cambiarValor(idCategoria, valor) {
    setValores(v => ({ ...v, [idCategoria]: valor }));
  }

  // Ya no hay a dónde guardar (ver mini-clase arriba) — devuelve false de
  // inmediato con una explicación, sin intentar ninguna llamada de red.
  async function guardar() {
    setError('La captura por categoría ya no está disponible. Registra el valor total del indicador en conjunto, desde "Valor".');
    return false;
  }

  return { categorias, sinCategorias, valores, cambiarValor, guardar, guardando, error };
}
