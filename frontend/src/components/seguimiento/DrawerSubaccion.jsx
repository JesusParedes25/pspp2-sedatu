/**
 * ARCHIVO: DrawerSubaccion.jsx
 * PROPÓSITO: Panel lateral (drawer) para ver y gestionar el detalle
 *            de una subacción: estado, archivos y discusión.
 *
 * MINI-CLASE: Drawer con React Portal
 * ─────────────────────────────────────────────────────────────────
 * Se renderiza fuera del árbol DOM normal usando createPortal para
 * evitar problemas de z-index y overflow. El drawer entra con una
 * animación slide-in desde la derecha (250ms ease-out). Se cierra
 * con click en overlay, botón ✕ o tecla Escape. Los cambios se
 * persisten al momento de la interacción, no al cerrar.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Upload, Download, Trash2, FileText, Paperclip } from 'lucide-react';
import SelectorEstado from '../common/SelectorEstado';
import * as evidenciasApi from '../../api/evidencias';
import CATEGORIAS_EVIDENCIA from './categoriasEvidencia';
import HiloComentarios from '../comentarios/HiloComentarios';
import PanelRiesgos from '../riesgos/PanelRiesgos';

export default function DrawerSubaccion({ sub, soloLectura, onCerrar, onCambio, onStatsChange }) {
  const [visible, setVisible] = useState(false);
  const [evidencias, setEvidencias] = useState([]);
  const [cargandoEv, setCargandoEv] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [categoriaEv, setCategoriaEv] = useState('Otro');
  const fileRef = useRef(null);
  const drawerRef = useRef(null);

  const completada = sub.estado === 'Completada';

  // Animación de entrada
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    cargarEvidencias();
  }, [sub.id]);

  // Cerrar con Escape
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') cerrar();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  function cerrar() {
    setVisible(false);
    setTimeout(() => onCerrar(), 200);
  }

  async function cargarEvidencias() {
    setCargandoEv(true);
    try {
      const res = await evidenciasApi.obtenerEvidenciasSubaccion(sub.id);
      setEvidencias(res.datos || []);
    } catch { /* silenciar */ }
    finally { setCargandoEv(false); }
  }

  async function subirArchivo(e) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setSubiendo(true);
    try {
      await evidenciasApi.subirEvidenciaSubaccion(sub.id, archivo, {
        categoria: categoriaEv,
      });
      await cargarEvidencias();
      onStatsChange && onStatsChange();
    } catch (err) {
      alert(err.response?.data?.mensaje || 'Error al subir evidencia');
    } finally {
      setSubiendo(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function eliminarEv(evId) {
    if (!confirm('¿Eliminar esta evidencia?')) return;
    try {
      await evidenciasApi.eliminarEvidencia(evId);
      await cargarEvidencias();
      onStatsChange && onStatsChange();
    } catch { /* silenciar */ }
  }

  const formatearFecha = (f) => {
    if (!f) return '';
    return new Date(f).toLocaleDateString('es-MX', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  };

  const contenido = (
    <>
      {/* Overlay */}
      <div
        onClick={cerrar}
        className={`fixed inset-0 z-[10000] bg-black/30 transition-opacity duration-200 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Drawer panel */}
      <div
        ref={drawerRef}
        className={`fixed top-0 right-0 z-[10001] h-full w-full sm:w-[600px] bg-white shadow-2xl flex flex-col transition-transform duration-250 ease-out ${
          visible ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* ── Header ── */}
        <div className="flex-shrink-0 border-b border-gray-100 px-5 py-4">
          <div className="flex items-start gap-3">
            {/* Selector de estado */}
            <div className="mt-0.5 flex-shrink-0">
              <SelectorEstado
                entidadTipo="Subaccion"
                entidadId={sub.id}
                estadoActual={sub.estado}
                onCambio={onCambio}
                soloLectura={soloLectura}
              />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <h2 className={`text-base font-semibold leading-snug transition-all duration-200 ${
                completada ? 'line-through text-gray-400' : 'text-gray-800'
              }`}>
                {sub.nombre}
              </h2>
              <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                {parseFloat(sub.peso_porcentaje) > 0 && (
                  <span className="tabular-nums">Peso: {parseFloat(sub.peso_porcentaje).toFixed(0)}%</span>
                )}
                {sub.fecha_inicio && (
                  <span>{formatearFecha(sub.fecha_inicio)} → {formatearFecha(sub.fecha_fin)}</span>
                )}
              </div>
            </div>

            {/* Cerrar */}
            <button onClick={cerrar}
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── Contenido scrollable ── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {/* Sección: Archivos */}
          <section>
            <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Archivos
            </h3>

            {cargandoEv ? (
              <p className="text-xs text-gray-400 animate-pulse py-2">Cargando…</p>
            ) : evidencias.length > 0 ? (
              <div className="space-y-1">
                {evidencias.map(ev => (
                  <div key={ev.id} className="group/file flex items-center gap-2.5 text-[13px] py-2 px-3 -mx-1 rounded-lg hover:bg-gray-50 transition-colors">
                    <FileText size={15} className="text-gray-300 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-700 truncate">{ev.nombre_original}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {ev.categoria}
                        {ev.created_at && ` · ${formatearFecha(ev.created_at)}`}
                      </p>
                    </div>
                    <a href={evidenciasApi.obtenerUrlDescarga(ev.id)} target="_blank" rel="noopener noreferrer"
                      className="text-guinda-400 hover:text-guinda-600 p-1 flex-shrink-0" title="Descargar">
                      <Download size={14} />
                    </a>
                    {!soloLectura && (
                      <button onClick={() => eliminarEv(ev.id)}
                        className="text-gray-300 hover:text-red-500 p-1 flex-shrink-0 opacity-0 group-hover/file:opacity-100 transition-opacity" title="Eliminar">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-300 py-2">Sin archivos adjuntos</p>
            )}

            {/* Subida de archivo */}
            {!soloLectura && (
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                <select value={categoriaEv} onChange={e => setCategoriaEv(e.target.value)}
                  className="text-xs h-8 pl-2 pr-6 rounded-lg border border-gray-200 bg-white text-gray-600 outline-none focus:border-guinda-400">
                  {CATEGORIAS_EVIDENCIA.map(c => (
                    <option key={c.valor} value={c.valor}>{c.etiqueta}</option>
                  ))}
                </select>
                <input type="file" ref={fileRef} onChange={subirArchivo} className="hidden" />
                <button type="button" disabled={subiendo}
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-1.5 h-8 px-4 text-xs bg-guinda-500 text-white hover:bg-guinda-600 rounded-lg font-medium transition-colors disabled:opacity-50">
                  <Upload size={13} />
                  {subiendo ? 'Subiendo…' : 'Subir archivo'}
                </button>
              </div>
            )}
          </section>

          {/* Sección: Riesgos */}
          <section>
            <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Riesgos
            </h3>
            <PanelRiesgos
              entidadTipo="Subaccion"
              entidadId={sub.id}
              soloLectura={soloLectura}
              compacto
              onStatsChange={onStatsChange}
            />
          </section>

          {/* Sección: Discusión */}
          <section>
            <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Discusión
            </h3>
            <HiloComentarios entidadTipo="Subaccion" entidadId={sub.id} compacto onStatsChange={onStatsChange} />
          </section>
        </div>
      </div>
    </>
  );

  return createPortal(contenido, document.body);
}
