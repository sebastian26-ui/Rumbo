import "dotenv/config";
import * as Sentry from "@sentry/node";
// Initialize Sentry before any other imports/instrumentation. No-op if DSN unset.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: 0.1,
  });
}

import express, { NextFunction, Request, Response } from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "node:fs";
import { fileURLToPath } from "url";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import {
  getRoutingProvider,
  RoutingError,
  RoutingProfile,
} from "./server/routing";
import { getTransitProvider, TransitError } from "./server/transit";
import { getStopArrivals, isValidStopCode } from "./server/transit/redcl";
import { logger } from "./server/logger";
import { gtfsDbPath } from "./server/gtfs/db";
import { startGtfsScheduler } from "./server/gtfs/scheduler";
import { requireFirebaseAuth } from "./server/auth";
import { mountVerificationRoute } from "./server/routes/sendVerification";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const NOMINATIM_BASE =
  process.env.NOMINATIM_BASE_URL?.replace(/\/$/, "") ||
  "https://nominatim.openstreetmap.org";

const USER_AGENT =
  process.env.GEOCODING_USER_AGENT ||
  "Rumbo/1.0 (https://github.com; mobility app; contact: dev@localhost)";

interface LatLngBody {
  lat: number;
  lng: number;
}

async function nominatimChileSearch(
  q: string,
): Promise<{ lat: number; lng: number; label?: string } | null> {
  const params = new URLSearchParams({
    q,
    format: "json",
    limit: "1",
    addressdetails: "0",
    viewbox: "-70.85,-33.65,-70.45,-33.25",
    bounded: "1",
    countrycodes: "cl",
  });

  const url = `${NOMINATIM_BASE}/search?${params.toString()}`;
  const r = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });

  if (!r.ok) return null;

  const rows = (await r.json()) as { lat: string; lon: string; display_name?: string }[];
  if (!rows?.length) return null;

  const hit = rows[0];
  return {
    lat: parseFloat(hit.lat),
    lng: parseFloat(hit.lon),
    label: hit.display_name || q,
  };
}

async function nominatimReverse(
  lat: number,
  lng: number,
): Promise<{ label: string } | null> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    format: "json",
    zoom: "18",
    addressdetails: "0",
  });

  const url = `${NOMINATIM_BASE}/reverse?${params.toString()}`;
  const r = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });

  if (!r.ok) return null;

  const row = (await r.json()) as { display_name?: string } | null;
  if (!row?.display_name) return null;

  // Nominatim returns the full comma-separated chain; the first two parts
  // (e.g. "123, Av. Apoquindo") read as a usable short address.
  const short = row.display_name.split(",").slice(0, 2).join(",").trim();
  return { label: short || row.display_name };
}

const ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS || "https://rumbo.cl,https://www.rumbo.cl")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const standardLimitOpts = {
  standardHeaders: "draft-7" as const,
  legacyHeaders: false,
};

