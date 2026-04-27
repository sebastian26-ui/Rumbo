import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { fetchUberEstimates, mergeEstimatesForUi } from "./server/uber";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OSRM_BASE =
  process.env.OSRM_BASE_URL?.replace(/\/$/, "") ||
  "https://router.project-osrm.org";
const NOMINATIM_BASE =
  process.env.NOMINATIM_BASE_URL?.replace(/\/$/, "") ||
  "https://nominatim.openstreetmap.org";

const USER_AGENT =
  process.env.GEOCODING_USER_AGENT ||
  "Rumbo/1.0 (https://github.com; mobility app; contact: dev@localhost)";

type OsrmProfile = "driving" | "foot" | "bike";

interface LatLngBody {
  lat: number;
  lng: number;
}

function flipCoords(coords: number[][]): [number, number][] {
  return coords.map(([lon, lat]) => [lat, lon] as [number, number]);
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

function parseOsrmRoute(route: {
  duration: number;
  distance: number;
  geometry: { type: string; coordinates: number[][] };
}) {
  const coords = route.geometry?.coordinates;
  if (!coords?.length) return null;
  return {
    durationSeconds: route.duration,
    distanceMeters: route.distance,
    coordinates: flipCoords(coords),
  };
}

async function fetchOsrmRoute(
  origin: LatLngBody,
  dest: LatLngBody,
  profile: OsrmProfile,
  alternatives: boolean
): Promise<{ primary: NonNullable<ReturnType<typeof parseOsrmRoute>>; alternatives: NonNullable<ReturnType<typeof parseOsrmRoute>>[] } | null> {
  const a = `${origin.lng},${origin.lat}`;
  const b = `${dest.lng},${dest.lat}`;
  const altParam = alternatives && profile === "driving" ? "&alternatives=true" : "";
  const url = `${OSRM_BASE}/route/v1/${profile}/${a};${b}?overview=full&geometries=geojson${altParam}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(25_000) });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    code: string;
    routes?: Array<{
      duration: number;
      distance: number;
      geometry: { type: string; coordinates: number[][] };
    }>;
  };

  if (data.code !== "Ok" || !data.routes?.length) return null;

  const parsed = data.routes
    .map((r) => parseOsrmRoute(r))
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (!parsed.length) return null;

  return {
    primary: parsed[0],
    alternatives: parsed.slice(1),
  };
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 4000;

  app.use(express.json());

  app.post("/api/autocomplete", async (req, res) => {
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
      console.error("autocomplete", e);
      res.json({ suggestions: [] });
    }
  });

  app.post("/api/geocode", async (req, res) => {
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
      console.error("geocode", e);
      res.status(502).json({ error: "Geocoding failed" });
    }
  });

  app.post("/api/route", async (req, res) => {
    const origin = req.body?.origin as LatLngBody | undefined;
    const destination = req.body?.destination as LatLngBody | undefined;
    const profile = req.body?.profile as OsrmProfile | undefined;
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

    const validProfiles: OsrmProfile[] = ["driving", "foot", "bike"];
    if (!profile || !validProfiles.includes(profile)) {
      res.status(400).json({ error: "profile must be driving, foot, or bike" });
      return;
    }

    try {
      const result = await fetchOsrmRoute(origin, destination, profile, alternatives);
      if (!result) {
        res.status(404).json({ error: "No route found for this mode" });
        return;
      }
      res.json({
        primary: result.primary,
        alternatives: result.alternatives,
      });
    } catch (e) {
      console.error("route", e);
      res.status(502).json({ error: "Routing service failed" });
    }
  });

  app.post("/api/estimates", async (req, res) => {
    const endAddress = typeof req.body?.end === "string" ? req.body.end.trim() : "";
    const startLat = req.body?.startLat;
    const startLng = req.body?.startLng;

    if (!endAddress) {
      res.status(400).json({ error: "Missing destination (end)" });
      return;
    }
    if (typeof startLat !== "number" || typeof startLng !== "number") {
      res.status(400).json({ error: "startLat and startLng (numbers) required — enable location in the browser" });
      return;
    }

    try {
      const dest = await nominatimChileSearch(endAddress);
      if (!dest) {
        res.status(404).json({
          error: "Could not geocode destination in Chile search area",
          estimates: [],
        });
        return;
      }

      const hasUber = Boolean(process.env.UBER_CLIENT_ID && process.env.UBER_CLIENT_SECRET);

      if (hasUber) {
        const { prices, times } = await fetchUberEstimates({
          startLat,
          startLng,
          endLat: dest.lat,
          endLng: dest.lng,
        });
        const estimates = mergeEstimatesForUi(prices, times);

        res.json({
          estimates,
          bestPriceProvider: estimates[0]?.provider,
          timestamp: new Date().toISOString(),
          source: "uber",
        });
        return;
      }

      const mock = [
        {
          provider: "Uber",
          type: "UberX (configure UBER_* secrets)",
          price: 4500,
          currency: "CLP",
          eta: 3,
          color: "#000000",
        },
        {
          provider: "Cabify",
          type: "Lite",
          price: 4200,
          currency: "CLP",
          eta: 5,
          color: "#7350FF",
        },
      ].sort((a, b) => a.price - b.price);

      res.json({
        estimates: mock,
        bestPriceProvider: mock[0].provider,
        timestamp: new Date().toISOString(),
        source: "mock",
        hint: "Set UBER_CLIENT_ID and UBER_CLIENT_SECRET for live Uber estimates.",
      });
    } catch (e) {
      console.error("estimates", e);
      const message = e instanceof Error ? e.message : "Uber or geocoding failed";
      res.status(502).json({ error: message, estimates: [] });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Rumbo Server running on http://localhost:${PORT}`);
  });
}

startServer();
