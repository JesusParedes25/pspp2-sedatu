/**
 * ARCHIVO: MenuDesplegable.jsx
 * PROPÓSITO: Shell genérico de botón + panel flotante (clic fuera o Escape
 *            para cerrar) — reemplaza el patrón que antes se repetía suelto
 *            en BotonExportar/PanelLotesImportacion/etc. (cada uno con su
 *            propio useRef+useEffect de "clic fuera"). Quien lo usa decide
 *            el contenido del botón y del panel (render props) — este
 *            componente solo resuelve abrir/cerrar y el posicionamiento.
 *
 * El panel se renderiza con createPortal a document.body, posicionado con
 * `position: fixed` contra el rect real del botón disparador — no como
 * hijo `position: absolute` dentro del propio contenedor. Un dropdown
 * `absolute` normal se recorta en cualquier ancestro con overflow
 * acotado (p. ej. el panel con scroll propio de Seguimiento > Detalle);
 * ahí, items al final de un menú largo (Duplicar/Eliminar) quedaban
 * inalcanzables sin una forma de hacerlos visibles con scroll. El portal
 * evita ese recorte sin importar en qué contenedor viva el botón.
 */
import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

export default function MenuDesplegable({ trigger, children, align = 'right', ancho = '', className = '' }) {
  const [abierto, setAbierto] = useState(false);
  const [pos, setPos] = useState(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);

  // Posición calculada contra el botón real, justo antes de pintar, para
  // que el panel no "salte" de lugar en el primer frame visible. Primera
  // pasada: se ancla debajo del botón (el caso normal). Segunda pasada
  // (después de medir el panel ya renderizado): si no cabe hacia abajo
  // en el viewport, se voltea hacia arriba — sin esto, un menú largo
  // (8 items) abierto cerca del borde inferior de una ventana corta
  // quedaba con sus últimos items fuera de la pantalla, inalcanzables
  // (position:fixed no se mueve con el scroll de la página).
  useLayoutEffect(() => {
    if (!abierto || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPos({
      top: rect.bottom + 4,
      left: align === 'right' ? undefined : rect.left,
      right: align === 'right' ? window.innerWidth - rect.right : undefined,
    });
  }, [abierto, align]);

  useLayoutEffect(() => {
    if (!abierto || !pos || !panelRef.current || !triggerRef.current) return;
    const panelRect = panelRef.current.getBoundingClientRect();
    if (panelRect.bottom <= window.innerHeight) return; // cabe, no hace falta voltear
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const espacioArriba = triggerRect.top;
    if (espacioArriba < panelRect.height) return; // tampoco cabría arriba — se deja como está
    setPos(p => (p.bottom != null ? p : {
      ...p,
      top: undefined,
      bottom: window.innerHeight - triggerRect.top + 4,
    }));
    // Solo depende de `abierto`: una vez volteado no debe volver a
    // recalcularse en cada render (pos ya cambia de forma).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, pos?.top]);

  useEffect(() => {
    if (!abierto) return undefined;
    function alHacerClicFuera(e) {
      if (triggerRef.current?.contains(e.target)) return;
      if (panelRef.current?.contains(e.target)) return;
      setAbierto(false);
    }
    function alPresionarEscape(e) {
      if (e.key === 'Escape') setAbierto(false);
    }
    // Un scroll o resize mientras el menú está abierto invalida la
    // posición calculada (fixed, contra coordenadas de pantalla) — se
    // cierra en vez de recalcular en cada evento, mismo criterio simple
    // que ya usa el resto de la app para popovers cortos.
    function alMoverViewport() { setAbierto(false); }
    document.addEventListener('mousedown', alHacerClicFuera);
    document.addEventListener('keydown', alPresionarEscape);
    window.addEventListener('scroll', alMoverViewport, true);
    window.addEventListener('resize', alMoverViewport);
    return () => {
      document.removeEventListener('mousedown', alHacerClicFuera);
      document.removeEventListener('keydown', alPresionarEscape);
      window.removeEventListener('scroll', alMoverViewport, true);
      window.removeEventListener('resize', alMoverViewport);
    };
  }, [abierto]);

  const cerrar = () => setAbierto(false);
  const toggle = () => setAbierto(v => !v);

  return (
    <div className={`inline-block ${className}`} ref={triggerRef}>
      {typeof trigger === 'function' ? trigger({ abierto, toggle, cerrar }) : trigger}
      {abierto && pos && createPortal((
        <div
          ref={panelRef}
          role="menu"
          style={{ position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left, right: pos.right, maxHeight: '80vh', overflowY: 'auto' }}
          className={`z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg ${ancho}`}
        >
          {typeof children === 'function' ? children({ cerrar }) : children}
        </div>
      ), document.body)}
    </div>
  );
}