const routeLimiter = rateLimit({ ...standardLimitOpts, windowMs: 60_000, max: 20, message: { error: "Rate limited" } });
const routeAllLimiter = rateLimit({ ...standardLimitOpts, windowMs: 60_000, max: 10, message: { error: "Rate limited" } });
const autocompleteLimiter = rateLimit({ ...standardLimitOpts, windowMs: 60_000, max: 60, message: { error: "Rate limited" } });
const geocodeLimiter = rateLimit({ ...standardLimitOpts, windowMs: 60_000, max: 30, message: { error: "Rate limited" } });
const arrivalsLimiter = rateLimit({ ...standardLimitOpts, windowMs: 60_000, max: 30, message: { error: "Rate limited" } });
const globalLimiter = rateLimit({ ...standardLimitOpts, windowMs: 60_000, max: 240, message: { error: "Rate limited" } });

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 4000;

  // Behind Render/Cloud Run/Cloudflare we need to trust 1 proxy hop so the
  // rate limiter keys on the real client IP, not the proxy's.
  app.set("trust proxy", 1);

  app.use(
    helmet({
      // CSP needs separate tuning for Leaflet tiles + Firebase; ship without
      // CSP for v1 and revisit. All other security headers (HSTS, X-Frame,
      // X-Content-Type) are still applied.
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(
    cors({
      origin: (origin, cb) => {
        // Same-origin / curl / mobile webviews send no Origin header.
        if (!origin) return cb(null, true);
        if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
        return cb(new Error(`CORS: origin ${origin} not allowed`));
      },
      credentials: true,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: "10kb" }));
  app.use(pinoHttp({ logger }));
  app.use(globalLimiter);

  app.get("/health", (_req, res) => {
    let gtfsAgeDays: number | null = null;
    try {
      const dbPath = gtfsDbPath();
      if (fs.existsSync(dbPath)) {
        const stat = fs.statSync(dbPath);
        gtfsAgeDays = Math.floor((Date.now() - stat.mtimeMs) / (1000 * 60 * 60 * 24));
      }
    } catch {
      gtfsAgeDays = null;
    }
    res.json({ ok: true, gtfsAgeDays });
  });

  // Everything under /api/* requires a valid Firebase ID token. Mounted
  // BEFORE the per-route limiters so unauthenticated traffic returns 401
  // immediately without consuming GraphHopper/Nominatim/red.cl budget.
  // /health stays open above so Fly's healthcheck can hit it.
  app.use("/api", requireFirebaseAuth());

  mountVerificationRoute(app);

  app.post("/api/autocomplete", autocompleteLimiter, async (req, res) => {
    const q = typeof req.body?.q === "string" ? req.body.q.trim() : "";
    const userLat = typeof req.body?.lat === "number" ? req.body.lat : -33.4489;
    const userLng = typeof req.body?.lng === "number" ? req.body.lng : -70.6693;

    if (q.length < 2) {
      res.json({ suggestions: [] });
      return;
    }

    type Suggestion = {
      lat: number;
      lng: number;
      label: string;
      primary: string;
      secondary: string;
      category?: string;
    };

    async function tryPhoton(): Promise<Suggestion[] | null> {
      const params = new URLSearchParams({
        q,
        limit: "8",
        lat: String(userLat),
        lon: String(userLng),
      });
      const url = `https://photon.komoot.io/api/?${params.toString()}`;
      try {
        const r = await fetch(url, {
          headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
          signal: AbortSignal.timeout(12_000),
        });
        if (!r.ok) return null;
        const data = (await r.json()) as {
          features?: Array<{
            geometry?: { coordinates?: [number, number] };
            properties?: {
              name?: string;
              street?: string;
              housenumber?: string;
              city?: string;
              state?: string;
              country?: string;
              countrycode?: string;
              postcode?: string;
              osm_value?: string;
              osm_key?: string;
              type?: string;
            };
          }>;
        };
        if (!data?.features?.length) return [];
        return data.features
          .map((f): Suggestion | null => {
            const coord = f.geometry?.coordinates;
            const p = f.properties || {};
            if (!coord || coord.length < 2) return null;
            const [lon, lat] = coord;
            const street = [p.street, p.housenumber].filter(Boolean).join(" ");
            const primary = p.name || street || p.city || q;
            const secondaryParts = [
              p.name && street ? street : "",
              p.city,
              p.state,
              p.country,
            ].filter(Boolean) as string[];
            const secondary = Array.from(new Set(secondaryParts)).slice(0, 3).join(", ");
            return {
              lat,
              lng: lon,
              label: [primary, secondary].filter(Boolean).join(", "),
              primary,
              secondary,
              category: p.osm_value || p.osm_key || p.type,
            };
          })
          .filter((s): s is Suggestion => s !== null);
      } catch {
        return null;
      }
    }

    async function tryNominatim(): Promise<Suggestion[]> {
      const params = new URLSearchParams({
        q,
        format: "json",
        limit: "8",
        addressdetails: "1",
        "accept-language": "es",
      });
      const url = `${NOMINATIM_BASE}/search?${params.toString()}`;
      try {
        const r = await fetch(url, {
          headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
          signal: AbortSignal.timeout(12_000),
        });
        if (!r.ok) return [];
        const rows = (await r.json()) as Array<{
          lat: string;
          lon: string;
          display_name?: string;
          name?: string;
          type?: string;
          class?: string;
          address?: Record<string, string>;
        }>;
        return rows.map((row) => {
          const addr = row.address || {};
          const primary =
            row.name ||
            addr.amenity ||
            addr.shop ||
            addr.building ||
            addr.tourism ||
            addr.office ||
            addr.leisure ||
            row.display_name?.split(",")[0] ||
            q;
          const restParts = (row.display_name || "")
            .split(",")
            .slice(1)
            .map((s) => s.trim())
            .filter(Boolean);
          return {
            lat: parseFloat(row.lat),
            lng: parseFloat(row.lon),
            label: row.display_name || primary,
            primary,
            secondary: restParts.slice(0, 3).join(", "),
            category: row.class || row.type,
          };
        });
      } catch {
        return [];
      }
    }

    try {
      const photon = await tryPhoton();
      let suggestions: Suggestion[] = photon ?? [];
      if (suggestions.length === 0) {
        suggestions = await tryNominatim();
      }

      // Rank: nearer to user first
      suggestions.sort((a, b) => {
        const da = (a.lat - userLat) ** 2 + (a.lng - userLng) ** 2;
        const db = (b.lat - userLat) ** 2 + (b.lng - userLng) ** 2;
        return da - db;
      });

      res.json({ suggestions: suggestions.slice(0, 8) });
    } catch (e) {
      logger.error({ err: e }, "autocomplete");
      res.json({ suggestions: [] });
    }
  });

  app.post("/api/geocode", geocodeLimiter, async (req, res) => {
    const q = typeof req.body?.q === "string" ? req.body.q.trim() : "";
    if (!q) {
      res.status(400).json({ error: "Missing query" });
      return;
    }

    try {
      const hit = await nominatimChileSearch(q);
      if (!hit) {
        res.status(404).json({ error: "No results in Santiago area" });
        return;
      }
      res.json({ lat: hit.lat, lng: hit.lng, label: hit.label });
    } catch (e) {
      logger.error({ err: e }, "geocode");
      res.status(502).json({ error: "Geocoding failed" });
    }
  });

  app.post("/api/reverse-geocode", geocodeLimiter, async (req, res) => {
    const lat = typeof req.body?.lat === "number" ? req.body.lat : null;
    const lng = typeof req.body?.lng === "number" ? req.body.lng : null;
    if (lat == null || lng == null) {
      res.status(400).json({ error: "lat and lng required" });
      return;
    }

    try {
      const hit = await nominatimReverse(lat, lng);
      if (!hit) {
        res.status(404).json({ error: "No address found" });
        return;
      }
      res.json({ label: hit.label });
    } catch (e) {
      logger.error({ err: e }, "reverse-geocode");
      res.status(502).json({ error: "Reverse geocoding failed" });
    }
  });

  app.post("/api/route", routeLimiter, async (req, res) => {
    const origin = req.body?.origin as LatLngBody | undefined;
    const destination = req.body?.destination as LatLngBody | undefined;
    const profile = req.body?.profile as RoutingProfile | undefined;
    const alternatives = Boolean(req.body?.alternatives);

    if (
      !origin ||
      !destination ||
      typeof origin.lat !== "number" ||
      typeof origin.lng !== "number" ||
      typeof destination.lat !== "number" ||
      typeof destination.lng !== "number"
    ) {
      res.status(400).json({ error: "origin and destination {lat,lng} required" });
      return;
    }

    const validProfiles: RoutingProfile[] = ["car", "foot", "bike"];
    if (!profile || !validProfiles.includes(profile)) {
      res.status(400).json({ error: "profile must be car, foot, or bike" });
      return;
    }

    try {
      const provider = getRoutingProvider();
      const result = await provider.fetchRoute(origin, destination, profile, {
        alternatives,
      });
      res.json({
        provider: provider.name,
        primary: result.primary,
        alternatives: result.alternatives,
      });
    } catch (e) {
      if (e instanceof RoutingError) {
        res.status(e.status).json({ error: e.message });
        return;
      }
      logger.error({ err: e }, "route");
      res.status(502).json({ error: "Routing service failed" });
    }
  });

  app.post("/api/transit-route", routeLimiter, async (req, res) => {
    const origin = req.body?.origin as LatLngBody | undefined;
    const destination = req.body?.destination as LatLngBody | undefined;

    if (
      !origin ||
      !destination ||
      typeof origin.lat !== "number" ||
      typeof origin.lng !== "number" ||
      typeof destination.lat !== "number" ||
      typeof destination.lng !== "number"
    ) {
      res.status(400).json({ error: "origin and destination {lat,lng} required" });
      return;
    }

    try {
      const provider = getTransitProvider();
      const result = await provider.fetchTransitRoute(origin, destination);
      // 200 with available=false is a real "no transit option" answer; only
      // surface 503 when the provider itself failed.
      res.status(200).json({ provider: provider.name, ...result });
    } catch (e) {
      if (e instanceof TransitError) {
        res.status(e.status).json({ error: e.message });
        return;
      }
      logger.error({ err: e }, "transit-route");
      res.status(502).json({ error: "Transit routing service failed" });
    }
  });

  app.post("/api/route-all", routeAllLimiter, async (req, res) => {
    const origin = req.body?.origin as LatLngBody | undefined;
    const destination = req.body?.destination as LatLngBody | undefined;

    if (
      !origin ||
      !destination ||
      typeof origin.lat !== "number" ||
      typeof origin.lng !== "number" ||
      typeof destination.lat !== "number" ||
      typeof destination.lng !== "number"
    ) {
      res.status(400).json({ error: "origin and destination {lat,lng} required" });
      return;
    }

    const profileFor = { carpool: "car", walk: "foot", bike: "bike" } as const;
    const drivingPromises = (Object.entries(profileFor) as Array<
      [keyof typeof profileFor, RoutingProfile]
    >).map(async ([mode, profile]) => {
      try {
        const routing = getRoutingProvider();
        const r = await routing.fetchRoute(origin, destination, profile, {
          alternatives: false,
        });
        return {
          kind: "route" as const,
          mode,
          primary: r.primary,
          alternatives: r.alternatives,
        };
      } catch (e) {
        const msg =
          e instanceof RoutingError
            ? e.message
            : e instanceof Error
              ? e.message
              : "Routing failed";
        return { kind: "error" as const, mode, error: msg };
      }
    });

    const transitPromise = (async () => {
      try {
        const transit = getTransitProvider();
        const result = await transit.fetchTransitRoute(origin, destination);
        return { kind: "transit" as const, mode: "transit" as const, result };
      } catch (e) {
        const msg =
          e instanceof TransitError
            ? e.message
            : e instanceof Error
              ? e.message
              : "Transit routing failed";
        return {
          kind: "error" as const,
          mode: "transit" as const,
          error: msg,
        };
      }
    })();

    let settled;
    try {
      settled = await Promise.all([...drivingPromises, transitPromise]);
    } catch (e) {
      logger.error({ err: e }, "route-all");
      res.status(502).json({ error: "Comparison failed" });
      return;
    }
    const byMode = Object.fromEntries(settled.map((s) => [s.mode, s])) as Record<
      "carpool" | "walk" | "bike" | "transit",
      (typeof settled)[number]
    >;

    res.json({
      carpool: byMode.carpool,
      walk: byMode.walk,
      bike: byMode.bike,
      transit: byMode.transit,
    });
  });

  // Live bus arrivals for a paradero, sourced from red.cl's "¿Cuándo llega?"
  // predictor. The route param is optional; when present we narrow the
  // response to just that service. See server/transit/redcl.ts for the full
  // honesty caveats about this data source.
  app.get("/api/realtime/arrivals", arrivalsLimiter, async (req, res) => {
    const stop = typeof req.query.stop === "string" ? req.query.stop.trim() : "";
    const route =
      typeof req.query.route === "string" ? req.query.route.trim() : "";

    if (!isValidStopCode(stop)) {
      res.status(400).json({
        error: "stop must be a Santiago paradero code (e.g. PA433)",
      });
      return;
    }

    try {
      const result = await getStopArrivals(stop);
      const arrivals = route
        ? result.arrivals.filter(
            (a) => a.service.toLowerCase() === route.toLowerCase(),
          )
        : result.arrivals;

      // If the upstream had live data overall but nothing for the requested
      // route, surface that as no-predictions so the UI flips to "horario".
      const effectiveStatus =
        route && result.status === "live" && arrivals.length === 0
          ? "no-predictions"
          : result.status;

      res.json({
        stopCode: result.stopCode,
        status: effectiveStatus,
        arrivals,
        ageMs: result.ageMs,
        cached: result.cached,
        reason: result.reason,
      });
    } catch (e) {
      logger.error({ err: e }, "realtime/arrivals");
      res.status(502).json({ error: "Live arrivals unavailable" });
    }
  });

  // Provider price comparison is computed CLIENT-SIDE from public Santiago
  // tariffs in src/lib/fares.ts. No /api/estimates endpoint is needed and
  // no third-party developer credentials are involved.

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(
      express.static(distPath, {
        // Vite hashes asset filenames, so /assets/* can be cached forever.
        setHeaders: (res, filePath) => {
          if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          }
        },
      }),
    );
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Centralized error handler — never leak stack traces. Logs internally,
  // returns a stable shape. Must be registered LAST.
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err, url: req.originalUrl }, "unhandled");
    if (process.env.SENTRY_DSN) Sentry.captureException(err);
    if (res.headersSent) return;
    res.status(500).json({ error: "internal" });
  });

  app.listen(PORT, "0.0.0.0", () => {
    logger.info({ port: PORT }, "Rumbo server listening");
    // Logs a WARNING if the GTFS DB is missing, and kicks off a background
    // refresh when stale (>7 days) or absent. Runs only the transit provider
    // is gtfs (the default in production).
    if ((process.env.TRANSIT_PROVIDER || "gtfs") === "gtfs") {
      startGtfsScheduler();
    }
  });
}

startServer().catch((e) => {
  logger.error({ err: e }, "fatal startup error");
  if (process.env.SENTRY_DSN) Sentry.captureException(e);
  process.exit(1);
});
