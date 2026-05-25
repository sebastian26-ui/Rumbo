import type { Leg, TransitLegData, TransitVehicleType } from '../types';
import { METRO_LINE_COLORS } from '../constants';
import type { RouteSegment } from '../components/MapCanvas';

const TRANSIT_ORANGE = '#F59E0B';
const RAIL_DEFAULT = '#0F766E';
const TRAM_DEFAULT = '#7C3AED';
const WALK_GRAY = '#6B7280';
const FALLBACK_TRANSIT = '#374151';

function normaliseHexColor(c: string | null | undefined): string | null {
  if (!c) return null;
  const trimmed = c.trim();
  if (!trimmed) return null;
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
}

/** Color used for a transit leg's polyline + UI badge.
 *  Buses always use Rumbo's brand orange — we deliberately ignore the GTFS
 *  `route_color` (DTPM publishes a dark red that clashes with the orange
 *  Transit pill in the UI). Metro keeps its iconic per-line colors. */
export function colorForTransitLeg(leg: TransitLegData): string {
  if (leg.vehicleType === 'BUS') {
    return TRANSIT_ORANGE;
  }

  if (leg.vehicleType === 'SUBWAY') {
    const code = (leg.lineShortName || '').toUpperCase().replace(/\s+/g, '');
    if (code && METRO_LINE_COLORS[code]) return METRO_LINE_COLORS[code];
    // Some Google responses use "L1" / "1" / "Línea 1"
    const numMatch = (leg.lineShortName || leg.lineLongName || '').match(/(\d+A?)/i);
    if (numMatch) {
      const key = `L${numMatch[1].toUpperCase()}`;
      if (METRO_LINE_COLORS[key]) return METRO_LINE_COLORS[key];
    }
    const fromProvider = normaliseHexColor(leg.lineColor);
    if (fromProvider) return fromProvider;
    return FALLBACK_TRANSIT;
  }

  const fromProvider = normaliseHexColor(leg.lineColor);
  if (fromProvider) return fromProvider;

  switch (leg.vehicleType as TransitVehicleType) {
    case 'RAIL':
      return RAIL_DEFAULT;
    case 'TRAM':
      return TRAM_DEFAULT;
    default:
      return FALLBACK_TRANSIT;
  }
}

/** Turn a transit response's legs into renderable polyline segments. Transit
 *  legs carry boarding/alighting markers so transfers read as distinct steps
 *  even when consecutive bus legs share the same orange brand color. */
export function legsToSegments(legs: Leg[]): RouteSegment[] {
  return legs
    .filter((l) => l.coordinates.length >= 2)
    .map<RouteSegment>((leg) => {
      if (leg.kind === 'walk') {
        return {
          coordinates: leg.coordinates,
          color: WALK_GRAY,
          dashed: true,
          weight: 4,
        };
      }
      return {
        coordinates: leg.coordinates,
        color: colorForTransitLeg(leg),
        weight: 6,
        startMarker: true,
        endMarker: true,
      };
    });
}
