/**
 * Comuna-level reported-incident context for a route.
 *
 * The only honest, citable Chilean crime data available to an independent
 * developer is comuna-level ANNUAL statistics from CEAD (Subsecretaría de
 * Prevención del Delito). No real-time, no street-level, no hourly data.
 *
 * This module deliberately does NOT lead with raw rates. A rate per 100.000
 * residents is meaningless to a user deciding whether to take a bus, and it
 * actively misleads for commercial comunas whose denominator excludes the
 * daytime population they actually serve. Instead we expose:
 *   - the dominant *kind* of incident (CEAD categories — real data), and
 *   - a profile (violent / opportunistic / mixed) that drives plain advice.
 * The numeric rate survives only inside the methodology disclosure.
 *
 * Floating-population comunas are capped so a denominator artifact can't
 * headline a route as alarming; violent-profile comunas are floored so a
 * moderate *rate* can't hide a violent *pattern*. Both adjustments are
 * presentation-only and disclosed — the official figure is never altered.
 */
import riskData from '../data/comunaRisk.json';
import boundaries from '../data/comunaBoundaries.json';

/** Underlying rate tier (kept for the methodology table only). */
export type RiskTier = 'low' | 'moderate' | 'elevated' | 'high';
/** What the UI shows: an attention level, not a "risk score". */
export type AttentionLevel = 'low' | 'moderate' | 'elevated' | 'high' | 'nodata';
export type CrimeProfile = 'violent' | 'opportunistic' | 'mixed';

export interface ComunaRisk {
  cut: number;
  comuna: string;
  ratePer100k: number;
  tier: RiskTier;
  profile: CrimeProfile;
  floatingPopulation: boolean;
  topCategories: { cat: string; pct: number }[];
  categoryCounts: Record<string, number>;
}

export interface ComunaOnRoute {
  cut: number;
  comuna: string;
  /** null when the comuna is crossed but has no figure in the dataset. */
  risk: ComunaRisk | null;
  /** Presentation level after floating-pop cap / violent floor. */
  level: AttentionLevel;
  /** Short plain-language incident type, e.g. "principalmente hurtos". */
  typeLabel: string;
  /** Inline (not fine-print) note when the figure is distorted. */
  note: string | null;
}

export interface RouteRisk {
  /** Worst presentation level along the route. */
  overall: AttentionLevel;
  /** Dominant pattern across the route, drives the advice line. */
  profile: CrimeProfile | null;
  /** One-line, neutral description of what's most reported on this route. */
  summary: string;
  /** Concrete behavioural tip tied to the dominant profile. */
  tip: string | null;
  comunas: ComunaOnRoute[];
}

interface RiskMeta {
  source: string;
  sourceUrl: string;
  indicator: string;
  methodology: string;
  period: string;
  updateCadence: string;
  geographicLevel: string;
  lastBuilt: string;
  tierThresholdsPer100k: Record<string, string>;
  tierBasis: string;
  profileBasis: string;
  floatingPopulationFlag: string;
  caveats: string[];
}

const RISK: Record<string, ComunaRisk> = riskData.comunas as Record<string, ComunaRisk>;
export const RISK_META = riskData._meta as unknown as RiskMeta;

// ---- plain-language crime vocabulary (honest: crime type, not stolen object)

/** Full description for prose. CEAD classifies by legal crime type, not by
 *  object; the parentheticals describe the typical modus, not a statistic. */
