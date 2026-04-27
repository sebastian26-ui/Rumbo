export type Mode = 'carpool' | 'walk' | 'bus' | 'bike';

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
