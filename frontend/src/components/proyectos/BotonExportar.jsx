/**
 * ARCHIVO: BotonExportar.jsx
 * PROPÓSITO: Descargar la estructura completa del proyecto (Etapa →
 *            Acción → Subacción → Tarea) en Excel o CSV. Complemento
 *            natural del botón "Importar": donde uno mete datos al
 *            proyecto, este los saca.
 */
import { useState, useRef, useEffect } from 'react';
import { Download, Loader2, FileSpreadsheet, FileText } from 'lucide-react';
import { exportarProyecto } from '../../api/proyectos';
import { useUI } from '../../context/UIContext';

export default function BotonExportar({ proyectoId }) {
  const [abierto, setAbierto] = useState(false);
  const [exportando, setExportando] = useState(false);
  const refMenu = useRef(null);
  const { mostrarToast } = useUI();

  useEffect(() => {
    if (!abierto) return undefined;
    function cerrarSiFuera(e) {
      if (refMenu.current && !refMenu.current.contains(e.target)) setAbierto(false);
    }
    document.addEventListener('mousedown', cerrarSiFuera);
    return () => document.removeEventListener('mousedown', cerrarSiFuera);
  }, [abierto]);

  async function exportar(formato) {
    setAbierto(false);
    setExportando(true);
    try {
      await exportarProyecto(proyectoId, formato);
    } catch (err) {
      console.error('Error exportando proyecto:', err);
      mostrarToast('No se pudo generar el archivo de exportación', 'error');
    } finally {
      setExportando(false);
    }
  }

  return (
    <div className="relative" ref={refMenu}>
      <button
        onClick={() => setAbierto(a => !a)}
        disabled={exportando}
        className="btn-secondary text-sm flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
        title="Descargar la estructura del proyecto en Excel o CSV"
      >
        {exportando ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
        {exportando ? 'Generando…' : 'Exportar'}
      </button>

      {abierto && (
        <div className="absolute right-0 mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1">
          <button
            onClick={() => exportar('xlsx')}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left"
          >
            <FileSpreadsheet size={14} className="text-green-600" />
            Excel (.xlsx)
          </button>
          <button
            onClick={() => exportar('csv')}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left"
          >
            <FileText size={14} className="text-gray-500" />
            CSV
          </button>
        </div>
      )}
    </div>
  );
}
