/**
 * ARCHIVO: FilePreviewModal.jsx
 * PROPÓSITO: Vista previa de una evidencia (PDF, imagen, audio, texto, o
 *            capas geográficas KML/KMZ/Shapefile con Leaflet). Compartido
 *            entre el tab "Archivos" de cada nodo y el módulo global de
 *            Evidencias — una sola implementación para ambos.
 */
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FileText, X, Upload, Loader2, AlertTriangle, Link2 } from 'lucide-react';
import * as archivosApi from '../../api/archivos';
import { useDescargaArchivo } from '../../hooks/useDescargaArchivo';

// Vista previa de texto: solo el principio del archivo, pedido con Range
// (el backend responde 206), para no bajar un CSV de cientos de MB entero.
const LIMITE_TEXTO_BYTES = 2 * 1024 * 1024;

// fuente: { tipo: 'evidencia' | 'actividad', id } (ver api/archivos.js).
// Por omisión es la evidencia de la tabla `evidencias` con evidencia.id;
// los adjuntos de tarea (stream `actividad`) pasan la suya.
//
// El contenido se pide con la cabecera de sesión y se entrega al visor
// como URL blob: local. Ninguna URL con credenciales llega al <iframe>,
// <img> o <audio>, y nada caduca mientras el visor de PDF termina de cargar
// (ver la nota de api/archivos.js). "Descargar" pide un boleto efímero al
// hacer clic.
export default function FilePreviewModal({ evidencia, onClose, fuente: fuenteProp }) {
  const [geoData, setGeoData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progreso, setProgreso] = useState(null);
  const [urlLocal, setUrlLocal] = useState(null);
  const [texto, setTexto] = useState(null);
  const { descargar, descargando } = useDescargaArchivo();

  // Una liga externa no vive en nuestro almacén: su .url ES el archivo,
  // siempre, sin importar de qué tabla venga, así que no hay fuente.
  const esLink = evidencia.tipo_medio === 'link' && !!evidencia.url;
  const nombre = evidencia.titulo || evidencia.nombre_original || evidencia.nombre_archivo || (esLink ? evidencia.url : '');
  const ext = esLink ? '' : nombre.split('.').pop().toLowerCase();
  const fuente = esLink ? null : (fuenteProp || archivosApi.fuenteEvidencia(evidencia.id));

  const esPdf = !esLink && ext === 'pdf';
  const esImagen = !esLink && ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext);
  const esAudio = !esLink && ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(ext);
  const esTexto = !esLink && ['txt', 'md', 'csv', 'json', 'xml', 'log'].includes(ext);
  const esKml = !esLink && ['kml', 'kmz'].includes(ext);
  const esShp = !esLink && ext === 'zip' && (evidencia.categoria || '').toLowerCase().includes('capa');
  const esGeo = esKml || esShp;
  const conVistaPrevia = esPdf || esImagen || esAudio || esTexto || esGeo;

  useEffect(() => {
    if (!fuente || !conVistaPrevia) return undefined;
    const ctrl = new AbortController();
    let vigente = true;
    let urlCreada = null;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const blob = await archivosApi.obtenerContenido(fuente, {
          signal: ctrl.signal,
          rango: esTexto ? [0, LIMITE_TEXTO_BYTES - 1] : undefined,
          onProgreso: (p) => { if (vigente) setProgreso(p); },
        });
        if (!vigente) return;

        if (esKml) {
          let kml;
          if (ext === 'kmz') {
            const JSZip = (await import('jszip')).default;
            const zip = await JSZip.loadAsync(await blob.arrayBuffer());
            const kmlFile = Object.keys(zip.files).find(f => f.endsWith('.kml'));
            kml = await zip.files[kmlFile].async('string');
          } else {
            kml = await blob.text();
          }
          const doc = new DOMParser().parseFromString(kml, 'text/xml');
          const features = [];
          doc.querySelectorAll('Placemark').forEach(pm => {
            const coords = pm.querySelector('coordinates');
            if (!coords) return;
            const parts = coords.textContent.trim().split(/\s+/).map(c => {
              const [lng, lat] = c.split(',').map(Number);
              return [lat, lng];
            });
            features.push({ name: pm.querySelector('name')?.textContent || '', coords: parts });
          });
          if (vigente) setGeoData(features);
        } else if (esShp) {
          const shp = await import('shpjs');
          const geojson = await shp.default(await blob.arrayBuffer());
          if (vigente) setGeoData(geojson);
        } else if (esTexto) {
          // Se muestra como texto plano en un <pre>, nunca se interpreta:
          // un .xml o .md subido no puede ejecutar nada aquí.
          const contenido = await blob.text();
          if (vigente) setTexto({ contenido, truncado: blob.size >= LIMITE_TEXTO_BYTES });
        } else {
          // PDF con su tipo forzado: el blob se sirve desde el origen de la
          // app, y así nunca se interpreta como HTML aunque el archivo
          // subido mintiera sobre su tipo. Imágenes y audio van a <img> y
          // <audio>, que no ejecutan código.
          const contenido = esPdf ? new Blob([blob], { type: 'application/pdf' }) : blob;
          urlCreada = URL.createObjectURL(contenido);
          setUrlLocal(urlCreada);
        }
      } catch (err) {
        if (!vigente || err?.name === 'CanceledError' || err?.name === 'AbortError') return;
        const estado = err?.response?.status;
        // Texto vacío: cualquier rango sobre 0 bytes es 416 por RFC.
        if (esTexto && estado === 416) {
          setTexto({ contenido: '', truncado: false });
          return;
        }
        console.error('Error cargando vista previa:', err);
        setError(
          estado === 404 ? 'El archivo ya no está disponible en el almacenamiento.'
            : estado === 403 ? 'No tienes acceso a este archivo.'
              : esGeo ? 'No se pudo cargar la vista previa geográfica.'
                : 'No se pudo cargar la vista previa.'
        );
      } finally {
        if (vigente) setLoading(false);
      }
    })();
    return () => {
      vigente = false;
      ctrl.abort();
      if (urlCreada) URL.revokeObjectURL(urlCreada);
    };
    // La fuente (tipo + id) es lo único que decide qué se carga.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fuente?.tipo, fuente?.id]);

  const botonDescargar = (clases, contenido) => (
    <button type="button" onClick={() => descargar(fuente)} disabled={descargando} className={clases}>
      {contenido}
    </button>
  );

  // createPortal a document.body: este modal se abre tanto desde el rail
  // de Detalle/drawer de Diagrama como desde el feed de Actividad, ambos
  // paneles posicionados con translate-x — eso los vuelve el "containing
  // block" de cualquier hijo con position:fixed, y sin portal el modal
  // quedaba encajonado dentro de ese panel angosto en vez de cubrir toda
  // la pantalla (mismo problema ya resuelto así en ModalRegistrarAvance).
  return createPortal((
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[90vw] max-w-4xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Title bar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 bg-gray-50 rounded-t-xl">
          <div className="flex items-center gap-2 min-w-0">
            <FileText size={14} className="text-[#7B1C3E] flex-shrink-0" />
            <span className="text-sm font-semibold text-gray-800 truncate">{nombre}</span>
          </div>
          <div className="flex items-center gap-2">
            {esLink ? (
              <a href={evidencia.url} target="_blank" rel="noreferrer"
                className="flex items-center gap-1 px-2.5 py-1 text-[10px] bg-[#7B1C3E] text-white rounded hover:bg-[#5a1430]">
                <Link2 size={10} /> Abrir enlace
              </a>
            ) : botonDescargar(
              'flex items-center gap-1 px-2.5 py-1 text-[10px] bg-[#7B1C3E] text-white rounded hover:bg-[#5a1430] disabled:opacity-60',
              <>{descargando ? <Loader2 size={10} className="animate-spin" /> : <Upload size={10} className="rotate-180" />} Descargar</>
            )}
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-200">
              <X size={16} />
            </button>
          </div>
        </div>
        {/* Content */}
        <div className="flex-1 overflow-auto p-1 min-h-0">
          {esLink && (
            <div className="flex flex-col h-full min-h-[60vh]">
              <p className="text-[11px] text-gray-400 px-2 pb-1.5">
                Vista previa incrustada del sitio de origen: algunos sitios (por ejemplo, Google Drive sin permisos públicos) no permiten mostrarse aquí. Si se ve en blanco, usa &quot;Abrir enlace&quot;.
              </p>
              <iframe src={evidencia.url} className="w-full flex-1 rounded border border-gray-100" title={nombre} />
            </div>
          )}
          {conVistaPrevia && loading && (
            <div className="flex items-center justify-center h-64">
              <Loader2 size={24} className="animate-spin text-[#7B1C3E]" />
              <span className="ml-2 text-sm text-gray-500">
                {esGeo ? 'Cargando vista previa geográfica…' : 'Cargando vista previa…'}
                {progreso != null && progreso < 1 ? ` ${Math.round(progreso * 100)} %` : ''}
              </span>
            </div>
          )}
          {conVistaPrevia && error && !loading && (
            <div className="flex flex-col items-center justify-center h-64 gap-2">
              <AlertTriangle size={20} className="text-amber-500" />
              <p className="text-sm text-gray-500">{error}</p>
              {botonDescargar('text-xs text-[#7B1C3E] underline', 'Descargar archivo')}
            </div>
          )}
          {!loading && !error && esPdf && urlLocal && (
            <iframe src={urlLocal} className="w-full h-full min-h-[60vh] rounded" title={nombre} />
          )}
          {!loading && !error && esImagen && urlLocal && (
            <div className="flex items-center justify-center h-full p-4">
              <img src={urlLocal} alt={nombre} className="max-w-full max-h-[70vh] object-contain rounded" />
            </div>
          )}
          {!loading && !error && esAudio && urlLocal && (
            <div className="flex items-center justify-center h-64 p-4">
              <audio controls src={urlLocal} className="w-full max-w-md" />
            </div>
          )}
          {!loading && !error && esTexto && texto && (
            <div className="min-h-[60vh]">
              {texto.truncado && (
                <p className="text-[11px] text-gray-400 px-2 pb-1.5">
                  Se muestran solo los primeros 2 MB. Descarga el archivo para verlo completo.
                </p>
              )}
              <pre className="w-full whitespace-pre-wrap break-words rounded bg-gray-50 p-3 font-mono text-xs text-gray-800">{texto.contenido}</pre>
            </div>
          )}
          {!loading && !error && esGeo && geoData && (
            <GeoPreviewMap data={geoData} isGeoJSON={esShp} />
          )}
          {!esLink && !conVistaPrevia && (
            <div className="flex flex-col items-center justify-center h-64 gap-3">
              <FileText size={40} className="text-gray-300" />
              <p className="text-sm text-gray-500">Vista previa no disponible para este tipo de archivo.</p>
              {botonDescargar(
                'flex items-center gap-1 px-4 py-2 bg-[#7B1C3E] text-white text-sm rounded-lg hover:bg-[#5a1430] disabled:opacity-60',
                <><Upload size={14} className="rotate-180" /> Descargar archivo</>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  ), document.body);
}

function GeoPreviewMap({ data, isGeoJSON }) {
  const mapRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    let cancelled = false;

    (async () => {
      const L = (await import('leaflet')).default;
      await import('leaflet/dist/leaflet.css');
      if (cancelled || mapRef.current) return;

      const map = L.map(containerRef.current).setView([23.6345, -102.5528], 5);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
      }).addTo(map);

      let layer;
      if (isGeoJSON) {
        layer = L.geoJSON(data, {
          style: { color: '#7B1C3E', weight: 2, fillOpacity: 0.15 },
          onEachFeature: (feature, lyr) => {
            if (feature.properties) {
              const props = Object.entries(feature.properties)
                .filter(([, v]) => v != null && v !== '')
                .map(([k, v]) => `<b>${k}:</b> ${v}`).join('<br/>');
              if (props) lyr.bindPopup(`<div style="font-size:11px;max-height:200px;overflow:auto">${props}</div>`);
            }
          }
        }).addTo(map);
      } else {
        layer = L.featureGroup();
        (data || []).forEach(f => {
          if (f.coords.length === 1) {
            L.circleMarker(f.coords[0], { radius: 5, color: '#7B1C3E' }).bindPopup(f.name || '').addTo(layer);
          } else {
            L.polyline(f.coords, { color: '#7B1C3E', weight: 2 }).bindPopup(f.name || '').addTo(layer);
          }
        });
        layer.addTo(map);
      }

      if (layer && layer.getBounds && layer.getLayers && layer.getLayers().length > 0) {
        try { map.fitBounds(layer.getBounds(), { padding: [30, 30] }); } catch {}
      }

      mapRef.current = map;
    })();

    return () => { cancelled = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, [data, isGeoJSON]);

  return <div ref={containerRef} style={{ width: '100%', height: '60vh' }} />;
}
