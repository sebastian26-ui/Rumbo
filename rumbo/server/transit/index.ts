import { GoogleTransitProvider } from "./google";
import { TransitError, TransitProvider } from "./provider";
import { GtfsTransitProvider, gtfsAvailable, gtfsTransitError } from "../gtfs/provider";

export type {
  TransitProvider,
  TransitRouteResult,
  TransitLeg,
  WalkLeg,
  Leg,
  TransitVehicleType,
  TransitFare,
  LatLng,
} from "./provider";
export { TransitError };

let cached: TransitProvider | null = null;

/**
 * Default = `gtfs` (Santiago's official DTPM feed, parsed into SQLite via
 * `npm run gtfs:ingest`). Use TRANSIT_PROVIDER=google to fall back to
 * Google Directions while the GTFS DB isn't built.
 */
export function getTransitProvider(): TransitProvider {
  if (cached) return cached;

  const requested = (process.env.TRANSIT_PROVIDER || "gtfs").toLowerCase();

  if (requested === "gtfs") {
    if (!gtfsAvailable()) throw gtfsTransitError();
    cached = new GtfsTransitProvider();
    return cached;
  }

  if (requested === "google") {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) {
      throw new TransitError(
        "TRANSIT_PROVIDER=google requires GOOGLE_MAPS_API_KEY. " +
          "Either provide the key or set TRANSIT_PROVIDER=gtfs and run `npm run gtfs:ingest`.",
        500,
      );
    }
    cached = new GoogleTransitProvider(key);
    return cached;
  }

  throw new TransitError(
    `Unknown TRANSIT_PROVIDER "${requested}". Supported: gtfs, google.`,
    500,
  );
}

export function _resetTransitProvider() {
  cached = null;
}
