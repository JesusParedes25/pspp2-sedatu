/**
 * ARCHIVO: useAlturaHastaFinal.js
 * PROPÓSITO: Altura real desde el borde superior de un elemento hasta el
 *            final del viewport (menos un margen) — para que un contenedor
 *            con scroll interno (el cuerpo de 3 columnas de Detalle) quepa
 *            exacto en el espacio que sobra, sin importar cuánto mida el
 *            contenido de arriba (descripción larga, DGs que envuelven a
 *            2 líneas, etc.). Un offset fijo en px se rompe apenas ese
 *            contenido cambia de alto — por eso se mide en vez de adivinar.
 */
import { useEffect, useRef, useState } from 'react';

export function useAlturaHastaFinal(margenInferior = 24, alturaMinima = 420) {
  const ref = useRef(null);
  const [altura, setAltura] = useState(null);

  useEffect(() => {
    function medir() {
      if (!ref.current) return;
      const top = ref.current.getBoundingClientRect().top;
      setAltura(Math.max(window.innerHeight - top - margenInferior, alturaMinima));
    }
    medir();
    window.addEventListener('resize', medir);
    // Cubre cambios de contenido arriba del elemento (descripción "Ver más",
    // DGs que envuelven, etc.) sin depender de que el caller nos avise.
    const obs = new ResizeObserver(medir);
    obs.observe(document.body);
    return () => { window.removeEventListener('resize', medir); obs.disconnect(); };
  }, [margenInferior, alturaMinima]);

  return [ref, altura];
}
