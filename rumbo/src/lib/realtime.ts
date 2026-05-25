import { useEffect, useRef, useState } from 'react';

/**
 * Live bus arrival client for the Rumbo frontend. Talks to /api/realtime/arrivals,
 * which proxies red.cl. See server/transit/redcl.ts for the honest caveats:
 * the upstream is not a contractual API, and any individual stop can return
 * "no-predictions" or "unavailable" at any time. Components MUST fall back to
 * the scheduled GTFS departure time in those cases.
 */

export interface LiveArrival {
  service: string;
  destination: string | null;
  etaMinMinutes: number;
  etaMaxMinutes: number | null;
  distanceMeters: number | null;
  rawEta: string;
  vehiclePlate: string | null;
}

export type LiveArrivalStatus = 'live' | 'no-predictions' | 'unavailable';

export interface ArrivalsApiResponse {
  stopCode: string;
  status: LiveArrivalStatus;
  arrivals: LiveArrival[];
  ageMs: number;
  cached: boolean;
  reason: string | null;
}

export interface UseLiveArrivalState {
  /** "live" means at least one parsed real-time arrival is available for the
   *  requested service. Anything else means UI should show the GTFS schedule. */
  status: LiveArrivalStatus | 'loading';
  /** Soonest arrival for the requested service when status === "live". */
  next: LiveArrival | null;
  /** Up to the next two arrivals for the service, in order. */
  upcoming: LiveArrival[];
  /** ms since this data was generated upstream. Surfaced so UI can flip to
   *  "stale" if it grows too old (e.g. polling halted while in background). */
  ageMs: number;
  /** Last upstream error/reason, when available. Not for prominent display. */
  reason: string | null;
}

const POLL_INTERVAL_MS = 20_000;
const STALE_AFTER_MS = 90_000;

/**
 * Live arrivals for one (stop, service) pair. Returns "loading" until the
 * first response lands, then either "live" with arrivals or a fallback
 * status. Polls every 20s while the document is visible.
 *
 * Pass `null` for stopCode (or for service) to disable the hook entirely —
 * useful for legs without a paradero code (metro/rail/Google fallback).
 */
export function useLiveArrival(
  stopCode: string | null,
  service: string | null,
  options: { enabled?: boolean } = {},
): UseLiveArrivalState {
  const enabled = options.enabled !== false && !!stopCode && !!service;
  const [state, setState] = useState<UseLiveArrivalState>({
    status: enabled ? 'loading' : 'unavailable',
    next: null,
    upcoming: [],
    ageMs: 0,
    reason: null,
  });
  // Track the current request so a late response from a previous (stop, service)
  // pair can't overwrite state after the user switched legs.
  const requestKeyRef = useRef<string>('');

  useEffect(() => {
    if (!enabled || !stopCode || !service) {
      setState({
        status: 'unavailable',
        next: null,
        upcoming: [],
        ageMs: 0,
        reason: null,
      });
      return;
    }

    const key = `${stopCode}::${service}`;
    requestKeyRef.current = key;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      if (cancelled) return;
      try {
        const url = `/api/realtime/arrivals?stop=${encodeURIComponent(
          stopCode!,
        )}&route=${encodeURIComponent(service!)}`;
        const r = await fetch(url, { headers: { Accept: 'application/json' } });
        if (cancelled || requestKeyRef.current !== key) return;
        if (!r.ok) {
          setState((s) => ({ ...s, status: 'unavailable' }));
        } else {
          const data = (await r.json()) as ArrivalsApiResponse;
          if (cancelled || requestKeyRef.current !== key) return;
          const upcoming = data.arrivals.slice(0, 2);
          setState({
            status: data.status,
            next: upcoming[0] ?? null,
            upcoming,
            ageMs: data.ageMs,
            reason: data.reason,
          });
        }
      } catch {
        if (!cancelled && requestKeyRef.current === key) {
          setState((s) => ({ ...s, status: 'unavailable' }));
        }
      }
      // Only schedule next tick while the page is visible — background tabs
      // would otherwise hammer the proxy for no user benefit.
      if (!cancelled && document.visibilityState === 'visible') {
        timer = setTimeout(tick, POLL_INTERVAL_MS);
      }
    }

    function onVisibility() {
      if (document.visibilityState === 'visible' && !timer && !cancelled) {
        tick();
      }
    }
    document.addEventListener('visibilitychange', onVisibility);

    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, stopCode, service]);

  return state;
}

/** Format a parsed ETA window as a Spanish badge string. */
export function formatLiveEta(a: LiveArrival): string {
  if (a.etaMaxMinutes === null) return `>${a.etaMinMinutes} min`;
  if (a.etaMinMinutes === 0 && a.etaMaxMinutes <= 1) return 'llegando';
  if (a.etaMinMinutes === 0) return `<${a.etaMaxMinutes} min`;
  if (a.etaMinMinutes === a.etaMaxMinutes) return `${a.etaMinMinutes} min`;
  return `${a.etaMinMinutes}–${a.etaMaxMinutes} min`;
}

/** Treat data older than ~90s as stale even if the hook is still "live". */
export function isStale(ageMs: number): boolean {
  return ageMs > STALE_AFTER_MS;
}
