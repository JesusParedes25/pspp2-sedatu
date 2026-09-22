/**
 * ARCHIVO: usarCapturaValorIndicador.js
 * PROPÓSITO: Lógica compartida para capturar el valor de un indicador
 *            modo_calculo='manual' — seleccionar el periodo (si el
 *            indicador es de temporalidad 'Anual') y guardar el valor.
 *            Antes vivía duplicada dentro de ModalEditarValorIndicador;
 *            se extrae para que la pantalla de detalle del indicador la
 *            reuse sin que las dos copias diverjan.
 *
 * El backend ya NO autocrea un periodo al capturarle un valor (a
 * diferencia de la versión anterior, que "inventaba" la fila del año si
 * no existía) — con periodos Personalizado un año no identifica de
 * forma confiable "cuál periodo", así que ahora siempre se elige entre
 * los periodos que ya existen (definidos en la sección de Definición) y
 * se manda su id real. Si el indicador es 'Anual' pero todavía no tiene
 * ningún periodo definido, no hay nada que capturar — el llamador debe
 * mostrar ese caso en vez de ofrecer un selector vacío.
 */
import { useState } from 'react';
import * as indicadoresApi from '../api/indicadores';

export function usarCapturaValorIndicador(indicador) {
  const mostrarSelectorPeriodo = indicador.temporalidad === 'Anual';
  const periodos = indicador.metas_anuales || [];
  const sinPeriodos = mostrarSelectorPeriodo && periodos.length === 0;

  const [idPeriodo, setIdPeriodo] = useState(periodos[periodos.length - 1]?.id ?? null);
  const periodoActual = periodos.find(p => p.id === idPeriodo) || null;

  const valorInicial = mostrarSelectorPeriodo
    ? (periodoActual?.valor_actual ?? '')
    : (indicador.valor_actual ?? '');
  const [valor, setValor] = useState(valorInicial != null ? String(valorInicial) : '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  function cambiarPeriodo(nuevoId) {
    setIdPeriodo(nuevoId);
    const existente = periodos.find(p => p.id === nuevoId)?.valor_actual;
    setValor(existente != null ? String(existente) : '');
  }

  // Devuelve true/false en vez de lanzar — el llamador decide qué hacer
  // en éxito (toast, cerrar modal, recargar) sin que este hook tenga que
  // saber de esas cosas.
  async function guardar() {
    if (valor === '' || isNaN(parseFloat(valor))) {
      setError('Escribe un número válido.');
      return false;
    }
    if (mostrarSelectorPeriodo && !idPeriodo) {
      setError('Elige un periodo.');
      return false;
    }
    setGuardando(true);
    setError('');
    try {
      await indicadoresApi.establecerValorIndicador(indicador.id, {
        valor: parseFloat(valor),
        id_periodo: mostrarSelectorPeriodo ? idPeriodo : undefined,
      });
      return true;
    } catch (err) {
      setError(err.response?.data?.mensaje || 'No se pudo guardar el valor.');
      return false;
    } finally {
      setGuardando(false);
    }
  }

  const metaActual = mostrarSelectorPeriodo ? periodoActual?.meta : indicador.meta_global;

  return {
    mostrarSelectorPeriodo, sinPeriodos, periodos,
    idPeriodo, cambiarPeriodo, periodoActual,
    valor, setValor, guardando, error, guardar, metaActual,
  };
}
