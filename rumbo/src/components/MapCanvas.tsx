import React, { useEffect, useMemo, useRef } from 'react';
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

export interface RouteSegment {
  coordinates: [number, number][];
  color: string;
  dashed?: boolean;
  weight?: number;
  /** Render a stop dot at coordinates[0] (used for transit boarding stops). */
  startMarker?: boolean;
  /** Render a stop dot at the last coordinate (used for transit alighting). */
  endMarker?: boolean;
}

/** Small filled-circle stop marker, Moovit-style. White border keeps the dot
 *  legible on top of the polyline it terminates. */
function stopDotIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: 'transit-stop-dot',
    html: `<div style="background-color:${color};border:2px solid #fff;width:10px;height:10px;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.35);"></div>`,
    iconSize: [10, 10],
    iconAnchor: [5, 5],
  });
}

export interface MapCanvasProps {
  activeMode: Mode | null;
  /** Single polyline — used for walk/bike/car. */
  routePath?: [number, number][] | null;
  /** Multi-segment polylines — used for transit (each leg a different color). */
  routeSegments?: RouteSegment[] | null;
  /** Map center when idle or fallback */
  userCenter?: [number, number];
  /** Compass heading in degrees clockwise from north (0 = N, 90 = E). When
   *  set, a semi-transparent fan rotates out of the user-location dot in the
   *  direction the device is facing. Pass null/undefined to hide the cone. */
  userHeading?: number | null;
}

/**
 * Persistent "you are here" marker. We render imperatively rather than via
 * react-leaflet's <Marker> because the cone needs CSS-transitioned rotation:
 * we keep the DOM element stable across heading updates and just rewrite its
 * `transform`, so the transition fires. Re-rendering a new divIcon on every
 * GPS / orientation tick would replace the element and kill the animation.
 */
function UserLocationMarker({
  position,
  heading,
}: {
  position: [number, number];
  heading: number | null;
}) {
  const map = useMap();
  const markerRef = useRef<L.Marker | null>(null);
  const coneRef = useRef<HTMLElement | null>(null);
  /** Cumulative (unwrapped) rotation so 350°→10° animates 350°→370°, the
   *  short way, instead of sweeping 340° counter-clockwise. */
  const cumulativeDegRef = useRef<number | null>(null);
  const lastHeadingRef = useRef<number | null>(null);

  useEffect(() => {
    const html = `
      <div class="rumbo-user-loc">
        <div class="rumbo-user-cone" data-cone="1"></div>
        <div class="rumbo-user-dot"></div>
      </div>
    `;
    const icon = L.divIcon({
      className: 'rumbo-user-loc-wrap',
      html,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
    const marker = L.marker(position, {
      icon,
      interactive: false,
      keyboard: false,
      // Above polylines, below popups/dialogs.
      zIndexOffset: 1000,
    });
    marker.addTo(map);
    markerRef.current = marker;
    const el = marker.getElement() as HTMLElement | undefined;
    coneRef.current = el?.querySelector('[data-cone="1"]') as HTMLElement | null;
    return () => {
      marker.remove();
      markerRef.current = null;
      coneRef.current = null;
      cumulativeDegRef.current = null;
      lastHeadingRef.current = null;
    };
    // We deliberately don't include `position` here — position updates go
    // through the dedicated effect below so we don't tear down the marker
    // (and its DOM, and its cone transition state) on every GPS fix.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  useEffect(() => {
    markerRef.current?.setLatLng(position);
  }, [position]);

  useEffect(() => {
    const cone = coneRef.current;
    if (!cone) return;
    if (heading == null || !Number.isFinite(heading)) {
      cone.style.display = 'none';
      lastHeadingRef.current = null;
      cumulativeDegRef.current = null;
      return;
    }
    cone.style.display = 'block';

    const prev = lastHeadingRef.current;
    if (prev == null || cumulativeDegRef.current == null) {
      // First reading — snap into place without animating from 0.
      cumulativeDegRef.current = heading;
      cone.style.transition = 'none';
      cone.style.transform = `rotate(${heading}deg)`;
      // Re-enable the transition on the next frame so subsequent updates ease.
      requestAnimationFrame(() => {
        if (coneRef.current === cone) cone.style.transition = '';
      });
    } else {
      let delta = heading - prev;
      if (delta > 180) delta -= 360;
      else if (delta < -180) delta += 360;
      cumulativeDegRef.current += delta;
      cone.style.transform = `rotate(${cumulativeDegRef.current}deg)`;
    }
    lastHeadingRef.current = heading;
  }, [heading]);

  return null;
}

function MapViewController({
  bounds,
  userCenter,
}: {
  bounds: L.LatLngBounds | null;
  userCenter: [number, number];
}) {
  const map = useMap();
  /** The last bounds reference we already fit to, so we don't keep refitting
   *  every time the user moves and triggers a re-render. */
  const fittedBoundsRef = useRef<L.LatLngBounds | null>(null);
  /** Whether we've performed our initial zoom-in. */
  const initializedRef = useRef(false);

  // Fit to a new route's bounds whenever the bounds *reference* changes
  // (i.e. a new route was computed). We deliberately don't refit on every
  // userCenter tick — that would lock the camera onto the route and prevent
  // the follow-user behavior below.
  useEffect(() => {
    if (bounds && bounds.isValid() && fittedBoundsRef.current !== bounds) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16, animate: true });
      fittedBoundsRef.current = bounds;
    } else if (!bounds) {
      fittedBoundsRef.current = null;
    }
  }, [bounds, map]);

  // Continuously follow the user. setView on the first fix so we zoom in
  // from the MapContainer's default 13; panTo afterwards so subsequent
  // updates preserve whatever zoom the user (or fitBounds) settled on.
  useEffect(() => {
    if (!initializedRef.current) {
      map.setView(userCenter, 14, { animate: true });
      initializedRef.current = true;
      return;
    }
    map.panTo(userCenter, { animate: true });
  }, [userCenter, map]);

  return null;
}

