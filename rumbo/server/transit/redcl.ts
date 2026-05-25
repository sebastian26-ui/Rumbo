/**
 * Red.cl real-time bus predictor client.
 *
 * Santiago has no public GTFS-Realtime feed. The official partner channel
 * (datos-y-servicios) requires form approval and a registered static IP. Until
 * Rumbo obtains that, this module consumes the same JSON endpoint that powers
 * red.cl's own "¿Cuándo llega?" page. The endpoint is undocumented and not
 * formally public — treat every response defensively, cache aggressively, and
 * always allow callers to fall back to the static GTFS schedule.
 *
 * The endpoint requires a short-lived HS256 JWT that the page generates
 * server-side. We scrape it from the public planning page and refresh on
 * demand when a request comes back empty.
 */

const PAGE_URL = "https://www.red.cl/planifica-tu-viaje/cuando-llega/";
const PREDICTOR_URL = "https://www.red.cl/predictorPlus/prediccion";

const STOP_CACHE_TTL_MS = 25_000;
const JWT_REFRESH_MS = 4 * 60 * 1000; // proactively refresh well before expiry
const REQUEST_TIMEOUT_MS = 8_000;

// Circuit breaker: if N consecutive failures happen, stop hammering for a
// cooldown window. Callers see status "unavailable" and fall back to GTFS.
const BREAKER_FAILURE_THRESHOLD = 5;
const BREAKER_COOLDOWN_MS = 60_000;

const UA =
  "Rumbo/1.0 (https://github.com; Santiago mobility comparison; dev contact)";

export interface LiveArrival {
  /** Service code as Red reports it, e.g. "421", "506v". */
  service: string;
  /** Direction text from Red, e.g. "Peñalolén". */
  destination: string | null;
  /** Lower bound of ETA window in minutes. 0 = "less than X min" floor. */
  etaMinMinutes: number;
  /** Upper bound of ETA window in minutes, or null if open-ended ("Mas de X"). */
  etaMaxMinutes: number | null;
  /** Distance from stop in meters, when Red provides it. */
  distanceMeters: number | null;
  /** Original Spanish ETA string from Red (for tooltips / debugging). */
  rawEta: string;
  /** License plate when Red has identified the inbound vehicle. */
  vehiclePlate: string | null;
}

export type LiveArrivalStatus =
  /** Real GPS prediction available; arrivals[] populated. */
  | "live"
  /** Stop is valid but no GPS predictions right now (e.g. out of hours,
   *  schedule-only service, stop disabled). UI should fall back to GTFS. */
  | "no-predictions"
  /** Upstream rejected the request or returned malformed data. */
  | "unavailable";

export interface StopArrivalsResult {
  stopCode: string;
  status: LiveArrivalStatus;
  /** Always set; empty when status !== "live". */
  arrivals: LiveArrival[];
  /** ms since this response was generated upstream (or cached locally). */
  ageMs: number;
  /** When status !== "live", Red's human-readable reason if one was returned. */
  reason: string | null;
  /** True when served from the in-process cache rather than freshly fetched. */
  cached: boolean;
}

/* ------------------------------------------------------------------ *
 *  JWT cache                                                          *
 * ------------------------------------------------------------------ */

let cachedJwt: { token: string; fetchedAt: number } | null = null;
let inflightJwt: Promise<string | null> | null = null;

async function fetchJwt(): Promise<string | null> {
  const r = await fetch(PAGE_URL, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "es-CL,es;q=0.9",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!r.ok) return null;
  const html = await r.text();

  // The page bootstraps a PredictorPlusConfig object containing the JWT. The
  // exact assignment style has shifted across deploys, so prefer a labelled
  // match, but fall back to the first JWT-shaped token on the page.
  const labelled = html.match(
    /PredictorPlusConfig[\s\S]{0,400}?token['"]?\s*:\s*['"]([^'"\s]+)['"]/,
  );
  if (labelled?.[1] && looksLikeJwt(labelled[1])) return labelled[1];

  const generic = html.match(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/);
  return generic?.[0] ?? null;
}

function looksLikeJwt(s: string): boolean {
  return /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(s);
}

async function getJwt(forceRefresh = false): Promise<string | null> {
  const now = Date.now();
  if (
    !forceRefresh &&
    cachedJwt &&
    now - cachedJwt.fetchedAt < JWT_REFRESH_MS
  ) {
    return cachedJwt.token;
  }
  // Coalesce concurrent refreshes.
  if (inflightJwt) return inflightJwt;
  inflightJwt = fetchJwt()
    .then((token) => {
      if (token) cachedJwt = { token, fetchedAt: Date.now() };
      return token;
    })
    .catch(() => null)
    .finally(() => {
      inflightJwt = null;
    });
  return inflightJwt;
}

