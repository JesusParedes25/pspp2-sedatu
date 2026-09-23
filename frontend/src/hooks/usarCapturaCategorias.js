/**
 * ARCHIVO: usarCapturaCategorias.js
 * PROPÓSITO: Captura manual del valor de cada categoría de un indicador
 *            composicion='Categorias'. A diferencia de
 *            usarCapturaValorIndicador (que selecciona UN periodo de una
 *            lista y captura su valor, pensado para un rango de años
 *            potencialmente largo), aquí la lista de categorías es
 *            corta y fija — se editan todas a la vez, no una por una.
 *            Mismo endpoint PATCH /indicadores/:id/valor de siempre
 *            (con id_categoria en vez de id_periodo), llamado una vez
 *            por cada fila que de verdad cambió — no hace falta un
 *            endpoint de lote nuevo.
 */
import { useState, useEffect } from 'react';
import * as indicadoresApi from '../api/indicadores';

export function usarCapturaCategorias(indicador) {
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

  // Devuelve true/false en vez de lanzar — el llamador decide qué hacer
  // en éxito (toast, cerrar modal, recargar).
  async function guardar() {
    setGuardando(true);
    setError('');
    try {
      for (const cat of categorias) {
        const nuevo = valores[cat.id];
        const actual = cat.valor_actual ?? '';
        if (String(nuevo) === String(actual)) continue;
        if (nuevo === '' || isNaN(parseFloat(nuevo))) continue;
        await indicadoresApi.establecerValorIndicador(indicador.id, {
          valor: parseFloat(nuevo),
          id_categoria: cat.id,
        });
      }
      return true;
    } catch (err) {
      setError(err.response?.data?.mensaje || 'No se pudo guardar algún valor.');
      return false;
    } finally {
      setGuardando(false);
    }
  }

  return { categorias, sinCategorias, valores, cambiarValor, guardar, guardando, error };
}
