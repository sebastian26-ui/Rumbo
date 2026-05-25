/**
 * Quick smoke test for the GTFS pipeline. Doesn't hit any external API —
 * stops short of the walking-leg call, so it works without GraphHopper.
 *
 *   GTFS_NOW_OVERRIDE="2020-09-15T08:00:00-03:00" npx tsx server/gtfs/smoketest.ts
 *
 * Prints the candidate trips matching origin -> Lo Barnechea, ordered by
 * total estimated time, with route names, headsigns, departure times.
 */
import "dotenv/config";
import { openGtfsDb } from "./db";
import { nearestStops, haversineMeters } from "./spatial";
import {
  activeServiceIds,
  feedTimezone,
  localServiceWindow,
} from "./calendar";
import { loadShape, sliceShapeBetweenStops } from "./shape";

// SMOKE_ORIGIN/SMOKE_DEST as "lat,lng" override defaults below.
const parseLatLng = (s: string | undefined, fallback: { lat: number; lng: number }) => {
  if (!s) return fallback;
  const [a, b] = s.split(",").map(Number);
  return Number.isFinite(a) && Number.isFinite(b) ? { lat: a, lng: b } : fallback;
};
// Default trip: Metro Bilbao corridor -> Av. El Rodeo (Lo Barnechea / Nido de Águilas).
// Route C05 (La Ermita - (M) Francisco Bilbao) is the realistic single-bus connector.
const origin = parseLatLng(process.env.SMOKE_ORIGIN, { lat: -33.4400, lng: -70.5871 });
const destination = parseLatLng(process.env.SMOKE_DEST, { lat: -33.3636, lng: -70.5043 });

