/**
 * Local fare estimator. Prices are computed from public Santiago tariffs and
 * the trip's distance + duration (which we already have from the routing
 * engine). These are ESTIMATES — never personalized — and the UI must
 * label them as such.
 *
 * Bip! transit fares (2026) confirmed against DTPM:
 *   https://www.dtpm.cl/index.php/tarjeta-bip/tarifas-vigentes-stpm
 *
 * Ride-hailing and micromobility tariffs are public defaults that should be
 * spot-checked against current in-app quotes before launch. Numbers reflect
 * 2024–2026 Chilean press coverage and operator pages; no operator publishes
 * a static per-km/per-min sheet, so these are calibrated approximations.
 */

export interface FareTariff {
  base: number;       // CLP fixed start fee
  perKm: number;      // CLP per kilometre
  perMin: number;     // CLP per minute in motion
  minFare: number;    // CLP minimum total
  /** Optional [low, high] surge multipliers. UI shows a low–high range. */
  surge?: [number, number];
}

export interface FareEstimate {
  low: number;
  high: number;
  currency: 'CLP';
}

const round = (n: number, step = 50) => Math.round(n / step) * step;

export function estimateFare(
  tariff: FareTariff,
  distanceMeters: number,
  durationSeconds: number,
): FareEstimate {
  const km = distanceMeters / 1000;
  const minutes = durationSeconds / 60;
  const raw = tariff.base + tariff.perKm * km + tariff.perMin * minutes;
  const subtotal = Math.max(raw, tariff.minFare);
  const [lo, hi] = tariff.surge ?? [1, 1];
  return {
    low: round(subtotal * lo),
    high: round(subtotal * hi),
    currency: 'CLP',
  };
}

export const RIDESHARE_TARIFFS: Record<'uber' | 'didi' | 'cabify', FareTariff> = {
  uber: { base: 600, perKm: 550, perMin: 90, minFare: 1500, surge: [1.0, 1.7] },
  didi: { base: 500, perKm: 500, perMin: 80, minFare: 1400, surge: [1.0, 1.5] },
  cabify: { base: 700, perKm: 600, perMin: 100, minFare: 1800, surge: [1.0, 1.4] },
};

export const SCOOTER_TARIFFS: Record<'whoosh' | 'lime', FareTariff> = {
  whoosh: { base: 700, perKm: 0, perMin: 180, minFare: 700 },
  lime: { base: 700, perKm: 0, perMin: 200, minFare: 700 },
};

/** Bike Itaú (Bike Santiago) is pass-based; per-trip 0–45 min is free with a
 *  pass. We model "estimated cost for this single trip" assuming the user has
 *  the daily pass amortized; for a one-off rider the day pass dominates. */
export const BIKE_ITAU_DAY_PASS_CLP = 2500;

/** DTPM 2026 fares — confirmed from dtpm.cl. */
export const BIP_FARES_CLP = {
  metroPeak: 895,
  metroOffPeak: 815,
  metroLow: 735,
  bus: 795,
} as const;
