export type Mode = 'all' | 'carpool' | 'walk' | 'transit' | 'bike';

/** Per-mode summary returned by /api/route-all. The 'all' mode itself is a UI
 *  aggregate, never a real backend route — so it does not appear in this map. */
export type SingleMode = Exclude<Mode, 'all'>;

export interface Route {
  name: string;
  time?: string;
  distance?: string;
  detail?: string;
  badge?: string;
}

export interface Stat {
  key: string;
  value: string;
}

export interface RoutedPath {
  durationSeconds: number;
  distanceMeters: number;
  coordinates: [number, number][];
}

export interface ModeConfig {
  id: Mode;
  title: string;
  btnLabel: string;
  icon: string;
  /** Mode accent used for map + UI (chips, panel). */
  color: string;
}

/** Resolved trip for one transport mode (from /api/route). */
export interface ModeRouteData {
  primary: RoutedPath;
  alternatives: RoutedPath[];
}

export interface Suggestion {
  lat: number;
  lng: number;
  label: string;
  primary: string;
  secondary: string;
  category?: string;
}

export type TransitVehicleType = 'BUS' | 'SUBWAY' | 'RAIL' | 'TRAM' | 'OTHER';

export interface WalkLeg {
  kind: 'walk';
  durationSeconds: number;
  distanceMeters: number;
  coordinates: [number, number][];
  instructions?: string | null;
}

export interface TransitLegData {
  kind: 'transit';
  durationSeconds: number;
  distanceMeters: number;
  coordinates: [number, number][];
  vehicleType: TransitVehicleType;
  lineShortName: string | null;
  lineLongName: string | null;
  lineColor: string | null;
  lineTextColor: string | null;
  headsign: string | null;
  numStops: number | null;
  departureStop: string | null;
  arrivalStop: string | null;
  /** Public paradero code (e.g. "PA433") used to query live red.cl ETAs.
   *  Null for metro/rail and any stop the GTFS feed leaves codeless. */
  departureStopCode: string | null;
  arrivalStopCode: string | null;
  departureTimeUnix: number | null;
  arrivalTimeUnix: number | null;
}

export type Leg = WalkLeg | TransitLegData;

export interface TransitFare {
  currency: string;
  value: number;
  text: string;
}

export interface TransitRouteResult {
  available: boolean;
  status: string;
  totalDurationSeconds: number | null;
  legs: Leg[];
  fare: TransitFare | null;
  firstTransitDepartureUnix: number | null;
}

/** Per-mode entry in /api/route-all. Either a successful route (with the same
 *  shape returned by the per-mode endpoint) or an error — never both. */
export type ModeOutcome =
  | { kind: 'route'; mode: Exclude<SingleMode, 'transit'>; primary: RoutedPath; alternatives: RoutedPath[] }
  | { kind: 'transit'; mode: 'transit'; result: TransitRouteResult }
  | { kind: 'error'; mode: SingleMode; error: string };

export interface AllRoutesResult {
  carpool: ModeOutcome;
  walk: ModeOutcome;
  bike: ModeOutcome;
  transit: ModeOutcome;
}

/** Local fare estimate for one provider, computed client-side from public
 *  Santiago tariffs. Never personalized; UI must label it as estimated. */
export interface ProviderEstimate {
  providerId: string;
  name: string;
  product: string;
  color: string;
  low: number;
  high: number;
  currency: 'CLP';
  /** ETA / pickup time in minutes, when the provider model has an opinion. */
  etaMinutes: number | null;
  deepLinkUrl: string;
  deepLinkLabel: string;
  /** Free-text disclaimer shown next to the price. */
  note?: string;
}
