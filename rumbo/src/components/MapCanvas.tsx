import React, { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Mode } from '../types';
import { MODES } from '../constants';

// Fix for default marker icons in Leaflet with React
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

interface MapCanvasProps {
  activeMode: Mode | null;
}

// Helper component to handle map view updates
function MapController({ path }: { path: [number, number][] | null }) {
  const map = useMap();
  
  useEffect(() => {
    if (path && path.length > 0) {
      const bounds = L.latLngBounds(path);
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [path, map]);

  return null;
}

export default function MapCanvas({ activeMode }: MapCanvasProps) {
  const activeConfig = useMemo(() => 
    activeMode ? MODES.find(m => m.id === activeMode) : null
  , [activeMode]);

  // Lo Barnechea Center
  const center: [number, number] = [-33.35, -70.51];

  // Mode-specific routes following actual street patterns in Lo Barnechea
  const routes: Record<Mode, [number, number][]> = {
    carpool: [
      [-33.364, -70.548], // Av. Las Condes
      [-33.358, -70.535], // Av. La Dehesa
      [-33.352, -70.515], // Av. La Dehesa
      [-33.345, -70.505], // Av. La Dehesa
      [-33.338, -70.495]  // Towards El Huinganal
    ],
    walk: [
      [-33.352, -70.512], // Near Portal La Dehesa
      [-33.350, -70.510],
      [-33.348, -70.508],
      [-33.346, -70.506]
    ],
    bus: [
      [-33.380, -70.510], // Av. Jose Alcalde Delano
      [-33.365, -70.510],
      [-33.350, -70.510], // Av. La Dehesa
      [-33.340, -70.520]
    ],
    bike: [
      [-33.365, -70.540], // Near Mapocho River
      [-33.360, -70.525],
      [-33.358, -70.510],
      [-33.355, -70.490]
    ],
  };

  const activePath = activeMode ? routes[activeMode] : null;

  return (
    <div className="absolute inset-0 bg-[#e8f5e9] z-0">
      <MapContainer 
        center={center} 
        zoom={13} 
        zoomControl={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; Rumbo'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          className="map-tiles"
        />
        
        {activePath && activeConfig && (
          <>
            {/* Waze-style Route Shadow/Border */}
            <Polyline 
              positions={activePath} 
              pathOptions={{ 
                color: '#000000', 
                weight: 12,
                opacity: 0.1,
                lineCap: 'round'
              }} 
            />
            
            {/* Main Route Line */}
            <Polyline 
              positions={activePath} 
              pathOptions={{ 
                color: activeConfig.color, 
                weight: 8,
                opacity: 1,
                lineCap: 'round',
                lineJoin: 'round'
              }} 
            />
            
            {/* Start Marker */}
            <Marker 
              position={activePath[0]} 
              icon={L.divIcon({
                className: 'custom-div-icon',
                html: `<div style="background-color: #33b5e5; border: 4px solid white; width: 22px; height: 22px; border-radius: 50%; box-shadow: 0 4px 10px rgba(0,0,0,0.2);"></div>`,
                iconSize: [22, 22],
                iconAnchor: [11, 11]
              })}
            />
            
            {/* End Marker */}
            <Marker 
              position={activePath[activePath.length - 1]} 
              icon={L.divIcon({
                className: 'custom-div-icon',
                html: `<div style="background-color: #ff5a5f; width: 32px; height: 32px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(0,0,0,0.3); border: 3px solid white;">
                        <div style="transform: rotate(45deg); color: white; font-weight: 900; font-size: 14px; margin-bottom: 2px;">B</div>
                      </div>`,
                iconSize: [32, 32],
                iconAnchor: [16, 32]
              })}
            />

            <MapController path={activePath} />
          </>
        )}
      </MapContainer>

      <style>{`
        .map-tiles {
          filter: saturate(1.2) brightness(1.02);
        }
        .leaflet-container {
          background: #e8f5e9 !important;
        }
        /* Enhance green areas in the map tiles */
        .leaflet-tile-pane {
          opacity: 0.95;
        }
      `}</style>
    </div>
  );
}
