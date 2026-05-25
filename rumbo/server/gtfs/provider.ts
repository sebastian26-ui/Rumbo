import type Database from "better-sqlite3";
import {
  LatLng,
  Leg,
  TransitError,
  TransitLeg,
  TransitProvider,
  TransitRouteResult,
  TransitVehicleType,
  WalkLeg,
} from "../transit/provider";
import { getRoutingProvider, RoutingError } from "../routing";
import { openGtfsDb, gtfsDbExists } from "./db";
import { haversineMeters, nearestStops } from "./spatial";
import { loadShape, sliceShapeBetweenStops } from "./shape";
import {
  ServiceWindow,
  activeServiceIds,
  feedTimezone,
  localServiceWindow,
} from "./calendar";
import { lookupBusFare } from "./fare";

/* ------------------------------------------------------------------ *
 *  Tunables                                                           *
 * ------------------------------------------------------------------ */

/** Walking speed for scoring (5 km/h ≈ 1.4 m/s). */
const WALK_SPEED_M_S = 1.4;
/** Max as-the-crow-flies distance from origin/destination to a paradero. */
const MAX_WALK_TO_STOP_M = 1200;
/** How many stops to consider on each end. */
const NEAREST_STOP_LIMIT = 8;
/** Don't board buses leaving more than this far in the future. */
const MAX_WAIT_SECONDS = 90 * 60;
/** Max walking distance allowed between alighting and boarding stops on a transfer. */
const MAX_TRANSFER_M = 600;
/** Minimum "settle in" buffer between alighting and the next departure. */
const MIN_TRANSFER_BUFFER_S = 60;
/** Penalty added per transfer when scoring (bias toward fewer legs). */
const TRANSFER_PENALTY_S = 180;
/** Hard cap on total trip duration ranking (also drops insanely long itineraries). */
const MAX_TOTAL_DURATION_S = 4 * 60 * 60;

/* ------------------------------------------------------------------ *
 *  Row & internal types                                               *
 * ------------------------------------------------------------------ */

interface ReachRow {
  trip_id: string;
  route_id: string;
  shape_id: string | null;
  trip_headsign: string | null;
  service_id: string;
  board_stop: string;
  board_seq: number;
  board_dep_template: number;
  alight_stop: string;
  alight_seq: number;
  alight_arr_template: number;
}

interface ResolvedLeg extends ReachRow {
  /** Real boarding-stop departure in seconds since today's local midnight. */
  dep_sec: number;
  /** Real alighting-stop arrival in seconds since today's local midnight. */
  arr_sec: number;
  fromFrequency: boolean;
}

interface StopInfo {
  lat: number;
  lon: number;
  name: string | null;
  code: string | null;
}

interface RouteInfo {
  route_short_name: string | null;
  route_long_name: string | null;
  route_color: string | null;
  route_text_color: string | null;
  route_type: number | null;
}

interface FrequencyRow {
  trip_id: string;
  start_seconds: number;
  end_seconds: number;
  headway_secs: number;
  exact_times: number | null;
}

interface DirectItinerary {
  kind: "direct";
  leg1: ResolvedLeg;
  walkToM: number;
  walkFromM: number;
  /** Total wall-clock seconds from "now". */
  totalSeconds: number;
  /** totalSeconds + transfer penalty (none here). */
  scoreSeconds: number;
}

interface TransferItinerary {
  kind: "transfer";
  leg1: ResolvedLeg;
  leg2: ResolvedLeg;
  /** Walking distance between leg1 alight and leg2 board in meters. */
  transferM: number;
  walkToM: number;
  walkFromM: number;
  totalSeconds: number;
  scoreSeconds: number;
}

type Itinerary = DirectItinerary | TransferItinerary;

/* ------------------------------------------------------------------ *
 *  Provider                                                           *
 * ------------------------------------------------------------------ */

export class GtfsTransitProvider implements TransitProvider {
  readonly name = "gtfs-dtpm";

