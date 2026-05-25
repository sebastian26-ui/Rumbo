export type RoutingProfile = "foot" | "bike" | "car";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RoutedPath {
  durationSeconds: number;
  distanceMeters: number;
  coordinates: [number, number][];
}

export interface RouteResult {
  primary: RoutedPath;
  alternatives: RoutedPath[];
}

export interface RoutingProvider {
  readonly name: string;
  readonly supportedProfiles: ReadonlySet<RoutingProfile>;
  fetchRoute(
    origin: LatLng,
    destination: LatLng,
    profile: RoutingProfile,
    opts?: { alternatives?: boolean },
  ): Promise<RouteResult>;
}

export class RoutingError extends Error {
  constructor(
    message: string,
    readonly status: number = 502,
  ) {
    super(message);
    this.name = "RoutingError";
  }
}
