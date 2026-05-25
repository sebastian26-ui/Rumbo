import {
  LatLng,
  RouteResult,
  RoutedPath,
  RoutingError,
  RoutingProfile,
  RoutingProvider,
} from "./provider";

const BASE = "https://graphhopper.com/api/1/route";

interface GraphHopperPath {
  distance: number;
  time: number;
  points: { type: string; coordinates: number[][] };
}

interface GraphHopperResponse {
  paths?: GraphHopperPath[];
  message?: string;
}

function toRoutedPath(p: GraphHopperPath): RoutedPath {
  return {
    durationSeconds: p.time / 1000,
    distanceMeters: p.distance,
    coordinates: p.points.coordinates.map(([lng, lat]) => [lat, lng]),
  };
}

export class GraphHopperProvider implements RoutingProvider {
  readonly name = "graphhopper";
  readonly supportedProfiles: ReadonlySet<RoutingProfile> = new Set([
    "foot",
    "bike",
    "car",
  ]);

  constructor(private readonly apiKey: string) {
    if (!apiKey) {
      throw new RoutingError(
        "GRAPHHOPPER_API_KEY is required to use the GraphHopper routing provider",
        500,
      );
    }
  }

  async fetchRoute(
    origin: LatLng,
    destination: LatLng,
    profile: RoutingProfile,
    opts: { alternatives?: boolean } = {},
  ): Promise<RouteResult> {
    const params = new URLSearchParams();
    params.append("point", `${origin.lat},${origin.lng}`);
    params.append("point", `${destination.lat},${destination.lng}`);
    params.set("profile", profile);
    params.set("points_encoded", "false");
    params.set("instructions", "false");
    params.set("calc_points", "true");
    params.set("locale", "es");
    params.set("key", this.apiKey);

    // Bike: ask for elevation so the profile penalises uphill segments.
    // Santiago (Lo Barnechea, Las Condes) has real grade — without this the
    // bike ETA collapses to a flat-ground estimate.
    if (profile === "bike") {
      params.set("elevation", "true");
    }

    if (opts.alternatives && profile === "car") {
      params.set("algorithm", "alternative_route");
      params.set("alternative_route.max_paths", "2");
      params.set("alternative_route.max_weight_factor", "1.6");
      params.set("alternative_route.max_share_factor", "0.6");
    }

    const url = `${BASE}?${params.toString()}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(25_000) });

    if (!res.ok) {
      let msg = `GraphHopper ${res.status}`;
      try {
        const body = (await res.json()) as { message?: string };
        if (body?.message) msg = `GraphHopper: ${body.message}`;
      } catch {
        // ignore
      }
      throw new RoutingError(msg, res.status === 401 ? 500 : 502);
    }

    const data = (await res.json()) as GraphHopperResponse;
    if (!data.paths?.length) {
      throw new RoutingError("No route found for this mode", 404);
    }

    const parsed = data.paths.map(toRoutedPath);
    return { primary: parsed[0], alternatives: parsed.slice(1) };
  }
}