  async fetchTransitRoute(
    origin: LatLng,
    destination: LatLng,
    opts: { departureTime?: Date } = {},
  ): Promise<TransitRouteResult> {
    const db = openGtfsDb();
    const now = opts.departureTime ?? resolveNow();
    const tz = feedTimezone(db);
    const window = localServiceWindow(now, tz);

    const services = activeServiceIds(db, window);
    if (services.size === 0) {
      return noResult(
        `No GTFS services active for ${window.yyyymmdd} (${window.weekday}). The feed may be stale — re-run \`npm run gtfs:ingest\`.`,
      );
    }

    const originStops = nearestStops(
      db,
      origin.lat,
      origin.lng,
      MAX_WALK_TO_STOP_M,
      NEAREST_STOP_LIMIT,
    );
    const destStops = nearestStops(
      db,
      destination.lat,
      destination.lng,
      MAX_WALK_TO_STOP_M,
      NEAREST_STOP_LIMIT,
    );

    if (!originStops.length || !destStops.length) {
      return noResult(
        "No paraderos within walking distance of one or both endpoints.",
      );
    }

    const originStopIds = new Set(originStops.map((s) => s.stop_id));
    const destStopIds = new Set(destStops.map((s) => s.stop_id));

    /* ----- Backward reach first (small, bounded by destStops) ----- */

    const backwardRows = queryReach(
      db,
      [...destStopIds],
      services,
      /* targetStops */ null,
      /* reverse */ true,
    );

    if (!backwardRows.length) {
      return noResult(
        "No buses arrive at any paradero near your destination on today's schedule.",
      );
    }

    /* ----- Build the transfer-reachable target set for the forward query.
            = destStops (for direct) ∪ backward.board_stops (for transfer)
            ∪ all stops within MAX_TRANSFER_M of any backward.board_stop
            (to allow walking between paraderos at a transfer point). */

    const transferAnchorIds = new Set<string>([...destStopIds]);
    for (const b of backwardRows) transferAnchorIds.add(b.board_stop);

    // Need coords for these anchor stops to expand the radius.
    const anchorCoords = new Map<string, StopInfo>();
    fillStopCoords(db, transferAnchorIds, anchorCoords);

    const expandedTargets = expandStopsByRadius(
      db,
      anchorCoords,
      MAX_TRANSFER_M,
    );
    // Always include the anchors themselves.
    for (const id of transferAnchorIds) expandedTargets.add(id);

    /* ----- Forward reach: only rows alighting in expandedTargets. ----- */

    const forwardRows = queryReach(
      db,
      [...originStopIds],
      services,
      expandedTargets,
      /* reverse */ false,
    );

    if (!forwardRows.length) {
      return noResult(
        "No bus or metro trip departs your origin paraderos toward any reachable transfer point.",
      );
    }

    /* ----- Resolve frequencies for forward (next bus after now) ----- */

    const fromSec = window.nowSeconds;
    const toSec = window.nowSeconds + MAX_WAIT_SECONDS;
    const resolvedForward = resolveDepartures(db, forwardRows, fromSec, toSec);

    if (!resolvedForward.length) {
      return noResult(
        "No buses near your origin in the next 90 min.",
      );
    }

    /* ----- Stop coordinate cache ----- */

    const stopMap = new Map<string, StopInfo>();
    for (const s of originStops) {
      stopMap.set(s.stop_id, {
        lat: s.stop_lat,
        lon: s.stop_lon,
        name: s.stop_name,
        code: s.stop_code,
      });
    }
    for (const s of destStops) {
      stopMap.set(s.stop_id, {
        lat: s.stop_lat,
        lon: s.stop_lon,
        name: s.stop_name,
        code: s.stop_code,
      });
    }
    const referenced = new Set<string>();
    for (const r of resolvedForward) {
      referenced.add(r.board_stop);
      referenced.add(r.alight_stop);
    }
    for (const r of backwardRows) {
      referenced.add(r.board_stop);
      referenced.add(r.alight_stop);
    }
    fillStopCoords(db, referenced, stopMap);

    /* ----- Build itineraries ----- */

    const itineraries: Itinerary[] = [];

    // 1) Direct: forward.alight ∈ destStops
    for (const f of resolvedForward) {
      if (!destStopIds.has(f.alight_stop)) continue;
      const o = stopMap.get(f.board_stop);
      const d = stopMap.get(f.alight_stop);
      if (!o || !d) continue;
      const walkToM = haversineMeters(origin.lat, origin.lng, o.lat, o.lon);
      const walkFromM = haversineMeters(d.lat, d.lon, destination.lat, destination.lng);
      const total =
        walkToM / WALK_SPEED_M_S +
        Math.max(0, f.dep_sec - fromSec) +
        (f.arr_sec - f.dep_sec) +
        walkFromM / WALK_SPEED_M_S;
      itineraries.push({
        kind: "direct",
        leg1: f,
        walkToM,
        walkFromM,
        totalSeconds: total,
        scoreSeconds: total,
      });
    }

    // 2) One-transfer:
    //    For each unique forward alight stop, find backward board stops
    //    within MAX_TRANSFER_M. For each (forwardRow, backwardRow) pair,
    //    resolve a leg-2 departure ≥ leg-1 arrival + walk + buffer.
    const backwardByBoard = new Map<string, ReachRow[]>();
    for (const b of backwardRows) {
      let arr = backwardByBoard.get(b.board_stop);
      if (!arr) {
        arr = [];
        backwardByBoard.set(b.board_stop, arr);
      }
      arr.push(b);
    }

    // Map alight_stop -> list of resolved forward legs ending there.
    const forwardByAlight = new Map<string, ResolvedLeg[]>();
    for (const f of resolvedForward) {
      let arr = forwardByAlight.get(f.alight_stop);
      if (!arr) {
        arr = [];
        forwardByAlight.set(f.alight_stop, arr);
      }
      arr.push(f);
    }

    // For each unique alight stop, find candidate transfer-board stops.
    const backwardBoardStops = [...backwardByBoard.keys()];
    const transferLinks: Array<{
      alightStop: string;
      boardStop: string;
      transferM: number;
    }> = [];

    for (const alightId of forwardByAlight.keys()) {
      const a = stopMap.get(alightId);
      if (!a) continue;
      for (const boardId of backwardBoardStops) {
        const b = stopMap.get(boardId);
        if (!b) continue;
        // Cheap bbox prefilter: ~600m at Santiago latitudes.
        if (Math.abs(a.lat - b.lat) > 0.0055) continue;
        if (Math.abs(a.lon - b.lon) > 0.0065) continue;
        const m = haversineMeters(a.lat, a.lon, b.lat, b.lon);
        if (m > MAX_TRANSFER_M) continue;
        transferLinks.push({ alightStop: alightId, boardStop: boardId, transferM: m });
      }
    }

    // Resolve leg-2 departures for each (forwardRow × backwardRow) bound by transferLinks.
    if (transferLinks.length) {
      // Group backward rows we actually need to resolve, with their per-pair fromSec.
      // Resolution is per (backwardRow, fromSec); since fromSec varies per forwardRow,
      // we resolve inside the loop. Frequency lookup is O(few) so this is fine.
      const backwardTripFreqs = loadFrequenciesByTrip(
        db,
        Array.from(new Set(backwardRows.map((r) => r.trip_id))),
      );
      const backwardTripT0 = loadTripT0(
        db,
        Array.from(new Set(backwardRows.map((r) => r.trip_id))),
      );

      for (const link of transferLinks) {
        const forwardLegs = forwardByAlight.get(link.alightStop)!;
        const backwardLegs = backwardByBoard.get(link.boardStop)!;
        const transferWalkS = link.transferM / WALK_SPEED_M_S;

        for (const f of forwardLegs) {
          // Earliest moment we could board leg 2.
          const earliestBoardSec =
            f.arr_sec + transferWalkS + MIN_TRANSFER_BUFFER_S;
          if (earliestBoardSec > toSec + MAX_WAIT_SECONDS) continue;

          for (const b of backwardLegs) {
            // Cap leg-2 wait so we don't compose 3-hour stalls.
            const leg2To = earliestBoardSec + MAX_WAIT_SECONDS;
            const resolved = resolveOneDeparture(
              b,
              backwardTripFreqs.get(b.trip_id),
              backwardTripT0.get(b.trip_id) ?? 0,
              earliestBoardSec,
              leg2To,
            );
            if (!resolved) continue;

            const oCoord = stopMap.get(f.board_stop);
            const dCoord = stopMap.get(b.alight_stop);
            if (!oCoord || !dCoord) continue;

            const walkToM = haversineMeters(
              origin.lat,
              origin.lng,
              oCoord.lat,
              oCoord.lon,
            );
            const walkFromM = haversineMeters(
              dCoord.lat,
              dCoord.lon,
              destination.lat,
              destination.lng,
            );

            const total =
              walkToM / WALK_SPEED_M_S +
              Math.max(0, f.dep_sec - fromSec) +
              (f.arr_sec - f.dep_sec) +
              transferWalkS +
              Math.max(0, resolved.dep_sec - f.arr_sec - transferWalkS) +
              (resolved.arr_sec - resolved.dep_sec) +
              walkFromM / WALK_SPEED_M_S;

            if (total > MAX_TOTAL_DURATION_S) continue;

            itineraries.push({
              kind: "transfer",
              leg1: f,
              leg2: resolved,
              transferM: link.transferM,
              walkToM,
              walkFromM,
              totalSeconds: total,
              scoreSeconds: total + TRANSFER_PENALTY_S,
            });
          }
        }
      }
    }

    if (!itineraries.length) {
      return noResult(
        "No bus or metro itinerary connects these locations on today's schedule (within 90 min wait, 1 transfer max, 600 m walking transfer).",
      );
    }

    itineraries.sort((a, b) => a.scoreSeconds - b.scoreSeconds);
    const winner = itineraries[0];

    /* ----- Materialize the winner into Legs (real walking polylines) ----- */

    const result = await materializeItinerary(
      db,
      winner,
      origin,
      destination,
      stopMap,
      window,
    );
    return result;
  }
}

