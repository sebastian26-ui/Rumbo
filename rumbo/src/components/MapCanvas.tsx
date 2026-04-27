import React, { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Mode } from '../types';
import { MODES } from '../constants';

import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

/** Default: Santiago centro */
export const DEFAULT_MAP_CENTER: [number, number] = [-33.4489, -70.6693];

export interface MapCanvasProps {
  activeMode: Mode | null;
  /** [lat, lng][] from routing service */
  routePath?: [number, number][] | null;
  /** Map center when idle or fallback */
  userCenter?: [number, number];
}

function MapViewController({
  path,
  userCenter,
}: {
  path: [number, number][] | null;
  userCenter: [number, number];
}) {
  const map = useMap();

  useEffect(() => {
    if (path && path.length >= 2) {
      const bounds = L.latLngBounds(path);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16, animate: true });
    } else {
      map.setView(userCenter, 14, { animate: true });
    }
  }, [path, userCenter, map]);

  return null;
}

export default function MapCanvas({
  activeMode,
  routePath = null,
  userCenter = DEFAULT_MAP_CENTER,
}: MapCanvasProps) {
  const activeConfig = useMemo(
    () => (activeMode ? MODES.find((m) => m.id === activeMode) : null),
    [activeMode],
  );

  const validPath =
    routePath && routePath.length >= 2 ? routePath : null;

  return (
    <div className="absolute inset-0 z-0 bg-[#f0f2f4]">
      <MapContainer
        center={userCenter}
        zoom={13}
        zoomControl={false}
        style={{ height: '100%', width: '100%' }}
        className="touch-manipulation"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          className="map-tiles"
        />

        {validPath && activeConfig && (
          <>
            <Polyline
              positions={validPath}
              pathOptions={{
                color: '#000000',
                weight: 10,
                opacity: 0.12,
                lineCap: 'round',
              }}
            />
            <Polyline
              positions={validPath}
              pathOptions={{
                color: activeConfig.color,
                weight: 6,
                opacity: 1,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
            <Marker
              position={validPath[0]}
              icon={L.divIcon({
                className: 'custom-div-icon',
                html: `<div style="background-color: #33b5e5; border: 3px solid white; width: 20px; height: 20px; border-radius: 50%; box-shadow: 0 4px 10px rgba(0,0,0,0.2);"></div>`,
                iconSize: [20, 20],
                iconAnchor: [10, 10],
              })}
            />
            <Marker
              position={validPath[validPath.length - 1]}
              icon={L.divIcon({
                className: 'custom-div-icon',
                html: `<div style="background-color: #ff5a5f; width: 30px; height: 30px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(0,0,0,0.3); border: 3px solid white;">
                        <div style="transform: rotate(45deg); color: white; font-weight: 900; font-size: 13px; margin-bottom: 2px;">B</div>
                      </div>`,
                iconSize: [30, 30],
                iconAnchor: [15, 30],
              })}
            />
          </>
        )}

        <MapViewController path={validPath} userCenter={userCenter} />
      </MapContainer>

      <style>{`
        .map-tiles {
          filter: saturate(0.92) brightness(1.03) contrast(0.98);
        }
        .leaflet-container {
          background: #eef1f4 !important;
          font-family: inherit;
        }
        .leaflet-tile-pane {
          opacity: 0.97;
        }
      `}</style>
    </div>
  );
}
