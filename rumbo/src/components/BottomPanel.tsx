import React, { useState, useEffect } from 'react';
import { motion, useAnimation, PanInfo } from 'motion/react';
import {
  ModeConfig,
  Stat,
  Route as RouteOption,
  TransitRouteResult,
  Leg,
  TransitLegData,
  AllRoutesResult,
  SingleMode,
  ProviderEstimate,
} from '../types';
import { ExternalLink } from 'lucide-react';
import { MODES } from '../constants';
import { colorForTransitLeg } from '../lib/transit';
import { formatDuration, formatDistance } from '../lib/routing';
import { useLiveArrival, formatLiveEta, isStale } from '../lib/realtime';
import RiskBadge from './RiskBadge';
import { riskForRoute } from '../lib/safety';
import type { FilterResult } from '../lib/tripFilter';
import { MODE_LABEL_ES } from '../lib/tripFilter';
import {
  PreferenceModeId,
  PREFERENCE_BY_ID,
} from '../lib/preferences';
import {
  MapPin,
  Clock,
  Leaf,
  DollarSign,
  Flame,
  Footprints,
  Users,
  X,
  AlertCircle,
  RotateCcw,
  Bus,
  TrainFront,
  Train,
  CircleDot,
  Car,
  Bike,
  PersonStanding,
  ChevronRight,
  ChevronDown,
  Zap,
  Moon,
  SlidersHorizontal,
  HelpCircle,
  Info,
} from 'lucide-react';

interface BottomPanelProps {
  config: ModeConfig | null;
  onClose: () => void;
  stats?: Stat[] | null;
  routes?: RouteOption[];
  destinationLabel?: string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  providerEstimates?: ProviderEstimate[];
  transitResult?: TransitRouteResult | null;
  allRoutes?: AllRoutesResult | null;
  onSelectMode?: (mode: SingleMode) => void;
  /** Preference engine output for the "all" comparison (null = no prefs /
   *  no comparison data yet). Drives filtering, re-rank, badges, notes. */
  filterResult?: FilterResult | null;
  /** Modes affecting the current trip (saved + per-trip overrides). */
  activePreferenceModes?: PreferenceModeId[];
  /** Open the "Ajustar para este viaje" sheet. */
  onOpenAdjust?: () => void;
  /** True when "Más seguro de noche" was auto-added because it's night. */
  nightAutoActivated?: boolean;
  /** Turn off the auto-night for this session. */
  onDismissNight?: () => void;
  /** Transparency note when preference modes hid some providers. */
  providerHiddenNote?: string | null;
}

function formatLegDuration(seconds: number | null | undefined): string {
  if (seconds == null) return '—';
  const m = Math.max(1, Math.round(seconds / 60));
  return `${m} min`;
}

function formatFareText(fare: TransitRouteResult['fare']): string {
  if (!fare) return '—';
  if (fare.text) return fare.text;
  if (fare.currency === 'CLP') return `$${Math.round(fare.value).toLocaleString('es-CL')} CLP`;
  return `${fare.value} ${fare.currency}`;
}

function vehicleIcon(leg: TransitLegData) {
  switch (leg.vehicleType) {
    case 'BUS':
      return Bus;
    case 'SUBWAY':
      return TrainFront;
    case 'RAIL':
      return Train;
    case 'TRAM':
      return Train;
    default:
      return CircleDot;
  }
}

function vehicleLabel(leg: TransitLegData) {
  switch (leg.vehicleType) {
    case 'BUS':
      return 'Micro';
    case 'SUBWAY':
      return 'Metro';
    case 'RAIL':
      return 'Tren';
    case 'TRAM':
      return 'Tranvía';
    default:
      return 'Transporte';
  }
}