/* ------------------------------------------------------------------ *
 *  Helpers                                                            *
 * ------------------------------------------------------------------ */

function noResult(reason: string): TransitRouteResult {
  return {
    available: false,
    status: reason,
    totalDurationSeconds: null,
    legs: [],
    fare: null,
    firstTransitDepartureUnix: null,
  };
}

/**
 * Single-hop reach query.
 *
 * - Forward (default): rows where so.stop_id ∈ stopIds, sd.stop_sequence > so.
 * - Reverse: rows where sd.stop_id ∈ stopIds, so.stop_sequence < sd.
 *
 * In both cases the returned shape is the same: `board_stop` is where you
 * board the trip, `alight_stop` is where you get off.
 */
/**
 * Single-hop reach query.
 *
 * Forward (reverse=false): rows where so.stop_id ∈ stopIds and
 *   sd.stop_id ∈ targetStops (if provided). board_stop = so, alight_stop = sd.
 * Reverse (reverse=true): rows where sd.stop_id ∈ stopIds and
 *   so.stop_id ∈ targetStops (if provided). board_stop = so, alight_stop = sd.
 *
 * `targetStops` bounds the cross-product so we don't return tens of
 * thousands of irrelevant downstream pairs.
 */
function queryReach(
  db: Database.Database,
  stopIds: string[],
  activeServices: Set<string>,
  targetStops: Set<string> | null,
  reverse: boolean,
): ReachRow[] {
  if (!stopIds.length) return [];
  if (targetStops && targetStops.size === 0) return [];

  const stopPh = stopIds.map(() => "?").join(",");
  const targetIds = targetStops ? [...targetStops] : [];
  const targetPh = targetIds.length ? targetIds.map(() => "?").join(",") : "";

  // SQLite parameter limit is 999 by default; chunk targets if needed.
  const TARGET_CHUNK = 800;
  const out: ReachRow[] = [];

  const runChunk = (targetSlice: string[]) => {
    const targetClauseFwd = targetSlice.length
      ? `AND sd.stop_id IN (${targetSlice.map(() => "?").join(",")})`
      : "";
    const targetClauseRev = targetSlice.length
      ? `AND so.stop_id IN (${targetSlice.map(() => "?").join(",")})`
      : "";

    const sql = reverse
      ? `
        SELECT
          so.trip_id     AS trip_id,
          t.route_id     AS route_id,
          t.shape_id     AS shape_id,
          t.trip_headsign AS trip_headsign,
          t.service_id   AS service_id,
          so.stop_id     AS board_stop,
          so.stop_sequence AS board_seq,
          so.departure_seconds AS board_dep_template,
          sd.stop_id     AS alight_stop,
          sd.stop_sequence AS alight_seq,
          sd.arrival_seconds AS alight_arr_template
        FROM stop_times sd
        JOIN stop_times so ON so.trip_id = sd.trip_id
        JOIN trips t ON t.trip_id = sd.trip_id
        WHERE sd.stop_id IN (${stopPh})
          AND so.stop_sequence < sd.stop_sequence
          AND so.departure_seconds IS NOT NULL
          AND sd.arrival_seconds IS NOT NULL
          ${targetClauseRev}
        LIMIT 50000
      `
      : `
        SELECT
          so.trip_id     AS trip_id,
          t.route_id     AS route_id,
          t.shape_id     AS shape_id,
          t.trip_headsign AS trip_headsign,
          t.service_id   AS service_id,
          so.stop_id     AS board_stop,
          so.stop_sequence AS board_seq,
          so.departure_seconds AS board_dep_template,
          sd.stop_id     AS alight_stop,
          sd.stop_sequence AS alight_seq,
          sd.arrival_seconds AS alight_arr_template
        FROM stop_times so
        JOIN stop_times sd ON sd.trip_id = so.trip_id
        JOIN trips t ON t.trip_id = so.trip_id
        WHERE so.stop_id IN (${stopPh})
          AND sd.stop_sequence > so.stop_sequence
          AND so.departure_seconds IS NOT NULL
          AND sd.arrival_seconds IS NOT NULL
          ${targetClauseFwd}
        LIMIT 50000
      `;
    const rows = db
      .prepare<unknown[], ReachRow>(sql)
      .all(...stopIds, ...targetSlice);
    for (const r of rows) {
      if (activeServices.has(r.service_id)) out.push(r);
    }
  };

  if (!targetIds.length) {
    runChunk([]);
  } else {
    for (let i = 0; i < targetIds.length; i += TARGET_CHUNK) {
      runChunk(targetIds.slice(i, i + TARGET_CHUNK));
    }
  }
  // Suppress duplicates if a chunked query returned the same row twice
  // through different paths (shouldn't happen but defensive).
  return out;
}

