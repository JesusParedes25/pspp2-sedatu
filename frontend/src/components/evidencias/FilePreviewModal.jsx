/**
 * ARCHIVO: FilePreviewModal.jsx
 * PROPÓSITO: Vista previa de una evidencia (PDF, imagen, audio, texto, o
 *            capas geográficas KML/KMZ/Shapefile con Leaflet). Compartido
 *            entre el tab "Archivos" de cada nodo y el módulo global de
 *            Evidencias — una sola implementación para ambos.
 */
import { useState, useEffect, useRef } from 'react';
import { FileText, X, Upload, Loader2, AlertTriangle } from 'lucide-react';
import * as evidenciasApi from '../../api/evidencias';

export default function FilePreviewModal({ evidencia, onClose }) {
  const [geoData, setGeoData] = useState(null);
  const [geoError, setGeoError] = useState(null);
  const [loading, setLoading] = useState(false);

  const nombre = evidencia.nombre_original || evidencia.nombre_archivo || '';
  const ext = nombre.split('.').pop().toLowerCase();
  const url = evidenciasApi.obtenerUrlDescarga(evidencia.id);

  const esPdf = ext === 'pdf';
  const esImagen = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext);
  const esAudio = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(ext);
  const esTexto = ['txt', 'md', 'csv', 'json', 'xml', 'log'].includes(ext);
  const esKml = ['kml', 'kmz'].includes(ext);
  const esShp = ext === 'zip' && (evidencia.categoria || '').toLowerCase().includes('capa');

  useEffect(() => {
    if (!esKml && !esShp) return;
    setLoading(true);
    (async () => {
      try {
        if (esKml) {
          const resp = await fetch(url);
          let text;
          if (ext === 'kmz') {
            const JSZip = (await import('jszip')).default;
            const zip = await JSZip.loadAsync(await resp.arrayBuffer());
            const kmlFile = Object.keys(zip.files).find(f => f.endsWith('.kml'));
            text = await zip.files[kmlFile].async('string');
          } else {
            text = await resp.text();
          }
          const parser = new DOMParser();
          const doc = parser.parseFromString(text, 'text/xml');
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
          setGeoData(features);
        } else {
          const shp = await import('shpjs');
          const resp = await fetch(url);
          const buf = await resp.arrayBuffer();
          const geojson = await shp.default(buf);
          setGeoData(geojson);
        }
      } catch (err) {
        console.error('Error cargando geodatos:', err);
        setGeoError('No se pudo cargar la vista previa geográfica.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[90vw] max-w-4xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Title bar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 bg-gray-50 rounded-t-xl">
          <div className="flex items-center gap-2 min-w-0">
            <FileText size={14} className="text-[#7B1C3E] flex-shrink-0" />
            <span className="text-sm font-semibold text-gray-800 truncate">{nombre}</span>
          </div>
          <div className="flex items-center gap-2">
            <a href={url} target="_blank" rel="noreferrer"
              className="flex items-center gap-1 px-2.5 py-1 text-[10px] bg-[#7B1C3E] text-white rounded hover:bg-[#5a1430]">
              <Upload size={10} className="rotate-180" /> Descargar
            </a>
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-200">
              <X size={16} />
            </button>
          </div>
        </div>
        {/* Content */}
        <div className="flex-1 overflow-auto p-1 min-h-0">
          {esPdf && (
            <iframe src={url} className="w-full h-full min-h-[60vh] rounded" title={nombre} />
          )}
          {esImagen && (
            <div className="flex items-center justify-center h-full p-4">
              <img src={url} alt={nombre} className="max-w-full max-h-[70vh] object-contain rounded" />
            </div>
          )}
          {(esKml || esShp) && loading && (
            <div className="flex items-center justify-center h-64">
              <Loader2 size={24} className="animate-spin text-[#7B1C3E]" />
              <span className="ml-2 text-sm text-gray-500">Cargando vista previa geográfica…</span>
            </div>
          )}
          {(esKml || esShp) && geoError && (
            <div className="flex flex-col items-center justify-center h-64 gap-2">
              <AlertTriangle size={20} className="text-amber-500" />
              <p className="text-sm text-gray-500">{geoError}</p>
              <a href={url} target="_blank" rel="noreferrer" className="text-xs text-[#7B1C3E] underline">Descargar archivo</a>
            </div>
          )}
          {(esKml || esShp) && geoData && !loading && !geoError && (
            <GeoPreviewMap data={geoData} isGeoJSON={esShp} />
          )}
          {esAudio && (
            <div className="flex items-center justify-center h-64 p-4">
              <audio controls src={url} className="w-full max-w-md" />
            </div>
          )}
          {esTexto && (
            <iframe src={url} className="w-full h-full min-h-[60vh] rounded bg-gray-50 font-mono text-sm" title={nombre} />
          )}
          {!esPdf && !esImagen && !esKml && !esShp && !esAudio && !esTexto && (
            <div className="flex flex-col items-center justify-center h-64 gap-3">
              <FileText size={40} className="text-gray-300" />
              <p className="text-sm text-gray-500">Vista previa no disponible para este tipo de archivo.</p>
              <a href={url} target="_blank" rel="noreferrer"
                className="flex items-center gap-1 px-4 py-2 bg-[#7B1C3E] text-white text-sm rounded-lg hover:bg-[#5a1430]">
                <Upload size={14} className="rotate-180" /> Descargar archivo
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
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
