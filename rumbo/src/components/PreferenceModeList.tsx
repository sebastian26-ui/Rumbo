import React from 'react';
import { Check } from 'lucide-react';
import {
  PREFERENCE_MODES,
  PREFERENCE_CATEGORY_ORDER,
  PREFERENCE_CATEGORY_LABEL,
  PreferenceModeId,
} from '../lib/preferences';

interface Props {
  selected: Set<PreferenceModeId>;
  onToggle: (id: PreferenceModeId, next: boolean) => void;
  /** Compact hides the example line — used in the quick "adjust" sheet. */
  compact?: boolean;
}

/**
 * The 11 preference modes grouped into the three categories, with a one-line
 * description + a use-case example. Shared by onboarding, settings, and the
 * per-trip "Ajustar para este viaje" sheet so the wording stays identical.
 */
export default function PreferenceModeList({
  selected,
  onToggle,
  compact = false,
}: Props) {
  return (
    <div className="space-y-7">
      {PREFERENCE_CATEGORY_ORDER.map((cat) => {
        const items = PREFERENCE_MODES.filter((m) => m.category === cat);
        return (
          <section key={cat}>
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.18em] mb-3">
              {PREFERENCE_CATEGORY_LABEL[cat]}
            </h3>
            <div className="space-y-2">
              {items.map((m) => {
                const on = selected.has(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onToggle(m.id, !on)}
                    aria-pressed={on}
                    className={`w-full flex items-start gap-3 px-3 py-3 rounded-2xl border transition-colors text-left ${
                      on
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-200 bg-white hover:bg-gray-50'
                    }`}
                  >
                    {m.badge && (
                      <div className="text-lg leading-none mt-0.5 shrink-0 w-6 text-center">
                        {m.badge}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm text-gray-900 leading-tight">
                        {m.label}
                      </div>
                      <div className="text-[11px] text-gray-600 font-medium mt-0.5 leading-snug">
                        {m.description}
                      </div>
                      {!compact && (
                        <div className="text-[11px] text-gray-400 font-medium mt-1 leading-snug italic">
                          {m.example}
                        </div>
                      )}
                    </div>
                    <div
                      className={`w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                        on
                          ? 'bg-blue-600 border-blue-600'
                          : 'border-gray-300 bg-white'
                      }`}
                    >
                      {on && <Check size={14} className="text-white" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
