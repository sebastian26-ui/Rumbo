import React from 'react';
import {
  ArrowLeft,
  Scale,
  CarTaxiFront,
  AlertTriangle,
  FileText,
  Gavel,
  ShieldCheck,
} from 'lucide-react';

interface Props {
  onBack: () => void;
}

/**
 * Terms of Service.
 *
 * Mirrors the structure and tone of PrivacySecurity.tsx — every claim
 * describes something true of the current product (comparison + handoff
 * to third-party providers, public-tariff estimates, no account-connect).
 * Update in the same PR as any change to the product surface that
 * invalidates a claim here.
 */
export default function TermsOfService({ onBack }: Props) {
  const lastUpdated = '25 May 2026';

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
          <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center">
            <Scale size={24} />
          </div>
          <h1 className="text-3xl font-extrabold text-gray-900 leading-tight">
            Terms of Service
          </h1>
        </div>
        <p className="text-sm text-gray-500 font-medium mb-8">
          The rules for using Rumbo. Last updated {lastUpdated}.
        </p>

        <Card icon={<FileText size={18} />} title="What Rumbo is" accent="blue">
          Rumbo is a free comparison tool for getting around Santiago. It
          shows estimated travel times, distances, and prices across walking,
          biking, public transit, ride-hailing, scooters, and shared bikes.
          We don't operate any vehicle service ourselves and we don't
          process payments. When you tap a provider card we open that
          provider's app or web page with your trip details pre-filled.
        </Card>

        <Card
          icon={<CarTaxiFront size={18} />}
          title="Prices are estimates, not quotes"
          accent="amber"
        >
          <p className="mb-2">
            All ride-hailing, scooter, and shared-bike prices shown in Rumbo
            are <strong>estimates</strong> computed client-side from each
            provider's public tariffs. They are not official quotes and not
            guaranteed.
          </p>
          <p className="mb-2">
            The price you actually pay is set by the provider at the moment
            you confirm your trip in their app, and can differ from Rumbo's
            estimate due to surge pricing, demand multipliers, promotions,
            tolls, or route changes. Rumbo does not control, approve, or
            collect any payment.
          </p>
          <p>
            Time and distance estimates come from public routing services
            (GraphHopper, OSRM, Google Directions where applicable) and the
            official Santiago GTFS feed. They can be wrong in real-world
            traffic or when the feed is stale.
          </p>
        </Card>

        <Card
          icon={<AlertTriangle size={18} />}
          title="When you leave Rumbo, the provider's terms apply"
          accent="rose"
        >
          <p className="mb-2">
            Rumbo is a <strong>comparison + handoff</strong> service. Once
            you tap a provider card and that provider's app or website
            opens, you are no longer using Rumbo — you are using Uber,
            Cabify, DiDi, Beat, Whoosh, Lime, Bike Itaú, RED, or whichever
            service you chose, under <em>their</em> terms and privacy
            policy.
          </p>
          <p>
            Rumbo is not a party to the trip you take with those providers.
            We do not represent them, do not earn commissions from them,
            and do not have visibility into your account, trip status, or
            payments with them.
          </p>
        </Card>

        <Card
          icon={<ShieldCheck size={18} />}
          title="No liability for third-party rides"
          accent="indigo"
        >
          <p className="mb-2">
            Rumbo is provided "as is", without warranty of any kind. We
            don't guarantee that route estimates, prices, transit arrival
            times, or risk indicators are accurate, complete, or
            available at any given moment.
          </p>
          <p>
            To the maximum extent permitted by applicable law, Rumbo and
            its operators are not liable for any loss, damage, injury,
            expense, or incident arising out of (a) trips you take with
            third-party providers reached via Rumbo, (b) reliance on
            estimates or risk indicators shown in Rumbo, or (c)
            unavailability of the service. Disputes about a specific
            trip belong with the provider that operated it.
          </p>
        </Card>

        <Card icon={<FileText size={18} />} title="Acceptable use" accent="emerald">
          You agree not to (a) use Rumbo for any unlawful purpose, (b)
          attempt to disrupt, overload, scrape, or reverse-engineer the
          service or its underlying APIs, (c) probe security boundaries
          or circumvent rate limits, or (d) use Rumbo to harass, surveil,
          or harm anyone. Automated access to the Rumbo API is limited
          by rate limiting; persistent abuse may result in your IP or
          account being blocked.
        </Card>

        <Card icon={<Gavel size={18} />} title="Account, deletion, and data" accent="blue">
          <p className="mb-2">
            You may create an account with an email + password, sign in
            with Google, or use Rumbo as a guest with no account. If you
            create an account, you can delete it at any time from
            <strong> Profile → Delete account</strong>. Deleting your
            account removes your favorites, preferences, and Rumbo
            identity — it does not delete data held by third-party
            providers you've used through their own apps.
          </p>
          <p>
            How Rumbo handles your data is described in detail on the{' '}
            <a
              href="#privacy"
              className="font-bold text-blue-600 hover:underline"
            >
              Privacy &amp; Security page
            </a>
            . If anything there conflicts with these Terms, the Privacy
            page controls in respect of data handling.
          </p>
        </Card>

        <Card icon={<Gavel size={18} />} title="Governing law (Chile)" accent="indigo">
          <p className="mb-2">
            These Terms are governed by the laws of the Republic of Chile.
            Disputes are subject to the exclusive jurisdiction of the
            ordinary courts of Santiago, Chile, without prejudice to any
            mandatory consumer-protection rights you may have under
            Chilean law.
          </p>
          <p className="mb-2">
            Rumbo handles personal data in accordance with Ley N° 19.628
            sobre Protección de la Vida Privada (and its later
            amendments, including the data-protection authority framework
            once in force). Where any Rumbo functionality interacts with
            payment or financial information of partner providers, the
            applicable provisions of Ley N° 21.521 (Ley Fintec) apply to
            those providers, not to Rumbo as a comparison tool.
          </p>
          <p>
            Rumbo does not collect tax or transactional information and
            does not act as an intermediary in payments between you and
            ride-hailing or micromobility providers.
          </p>
        </Card>

        <Card icon={<FileText size={18} />} title="Changes to these Terms" accent="emerald">
          We may update these Terms as the product evolves. Material
          changes will be reflected by an updated date at the top of this
          page. Continued use of Rumbo after a change constitutes
          acceptance of the new Terms.
        </Card>

        <div className="mt-10 rounded-2xl bg-gray-900 text-white p-5">
          <h2 className="text-sm font-black uppercase tracking-[0.18em] text-gray-400 mb-2">
            Contact
          </h2>
          <p className="text-sm text-gray-200 leading-relaxed">
            Questions about these Terms? Email{' '}
            <a
              href="mailto:sebastian.202856@gmail.com"
              className="font-bold text-emerald-300 hover:underline"
            >
              sebastian.202856@gmail.com
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
