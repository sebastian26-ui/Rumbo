/**
 * Trip personalization engine — pure, client-side, zero new API calls.
 *
 * Rumbo's comparison view is four mode rows (carpool / walk / transit / bike),
 * not a list of itineraries. This module takes the already-fetched route data
 * + the user's active preference modes and decides, per row:
 *   - hidden? (a hard filter — kept visible but disabled, with a reason)
 *   - re-rank order (re-ranking modes; conflicts are surfaced, not resolved)
 *   - badges (♿ / 🌱) and the "¿Por qué veo esto?" explanation
 * It also reorders the ride-hail / scooter sub-list and emits the proxy-data
 * labels so the UI can stay honest about incomplete data.
 */
import type {
  AllRoutesResult,
  SingleMode,
  TransitRouteResult,
  TransitLegData,
  ProviderEstimate,
} from '../types';
import type { PreferenceModeId } from './preferences';
import { PREFERENCE_BY_ID } from './preferences';
import { providersForMode, ProviderId } from './providers';
import { estimateFare } from './fares';
import { riskForRoute } from './safety';
import {
  metroStopAccess,
  METRO_ACCESSIBILITY_LABEL,
} from '../data/metroAccessibility';

function minutesOfDayInSantiago(date: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santiago',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  let hour = parseInt(get('hour'), 10);
  const minute = parseInt(get('minute'), 10);
  if (hour === 24) hour = 0;
  return hour * 60 + minute;
}

// ---------------------------------------------------------------------------
// CO₂ — generic per-passenger-km emission factors (kg). ESTIMATE, labeled.
// ---------------------------------------------------------------------------
const CO2_KG_PER_KM = {
  car: 0.17, // private car / ride-hail, single occupant
  busDiesel: 0.08,
  metro: 0.03, // electric, Chilean grid
  walkBike: 0,
} as const;

export const CO2_ESTIMATE_LABEL =
  'Estimación de CO₂ con factores de emisión generales por kilómetro.';
export const HEARING_LABEL =
  'Basado en información general de las rutas. No refleja el equipamiento de cada parada.';
export const VISUAL_LABEL =
  'Estimación según número de transbordos y cambios de línea, no datos de señalética.';
export const SHELTER_LABEL =
  'Información de refugios en paraderos no disponible; estimación general.';
export const LOW_FLOOR_LABEL =
  'Micros: piso bajo según información general de Red Movilidad — no ' +
  'garantizado en cada recorrido.';

/** Threshold helpers. */
const LONG_WALK_SEGMENT_M = 200; // movilidad reducida
const KIDS_LUGGAGE_WALK_M = 500; // niños / equipaje
const MAX_WALK_SECONDS = 600; // "más de 10 min a pie"
const SLOW_FACTOR = 1.5; // fastest: hide > 1.5× fastest
/** Night window in Chile-local time: 22:00 → 05:00. */
const NIGHT_START_MIN = 22 * 60;
const NIGHT_END_MIN = 5 * 60;

export const MODE_LABEL_ES: Record<SingleMode, string> = {
  carpool: 'Uber/Cabify',
  walk: 'Caminar',
  transit: 'Metro/Micro',
  bike: 'Bici',
};

// ---------------------------------------------------------------------------
// Normalized trip option (one per mode row)
// ---------------------------------------------------------------------------
export interface TripOption {
  mode: SingleMode;
  available: boolean;
  durationSeconds: number | null;
  distanceMeters: number | null;
  coordinates: [number, number][] | null;
  // transit-derived (0 / false for non-transit)
  transfers: number;
  maxWalkLegMeters: number;
  totalWalkSeconds: number;
  usesMetro: boolean;
  /** All Metro stops on the route are documented step-free. null = no Metro. */
  metroConfirmedAccessible: boolean | null;
  priceCLP: number | null;
  co2Kg: number | null;
}

export interface DecoratedOption extends TripOption {
  hidden: boolean;
  hiddenReason: string | null;
  badges: string[];
  /** Plain-language list for the "¿Por qué veo esto?" sheet. */
  affectedBy: { modeId: PreferenceModeId; effect: string }[];
}

export interface FilterContext {
  enabledProviders: Set<ProviderId>;
  now?: Date;
}

