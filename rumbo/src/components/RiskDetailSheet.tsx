import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ShieldCheck, ShieldQuestion, Info, ChevronDown, ChevronRight } from 'lucide-react';
import {
  RouteRisk,
  AttentionLevel,
  LEVEL_LABEL,
  RISK_META,
} from '../lib/safety';

/** Same calm ramp as the badge — no red. */
const DOT: Record<AttentionLevel, string> = {
  low: '#10B981',
  moderate: '#64748B',
  elevated: '#F59E0B',
  high: '#F97316',
  nodata: '#9CA3AF',
};

interface Props {
  risk: RouteRisk;
  modeLabel?: string;
  open: boolean;
  onClose: () => void;
}

/**
 * Decision-support popup. Leads with what kind of incident is common and what
 * to do about it — not raw rates. The CEAD methodology and the per-comuna
 * numbers live behind a collapsed "Cómo calculamos esto" toggle, because a
 * person choosing a bus needs advice, not a statistics lecture. Floating-
 * population distortion is surfaced inline next to the affected comuna, not in
 * fine print. No time-of-day claim — the data has no hourly dimension.
 */
export default function RiskDetailSheet({ risk, modeLabel, open, onClose }: Props) {
  const [showMethod, setShowMethod] = useState(false);
  if (!open) return null;

  const known = risk.comunas.filter((c) => c.risk);
  const unknown = risk.comunas.filter((c) => !c.risk);
  const HeadIcon = risk.overall === 'nodata' ? ShieldQuestion : ShieldCheck;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-full sm:max-w-md max-h-[85vh] overflow-y-auto bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 custom-scrollbar"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shrink-0"
              style={{ backgroundColor: DOT[risk.overall] }}
            >
              <HeadIcon size={22} />
            </div>
            <div>
              <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">
                {modeLabel ? `${modeLabel} · ` : ''}Esta ruta
              </div>
              <div className="text-xl font-extrabold text-gray-900 leading-tight">
                {LEVEL_LABEL[risk.overall]}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Plain-language summary (what's reported here) */}
        <p className="text-sm text-gray-700 leading-relaxed mb-4">
          {risk.summary}
        </p>

        {/* Actionable tip — the part a user can actually use */}
        {risk.tip && (
          <div className="bg-gray-900 text-white rounded-2xl p-4 mb-5">
            <div className="text-[10px] font-black uppercase tracking-[0.15em] text-gray-400 mb-1.5">
              Qué hacer
            </div>
            <p className="text-sm font-semibold leading-relaxed">{risk.tip}</p>
          </div>
        )}

        {/* Per-comuna: type + level dot, distortion note inline */}
        {known.length > 0 && (
          <div className="mb-5">
            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] mb-2">
              Comunas en el trayecto
            </h4>
            <div className="space-y-1.5">
              {known.map((c) => (
                <div key={c.cut} className="bg-gray-50 rounded-xl px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: DOT[c.level] }}
                    />
                    <span className="text-sm font-bold text-gray-900">
                      {c.comuna}
                    </span>
                    <span className="text-xs text-gray-500 font-medium truncate">
                      · {c.typeLabel}
                    </span>
                  </div>
                  {c.note && (
                    <div className="flex items-start gap-1.5 mt-1.5 pl-5">
                      <Info size={12} className="text-blue-500 shrink-0 mt-0.5" />
                      <span className="text-[11px] text-gray-500 leading-relaxed">
                        {c.note}
                      </span>
                    </div>
                  )}
                </div>
              ))}
              {unknown.map((c) => (
                <div
                  key={c.cut}
                  className="flex items-center gap-2.5 bg-gray-50 rounded-xl px-3 py-2.5"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: DOT.nodata }}
                  />
                  <span className="text-sm font-bold text-gray-900">
                    {c.comuna}
                  </span>
                  <span className="text-xs text-gray-400 font-medium">
                    · sin datos
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {known.length === 0 && (
          <div className="mb-5 bg-gray-50 rounded-xl px-4 py-3 text-sm text-gray-600 font-medium">
            No hay estadísticas comunales para los tramos de esta ruta. No se
            infiere ni se muestra un nivel.
          </div>
        )}

        {/* Methodology — collapsed by default; numbers live only here */}
        <button
          onClick={() => setShowMethod((s) => !s)}
          className="w-full flex items-center gap-2 text-[11px] font-black text-gray-500 uppercase tracking-[0.15em] py-2 hover:text-gray-700 transition-colors"
        >
          {showMethod ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <Info size={13} />
          Cómo calculamos esto
        </button>

        {showMethod && (
          <div className="bg-blue-50/60 border border-blue-100 rounded-2xl p-4 mt-1 mb-3">
            <p className="text-[12px] text-gray-600 leading-relaxed mb-3">
              {RISK_META.indicator}. {RISK_META.methodology}.{' '}
              {RISK_META.period}. Nivel geográfico: {RISK_META.geographicLevel}.
              Fuente: {RISK_META.source}.
            </p>

            {known.length > 0 && (
              <div className="mb-3">
                <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] mb-1.5">
                  Tasa oficial por comuna (referencial)
                </div>
                <div className="space-y-1">
                  {known.map((c) => (
                    <div
                      key={c.cut}
                      className="flex items-center justify-between text-[12px]"
                    >
                      <span className="text-gray-600">{c.comuna}</span>
                      <span className="text-gray-500 font-semibold tabular-nums">
                        {c.risk!.ratePer100k.toLocaleString('es-CL')} / 100.000
                        hab.
                        {c.risk!.floatingPopulation ? ' *' : ''}
                      </span>
                    </div>
                  ))}
                </div>
                {known.some((c) => c.risk!.floatingPopulation) && (
                  <p className="text-[10px] text-gray-400 mt-1.5 leading-relaxed">
                    * {RISK_META.floatingPopulationFlag}
                  </p>
                )}
              </div>
            )}

            <ul className="list-disc list-inside space-y-1">
              {RISK_META.caveats.map((c, i) => (
                <li
                  key={i}
                  className="text-[11px] text-gray-500 leading-relaxed"
                >
                  {c}
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-[11px] text-gray-400 leading-relaxed text-center mt-2">
          Información referencial a nivel comuna — no condiciona tu elección de
          ruta.
        </p>
      </div>
    </div>,
    document.body,
  );
}