/**
 * Given a set of "anchor" stops with coords, return the set of all stop_ids
 * within `radiusM` meters of any anchor. Used to expand the forward target
 * set so we accept walking transfers between paraderos.
 *
 * Implementation: bbox-prefilter `stops` by the union bbox, then per-anchor
 * haversine. With ~500 anchors and ~12k Santiago stops, the inner check
 * is trivial.
 */
function expandStopsByRadius(
  db: Database.Database,
  anchors: Map<string, StopInfo>,
  radiusM: number,
): Set<string> {
  const out = new Set<string>();
  if (!anchors.size) return out;

  let minLat = +Infinity;
  let maxLat = -Infinity;
  let minLon = +Infinity;
  let maxLon = -Infinity;
  for (const a of anchors.values()) {
    if (a.lat < minLat) minLat = a.lat;
    if (a.lat > maxLat) maxLat = a.lat;
    if (a.lon < minLon) minLon = a.lon;
    if (a.lon > maxLon) maxLon = a.lon;
  }
  // Pad the bbox by the radius (rough deg conversion).
  const padLat = radiusM / 111_320;
  const padLon =
    radiusM /
    (111_320 *
      Math.max(
        Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180)),
        0.1,
      ));

  const rows = db
    .prepare<
      [number, number, number, number],
      {
        stop_id: string;
        stop_lat: number;
        stop_lon: number;
      }
    >(
      `SELECT stop_id, stop_lat, stop_lon
       FROM stops
       WHERE (location_type IS NULL OR location_type = 0)
         AND stop_lat BETWEEN ? AND ?
         AND stop_lon BETWEEN ? AND ?`,
    )
    .all(minLat - padLat, maxLat + padLat, minLon - padLon, maxLon + padLon);

  const anchorList = [...anchors.values()];
  for (const r of rows) {
    if (r.stop_lat == null || r.stop_lon == null) continue;
    for (const a of anchorList) {
      if (Math.abs(a.lat - r.stop_lat) > padLat) continue;
      if (Math.abs(a.lon - r.stop_lon) > padLon) continue;
      const m = haversineMeters(a.lat, a.lon, r.stop_lat, r.stop_lon);
      if (m <= radiusM) {
        out.add(r.stop_id);
        break;
      }
    }
  }
  return out;
}

