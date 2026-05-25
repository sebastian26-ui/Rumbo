import {
  LatLng,
  RouteResult,
  RoutedPath,
  RoutingError,
  RoutingProfile,
  RoutingProvider,
} from "./provider";

interface OsrmRoute {
  duration: number;
  distance: number;
  geometry: { type: string; coordinates: number[][] };
}

interface OsrmResponse {
  code: string;
  routes?: OsrmRoute[];
}

function toRoutedPath(r: OsrmRoute): RoutedPath {
  return {
    durationSeconds: r.duration,
    distanceMeters: r.distance,
    coordinates: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
  };
}

const OSRM_PROFILE_MAP: Record<RoutingProfile, string> = {
  foot: "foot",
  bike: "bike",
  car: "driving",
};

/**
 * OSRM routing provider. Use only with a self-hosted OSRM that has all three
 * profiles built. The public demo at router.project-osrm.org runs the car
 * profile only and silently returns car routes for foot/bike requests, which
 * produces the "all modes share a path" bug.
 */
export class OsrmProvider implements RoutingProvider {
  readonly name = "osrm";
  readonly supportedProfiles: ReadonlySet<RoutingProfile> = new Set([
    "foot",
    "bike",
    "car",
  ]);

  constructor(private readonly baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async fetchRoute(
    origin: LatLng,
    destination: LatLng,
    profile: RoutingProfile,
    opts: { alternatives?: boolean } = {},
  ): Promise<RouteResult> {
    const a = `${origin.lng},${origin.lat}`;
    const b = `${destination.lng},${destination.lat}`;
    const altParam =
      opts.alternatives && profile === "car" ? "&alternatives=true" : "";
    const url = `${this.baseUrl}/route/v1/${OSRM_PROFILE_MAP[profile]}/${a};${b}?overview=full&geometries=geojson${altParam}`;

    const res = await fetch(url, { signal: AbortSignal.timeout(25_000) });
    if (!res.ok) throw new RoutingError(`OSRM ${res.status}`, 502);

    const data = (await res.json()) as OsrmResponse;
    if (data.code !== "Ok" || !data.routes?.length) {
      throw new RoutingError("No route found for this mode", 404);
    }

    const parsed = data.routes.map(toRoutedPath);
    return { primary: parsed[0], alternatives: parsed.slice(1) };
  }
}
