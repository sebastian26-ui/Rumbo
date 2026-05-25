import {
  LatLng,
  Leg,
  TransitError,
  TransitFare,
  TransitLeg,
  TransitProvider,
  TransitRouteResult,
  TransitVehicleType,
  WalkLeg,
} from "./provider";
import { decodePolyline } from "./polyline";

const BASE = "https://maps.googleapis.com/maps/api/directions/json";

interface GoogleStep {
  travel_mode: "WALKING" | "TRANSIT" | string;
  distance?: { value: number };
  duration?: { value: number };
  html_instructions?: string;
  polyline?: { points: string };
  transit_details?: GoogleTransitDetails;
}

interface GoogleTransitDetails {
  departure_stop?: { name?: string };
  arrival_stop?: { name?: string };
  departure_time?: { value?: number; text?: string };
  arrival_time?: { value?: number; text?: string };
  headsign?: string;
  num_stops?: number;
  line?: {
    name?: string;
    short_name?: string;
    color?: string;
    text_color?: string;
    vehicle?: {
      type?: string;
      name?: string;
      icon?: string;
    };
  };
}

interface GoogleLeg {
  distance?: { value: number };
  duration?: { value: number };
  departure_time?: { value?: number; text?: string };
  arrival_time?: { value?: number; text?: string };
  steps: GoogleStep[];
}

interface GoogleRoute {
  legs: GoogleLeg[];
  fare?: { currency: string; value: number; text: string };
}

interface GoogleResponse {
  status: string;
  routes?: GoogleRoute[];
  error_message?: string;
}

const VEHICLE_TYPE_MAP: Record<string, TransitVehicleType> = {
  BUS: "BUS",
  INTERCITY_BUS: "BUS",
  TROLLEYBUS: "BUS",
  SHARE_TAXI: "BUS",
  SUBWAY: "SUBWAY",
  METRO_RAIL: "SUBWAY",
  HEAVY_RAIL: "RAIL",
  COMMUTER_TRAIN: "RAIL",
  HIGH_SPEED_TRAIN: "RAIL",
  LONG_DISTANCE_TRAIN: "RAIL",
  RAIL: "RAIL",
  MONORAIL: "RAIL",
  TRAM: "TRAM",
  CABLE_CAR: "TRAM",
  GONDOLA_LIFT: "TRAM",
  FUNICULAR: "TRAM",
};

function mapVehicleType(raw: string | undefined): TransitVehicleType {
  if (!raw) return "OTHER";
  return VEHICLE_TYPE_MAP[raw.toUpperCase()] || "OTHER";
}

function parseStep(step: GoogleStep): Leg | null {
  const distanceMeters = step.distance?.value ?? 0;
  const durationSeconds = step.duration?.value ?? 0;
  const coordinates = step.polyline?.points
    ? decodePolyline(step.polyline.points)
    : [];

  if (step.travel_mode === "WALKING") {
    const leg: WalkLeg = {
      kind: "walk",
      durationSeconds,
      distanceMeters,
      coordinates,
      instructions: step.html_instructions
        ? step.html_instructions.replace(/<[^>]*>/g, "")
        : null,
    };
    return leg;
  }

  if (step.travel_mode === "TRANSIT") {
    const td = step.transit_details ?? {};
    const line = td.line ?? {};
    const vehicle = line.vehicle ?? {};
    const leg: TransitLeg = {
      kind: "transit",
      durationSeconds,
      distanceMeters,
      coordinates,
      vehicleType: mapVehicleType(vehicle.type),
      lineShortName: line.short_name ?? null,
      lineLongName: line.name ?? null,
      lineColor: line.color ?? null,
      lineTextColor: line.text_color ?? null,
      headsign: td.headsign ?? null,
      numStops: typeof td.num_stops === "number" ? td.num_stops : null,
      departureStop: td.departure_stop?.name ?? null,
      arrivalStop: td.arrival_stop?.name ?? null,
      // Google Directions doesn't expose DTPM paradero codes — live ETAs are
      // unavailable for this leg, UI will fall back to the scheduled time.
      departureStopCode: null,
      arrivalStopCode: null,
      departureTimeUnix: td.departure_time?.value ?? null,
      arrivalTimeUnix: td.arrival_time?.value ?? null,
    };
    return leg;
  }

  // Unknown travel_mode (e.g. driving sub-step in a transit route) — skip.
  return null;
}

export class GoogleTransitProvider implements TransitProvider {
  readonly name = "google";

  constructor(private readonly apiKey: string) {
    if (!apiKey) {
      throw new TransitError(
        "GOOGLE_MAPS_API_KEY is required to use the Google transit provider",
        500,
      );
    }
  }

  async fetchTransitRoute(
    origin: LatLng,
    destination: LatLng,
    opts: { departureTime?: Date } = {},
  ): Promise<TransitRouteResult> {
    const departureSeconds = Math.floor(
      (opts.departureTime ?? new Date()).getTime() / 1000,
    );

    const params = new URLSearchParams({
      origin: `${origin.lat},${origin.lng}`,
      destination: `${destination.lat},${destination.lng}`,
      mode: "transit",
      // Allow Google to combine bus + subway + rail freely; Santiago trips
      // are dominated by Metro + micro mixes.
      transit_mode: "bus|subway|rail|train|tram",
      departure_time: String(departureSeconds),
      alternatives: "false",
      language: "es",
      region: "cl",
      key: this.apiKey,
    });

    const url = `${BASE}?${params.toString()}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(25_000) });

    if (!res.ok) {
      throw new TransitError(`Google Directions HTTP ${res.status}`, 502);
    }

    const data = (await res.json()) as GoogleResponse;

    if (data.status === "REQUEST_DENIED") {
      throw new TransitError(
        `Google Directions denied: ${data.error_message || "check API key, billing, and that the Directions API is enabled"}`,
        500,
      );
    }

    if (
      data.status === "ZERO_RESULTS" ||
      data.status === "NOT_FOUND" ||
      !data.routes?.length
    ) {
      return {
        available: false,
        status: "No public-transit route found for this trip right now.",
        totalDurationSeconds: null,
        legs: [],
        fare: null,
        firstTransitDepartureUnix: null,
      };
    }

    if (data.status !== "OK") {
      throw new TransitError(
        `Google Directions: ${data.status}${data.error_message ? ` — ${data.error_message}` : ""}`,
        502,
      );
    }

    const route = data.routes[0];
    const googleLeg = route.legs[0];
    if (!googleLeg) {
      return {
        available: false,
        status: "No public-transit route found for this trip right now.",
        totalDurationSeconds: null,
        legs: [],
        fare: null,
        firstTransitDepartureUnix: null,
      };
    }

    const legs: Leg[] = [];
    for (const step of googleLeg.steps) {
      const parsed = parseStep(step);
      if (parsed) legs.push(parsed);
    }

    const fare: TransitFare | null = route.fare
      ? {
          currency: route.fare.currency,
          value: route.fare.value,
          text: route.fare.text,
        }
      : null;

    const firstTransit = legs.find(
      (l): l is TransitLeg => l.kind === "transit",
    );

    return {
      available: legs.length > 0,
      status:
        legs.length > 0
          ? "Live transit route from Google Directions"
          : "No public-transit route found for this trip right now.",
      totalDurationSeconds: googleLeg.duration?.value ?? null,
      legs,
      fare,
      firstTransitDepartureUnix: firstTransit?.departureTimeUnix ?? null,
    };
  }
}
