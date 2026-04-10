/**
 * ARCHIVO: UIContext.jsx
 * PROPÓSITO: Contexto global de UI (toasts, sidebar, loading global).
 *
 * MINI-CLASE: Estado de UI compartido
 * ─────────────────────────────────────────────────────────────────
 * Algunos estados de UI necesitan ser globales: los toasts (mensajes
 * temporales de éxito/error), el estado del sidebar (abierto/cerrado
 * en mobile), y el loading global. UIContext centraliza estos estados
 * para que cualquier componente pueda mostrar un toast con
 * mostrarToast('Guardado exitoso', 'exito') sin importar dónde esté
 * en el árbol de componentes.
 * ─────────────────────────────────────────────────────────────────
 */
import { createContext, useContext, useState, useCallback } from 'react';

const UIContext = createContext(null);

export function UIProvider({ children }) {
  const [toast, setToast] = useState(null);
  const [sidebarAbierto, setSidebarAbierto] = useState(true);

  // Mostrar un toast temporal (desaparece después de 4 segundos)
  const mostrarToast = useCallback((mensaje, tipo = 'info') => {
    setToast({ mensaje, tipo });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarAbierto(prev => !prev);
  }, []);

  const valor = {
    toast,
    mostrarToast,
    sidebarAbierto,
    setSidebarAbierto,
    toggleSidebar
  };

  return (
    <UIContext.Provider value={valor}>
      {children}
    </UIContext.Provider>
  );
}

// Hook personalizado para acceder al contexto de UI
export function useUI() {
  const contexto = useContext(UIContext);
  if (!contexto) {
    throw new Error('useUI debe usarse dentro de un UIProvider');
  }
  return contexto;
}
