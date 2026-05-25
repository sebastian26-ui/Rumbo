import React, { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import MapCanvas, { DEFAULT_MAP_CENTER, RouteSegment } from './MapCanvas';
import BottomPanel from './BottomPanel';
import {
  Mode,
  SingleMode,
  RoutedPath,
  Stat,
  Route as RouteOption,
  Suggestion,
  TransitRouteResult,
  AllRoutesResult,
} from '../types';
import { MODES } from '../constants';
import { modeToRoutingProfile, buildStatsForMode, buildRouteOptions } from '../lib/routing';
import { legsToSegments } from '../lib/transit';
import { User as UserIcon, Navigation, ArrowRight, X, Search, Settings, Star, MapPin } from 'lucide-react';
import {
  DEFAULT_ENABLED,
  ProviderId,
  providersForMode,
} from '../lib/providers';
import { estimateFare } from '../lib/fares';
import { ProviderEstimate } from '../types';
import { loadEnabledProviders, saveEnabledProviders } from '../lib/userPrefs';
import { FavoritePlace, loadFavorites } from '../lib/favorites';
import ProvidersPanel from './ProvidersPanel';
import ProfilePanel from './ProfilePanel';
const AdjustTripSheet = lazy(() => import('./AdjustTripSheet'));
import {
  PreferenceModeId,
  loadPreferenceModes,
  savePreferenceModes,
} from '../lib/preferences';
import {
  applyPreferences,
  applyProviderPreferences,
  resolveActiveModes,
} from '../lib/tripFilter';

interface MapViewProps {
  user: any;
}

export default function MapView({ user }: MapViewProps) {
  const [activeMode, setActiveMode] = useState<Mode | null>(null);
  const [isRouteVisible, setIsRouteVisible] = useState(false);
  const [mapCenter, setMapCenter] = useState<[number, number]>(DEFAULT_MAP_CENTER);

  /** Origin. Empty text + null coords means "use My Current Location"
   *  (i.e. fall back to `mapCenter`). Set to a real place to route from
   *  somewhere other than the device GPS. */
  const [originText, setOriginText] = useState('');
  const [originCoords, setOriginCoords] = useState<[number, number] | null>(null);
  const [originLabel, setOriginLabel] = useState('');
  /** Reverse-geocoded address of the live device location, shown in the
   *  "From" field by default so the user can see where the trip starts
   *  before they touch anything. Empty until the first GPS fix resolves. */
  const [liveLabel, setLiveLabel] = useState('');
  /** True once we've received at least one real GPS fix (so we can tell
   *  "Locating…" apart from "located, just no street name yet"). */
  const [hasFix, setHasFix] = useState(false);
  /** Whether the "From" input is focused. While focused we show the raw
   *  editable text; while blurred with no custom origin we show liveLabel. */
  const [originFocused, setOriginFocused] = useState(false);
  /** Coords we last reverse-geocoded, so a moving GPS dot doesn't hammer
   *  Nominatim on every tick — we only re-resolve after a real move. */
  const lastRevGeoRef = useRef<[number, number] | null>(null);

  const [destinationText, setDestinationText] = useState('');
  const [destinationCoords, setDestinationCoords] = useState<[number, number] | null>(null);
  const [destinationLabel, setDestinationLabel] = useState('');

  /** Which field the shared autocomplete dropdown is currently serving. */
  const [activeField, setActiveField] = useState<'origin' | 'destination'>(
    'destination',
  );

  const [routePath, setRoutePath] = useState<[number, number][] | null>(null);
  const [activeRouteMetrics, setActiveRouteMetrics] = useState<{
    mode: SingleMode;
    distanceMeters: number;
    durationSeconds: number;
  } | null>(null);
  const [realStats, setRealStats] = useState<Stat[] | null>(null);
  const [routeOptions, setRouteOptions] = useState<RouteOption[]>([]);
  const [transitResult, setTransitResult] = useState<TransitRouteResult | null>(null);
  const [allRoutes, setAllRoutes] = useState<AllRoutesResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Compass heading in degrees clockwise from north, or null if we don't
   *  have one (desktop, permission denied, uncalibrated, etc.). */
  const [userHeading, setUserHeading] = useState<number | null>(null);
  /** True once we have permission (or never needed it) to subscribe to
   *  orientation events. iOS gates this behind a user gesture; everywhere
   *  else we flip it on at mount. */
  const [orientationEnabled, setOrientationEnabled] = useState(false);

  const [enabledProviders, setEnabledProviders] = useState<Set<ProviderId>>(
    () => new Set(DEFAULT_ENABLED),
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [favorites, setFavorites] = useState<FavoritePlace[]>([]);

  /** Saved (persisted) preference modes. */
  const [preferenceModes, setPreferenceModes] = useState<Set<PreferenceModeId>>(
    () => new Set(),
  );
  /** Per-trip override. null = follow the saved set; an array = the user
   *  tweaked modes via "Ajustar para este viaje" for this search only. */
  const [tripModes, setTripModes] = useState<PreferenceModeId[] | null>(null);
  /** User dismissed the auto-night for this session. */
  const [nightDismissed, setNightDismissed] = useState(false);

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const suggestionAbortRef = useRef<AbortController | null>(null);
  const suppressNextFetchRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadEnabledProviders(user?.uid ?? null).then((ids) => {
      if (!cancelled) setEnabledProviders(new Set(ids));
    });
    loadPreferenceModes(user?.uid ?? null).then((modes) => {
      if (!cancelled) setPreferenceModes(new Set(modes));
    });
    loadFavorites(user?.uid ?? null).then((favs) => {
      if (!cancelled) setFavorites(favs);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  const handleToggleProvider = useCallback(
    (id: ProviderId, next: boolean) => {
      setEnabledProviders((prev) => {
        const updated = new Set<ProviderId>(prev);
        if (next) updated.add(id);
        else updated.delete(id);
        void saveEnabledProviders(user?.uid ?? null, Array.from(updated));
        return updated;
      });
    },
    [user?.uid],
  );

  /** Settings toggle — persisted. */
  const handleTogglePreference = useCallback(
    (id: PreferenceModeId, next: boolean) => {
      setPreferenceModes((prev) => {
        const updated = new Set<PreferenceModeId>(prev);
        if (next) updated.add(id);
        else updated.delete(id);
        void savePreferenceModes(user?.uid ?? null, Array.from(updated));
        return updated;
      });
    },
    [user?.uid],
  );

  /** Effective modes for the current trip = saved set unless the user opened
   *  "Ajustar para este viaje" and tweaked it (tripModes). Stable string key
   *  so the engine (which samples route geometry) doesn't recompute on every
   *  render / panel-drag frame. */
  const baseTripKey = (
    tripModes ?? Array.from(preferenceModes)
  )
    .slice()
    .sort()
    .join(',');

  const { active: activeModes, nightAutoActivated } = useMemo(
    () =>
      resolveActiveModes({
        saved: baseTripKey ? (baseTripKey.split(',') as PreferenceModeId[]) : [],
        nightAutoDismissed: nightDismissed,
      }),
    [baseTripKey, nightDismissed],
  );
  const activeModesKey = activeModes.slice().sort().join(',');

  /** Per-trip toggle — does NOT persist. Seeds from the current effective
   *  set so a single tap only flips that one mode. */
  const handleToggleTripPreference = useCallback(
    (id: PreferenceModeId, next: boolean) => {
      setTripModes((prev) => {
        const seed = prev ?? activeModes;
        const updated = new Set<PreferenceModeId>(seed);
        if (next) updated.add(id);
        else updated.delete(id);
        return Array.from(updated);
      });
      // Turning night safety off via the sheet should also suppress the
      // auto-night re-add for this session.
      if (id === 'safer_at_night' && !next) setNightDismissed(true);
    },
    [activeModes],
  );

  const handleResetTrip = useCallback(() => {
    setTripModes(null);
    setNightDismissed(false);
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return;
    // Real-time tracking: subscribe instead of one-shot so the blue dot
    // moves with the user. The browser fires the success callback on every
    // significant change; we just mirror it into mapCenter.
    let watchId: number | null = navigator.geolocation.watchPosition(
      (pos) => {
        setMapCenter([pos.coords.latitude, pos.coords.longitude]);
        setHasFix(true);
      },
      (err) => {
        // Mid-session errors (TIMEOUT / POSITION_UNAVAILABLE): keep the last
        // known mapCenter and stay subscribed — the browser will deliver the
        // next valid fix when GPS recovers, no need to tear down.
        //
        // PERMISSION_DENIED is terminal: the watcher will keep firing this
        // error forever otherwise, so we unsubscribe and fall back silently
        // to whatever mapCenter currently holds (Santiago centro on cold
        // start, or the last good fix).
        if (err.code === err.PERMISSION_DENIED && watchId != null) {
          navigator.geolocation.clearWatch(watchId);
          watchId = null;
        }
        if (import.meta.env?.DEV) {
          console.warn('Geolocation watch error:', err.code, err.message);
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15_000,
        // Lower than the previous one-shot's 120 s: a stale cached fix
        // would defeat the point of live tracking.
        maximumAge: 30_000,
      },
    );
    return () => {
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  /** Reverse-geocode the live location into a human address for the "From"
   *  field. Runs on the first fix and again only after the user has moved
   *  ~150 m, so a jittering GPS dot doesn't spam Nominatim. Skipped while
   *  the user has set a custom origin (liveLabel isn't shown then anyway). */
  useEffect(() => {
    if (!hasFix) return;
    if (originText || originCoords) return; // custom origin in use

    const [lat, lng] = mapCenter;
    const last = lastRevGeoRef.current;
    if (last) {
      // ~111 km per degree lat; good enough for a "did we move?" gate.
      const dLat = (lat - last[0]) * 111_000;
      const dLng =
        (lng - last[1]) * 111_000 * Math.cos((lat * Math.PI) / 180);
      const movedMeters = Math.hypot(dLat, dLng);
      if (liveLabel && movedMeters < 150) return;
    }

    let cancelled = false;
    lastRevGeoRef.current = [lat, lng];
    (async () => {
      try {
        const r = await fetch('/api/reverse-geocode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat, lng }),
        });
        if (!r.ok) return;
        const data = await r.json();
        if (!cancelled && typeof data?.label === 'string') {
          setLiveLabel(data.label);
        }
      } catch {
        // Network/transient failure — keep whatever liveLabel we had
        // (or fall back to the "Your location" placeholder text).
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasFix, mapCenter, originText, originCoords, liveLabel]);

  /** Auto-enable orientation tracking on platforms that don't require a
   *  permission gesture (Android Chrome, etc.). iOS exposes
   *  `DeviceOrientationEvent.requestPermission` and refuses to fire events
   *  until the user explicitly grants — that path is handled by
   *  `handleRecenter` below. */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const DOE = (window as unknown as { DeviceOrientationEvent?: unknown })
      .DeviceOrientationEvent as
      | { requestPermission?: () => Promise<'granted' | 'denied'> }
      | undefined;
    if (!DOE) return;
    if (typeof DOE.requestPermission === 'function') return;
    setOrientationEnabled(true);
  }, []);

  /** Subscribe to device orientation once enabled. Prefers
   *  `deviceorientationabsolute` (Chrome/Android: true-north-locked) and
   *  falls back to `deviceorientation` (iOS, which exposes the real compass
   *  heading via `webkitCompassHeading`). Plain non-absolute events on
   *  other browsers drift and are explicitly ignored. */
  useEffect(() => {
    if (!orientationEnabled) return;

    const isAbsoluteSupported =
      typeof window !== 'undefined' && 'ondeviceorientationabsolute' in window;
    const eventName: 'deviceorientationabsolute' | 'deviceorientation' =
      isAbsoluteSupported ? 'deviceorientationabsolute' : 'deviceorientation';

    /** Throttle to ~30 Hz so we don't spam React with ~60 Hz events. */
    let lastFire = 0;

    const handler = (e: Event) => {
      const ev = e as DeviceOrientationEvent & {
        webkitCompassHeading?: number;
        webkitCompassAccuracy?: number;
      };
      const now = performance.now();
      if (now - lastFire < 33) return;
      lastFire = now;

      let heading: number | null = null;
      if (typeof ev.webkitCompassHeading === 'number') {
        // iOS Safari: webkitCompassAccuracy < 0 means "uncalibrated, do
        // not trust" — we'd rather show no cone than a wandering one.
        if (
          typeof ev.webkitCompassAccuracy === 'number' &&
          ev.webkitCompassAccuracy < 0
        ) {
          return;
        }
        heading = ev.webkitCompassHeading;
      } else if (ev.absolute && typeof ev.alpha === 'number') {
        // alpha is counter-clockwise from true north; flip the sign for
        // clockwise compass heading.
        heading = (360 - ev.alpha) % 360;
      } else {
        return;
      }

      // Landscape correction: subtract the screen rotation so the cone
      // matches the device's physical facing direction in any orientation.
      const screenAngle =
        typeof screen !== 'undefined' && screen.orientation
          ? screen.orientation.angle ?? 0
          : 0;
      heading = (heading - screenAngle + 360) % 360;

      setUserHeading(heading);
    };

    window.addEventListener(eventName, handler as EventListener);
    return () =>
      window.removeEventListener(eventName, handler as EventListener);
  }, [orientationEnabled]);

  /** Bottom-right recenter button. The camera already follows automatically
   *  via `watchPosition`, so this handler's real job is the iOS compass
   *  permission prompt — which has to originate from a user gesture. On
   *  Android/desktop the early return leaves things unchanged. */
  const handleRecenter = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const DOE = (window as unknown as { DeviceOrientationEvent?: unknown })
      .DeviceOrientationEvent as
      | { requestPermission?: () => Promise<'granted' | 'denied'> }
      | undefined;
    if (!DOE || typeof DOE.requestPermission !== 'function') return;
    try {
      const result = await DOE.requestPermission();
      if (result === 'granted') setOrientationEnabled(true);
      // 'denied' or anything else: stay on the dot without a cone.
    } catch {
      // Older iOS throws if called outside a secure context. Swallow and
      // leave the cone off — no UI banner, per spec.
    }
  }, []);

  const activeConfig = activeMode ? MODES.find((m) => m.id === activeMode)! : null;

  /** The lat/lng we actually route FROM: an explicitly-chosen origin if the
   *  user set one, otherwise the device location (mapCenter). Both inputs
   *  are stable state refs, so this is cheap to recompute each render. */
  const effectiveOrigin: [number, number] = originCoords ?? mapCenter;

  const transitSegments = useMemo(
    () => (transitResult?.legs?.length ? legsToSegments(transitResult.legs) : null),
    [transitResult],
  );

  /** All-mode overlay: every available mode's polyline at once, dimmed.
   *  Sorted so the fastest renders on top. */
  const allSegments: RouteSegment[] | null = useMemo(() => {
    if (activeMode !== 'all' || !allRoutes) return null;
    const out: Array<{ seg: RouteSegment; durationSeconds: number }> = [];
    for (const mode of ['carpool', 'walk', 'bike'] as const) {
      const o = allRoutes[mode];
      if (o.kind !== 'route') continue;
      const cfg = MODES.find((m) => m.id === mode)!;
      out.push({
        seg: { coordinates: o.primary.coordinates, color: cfg.color, weight: 5 },
        durationSeconds: o.primary.durationSeconds,
      });
    }
    const t = allRoutes.transit;
    if (t.kind === 'transit' && t.result.available && t.result.legs.length) {
      const segs = legsToSegments(t.result.legs);
      for (const s of segs) {
        out.push({ seg: { ...s, weight: 5 }, durationSeconds: t.result.totalDurationSeconds ?? 1e12 });
      }
    }
    if (out.length === 0) return null;
    out.sort((a, b) => b.durationSeconds - a.durationSeconds);
    return out.map((x) => x.seg);
  }, [activeMode, allRoutes]);

  /** Live-computed provider estimates, scoped to the current mode + the route
   *  we already have in state. No server round-trip — purely a function of
   *  (route distance + duration + enabled providers + tariff table). */
  const providerEstimates: ProviderEstimate[] = useMemo(() => {
    if (!destinationCoords) return [];
    const mode = activeMode;
    if (mode !== 'carpool' && mode !== 'bike') return [];

    // Use the active route if present, otherwise the carpool entry from the
    // 'all' overlay so estimates remain meaningful even before the user
    // picks a specific mode.
    let distanceMeters: number | null = null;
    let durationSeconds: number | null = null;

    // Prefer the active single-mode route if it matches the current mode —
    // this is what powers estimates after the user clicks Carpool / Bike.
    if (activeRouteMetrics && activeRouteMetrics.mode === mode) {
      distanceMeters = activeRouteMetrics.distanceMeters;
      durationSeconds = activeRouteMetrics.durationSeconds;
    } else if (allRoutes) {
      const o = allRoutes[mode];
      if (o.kind === 'route') {
        distanceMeters = o.primary.distanceMeters;
        durationSeconds = o.primary.durationSeconds;
      }
    }
    if (distanceMeters == null || durationSeconds == null) return [];

    const origin = { lat: effectiveOrigin[0], lng: effectiveOrigin[1] };
    const destination = { lat: destinationCoords[0], lng: destinationCoords[1] };
    const candidates = providersForMode(mode, enabledProviders);
    const results: ProviderEstimate[] = [];

    for (const p of candidates) {
      // Some providers (e.g. municipal buses) intentionally have no deep
      // link — they appear in PROVIDERS for the toggle, but never in the
      // fare-estimate list for ride-hail / scooter modes.
      if (!p.buildDeepLink) continue;
      const link = p.buildDeepLink({
        origin,
        destination,
        destinationLabel: destinationLabel || destinationText,
      });

      if (p.tariff) {
        const fare = estimateFare(p.tariff, distanceMeters, durationSeconds);
        results.push({
          providerId: p.id,
          name: p.name,
          product: p.product,
          color: p.color,
          low: fare.low,
          high: fare.high,
          currency: 'CLP',
          etaMinutes: null,
          deepLinkUrl: link.url,
          deepLinkLabel: link.label,
          note: 'Estimated — actual price may vary',
        });
      } else if (p.id === 'bike_itau') {
        // Day pass model: free under 45 min once you have the pass. Show
        // the pass price as the upper bound and 0 as the lower (already paid).
        results.push({
          providerId: p.id,
          name: p.name,
          product: p.product,
          color: p.color,
          low: 0,
          high: 2500,
          currency: 'CLP',
          etaMinutes: null,
          deepLinkUrl: link.url,
          deepLinkLabel: link.label,
          note: 'Free under 45 min with a day pass',
        });
      }
    }

    results.sort((a, b) => a.low - b.low);
    return results;
  }, [
    activeMode,
    allRoutes,
    activeRouteMetrics,
    destinationCoords,
    destinationLabel,
    destinationText,
    effectiveOrigin,
    enabledProviders,
  ]);

  /** Provider sub-list reordered/filtered by the active preference modes
   *  (e.g. "Lo más barato" hides Uber/Cabify when far from the cheapest). */
  const { estimates: displayedProviderEstimates, hiddenNote: providerHiddenNote } =
    useMemo(
      () => applyProviderPreferences(providerEstimates, activeModes),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [providerEstimates, activeModesKey],
    );

  /** Preference engine output for the "Compare all modes" view. Pure, no
   *  network — filters / re-ranks / badges the four mode rows. */
  const filterResult = useMemo(
    () => applyPreferences(allRoutes, activeModes, { enabledProviders }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allRoutes, activeModesKey, enabledProviders],
  );

  const computeRoute = useCallback(
    async (
      mode: Mode,
      destText: string,
      presetCoords: [number, number] | null,
      presetLabel: string,
      originOverride?: [number, number] | null,
    ) => {
      setLoading(true);
      setError(null);
      setTransitResult(null);
      setAllRoutes(null);
      setActiveRouteMetrics(null);
      try {
        let coords = presetCoords;
        let label = presetLabel;

        if (!coords) {
          const gc = await fetch('/api/geocode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ q: destText }),
          });
          const gcData = await gc.json();
          if (!gc.ok) throw new Error(gcData?.error || 'Could not find that destination');
          coords = [gcData.lat, gcData.lng];
          label = gcData.label || destText;
          setDestinationCoords(coords);
          setDestinationLabel(label);
        }

        // Resolve the origin. If the user typed a "From" place but never
        // picked a suggestion (no coords yet), geocode it the same way as
        // the destination. Empty origin → device location (mapCenter).
        let originLatLng: [number, number] = mapCenter;
        if (originOverride) {
          originLatLng = originOverride;
        } else if (originCoords) {
          originLatLng = originCoords;
        } else if (originText.trim()) {
          const gcO = await fetch('/api/geocode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ q: originText.trim() }),
          });
          const gcOData = await gcO.json();
          if (!gcO.ok) {
            throw new Error(gcOData?.error || 'Could not find that starting point');
          }
          originLatLng = [gcOData.lat, gcOData.lng];
          setOriginCoords(originLatLng);
          setOriginLabel(gcOData.label || originText.trim());
        }

        const origin = { lat: originLatLng[0], lng: originLatLng[1] };
        const destination = { lat: coords[0], lng: coords[1] };

        if (mode === 'all') {
          const allRes = await fetch('/api/route-all', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ origin, destination }),
          });
          const allData = await allRes.json();
          if (!allRes.ok) throw new Error(allData?.error || 'Could not build comparison');
          setAllRoutes(allData as AllRoutesResult);
          setRoutePath(null);
          setRealStats([]);
          setRouteOptions([]);
          return;
        }

        if (mode === 'transit') {
          const transitRes = await fetch('/api/transit-route', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ origin, destination }),
          });
          const transitData = await transitRes.json();
          if (!transitRes.ok) {
            throw new Error(
              transitData?.error || 'Could not build a transit route',
            );
          }
          setTransitResult(transitData as TransitRouteResult);
          setRoutePath(null);
          setRealStats([]);
          setRouteOptions([]);
          return;
        }

        const profile = modeToRoutingProfile(mode);
        if (!profile) throw new Error(`Unsupported mode: ${mode}`);

        const routeRes = await fetch('/api/route', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            origin,
            destination,
            profile,
            alternatives: true,
          }),
        });
        const routeData = await routeRes.json();
        if (!routeRes.ok) throw new Error(routeData?.error || 'Could not build a route');

        const primary: RoutedPath = routeData.primary;
        setRoutePath(primary.coordinates);
        setRealStats(buildStatsForMode(mode, primary, label || destText));
        setRouteOptions(buildRouteOptions(mode, routeData));
        setActiveRouteMetrics({
          mode,
          distanceMeters: primary.distanceMeters,
          durationSeconds: primary.durationSeconds,
        });
      } catch (e: any) {
        setError(e?.message || 'Routing failed');
        setRoutePath(null);
        setRealStats(null);
        setRouteOptions([]);
        setTransitResult(null);
        setAllRoutes(null);
        setActiveRouteMetrics(null);
      } finally {
        setLoading(false);
      }
    },
    [mapCenter, originCoords, originText],
  );

  useEffect(() => {
    if (isRouteVisible) {
      setSuggestions([]);
      setSuggestionsOpen(false);
      return;
    }
    if (suppressNextFetchRef.current) {
      suppressNextFetchRef.current = false;
      return;
    }
    const q = (activeField === 'origin' ? originText : destinationText).trim();
    if (q.length < 2) {
      setSuggestions([]);
      setSuggestionsLoading(false);
      return;
    }

    suggestionAbortRef.current?.abort();
    const controller = new AbortController();
    suggestionAbortRef.current = controller;
    setSuggestionsLoading(true);

    const handle = setTimeout(async () => {
      try {
        const r = await fetch('/api/autocomplete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            q,
            lat: effectiveOrigin[0],
            lng: effectiveOrigin[1],
          }),
          signal: controller.signal,
        });
        const data = await r.json();
        if (controller.signal.aborted) return;
        setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
        setSuggestionsOpen(true);
      } catch (err: any) {
        if (err?.name !== 'AbortError') setSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setSuggestionsLoading(false);
      }
    }, 250);

    return () => {
      clearTimeout(handle);
      controller.abort();
    };
  }, [activeField, originText, destinationText, isRouteVisible, effectiveOrigin]);

  const handlePickSuggestion = (s: Suggestion) => {
    suppressNextFetchRef.current = true;
    setSuggestions([]);
    setSuggestionsOpen(false);

    if (activeField === 'origin') {
      setOriginText(s.primary);
      setOriginCoords([s.lat, s.lng]);
      setOriginLabel(s.label);
      if (destinationCoords && (destinationText || destinationLabel)) {
        // Destination already set — recompute from the new origin. Pass the
        // override so we don't read stale originCoords from the closure.
        setIsRouteVisible(true);
        const mode: Mode = activeMode ?? 'all';
        if (!activeMode) setActiveMode('all');
        void computeRoute(
          mode,
          destinationText,
          destinationCoords,
          destinationLabel,
          [s.lat, s.lng],
        );
      } else {
        // No destination yet — move the user to the "To" field naturally.
        setActiveField('destination');
      }
      return;
    }

    setDestinationText(s.primary);
    setDestinationCoords([s.lat, s.lng]);
    setDestinationLabel(s.label);
    setIsRouteVisible(true);
    const mode: Mode = activeMode ?? 'all';
    if (!activeMode) setActiveMode('all');
    void computeRoute(mode, s.primary, [s.lat, s.lng], s.label);
  };

  const handlePickFavorite = (f: FavoritePlace) => {
    handlePickSuggestion({
      lat: f.lat,
      lng: f.lng,
      label: f.label,
      primary: f.primary,
      secondary: f.secondary ?? '',
    });
  };

  const handleCloseMode = () => {
    setActiveMode(null);
    setIsRouteVisible(false);
    setOriginText('');
    setOriginCoords(null);
    setOriginLabel('');
    setActiveField('destination');
    setDestinationText('');
    setDestinationCoords(null);
    setDestinationLabel('');
    setRoutePath(null);
    setRealStats(null);
    setRouteOptions([]);
    setTransitResult(null);
    setAllRoutes(null);
    setActiveRouteMetrics(null);
    setError(null);
    setSuggestions([]);
    setSuggestionsOpen(false);
    // Per-trip preference overrides don't outlive the trip.
    setTripModes(null);
    setNightDismissed(false);
    setAdjustOpen(false);
  };

  const handleSelectMode = (mode: SingleMode) => {
    setActiveMode(mode);
    if (destinationCoords && (destinationText || destinationLabel)) {
      computeRoute(mode, destinationText, destinationCoords, destinationLabel);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = destinationText.trim();
    if (!text) return;
    setIsRouteVisible(true);
    const mode: Mode = activeMode ?? 'all';
    if (!activeMode) setActiveMode('all');
    await computeRoute(mode, text, null, '');
  };

  const handleModeChange = (mode: Mode) => {
    setActiveMode(mode);
    if (destinationCoords && destinationText) {
      computeRoute(mode, destinationText, destinationCoords, destinationLabel);
    }
  };

  const handleRetry = () => {
    if (!destinationText) return;
    const mode: Mode = activeMode ?? 'all';
    computeRoute(mode, destinationText, destinationCoords, destinationLabel);
  };

  /** The text the shared autocomplete dropdown is filtering on. */
  const activeText = activeField === 'origin' ? originText : destinationText;
  /** True once the user has pinned a start point other than their GPS. */
  const hasCustomOrigin = Boolean(originText || originCoords);

  return (
    <div className="h-screen w-full bg-white overflow-hidden relative font-sans">
      <MapCanvas
        activeMode={activeMode}
        userCenter={mapCenter}
        userHeading={userHeading}
        routePath={routePath}
        routeSegments={allSegments ?? transitSegments}
      />

      {/* Top Bar - Search & Profile */}
      <div className="absolute top-0 left-0 right-0 p-4 z-40 flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="flex-1 flex flex-col gap-2 min-w-0">
          <form
            onSubmit={handleSearch}
            className="bg-white/95 backdrop-blur-md rounded-3xl shadow-2xl border border-white/40 p-2 flex flex-col gap-1"
          >
            {isRouteVisible ? (
              <div className="flex flex-col gap-2 px-2 py-1">
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider leading-none mb-1">From</p>
                    <p className="text-sm font-bold text-gray-900 truncate">
                      {originLabel || originText || liveLabel || 'My Current Location'}
                    </p>
                  </div>
                </div>
                <div className="h-[1px] bg-gray-100 ml-5.5" />
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-sm bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider leading-none mb-1">Destination</p>
                    <p className="text-sm font-bold text-gray-900 truncate">{destinationLabel || destinationText}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCloseMode}
                    className="p-1 text-gray-400 hover:text-gray-600"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col">
                {/* From — defaults to device location; editable so the
                    trip can start anywhere. */}
                <div className="flex items-center gap-2">
                  <div className="pl-3 w-7 flex justify-center shrink-0">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 block shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                  </div>
                  <input
                    type="text"
                    // Default (no custom origin, not focused): show the
                    // reverse-geocoded live location so the user can see
                    // where the trip starts. Focus or a custom value
                    // switches to the editable text so they can set a
                    // different start point.
                    value={
                      hasCustomOrigin || originFocused ? originText : liveLabel
                    }
                    onChange={(e) => {
                      setOriginText(e.target.value);
                      if (originCoords) setOriginCoords(null);
                    }}
                    onFocus={() => {
                      setOriginFocused(true);
                      setActiveField('origin');
                      setSuggestionsOpen(true);
                    }}
                    onBlur={() => {
                      setOriginFocused(false);
                      setTimeout(() => setSuggestionsOpen(false), 120);
                    }}
                    placeholder={
                      originFocused
                        ? 'Search a start location'
                        : hasFix
                          ? 'Your location'
                          : 'Locating your position…'
                    }
                    className="flex-1 bg-transparent border-none outline-none text-gray-900 font-bold placeholder:text-gray-400 py-2 min-w-0"
                  />
                  {hasCustomOrigin && (
                    <button
                      type="button"
                      onClick={() => {
                        setOriginText('');
                        setOriginCoords(null);
                        setOriginLabel('');
                        setActiveField('origin');
                      }}
                      className="p-2 text-gray-400 hover:text-blue-500 shrink-0"
                      aria-label="Use my current location"
                      title="Use my current location"
                    >
                      <Navigation size={16} />
                    </button>
                  )}
                </div>
                <div className="h-[1px] bg-gray-100 mx-3" />
                {/* To */}
                <div className="flex items-center gap-2">
                  <div className="pl-3 w-7 flex justify-center shrink-0">
                    <span className="w-2.5 h-2.5 rounded-sm bg-red-500 block shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
                  </div>
                  <input
                    type="text"
                    value={destinationText}
                    onChange={(e) => {
                      setDestinationText(e.target.value);
                      if (destinationCoords) setDestinationCoords(null);
                    }}
                    onFocus={() => {
                      setActiveField('destination');
                      setSuggestionsOpen(true);
                    }}
                    onBlur={() => {
                      setTimeout(() => setSuggestionsOpen(false), 120);
                    }}
                    placeholder="Where to?"
                    className="flex-1 bg-transparent border-none outline-none text-gray-900 font-bold placeholder:text-gray-400 py-2 min-w-0"
                  />
                  <button
                    type="submit"
                    className="bg-blue-500 text-white p-2.5 rounded-2xl shadow-lg active:scale-95 transition-transform shrink-0"
                  >
                    <ArrowRight size={20} />
                  </button>
                </div>
              </div>
            )}
          </form>

          {!isRouteVisible && suggestionsOpen && (activeText.trim().length >= 2 || favorites.length > 0) && (
            <div className="bg-white/95 backdrop-blur-md rounded-3xl shadow-2xl border border-white/40 overflow-hidden max-h-[60vh] overflow-y-auto">
              {/* Pinned favorites — always shown when input is empty, hidden once user types 2+ chars */}
              {activeText.trim().length < 2 && favorites.length > 0 && (
                <>
                  <div className="px-4 pt-3 pb-1 text-[10px] font-black text-gray-400 uppercase tracking-[0.18em]">
                    Favorites
                  </div>
                  {favorites.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handlePickFavorite(f)}
                      className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 active:bg-gray-100 border-t first:border-t-0 border-gray-100 transition-colors"
                    >
                      <div className="mt-0.5 text-yellow-500 shrink-0">
                        <Star size={16} className="fill-yellow-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-gray-900 truncate">{f.name}</div>
                        <div className="text-[11px] text-gray-500 font-medium truncate">{f.primary}</div>
                      </div>
                    </button>
                  ))}
                </>
              )}
              {activeText.trim().length >= 2 && suggestionsLoading && suggestions.length === 0 && (
                <div className="flex items-center gap-3 px-4 py-3 text-sm text-gray-500 font-semibold">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  Searching nearby…
                </div>
              )}
              {activeText.trim().length >= 2 &&
                !suggestionsLoading &&
                suggestions.length === 0 && (
                <div className="px-4 py-3 text-sm text-gray-500 font-semibold">
                  No matches for "{activeText.trim()}"
                </div>
              )}
              {activeText.trim().length >= 2 && suggestions.map((s, i) => (
                <button
                  key={`${s.lat},${s.lng},${i}`}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handlePickSuggestion(s)}
                  className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 active:bg-gray-100 border-t first:border-t-0 border-gray-100 transition-colors"
                >
                  <div className="mt-0.5 text-blue-500 shrink-0">
                    <Search size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-gray-900 truncate">{s.primary}</div>
                    {s.secondary && (
                      <div className="text-[11px] text-gray-500 font-medium truncate">{s.secondary}</div>
                    )}
                  </div>
                  {s.category && (
                    <span className="text-[9px] font-black uppercase tracking-wider text-gray-400 mt-1 shrink-0">
                      {s.category}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="w-14 h-14 bg-white/95 backdrop-blur-md rounded-3xl shadow-2xl border border-white/40 flex items-center justify-center overflow-hidden text-gray-600 hover:text-gray-900 active:scale-95 transition-transform"
              aria-label="My services"
            >
              <Settings size={22} />
            </button>
            <button
              type="button"
              onClick={() => user && setProfileOpen(true)}
              disabled={!user}
              className="w-14 h-14 bg-white/95 backdrop-blur-md rounded-3xl shadow-2xl border border-white/40 flex items-center justify-center overflow-hidden text-gray-600 hover:text-gray-900 active:scale-95 transition-transform disabled:opacity-60 disabled:active:scale-100"
              aria-label="Profile"
            >
              {user?.photoURL ? (
                <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <UserIcon size={24} className="text-gray-400" />
              )}
            </button>
          </div>
        </div>

        {/* Transport Options (only visible if route is active) */}
        {isRouteVisible && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {MODES.map((mode) => (
              <button
                key={mode.id}
                onClick={() => handleModeChange(mode.id)}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-xl shadow-md border transition-all duration-300 whitespace-nowrap
                  ${activeMode === mode.id
                    ? 'bg-white border-transparent'
                    : 'bg-white/80 backdrop-blur-sm border-gray-100 text-gray-500'}
                `}
                style={{
                  color: activeMode === mode.id ? mode.color : undefined,
                  borderColor: activeMode === mode.id ? mode.color : undefined,
                }}
              >
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: mode.color }} />
                <span className="text-sm font-bold capitalize">{mode.id}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Floating Action Buttons */}
      <div className="absolute bottom-24 right-4 flex flex-col gap-3 z-40">
        <button
          type="button"
          onClick={handleRecenter}
          aria-label="Recenter and enable compass"
          className="w-12 h-12 bg-white/90 backdrop-blur-md rounded-2xl shadow-xl border border-white/20 flex items-center justify-center text-gray-600 active:scale-95 transition-transform"
        >
          <Navigation size={20} />
        </button>
      </div>

      {/* Bottom Sliding Panel */}
      <BottomPanel
        config={activeConfig}
        onClose={handleCloseMode}
        stats={realStats}
        routes={routeOptions}
        destinationLabel={destinationLabel || destinationText}
        loading={loading}
        error={error}
        onRetry={handleRetry}
        providerEstimates={displayedProviderEstimates}
        providerHiddenNote={providerHiddenNote}
        transitResult={transitResult}
        allRoutes={allRoutes}
        onSelectMode={handleSelectMode}
        filterResult={filterResult}
        activePreferenceModes={activeModes}
        onOpenAdjust={() => setAdjustOpen(true)}
        nightAutoActivated={nightAutoActivated}
        onDismissNight={() => setNightDismissed(true)}
      />

      <ProvidersPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        enabled={enabledProviders}
        onToggle={handleToggleProvider}
        preferenceModes={preferenceModes}
        onTogglePreference={handleTogglePreference}
      />

      <Suspense fallback={null}>
        <AdjustTripSheet
          open={adjustOpen}
          onClose={() => setAdjustOpen(false)}
          selected={new Set(activeModes)}
          onToggle={handleToggleTripPreference}
          onReset={handleResetTrip}
          overridden={tripModes !== null || nightDismissed}
        />
      </Suspense>

      {user && (
        <ProfilePanel
          open={profileOpen}
          onClose={() => setProfileOpen(false)}
          user={user}
          favorites={favorites}
          onFavoritesChange={setFavorites}
          mapCenter={mapCenter}
        />
      )}
    </div>
  );
}
