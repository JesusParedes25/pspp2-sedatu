/**
 * ARCHIVO: ModalEditarFicha.jsx
 * PROPÓSITO: "Editar ficha" del panel derecho de Detalle (Fase 2) — un
 *            modal que envuelve PropiedadesElemento.jsx, el MISMO
 *            formulario compartido que ya existía (semáforo con override,
 *            fechas, prioridad, instrumento, escala, instancia/enlace
 *            responsable, observaciones). No se duplica el formulario ni
 *            su validación — solo se cambia el cascarón: antes vivía como
 *            un reveal inline dentro de FichaNodo.jsx, aquí es un modal
 *            propio de Detalle, consistente con el resto de "Más
 *            acciones" (todo lo que captura abre un modal, nada queda a
 *            medias en un panel que también hay que scrollear).
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import PropiedadesElemento from '../PropiedadesElemento';
import { useCierreConDatosSinGuardar } from '../../../hooks/useCierreConDatosSinGuardar';

export default function ModalEditarFicha({ nodo, permisos, onActualizado, mostrarToast, onCerrar }) {
  const [sucio, setSucio] = useState(false);
  const { cerrarPorFondo, cerrarConConfirmacion } = useCierreConDatosSinGuardar(sucio, onCerrar);

  return createPortal((
    <div className="fixed inset-0 bg-black/40 z-[9999] flex items-center justify-center p-4" onClick={cerrarPorFondo}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <h3 className="text-base font-semibold text-gray-900">Editar ficha</h3>
          <button onClick={cerrarConConfirmacion} className="p-1 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto">
          <PropiedadesElemento
            nodo={nodo}
            permisos={permisos}
            onActualizado={onActualizado}
            mostrarToast={mostrarToast}
            onDirtyChange={setSucio}
            onGuardado={onCerrar}
            onCancelar={onCerrar}
          />
        </div>
      </div>
    </div>
  ), document.body);
}