export interface FilterResult {
  options: DecoratedOption[]; // display order: visible (ranked) then hidden
  nightModeActive: boolean;
  conflictNote: string | null;
  fallbackBanner: boolean;
  /** Proxy / honesty labels to render under the comparison. */
  proxyNotes: string[];
}

// ---------------------------------------------------------------------------
// Building TripOptions from the fetched data
// ---------------------------------------------------------------------------
function transitMetrics(r: TransitRouteResult) {
  const transitLegs = r.legs.filter(
    (l): l is TransitLegData => l.kind === 'transit',
  );
  const walkLegs = r.legs.filter((l) => l.kind === 'walk');
  const transfers = Math.max(0, transitLegs.length - 1);
  const maxWalkLegMeters = walkLegs.reduce(
    (m, l) => Math.max(m, l.distanceMeters || 0),
    0,
  );
  const totalWalkSeconds = walkLegs.reduce(
    (s, l) => s + (l.durationSeconds || 0),
    0,
  );
  const metroLegs = transitLegs.filter((l) => l.vehicleType === 'SUBWAY');
  const usesMetro = metroLegs.length > 0;

  let metroConfirmedAccessible: boolean | null = usesMetro ? true : null;
  if (usesMetro) {
    for (const leg of metroLegs) {
      const dep = metroStopAccess(leg.departureStop, leg.lineShortName);
      const arr = metroStopAccess(leg.arrivalStop, leg.lineShortName);
      if (dep !== 'accessible' || arr !== 'accessible') {
        metroConfirmedAccessible = false;
        break;
      }
    }
  }

  // CO₂: metro legs electric, bus legs diesel, walk legs zero.
  let co2Kg = 0;
  for (const leg of transitLegs) {
    const km = (leg.distanceMeters || 0) / 1000;
    co2Kg +=
      leg.vehicleType === 'SUBWAY'
        ? km * CO2_KG_PER_KM.metro
        : km * CO2_KG_PER_KM.busDiesel;
  }

  return {
    transfers,
    maxWalkLegMeters,
    totalWalkSeconds,
    usesMetro,
    metroConfirmedAccessible,
    co2Kg: r.available ? co2Kg : null,
    fareCLP:
      r.fare && r.fare.currency === 'CLP' ? Math.round(r.fare.value) : null,
  };
}

/** Cheapest enabled rideshare/scooter fare for a road path (CLP low bound). */
function cheapestProviderCLP(
  mode: SingleMode,
  distanceMeters: number,
  durationSeconds: number,
  enabled: Set<ProviderId>,
): number | null {
  const candidates = providersForMode(mode, enabled);
  let best: number | null = null;
  for (const p of candidates) {
    let low: number;
    if (p.tariff) {
      low = estimateFare(p.tariff, distanceMeters, durationSeconds).low;
    } else if (p.id === 'bike_itau') {
      low = 0; // free under 45 min with a day pass
    } else {
      continue;
    }
    if (best == null || low < best) best = low;
  }
  return best;
}

export function buildTripOptions(
  all: AllRoutesResult,
  ctx: FilterContext,
): TripOption[] {
  const order: SingleMode[] = ['carpool', 'walk', 'transit', 'bike'];
  return order.map<TripOption>((mode) => {
    const o = all[mode];
    if (o.kind === 'error') {
      return {
        mode,
        available: false,
        durationSeconds: null,
        distanceMeters: null,
        coordinates: null,
        transfers: 0,
        maxWalkLegMeters: 0,
        totalWalkSeconds: 0,
        usesMetro: false,
        metroConfirmedAccessible: null,
        priceCLP: null,
        co2Kg: null,
      };
    }
    if (o.kind === 'transit') {
      const r = o.result;
      const m = transitMetrics(r);
      const coords = r.legs.flatMap((l) => l.coordinates ?? []);
      return {
        mode,
        available: r.available,
        durationSeconds: r.totalDurationSeconds,
        distanceMeters:
          r.legs.reduce((a, l) => a + (l.distanceMeters || 0), 0) || null,
        coordinates: coords.length ? coords : null,
        transfers: m.transfers,
        maxWalkLegMeters: m.maxWalkLegMeters,
        totalWalkSeconds: m.totalWalkSeconds,
        usesMetro: m.usesMetro,
        metroConfirmedAccessible: m.metroConfirmedAccessible,
        priceCLP: r.available ? (m.fareCLP ?? null) : null,
        co2Kg: m.co2Kg,
      };
    }
    // carpool / walk / bike — single road path
    const dist = o.primary.distanceMeters;
    const dur = o.primary.durationSeconds;
    const km = dist / 1000;
    let priceCLP: number | null;
    let co2Kg: number | null;
    if (mode === 'walk') {
      priceCLP = 0;
      co2Kg = 0;
    } else if (mode === 'bike') {
      priceCLP = cheapestProviderCLP('bike', dist, dur, ctx.enabledProviders);
      co2Kg = 0;
    } else {
      priceCLP = cheapestProviderCLP(
        'carpool',
        dist,
        dur,
        ctx.enabledProviders,
      );
      co2Kg = km * CO2_KG_PER_KM.car;
    }
    return {
      mode,
      available: true,
      durationSeconds: dur,
      distanceMeters: dist,
      coordinates: o.primary.coordinates ?? null,
      transfers: 0,
      maxWalkLegMeters: 0,
      totalWalkSeconds: 0,
      usesMetro: false,
      metroConfirmedAccessible: null,
      priceCLP,
      co2Kg,
    };
  });
}

