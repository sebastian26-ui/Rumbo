import { useState, lazy, Suspense } from 'react';
import { ShieldCheck, ShieldQuestion } from 'lucide-react';
import { RouteRisk, AttentionLevel, LEVEL_SHORT, LEVEL_LABEL } from '../lib/safety';

const RiskDetailSheet = lazy(() => import('./RiskDetailSheet'));

/** Calm ramp — emerald → slate → amber → orange. No red: the data has known
 *  biases and we don't stigmatize comunas with alarm colors. */
const LEVEL_STYLE: Record<AttentionLevel, { bg: string; fg: string }> = {
  low: { bg: 'bg-emerald-100', fg: 'text-emerald-700' },
  moderate: { bg: 'bg-slate-100', fg: 'text-slate-600' },
  elevated: { bg: 'bg-amber-100', fg: 'text-amber-700' },
  high: { bg: 'bg-orange-100', fg: 'text-orange-700' },
  nodata: { bg: 'bg-gray-100', fg: 'text-gray-500' },
};

interface Props {
  risk: RouteRisk;
  /** Mode name for the sheet header, e.g. "Auto" / "Transporte público". */
  modeLabel?: string;
}

/**
 * Compact, tappable attention pill. Rendered inside mode cards that are
 * themselves <button>s, so this is a <span role="button"> and every handler
 * stops propagation — tapping it must never also select the mode. Purely
 * informational; never gates route selection.
 */
export default function RiskBadge({ risk, modeLabel }: Props) {
  const [open, setOpen] = useState(false);
  const level = risk.overall;
  const style = LEVEL_STYLE[level];
  const Icon = level === 'nodata' ? ShieldQuestion : ShieldCheck;

  const openSheet = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setOpen(true);
  };

  return (
    <>
      <span
        role="button"
        tabIndex={0}
        aria-label={`${LEVEL_LABEL[level]}. Ver detalle de seguridad`}
        title={LEVEL_LABEL[level]}
        onClick={openSheet}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') openSheet(e);
        }}
        className={`inline-flex items-center gap-1 ${style.bg} ${style.fg} text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider cursor-pointer select-none active:scale-95 transition-transform`}
      >
        <Icon size={10} />
        {LEVEL_SHORT[level]}
      </span>
      {open && (
        <Suspense fallback={null}>
          <RiskDetailSheet
            risk={risk}
            modeLabel={modeLabel}
            open={open}
            onClose={() => setOpen(false)}
          />
        </Suspense>
      )}
    </>
  );
}
