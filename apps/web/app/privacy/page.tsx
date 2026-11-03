import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — RaktaSetu',
  description:
    'RaktaSetu data governance, mutual consent protocols, phone number protection, and retention policies.',
};

export default function PrivacyPolicyPage() {
  return (
    <div className="flex-1 bg-white text-slate-900">
      <div className="border-b border-slate-200 bg-slate-50/70 py-4 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto flex items-center gap-2 text-xs text-slate-500 font-medium">
          <Link href="/" className="hover:text-[#B91C32] transition-colors">
            Home
          </Link>
          <span>/</span>
          <span className="text-slate-800 font-semibold">Privacy Policy</span>
        </div>
      </div>

      <article className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        <header className="mb-8 pb-6 border-b border-slate-200">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-bold uppercase tracking-wider mb-3">
            <span>Data Governance &amp; Privacy Protocol</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mb-2">
            Privacy Policy
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Effective Date: 21 October 2026 • Status: Implementation-Grounded Draft
          </p>
        </header>

        <div className="space-y-8 text-xs sm:text-sm text-slate-700 leading-relaxed">
          {/* Section 1 */}
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 mb-2">
              1. Information We Collect
            </h2>
            <p>
              In accordance with RaktaSetu&apos;s data minimization architecture, we collect only the information
              strictly required to coordinate blood availability:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1.5">
              <li>
                <strong>Identity &amp; Contact:</strong> Mobile telephone number (stored with E.164 normalization
                and verified via OTP) and optional display name.
              </li>
              <li>
                <strong>Donor Attributes:</strong> ABO/Rh blood group, district, state, and optional city or
                locality string.
              </li>
              <li>
                <strong>Consent &amp; Availability:</strong> Donor availability flag (`isAvailable`) and search
                participation consent (`searchConsent`).
              </li>
              <li>
                <strong>Request &amp; Coordination Logs:</strong> Patient name, admitted blood centre/hospital,
                required component, unit count, urgency tier, and invitation responses (Pending, Accepted,
                Declined, Cancelled).
              </li>
              <li>
                <strong>Audit Records:</strong> Session tokens (persisted securely in local storage and verified
                server-side) and timestamps for verified donation events.
              </li>
            </ul>
          </div>

          {/* Section 2 */}
          <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
            <h2 className="text-base font-bold text-slate-900">
              2. Strict Contact Disclosure Rules (Mutual Acceptance Only)
            </h2>
            <p>
              RaktaSetu never publishes donor directories with visible telephone numbers. Pre-acceptance matching
              APIs return only anonymized cards displaying blood group, district, and locality.
            </p>
            <p className="font-semibold text-slate-800">
              A donor&apos;s verified telephone number is disclosed to a patient ONLY when that specific donor
              explicitly accepts the patient&apos;s invitation. Similarly, the patient&apos;s phone number is
              disclosed only to that accepted donor.
            </p>
          </div>

          {/* Section 3 */}
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 mb-2">
              3. Consent Withdrawal &amp; Availability Control
            </h2>
            <p>
              Voluntary donors maintain total autonomy over their data. Through the User Profile page, you can:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Toggle availability off when traveling or temporarily unable to donate.</li>
              <li>Withdraw search consent entirely, removing your profile from all future matching algorithms.</li>
              <li>Request profile deactivation without deleting past emergency coordination audit logs.</li>
            </ul>
          </div>

          {/* Section 4 */}
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 mb-2">
              4. Third-Party Integrations
            </h2>
            <p>
              The RaktaSetu prototype connects with the following external endpoints:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1.5">
              <li>
                <strong>e-RaktKosh:</strong> Public blood centre directory and stock status queries for
                Maharashtra state and districts. No donor personal data is ever transmitted to e-RaktKosh.
              </li>
              <li>
                <strong>Mapbox:</strong> Vector map rendering and spatial display of registered hospital centres.
                Client IP addresses are processed by Mapbox according to their standard API privacy policy.
              </li>
              <li>
                <strong>WhatsApp Messaging Gateway:</strong> When configured, transactional coordination alerts are
                transmitted to registered phone numbers. Notifications operate non-blockingly and fail safely.
              </li>
            </ul>
          </div>

          {/* Section 5 */}
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 mb-2">
              5. Data Retention &amp; Integrity
            </h2>
            <p>
              To protect donor eligibility and prevent false clinical deferrals, patient-reported donation outcomes
              are logged as &ldquo;Reported (Unverified)&rdquo;. Official 90-day medical deferral intervals are
              updated exclusively when verified by accredited blood bank personnel.
            </p>
          </div>

          {/* Privacy Review Alert */}
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
            <strong>Legal &amp; Privacy Notice:</strong> This policy reflects the architectural implementation of the
            RaktaSetu prototype. It is subject to formal review and refinement under the Digital Personal Data
            Protection Act (DPDP Act) prior to any live institutional rollout.
          </div>
        </div>
      </article>
    </div>
  );
}
