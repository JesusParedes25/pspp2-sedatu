/**
 * ARCHIVO: GenerarReporteBtn.jsx
 * PROPÓSITO: Botón que genera y descarga el reporte PDF institucional del proyecto.
 *            Muestra estado de carga y errores. Llama a generarReportePDF().
 */
import { useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { generarReportePDF } from '../../utils/generarReportePDF';
import { useUI } from '../../context/UIContext';

export default function GenerarReporteBtn({ proyectoId, proyecto }) {
  const [generando, setGenerando] = useState(false);
  const { mostrarToast } = useUI();

  async function handleGenerar() {
    if (generando || !proyecto) return;
    setGenerando(true);
    try {
      await generarReportePDF(proyectoId, proyecto);
      mostrarToast('Reporte generado y descargado', 'exito');
    } catch (err) {
      console.error('Error generando reporte PDF:', err);
      mostrarToast('Error al generar el reporte PDF', 'error');
    } finally {
      setGenerando(false);
    }
  }

  return (
    <button
      onClick={handleGenerar}
      disabled={generando}
      className="btn-secondary text-sm flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
      title="Generar reporte PDF completo del proyecto"
    >
      {generando
        ? <Loader2 size={14} className="animate-spin" />
        : <FileText size={14} />
      }
      {generando ? 'Generando…' : 'Reporte PDF'}
    </button>
  );
}
