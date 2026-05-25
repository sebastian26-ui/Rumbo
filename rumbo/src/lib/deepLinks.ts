/**
 * Provider deep / universal links. We hand off the trip to each provider's
 * app rather than booking on their behalf — this is the only sanctioned
 * integration available without a B2B contract.
 *
 * Link strategies:
 *  - Uber: official universal link, prefills pickup + dropoff.
 *  - DiDi: no documented universal link for prefilled origin/destination
 *    outside China; fall back to homepage / store.
 *  - Cabify: no stable URL scheme; fall back to homepage.
 *  - Whoosh / Lime / Bike Itaú: open the home page; native deep-link schemes
 *    (`whoosh://`, `lime://`) aren't publicly documented.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

interface BuildArgs {
  origin: LatLng;
  destination: LatLng;
  destinationLabel?: string;
}

export type DeepLink = { url: string; label: string };

export function uberDeepLink({ origin, destination, destinationLabel }: BuildArgs): DeepLink {
  // https://developer.uber.com/docs/riders/ride-requests/tutorials/deep-links
  const params = new URLSearchParams({
    action: 'setPickup',
    'pickup[latitude]': origin.lat.toFixed(6),
    'pickup[longitude]': origin.lng.toFixed(6),
    'dropoff[latitude]': destination.lat.toFixed(6),
    'dropoff[longitude]': destination.lng.toFixed(6),
  });
  if (destinationLabel) params.set('dropoff[nickname]', destinationLabel.slice(0, 40));
  return {
    url: `https://m.uber.com/ul/?${params.toString()}`,
    label: 'Open in Uber',
  };
}

export function didiDeepLink(_args: BuildArgs): DeepLink {
  return { url: 'https://web.didiglobal.com/cl/', label: 'Open DiDi' };
}

export function cabifyDeepLink(_args: BuildArgs): DeepLink {
  return { url: 'https://cabify.com/cl', label: 'Open Cabify' };
}

export function whooshDeepLink(_args: BuildArgs): DeepLink {
  return { url: 'https://whoosh.io/', label: 'Open Whoosh' };
}

export function limeDeepLink(_args: BuildArgs): DeepLink {
  return { url: 'https://www.li.me/', label: 'Open Lime' };
}

export function bikeItauDeepLink(_args: BuildArgs): DeepLink {
  return { url: 'https://www.bikeitau.cl/', label: 'Open Bike Itaú' };
}
