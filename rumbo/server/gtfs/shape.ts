import type Database from "better-sqlite3";
import { haversineMeters } from "./spatial";

interface ShapePoint {
  lat: number;
  lon: number;
  seq: number;
  dist: number | null;
}

/**
 * The full ordered shape polyline as [lat, lon] pairs, plus its raw rows so
 * callers can use shape_dist_traveled for accurate slicing when present.
 */
export function loadShape(
  db: Database.Database,
  shapeId: string,
): ShapePoint[] {
  return db
    .prepare<
      [string],
      {
        shape_pt_lat: number;
        shape_pt_lon: number;
        shape_pt_sequence: number;
        shape_dist_traveled: number | null;
      }
    >(
      `SELECT shape_pt_lat, shape_pt_lon, shape_pt_sequence, shape_dist_traveled
       FROM shapes
       WHERE shape_id = ?
       ORDER BY shape_pt_sequence`,
    )
    .all(shapeId)
    .map((r) => ({
      lat: r.shape_pt_lat,
      lon: r.shape_pt_lon,
      seq: r.shape_pt_sequence,
      dist: r.shape_dist_traveled,
    }));
}

/** Top-K nearest shape vertices to a (lat, lon), sorted ascending by distance.
 *  Single-pass; keeps a sorted K-buffer instead of sorting the full shape. */
function topKNearest(
  shape: ShapePoint[],
  lat: number,
  lon: number,
  k: number,
): Array<{ idx: number; dist: number }> {
  if (shape.length <= k) {
    return shape
      .map((p, i) => ({
        idx: i,
        dist: haversineMeters(lat, lon, p.lat, p.lon),
      }))
      .sort((a, b) => a.dist - b.dist);
  }
  const buf: Array<{ idx: number; dist: number }> = [];
  let worst = Infinity;
  for (let i = 0; i < shape.length; i++) {
    const d = haversineMeters(lat, lon, shape[i].lat, shape[i].lon);
    if (buf.length < k) {
      buf.push({ idx: i, dist: d });
      if (buf.length === k) {
        buf.sort((a, b) => a.dist - b.dist);
        worst = buf[k - 1].dist;
      }
      continue;
    }
    if (d >= worst) continue;
    buf[k - 1] = { idx: i, dist: d };
    buf.sort((a, b) => a.dist - b.dist);
    worst = buf[k - 1].dist;
  }
  return buf;
}

/**
 * Slice the bus shape between the boarding and alighting stop locations.
 *
 * Naïve "snap each stop to the single globally-closest vertex" fails on loop
 * routes: when the shape doubles back near either stop, the alighting index
 * can land before the boarding index, and the only safe fallback is dumping
 * the whole loop onto the map — which is the user-facing bug we're fixing.
 *
 * Instead we take top-K nearest candidates for each end and pick the (i, j)
 * pair with j > i that minimises combined snap error. If no forward pair
 * exists (genuinely weird data), fall back to a straight chord between the
 * two stops rather than the entire shape.
 *
 * Returns coordinates as [lat, lon] for Leaflet, ready to drop into a
 * `TransitLeg.coordinates` field.
 */
export function sliceShapeBetweenStops(
  shape: ShapePoint[],
  boardLat: number,
  boardLon: number,
  alightLat: number,
  alightLon: number,
): [number, number][] {
  if (shape.length < 2) {
    return [
      [boardLat, boardLon],
      [alightLat, alightLon],
    ];
  }

  const K = 5;
  const boardCandidates = topKNearest(shape, boardLat, boardLon, K);
  const alightCandidates = topKNearest(shape, alightLat, alightLon, K);

  let best: { i: number; j: number; cost: number } | null = null;
  for (const b of boardCandidates) {
    for (const a of alightCandidates) {
      if (a.idx <= b.idx) continue;
      const cost = b.dist + a.dist;
      if (!best || cost < best.cost) best = { i: b.idx, j: a.idx, cost };
    }
  }

  if (!best) {
    // No forward pair — return a chord rather than the entire loop. Better
    // to show a straight line than the wrong thing.
    return [
      [boardLat, boardLon],
      [alightLat, alightLon],
    ];
  }

  return shape.slice(best.i, best.j + 1).map(
    (p) => [p.lat, p.lon] as [number, number],
  );
}