const CAT_LONG: Record<string, string> = {
  Hurtos: 'hurto (sustracción sin violencia)',
  'Robo por sorpresa': 'robo por sorpresa (arrebato de celular o cartera)',
  'Robo de objetos de o desde vehículo': 'robo de accesorios desde vehículos',
  'Robos con violencia o intimidación': 'robo con violencia o intimidación',
  'Robo violento de vehículo motorizado': 'robo violento de vehículo (encerrón)',
  'Robo de vehículo motorizado': 'robo de vehículo',
  'Robo en lugar habitado': 'robo en domicilio',
  'Robos en lugar no habitado': 'robo en recinto no habitado',
  'Otros robos con fuerza en las cosas': 'robo con fuerza',
  'Lesiones leves': 'lesiones leves',
  'Lesiones menos graves': 'lesiones',
  'Lesiones graves o gravísimas': 'lesiones graves',
  Homicidios: 'homicidio',
  Violaciones: 'delitos sexuales',
};
/** Compact form for the per-comuna line. */
const CAT_SHORT: Record<string, string> = {
  Hurtos: 'hurtos',
  'Robo por sorpresa': 'robo por sorpresa',
  'Robo de objetos de o desde vehículo': 'robo desde vehículos',
  'Robos con violencia o intimidación': 'robo con violencia',
  'Robo violento de vehículo motorizado': 'robo de vehículo con violencia',
  'Robo de vehículo motorizado': 'robo de vehículo',
  'Robo en lugar habitado': 'robo en domicilio',
  'Robos en lugar no habitado': 'robo en recinto',
  'Otros robos con fuerza en las cosas': 'robo con fuerza',
  'Lesiones leves': 'lesiones leves',
  'Lesiones menos graves': 'lesiones',
  'Lesiones graves o gravísimas': 'lesiones graves',
  Homicidios: 'homicidio',
  Violaciones: 'delitos sexuales',
};
function catLong(c: string): string {
  return CAT_LONG[c] ?? c.toLowerCase();
}
function catShort(c: string): string {
  return CAT_SHORT[c] ?? c.toLowerCase();
}

export const LEVEL_LABEL: Record<AttentionLevel, string> = {
  low: 'Tranquilo',
  moderate: 'Normal',
  elevated: 'Mantén atención',
  high: 'Más atención',
  nodata: 'Sin datos',
};
/** Shorter form for the compact card pill. */
export const LEVEL_SHORT: Record<AttentionLevel, string> = {
  low: 'Tranquilo',
  moderate: 'Normal',
  elevated: 'Atención',
  high: 'Más atención',
  nodata: 'Sin datos',
};

const PROFILE_TIP: Record<CrimeProfile, string> = {
  opportunistic:
    'Lleva el celular guardado, evita usarlo en la vereda y mantén bolsos cerrados y por delante.',
  violent:
    'Predomina el robo con violencia. Evita exhibir objetos de valor, prefiere calles concurridas e iluminadas y mantente atento al subir o bajar del transporte.',
  mixed:
    'Cuida tus pertenencias (celular guardado, bolsos por delante) y prefiere zonas concurridas e iluminadas.',
};

const RANK: Record<RiskTier, number> = { low: 0, moderate: 1, elevated: 2, high: 3 };
const ORDER: AttentionLevel[] = ['low', 'moderate', 'elevated', 'high'];

/**
 * Presentation level for one comuna. Two disclosed, presentation-only
 * adjustments: a floating-population comuna's rate is a known over-estimate
 * for someone passing through, so it can't exceed "moderate"; a
 * violent-profile comuna can't read below "elevated" even if its per-resident
 * rate is moderate, so a violent pattern is never hidden by a low denominator.
 */
function levelFor(r: ComunaRisk): AttentionLevel {
  let idx = RANK[r.tier];
  if (r.floatingPopulation) idx = Math.min(idx, RANK.moderate);
  if (r.profile === 'violent') idx = Math.max(idx, RANK.elevated);
  return ORDER[idx];
}

function noteFor(r: ComunaRisk): string | null {
  if (r.floatingPopulation) {
    return 'Cifra influida por población flotante: muchos incidentes afectan a visitantes y no a residentes, así que la tasa sobreestima el riesgo de paso.';
  }
  return null;
}

function typeLabelFor(r: ComunaRisk): string {
  const top = r.topCategories[0];
  if (!top) return 'sin patrón destacado';
  return `principalmente ${catShort(top.cat)}`;
}

// ---- geometry (comuna polygons; route polyline is far finer, so we sample)

type Ring = [number, number][];
interface PolyGeom {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: Ring[] | Ring[][];
}
interface BoundaryFeature {
  properties: { cut: number; comuna: string };
  geometry: PolyGeom;
}
const FEATURES = (boundaries as unknown as { features: BoundaryFeature[] }).features;

const RM_LNG: [number, number] = [-71.8, -69.8];
const RM_LAT: [number, number] = [-34.4, -32.9];

