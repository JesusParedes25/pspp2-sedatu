/**
 * ARCHIVO: MapaCobertura.jsx
 * PROPÓSITO: Mapa interactivo con Leaflet que muestra la cobertura geográfica
 *            del proyecto (estados y municipios con datos vinculados).
 *
 * Usa WMS tiles de GeoServer para los layers de estados/municipios.
 * Highlight de polígonos con cobertura en color institucional.
 * Se oculta automáticamente si el proyecto no tiene cobertura.
 */
import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, WMSTileLayer, GeoJSON, useMap } from 'react-leaflet';
import { MapPin } from 'lucide-react';
import client from '../../api/client';
import 'leaflet/dist/leaflet.css';

const GEOSERVER_URL = import.meta.env.VITE_GEOSERVER_URL || 'http://localhost:8080/geoserver';
const MEXICO_CENTER = [23.6345, -102.5528];
const MEXICO_ZOOM = 5;

// Estilo para polígonos con cobertura
const estiloCobertura = {
  color: '#991b1b',
  weight: 2,
  fillColor: '#991b1b',
  fillOpacity: 0.3,
};

const estiloBase = {
  color: '#6b7280',
  weight: 0.5,
  fillColor: '#f3f4f6',
  fillOpacity: 0.1,
};

export default function MapaCobertura({ proyectoId }) {
  const [cobertura, setCobertura] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!proyectoId) return;
    client.get(`/proyectos/${proyectoId}/cobertura`)
      .then(({ data }) => {
        const datos = data.datos || [];
        setCobertura(datos);
        setVisible(datos.length > 0);
        setCargando(false);
      })
      .catch(() => setCargando(false));
  }, [proyectoId]);

  if (cargando) return null;
  if (!visible) return null;

  // Resumen de cobertura
  const estadosUnicos = [...new Set(cobertura.map(c => c.estado_nombre).filter(Boolean))];
  const municipiosUnicos = [...new Set(cobertura.map(c => c.municipio_nombre).filter(Boolean))];

  return (
    <div className="space-y-3">
      {/* Resumen */}
      <div className="flex items-center gap-4 text-sm">
        <span className="flex items-center gap-1.5 text-gray-700">
          <MapPin size={14} className="text-red-800" />
          <strong>{estadosUnicos.length}</strong> estado{estadosUnicos.length !== 1 ? 's' : ''}
        </span>
        {municipiosUnicos.length > 0 && (
          <span className="text-gray-500">
            <strong>{municipiosUnicos.length}</strong> municipio{municipiosUnicos.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Mapa */}
      <div className="border rounded-lg overflow-hidden h-[400px]">
        <MapContainer
          center={MEXICO_CENTER}
          zoom={MEXICO_ZOOM}
          className="h-full w-full"
          scrollWheelZoom={true}
        >
          {/* Base tiles */}
          <TileLayer
            attribution='&copy; <a href="https://carto.com">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          />

          {/* WMS layer de estados */}
          <WMSTileLayer
            url={`${GEOSERVER_URL}/pspp/wms`}
            layers="pspp:vw_geo_estados"
            format="image/png"
            transparent={true}
            styles=""
            opacity={0.4}
          />

          {/* WMS layer de municipios (solo si hay cobertura municipal) */}
          {municipiosUnicos.length > 0 && (
            <WMSTileLayer
              url={`${GEOSERVER_URL}/pspp/wms`}
              layers="pspp:vw_geo_municipios"
              format="image/png"
              transparent={true}
              styles=""
              opacity={0.3}
            />
          )}
        </MapContainer>
      </div>

      {/* Lista de cobertura */}
      <div className="flex flex-wrap gap-1.5">
        {estadosUnicos.map(est => (
          <span key={est} className="px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-800 font-medium">
            {est}
          </span>
        ))}
        {municipiosUnicos.map(mun => (
          <span key={mun} className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-700">
            {mun}
          </span>
        ))}
      </div>
    </div>
  );
}
