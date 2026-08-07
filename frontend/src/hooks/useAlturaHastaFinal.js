/**
 * ARCHIVO: useAlturaHastaFinal.js
 * PROPÓSITO: Altura real desde el borde superior de un elemento hasta el
 *            final del viewport (menos un margen) — para que un contenedor
 *            con scroll interno (el cuerpo de 3 columnas de Detalle) quepa
 *            exacto en el espacio que sobra, sin importar cuánto mida el
 *            contenido de arriba (descripción larga, DGs que envuelven a
 *            2 líneas, etc.). Un offset fijo en px se rompe apenas ese
 *            contenido cambia de alto — por eso se mide en vez de adivinar.
 *
 * MINI-CLASE: por qué es un ref CALLBACK y no un useRef simple
 * ─────────────────────────────────────────────────────────────────
 * Con un useRef normal, el useEffect que mide corre una sola vez al montar
 * el componente. Si en ESE primer render el elemento todavía no existe
 * (p. ej. porque el caller muestra un esqueleto de carga mientras espera
 * datos, y el <div ref={...}> real solo aparece después), el efecto mide
 * con el ref en null, no hace nada, y nunca se vuelve a disparar — la
 * altura se queda sin calcular para siempre (bug real, visto en Detalle:
 * el panel crecía a su alto "natural" de contenido en vez de acotarse al
 * viewport). Un ref callback avisa exactamente cuándo el nodo aparece en
 * el DOM, sin importar en qué render haya sido, así que medimos ahí mismo.
 * ─────────────────────────────────────────────────────────────────
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export function useAlturaHastaFinal(margenInferior = 24, alturaMinima = 420) {
  const elRef = useRef(null);
  const [altura, setAltura] = useState(null);

  const medir = useCallback(() => {
    if (!elRef.current) return;
    const top = elRef.current.getBoundingClientRect().top;
    setAltura(Math.max(window.innerHeight - top - margenInferior, alturaMinima));
  }, [margenInferior, alturaMinima]);

  const ref = useCallback(node => {
    elRef.current = node;
    if (node) medir();
  }, [medir]);

  useEffect(() => {
    medir();
    window.addEventListener('resize', medir);
    // Cubre cambios de contenido arriba del elemento (descripción "Ver más",
    // DGs que envuelven, etc.) sin depender de que el caller nos avise.
    const obs = new ResizeObserver(medir);
    obs.observe(document.body);
    return () => { window.removeEventListener('resize', medir); obs.disconnect(); };
  }, [medir]);

  return [ref, altura];
}
