import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Info, RotateCcw } from 'lucide-react';
import { PreferenceModeId } from '../lib/preferences';
import PreferenceModeList from './PreferenceModeList';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Effective modes for THIS trip (saved + session overrides). */
  selected: Set<PreferenceModeId>;
  onToggle: (id: PreferenceModeId, next: boolean) => void;
  /** Reset session overrides back to the saved preferences. */
  onReset: () => void;
  /** True when any session override differs from the saved set. */
  overridden: boolean;
}

/**
 * "Ajustar para este viaje" — a temporary override. Toggling here changes the
 * current trip's results only; the saved preference (settings) is untouched.
 */
export default function AdjustTripSheet({
  open,
  onClose,
  selected,
  onToggle,
  onReset,
  overridden,
}: Props) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/30 z-[80]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed bottom-0 left-0 right-0 max-h-[85vh] bg-white z-[90] rounded-t-3xl shadow-2xl flex flex-col"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
          >
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-extrabold text-gray-900">
                  Ajustar para este viaje
                </h2>
                <p className="text-xs text-gray-500 font-medium">
                  Solo afecta esta búsqueda — tu preferencia guardada no cambia
                </p>
              </div>
              <button
                onClick={onClose}
                className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors"
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              <PreferenceModeList
                selected={selected}
                onToggle={onToggle}
                compact
              />
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex items-center gap-3">
              {overridden && (
                <button
                  type="button"
                  onClick={onReset}
                  className="flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-gray-700 px-3 py-2"
                >
                  <RotateCcw size={14} /> Restablecer
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 px-6 bg-blue-600 text-white font-bold rounded-2xl active:scale-95 transition-all"
              >
                Aplicar a este viaje
              </button>
            </div>

            <div className="px-6 pb-5">
              <div className="bg-blue-50 border border-blue-100 rounded-2xl p-3 flex gap-2 items-start">
                <Info size={14} className="text-blue-500 mt-0.5 shrink-0" />
                <p className="text-[11px] text-blue-800 leading-relaxed">
                  Para guardar estos modos de forma permanente, ve a Ajustes →
                  Personalización del viaje.
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
