/**
 * ARCHIVO: MenuDesplegable.jsx
 * PROPÓSITO: Shell genérico de botón + panel flotante (clic fuera o Escape
 *            para cerrar) — reemplaza el patrón que antes se repetía suelto
 *            en BotonExportar/PanelLotesImportacion/etc. (cada uno con su
 *            propio useRef+useEffect de "clic fuera"). Quien lo usa decide
 *            el contenido del botón y del panel (render props) — este
 *            componente solo resuelve abrir/cerrar y el posicionamiento.
 */
import { useState, useRef, useEffect } from 'react';

export default function MenuDesplegable({ trigger, children, align = 'right', ancho = '', className = '' }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!abierto) return undefined;
    function alHacerClicFuera(e) {
      if (ref.current && !ref.current.contains(e.target)) setAbierto(false);
    }
    function alPresionarEscape(e) {
      if (e.key === 'Escape') setAbierto(false);
    }
    document.addEventListener('mousedown', alHacerClicFuera);
    document.addEventListener('keydown', alPresionarEscape);
    return () => {
      document.removeEventListener('mousedown', alHacerClicFuera);
      document.removeEventListener('keydown', alPresionarEscape);
    };
  }, [abierto]);

  const cerrar = () => setAbierto(false);
  const toggle = () => setAbierto(v => !v);

  return (
    <div className={`relative inline-block ${className}`} ref={ref}>
      {typeof trigger === 'function' ? trigger({ abierto, toggle, cerrar }) : trigger}
      {abierto && (
        <div
          role="menu"
          className={`absolute z-30 top-full mt-1 ${align === 'right' ? 'right-0' : 'left-0'} bg-white border border-gray-200 rounded-lg shadow-lg ${ancho}`}
        >
          {typeof children === 'function' ? children({ cerrar }) : children}
        </div>
      )}
    </div>
  );
}