function formatScheduledHHMM(unix: number | null): string | null {
  if (unix == null) return null;
  const d = new Date(unix * 1000);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Live ETA badge for a transit leg. Renders a green "en vivo" pill when
 * red.cl is returning a real GPS prediction for this paradero + service,
 * and a gray "horario" pill with the scheduled departure time otherwise.
 * Metro / rail / Google-fallback legs never query the live source — they
 * always show the scheduled time.
 */
function TransitLegLiveBadge({ leg }: { leg: TransitLegData }) {
  const liveEligible =
    leg.vehicleType === 'BUS' &&
    !!leg.departureStopCode &&
    !!leg.lineShortName;
  const live = useLiveArrival(
    liveEligible ? leg.departureStopCode : null,
    liveEligible ? leg.lineShortName : null,
  );
  const scheduled = formatScheduledHHMM(leg.departureTimeUnix);

  if (live.status === 'live' && live.next && !isStale(live.ageMs)) {
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider bg-emerald-100 text-emerald-700"
        title={`Predicción real-time de red.cl · ${live.next.rawEta}`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        en vivo · {formatLiveEta(live.next)}
      </span>
    );
  }

  if (scheduled) {
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider bg-gray-100 text-gray-500"
        title="Sin datos en vivo para este paradero. Mostramos el horario del itinerario."
      >
        <Clock size={9} className="opacity-70" />
        horario · {scheduled}
      </span>
    );
  }
  return null;
}

/** Hero "Next departure" card content — live when available, otherwise the
 *  scheduled "in N min" we always had. */
function NextDepartureContent({
  leg,
  scheduledMinutes,
}: {
  leg: TransitLegData;
  scheduledMinutes: number | null;
}) {
  const liveEligible =
    leg.vehicleType === 'BUS' && !!leg.departureStopCode && !!leg.lineShortName;
  const live = useLiveArrival(
    liveEligible ? leg.departureStopCode : null,
    liveEligible ? leg.lineShortName : null,
  );
  const label = leg.lineShortName ?? vehicleLabel(leg);

  if (live.status === 'live' && live.next && !isStale(live.ageMs)) {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <div className="text-sm font-black text-gray-900">
          {label} · {formatLiveEta(live.next)}
        </div>
        <div className="inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-wider text-emerald-700">
          <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
          en vivo
        </div>
      </div>
    );
  }
  const right =
    scheduledMinutes == null
      ? '—'
      : scheduledMinutes <= 0
        ? 'now'
        : `${scheduledMinutes} min`;
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="text-sm font-black text-gray-900">
        {label} · {right}
      </div>
      <div className="text-[8px] font-bold uppercase tracking-wider text-gray-400">
        horario
      </div>
    </div>
  );
}

function nextDepartureMinutes(unix: number | null): number | null {
  if (unix == null) return null;
  const diffMs = unix * 1000 - Date.now();
  if (diffMs <= 0) return 0;
  return Math.round(diffMs / 60000);
}

type PanelState = 'collapsed' | 'half' | 'full';

const MODE_ICON: Record<SingleMode, any> = {
  carpool: Car,
  walk: PersonStanding,
  bike: Bike,
  transit: Bus,
};

interface ModeSummary {
  mode: SingleMode;
  durationSeconds: number | null;
  distanceMeters: number | null;
  /** Short secondary line: fare for transit, distance for others. */
  secondary: string;
  available: boolean;
  errorMessage: string | null;
  /** Full route polyline (transit = all legs concatenated), for the comuna
   *  risk badge. null when the mode errored and has no geometry. */
  coordinates: [number, number][] | null;
}

function summarizeAllRoutes(all: AllRoutesResult): ModeSummary[] {
  const order: SingleMode[] = ['carpool', 'walk', 'transit', 'bike'];
  return order.map((mode) => {
    const o = all[mode];
    if (o.kind === 'error') {
      return {
        mode,
        durationSeconds: null,
        distanceMeters: null,
        secondary: o.error,
        available: false,
        errorMessage: o.error,
        coordinates: null,
      };
    }
    if (o.kind === 'transit') {
      const r = o.result;
      const totalDist = r.legs.reduce((acc, l) => acc + (l.distanceMeters || 0), 0);
      const coords = r.legs.flatMap((l) => l.coordinates ?? []);
      return {
        mode,
        durationSeconds: r.totalDurationSeconds,
        distanceMeters: totalDist || null,
        secondary: r.available ? formatFareText(r.fare) : r.status,
        available: r.available,
        errorMessage: r.available ? null : r.status,
        coordinates: coords.length > 0 ? coords : null,
      };
    }
    return {
      mode,
      durationSeconds: o.primary.durationSeconds,
      distanceMeters: o.primary.distanceMeters,
      secondary: formatDistance(o.primary.distanceMeters),
      available: true,
      errorMessage: null,
      coordinates: o.primary.coordinates ?? null,
    };
  });
}

