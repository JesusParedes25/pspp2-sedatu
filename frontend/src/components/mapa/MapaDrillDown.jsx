/**
 * ARCHIVO: MapaDrillDown.jsx
 * PROPÓSITO: Mapa Leaflet reutilizable con drill-down Estado → Municipios.
 *            Usado tanto por el módulo Territorio (nacional, escala Estados/ZM)
 *            como por Seguimiento → Mapa (acotado a un solo proyecto).
 *            El componente es puramente presentacional: recibe GeoJSON y
 *            estilos/callbacks ya resueltos — no hace fetch de datos.
 */
import { useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

export const GUINDA = '#7B1C3E';
export const GUINDA_DARK = '#611232';
export const MEXICO_CENTER = [23.6345, -102.5528];
export const MEXICO_ZOOM = 5;

const ESTADO_BASE = { color: '#D1D5DB', weight: 0.5, fillColor: '#F3F4F6', fillOpacity: 0.25 };
const MUNI_BASE = { color: '#e5e5e5', weight: 0.5, fillColor: '#f0f0f0', fillOpacity: 0.5 };
const MUNI_ACTIVO = { color: '#611232', weight: 1, fillColor: '#7B1C3E', fillOpacity: 0.7 };

function FlyController({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) map.flyToBounds(bounds, { padding: [40, 40], duration: 0.8, maxZoom: 9 });
    else map.flyTo(MEXICO_CENTER, MEXICO_ZOOM, { duration: 0.8 });
  }, [bounds, map]);
  return null;
}

/**
 * @param {object} props
 * @param {object} props.estadosGeoJSON        FeatureCollection nacional de estados (o ZM si escala='zm')
 * @param {object|null} props.estadoActivo      { cve_ent, bounds } del estado seleccionado (drill-down activo)
 * @param {(cve:string)=>number} props.estadoIntensidad  0..1 para el degradado guinda del estado
 * @param {(cve:string, nombre:string, layer)=>void} props.onClickEstado
 * @param {(data:{cve_ent,nombre,x,y}|null)=>void} props.onHoverEstado
 * @param {object|null} props.municipiosGeoJSON FeatureCollection de municipios del estado activo (drill-down)
 * @param {Set<string>} props.municipiosActivos cvegeo de municipios con actividad → pintados en guinda
 * @param {(cvegeo:string, nombre:string, layer, activo:boolean)=>void} props.onClickMunicipio
 * @param {(data:{cvegeo,nombre,x,y}|null)=>void} props.onHoverMunicipio
 * @param {string} props.propEstado  nombre de la propiedad en el geojson de estado que trae la clave ('cve_ent')
 */