function loadFrequenciesByTrip(
  db: Database.Database,
  tripIds: string[],
): Map<string, FrequencyRow[]> {
  const out = new Map<string, FrequencyRow[]>();
  if (!tripIds.length) return out;
  // Chunk to keep parameter list bounded.
  const CHUNK = 500;
  for (let i = 0; i < tripIds.length; i += CHUNK) {
    const slice = tripIds.slice(i, i + CHUNK);
    const ph = slice.map(() => "?").join(",");
    const rows = db
      .prepare<unknown[], FrequencyRow>(
        `SELECT trip_id, start_seconds, end_seconds, headway_secs, exact_times
         FROM frequencies WHERE trip_id IN (${ph})`,
      )
      .all(...slice);
    for (const f of rows) {
      let arr = out.get(f.trip_id);
      if (!arr) {
        arr = [];
        out.set(f.trip_id, arr);
      }
      arr.push(f);
    }
  }
  return out;
}

function loadTripT0(
  db: Database.Database,
  tripIds: string[],
): Map<string, number> {
  const out = new Map<string, number>();
  if (!tripIds.length) return out;
  const CHUNK = 500;
  for (let i = 0; i < tripIds.length; i += CHUNK) {
    const slice = tripIds.slice(i, i + CHUNK);
    const ph = slice.map(() => "?").join(",");
    const rows = db
      .prepare<unknown[], { trip_id: string; template_t0_seconds: number | null }>(
        `SELECT trip_id, template_t0_seconds FROM trip_template WHERE trip_id IN (${ph})`,
      )
      .all(...slice);
    for (const r of rows) {
      if (r.template_t0_seconds != null) out.set(r.trip_id, r.template_t0_seconds);
    }
  }
  return out;
}

