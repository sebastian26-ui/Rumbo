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

export interface ModeConfig {
  id: Mode;
  color: string;
  title: string;
  sub: string;
  routes: Route[];
  stats: Stat[];
  btnLabel: string;
  icon: string;
}