export default function MapaDrillDown({
  estadosGeoJSON, estadoActivo, estadoIntensidad, onClickEstado, onHoverEstado,
  municipiosGeoJSON, municipiosActivos, onClickMunicipio, onHoverMunicipio,
  propEstado = 'cve_ent',
}) {
  const estadosLayerRef = useRef({});
  const estadoActivoRef = useRef(null);
  useEffect(() => { estadoActivoRef.current = estadoActivo; }, [estadoActivo]);

  const getEstadoStyle = useCallback((feature) => {
    const cve = feature.properties[propEstado];
    if (estadoActivoRef.current?.cve_ent === cve) {
      // Baja opacidad para dejar ver los municipios dibujados encima,
      // pero conserva el borde grueso como referencia del área seleccionada.
      return { color: GUINDA_DARK, weight: 3, fillColor: GUINDA, fillOpacity: 0.1 };
    }
    const ratio = estadoIntensidad ? estadoIntensidad(cve) : 0;
    if (ratio <= 0) return ESTADO_BASE;
    return { color: GUINDA_DARK, weight: 1.5, fillColor: GUINDA, fillOpacity: 0.12 + ratio * 0.55 };
  }, [estadoIntensidad, propEstado]);

  useEffect(() => {
    Object.values(estadosLayerRef.current).forEach(layer => {
      if (layer.feature) layer.setStyle(getEstadoStyle(layer.feature));
    });
  }, [estadoActivo, getEstadoStyle]);

  const onEachEstado = useCallback((feature, layer) => {
    const cve = feature.properties[propEstado];
    estadosLayerRef.current[cve] = layer;
    layer.feature = feature;
    layer.on({
      mouseover: (e) => {
        if (estadoActivoRef.current?.cve_ent !== cve) layer.setStyle({ weight: 2, color: GUINDA_DARK });
        onHoverEstado?.({ cve_ent: cve, nombre: feature.properties.nombre, x: e.originalEvent.clientX, y: e.originalEvent.clientY });
      },
      mousemove: (e) => onHoverEstado?.({ cve_ent: cve, nombre: feature.properties.nombre, x: e.originalEvent.clientX, y: e.originalEvent.clientY }),
      mouseout: () => { layer.setStyle(getEstadoStyle(feature)); onHoverEstado?.(null); },
      click: () => onClickEstado?.(cve, feature.properties.nombre, layer),
    });
  }, [propEstado, getEstadoStyle, onClickEstado, onHoverEstado]);

  const getMuniStyle = useCallback((feature) => {
    const cvegeo = feature.properties.cvegeo;
    return municipiosActivos?.has(cvegeo) ? MUNI_ACTIVO : MUNI_BASE;
  }, [municipiosActivos]);

  const onEachMunicipio = useCallback((feature, layer) => {
    const cvegeo = feature.properties.cvegeo;
    const activo = municipiosActivos?.has(cvegeo);
    layer.on({
      mouseover: (e) => {
        if (activo) layer.setStyle({ fillOpacity: 0.9, weight: 2 });
        onHoverMunicipio?.({ cvegeo, nombre: feature.properties.nombre, activo, x: e.originalEvent.clientX, y: e.originalEvent.clientY });
      },
      mousemove: (e) => onHoverMunicipio?.({ cvegeo, nombre: feature.properties.nombre, activo, x: e.originalEvent.clientX, y: e.originalEvent.clientY }),
      mouseout: () => { layer.setStyle(getMuniStyle(feature)); onHoverMunicipio?.(null); },
      click: () => onClickMunicipio?.(cvegeo, feature.properties.nombre, layer, activo),
    });
  }, [municipiosActivos, getMuniStyle, onClickMunicipio, onHoverMunicipio]);

  // key único: fuerza a Leaflet a re-crear la capa cuando cambian los datos
  // (evita mezclar listeners viejos con geometría nueva).
  // Incluye propEstado: si no, al alternar Estados↔ZM sin ningún área activa
  // la key no cambia ("est_nacional" en ambos casos) y react-leaflet NO
  // vuelve a montar el <GeoJSON>, dejando la capa vieja congelada aunque
  // el prop `data` sí cambió (GeoJSON de react-leaflet solo redibuja por key).
  const estadosKey = 'est_' + propEstado + '_' + (estadoActivo?.cve_ent || 'nacional');
  const muniKey = 'muni_' + (estadoActivo?.cve_ent || 'none') + '_' + (municipiosActivos ? municipiosActivos.size : 0);

  return (
    <MapContainer center={MEXICO_CENTER} zoom={MEXICO_ZOOM} className="h-full w-full" scrollWheelZoom={true}>
      <TileLayer
        attribution='&copy; <a href="https://carto.com">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />
      {estadosGeoJSON && (
        <GeoJSON key={estadosKey} data={estadosGeoJSON} style={getEstadoStyle} onEachFeature={onEachEstado} />
      )}
      {municipiosGeoJSON && (
        <GeoJSON key={muniKey} data={municipiosGeoJSON} style={getMuniStyle} onEachFeature={onEachMunicipio} />
      )}
      <FlyController bounds={estadoActivo?.bounds || null} />
    </MapContainer>
  );
}