// ---------------------------------------------------------------------------
// Night-mode auto-activation
// ---------------------------------------------------------------------------
export function isNightInSantiago(now: Date = new Date()): boolean {
  const minutesOfDay = minutesOfDayInSantiago(now);
  return minutesOfDay >= NIGHT_START_MIN || minutesOfDay < NIGHT_END_MIN;
}

/**
 * Final active set = saved modes, plus session add/removes, plus
 * `safer_at_night` auto-added when it's night — unless the user explicitly
 * dismissed the auto-night this session.
 */
export function resolveActiveModes(opts: {
  saved: PreferenceModeId[];
  sessionAdds?: PreferenceModeId[];
  sessionRemoves?: PreferenceModeId[];
  nightAutoDismissed?: boolean;
  now?: Date;
}): { active: PreferenceModeId[]; nightAutoActivated: boolean } {
  const set = new Set<PreferenceModeId>(opts.saved);
  for (const a of opts.sessionAdds ?? []) set.add(a);
  for (const r of opts.sessionRemoves ?? []) set.delete(r);

  let nightAutoActivated = false;
  if (
    isNightInSantiago(opts.now ?? new Date()) &&
    !set.has('safer_at_night') &&
    !opts.nightAutoDismissed
  ) {
    set.add('safer_at_night');
    nightAutoActivated = true;
  }
  return { active: Array.from(set), nightAutoActivated };
}

// ---------------------------------------------------------------------------
// The filter / rank pass
// ---------------------------------------------------------------------------
const RANKING_MODES: PreferenceModeId[] = [
  'fastest',
  'cheapest',
  'sustainable',
  'visual_impairment',
  'hearing_impairment',
  'traveling_with_kids',
];

function rankDimension(mode: PreferenceModeId, o: TripOption): number {
  switch (mode) {
    case 'fastest':
      return o.durationSeconds ?? Infinity;
    case 'cheapest':
      return o.priceCLP ?? Infinity;
    case 'sustainable':
      return o.co2Kg ?? Infinity;
    case 'visual_impairment':
    case 'hearing_impairment':
    case 'traveling_with_kids':
      // fewer transfers first, then duration
      return o.transfers * 1e6 + (o.durationSeconds ?? 1e5);
    default:
      return o.durationSeconds ?? Infinity;
  }
}

