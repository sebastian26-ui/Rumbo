import { SingleMode } from '../types';
import {
  FareTariff,
  RIDESHARE_TARIFFS,
  SCOOTER_TARIFFS,
} from './fares';
import {
  bikeItauDeepLink,
  cabifyDeepLink,
  DeepLink,
  didiDeepLink,
  limeDeepLink,
  uberDeepLink,
  whooshDeepLink,
  LatLng,
} from './deepLinks';

export type ProviderId =
  | 'uber'
  | 'didi'
  | 'cabify'
  | 'whoosh'
  | 'lime'
  | 'bike_itau';

export type ProviderKind = 'rideshare' | 'scooter' | 'bike_share';

export interface ProviderConfig {
  id: ProviderId;
  name: string;
  product: string;
  color: string;
  kind: ProviderKind;
  /** Which BottomPanel mode this provider appears under. */
  mode: SingleMode;
  tariff: FareTariff | null;
  /**
   * Deep link into the provider's app. Optional because some providers (e.g.
   * municipal bus services) have no app to hand off to — the comparison row
   * is purely informational.
   */
  buildDeepLink?: (args: { origin: LatLng; destination: LatLng; destinationLabel?: string }) => DeepLink;
  /** Marketing-style label shown next to the provider name (e.g. "GRATIS"). */
  badge?: string;
  /** Free-text disclaimer / context shown under the name in the panel. */
  description?: string;
  /** True if the service is free of charge — surfaces a green free-tag in UI. */
  isFree?: boolean;
}

export const PROVIDERS: ProviderConfig[] = [
  {
    id: 'uber',
    name: 'Uber',
    product: 'UberX',
    color: '#000000',
    kind: 'rideshare',
    mode: 'carpool',
    tariff: RIDESHARE_TARIFFS.uber,
    buildDeepLink: uberDeepLink,
  },
  {
    id: 'didi',
    name: 'DiDi',
    product: 'Express',
    color: '#FF7A00',
    kind: 'rideshare',
    mode: 'carpool',
    tariff: RIDESHARE_TARIFFS.didi,
    buildDeepLink: didiDeepLink,
  },
  {
    id: 'cabify',
    name: 'Cabify',
    product: 'Lite',
    color: '#7350FF',
    kind: 'rideshare',
    mode: 'carpool',
    tariff: RIDESHARE_TARIFFS.cabify,
    buildDeepLink: cabifyDeepLink,
  },
  {
    id: 'whoosh',
    name: 'Whoosh',
    product: 'Scooter',
    color: '#1AAB5A',
    kind: 'scooter',
    mode: 'bike',
    tariff: SCOOTER_TARIFFS.whoosh,
    buildDeepLink: whooshDeepLink,
  },
  {
    id: 'lime',
    name: 'Lime',
    product: 'Scooter',
    color: '#A8E000',
    kind: 'scooter',
    mode: 'bike',
    tariff: SCOOTER_TARIFFS.lime,
    buildDeepLink: limeDeepLink,
  },
  {
    id: 'bike_itau',
    name: 'Bike Itaú',
    product: 'Day pass',
    color: '#EC7000',
    kind: 'bike_share',
    mode: 'bike',
    tariff: null,
    buildDeepLink: bikeItauDeepLink,
  },
];

export const DEFAULT_ENABLED: ProviderId[] = [
  'uber',
  'didi',
  'cabify',
  'whoosh',
  'bike_itau',
];

export function providerById(id: ProviderId): ProviderConfig | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export function providersForMode(mode: SingleMode, enabled: Set<ProviderId>): ProviderConfig[] {
  return PROVIDERS.filter((p) => p.mode === mode && enabled.has(p.id));
}