/**
 * Bulk-resolve a list of ReachRows to their concrete next departure in
 * [fromSec, toSec]. Drops candidates with no qualifying departure.
 */
function resolveDepartures(
  db: Database.Database,
  rows: ReachRow[],
  fromSec: number,
  toSec: number,
): ResolvedLeg[] {
  if (!rows.length) return [];
  const tripIds = Array.from(new Set(rows.map((r) => r.trip_id)));
  const freqByTrip = loadFrequenciesByTrip(db, tripIds);
  const t0ByTrip = loadTripT0(db, tripIds);

  const out: ResolvedLeg[] = [];
  for (const r of rows) {
    const resolved = resolveOneDeparture(
      r,
      freqByTrip.get(r.trip_id),
      t0ByTrip.get(r.trip_id) ?? 0,
      fromSec,
      toSec,
    );
    if (resolved) out.push(resolved);
  }
  return out;
}

function resolveOneDeparture(
  r: ReachRow,
  freqs: FrequencyRow[] | undefined,
  t0: number,
  fromSec: number,
  toSec: number,
): ResolvedLeg | null {
  if (freqs && freqs.length) {
    const offsetDep = r.board_dep_template - t0;
    const offsetArr = r.alight_arr_template - t0;
    const next = nextFrequencyDeparture(freqs, offsetDep, fromSec, toSec);
    if (!next) return null;
    return {
      ...r,
      dep_sec: next.depAtBoard,
      arr_sec: next.tripStart + offsetArr,
      fromFrequency: true,
    };
  }
  // Absolute schedule.
  if (
    r.board_dep_template >= fromSec &&
    r.board_dep_template <= toSec
  ) {
    return {
      ...r,
      dep_sec: r.board_dep_template,
      arr_sec: r.alight_arr_template,
      fromFrequency: false,
    };
  }
  return null;
}

function nextFrequencyDeparture(
  freqs: FrequencyRow[],
  offsetAtBoard: number,
  fromSec: number,
  toSec: number,
): { tripStart: number; depAtBoard: number } | null {
  let best: { tripStart: number; depAtBoard: number } | null = null;
  for (const f of freqs) {
    if (f.headway_secs <= 0) continue;
    const minTripStart = Math.max(f.start_seconds, fromSec - offsetAtBoard);
    if (minTripStart >= f.end_seconds) continue;
    const k = Math.max(
      0,
      Math.ceil((minTripStart - f.start_seconds) / f.headway_secs),
    );
    const tripStart = f.start_seconds + k * f.headway_secs;
    if (tripStart >= f.end_seconds) continue;
    const depAtBoard = tripStart + offsetAtBoard;
    if (depAtBoard < fromSec || depAtBoard > toSec) continue;
    if (!best || depAtBoard < best.depAtBoard) {
      best = { tripStart, depAtBoard };
    }
  }
  return best;
}

function fillStopCoords(
  db: Database.Database,
  ids: Set<string>,
  out: Map<string, StopInfo>,
) {
  const missing = [...ids].filter((id) => !out.has(id));
  if (!missing.length) return;
  const CHUNK = 800;
  for (let i = 0; i < missing.length; i += CHUNK) {
    const slice = missing.slice(i, i + CHUNK);
    const ph = slice.map(() => "?").join(",");
    const rows = db
      .prepare<
        unknown[],
        {
          stop_id: string;
          stop_name: string | null;
          stop_code: string | null;
          stop_lat: number;
          stop_lon: number;
        }
      >(
        `SELECT stop_id, stop_name, stop_code, stop_lat, stop_lon FROM stops WHERE stop_id IN (${ph})`,
      )
      .all(...slice);
    for (const r of rows) {
      out.set(r.stop_id, {
        lat: r.stop_lat,
        lon: r.stop_lon,
        name: r.stop_name,
        code: r.stop_code,
      });
    }
  }
}

function loadRoute(db: Database.Database, routeId: string): RouteInfo | undefined {
  return db
    .prepare<[string], RouteInfo>(
      `SELECT route_short_name, route_long_name, route_color, route_text_color, route_type
       FROM routes WHERE route_id = ?`,
    )
    .get(routeId);
}

function vehicleTypeFromRouteType(rt: number | null | undefined): TransitVehicleType {
  switch (rt) {
    case 0:
      return "TRAM";
    case 1:
      return "SUBWAY";
    case 2:
      return "RAIL";
    case 3:
      return "BUS";
    default:
      return "BUS";
  }
}

function ensureHash(c: string): string {
  return c.startsWith("#") ? c : `#${c}`;
}

