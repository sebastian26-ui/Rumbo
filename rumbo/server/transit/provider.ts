export type TransitVehicleType = "BUS" | "SUBWAY" | "RAIL" | "TRAM" | "OTHER";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface WalkLeg {
  kind: "walk";
  durationSeconds: number;
  distanceMeters: number;
  coordinates: [number, number][];
  instructions?: string | null;
}

export interface TransitLeg {
  kind: "transit";
  durationSeconds: number;
  distanceMeters: number;
  coordinates: [number, number][];
  vehicleType: TransitVehicleType;
  lineShortName: string | null;
  lineLongName: string | null;
  lineColor: string | null;
  lineTextColor: string | null;
  headsign: string | null;
  numStops: number | null;
  departureStop: string | null;
  arrivalStop: string | null;
  /** Public paradero code for the boarding stop (e.g. "PA433"), when the
   *  static GTFS feed exposes one. Required for live ETA lookups. */
  departureStopCode: string | null;
  /** Public paradero code for the alighting stop. */
  arrivalStopCode: string | null;
  departureTimeUnix: number | null;
  arrivalTimeUnix: number | null;
}

export type Leg = WalkLeg | TransitLeg;

export interface TransitFare {
  currency: string;
  value: number;
  text: string;
}

export interface TransitRouteResult {
  available: boolean;
  /** Human-readable explanation, surfaced verbatim in the UI. */
  status: string;
  totalDurationSeconds: number | null;
  legs: Leg[];
  fare: TransitFare | null;
  /** Unix seconds of the first TRANSIT leg's departure — for "Next X in N min". */
  firstTransitDepartureUnix: number | null;
}

export interface TransitProvider {
  readonly name: string;
  fetchTransitRoute(
    origin: LatLng,
    destination: LatLng,
    opts?: { departureTime?: Date },
  ): Promise<TransitRouteResult>;
}

export class TransitError extends Error {
  constructor(
    message: string,
    readonly status: number = 502,
  ) {
    super(message);
    this.name = "TransitError";
  }
}
