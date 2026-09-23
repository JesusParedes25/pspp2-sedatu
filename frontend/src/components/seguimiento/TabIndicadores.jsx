/**
 * TabIndicadores.jsx
 * Pestaña "Indicadores" del panel central de detalle de nodo.
 *
 * Rediseñada — antes mostraba TODOS los indicadores del proyecto como
 * tarjetas completas (realizado/meta/barra/unidad) estén o no vinculados
 * a este nodo, con el aviso de "no aporta" hasta el final de la tarjeta;
 * mezclaba "qué indicadores tiene el proyecto" con "a cuáles aporta este
 * nodo" en una sola pantalla. Ahora solo muestra a qué aporta ESTE nodo
 * — chips compactos, uno por indicador — con un botón para vincular más
 * (abre el wizard del módulo de Indicadores, con este nodo ya elegido) y
 * edición del modo/valor de cada aportación ya existente, con la
 * explicación de qué hace cada modo (antes ausente).
 */
import { useState, useEffect, useCallback } from 'react';
import { Link2, Loader2 } from 'lucide-react';
import * as indicadoresApi from '../../api/indicadores';
import { useUI } from '../../context/UIContext';
import ModalVincularIndicador from '../indicadores/ModalVincularIndicador';
import ChipAportacion from '../indicadores/ChipAportacion';

export default function TabIndicadores({ tipo, nodoId, nodoNombre, proyectoId, soloLectura }) {
  const { mostrarToast } = useUI();
  const [aportaciones, setAportaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarWizard, setMostrarWizard] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await indicadoresApi.obtenerAportacionesNodo(tipo, nodoId);
      setAportaciones(res?.datos || []);
    } catch (e) {
      console.error('Error cargando aportaciones:', e);
    } finally {
      setCargando(false);
    }
  }, [tipo, nodoId]);

  useEffect(() => { cargar(); }, [cargar]);

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-10 gap-2 text-gray-400">
        <Loader2 size={18} className="animate-spin" />
        <span className="text-sm">Cargando…</span>
      </div>
    );
  }

  return (
    <div className="p-5 space-y-2">
      {aportaciones.length === 0 ? (
        <div className="flex items-center justify-between gap-2 text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
          <span>Este nodo no aporta a ningún indicador.</span>
          {!soloLectura && (
            <button onClick={() => setMostrarWizard(true)} className="text-xs font-medium text-guinda-700 hover:underline flex-shrink-0">
              Vincular
            </button>
          )}
        </div>
      ) : (
        <>
          {aportaciones.map(ap => (
            <ChipAportacion
              key={ap.id}
              ap={ap}
              etiquetaPrincipal={ap.indicador_nombre}
              soloLectura={soloLectura}
              onActualizado={cargar}
              mostrarToast={mostrarToast}
              categorias={ap.composicion === 'Categorias' ? ap.categorias : undefined}
            />
          ))}
          {!soloLectura && (
            <button
              onClick={() => setMostrarWizard(true)}
              className="w-full flex items-center justify-center gap-1.5 py-2 border border-dashed border-gray-200 rounded-lg text-xs font-medium text-gray-500 hover:text-guinda-700 hover:border-guinda-200 transition-colors"
            >
              <Link2 size={12} /> Vincular a otro indicador
            </button>
          )}
        </>
      )}

      {mostrarWizard && (
        <ModalVincularIndicador
          proyectoPreseleccionado={{ id: proyectoId }}
          nodoPreseleccionado={{ tipo, id: nodoId, nombre: nodoNombre }}
          onCerrar={() => setMostrarWizard(false)}
          onVinculado={() => { setMostrarWizard(false); cargar(); }}
        />
      )}
    </div>
  );
}