function polylineLengthMeters(coords: [number, number][]): number {
  let m = 0;
  for (let i = 1; i < coords.length; i++) {
    m += haversineMeters(
      coords[i - 1][0],
      coords[i - 1][1],
      coords[i][0],
      coords[i][1],
    );
  }
  return m;
}

/* ------------------------------------------------------------------ *
 *  Materialize winning itinerary                                      *
 * ------------------------------------------------------------------ */

async function materializeItinerary(
  db: Database.Database,
  it: Itinerary,
  origin: LatLng,
  destination: LatLng,
  stopMap: Map<string, StopInfo>,
  window: ServiceWindow,
): Promise<TransitRouteResult> {
  const board1 = stopMap.get(it.leg1.board_stop)!;
  const alight1 = stopMap.get(it.leg1.alight_stop)!;

  // Walking legs (real polylines via GraphHopper).
  const walkOriginToBoard1 = await walkLegBetween(
    { lat: origin.lat, lng: origin.lng },
    { lat: board1.lat, lng: board1.lon },
    it.walkToM,
  );

  const route1 = loadRoute(db, it.leg1.route_id);
  const transitLeg1 = buildTransitLeg(db, it.leg1, route1, board1, alight1, window);

  let legs: Leg[] = [];
  let firstDeparture: number | null = transitLeg1.departureTimeUnix;

  if (it.kind === "direct") {
    const walkAlightToDest = await walkLegBetween(
      { lat: alight1.lat, lng: alight1.lon },
      { lat: destination.lat, lng: destination.lng },
      it.walkFromM,
    );
    legs = [walkOriginToBoard1, transitLeg1, walkAlightToDest];
  } else {
    const board2 = stopMap.get(it.leg2.board_stop)!;
    const alight2 = stopMap.get(it.leg2.alight_stop)!;

    // Transfer walk: only call routing if it's a non-trivial distance AND not the same stop.
    const samePhysicalStop = it.leg1.alight_stop === it.leg2.board_stop;
    const walkTransfer = samePhysicalStop
      ? straightWalkLeg(alight1, board2, 0)
      : await walkLegBetween(
          { lat: alight1.lat, lng: alight1.lon },
          { lat: board2.lat, lng: board2.lon },
          it.transferM,
        );

    const route2 = loadRoute(db, it.leg2.route_id);
    const transitLeg2 = buildTransitLeg(db, it.leg2, route2, board2, alight2, window);

    const walkAlightToDest = await walkLegBetween(
      { lat: alight2.lat, lng: alight2.lon },
      { lat: destination.lat, lng: destination.lng },
      it.walkFromM,
    );

    legs = [
      walkOriginToBoard1,
      transitLeg1,
      walkTransfer,
      transitLeg2,
      walkAlightToDest,
    ];
  }

  // Total wall-clock duration: sum of leg durations + waits between them.
  // We compute as: (last arrival unix) - (start unix) where start = now if
  // we're departing immediately, otherwise the first walk start.
  const startUnix = window.midnightUnixSec + window.nowSeconds;
  const lastLeg = legs[legs.length - 1];
  let totalDurationSeconds: number;
  if (lastLeg.kind === "transit" && lastLeg.arrivalTimeUnix) {
    totalDurationSeconds = lastLeg.arrivalTimeUnix - startUnix;
  } else {
    totalDurationSeconds = legs.reduce((s, l) => s + l.durationSeconds, 0);
    // Plus waits — easier to compute fresh from the itinerary:
    if (it.kind === "direct") {
      totalDurationSeconds = Math.round(it.totalSeconds);
    } else {
      totalDurationSeconds = Math.round(it.totalSeconds);
    }
  }

  // Status string — friendly summary of the chosen itinerary.
  const status = buildStatus(it, route1, db, window);

  // Fare: if any leg includes metro/rail, prefer that fare; else bus fare on leg1.
  const fareRouteId =
    it.kind === "transfer" && (route1?.route_type === 1 || route1?.route_type === 2)
      ? it.leg1.route_id
      : it.kind === "transfer"
        ? it.leg2.route_id
        : it.leg1.route_id;
  const fare = lookupBusFare(db, fareRouteId);

  return {
    available: true,
    status,
    totalDurationSeconds,
    legs,
    fare,
    firstTransitDepartureUnix: firstDeparture,
  };
}