function asLngLat(a: number, b: number): [number, number] | null {
  const inRM = (lng: number, lat: number) =>
    lng >= RM_LNG[0] && lng <= RM_LNG[1] && lat >= RM_LAT[0] && lat <= RM_LAT[1];
  if (inRM(a, b)) return [a, b];
  if (inRM(b, a)) return [b, a];
  return null;
}

function pointInRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInFeature(lng: number, lat: number, f: BoundaryFeature): boolean {
  const g = f.geometry;
  const polys = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates) as Ring[][];
  for (const poly of polys) {
    if (poly.length === 0) continue;
    if (!pointInRing(lng, lat, poly[0])) continue;
    let inHole = false;
    for (let h = 1; h < poly.length; h++) {
      if (pointInRing(lng, lat, poly[h])) {
        inHole = true;
        break;
      }
    }
    if (!inHole) return true;
  }
  return false;
}

function comunaAt(lng: number, lat: number): BoundaryFeature | null {
  for (const f of FEATURES) if (pointInFeature(lng, lat, f)) return f;
  return null;
}

export function riskForRoute(
  coordinates: [number, number][] | null | undefined,
): RouteRisk {
  const empty: RouteRisk = {
    overall: 'nodata',
    profile: null,
    summary:
      'No hay estadísticas comunales para los tramos de esta ruta. No se infiere ni se muestra un nivel.',
    tip: null,
    comunas: [],
  };
  if (!coordinates || coordinates.length === 0) return empty;

  const step = Math.max(1, Math.floor(coordinates.length / 150));
  const ordered: ComunaOnRoute[] = [];
  let lastCut: number | null = null;

  const visit = (lng: number, lat: number) => {
    const f = comunaAt(lng, lat);
    if (!f) return;
    if (f.properties.cut === lastCut) return;
    lastCut = f.properties.cut;
    if (ordered.some((c) => c.cut === f.properties.cut)) return;
    const risk = RISK[String(f.properties.cut)] ?? null;
    ordered.push({
      cut: f.properties.cut,
      comuna: f.properties.comuna,
      risk,
      level: risk ? levelFor(risk) : 'nodata',
      typeLabel: risk ? typeLabelFor(risk) : 'sin datos',
      note: risk ? noteFor(risk) : null,
    });
  };

  for (let i = 0; i < coordinates.length; i += step) {
    const p = asLngLat(coordinates[i][0], coordinates[i][1]);
    if (p) visit(p[0], p[1]);
  }
  const end = coordinates[coordinates.length - 1];
  const endPair = asLngLat(end[0], end[1]);
  if (endPair) visit(endPair[0], endPair[1]);

  const known = ordered.filter((c) => c.risk);
  if (known.length === 0) return { ...empty, comunas: ordered };

  // Worst presentation level along the route.
  let overall: AttentionLevel = 'low';
  for (const c of known) {
    if (ORDER.indexOf(c.level as RiskTier) > ORDER.indexOf(overall as RiskTier)) {
      overall = c.level;
    }
  }

  // Dominant profile = the one with the most aggregated DMCS cases.
  const totals: Record<CrimeProfile, number> = {
    violent: 0,
    opportunistic: 0,
    mixed: 0,
  };
  const catAgg: Record<string, number> = {};
  for (const c of known) {
    const r = c.risk!;
    const sum = Object.values(r.categoryCounts).reduce((a, b) => a + b, 0);
    totals[r.profile] += sum;
    for (const [cat, n] of Object.entries(r.categoryCounts)) {
      catAgg[cat] = (catAgg[cat] ?? 0) + n;
    }
  }
  const profile = (Object.entries(totals).sort((a, b) => b[1] - a[1])[0][0] ||
    'mixed') as CrimeProfile;

  const topRoute = Object.entries(catAgg)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([cat]) => cat);
  const anyFloating = known.some((c) => c.risk!.floatingPopulation);
  const zone = anyFloating
    ? 'comunas céntricas y de alta actividad comercial'
    : profile === 'violent'
      ? 'comunas mayormente residenciales'
      : 'comunas de actividad mixta';
  const cats =
    topRoute.length === 2
      ? `${catLong(topRoute[0])} y ${catLong(topRoute[1])}`
      : catLong(topRoute[0]);
  const summary = `Ruta por ${zone}. Lo más reportado aquí es ${cats}.`;

  return { overall, profile, summary, tip: PROFILE_TIP[profile], comunas: ordered };
}
