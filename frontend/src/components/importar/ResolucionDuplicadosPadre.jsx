/**
 * ARCHIVO: ResolucionDuplicadosPadre.jsx
 * PROPÓSITO: Resolver, antes de crear nada, variantes de nombre de un
 *            mismo Componente/Acción padre detectadas dentro del propio
 *            archivo (ej. "Regularización de predios" vs "Regularizacion
 *            de Predios "). Sin esto, el importador creaba un padre
 *            nuevo por cada variante en silencio, duplicando la
 *            estructura — reportado por usuarios reales en junta.
 *
 * Compartido entre PasoRelacion.jsx (primera detección, al elegir la
 * columna padre) y PasoPreview.jsx (confirmación final) — misma
 * detección del backend en ambos casos (importar.service.js::
 * detectarPosiblesDuplicadosPadre), así que nunca pueden divergir.
 */
import { AlertTriangle } from 'lucide-react';

// Misma normalización que importar.service.js::normalizarTexto — para
// que las claves de `resoluciones` calcen con las que arma el backend.
function normalizarTexto(t) {
  return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

const ETIQUETA_NIVEL = { etapa: 'Componente', accion: 'Acción' };

export default function ResolucionDuplicadosPadre({ grupos, resoluciones, onCambiar }) {
  if (!grupos || grupos.length === 0) return null;

  function elegirCanonico(grupo, canonico) {
    const nuevo = { ...resoluciones };
    for (const variante of grupo.variantes) {
      nuevo[normalizarTexto(variante)] = canonico;
    }
    onCambiar(nuevo);
  }

  function marcarComoDistintos(grupo) {
    const nuevo = { ...resoluciones };
    for (const variante of grupo.variantes) {
      nuevo[normalizarTexto(variante)] = '__nuevo__';
    }
    onCambiar(nuevo);
  }

  return (
    <div className="space-y-3">
      {grupos.map((grupo, gi) => {
        const etiqueta = ETIQUETA_NIVEL[grupo.nivel] || 'Componente';
        const valorActual = resoluciones?.[normalizarTexto(grupo.variantes[0])];
        const marcadoDistintos = grupo.variantes.every(v => resoluciones?.[normalizarTexto(v)] === '__nuevo__');

        return (
          <div key={gi} className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5 mb-1.5">
              <AlertTriangle size={13} />
              {grupo.variantes.length} posibles variantes del mismo {etiqueta}
            </p>
            <p className="text-xs text-amber-700 mb-2">
              Estos nombres aparecen en tu archivo y no calzan con ningún {etiqueta.toLowerCase()} ya
              existente en el proyecto. Se parecen entre sí — ¿son el mismo escrito distinto, o son
              dos {etiqueta.toLowerCase()}s diferentes?
            </p>

            <div className="space-y-1 mb-2">
              {grupo.variantes.map((v, vi) => (
                <label key={vi} className="flex items-center gap-2 text-xs bg-white rounded px-2 py-1.5 border border-amber-100 cursor-pointer">
                  <input
                    type="radio"
                    name={`grupo-padre-${gi}`}
                    checked={!marcadoDistintos && valorActual === v}
                    onChange={() => elegirCanonico(grupo, v)}
                  />
                  <span className="flex-1 font-medium text-gray-700">{v}</span>
                </label>
              ))}
              <label className="flex items-center gap-2 text-xs bg-white rounded px-2 py-1.5 border border-amber-100 cursor-pointer">
                <input
                  type="radio"
                  name={`grupo-padre-${gi}`}
                  checked={marcadoDistintos}
                  onChange={() => marcarComoDistintos(grupo)}
                />
                <span className="flex-1 text-gray-600">Son {etiqueta.toLowerCase()}s distintos — crear ambos</span>
              </label>
            </div>

            {!marcadoDistintos && !valorActual && (
              <p className="text-[11px] text-amber-600">Elige una opción para poder continuar.</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
