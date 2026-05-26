/**
 * In-process GTFS refresh scheduler.
 *
 * Runs `server/gtfs/ingest.ts` as a child process when:
 *   1. The DB is missing on boot (bootstrap), or
 *   2. The DB on disk is older than GTFS_MAX_AGE_DAYS (default 7).
 *
 * Lives inside the existing app process so we don't need a separate Fly
 * Machine for the volume — Fly volumes attach to one machine at a time, so
 * an in-process job is the simplest way to keep `/data/gtfs.db` fresh.
 *
 * The child runs with --max-old-space-size to keep Node's heap under the
 * machine's memory cap during the 1M+ row stop_times load. Set
 * GTFS_INGEST_MAX_HEAP_MB to override (default 768).
 *
 * Schedule check fires every GTFS_CHECK_INTERVAL_HOURS (default 24h). The
 * actual ingest only runs when the age threshold is exceeded, so this is
 * effectively weekly while remaining responsive to a stale DB after a long
 * machine sleep.
 *
 * Disable entirely by setting GTFS_AUTO_REFRESH=0.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "../logger";
import { gtfsDbPath } from "./db";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_MAX_AGE_DAYS = 7;
const DEFAULT_CHECK_INTERVAL_HOURS = 24;
const DEFAULT_INGEST_HEAP_MB = 768;

let inFlight = false;
let intervalHandle: NodeJS.Timeout | null = null;

function maxAgeDays(): number {
  const v = Number(process.env.GTFS_MAX_AGE_DAYS);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_MAX_AGE_DAYS;
}

function checkIntervalMs(): number {
  const v = Number(process.env.GTFS_CHECK_INTERVAL_HOURS);
  const hours = Number.isFinite(v) && v > 0 ? v : DEFAULT_CHECK_INTERVAL_HOURS;
  return hours * 60 * 60 * 1000;
}

function ingestHeapMb(): number {
  const v = Number(process.env.GTFS_INGEST_MAX_HEAP_MB);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_INGEST_HEAP_MB;
}

interface DbStatus {
  exists: boolean;
  ageDays: number | null;
  stale: boolean;
}

export function gtfsDbStatus(): DbStatus {
  const p = gtfsDbPath();
  if (!fs.existsSync(p)) {
    return { exists: false, ageDays: null, stale: true };
  }
  const stat = fs.statSync(p);
  const ageDays = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60 * 24);
  return { exists: true, ageDays, stale: ageDays > maxAgeDays() };
}

function runIngest(reason: string): void {
  if (inFlight) {
    logger.info({ reason }, "[gtfs] refresh requested but ingest already running");
    return;
  }
  inFlight = true;

  const ingestPath = path.join(__dirname, "ingest.ts");
  const heapMb = ingestHeapMb();

  // Find tsx CLI relative to this module. It's in node_modules/.bin from
  // the npm install. Works in dev and inside the Fly container.
  const tsxBin = path.resolve(__dirname, "../../node_modules/.bin/tsx");

  logger.info(
    { reason, ingestPath, heapMb, tsxBin },
    "[gtfs] starting background ingest",
  );

  const child = spawn(tsxBin, [ingestPath], {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      // Cap the child's V8 heap so the ingest of stop_times.txt
      // (~50 MB CSV, 1M+ rows) doesn't push the machine into OOM.
      NODE_OPTIONS: `${process.env.NODE_OPTIONS || ""} --max-old-space-size=${heapMb}`.trim(),
    },
    detached: false,
  });

  child.stdout?.on("data", (buf: Buffer) => {
    for (const line of buf.toString().split("\n")) {
      const trimmed = line.trim();
      if (trimmed) logger.info({ src: "gtfs-ingest" }, trimmed);
    }
  });
  child.stderr?.on("data", (buf: Buffer) => {
    for (const line of buf.toString().split("\n")) {
      const trimmed = line.trim();
      if (trimmed) logger.warn({ src: "gtfs-ingest" }, trimmed);
    }
  });

  child.on("error", (err) => {
    inFlight = false;
    logger.error({ err, reason }, "[gtfs] ingest child failed to spawn");
  });
  child.on("exit", (code, signal) => {
    inFlight = false;
    if (code === 0) {
      logger.info({ reason }, "[gtfs] ingest finished — db refreshed");
    } else {
      logger.error(
        { code, signal, reason },
        "[gtfs] ingest exited non-zero — db not refreshed",
      );
    }
  });
}

/**
 * Call once at boot, AFTER the HTTP server is listening. Idempotent —
 * starting twice replaces the interval. Logs a clear warning if the DB is
 * missing, and kicks off a background ingest if auto-refresh is on.
 */
export function startGtfsScheduler(): void {
  const status = gtfsDbStatus();

  if (!status.exists) {
    logger.warn(
      {
        dbPath: gtfsDbPath(),
        hint: "run `npm run gtfs:ingest` locally, or wait for auto-refresh on the Fly machine",
      },
      "[gtfs] WARNING: GTFS database is missing — transit routing will fail until ingest completes",
    );
  } else if (status.stale) {
    logger.warn(
      { ageDays: status.ageDays, maxAgeDays: maxAgeDays() },
      "[gtfs] GTFS database is older than the max-age threshold — will refresh",
    );
  } else {
    logger.info({ ageDays: status.ageDays }, "[gtfs] database OK");
  }

  if (process.env.GTFS_AUTO_REFRESH === "0") {
    logger.info("[gtfs] auto-refresh disabled (GTFS_AUTO_REFRESH=0)");
    return;
  }

  if (status.stale) {
    runIngest(status.exists ? "stale-on-boot" : "missing-on-boot");
  }

  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = setInterval(() => {
    const s = gtfsDbStatus();
    if (s.stale) runIngest("stale-on-interval");
  }, checkIntervalMs());
  // Don't keep the event loop alive just for the scheduler.
  intervalHandle.unref?.();
}

export function _stopGtfsScheduler(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