/* ------------------------------------------------------------------ *
 *  Circuit breaker                                                    *
 * ------------------------------------------------------------------ */

let consecutiveFailures = 0;
let breakerOpenedAt = 0;

function breakerOpen(): boolean {
  if (breakerOpenedAt === 0) return false;
  if (Date.now() - breakerOpenedAt > BREAKER_COOLDOWN_MS) {
    breakerOpenedAt = 0;
    consecutiveFailures = 0;
    return false;
  }
  return true;
}

function recordFailure() {
  consecutiveFailures += 1;
  if (consecutiveFailures >= BREAKER_FAILURE_THRESHOLD) {
    breakerOpenedAt = Date.now();
  }
}

function recordSuccess() {
  consecutiveFailures = 0;
  breakerOpenedAt = 0;
}

/* ------------------------------------------------------------------ *
 *  Stop arrivals cache                                                *
 * ------------------------------------------------------------------ */

interface CachedEntry {
  fetchedAt: number;
  result: StopArrivalsResult;
}
const stopCache = new Map<string, CachedEntry>();
const inflightStops = new Map<string, Promise<StopArrivalsResult>>();

function unavailable(stopCode: string, reason: string): StopArrivalsResult {
  return {
    stopCode,
    status: "unavailable",
    arrivals: [],
    ageMs: 0,
    reason,
    cached: false,
  };
}

/* ------------------------------------------------------------------ *
 *  Spanish ETA parser                                                 *
 * ------------------------------------------------------------------ */

/**
 * Red returns human strings, not numbers. Examples observed:
 *   "En menos de 2 min."
 *   "Entre 7 Y 11 min."
 *   "Mas de 33 min."
 *   "Llegando."          (occasionally)
 * Returns null when the string can't be confidently parsed — callers should
 * not surface unparseable strings as live ETAs.
 */
export function parseEtaSpanish(raw: string): {
  min: number;
  max: number | null;
} | null {
  if (!raw) return null;
  const s = raw.toLowerCase().replace(/\./g, "").trim();

  if (s.includes("llegando")) return { min: 0, max: 1 };

  // "Entre N y M min" (case-insensitive Y)
  const between = s.match(/entre\s+(\d+)\s*y\s*(\d+)\s*min/);
  if (between) {
    const a = parseInt(between[1], 10);
    const b = parseInt(between[2], 10);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      return { min: Math.min(a, b), max: Math.max(a, b) };
    }
  }

  // "En menos de N min"
  const less = s.match(/menos\s+de\s+(\d+)\s*min/);
  if (less) {
    const n = parseInt(less[1], 10);
    if (Number.isFinite(n)) return { min: 0, max: n };
  }

  // "Mas de N min" (with or without accent)
  const more = s.match(/m[aá]s\s+de\s+(\d+)\s*min/);
  if (more) {
    const n = parseInt(more[1], 10);
    if (Number.isFinite(n)) return { min: n, max: null };
  }

  return null;
}

/* ------------------------------------------------------------------ *
 *  Predictor response shape (only fields we use)                      *
 * ------------------------------------------------------------------ */

interface PredictorService {
  servicio?: string;
  destino?: string | null;
  codigorespuesta?: string;
  respuestaServicio?: string | null;
  itinerario?: boolean;
  horaprediccionbus1?: string | null;
  horaprediccionbus2?: string | null;
  distanciabus1?: string | null;
  distanciabus2?: string | null;
  ppubus1?: string | null;
  ppubus2?: string | null;
}

interface PredictorResponse {
  paradero?: string;
  respuestaParadero?: string | null;
  servicios?: { item?: PredictorService[] };
}

/* ------------------------------------------------------------------ *
 *  Public API                                                         *
 * ------------------------------------------------------------------ */

const STOP_CODE_PATTERN = /^P[A-J]\d{1,5}$/i;

export function isValidStopCode(s: string | null | undefined): s is string {
  return typeof s === "string" && STOP_CODE_PATTERN.test(s.trim());
}

/**
 * Fetch live predictions for a single bus stop ("paradero"). Always resolves
 * — never throws. Callers should branch on `status` and use the GTFS schedule
 * when it isn't "live".
 */
export async function getStopArrivals(
  rawStopCode: string,
): Promise<StopArrivalsResult> {
  const stopCode = (rawStopCode || "").trim().toUpperCase();
  if (!isValidStopCode(stopCode)) {
    return unavailable(stopCode, "invalid stop code");
  }

  // Cache hit?
  const cached = stopCache.get(stopCode);
  if (cached && Date.now() - cached.fetchedAt < STOP_CACHE_TTL_MS) {
    return {
      ...cached.result,
      ageMs: Date.now() - cached.fetchedAt,
      cached: true,
    };
  }

  if (breakerOpen()) {
    return unavailable(stopCode, "circuit-breaker open");
  }

  // Coalesce parallel requests for the same stop.
  const existing = inflightStops.get(stopCode);
  if (existing) return existing;

  const p = (async (): Promise<StopArrivalsResult> => {
    try {
      return await fetchStopArrivalsUncached(stopCode);
    } finally {
      inflightStops.delete(stopCode);
    }
  })();
  inflightStops.set(stopCode, p);
  return p;
}

