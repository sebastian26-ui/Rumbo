/**
 * Build the GTFS SQLite cache from the DTPM "vigente" feed.
 *
 *   npm run gtfs:ingest
 *
 * Sources, in priority order:
 *   1. GTFS_ZIP_PATH  — local path to a pre-downloaded zip
 *   2. GTFS_ZIP_URL   — HTTPS URL to the zip
 *   3. The DTPM page  — https://www.dtpm.cl/index.php/noticias/gtfs-vigente
 *      The page is HTML; we scrape the first .zip link from it.
 *
 * Output: data/gtfs.db (overridable via GTFS_DB_PATH).
 *
 * The raw zip and the resulting DB are gitignored — they are large and
 * reproducible from the feed.
 */
import "dotenv/config";
import * as Sentry from "@sentry/node";
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: 0,
  });
}

import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import Database from "better-sqlite3";
import { streamCsv } from "./csv";
import { SCHEMA_DDL, gtfsDbPath } from "./db";

const DTPM_NEWS_PAGE = "https://www.dtpm.cl/index.php/noticias/gtfs-vigente";

interface CliOptions {
  zipPath?: string;
  zipUrl?: string;
  dbPath: string;
  workDir: string;
  keepRaw: boolean;
}

function parseOptions(): CliOptions {
  const dbPath = gtfsDbPath();
  const workDir = path.join(process.cwd(), "data", "gtfs");
  return {
    zipPath: process.env.GTFS_ZIP_PATH || undefined,
    zipUrl: process.env.GTFS_ZIP_URL || undefined,
    dbPath,
    workDir,
    keepRaw: process.env.GTFS_KEEP_RAW === "1",
  };
}

