/**
 * ARCHIVO: usePsedatuTitulos.js
 * PROPÓSITO: Carga los títulos oficiales de objetivos/estrategias del
 *            PSEDATU 2025-2030 (si ya se cargaron) para la migaja de pan
 *            de cada tarjeta del catálogo. Las tablas nuevas
 *            (psedatu_objetivos/psedatu_estrategias, migración 076)
 *            quedan vacías a propósito hasta que alguien cargue los
 *            títulos reales desde el documento oficial — este hook
 *            siempre devuelve mapas usables (vacíos si no hay nada
 *            cargado todavía), así que un componente que lo usa nunca
 *            necesita distinguir "cargando" de "sin títulos".
 */
import { useState, useEffect } from 'react';
import { obtenerTitulosPsedatu } from '../api/catalogo-indicadores';

export function usePsedatuTitulos() {
  const [titulos, setTitulos] = useState({ objetivos: {}, estrategias: {} });

  useEffect(() => {
    let vivo = true;
    obtenerTitulosPsedatu()
      .then(t => { if (vivo) setTitulos(t); })
      .catch(() => {});
    return () => { vivo = false; };
  }, []);

  return titulos;
}
