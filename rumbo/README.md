<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Rumbo

Santiago multimodal trip planner — compare Metro, micro, bici, taxi and rides side by side.

## Run locally

**Prerequisites:** Node.js 22+.

1. Install dependencies:
   ```
   npm install
   ```
2. Copy `.env.example` to `.env` and fill in the keys you have. The minimum to get
   transit routing working is no key at all — the GTFS provider is offline. To get
   walk/bike/drive routing too you need a `GRAPHHOPPER_API_KEY` (free tier at
   https://www.graphhopper.com/).
3. **Build the GTFS cache** (one-time, takes ~3 min):
   ```
   npm run gtfs:ingest
   ```
   This downloads the official DTPM feed (~12 MB) from
   https://www.dtpm.cl/index.php/noticias/gtfs-vigente and parses it into
   `data/gtfs.db` (~170 MB). Without this step `/api/transit-route` returns a
   "GTFS database is not built" error. The file is gitignored — every checkout
   rebuilds it from the upstream feed.
4. Run the app:
   ```
   npm run dev
   ```

The server will log a clear `[gtfs] WARNING …` line on boot if the DB is missing,
so you'll know to run step 3.

## Refreshing the GTFS feed

DTPM publishes a new feed every few weeks. To pick up the latest, re-run
`npm run gtfs:ingest`. In production this runs automatically once a week from
inside the Fly machine (see `server/gtfs/scheduler.ts`).
