import { GraphHopperProvider } from "./graphhopper";
import { OsrmProvider } from "./osrm";
import { RoutingError, RoutingProvider } from "./provider";

export type { RoutingProvider, RoutingProfile, RouteResult, RoutedPath, LatLng } from "./provider";
export { RoutingError };

let cached: RoutingProvider | null = null;

export function getRoutingProvider(): RoutingProvider {
  if (cached) return cached;

  const requested = (process.env.ROUTING_PROVIDER || "graphhopper").toLowerCase();

  if (requested === "osrm") {
    const base = process.env.OSRM_BASE_URL;
    if (!base) {
      throw new RoutingError(
        "ROUTING_PROVIDER=osrm requires OSRM_BASE_URL pointing at a self-hosted OSRM with foot/bike/driving profiles. " +
          "The public demo at router.project-osrm.org only runs the car profile and silently returns car routes for foot/bike.",
        500,
      );
    }
    cached = new OsrmProvider(base);
    return cached;
  }

  if (requested === "graphhopper") {
    const key = process.env.GRAPHHOPPER_API_KEY;
    if (!key) {
      throw new RoutingError(
        "GRAPHHOPPER_API_KEY is not set. Sign up at https://www.graphhopper.com/ and add the key to .env, " +
          "or set ROUTING_PROVIDER=osrm with OSRM_BASE_URL pointing at a self-hosted OSRM.",
        500,
      );
    }
    cached = new GraphHopperProvider(key);
    return cached;
  }

  throw new RoutingError(
    `Unknown ROUTING_PROVIDER "${requested}". Supported: graphhopper, osrm.`,
    500,
  );
}

/** Reset the cached provider — useful for tests or after env var changes. */
export function _resetRoutingProvider() {
  cached = null;
}