async function fetchStopArrivalsUncached(
  stopCode: string,
): Promise<StopArrivalsResult> {
  const jwt = await getJwt();
  if (!jwt) {
    recordFailure();
    return unavailable(stopCode, "no JWT");
  }

  let result = await doPredictorFetch(stopCode, jwt);

  // If the upstream rejected the token, refresh once and retry — JWTs are
  // short-lived enough that this happens routinely under steady load.
  if (result.status === "unavailable" && result.reason === "auth") {
    const fresh = await getJwt(true);
    if (fresh && fresh !== jwt) {
      result = await doPredictorFetch(stopCode, fresh);
    }
  }

  if (result.status === "unavailable") {
    recordFailure();
  } else {
    recordSuccess();
    stopCache.set(stopCode, { fetchedAt: Date.now(), result });
  }
  return result;
}

async function doPredictorFetch(
  stopCode: string,
  jwt: string,
): Promise<StopArrivalsResult> {
  const params = new URLSearchParams({ t: jwt, codsimt: stopCode, codser: "" });
  const url = `${PREDICTOR_URL}?${params.toString()}`;

  let body: PredictorResponse | null = null;
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        Referer: "https://www.red.cl/planifica-tu-viaje/cuando-llega/",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (r.status === 401 || r.status === 403) {
      return unavailable(stopCode, "auth");
    }
    if (!r.ok) {
      return unavailable(stopCode, `upstream ${r.status}`);
    }
    const text = await r.text();
    if (!text || text.trim().toLowerCase() === "null") {
      return unavailable(stopCode, "auth"); // empty body usually means stale JWT
    }
    body = JSON.parse(text) as PredictorResponse;
  } catch (e) {
    return unavailable(stopCode, e instanceof Error ? e.message : "fetch failed");
  }

  if (!body || typeof body !== "object") {
    return unavailable(stopCode, "malformed response");
  }

  const paraderoReason = body.respuestaParadero?.trim() || null;
  if (
    paraderoReason &&
    /fuera de l[ií]nea|inhabilitad/i.test(paraderoReason)
  ) {
    return {
      stopCode,
      status: "no-predictions",
      arrivals: [],
      ageMs: 0,
      reason: paraderoReason,
      cached: false,
    };
  }

  const items = body.servicios?.item ?? [];
  const arrivals: LiveArrival[] = [];

  for (const svc of items) {
    if (!svc.servicio) continue;
    // Schedule-only entries are NOT live predictions — skip.
    if (svc.itinerario === true) continue;

    // Only response codes 00 (live) and 01 (degraded but with prediction) carry
    // a real ETA. Anything else is a "no buses inbound" / "out of service" /
    // "disabled stop" status — exclude from the live list.
    const code = (svc.codigorespuesta || "").trim();
    if (code !== "00" && code !== "01") continue;

    pushArrival(arrivals, svc.servicio, svc.destino ?? null, svc.horaprediccionbus1, svc.distanciabus1, svc.ppubus1);
    pushArrival(arrivals, svc.servicio, svc.destino ?? null, svc.horaprediccionbus2, svc.distanciabus2, svc.ppubus2);
  }

  if (arrivals.length === 0) {
    return {
      stopCode,
      status: "no-predictions",
      arrivals: [],
      ageMs: 0,
      reason: paraderoReason,
      cached: false,
    };
  }

  // Sort by lower ETA bound so the soonest arrival comes first.
  arrivals.sort((a, b) => a.etaMinMinutes - b.etaMinMinutes);

  return {
    stopCode,
    status: "live",
    arrivals,
    ageMs: 0,
    reason: paraderoReason,
    cached: false,
  };
}

function pushArrival(
  out: LiveArrival[],
  service: string,
  destination: string | null,
  rawEta: string | null | undefined,
  distance: string | null | undefined,
  plate: string | null | undefined,
) {
  if (!rawEta) return;
  const parsed = parseEtaSpanish(rawEta);
  if (!parsed) return;
  const distMeters = distance ? Number.parseInt(distance, 10) : NaN;
  out.push({
    service,
    destination,
    etaMinMinutes: parsed.min,
    etaMaxMinutes: parsed.max,
    distanceMeters: Number.isFinite(distMeters) ? distMeters : null,
    rawEta: rawEta.trim(),
    vehiclePlate: plate?.trim() || null,
  });
}
