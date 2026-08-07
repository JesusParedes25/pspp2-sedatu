/**
 * ARCHIVO: usePanelWidth.js
 * PROPÓSITO: Ancho de un panel redimensionable por el usuario (arrastrando
 *            un ResizeHandle), acotado a [min, max] y recordado en
 *            localStorage bajo la key que pase el caller — así, si dos
 *            paneles distintos (el rail de Detalle y el drawer de
 *            Diagrama) usan la MISMA key, quedan homologados: ajustar el
 *            ancho en uno se recuerda también para el otro.
 */
import { useState, useEffect, useCallback } from 'react';

// Misma key para el rail de "Detalle" y el drawer de "Diagrama" — así
// quedan homologados: ajustar el ancho en cualquiera de los dos se
// recuerda igual en el otro, en vez de ser dos preferencias sueltas.
export function keyAnchoPanelPropiedades(usuario) {
  return `pspp_ancho_panel_propiedades_${usuario?.id || 'anon'}`;
}

export function usePanelWidth(storageKey, { default: defaultWidth, min, max }) {
  const [width, setWidth] = useState(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      const n = raw ? parseInt(raw, 10) : NaN;
      return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : defaultWidth;
    } catch { return defaultWidth; }
  });

  useEffect(() => {
    try { localStorage.setItem(storageKey, String(width)); } catch {}
  }, [width, storageKey]);

  // delta en píxeles de mouse — quien llama ya decide el signo según de qué
  // lado del panel vive el handle (ver ResizeHandle `lado`).
  const ajustar = useCallback((delta) => {
    setWidth(w => Math.min(max, Math.max(min, w + delta)));
  }, [min, max]);

  return [width, ajustar];
}
