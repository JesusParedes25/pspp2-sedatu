/**
 * ARCHIVO: ResizeHandle.jsx
 * PROPÓSITO: Barra delgada arrastrable entre dos paneles — mueve el mouse,
 *            entrega el delta en píxeles a `onResize`. `lado` indica de
 *            qué borde del panel que se agranda/achica vive este handle:
 *            'derecho' (el panel crece arrastrando hacia la derecha, p.ej.
 *            el árbol izquierdo) o 'izquierdo' (el panel crece arrastrando
 *            hacia la izquierda, p.ej. el rail/drawer de propiedades,
 *            anclado al borde derecho de la pantalla).
 */
import { useRef, useCallback } from 'react';

export default function ResizeHandle({ onResize, lado = 'derecho', label = 'Redimensionar panel' }) {
  const dragRef = useRef(null);

  const iniciarArrastre = useCallback((clientX) => {
    dragRef.current = { x: clientX };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    function mover(x) {
      if (!dragRef.current) return;
      const delta = x - dragRef.current.x;
      onResize(lado === 'derecho' ? delta : -delta);
      dragRef.current.x = x;
    }
    function detener() {
      dragRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', detener);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', detener);
    }
    function onMouseMove(e) { mover(e.clientX); }
    function onTouchMove(e) { if (e.touches[0]) mover(e.touches[0].clientX); }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', detener);
    window.addEventListener('touchmove', onTouchMove);
    window.addEventListener('touchend', detener);
  }, [onResize, lado]);

  function onKeyDown(e) {
    const paso = 16;
    if (e.key === 'ArrowLeft') { e.preventDefault(); onResize(lado === 'derecho' ? -paso : paso); }
    if (e.key === 'ArrowRight') { e.preventDefault(); onResize(lado === 'derecho' ? paso : -paso); }
  }

  return (
    <div
      onMouseDown={e => { e.preventDefault(); iniciarArrastre(e.clientX); }}
      onTouchStart={e => { if (e.touches[0]) iniciarArrastre(e.touches[0].clientX); }}
      onKeyDown={onKeyDown}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      tabIndex={0}
      className="hidden lg:flex w-2.5 flex-shrink-0 cursor-col-resize items-center justify-center group outline-none focus-visible:bg-guinda-100"
    >
      <div className="w-px h-full bg-gray-200 group-hover:bg-guinda-300 group-active:bg-guinda-400 transition-colors" />
    </div>
  );
}
