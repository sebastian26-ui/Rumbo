import type Database from "better-sqlite3";

const WEEKDAY_COL = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export interface ServiceWindow {
  /** YYYYMMDD in the agency's local timezone. */
  yyyymmdd: string;
  /** Lowercase weekday matching the calendar.txt column name. */
  weekday: (typeof WEEKDAY_COL)[number];
  /** Seconds since local midnight at "now". */
  nowSeconds: number;
  /** Unix seconds for this calendar day's local midnight (UTC). */
  midnightUnixSec: number;
  /** IANA timezone, e.g. "America/Santiago". */
  timezone: string;
}

/**
 * Convert a UTC instant into the calendar context the GTFS feed lives in.
 * GTFS times are wall-clock seconds since the *service date's* midnight,
 * so we need both the local date and how far into it we are.
 */
export function localServiceWindow(
  now: Date,
  timezone: string,
): ServiceWindow {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";

  const Y = Number(get("year"));
  const M = Number(get("month"));
  const D = Number(get("day"));
  // en-CA renders "24" for midnight in 24h mode; normalise.
  let H = Number(get("hour"));
  if (H === 24) H = 0;
  const m = Number(get("minute"));
  const s = Number(get("second"));
  const wkdayShort = get("weekday").toLowerCase();
  const weekdayMap: Record<string, ServiceWindow["weekday"]> = {
    sun: "sunday",
    mon: "monday",
    tue: "tuesday",
    wed: "wednesday",
    thu: "thursday",
    fri: "friday",
    sat: "saturday",
  };
  const weekday = weekdayMap[wkdayShort];
  if (!weekday) {
    throw new Error(`Unrecognised weekday "${wkdayShort}" from Intl`);
  }

  // The local naive datetime expressed as UTC ms. Subtract the now's UTC ms
  // to find the timezone offset for this instant (handles DST correctly).
  const localNaiveMs = Date.UTC(Y, M - 1, D, H, m, s);
  const offsetMs = localNaiveMs - now.getTime();
  const localMidnightMs = Date.UTC(Y, M - 1, D, 0, 0, 0) - offsetMs;

  const yyyymmdd = `${Y.toString().padStart(4, "0")}${M.toString().padStart(2, "0")}${D.toString().padStart(2, "0")}`;

  return {
    yyyymmdd,
    weekday,
    nowSeconds: H * 3600 + m * 60 + s,
    midnightUnixSec: Math.floor(localMidnightMs / 1000),
    timezone,
  };
}

/** Pick the agency timezone from the feed (defaults to Santiago). */
export function feedTimezone(db: Database.Database): string {
  const row = db
    .prepare<[], { agency_timezone: string | null }>(
      `SELECT agency_timezone FROM agency
       WHERE agency_timezone IS NOT NULL AND agency_timezone <> ''
       LIMIT 1`,
    )
    .get();
  return row?.agency_timezone || "America/Santiago";
}

/**
 * service_ids active on `yyyymmdd` per calendar.txt + calendar_dates.txt.
 * (calendar window includes the day, weekday flag is 1, plus calendar_dates
 *  exception_type=1 additions, minus exception_type=2 removals.)
 */
export function activeServiceIds(
  db: Database.Database,
  window: ServiceWindow,
): Set<string> {
  const baseRows = db
    .prepare<
      [string, string],
      { service_id: string }
    >(
      `SELECT service_id FROM calendar
       WHERE start_date <= ? AND end_date >= ?
         AND ${window.weekday} = 1`,
    )
    .all(window.yyyymmdd, window.yyyymmdd);

  const services = new Set<string>(baseRows.map((r) => r.service_id));

  const exceptions = db
    .prepare<
      [string],
      { service_id: string; exception_type: number }
    >(
      `SELECT service_id, exception_type FROM calendar_dates WHERE date = ?`,
    )
    .all(window.yyyymmdd);

  for (const e of exceptions) {
    if (e.exception_type === 1) services.add(e.service_id);
    else if (e.exception_type === 2) services.delete(e.service_id);
  }

  return services;
}
