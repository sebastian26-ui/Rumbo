import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Info } from 'lucide-react';
import { PROVIDERS, ProviderId } from '../lib/providers';
import { PreferenceModeId } from '../lib/preferences';
import PreferenceModeList from './PreferenceModeList';

interface Props {
  open: boolean;
  onClose: () => void;
  enabled: Set<ProviderId>;
  onToggle: (id: ProviderId, next: boolean) => void;
  preferenceModes: Set<PreferenceModeId>;
  onTogglePreference: (id: PreferenceModeId, next: boolean) => void;
}

const KIND_LABEL: Record<string, string> = {
  rideshare: 'Ride-hailing',
  scooter: 'Scooter',
  bike_share: 'Shared bike',
};

const KIND_ORDER: string[] = ['rideshare', 'scooter', 'bike_share'];

export default function ProvidersPanel({
  open,
  onClose,
  enabled,
  onToggle,
  preferenceModes,
  onTogglePreference,
}: Props) {
  const grouped = PROVIDERS.reduce<Record<string, typeof PROVIDERS>>((acc, p) => {
    (acc[p.kind] ||= []).push(p);
    return acc;
  }, {});
  const groupedOrdered = KIND_ORDER.filter((k) => grouped[k]?.length).map(
    (k) => [k, grouped[k]] as const,
  );

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/30 z-[60]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed top-0 right-0 bottom-0 w-full max-w-sm bg-white z-[70] shadow-2xl flex flex-col"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
          >
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-extrabold text-gray-900">My services</h2>
                <p className="text-xs text-gray-500 font-medium">Pick what shows in the comparison</p>
              </div>
              <button
                onClick={onClose}
                className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors"
                aria-label="Close settings"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-7">
              {groupedOrdered.map(([kind, items]) => (
                <section key={kind}>
                  <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.18em] mb-3">
                    {KIND_LABEL[kind] ?? kind}
                  </h3>
                  <div className="space-y-2">
                    {items.map((p) => {
                      const on = enabled.has(p.id);
                      return (
                        <label
                          key={p.id}
                          className="flex items-center gap-3 px-3 py-3 rounded-2xl border border-gray-100 bg-white hover:bg-gray-50 cursor-pointer"
                        >
                          <div
                            className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-sm shrink-0"
                            style={{ backgroundColor: p.color }}
                          >
                            {p.name[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-sm text-gray-900 leading-tight">{p.name}</span>
                              {p.badge && (
                                <span
                                  className="text-[9px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider text-white"
                                  style={{ backgroundColor: p.color }}
                                >
                                  {p.badge}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-gray-500 font-medium">
                              {p.description ?? p.product}
                            </div>
                          </div>
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={(e) => onToggle(p.id, e.target.checked)}
                            className="w-5 h-5 accent-blue-600"
                          />
                        </label>
                      );
                    })}
                  </div>
                </section>
              ))}

              <div className="pt-2 border-t border-gray-100">
                <div className="mb-4">
                  <h2 className="text-lg font-extrabold text-gray-900">
                    Personalización del viaje
                  </h2>
                  <p className="text-xs text-gray-500 font-medium">
                    Modos que ajustan cómo se ordenan y filtran tus opciones
                  </p>
                </div>
                <PreferenceModeList
                  selected={preferenceModes}
                  onToggle={onTogglePreference}
                />
              </div>

              <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex gap-3 items-start">
                <Info size={16} className="text-blue-500 mt-0.5 shrink-0" />
                <div className="text-xs text-blue-900 leading-relaxed">
                  <p className="font-bold mb-1">About these prices</p>
                  <p className="text-blue-800">
                    Estimates use public Santiago tariffs and your trip's distance + time.
                    They aren't pulled from your accounts — actual prices may vary with surge,
                    promos, or product tier. Tap any provider to open their app for the real fare.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