function buildTransitLeg(
  db: Database.Database,
  c: ResolvedLeg,
  route: RouteInfo | undefined,
  boardStop: StopInfo,
  alightStop: StopInfo,
  window: ServiceWindow,
): TransitLeg {
  let coords: [number, number][] = [];
  if (c.shape_id) {
    const shape = loadShape(db, c.shape_id);
    if (shape.length) {
      coords = sliceShapeBetweenStops(
        shape,
        boardStop.lat,
        boardStop.lon,
        alightStop.lat,
        alightStop.lon,
      );
    }
  }
  if (coords.length < 2) {
    coords = [
      [boardStop.lat, boardStop.lon],
      [alightStop.lat, alightStop.lon],
    ];
  }

  const distanceMeters = polylineLengthMeters(coords);
  const departureUnix = window.midnightUnixSec + c.dep_sec;
  const arrivalUnix = window.midnightUnixSec + c.arr_sec;

  return {
    kind: "transit",
    durationSeconds: Math.max(0, c.arr_sec - c.dep_sec),
    distanceMeters,
    coordinates: coords,
    vehicleType: vehicleTypeFromRouteType(route?.route_type),
    lineShortName: route?.route_short_name ?? null,
    lineLongName: route?.route_long_name ?? null,
    lineColor: route?.route_color ? ensureHash(route.route_color) : null,
    lineTextColor: route?.route_text_color
      ? ensureHash(route.route_text_color)
      : null,
    headsign: c.trip_headsign,
    numStops: c.alight_seq - c.board_seq,
    departureStop: boardStop.name,
    arrivalStop: alightStop.name,
    departureStopCode: boardStop.code,
    arrivalStopCode: alightStop.code,
    departureTimeUnix: departureUnix,
    arrivalTimeUnix: arrivalUnix,
  };
}

function buildStatus(
  it: Itinerary,
  route1: RouteInfo | undefined,
  db: Database.Database,
  _window: ServiceWindow,
): string {
  const r1 = route1?.route_short_name || "transit";
  if (it.kind === "direct") {
    return `Direct ${r1} from your nearest paradero.`;
  }
  const route2 = loadRoute(db, it.leg2.route_id);
  const r2 = route2?.route_short_name || "transit";
  return `${r1} → ${r2} (1 transfer, ${Math.round(it.transferM)} m walk between paraderos).`;
}

async function walkLegBetween(
  from: LatLng,
  to: LatLng,
  fallbackStraightMeters: number,
): Promise<WalkLeg> {
  // Trivial moves: short-circuit to avoid wasting a routing call (and to
  // dodge providers that refuse near-zero-length requests).
  if (fallbackStraightMeters < 5) {
    return {
      kind: "walk",
      durationSeconds: 0,
      distanceMeters: 0,
      coordinates: [
        [from.lat, from.lng],
        [to.lat, to.lng],
      ],
      instructions: null,
    };
  }
  try {
    const provider = getRoutingProvider();
    const result = await provider.fetchRoute(from, to, "foot");
    return {
      kind: "walk",
      durationSeconds: result.primary.durationSeconds,
      distanceMeters: result.primary.distanceMeters,
      coordinates: result.primary.coordinates,
      instructions: null,
    };
  } catch (e) {
    // If the foot router is unavailable or rejects the pair, we still want
    // to return a *route*, not "no transit option". Fall back to a straight
    // line scaled by walking speed — visually a chord, but accurate enough
    // that the user sees the itinerary.
    if (e instanceof RoutingError) {
      return {
        kind: "walk",
        durationSeconds: Math.round(fallbackStraightMeters / WALK_SPEED_M_S),
        distanceMeters: Math.round(fallbackStraightMeters),
        coordinates: [
          [from.lat, from.lng],
          [to.lat, to.lng],
        ],
        instructions: null,
      };
    }
    throw e;
  }
}

function straightWalkLeg(
  from: StopInfo,
  to: StopInfo,
  meters: number,
): WalkLeg {
  return {
    kind: "walk",
    durationSeconds: Math.round(meters / WALK_SPEED_M_S),
    distanceMeters: Math.round(meters),
    coordinates: [
      [from.lat, from.lon],
      [to.lat, to.lon],
    ],
    instructions: null,
  };
}

export function gtfsAvailable(): boolean {
  return gtfsDbExists();
}

/** "Now" with one escape hatch (GTFS_NOW_OVERRIDE) for testing. */
function resolveNow(): Date {
  const override = process.env.GTFS_NOW_OVERRIDE;
  if (!override) return new Date();
  const t = Date.parse(override);
  if (Number.isNaN(t)) return new Date();
  return new Date(t);
}

export function gtfsTransitError(): TransitError {
  return new TransitError(
    "GTFS database is not built. Run `npm run gtfs:ingest` to download the DTPM feed and load it into SQLite, " +
      "or set TRANSIT_PROVIDER=google to fall back to Google Directions.",
    500,
  );
}
