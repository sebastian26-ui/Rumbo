import React from 'react';
import {
  ArrowLeft,
  Lock,
  KeyRound,
  Database,
  EyeOff,
  ExternalLink,
  Share2,
  ShieldCheck,
} from 'lucide-react';

interface Props {
  onBack: () => void;
}

/**
 * Static "Privacy & Security" page.
 *
 * Every claim here describes something that is *actually true* of the current
 * Rumbo stack (Firebase Auth + Firestore + Vercel + client-side deep-link
 * handoff to providers). If you change the stack — for example wiring a new
 * provider, or starting to send data to a backend you didn't before — update
 * this page in the same PR. Don't make claims here that the code can't back.
 */
export default function PrivacySecurity({ onBack }: Props) {
  const lastUpdated = '11 May 2026';

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#F7F8FB] to-white">
      <div className="max-w-2xl mx-auto px-6 pt-6 pb-24">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-900 mb-6"
        >
          <ArrowLeft size={16} /> Back
        </button>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
            <ShieldCheck size={24} />
          </div>
          <h1 className="text-3xl font-extrabold text-gray-900 leading-tight">
            Privacy &amp; Security
          </h1>
        </div>
        <p className="text-sm text-gray-500 font-medium mb-8">
          What we do, what we don't, and where your data goes. Last updated {lastUpdated}.
        </p>

        <Card
          icon={<Lock size={18} />}
          title="HTTPS everywhere"
          accent="emerald"
        >
          Rumbo is served exclusively over HTTPS (TLS) by Vercel. Your browser
          encrypts every request to the app — search queries, routes, and
          authentication tokens — in transit. We don't operate a plaintext
          HTTP endpoint.
        </Card>

        <Card
          icon={<KeyRound size={18} />}
          title="Authentication via Firebase Auth"
          accent="blue"
        >
          Sign-in is handled by Google Firebase Authentication. We never see
          or store your password — Firebase handles the credential flow,
          token issuance, and session management. You can also use Rumbo as
          a guest, with no account.
        </Card>

        <Card
          icon={<Database size={18} />}
          title="Data at rest"
          accent="indigo"
        >
          When signed in, your favorites, saved providers, and onboarding
          state are stored in Google Cloud Firestore. Firestore encrypts
          all data at rest using AES-256, and access is scoped by Firebase
          Auth security rules: only your own UID can read or write your
          documents. Guest sessions store the same data in your browser's
          <code className="px-1 mx-1 rounded bg-gray-100 font-mono text-[12px]">localStorage</code>
          and never leave your device.
        </Card>

        <Card
          icon={<EyeOff size={18} />}
          title="We don't sell or share your data"
          accent="rose"
        >
          We don't sell your data. We don't run third-party ad trackers.
          We don't share your trip history with anyone. Vercel Analytics
          collects aggregate, anonymous page-view counts (no cookies, no
          fingerprinting) so we can see whether the app is being used.
        </Card>

        <Card
          icon={<Share2 size={18} />}
          title="When you tap a provider, what we send"
          accent="amber"
        >
          <p className="mb-3">
            Rumbo is a <strong>comparison + handoff</strong> tool. We don't
            connect to your Uber, DiDi, or Cabify account. When you tap a
            provider card, we open that provider's app (or web page) with
            your trip details pre-filled via a public deep link.
          </p>
          <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-3">
            <div className="text-[11px] font-black text-amber-900 uppercase tracking-wider mb-2">
              What gets passed in the deep link
            </div>
            <ul className="text-xs text-amber-900 leading-relaxed space-y-1 list-disc pl-5">
              <li>Origin coordinates (your current location)</li>
              <li>Destination coordinates and label</li>
            </ul>
            <div className="text-[11px] font-black text-amber-900 uppercase tracking-wider mt-3 mb-2">
              What does NOT get passed
            </div>
            <ul className="text-xs text-amber-900 leading-relaxed space-y-1 list-disc pl-5">
              <li>Your email, name, or Firebase user ID</li>
              <li>Your favorites or trip history</li>
              <li>Which other providers you compared</li>
            </ul>
          </div>
          <p className="text-xs text-gray-500 mt-3">
            Once you're inside the provider's app, their privacy policy
            applies, not ours.
          </p>
        </Card>

        <div className="mt-10 border-t border-gray-200 pt-6">
          <h2 className="text-sm font-black text-gray-400 uppercase tracking-[0.18em] mb-3">
            Providers we hand off to
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {[
              { name: 'Uber', url: 'https://www.uber.com/legal/privacy/' },
              { name: 'DiDi', url: 'https://www.didiglobal.com/privacy' },
              { name: 'Cabify', url: 'https://cabify.com/legal/privacy-policy' },
              { name: 'Whoosh', url: 'https://whoosh.cl/privacidad' },
              { name: 'Lime', url: 'https://www.li.me/privacy' },
              { name: 'Bike Itaú', url: 'https://www.bikeitau.cl/' },
            ].map((p) => (
              <a
                key={p.name}
                href={p.url}
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-white hover:border-gray-300"
              >
                <span className="text-sm font-bold text-gray-900">{p.name}</span>
                <ExternalLink size={12} className="text-gray-400" />
              </a>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">
            Open each provider's privacy policy to see how they handle the
            trip details Rumbo passes them.
          </p>
        </div>

        <div className="mt-10 rounded-2xl bg-gray-900 text-white p-5">
          <h2 className="text-sm font-black uppercase tracking-[0.18em] text-gray-400 mb-2">
            Honest disclosure
          </h2>
          <p className="text-sm text-gray-200 leading-relaxed">
            Rumbo is a small project, not an enterprise platform. We don't
            run a SIEM or a WAF, so we can't truthfully show you a
            real-time "threats blocked" counter — anything like that would
            be theater. What we <em>can</em> tell you is exactly which
            services touch your data (Firebase, Vercel, the providers you
            tap) and exactly what we send to them. That's this page.
          </p>
          <p className="text-sm text-gray-200 leading-relaxed mt-3">
            Questions or concerns? Email{' '}
            <a
              href="mailto:sebastian.202856@gmail.com"
              className="font-bold text-emerald-300 hover:underline"
            >
              sebastian.202856@gmail.com
            </a>
            .
          </p>
          <p className="text-sm text-gray-300 mt-4">
            See also our{' '}
            <a
              href="#terms"
              className="font-bold text-emerald-300 hover:underline"
            >
              Terms of Service
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}

interface CardProps {
  icon: React.ReactNode;
  title: string;
  accent: 'emerald' | 'blue' | 'indigo' | 'rose' | 'amber';
  children: React.ReactNode;
}

const ACCENT_CLASSES: Record<CardProps['accent'], { bg: string; fg: string }> = {
  emerald: { bg: 'bg-emerald-100', fg: 'text-emerald-700' },
  blue: { bg: 'bg-blue-100', fg: 'text-blue-700' },
  indigo: { bg: 'bg-indigo-100', fg: 'text-indigo-700' },
  rose: { bg: 'bg-rose-100', fg: 'text-rose-700' },
  amber: { bg: 'bg-amber-100', fg: 'text-amber-700' },
};

function Card({ icon, title, accent, children }: CardProps) {
  const c = ACCENT_CLASSES[accent];
  return (
    <section className="bg-white border border-gray-100 rounded-2xl p-5 mb-3 shadow-sm">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${c.bg} ${c.fg}`}>
          {icon}
        </div>
        <h2 className="text-base font-extrabold text-gray-900">{title}</h2>
      </div>
      <div className="text-sm text-gray-700 leading-relaxed">{children}</div>
    </section>
  );
}
