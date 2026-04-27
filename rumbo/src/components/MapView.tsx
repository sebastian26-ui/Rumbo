import React, { useState, useEffect, useCallback, useRef } from 'react';
import MapCanvas, { DEFAULT_MAP_CENTER } from './MapCanvas';
import BottomPanel from './BottomPanel';
import { Mode, RoutedPath, Stat, Route as RouteOption, Suggestion } from '../types';
import { MODES } from '../constants';
import { modeToOsrmProfile, buildStatsForMode, buildRouteOptions } from '../lib/routing';
import { User as UserIcon, MapPin, Navigation, ArrowRight, X, Search } from 'lucide-react';

interface MapViewProps {
  user: any;
}

export default function MapView({ user }: MapViewProps) {
  const [activeMode, setActiveMode] = useState<Mode | null>(null);
  const [isRouteVisible, setIsRouteVisible] = useState(false);
  const [mapCenter, setMapCenter] = useState<[number, number]>(DEFAULT_MAP_CENTER);

  const [destinationText, setDestinationText] = useState('');
  const [destinationCoords, setDestinationCoords] = useState<[number, number] | null>(null);
  const [destinationLabel, setDestinationLabel] = useState('');

  const [routePath, setRoutePath] = useState<[number, number][] | null>(null);
  const [realStats, setRealStats] = useState<Stat[] | null>(null);
  const [routeOptions, setRouteOptions] = useState<RouteOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [estimates, setEstimates] = useState<any[]>([]);
  const [estimatesLoading, setEstimatesLoading] = useState(false);

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const suggestionAbortRef = useRef<AbortController | null>(null);
  const suppressNextFetchRef = useRef(false);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setMapCenter([pos.coords.latitude, pos.coords.longitude]),
      () => {},
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 120_000 },
    );
  }, []);

  const activeConfig = activeMode ? MODES.find((m) => m.id === activeMode)! : null;

  const fetchEstimates = useCallback(async (endText: string, origin: [number, number]) => {
    setEstimatesLoading(true);
    try {
      const response = await fetch('/api/estimates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startLat: origin[0], startLng: origin[1], end: endText }),
      });
      const data = await response.json();
      setEstimates(Array.isArray(data.estimates) ? data.estimates : []);
    } catch {
      setEstimates([]);
    } finally {
      setEstimatesLoading(false);
    }
  }, []);

  const computeRoute = useCallback(
    async (
      mode: Mode,
      destText: string,
      presetCoords: [number, number] | null,
      presetLabel: string,
    ) => {
      setLoading(true);
      setError(null);
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

        const routeRes = await fetch('/api/route', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            origin: { lat: mapCenter[0], lng: mapCenter[1] },
            destination: { lat: coords[0], lng: coords[1] },
            profile: modeToOsrmProfile(mode),
            alternatives: true,
          }),
        });
        const routeData = await routeRes.json();
        if (!routeRes.ok) throw new Error(routeData?.error || 'Could not build a route');

        const primary: RoutedPath = routeData.primary;
        setRoutePath(primary.coordinates);
        setRealStats(buildStatsForMode(mode, primary, label || destText));
        setRouteOptions(buildRouteOptions(mode, routeData));
      } catch (e: any) {
        setError(e?.message || 'Routing failed');
        setRoutePath(null);
        setRealStats(null);
        setRouteOptions([]);
      } finally {
        setLoading(false);
      }
    },
    [mapCenter],
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
    const q = destinationText.trim();
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
          body: JSON.stringify({ q, lat: mapCenter[0], lng: mapCenter[1] }),
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
  }, [destinationText, isRouteVisible, mapCenter]);

  const handlePickSuggestion = (s: Suggestion) => {
    suppressNextFetchRef.current = true;
    setDestinationText(s.primary);
    setDestinationCoords([s.lat, s.lng]);
    setDestinationLabel(s.label);
    setSuggestions([]);
    setSuggestionsOpen(false);
    setIsRouteVisible(true);
    const mode: Mode = activeMode ?? 'carpool';
    if (!activeMode) setActiveMode('carpool');
    computeRoute(mode, s.primary, [s.lat, s.lng], s.label);
    if (mode === 'carpool') fetchEstimates(s.label || s.primary, mapCenter);
  };

  const handleCloseMode = () => {
    setActiveMode(null);
    setIsRouteVisible(false);
    setDestinationText('');
    setDestinationCoords(null);
    setDestinationLabel('');
    setRoutePath(null);
    setRealStats(null);
    setRouteOptions([]);
    setEstimates([]);
    setError(null);
    setSuggestions([]);
    setSuggestionsOpen(false);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = destinationText.trim();
    if (!text) return;
    setIsRouteVisible(true);
    const mode: Mode = activeMode ?? 'carpool';
    if (!activeMode) setActiveMode('carpool');
    await computeRoute(mode, text, null, '');
    if (mode === 'carpool') fetchEstimates(text, mapCenter);
  };

  const handleModeChange = (mode: Mode) => {
    setActiveMode(mode);
    if (destinationCoords && destinationText) {
      computeRoute(mode, destinationText, destinationCoords, destinationLabel);
      if (mode === 'carpool') fetchEstimates(destinationText, mapCenter);
    }
  };

  const handleRetry = () => {
    if (!destinationText) return;
    const mode: Mode = activeMode ?? 'carpool';
    computeRoute(mode, destinationText, destinationCoords, destinationLabel);
    if (mode === 'carpool') fetchEstimates(destinationText, mapCenter);
  };

  return (
    <div className="h-screen w-full bg-white overflow-hidden relative font-sans">
      {/* Map Background */}
      <MapCanvas activeMode={activeMode} userCenter={mapCenter} routePath={routePath} />

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
                  <div className="flex-1">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider leading-none mb-1">Current Location</p>
                    <p className="text-sm font-bold text-gray-900 truncate">My Current Location</p>
                  </div>
                </div>
                <div className="h-[1px] bg-gray-100 ml-5.5" />
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-sm bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
                  <div className="flex-1">
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
              <div className="flex items-center gap-2">
                <div className="pl-3 text-blue-500">
                  <MapPin size={18} />
                </div>
                <input
                  type="text"
                  value={destinationText}
                  onChange={(e) => setDestinationText(e.target.value)}
                  onFocus={() => {
                    if (suggestions.length > 0) setSuggestionsOpen(true);
                  }}
                  onBlur={() => {
                    setTimeout(() => setSuggestionsOpen(false), 120);
                  }}
                  placeholder="Where to?"
                  className="flex-1 bg-transparent border-none outline-none text-gray-900 font-bold placeholder:text-gray-400 py-2"
                />
                <button
                  type="submit"
                  className="bg-blue-500 text-white p-2.5 rounded-2xl shadow-lg active:scale-95 transition-transform"
                >
                  <ArrowRight size={20} />
                </button>
              </div>
            )}
          </form>

          {!isRouteVisible && suggestionsOpen && destinationText.trim().length >= 2 && (
            <div className="bg-white/95 backdrop-blur-md rounded-3xl shadow-2xl border border-white/40 overflow-hidden max-h-[60vh] overflow-y-auto">
              {suggestionsLoading && suggestions.length === 0 && (
                <div className="flex items-center gap-3 px-4 py-3 text-sm text-gray-500 font-semibold">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  Searching nearby…
                </div>
              )}
              {!suggestionsLoading && suggestions.length === 0 && (
                <div className="px-4 py-3 text-sm text-gray-500 font-semibold">
                  No matches for "{destinationText.trim()}"
                </div>
              )}
              {suggestions.map((s, i) => (
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
          <div className="w-14 h-14 bg-white/95 backdrop-blur-md rounded-3xl shadow-2xl border border-white/40 flex items-center justify-center overflow-hidden shrink-0">
            {user?.photoURL ? (
              <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <UserIcon size={24} className="text-gray-400" />
            )}
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
        <button className="w-12 h-12 bg-white/90 backdrop-blur-md rounded-2xl shadow-xl border border-white/20 flex items-center justify-center text-gray-600 active:scale-95 transition-transform">
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
        estimates={estimates}
        estimatesLoading={estimatesLoading}
      />
    </div>
  );
}