export default function MapCanvas({
  activeMode,
  routePath = null,
  routeSegments = null,
  userCenter = DEFAULT_MAP_CENTER,
  userHeading = null,
}: MapCanvasProps) {
  const activeConfig = useMemo(
    () => (activeMode ? MODES.find((m) => m.id === activeMode) : null),
    [activeMode],
  );

  // Transit takes priority when present — walk/bike/car still use routePath.
  const segments: RouteSegment[] | null = useMemo(() => {
    if (routeSegments && routeSegments.length > 0) {
      return routeSegments.filter((s) => s.coordinates.length >= 2);
    }
    if (routePath && routePath.length >= 2 && activeConfig) {
      return [{ coordinates: routePath, color: activeConfig.color, weight: 6 }];
    }
    return null;
  }, [routeSegments, routePath, activeConfig]);

  const { endPoint, bounds } = useMemo(() => {
    if (!segments || segments.length === 0) {
      return { endPoint: null, bounds: null };
    }
    const last = segments[segments.length - 1];
    const all = segments.flatMap((s) => s.coordinates);
    return {
      endPoint: last.coordinates[last.coordinates.length - 1] as [number, number],
      bounds: L.latLngBounds(all),
    };
  }, [segments]);

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

        {segments &&
          segments.map((seg, i) => {
            const last = seg.coordinates[seg.coordinates.length - 1] as [number, number];
            const first = seg.coordinates[0] as [number, number];
            return (
              <React.Fragment key={`seg-${i}`}>
                <Polyline
                  positions={seg.coordinates}
                  pathOptions={{
                    color: '#000000',
                    weight: (seg.weight ?? 6) + 4,
                    opacity: 0.12,
                    lineCap: 'round',
                  }}
                />
                <Polyline
                  positions={seg.coordinates}
                  pathOptions={{
                    color: seg.color,
                    weight: seg.weight ?? 6,
                    opacity: 1,
                    lineCap: 'round',
                    lineJoin: 'round',
                    dashArray: seg.dashed ? '2 10' : undefined,
                  }}
                />
                {seg.startMarker && (
                  <Marker
                    position={first}
                    icon={stopDotIcon(seg.color)}
                    interactive={false}
                  />
                )}
                {seg.endMarker && (
                  <Marker
                    position={last}
                    icon={stopDotIcon(seg.color)}
                    interactive={false}
                  />
                )}
              </React.Fragment>
            );
          })}

        {endPoint && (
          <Marker
            position={endPoint}
            icon={L.divIcon({
              className: 'custom-div-icon',
              html: `<div style="background-color: #ff5a5f; width: 30px; height: 30px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(0,0,0,0.3); border: 3px solid white;">
                      <div style="transform: rotate(45deg); color: white; font-weight: 900; font-size: 13px; margin-bottom: 2px;">B</div>
                    </div>`,
              iconSize: [30, 30],
              iconAnchor: [15, 30],
            })}
          />
        )}

        <UserLocationMarker position={userCenter} heading={userHeading} />
        <MapViewController bounds={bounds} userCenter={userCenter} />
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
        /* User-location marker: 24×24 anchor box, cone extends past it. */
        .rumbo-user-loc-wrap {
          overflow: visible !important;
          pointer-events: none;
        }
        .rumbo-user-loc {
          position: relative;
          width: 24px;
          height: 24px;
          overflow: visible;
        }
        /* The cone is a 100×100 SVG-shaped wedge sitting behind the dot.
         * clip-path carves a ~60° triangle pointing "up" (toward heading 0).
         * Rotation is applied inline via transform; the transition makes
         * heading updates ease smoothly. */
        .rumbo-user-cone {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 100px;
          height: 100px;
          margin-left: -50px;
          margin-top: -50px;
          background: radial-gradient(
            circle at 50% 50%,
            rgba(51, 181, 229, 0.55) 0%,
            rgba(51, 181, 229, 0.25) 40%,
            rgba(51, 181, 229, 0) 75%
          );
          /* 60° wedge: half-angle 30°, tips at (50%±50%·sin30°, 50%−50%·cos30°). */
          clip-path: polygon(50% 50%, 25% 6.7%, 75% 6.7%);
          transform-origin: 50% 50%;
          transition: transform 180ms linear;
          display: none;
          pointer-events: none;
        }
        .rumbo-user-dot {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 20px;
          height: 20px;
          margin-left: -10px;
          margin-top: -10px;
          background-color: #33b5e5;
          border: 3px solid white;
          border-radius: 50%;
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
        }
      `}</style>
    </div>
  );
}
