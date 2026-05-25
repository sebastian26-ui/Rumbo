import type Database from "better-sqlite3";

export interface StopRow {
  stop_id: string;
  stop_name: string | null;
  stop_code: string | null;
  stop_lat: number;
  stop_lon: number;
  distance_m: number;
}

const EARTH_M = 6_371_008.8;
const DEG = Math.PI / 180;

export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = (lat2 - lat1) * DEG;
  const dLon = (lon2 - lon1) * DEG;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.sqrt(a));
}

/**
 * Stops that allow boarding/alighting (`location_type` 0 or NULL) within
 * `maxMeters` of the point, ordered nearest first. We bbox-prefilter via
 * the lat/lon B-tree indexes to avoid scanning all 12k Santiago stops.
 */
export function nearestStops(
  db: Database.Database,
  lat: number,
  lon: number,
  maxMeters: number,
  limit: number,
): StopRow[] {
  // 1° latitude ≈ 111_320 m at any latitude.
  // 1° longitude ≈ 111_320 m * cos(lat) — narrows fast in mid-latitudes.
  const dLat = maxMeters / 111_320;
  const dLon = maxMeters / (111_320 * Math.max(Math.cos(lat * DEG), 0.1));

  const rows = db
    .prepare<
      [number, number, number, number],
      {
        stop_id: string;
        stop_name: string | null;
        stop_code: string | null;
        stop_lat: number;
        stop_lon: number;
      }
    >(
      `SELECT stop_id, stop_name, stop_code, stop_lat, stop_lon
       FROM stops
       WHERE (location_type IS NULL OR location_type = 0)
         AND stop_lat BETWEEN ? AND ?
         AND stop_lon BETWEEN ? AND ?`,
    )
    .all(lat - dLat, lat + dLat, lon - dLon, lon + dLon);

  const result: StopRow[] = [];
  for (const r of rows) {
    if (
      r.stop_lat == null ||
      r.stop_lon == null ||
      Number.isNaN(r.stop_lat) ||
      Number.isNaN(r.stop_lon)
    ) {
      continue;
    }
    const d = haversineMeters(lat, lon, r.stop_lat, r.stop_lon);
    if (d <= maxMeters) {
      result.push({ ...r, distance_m: d });
    }
  }
  result.sort((a, b) => a.distance_m - b.distance_m);
  return result.slice(0, limit);
}
