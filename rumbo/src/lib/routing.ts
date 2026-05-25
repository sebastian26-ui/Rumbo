import type { Mode, RoutedPath, Stat, Route as RouteOption } from '../types';

export type LatLng = { lat: number; lng: number };

export type RouteApiResponse = {
  primary: RoutedPath;
  alternatives: RoutedPath[];
};

export type RoutingProfile = 'car' | 'foot' | 'bike';

/**
 * Map a UI mode to a profile understood by /api/route.
 * Transit is intentionally excluded — it's served by /api/transit-route,
 * which returns a sequence of walk + transit legs (Metro + micro + …) and
 * does not share a single road-network polyline with cars.
 */
export function modeToRoutingProfile(mode: Mode): RoutingProfile | null {
  if (mode === 'walk') return 'foot';
  if (mode === 'bike') return 'bike';
  if (mode === 'carpool') return 'car';
  return null;
}

export function formatDuration(seconds: number): string {
  const m = Math.max(1, Math.round(seconds / 60));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm > 0 ? `${h} h ${mm} min` : `${h} h`;
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function co2SavedKgCarAvoided(distanceM: number): string {
  const km = distanceM / 1000;
  const kg = (km * 0.12).toFixed(1);
  return `${kg} kg`;
}

function moneySavedUsdRough(distanceM: number): string {
  const km = distanceM / 1000;
  const usd = (km * 0.35).toFixed(2);
  return `$${usd}`;
}

function walkCalories(distanceM: number): number {
  return Math.round((distanceM / 1000) * 55);
}

function walkSteps(distanceM: number): number {
  return Math.round((distanceM / 1000) * 1280);
}

function bikeCalories(distanceM: number): number {
  return Math.round((distanceM / 1000) * 28);
}

export function buildStatsForMode(mode: Mode, path: RoutedPath, destLabel: string): Stat[] {
  const d = formatDuration(path.durationSeconds);
  const dist = formatDistance(path.distanceMeters);

  switch (mode) {
    case 'carpool':
      return [
        { key: 'Travel Time', value: d },
        { key: 'CO₂ Saved', value: co2SavedKgCarAvoided(path.distanceMeters) },
        { key: 'Money Saved', value: moneySavedUsdRough(path.distanceMeters) },
      ];
    case 'walk':
      return [
        { key: 'Walking Time', value: d },
        { key: 'Calories', value: `${walkCalories(path.distanceMeters)} kcal` },
        { key: 'Steps', value: `${walkSteps(path.distanceMeters).toLocaleString()}` },
      ];
    case 'bike':
      return [
        { key: 'Cycling Time', value: d },
        { key: 'CO₂ Saved', value: co2SavedKgCarAvoided(path.distanceMeters) },
        { key: 'Calories', value: `${bikeCalories(path.distanceMeters)} kcal` },
      ];
    case 'transit':
      // Transit stats are computed by /api/transit-route and rendered as a
      // multi-leg breakdown (see TransitRouteResult). Returning [] here
      // suppresses the generic three-stat row.
      return [];
    default:
      return [
        { key: 'Travel Time', value: d },
        { key: 'Distance', value: dist },
        { key: 'To', value: destLabel.slice(0, 18) + (destLabel.length > 18 ? '…' : '') },
      ];
  }
}

export function buildRouteOptions(mode: Mode, res: RouteApiResponse): RouteOption[] {
  const primary = res.primary;
  const rows: RouteOption[] = [
    {
      name: 'Fastest route',
      time: formatDuration(primary.durationSeconds),
      distance: formatDistance(primary.distanceMeters),
      detail: mode === 'walk' ? 'Pedestrian paths' : mode === 'bike' ? 'Bike-accessible ways' : 'Road network',
      badge: 'Fastest',
    },
  ];

  const alt = res.alternatives[0];
  if (alt) {
    rows.push({
      name: 'Alternative',
      time: formatDuration(alt.durationSeconds),
      distance: formatDistance(alt.distanceMeters),
      detail: 'Different corridor',
      badge: mode === 'carpool' ? 'Eco' : undefined,
    });
  }

  return rows;
}
