import React, { useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import { Check, ArrowRight, Navigation } from 'lucide-react';
import { PROVIDERS, ProviderId, DEFAULT_ENABLED } from '../lib/providers';
import { saveEnabledProviders, saveUserProfile } from '../lib/userPrefs';
import { PreferenceModeId, savePreferenceModes } from '../lib/preferences';
import PreferenceModeList from './PreferenceModeList';

interface Props {
  user: User;
  /** Called when onboarding is finished and the app should proceed. */
  onComplete: () => void;
}

const KIND_LABEL: Record<string, string> = {
  rideshare: 'Ride-hailing',
  scooter: 'Scooters',
  bike_share: 'Shared bikes',
};

// Extra static rows the user can toggle "I use this" — saved as part of profile,
// not yet wired to comparison. (Bip!/Metro is always implicitly available for
// public-transit routing; the toggle lets us know they care about it.)
const EXTRA_MODES = [
  { id: 'bip', label: 'Bip! / Metro & buses', sub: 'Public transit (RED, Metro)' },
  { id: 'walking', label: 'Walking', sub: 'Always shown for short trips' },
];

export default function Onboarding({ user, onComplete }: Props) {
  const [step, setStep] = useState<0 | 1 | 2>(user.displayName ? 1 : 0);
  const [name, setName] = useState(user.displayName ?? '');
  const [city, setCity] = useState('Santiago');
  const [submitting, setSubmitting] = useState(false);

  const [selected, setSelected] = useState<Set<ProviderId>>(
    () => new Set(DEFAULT_ENABLED),
  );
  const [extras, setExtras] = useState<Set<string>>(
    () => new Set(['bip', 'walking']),
  );
  const [prefs, setPrefs] = useState<Set<PreferenceModeId>>(() => new Set());

  const togglePref = (id: PreferenceModeId, next: boolean) => {
    setPrefs((prev) => {
      const n = new Set(prev);
      if (next) n.add(id);
      else n.delete(id);
      return n;
    });
  };

  const grouped = useMemo(
    () =>
      PROVIDERS.reduce<Record<string, typeof PROVIDERS>>((acc, p) => {
        (acc[p.kind] ||= []).push(p);
        return acc;
      }, {}),
    [],
  );

  const toggle = (id: ProviderId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleExtra = (id: string) => {
    setExtras((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const finish = async () => {
    setSubmitting(true);
    try {
      await Promise.all([
        saveUserProfile(user.uid, {
          name: name.trim() || user.displayName || undefined,
          email: user.email ?? undefined,
          city: city.trim() || 'Santiago',
          onboardingComplete: true,
          createdAt: Date.now(),
          // store extras for later wiring (transit, walking preferences)
          // @ts-expect-error: extra fields allowed by merge: true
          extraModes: Array.from(extras),
        }),
        saveEnabledProviders(user.uid, Array.from(selected)),
        savePreferenceModes(user.uid, Array.from(prefs)),
      ]);
      onComplete();
    } catch (e) {
      console.warn('Onboarding finish failed', e);
      // Still proceed — local fallback persists provider selection.
      onComplete();
    } finally {
      setSubmitting(false);
    }
  };

  if (step === 0) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full">
          <div className="w-16 h-16 bg-blue-600 rounded-[1.5rem] flex items-center justify-center mb-6 shadow-xl shadow-blue-200">
            <Navigation size={28} className="text-white" />
          </div>
          <h1 className="text-3xl font-black text-gray-900 mb-2 tracking-tight">
            Welcome to Rumbo
          </h1>
          <p className="text-gray-500 mb-8 font-medium">
            Just a couple of details to personalize your experience.
          </p>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                Your name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="What should we call you?"
                className="w-full mt-1 px-4 py-3 rounded-2xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-blue-600 focus:outline-none font-medium"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                City
              </label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full mt-1 px-4 py-3 rounded-2xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-blue-600 focus:outline-none font-medium"
              />
              <p className="text-[11px] text-gray-400 mt-1 font-medium">
                Rumbo is currently optimized for Santiago, Chile.
              </p>
            </div>
          </div>

          <button
            onClick={() => setStep(1)}
            disabled={!name.trim()}
            className="mt-8 w-full py-4 px-6 bg-blue-600 text-white font-bold rounded-2xl flex items-center justify-center gap-2 hover:bg-blue-700 transition-all active:scale-95 shadow-xl shadow-blue-200 disabled:opacity-60"
          >
            Continue <ArrowRight size={18} />
          </button>
        </div>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6 font-sans">
        <div className="max-w-lg w-full">
          <h1 className="text-3xl font-black text-gray-900 mb-2 tracking-tight">
            Ajusta Rumbo a ti
          </h1>
          <p className="text-gray-500 mb-8 font-medium">
            Activa los modos que se ajusten a tus necesidades, preferencias o
            requerimientos de accesibilidad. Esto cambia cómo Rumbo ordena y
            filtra tus opciones de viaje. Puedes cambiarlo cuando quieras desde
            Ajustes, o solo para un viaje desde la comparación.
          </p>

          <div className="max-h-[55vh] overflow-y-auto pr-1">
            <PreferenceModeList selected={prefs} onToggle={togglePref} />
          </div>

          <button
            onClick={finish}
            disabled={submitting || selected.size === 0}
            className="mt-8 w-full py-4 px-6 bg-blue-600 text-white font-bold rounded-2xl flex items-center justify-center gap-2 hover:bg-blue-700 transition-all active:scale-95 shadow-xl shadow-blue-200 disabled:opacity-60"
          >
            {submitting ? 'Guardando…' : (
              <>
                {prefs.size > 0 ? 'Listo, ir a Rumbo' : 'Omitir por ahora'}{' '}
                <ArrowRight size={18} />
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => setStep(1)}
            disabled={submitting}
            className="mt-2 w-full py-2 text-sm font-bold text-gray-500 hover:text-gray-700"
          >
            ← Volver
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-6 font-sans">
      <div className="max-w-lg w-full">
        <h1 className="text-3xl font-black text-gray-900 mb-2 tracking-tight">
          Pick your services
        </h1>
        <p className="text-gray-500 mb-8 font-medium">
          Check the apps you actually use. Rumbo will only compare those — you can
          change this any time from Settings.
        </p>

        <div className="space-y-7 max-h-[55vh] overflow-y-auto pr-1">
          {Object.entries(grouped).map(([kind, items]) => (
            <section key={kind}>
              <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.18em] mb-3">
                {KIND_LABEL[kind] ?? kind}
              </h3>
              <div className="space-y-2">
                {items.map((p) => {
                  const on = selected.has(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggle(p.id)}
                      className={`w-full flex items-center gap-3 px-3 py-3 rounded-2xl border transition-colors text-left ${
                        on
                          ? 'border-blue-600 bg-blue-50'
                          : 'border-gray-200 bg-white hover:bg-gray-50'
                      }`}
                    >
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-sm shrink-0"
                        style={{ backgroundColor: p.color }}
                      >
                        {p.name[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm text-gray-900 leading-tight">
                          {p.name}
                        </div>
                        <div className="text-[11px] text-gray-500 font-medium">
                          {p.product}
                        </div>
                      </div>
                      <div
                        className={`w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 ${
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
          ))}

          <section>
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.18em] mb-3">
              Other modes
            </h3>
            <div className="space-y-2">
              {EXTRA_MODES.map((m) => {
                const on = extras.has(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleExtra(m.id)}
                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-2xl border transition-colors text-left ${
                      on
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-200 bg-white hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm text-gray-900 leading-tight">
                        {m.label}
                      </div>
                      <div className="text-[11px] text-gray-500 font-medium">
                        {m.sub}
                      </div>
                    </div>
                    <div
                      className={`w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 ${
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
        </div>

        <button
          onClick={() => setStep(2)}
          disabled={selected.size === 0}
          className="mt-8 w-full py-4 px-6 bg-blue-600 text-white font-bold rounded-2xl flex items-center justify-center gap-2 hover:bg-blue-700 transition-all active:scale-95 shadow-xl shadow-blue-200 disabled:opacity-60"
        >
          Continue <ArrowRight size={18} />
        </button>
        <p className="text-center text-[11px] text-gray-400 mt-3 font-medium">
          You can update these any time from Settings → My services.
        </p>
      </div>
    </div>
  );
}