export function applyPreferences(
  all: AllRoutesResult | null,
  activeModes: PreferenceModeId[],
  ctx: FilterContext,
): FilterResult | null {
  if (!all) return null;
  const now = ctx.now ?? new Date();
  const active = new Set(activeModes);
  const isNight = isNightInSantiago(now);
  const nightModeActive = active.has('safer_at_night') && isNight;

  const base = buildTripOptions(all, ctx);

  // Per-route risk level (existing CEAD comuna data) for night safety.
  const riskLevelByMode = new Map<SingleMode, string>();
  for (const o of base) {
    if (o.coordinates) {
      riskLevelByMode.set(o.mode, riskForRoute(o.coordinates).overall);
    }
  }

  const decorated: DecoratedOption[] = base.map((o) => ({
    ...o,
    hidden: false,
    hiddenReason: null,
    badges: [],
    affectedBy: [],
  }));

  const hide = (
    d: DecoratedOption,
    modeId: PreferenceModeId,
    reason: string,
  ) => {
    if (!d.hidden) {
      d.hidden = true;
      d.hiddenReason = reason;
    }
    d.affectedBy.push({ modeId, effect: `Oculto: ${reason}` });
  };
  const note = (
    d: DecoratedOption,
    modeId: PreferenceModeId,
    effect: string,
  ) => {
    d.affectedBy.push({ modeId, effect });
  };

  // ---- Hard filters + badges (one pass over the four rows)
  for (const d of decorated) {
    if (!d.available) continue;

    // 1. Movilidad reducida
    if (active.has('mobility_reduced')) {
      if (d.mode === 'bike') {
        hide(d, 'mobility_reduced', 'No compatible con movilidad reducida');
      } else if (d.mode === 'walk' && (d.distanceMeters ?? 0) > LONG_WALK_SEGMENT_M) {
        hide(d, 'mobility_reduced', 'Caminata mayor a 200 m');
      } else if (d.mode === 'transit') {
        if (d.transfers > 1) {
          hide(d, 'mobility_reduced', 'Más de un transbordo');
        } else if (d.maxWalkLegMeters > LONG_WALK_SEGMENT_M) {
          hide(d, 'mobility_reduced', 'Tramo a pie mayor a 200 m');
        }
      }
      if (!d.hidden && (d.mode === 'transit' || d.mode === 'carpool')) {
        const metroOk =
          d.metroConfirmedAccessible === null ||
          d.metroConfirmedAccessible === true;
        if (d.mode === 'carpool' || metroOk) {
          d.badges.push('♿');
          note(
            d,
            'mobility_reduced',
            d.mode === 'carpool'
              ? 'Puerta a puerta, sin escaleras'
              : 'Ruta accesible según datos disponibles',
          );
        }
      }
    }

    // 7. Evitar transbordos
    if (
      active.has('avoid_transfers') &&
      d.mode === 'transit' &&
      d.transfers > 1
    ) {
      hide(d, 'avoid_transfers', 'Más de un transbordo');
    }

    // 8. Prefiero caminar poco
    if (active.has('minimal_walking')) {
      if (d.mode === 'walk' && (d.durationSeconds ?? 0) > MAX_WALK_SECONDS) {
        hide(d, 'minimal_walking', 'Más de 10 min a pie');
      } else if (
        d.mode === 'transit' &&
        d.totalWalkSeconds > MAX_WALK_SECONDS
      ) {
        hide(d, 'minimal_walking', 'Más de 10 min a pie');
      }
    }

    // 10. Viajando con niños — hide long walking segments
    if (active.has('traveling_with_kids')) {
      if (d.mode === 'walk' && (d.distanceMeters ?? 0) > KIDS_LUGGAGE_WALK_M) {
        hide(d, 'traveling_with_kids', 'Tramo a pie mayor a 500 m');
      } else if (
        d.mode === 'transit' &&
        d.maxWalkLegMeters > KIDS_LUGGAGE_WALK_M
      ) {
        hide(d, 'traveling_with_kids', 'Tramo a pie mayor a 500 m');
      }
    }

    // 11. Tengo equipaje pesado
    if (active.has('heavy_luggage')) {
      if (d.mode === 'bike') {
        hide(d, 'heavy_luggage', 'No apto con equipaje pesado');
      } else if (
        d.mode === 'walk' &&
        (d.distanceMeters ?? 0) > KIDS_LUGGAGE_WALK_M
      ) {
        hide(d, 'heavy_luggage', 'Tramo a pie mayor a 500 m');
      } else if (
        d.mode === 'transit' &&
        d.maxWalkLegMeters > KIDS_LUGGAGE_WALK_M
      ) {
        hide(d, 'heavy_luggage', 'Tramo a pie mayor a 500 m');
      }
    }

    // 9. Más seguro de noche — boost car over risky walk/transit (handled in
    // ranking); annotate the affected rows here for the "why" sheet.
    if (nightModeActive && (d.mode === 'walk' || d.mode === 'transit')) {
      const lvl = riskLevelByMode.get(d.mode);
      if (lvl === 'elevated' || lvl === 'high') {
        note(
          d,
          'safer_at_night',
          'Noche y comuna con más incidentes — se prioriza Uber/Cabify',
        );
      }
    }
  }

  // 4. Lo más rápido — hide options slower than 1.5× the fastest visible.
  if (active.has('fastest')) {
    const fastest = Math.min(
      ...decorated
        .filter((d) => d.available && !d.hidden && d.durationSeconds != null)
        .map((d) => d.durationSeconds as number),
      Infinity,
    );
    if (Number.isFinite(fastest)) {
      for (const d of decorated) {
        if (
          d.available &&
          !d.hidden &&
          d.durationSeconds != null &&
          d.durationSeconds > fastest * SLOW_FACTOR
        ) {
          hide(d, 'fastest', 'Más de 1,5× la opción más rápida');
        }
      }
    }
  }

  // ---- Re-ranking (Borda merge of every active ranking mode + extras)
  const visible = decorated.filter((d) => d.available && !d.hidden);
  const activeRanking = RANKING_MODES.filter((m) => active.has(m));

  // 6. Sustentable badge — greenest visible option.
  if (active.has('sustainable')) {
    let greenest: DecoratedOption | null = null;
    for (const d of visible) {
      if (d.co2Kg == null) continue;
      if (!greenest || d.co2Kg < (greenest.co2Kg ?? Infinity)) greenest = d;
    }
    if (greenest) {
      greenest.badges.push('🌱');
      note(greenest, 'sustainable', 'Opción con menor huella de carbono');
    }
    for (const d of visible) {
      if (d.mode === 'carpool') {
        note(d, 'sustainable', 'Auto despriorizado por sustentabilidad');
      }
    }
  }

  let conflictNote: string | null = null;
  if (activeRanking.length > 0) {
    // Position of each option under each ranking mode.
    const score = new Map<SingleMode, number>();
    for (const m of activeRanking) {
      const ordered = [...visible].sort(
        (a, b) => rankDimension(m, a) - rankDimension(m, b),
      );
      ordered.forEach((d, i) => {
        score.set(d.mode, (score.get(d.mode) ?? 0) + i);
      });
    }
    visible.sort((a, b) => {
      const sa = score.get(a.mode) ?? 0;
      const sb = score.get(b.mode) ?? 0;
      if (sa !== sb) return sa - sb;
      return (a.durationSeconds ?? Infinity) - (b.durationSeconds ?? Infinity);
    });

    // Conflict: do the active ranking modes disagree on the #1 pick?
    const picks = new Map<PreferenceModeId, SingleMode>();
    for (const m of activeRanking) {
      const top = [...visible].sort(
        (a, b) => rankDimension(m, a) - rankDimension(m, b),
      )[0];
      if (top) picks.set(m, top.mode);
    }
    const distinct = Array.from(new Set(picks.values()));
    if (distinct.length > 1) {
      const parts: string[] = [];
      const used = new Set<SingleMode>();
      for (const [modeId, sm] of picks) {
        if (used.has(sm)) continue;
        used.add(sm);
        parts.push(
          `tu modo "${PREFERENCE_BY_ID[modeId].label}" sugiere ${MODE_LABEL_ES[sm]}`,
        );
        if (parts.length === 2) break;
      }
      conflictNote = parts.join(', ') + '.';
    }
  } else if (nightModeActive) {
    // No explicit ranking mode, but night safety reshuffles: car ahead of
    // risky walk/transit, otherwise keep the duration order.
    visible.sort((a, b) => {
      const risky = (m: SingleMode) => {
        const lvl = riskLevelByMode.get(m);
        return (m === 'walk' || m === 'transit') &&
          (lvl === 'elevated' || lvl === 'high')
          ? 1
          : 0;
      };
      const ra = risky(a.mode);
      const rb = risky(b.mode);
      if (ra !== rb) return ra - rb;
      return (a.durationSeconds ?? Infinity) - (b.durationSeconds ?? Infinity);
    });
  } else {
    visible.sort(
      (a, b) =>
        (a.durationSeconds ?? Infinity) - (b.durationSeconds ?? Infinity),
    );
  }

  // Night safety as a final stable boost when a ranking mode is also active:
  // pull car above a same-scored risky walk/transit without overriding the
  // user's primary ranking intent.
  if (nightModeActive && activeRanking.length > 0) {
    const carIdx = visible.findIndex((d) => d.mode === 'carpool');
    if (carIdx > 0) {
      const car = visible[carIdx];
      const firstRiskyIdx = visible.findIndex((d) => {
        const lvl = riskLevelByMode.get(d.mode);
        return (
          (d.mode === 'walk' || d.mode === 'transit') &&
          (lvl === 'elevated' || lvl === 'high')
        );
      });
      if (firstRiskyIdx >= 0 && firstRiskyIdx < carIdx) {
        visible.splice(carIdx, 1);
        visible.splice(firstRiskyIdx, 0, car);
      }
    }
  }

  const hidden = decorated.filter((d) => !d.available || d.hidden);
  hidden.sort(
    (a, b) =>
      (a.durationSeconds ?? Infinity) - (b.durationSeconds ?? Infinity),
  );

  // Fallback banner: at least one filter active and nothing survived.
  const anyFilterActive = activeModes.length > 0;
  const fallbackBanner =
    anyFilterActive && visible.filter((d) => d.available).length === 0;

  // ---- Proxy / honesty labels
  const proxyNotes: string[] = [];
  const anyTransitVisible = visible.some((d) => d.mode === 'transit');
  if (active.has('mobility_reduced')) {
    if (visible.some((d) => d.mode === 'transit' && d.usesMetro)) {
      proxyNotes.push(METRO_ACCESSIBILITY_LABEL);
    }
    proxyNotes.push(LOW_FLOOR_LABEL);
  }
  if (active.has('hearing_impairment') && anyTransitVisible) {
    proxyNotes.push(HEARING_LABEL);
  }
  if (active.has('visual_impairment') && anyTransitVisible) {
    proxyNotes.push(VISUAL_LABEL);
  }
  if (active.has('traveling_with_kids') && anyTransitVisible) {
    proxyNotes.push(SHELTER_LABEL);
  }
  if (active.has('sustainable')) proxyNotes.push(CO2_ESTIMATE_LABEL);

  return {
    options: [...visible, ...hidden],
    nightModeActive,
    conflictNote,
    fallbackBanner,
    proxyNotes: Array.from(new Set(proxyNotes)),
  };
}

