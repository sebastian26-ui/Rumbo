import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";

const DEFAULT_DB_PATH = path.join(process.cwd(), "data", "gtfs.db");

export function gtfsDbPath(): string {
  return process.env.GTFS_DB_PATH || DEFAULT_DB_PATH;
}

export function gtfsDbExists(): boolean {
  return fs.existsSync(gtfsDbPath());
}

let cached: Database.Database | null = null;

export function openGtfsDb(): Database.Database {
  if (cached) return cached;
  const p = gtfsDbPath();
  if (!fs.existsSync(p)) {
    throw new Error(
      `GTFS database not found at ${p}. Run \`npm run gtfs:ingest\` to build it.`,
    );
  }
  const db = new Database(p, { readonly: true, fileMustExist: true });
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("temp_store = MEMORY");
  db.pragma("mmap_size = 268435456"); // 256MB
  cached = db;
  return db;
}

export function _resetGtfsDb() {
  if (cached) {
    try {
      cached.close();
    } catch {
      // ignore
    }
    cached = null;
  }
}

/** Schema applied during ingest. Keep in sync with ingest.ts. */
export const SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS agency (
  agency_id TEXT PRIMARY KEY,
  agency_name TEXT,
  agency_url TEXT,
  agency_timezone TEXT,
  agency_phone TEXT,
  agency_lang TEXT
);

CREATE TABLE IF NOT EXISTS stops (
  stop_id TEXT PRIMARY KEY,
  stop_code TEXT,
  stop_name TEXT,
  stop_lat REAL,
  stop_lon REAL,
  location_type INTEGER,
  parent_station TEXT,
  wheelchair_boarding INTEGER
);
CREATE INDEX IF NOT EXISTS idx_stops_lat ON stops(stop_lat);
CREATE INDEX IF NOT EXISTS idx_stops_lon ON stops(stop_lon);

CREATE TABLE IF NOT EXISTS routes (
  route_id TEXT PRIMARY KEY,
  agency_id TEXT,
  route_short_name TEXT,
  route_long_name TEXT,
  route_desc TEXT,
  route_type INTEGER,
  route_color TEXT,
  route_text_color TEXT
);

CREATE TABLE IF NOT EXISTS trips (
  trip_id TEXT PRIMARY KEY,
  route_id TEXT,
  service_id TEXT,
  trip_headsign TEXT,
  direction_id INTEGER,
  shape_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_trips_route ON trips(route_id);
CREATE INDEX IF NOT EXISTS idx_trips_service ON trips(service_id);
CREATE INDEX IF NOT EXISTS idx_trips_shape ON trips(shape_id);

CREATE TABLE IF NOT EXISTS stop_times (
  trip_id TEXT,
  arrival_time TEXT,
  departure_time TEXT,
  arrival_seconds INTEGER,
  departure_seconds INTEGER,
  stop_id TEXT,
  stop_sequence INTEGER,
  pickup_type INTEGER,
  drop_off_type INTEGER,
  shape_dist_traveled REAL,
  PRIMARY KEY (trip_id, stop_sequence)
);
CREATE INDEX IF NOT EXISTS idx_st_stop ON stop_times(stop_id);
CREATE INDEX IF NOT EXISTS idx_st_trip ON stop_times(trip_id);

CREATE TABLE IF NOT EXISTS shapes (
  shape_id TEXT,
  shape_pt_lat REAL,
  shape_pt_lon REAL,
  shape_pt_sequence INTEGER,
  shape_dist_traveled REAL,
  PRIMARY KEY (shape_id, shape_pt_sequence)
);

CREATE TABLE IF NOT EXISTS calendar (
  service_id TEXT PRIMARY KEY,
  monday INTEGER,
  tuesday INTEGER,
  wednesday INTEGER,
  thursday INTEGER,
  friday INTEGER,
  saturday INTEGER,
  sunday INTEGER,
  start_date TEXT,
  end_date TEXT
);

CREATE TABLE IF NOT EXISTS calendar_dates (
  service_id TEXT,
  date TEXT,
  exception_type INTEGER,
  PRIMARY KEY (service_id, date)
);

CREATE TABLE IF NOT EXISTS fare_attributes (
  fare_id TEXT PRIMARY KEY,
  price REAL,
  currency_type TEXT,
  payment_method INTEGER,
  transfers INTEGER,
  transfer_duration INTEGER,
  agency_id TEXT
);

CREATE TABLE IF NOT EXISTS fare_rules (
  fare_id TEXT,
  route_id TEXT,
  origin_id TEXT,
  destination_id TEXT,
  contains_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_fr_route ON fare_rules(route_id);

CREATE TABLE IF NOT EXISTS frequencies (
  trip_id TEXT,
  start_seconds INTEGER,
  end_seconds INTEGER,
  headway_secs INTEGER,
  exact_times INTEGER,
  PRIMARY KEY (trip_id, start_seconds)
);
CREATE INDEX IF NOT EXISTS idx_freq_trip ON frequencies(trip_id);

-- Per-trip template t0 = first stop's departure_seconds. Computed during
-- ingest so the provider doesn't have to MIN() per query.
CREATE TABLE IF NOT EXISTS trip_template (
  trip_id TEXT PRIMARY KEY,
  template_t0_seconds INTEGER
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
`;
