/**
 * ARCHIVO: usarCapturaValorIndicador.js
 * PROPÓSITO: Lógica compartida para capturar el valor total de un
 *            indicador a mano — reusado por el modal rápido de las
 *            tarjetas y por la ficha de detalle, para que las dos
 *            copias no diverjan.
 *
 * El viejo PATCH /indicadores/:id/valor (modo_calculo='manual', con
 * selector de periodo para indicadores 'Anual') se retiró — toda
 * captura, automática o a mano, pasa ahora por el historial de
 * movimientos (migración 084, ver indicador-movimientos.queries.js).
 * Ese historial no tiene noción de "periodo": un indicador 'Anual' se
 * trata igual que uno 'Simple', un solo total (ver Bloque 9.2 del
 * encargo — en producción `indicador_metas_anuales` nunca llegó a tener
 * un valor real capturado por periodo, así que no hay nada que migrar
 * ahí). El selector de periodo queda sin usarse a propósito.
 * Quien captura sigue escribiendo el valor TOTAL que quiere que quede
 * (no una diferencia) — aquí se calcula la diferencia contra
 * `valor_actual` antes de mandarla, para que el ledger reciba el
 * movimiento correcto sin que quien captura tenga que pensar en restas.
 */
import { useState } from 'react';
import * as indicadoresApi from '../api/indicadores';

export function usarCapturaValorIndicador(indicador) {
  const mostrarSelectorPeriodo = false;
  const periodos = [];
  const sinPeriodos = false;

  const [idPeriodo, setIdPeriodo] = useState(null);
  const periodoActual = null;

  const valorInicial = indicador.valor_actual ?? '';
  const [valor, setValor] = useState(valorInicial != null ? String(valorInicial) : '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  function cambiarPeriodo() {}

  // Devuelve true/false en vez de lanzar — el llamador decide qué hacer
  // en éxito (toast, cerrar modal, recargar) sin que este hook tenga que
  // saber de esas cosas.
  async function guardar() {
    if (valor === '' || isNaN(parseFloat(valor))) {
      setError('Escribe un número válido.');
      return false;
    }
    const nuevoTotal = parseFloat(valor);
    const diferencia = nuevoTotal - (parseFloat(indicador.valor_actual) || 0);
    if (diferencia === 0) return true;
    setGuardando(true);
    setError('');
    try {
      await indicadoresApi.crearMovimientoIndicador(indicador.id, {
        cantidad: diferencia,
        nota: 'Valor capturado a mano',
      });
      return true;
    } catch (err) {
      setError(err.response?.data?.mensaje || 'No se pudo guardar el valor.');
      return false;
    } finally {
      setGuardando(false);
    }
  }

  const metaActual = indicador.meta_global;

  return {
    mostrarSelectorPeriodo, sinPeriodos, periodos,
    idPeriodo, cambiarPeriodo, periodoActual,
    valor, setValor, guardando, error, guardar, metaActual,
  };
}