// ---------------------------------------------------------------------------
// Ride-hail / scooter sub-list reordering (carpool & bike detail views)
// ---------------------------------------------------------------------------
const RIDESHARE_IDS = new Set<string>(['uber', 'cabify', 'didi']);

export interface ProviderPrefResult {
  estimates: ProviderEstimate[];
  /** Shown when modes hide providers, so the change stays transparent. */
  hiddenNote: string | null;
}

export function applyProviderPreferences(
  estimates: ProviderEstimate[],
  activeModes: PreferenceModeId[],
  ctx: { now?: Date } = {},
): ProviderPrefResult {
  if (estimates.length === 0) return { estimates, hiddenNote: null };
  const active = new Set(activeModes);
  let list = [...estimates];
  let hiddenNote: string | null = null;

  // 5. Lo más barato — hide Uber/Cabify unless within 20% of the cheapest.
  if (active.has('cheapest')) {
    const cheapest = Math.min(...list.map((e) => e.low));
    const kept = list.filter(
      (e) =>
        !(e.providerId === 'uber' || e.providerId === 'cabify') ||
        e.low <= cheapest * 1.2,
    );
    if (kept.length < list.length && kept.length > 0) {
      hiddenNote =
        'Uber/Cabify ocultos por "Lo más barato" (no están dentro del 20% de la opción más barata).';
      list = kept;
    }
    list.sort((a, b) => a.low - b.low);
  }

  const promoteRideshare =
    active.has('safer_at_night') ||
    active.has('mobility_reduced') ||
    active.has('minimal_walking') ||
    active.has('heavy_luggage');

  if (active.has('sustainable')) {
    // Cars to the bottom, micromobility up.
    list.sort((a, b) => {
      const ca = RIDESHARE_IDS.has(a.providerId) ? 1 : 0;
      const cb = RIDESHARE_IDS.has(b.providerId) ? 1 : 0;
      if (ca !== cb) return ca - cb;
      return a.low - b.low;
    });
  } else if (promoteRideshare) {
    list.sort((a, b) => {
      const ca = RIDESHARE_IDS.has(a.providerId) ? 0 : 1;
      const cb = RIDESHARE_IDS.has(b.providerId) ? 0 : 1;
      if (ca !== cb) return ca - cb;
      return a.low - b.low;
    });
  }

  return { estimates: list, hiddenNote };
}