function formatFare(price: number, currency?: string) {
  if (currency) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
        maximumFractionDigits: 0,
      }).format(price);
    } catch {
      return `${price.toLocaleString()} ${currency}`;
    }
  }
  return `$${price.toLocaleString()}`;
}

function formatEstimateRange(est: ProviderEstimate): string {
  if (est.low === est.high) return formatFare(est.low, est.currency);
  return `${formatFare(est.low, est.currency)} – ${formatFare(est.high, est.currency)}`;
}

const STAT_ICONS: Record<string, any> = {
  'Travel Time': Clock,
  'Walking Time': Clock,
  'Total Time': Clock,
  'Cycling Time': Clock,
  'CO₂ Saved': Leaf,
  'Money Saved': DollarSign,
  'Fare': DollarSign,
  'Calories': Flame,
  'Steps': Footprints,
  'Occupancy': Users,
  'Distance': MapPin,
};

export default function BottomPanel({
  config,
  onClose,
  stats,
  routes = [],
  destinationLabel,
  loading = false,
  error = null,
  onRetry,
  providerEstimates = [],
  transitResult = null,
  allRoutes = null,
  onSelectMode,
  filterResult = null,
  activePreferenceModes = [],
  onOpenAdjust,
  nightAutoActivated = false,
  onDismissNight,
  providerHiddenNote = null,
}: BottomPanelProps) {
  const [panelState, setPanelState] = useState<PanelState>('collapsed');
  const [whyOpen, setWhyOpen] = useState<SingleMode | null>(null);
  const controls = useAnimation();

  useEffect(() => {
    if (config) {
      setPanelState('half');
    } else {
      setPanelState('collapsed');
    }
  }, [config]);

  useEffect(() => {
    controls.start(panelState);
  }, [panelState, controls]);

  const handleDragEnd = (_event: any, info: PanInfo) => {
    const { offset, velocity } = info;
    const swipeThreshold = 50;
    const velocityThreshold = 500;

    if (velocity.y > velocityThreshold || offset.y > swipeThreshold) {
      if (panelState === 'full') setPanelState('half');
      else if (panelState === 'half') {
        setPanelState('collapsed');
      }
    } else if (velocity.y < -velocityThreshold || offset.y < -swipeThreshold) {
      if (panelState === 'collapsed') setPanelState('half');
      else if (panelState === 'half') setPanelState('full');
    } else {
      controls.start(panelState);
    }
  };

  if (!config) {
    return (
      <motion.div
        className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-xl rounded-t-3xl shadow-[0_-8px_30px_rgba(0,0,0,0.12)] z-50 p-4 flex flex-col items-center border-t border-white/20"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        style={{ height: '80px' }}
      >
        <div className="w-12 h-1.5 bg-gray-300/50 rounded-full mb-4" />
        <p className="text-gray-400 font-medium">Where to?</p>
      </motion.div>
    );
  }

  const isAll = config?.id === 'all';
  const isTransit = config?.id === 'transit';
  const hasRoute = Boolean(stats && stats.length > 0);
  const summaries: ModeSummary[] | null = isAll && allRoutes ? summarizeAllRoutes(allRoutes) : null;
  const sortedSummaries = summaries
    ? [...summaries].sort((a, b) => {
        if (a.available !== b.available) return a.available ? -1 : 1;
        const ad = a.durationSeconds ?? Number.POSITIVE_INFINITY;
        const bd = b.durationSeconds ?? Number.POSITIVE_INFINITY;
        return ad - bd;
      })
    : null;
  const fastestMode = sortedSummaries?.find((s) => s.available)?.mode ?? null;
  /** Car (carpool) baseline ETA, used to flag modes that beat driving — the
   *  whole point of comparing transit against a car in Santiago traffic. */
  const carDurationSeconds: number | null = (() => {
    const car = summaries?.find((s) => s.mode === 'carpool');
    return car?.available && car.durationSeconds != null ? car.durationSeconds : null;
  })();
  const hasTransitResult = Boolean(transitResult);
  const transitAvailable = Boolean(transitResult?.available);
  const transitLegs: Leg[] = transitResult?.legs ?? [];
  const firstTransit = transitLegs.find(
    (l): l is TransitLegData => l.kind === 'transit',
  );
  const minutesToDeparture = firstTransit
    ? nextDepartureMinutes(firstTransit.departureTimeUnix)
    : null;
  const subLine = destinationLabel
    ? destinationLabel.length > 48
      ? destinationLabel.slice(0, 48) + '…'
      : destinationLabel
    : 'Enter a destination to see your route';

  return (
    <motion.div
      drag="y"
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={0.05}
      onDragEnd={handleDragEnd}
      animate={controls}
      variants={{
        collapsed: { y: 'calc(100% - 80px)' },
        half: { y: '50%' },
        full: { y: '10%' },
      }}
      transition={{ type: 'spring', damping: 35, stiffness: 350, mass: 0.8 }}
      className="fixed bottom-0 left-0 right-0 bg-white/85 backdrop-blur-2xl rounded-t-[2.5rem] shadow-[0_-10px_40px_rgba(0,0,0,0.15)] z-50 flex flex-col overflow-hidden border-t border-white/30"
      style={{ height: '100%' }}
    >
      {/* Handle & Close */}
      <div className="w-full pt-4 pb-2 flex flex-col items-center relative cursor-grab active:cursor-grabbing">
        <div className="w-12 h-1.5 bg-gray-300/60 rounded-full mb-2" />
        <button
          onClick={onClose}
          className="absolute right-6 top-6 w-8 h-8 bg-gray-100/80 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 pb-12 custom-scrollbar">
        <div className="flex items-center justify-between mb-8 mt-2">
          <div className="max-w-[70%]">
            <h2 className="text-2xl font-extrabold text-gray-900 leading-tight mb-1">
              {config.title}
            </h2>
            <p className="text-gray-500 font-semibold text-sm truncate">{subLine}</p>
          </div>
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-xl transform rotate-3"
            style={{ backgroundColor: config.color }}
          >
            <MapPin size={28} />
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <div
              className="w-10 h-10 border-4 rounded-full animate-spin"
              style={{
                borderTopColor: 'transparent',
                borderRightColor: config.color,
                borderBottomColor: config.color,
                borderLeftColor: config.color,
              }}
            />
            <p className="text-sm font-semibold text-gray-500">Computing route…</p>
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5 mb-8 flex items-start gap-3">
            <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={20} />
            <div className="flex-1">
              <p className="text-sm font-bold text-red-900 mb-1">Couldn't build your route</p>
              <p className="text-xs text-red-700 mb-3">{error}</p>
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-red-700 bg-red-100 hover:bg-red-200 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <RotateCcw size={12} />
                  Try again
                </button>
              )}
            </div>
          </div>
        )}

        {/* Empty state: no destination yet */}
        {!loading && !error && !hasRoute && !destinationLabel && (
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 text-center mb-8">
            <MapPin className="mx-auto text-gray-400 mb-2" size={24} />
            <p className="text-sm font-semibold text-gray-600 mb-1">No destination yet</p>
            <p className="text-xs text-gray-400">Type where you're going to see a real route.</p>
          </div>
        )}

        {/* All — side-by-side comparison of every mode, personalized by the
            active preference modes (filtered / re-ranked / badged). */}
        {!loading && !error && isAll && sortedSummaries && (() => {
          const byMode = new Map(sortedSummaries.map((s) => [s.mode, s]));
          // Decorated order from the preference engine when available;
          // otherwise the plain duration sort (unchanged behavior).
          const ordered = filterResult
            ? filterResult.options.map((d) => ({
                d,
                s: byMode.get(d.mode)!,
              }))
            : sortedSummaries.map((s) => ({ d: null as any, s }));
          const sustainableOn = activePreferenceModes.includes('sustainable');
          return (
          <div className="mb-10 space-y-3">
            {/* Personalization toolbar: active-mode pills + adjust button */}
            <div className="flex items-center justify-between gap-2 px-1">
              <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.15em]">
                Compare modes
              </h3>
              <button
                type="button"
                onClick={onOpenAdjust}
                className="inline-flex items-center gap-1.5 text-[11px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition-colors"
              >
                <SlidersHorizontal size={12} />
                Ajustar para este viaje
              </button>
            </div>

            {activePreferenceModes.length > 0 && (
              <div className="flex flex-wrap gap-1.5 px-1">
                {activePreferenceModes.map((id) => (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1 text-[10px] font-bold text-gray-600 bg-gray-100 px-2 py-1 rounded-full"
                  >
                    {PREFERENCE_BY_ID[id].badge && (
                      <span>{PREFERENCE_BY_ID[id].badge}</span>
                    )}
                    {PREFERENCE_BY_ID[id].label}
                  </span>
                ))}
              </div>
            )}

            {/* "Modo nocturno activado" — auto-on after 22:00 */}
            {nightAutoActivated && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-2xl px-4 py-3 flex items-center gap-3">
                <Moon size={16} className="text-indigo-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-indigo-900">
                    Modo nocturno activado
                  </p>
                  <p className="text-[11px] text-indigo-700 leading-snug">
                    Después de las 22:00 priorizamos Uber/Cabify sobre caminatas
                    y buses por comunas con más incidentes.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onDismissNight}
                  className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 shrink-0"
                >
                  Desactivar
                </button>
              </div>
            )}

            {/* Conflicting re-rank modes — surfaced, never auto-resolved */}
            {filterResult?.conflictNote && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-[11px] text-amber-800 leading-snug">
                Tus preferencias no coinciden: {filterResult.conflictNote}{' '}
                Mostramos ambas opciones arriba para que elijas.
              </div>
            )}

            {/* Nothing matched all filters — graceful fallback */}
            {filterResult?.fallbackBanner && (
              <div className="bg-gray-100 border border-gray-200 rounded-2xl px-4 py-3 text-[11px] text-gray-600 leading-snug">
                Ningún viaje cumple todas tus preferencias. Mostrando las
                opciones más cercanas.
              </div>
            )}

            {ordered.map(({ d, s }) => {
              const cfg = MODES.find((m) => m.id === s.mode)!;
              const Icon = MODE_ICON[s.mode];
              const isFastest = s.mode === fastestMode;
              const savedSecondsVsCar =
                s.mode !== 'carpool' &&
                s.available &&
                s.durationSeconds != null &&
                carDurationSeconds != null
                  ? carDurationSeconds - s.durationSeconds
                  : null;
              const beatsCar = savedSecondsVsCar != null && savedSecondsVsCar >= 60;
              const routeRisk = riskForRoute(s.coordinates);
              const hidden = Boolean(d?.hidden);
              const disabled = !s.available || hidden;
              const badges: string[] = d?.badges ?? [];
              const affectedBy: { modeId: PreferenceModeId; effect: string }[] =
                d?.affectedBy ?? [];
              const co2Kg: number | null = d?.co2Kg ?? null;
              return (
                <div key={s.mode}>
                  <button
                    type="button"
                    onClick={() => !disabled && onSelectMode?.(s.mode)}
                    disabled={disabled}
                    className={`w-full text-left rounded-2xl p-4 border flex items-center justify-between transition-all active:scale-[0.99] ${
                      !disabled
                        ? 'bg-white/70 border-white/80 hover:border-gray-200 shadow-sm'
                        : 'bg-gray-50/60 border-gray-100 opacity-60 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0"
                        style={{ backgroundColor: cfg.color }}
                      >
                        <Icon size={18} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className="font-bold text-gray-900 text-sm">
                            {MODE_LABEL_ES[s.mode]}
                          </span>
                          {badges.map((b) => (
                            <span
                              key={b}
                              className="text-sm leading-none"
                              title="Cumple una de tus preferencias"
                            >
                              {b}
                            </span>
                          ))}
                          {!hidden && isFastest && (
                            <span
                              className="text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider"
                              style={{ backgroundColor: `${cfg.color}20`, color: cfg.color }}
                            >
                              Fastest
                            </span>
                          )}
                          {!hidden && beatsCar && !isFastest && (
                            <span className="text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider bg-emerald-100 text-emerald-700 inline-flex items-center gap-0.5">
                              <Zap size={9} className="fill-emerald-700" />
                              Beats car
                            </span>
                          )}
                          {!disabled && (
                            <RiskBadge risk={routeRisk} modeLabel={cfg.title} />
                          )}
                        </div>
                        <div className="text-[11px] text-gray-500 font-medium truncate">
                          {hidden
                            ? d?.hiddenReason || 'Filtrado por tus preferencias'
                            : s.available
                              ? beatsCar && savedSecondsVsCar != null
                                ? `${s.secondary} · ${Math.round(savedSecondsVsCar / 60)} min faster than driving`
                                : s.secondary
                              : s.errorMessage || 'Unavailable'}
                        </div>
                        {sustainableOn && co2Kg != null && !hidden && (
                          <div className="text-[10px] font-bold text-emerald-700 mt-1 inline-flex items-center gap-1">
                            <Leaf size={10} />
                            {co2Kg === 0
                              ? 'Sin emisiones'
                              : `≈ ${co2Kg.toFixed(2).replace('.', ',')} kg CO₂`}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <div className="text-right">
                        <div className="font-black text-gray-900 text-base leading-none">
                          {s.durationSeconds != null
                            ? formatDuration(s.durationSeconds)
                            : '—'}
                        </div>
                        {s.distanceMeters != null && (
                          <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-1">
                            {formatDistance(s.distanceMeters)}
                          </div>
                        )}
                      </div>
                      {!disabled && <ChevronRight size={16} className="text-gray-300" />}
                    </div>
                  </button>

                  {/* "¿Por qué veo esto?" — transparency on what's filtering */}
                  {affectedBy.length > 0 && (
                    <div className="px-1 mt-1">
                      <button
                        type="button"
                        onClick={() =>
                          setWhyOpen(whyOpen === s.mode ? null : s.mode)
                        }
                        className="inline-flex items-center gap-1 text-[10px] font-bold text-gray-400 hover:text-gray-600"
                      >
                        <HelpCircle size={11} />
                        ¿Por qué veo esto?
                        <ChevronDown
                          size={11}
                          className={`transition-transform ${whyOpen === s.mode ? 'rotate-180' : ''}`}
                        />
                      </button>
                      {whyOpen === s.mode && (
                        <ul className="mt-1.5 space-y-1 bg-gray-50 rounded-xl p-3">
                          {affectedBy.map((a, idx) => (
                            <li
                              key={idx}
                              className="text-[11px] text-gray-600 leading-snug flex gap-1.5"
                            >
                              <span className="font-bold text-gray-700 shrink-0">
                                {PREFERENCE_BY_ID[a.modeId].label}:
                              </span>
                              <span>{a.effect}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Proxy / honesty labels — never claim precision we don't have */}
            {filterResult && filterResult.proxyNotes.length > 0 && (
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3 space-y-1.5 mt-1">
                {filterResult.proxyNotes.map((n, i) => (
                  <p
                    key={i}
                    className="text-[10px] text-gray-500 leading-snug flex gap-1.5"
                  >
                    <Info size={11} className="text-gray-400 mt-0.5 shrink-0" />
                    {n}
                  </p>
                ))}
              </div>
            )}

            <p className="text-[11px] text-gray-400 font-medium px-1 pt-1">
              Tap a mode to see route details.
            </p>
          </div>
          );
        })()}

        {!loading && !error && isTransit && (
          <div className="mb-10">
            {hasTransitResult && transitResult && (
              <>
            {!transitAvailable && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4 flex items-start gap-3">
                <AlertCircle className="text-amber-500 flex-shrink-0 mt-0.5" size={18} />
                <div className="flex-1">
                  <p className="text-xs font-bold text-amber-900 mb-1 uppercase tracking-wider">
                    No transit option
                  </p>
                  <p className="text-xs text-amber-800 leading-relaxed">{transitResult.status}</p>
                </div>
              </div>
            )}

            {transitAvailable && (
              <div className="grid grid-cols-3 gap-3 mb-6">
                <div className="bg-white/40 rounded-2xl p-3 border border-white/50 flex flex-col items-center text-center shadow-sm">
                  <div className="flex items-center gap-1.5 text-gray-400 mb-1.5">
                    <Clock size={12} className="opacity-70" />
                    <span className="text-[9px] font-bold uppercase tracking-wider opacity-60">
                      Total Time
                    </span>
                  </div>
                  <div className="text-sm font-black text-gray-900">
                    {formatLegDuration(transitResult.totalDurationSeconds)}
                  </div>
                </div>
                <div className="bg-white/40 rounded-2xl p-3 border border-white/50 flex flex-col items-center text-center shadow-sm">
                  <div className="flex items-center gap-1.5 text-gray-400 mb-1.5">
                    <DollarSign size={12} className="opacity-70" />
                    <span className="text-[9px] font-bold uppercase tracking-wider opacity-60">
                      Fare
                    </span>
                  </div>
                  <div className="text-sm font-black text-gray-900">
                    {formatFareText(transitResult.fare)}
                  </div>
                </div>
                <div className="bg-white/40 rounded-2xl p-3 border border-white/50 flex flex-col items-center text-center shadow-sm">
                  <div className="flex items-center gap-1.5 text-gray-400 mb-1.5">
                    <Bus size={12} className="opacity-70" />
                    <span className="text-[9px] font-bold uppercase tracking-wider opacity-60">
                      Next departure
                    </span>
                  </div>
                  {firstTransit ? (
                    <NextDepartureContent
                      leg={firstTransit}
                      scheduledMinutes={minutesToDeparture}
                    />
                  ) : (
                    <div className="text-sm font-black text-gray-900">—</div>
                  )}
                </div>
              </div>
            )}

            {transitLegs.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.15em] px-1 mb-2">
                  Trip breakdown
                </h3>
                {transitLegs.map((leg, i) => {
                  if (leg.kind === 'walk') {
                    return (
                      <div
                        key={i}
                        className="bg-white/40 rounded-2xl p-4 border border-white/60 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-gray-100 text-gray-500">
                            <Footprints size={16} />
                          </div>
                          <div>
                            <div className="font-bold text-gray-900 text-sm leading-none mb-1">
                              Walk
                            </div>
                            <div className="text-[11px] text-gray-400 font-medium">
                              {Math.round(leg.distanceMeters)} m
                            </div>
                          </div>
                        </div>
                        <div className="font-black text-sm text-gray-900">
                          {formatLegDuration(leg.durationSeconds)}
                        </div>
                      </div>
                    );
                  }

                  const Icon = vehicleIcon(leg);
                  const lineColor = colorForTransitLeg(leg);
                  const textColor = leg.lineTextColor || '#FFFFFF';
                  return (
                    <div
                      key={i}
                      className="bg-white/70 rounded-2xl p-4 border border-white/80 flex items-center justify-between shadow-sm"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                          style={{ backgroundColor: lineColor, color: textColor }}
                        >
                          <Icon size={16} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className="text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider"
                              style={{ backgroundColor: lineColor, color: textColor }}
                            >
                              {leg.lineShortName || vehicleLabel(leg)}
                            </span>
                            {leg.numStops != null && (
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                {leg.numStops} {leg.numStops === 1 ? 'parada' : 'paradas'}
                              </span>
                            )}
                            <TransitLegLiveBadge leg={leg} />
                          </div>
                          <div className="text-sm font-bold text-gray-900 truncate">
                            {leg.headsign
                              ? `→ ${leg.headsign}`
                              : leg.lineLongName ?? vehicleLabel(leg)}
                          </div>
                          {(leg.departureStop || leg.arrivalStop) && (
                            <div className="text-[11px] text-gray-400 font-medium truncate">
                              {leg.departureStop ?? '?'} → {leg.arrivalStop ?? '?'}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="font-black text-sm text-gray-900 shrink-0 ml-2">
                        {formatLegDuration(leg.durationSeconds)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
              </>
            )}
          </div>
        )}

        {/* Stats Row (real data) */}
        {!loading && !error && hasRoute && stats && (
          <div className="grid grid-cols-3 gap-3 mb-10">
            {stats.map((stat, i) => {
              const Icon = STAT_ICONS[stat.key] || Clock;
              return (
                <div
                  key={i}
                  className="bg-white/40 rounded-2xl p-3 border border-white/50 flex flex-col items-center text-center shadow-sm"
                >
                  <div className="flex items-center gap-1.5 text-gray-400 mb-1.5">
                    <Icon size={12} className="opacity-70" />
                    <span className="text-[9px] font-bold uppercase tracking-wider whitespace-nowrap opacity-60">
                      {stat.key}
                    </span>
                  </div>
                  <div className="text-sm font-black text-gray-900">{stat.value}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* Routes List (real data) */}
        {!loading && !error && routes.length > 0 && (
          <div className="space-y-4 mb-10">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.15em]">
                Recommended Routes
              </h3>
            </div>
            {routes.map((route, i) => (
              <div
                key={i}
                className="bg-white/60 rounded-[1.5rem] p-5 border border-white/80 shadow-sm flex items-center justify-between hover:border-gray-200 transition-all active:scale-[0.98]"
              >
                <div className="flex items-center gap-4">
                  <div
                    className="w-2.5 h-2.5 rounded-full shadow-sm"
                    style={{ backgroundColor: config.color }}
                  />
                  <div>
                    <div className="font-bold text-gray-900 leading-none mb-1.5">{route.name}</div>
                    <div className="text-[11px] text-gray-400 font-medium">
                      {route.time || route.distance} • {route.detail}
                    </div>
                  </div>
                </div>
                {route.badge && (
                  <span
                    className="text-[9px] font-black px-2.5 py-1.5 rounded-xl uppercase tracking-wider"
                    style={{ backgroundColor: `${config.color}15`, color: config.color }}
                  >
                    {route.badge}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Provider comparison (carpool: ride-hailing; bike: scooter + shared bike).
            Only shown once we have a real route to estimate against. */}
        {(config.id === 'carpool' || config.id === 'bike') && hasRoute && (
          <div className="space-y-4 mb-10">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.15em]">
                {config.id === 'carpool' ? 'Price comparison' : 'Other ways'}
              </h3>
              <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider">
                Estimated
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {providerEstimates.length > 0 ? (
                providerEstimates.map((est, i) => {
                  const isBest = i === 0 && providerEstimates.length > 1;
                  return (
                    <a
                      key={est.providerId}
                      href={est.deepLinkUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className={`p-4 rounded-2xl border transition-all flex items-center justify-between gap-3 active:scale-[0.99] ${
                        isBest ? 'bg-blue-50/50 border-blue-200' : 'bg-white/60 border-white/80 hover:bg-white/80'
                      }`}
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-sm shrink-0"
                          style={{ backgroundColor: est.color }}
                        >
                          {est.name[0]}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-gray-900 truncate">
                            {est.name} {est.product}
                          </div>
                          <div className="text-[11px] text-gray-500 font-medium truncate">
                            {est.note ?? 'Tap to open the app'}
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-black text-gray-900 text-sm">
                          {formatEstimateRange(est)}
                        </div>
                        <div className="flex items-center justify-end gap-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-0.5">
                          {isBest ? (
                            <span className="text-blue-600 bg-blue-100 px-2 py-0.5 rounded-lg">Cheapest</span>
                          ) : (
                            <>
                              <ExternalLink size={10} /> Open
                            </>
                          )}
                        </div>
                      </div>
                    </a>
                  );
                })
              ) : (
                <div className="text-center py-4 text-gray-400 text-sm font-medium">
                  No providers enabled — open settings to turn some on.
                </div>
              )}
            </div>

            {providerHiddenNote && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 leading-snug flex gap-1.5">
                <Info size={12} className="mt-0.5 shrink-0" />
                {providerHiddenNote}
              </p>
            )}
            <p className="text-[10px] text-gray-400 leading-relaxed px-1">
              Prices use public Santiago tariffs and your trip distance + time. Actual fares
              vary with surge, promos, and product tier.
            </p>
          </div>
        )}

        {/* Start Button (disabled until we have a real route) */}
        {!isAll && (
          <button
            disabled={(!hasRoute && !transitAvailable) || loading}
            className="w-full py-5 px-6 text-white font-black text-lg rounded-[1.5rem] shadow-2xl transition-all active:scale-95 mb-6 flex items-center justify-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
            style={{
              backgroundColor: config.color,
              boxShadow: `0 10px 25px -5px ${config.color}66`,
            }}
          >
            {config.btnLabel}
          </button>
        )}
      </div>
    </motion.div>
  );
}