async function fetchZipUrlFromDtpm(): Promise<string> {
  console.log(`[gtfs] no GTFS_ZIP_URL set, scraping ${DTPM_NEWS_PAGE}`);
  const res = await fetch(DTPM_NEWS_PAGE, {
    signal: AbortSignal.timeout(30_000),
    headers: {
      "User-Agent":
        "Rumbo-GTFS-Ingest/1.0 (+https://github.com; mobility app)",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) {
    throw new Error(
      `DTPM page HTTP ${res.status}. Set GTFS_ZIP_URL or GTFS_ZIP_PATH manually.`,
    );
  }
  const html = await res.text();

  const matches = Array.from(
    html.matchAll(/href=["']([^"']+\.zip)["']/gi),
  ).map((m) => m[1]);

  if (!matches.length) {
    throw new Error(
      "No .zip link found on DTPM page. They may have changed the layout — " +
        "set GTFS_ZIP_URL or GTFS_ZIP_PATH manually.",
    );
  }
  // Prefer the first link that looks like the GTFS feed.
  const preferred =
    matches.find((u) => /gtfs/i.test(u)) ||
    matches.find((u) => /transantiago|red/i.test(u)) ||
    matches[0];

  return new URL(preferred, DTPM_NEWS_PAGE).toString();
}

async function downloadZip(url: string, destPath: string): Promise<void> {
  console.log(`[gtfs] downloading ${url}`);
  const res = await fetch(url, {
    signal: AbortSignal.timeout(120_000),
    headers: {
      "User-Agent":
        "Rumbo-GTFS-Ingest/1.0 (+https://github.com; mobility app)",
    },
  });
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
  await fs.promises.writeFile(destPath, buf);
  const sizeMb = (buf.length / 1024 / 1024).toFixed(1);
  console.log(`[gtfs] downloaded ${sizeMb} MB to ${destPath}`);
}

function extractZip(zipPath: string, outDir: string): void {
  console.log(`[gtfs] extracting ${zipPath} -> ${outDir}`);
  fs.mkdirSync(outDir, { recursive: true });
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(outDir, true);
}

interface TableLoad {
  file: string;
  table: string;
  columns: string[];
  transform?: (row: Record<string, string>) => Record<string, unknown>;
}

const LOADS: TableLoad[] = [
  {
    file: "agency.txt",
    table: "agency",
    columns: [
      "agency_id",
      "agency_name",
      "agency_url",
      "agency_timezone",
      "agency_phone",
      "agency_lang",
    ],
  },
  {
    file: "stops.txt",
    table: "stops",
    columns: [
      "stop_id",
      "stop_code",
      "stop_name",
      "stop_lat",
      "stop_lon",
      "location_type",
      "parent_station",
      "wheelchair_boarding",
    ],
    transform: (r) => ({
      stop_id: r.stop_id,
      stop_code: r.stop_code || null,
      stop_name: r.stop_name || null,
      stop_lat: numOrNull(r.stop_lat),
      stop_lon: numOrNull(r.stop_lon),
      location_type: intOrNull(r.location_type),
      parent_station: r.parent_station || null,
      wheelchair_boarding: intOrNull(r.wheelchair_boarding),
    }),
  },
  {
    file: "routes.txt",
    table: "routes",
    columns: [
      "route_id",
      "agency_id",
      "route_short_name",
      "route_long_name",
      "route_desc",
      "route_type",
      "route_color",
      "route_text_color",
    ],
    transform: (r) => ({
      route_id: r.route_id,
      agency_id: r.agency_id || null,
      route_short_name: r.route_short_name || null,
      route_long_name: r.route_long_name || null,
      route_desc: r.route_desc || null,
      route_type: intOrNull(r.route_type),
      route_color: r.route_color || null,
      route_text_color: r.route_text_color || null,
    }),
  },
  {
    file: "trips.txt",
    table: "trips",
    columns: [
      "trip_id",
      "route_id",
      "service_id",
      "trip_headsign",
      "direction_id",
      "shape_id",
    ],
    transform: (r) => ({
      trip_id: r.trip_id,
      route_id: r.route_id,
      service_id: r.service_id,
      trip_headsign: r.trip_headsign || null,
      direction_id: intOrNull(r.direction_id),
      shape_id: r.shape_id || null,
    }),
  },
  {
    file: "stop_times.txt",
    table: "stop_times",
    columns: [
      "trip_id",
      "arrival_time",
      "departure_time",
      "arrival_seconds",
      "departure_seconds",
      "stop_id",
      "stop_sequence",
      "pickup_type",
      "drop_off_type",
      "shape_dist_traveled",
    ],
    transform: (r) => ({
      trip_id: r.trip_id,
      arrival_time: r.arrival_time || null,
      departure_time: r.departure_time || null,
      arrival_seconds: hhmmssToSeconds(r.arrival_time),
      departure_seconds: hhmmssToSeconds(r.departure_time),
      stop_id: r.stop_id,
      stop_sequence: intOrNull(r.stop_sequence) ?? 0,
      pickup_type: intOrNull(r.pickup_type),
      drop_off_type: intOrNull(r.drop_off_type),
      shape_dist_traveled: numOrNull(r.shape_dist_traveled),
    }),
  },
  {
    file: "shapes.txt",
    table: "shapes",
    columns: [
      "shape_id",
      "shape_pt_lat",
      "shape_pt_lon",
      "shape_pt_sequence",
      "shape_dist_traveled",
    ],
    transform: (r) => ({
      shape_id: r.shape_id,
      shape_pt_lat: numOrNull(r.shape_pt_lat),
      shape_pt_lon: numOrNull(r.shape_pt_lon),
      shape_pt_sequence: intOrNull(r.shape_pt_sequence) ?? 0,
      shape_dist_traveled: numOrNull(r.shape_dist_traveled),
    }),
  },
  {
    file: "calendar.txt",
    table: "calendar",
    columns: [
      "service_id",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
      "start_date",
      "end_date",
    ],
    transform: (r) => ({
      service_id: r.service_id,
      monday: intOrNull(r.monday) ?? 0,
      tuesday: intOrNull(r.tuesday) ?? 0,
      wednesday: intOrNull(r.wednesday) ?? 0,
      thursday: intOrNull(r.thursday) ?? 0,
      friday: intOrNull(r.friday) ?? 0,
      saturday: intOrNull(r.saturday) ?? 0,
      sunday: intOrNull(r.sunday) ?? 0,
      start_date: r.start_date || null,
      end_date: r.end_date || null,
    }),
  },
  {
    file: "calendar_dates.txt",
    table: "calendar_dates",
    columns: ["service_id", "date", "exception_type"],
    transform: (r) => ({
      service_id: r.service_id,
      date: r.date,
      exception_type: intOrNull(r.exception_type) ?? 1,
    }),
  },
  {
    file: "fare_attributes.txt",
    table: "fare_attributes",
    columns: [
      "fare_id",
      "price",
      "currency_type",
      "payment_method",
      "transfers",
      "transfer_duration",
      "agency_id",
    ],
    transform: (r) => ({
      fare_id: r.fare_id,
      price: numOrNull(r.price),
      currency_type: r.currency_type || null,
      payment_method: intOrNull(r.payment_method),
      transfers: intOrNull(r.transfers),
      transfer_duration: intOrNull(r.transfer_duration),
      agency_id: r.agency_id || null,
    }),
  },
  {
    file: "fare_rules.txt",
    table: "fare_rules",
    columns: [
      "fare_id",
      "route_id",
      "origin_id",
      "destination_id",
      "contains_id",
    ],
    transform: (r) => ({
      fare_id: r.fare_id,
      route_id: r.route_id || null,
      origin_id: r.origin_id || null,
      destination_id: r.destination_id || null,
      contains_id: r.contains_id || null,
    }),
  },
  {
    file: "frequencies.txt",
    table: "frequencies",
    columns: [
      "trip_id",
      "start_seconds",
      "end_seconds",
      "headway_secs",
      "exact_times",
    ],
    transform: (r) => ({
      trip_id: r.trip_id,
      start_seconds: hhmmssToSeconds(r.start_time) ?? 0,
      end_seconds: hhmmssToSeconds(r.end_time) ?? 0,
      headway_secs: intOrNull(r.headway_secs) ?? 0,
      exact_times: intOrNull(r.exact_times),
    }),
  },
];

function numOrNull(s: string | undefined): number | null {
  if (s == null || s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function intOrNull(s: string | undefined): number | null {
  if (s == null || s === "") return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse a GTFS HH:MM:SS time-of-day. The standard allows hours >= 24 to
 * represent service that crosses midnight (a trip whose service date is
 * Monday with departure_time=25:30:00 actually departs at 01:30 on Tuesday).
 * Returns seconds since the trip's service-date midnight, or null.
 */
function hhmmssToSeconds(s: string | undefined): number | null {
  if (!s) return null;
  const m = /^(\d{1,3}):(\d{2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

async function loadTable(
  db: Database.Database,
  feedDir: string,
  load: TableLoad,
): Promise<number> {
  const filePath = path.join(feedDir, load.file);
  if (!fs.existsSync(filePath)) {
    console.log(`[gtfs] ${load.file} not in feed, skipping`);
    return 0;
  }
  const placeholders = load.columns.map((c) => `@${c}`).join(",");
  const sql = `INSERT OR REPLACE INTO ${load.table} (${load.columns.join(",")}) VALUES (${placeholders})`;
  const stmt = db.prepare(sql);

  const BATCH = 1000;
  let buffer: Record<string, unknown>[] = [];
  let total = 0;

  const flushBatch = db.transaction((rows: Record<string, unknown>[]) => {
    for (const r of rows) stmt.run(r);
  });

  console.log(`[gtfs] loading ${load.file} -> ${load.table}`);
  for await (const row of streamCsv(filePath)) {
    const transformed = load.transform
      ? load.transform(row)
      : pickColumns(row, load.columns);
    buffer.push(transformed);
    if (buffer.length >= BATCH) {
      flushBatch(buffer);
      total += buffer.length;
      buffer = [];
      if (total % 200_000 === 0) {
        console.log(`[gtfs]   ${load.table}: ${total.toLocaleString()} rows`);
      }
    }
  }
  if (buffer.length) {
    flushBatch(buffer);
    total += buffer.length;
  }
  console.log(`[gtfs]   ${load.table}: ${total.toLocaleString()} rows`);
  return total;
}

function pickColumns(
  row: Record<string, string>,
  cols: string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const c of cols) {
    const v = row[c];
    out[c] = v === undefined || v === "" ? null : v;
  }
  return out;
}

function applyDDL(db: Database.Database, ddl: string) {
  const statements = ddl
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const s of statements) {
    db.prepare(s).run();
  }
}

async function main() {
  const opts = parseOptions();
  console.log(`[gtfs] target db: ${opts.dbPath}`);

  fs.mkdirSync(opts.workDir, { recursive: true });
  const localZipPath = path.join(opts.workDir, "feed.zip");
  const feedDir = path.join(opts.workDir, "extracted");

  let zipPath: string;
  if (opts.zipPath) {
    if (!fs.existsSync(opts.zipPath)) {
      throw new Error(`GTFS_ZIP_PATH=${opts.zipPath} does not exist`);
    }
    zipPath = opts.zipPath;
    console.log(`[gtfs] using local zip ${zipPath}`);
  } else {
    const url = opts.zipUrl || (await fetchZipUrlFromDtpm());
    await downloadZip(url, localZipPath);
    zipPath = localZipPath;
  }

  if (fs.existsSync(feedDir)) fs.rmSync(feedDir, { recursive: true, force: true });
  extractZip(zipPath, feedDir);

  const resolvedFeedDir = findFeedDir(feedDir);
  console.log(`[gtfs] feed root: ${resolvedFeedDir}`);

  // Build the new DB next to the destination so the final swap is an
  // atomic intra-filesystem rename. Building under os.tmpdir() breaks on
  // Fly, where /tmp is a tmpfs and /data is a mounted volume — renameSync
  // fails with EXDEV across filesystems.
  fs.mkdirSync(path.dirname(opts.dbPath), { recursive: true });
  const tmpDbPath = path.join(
    path.dirname(opts.dbPath),
    `.${path.basename(opts.dbPath)}.tmp-${Date.now()}-${process.pid}`,
  );
  const db = new Database(tmpDbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = OFF");
  db.pragma("temp_store = MEMORY");
  applyDDL(db, SCHEMA_DDL);

  for (const load of LOADS) {
    await loadTable(db, resolvedFeedDir, load);
  }

  // Materialise the per-trip template t0 so frequency expansion at query
  // time can do (trip_start + offset) without a per-row MIN() subquery.
  console.log(`[gtfs] computing trip_template (per-trip first departure)`);
  db.prepare(
    `INSERT INTO trip_template (trip_id, template_t0_seconds)
     SELECT trip_id, MIN(departure_seconds)
     FROM stop_times
     WHERE departure_seconds IS NOT NULL
     GROUP BY trip_id`,
  ).run();

  const stampStmt = db.prepare(
    "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
  );
  stampStmt.run("ingested_at", new Date().toISOString());
  stampStmt.run("source_zip", zipPath);

  console.log(`[gtfs] running ANALYZE`);
  db.prepare("ANALYZE").run();

  db.close();

  for (const suffix of ["", "-wal", "-shm"]) {
    const src = `${tmpDbPath}${suffix}`;
    const dst = `${opts.dbPath}${suffix}`;
    if (fs.existsSync(src)) {
      fs.renameSync(src, dst);
    } else if (fs.existsSync(dst)) {
      fs.unlinkSync(dst);
    }
  }
  console.log(`[gtfs] done -> ${opts.dbPath}`);

  if (!opts.keepRaw) {
    fs.rmSync(feedDir, { recursive: true, force: true });
  }
}

function findFeedDir(rootDir: string): string {
  const hasFeedFile = (dir: string) =>
    fs.existsSync(path.join(dir, "stops.txt")) &&
    fs.existsSync(path.join(dir, "routes.txt"));

  if (hasFeedFile(rootDir)) return rootDir;
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const sub = path.join(rootDir, e.name);
    if (hasFeedFile(sub)) return sub;
  }
  throw new Error(
    `Could not find stops.txt/routes.txt under ${rootDir} — feed layout unexpected.`,
  );
}

main().catch(async (e) => {
  console.error("[gtfs] ingest failed:", e);
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(e, {
      tags: { job: "gtfs-ingest" },
      level: "error",
    });
    // Cron jobs exit quickly; give Sentry a moment to flush before bailing.
    try {
      await Sentry.flush(3000);
    } catch {
      /* ignore */
    }
  }
  process.exit(1);
});