function fmt(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

async function main() {
  const db = openGtfsDb();
  const tz = feedTimezone(db);
  const nowOverride = process.env.GTFS_NOW_OVERRIDE
    ? new Date(process.env.GTFS_NOW_OVERRIDE)
    : new Date();
  const window = localServiceWindow(nowOverride, tz);
  console.log(
    `Now=${nowOverride.toISOString()} TZ=${tz} day=${window.yyyymmdd} weekday=${window.weekday} t=${fmt(window.nowSeconds)}`,
  );

  const services = activeServiceIds(db, window);
  console.log(`Active services: ${[...services].join(", ") || "(none)"}`);
  if (!services.size) {
    console.log("No services active — set GTFS_NOW_OVERRIDE to a date inside the feed's validity.");
    process.exit(1);
  }

  const originStops = nearestStops(db, origin.lat, origin.lng, 1200, 8);
  const destStops = nearestStops(db, destination.lat, destination.lng, 1500, 8);
  console.log(`Origin paraderos (${originStops.length}):`);
  for (const s of originStops.slice(0, 3)) {
    console.log(`  ${s.stop_id} ${s.stop_name} (${Math.round(s.distance_m)} m)`);
  }
  console.log(`Destination paraderos (${destStops.length}):`);
  for (const s of destStops.slice(0, 3)) {
    console.log(`  ${s.stop_id} ${s.stop_name} (${Math.round(s.distance_m)} m)`);
  }
  if (!originStops.length || !destStops.length) {
    console.log("No nearby stops on one side — destination probably has no GTFS coverage.");
    process.exit(1);
  }

  const origIds = originStops.map((s) => s.stop_id);
  const destIds = destStops.map((s) => s.stop_id);
  const origPh = origIds.map(() => "?").join(",");
  const destPh = destIds.map(() => "?").join(",");

  type CandRow = {
    trip_id: string;
    route_id: string;
    shape_id: string | null;
    trip_headsign: string | null;
    service_id: string;
    orig_stop: string;
    orig_seq: number;
    template_dep_sec: number;
    dest_stop: string;
    dest_seq: number;
    template_arr_sec: number;
  };
  const candidates = db
    .prepare<unknown[], CandRow>(
      `SELECT
        so.trip_id, t.route_id, t.shape_id, t.trip_headsign, t.service_id,
        so.stop_id AS orig_stop, so.stop_sequence AS orig_seq,
        so.departure_seconds AS template_dep_sec,
        sd.stop_id AS dest_stop, sd.stop_sequence AS dest_seq,
        sd.arrival_seconds AS template_arr_sec
      FROM stop_times so
      JOIN stop_times sd ON sd.trip_id = so.trip_id
      JOIN trips t ON t.trip_id = so.trip_id
      WHERE so.stop_id IN (${origPh})
        AND sd.stop_id IN (${destPh})
        AND sd.stop_sequence > so.stop_sequence
      LIMIT 1000`,
    )
    .all(...origIds, ...destIds)
    .filter((c) => services.has(c.service_id));
  console.log(`Pair-join candidates: ${candidates.length}`);

  if (!candidates.length) {
    console.log("No trip directly serves the corridor — would need a transfer (not implemented).");
    process.exit(1);
  }

  // Expand frequencies.
  const tripIds = Array.from(new Set(candidates.map((c) => c.trip_id)));
  const tripsPh = tripIds.map(() => "?").join(",");
  const freqRows = db
    .prepare<
      unknown[],
      {
        trip_id: string;
        start_seconds: number;
        end_seconds: number;
        headway_secs: number;
      }
    >(
      `SELECT trip_id, start_seconds, end_seconds, headway_secs
       FROM frequencies WHERE trip_id IN (${tripsPh})`,
    )
    .all(...tripIds);
  const t0Rows = db
    .prepare<unknown[], { trip_id: string; template_t0_seconds: number | null }>(
      `SELECT trip_id, template_t0_seconds FROM trip_template WHERE trip_id IN (${tripsPh})`,
    )
    .all(...tripIds);
  const t0 = new Map(
    t0Rows.filter((r) => r.template_t0_seconds != null).map((r) => [r.trip_id, r.template_t0_seconds!]),
  );
  const freqsByTrip = new Map<string, typeof freqRows>();
  for (const f of freqRows) {
    if (!freqsByTrip.has(f.trip_id)) freqsByTrip.set(f.trip_id, []);
    freqsByTrip.get(f.trip_id)!.push(f);
  }

  const stopMap = new Map<
    string,
    { lat: number; lon: number; name: string | null; distOrigin?: number; distDest?: number }
  >();
  for (const s of originStops) stopMap.set(s.stop_id, {
    lat: s.stop_lat, lon: s.stop_lon, name: s.stop_name, distOrigin: s.distance_m,
  });
  for (const s of destStops) {
    const ex = stopMap.get(s.stop_id);
    stopMap.set(s.stop_id, {
      lat: s.stop_lat, lon: s.stop_lon, name: s.stop_name,
      distOrigin: ex?.distOrigin,
      distDest: s.distance_m,
    });
  }

  type Scored = CandRow & {
    depAtOrig: number;
    arrAtDest: number;
    waitS: number;
    rideS: number;
    walkToM: number;
    walkFromM: number;
    totalS: number;
  };
  const fromSec = window.nowSeconds;
  const toSec = window.nowSeconds + 90 * 60;
  const scored: Scored[] = [];
  for (const c of candidates) {
    const freqs = freqsByTrip.get(c.trip_id);
    let depAtOrig: number | null = null;
    let arrAtDest: number | null = null;
    if (freqs && freqs.length) {
      const tt = t0.get(c.trip_id) ?? 0;
      const offsetDep = c.template_dep_sec - tt;
      const offsetArr = c.template_arr_sec - tt;
      let bestDep: number | null = null;
      let bestStart: number | null = null;
      for (const f of freqs) {
        if (f.headway_secs <= 0) continue;
        const minStart = Math.max(f.start_seconds, fromSec - offsetDep);
        if (minStart >= f.end_seconds) continue;
        const k = Math.max(0, Math.ceil((minStart - f.start_seconds) / f.headway_secs));
        const ts = f.start_seconds + k * f.headway_secs;
        if (ts >= f.end_seconds) continue;
        const dep = ts + offsetDep;
        if (dep < fromSec || dep > toSec) continue;
        if (bestDep == null || dep < bestDep) {
          bestDep = dep;
          bestStart = ts;
        }
      }
      if (bestDep != null && bestStart != null) {
        depAtOrig = bestDep;
        arrAtDest = bestStart + offsetArr;
      }
    } else if (c.template_dep_sec >= fromSec && c.template_dep_sec <= toSec) {
      depAtOrig = c.template_dep_sec;
      arrAtDest = c.template_arr_sec;
    }
    if (depAtOrig == null || arrAtDest == null) continue;
    const o = stopMap.get(c.orig_stop)!;
    const d = stopMap.get(c.dest_stop)!;
    const walkToM = haversineMeters(origin.lat, origin.lng, o.lat, o.lon);
    const walkFromM = haversineMeters(d.lat, d.lon, destination.lat, destination.lng);
    const waitS = depAtOrig - window.nowSeconds;
    const rideS = arrAtDest - depAtOrig;
    const totalS = walkToM / 1.4 + waitS + rideS + walkFromM / 1.4;
    scored.push({ ...c, depAtOrig, arrAtDest, waitS, rideS, walkToM, walkFromM, totalS });
  }
  scored.sort((a, b) => a.totalS - b.totalS);
  console.log(`\nResolved candidates (top 5 of ${scored.length}):`);
  for (const s of scored.slice(0, 5)) {
    const route = db
      .prepare<[string], { route_short_name: string | null; route_long_name: string | null }>(
        `SELECT route_short_name, route_long_name FROM routes WHERE route_id = ?`,
      )
      .get(s.route_id);
    console.log(
      `  ${route?.route_short_name ?? s.route_id} → ${s.trip_headsign ?? "?"}` +
        ` | board ${s.orig_stop} (${stopMap.get(s.orig_stop)?.name})` +
        ` -> alight ${s.dest_stop} (${stopMap.get(s.dest_stop)?.name})` +
        ` | dep ${fmt(s.depAtOrig)} arr ${fmt(s.arrAtDest)}` +
        ` | walk ${Math.round(s.walkToM)}+${Math.round(s.walkFromM)}m wait ${Math.round(s.waitS / 60)}m ride ${Math.round(s.rideS / 60)}m total ${Math.round(s.totalS / 60)}m`,
    );
  }
  const winner = scored[0];
  if (winner && winner.shape_id) {
    const o = stopMap.get(winner.orig_stop)!;
    const d = stopMap.get(winner.dest_stop)!;
    const shape = loadShape(db, winner.shape_id);
    const sliced = sliceShapeBetweenStops(shape, o.lat, o.lon, d.lat, d.lon);
    console.log(
      `\nWinner shape ${winner.shape_id}: full=${shape.length} pts, sliced=${sliced.length} pts ` +
        `(first ${sliced[0]?.join(",")} -> last ${sliced.at(-1)?.join(",")})`,
    );
  }
}

main().catch((e) => {
  console.error("smoke test failed:", e);
  process.exit(1);
});
