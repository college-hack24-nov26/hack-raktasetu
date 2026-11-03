import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms & Conditions — RaktaSetu',
  description:
    'Terms of use, prototype limitations, medical disclaimers, and user coordination responsibilities on RaktaSetu.',
};

export default function TermsPage() {
  return (
    <div className="flex-1 bg-white text-slate-900">
      <div className="border-b border-slate-200 bg-slate-50/70 py-4 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto flex items-center gap-2 text-xs text-slate-500 font-medium">
          <Link href="/" className="hover:text-[#B91C32] transition-colors">
            Home
          </Link>
          <span>/</span>
          <span className="text-slate-800 font-semibold">Terms &amp; Conditions</span>
        </div>
      </div>

      <article className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        <header className="mb-8 pb-6 border-b border-slate-200">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-bold uppercase tracking-wider mb-3">
            <span>Prototype Terms of Use</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mb-2">
            Terms &amp; Conditions
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Last Updated: 21 October 2026 • Status: Draft (Flagged for formal legal review prior to commercial release)
          </p>
        </header>

        <div className="space-y-8 text-xs sm:text-sm text-slate-700 leading-relaxed">
          {/* Section 1 */}
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 mb-2">
              1. Prototype Status &amp; Non-Commercial Nature
            </h2>
            <p>
              RaktaSetu is an academic, informational, and research prototype platform designed to explore
              modern privacy mechanisms and digital coordination in blood transfusion logistics. It does not
              constitute a licensed hospital, a clinical laboratory, or a physical blood bank.
            </p>
          </div>

          {/* Section 2 */}
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 mb-2">
              2. No Guarantee of Blood Availability or Donor Attendance
            </h2>
            <p>
              RaktaSetu surfaces external availability estimates provided via public feeds (such as e-RaktKosh).
              Due to continuous, unpredictable emergency hospital usage, blood inventory is volatile. Listing of
              units on this platform does NOT constitute a reservation or guarantee of supply. Users are solely
              responsible for telephoning the facility before transit.
            </p>
            <p className="mt-2">
              Furthermore, when volunteer donors accept coordination requests, their acceptance represents an
              altruistic intent to attend. RaktaSetu cannot guarantee donor physical arrival, health clearance,
              or biological compatibility.
            </p>
          </div>

          {/* Section 3 */}
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 mb-2">
              3. Clinical Medical Decisions Rest Exclusively with Qualified Personnel
            </h2>
            <p>
              No communication or data on RaktaSetu constitutes medical advice, diagnosis, or clinical clearance.
              All pre-donation donor physical examinations (including haemoglobin checks, blood pressure, and medical
              history) and pre-transfusion patient crossmatching must be conducted by certified blood bank and
              hospital medical officers.
            </p>
          </div>

          {/* Section 4 */}
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 mb-2">
              4. Permitted Use &amp; Prohibited Conduct
            </h2>
            <p>Users of RaktaSetu agree to:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Use the platform exclusively for genuine, voluntary patient-donor coordination.</li>
              <li>Provide accurate personal information and verify phone numbers honestly.</li>
              <li>Respect donor privacy and refrain from scraping or broadcasting disclosed contact numbers.</li>
              <li>
                Never demand or offer financial remuneration for blood donation. Commercial trade in human blood is
                strictly illegal under the National Blood Transfusion Council regulations and Indian law.
              </li>
            </ul>
          </div>

          {/* Section 5 */}
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 mb-2">
              5. Account Security &amp; Contact Number Verification
            </h2>
            <p>
              Users authenticate via phone number verification. You are responsible for safeguarding your session
              access. Any phone number update must undergo supported verification procedures to prevent
              unauthorized profile hijacking.
            </p>
          </div>

          {/* Section 6 */}
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 mb-2">
              6. Limitation of Liability
            </h2>
            <p>
              To the fullest extent permitted by applicable law, the contributors, developers, and academic
              institutions supporting the RaktaSetu prototype disclaim all liability for any direct, indirect,
              incidental, or consequential delays, medical complications, or damages resulting from reliance on
              third-party stock feeds or volunteer donor coordination.
            </p>
          </div>

          {/* Legal Review Disclaimer Alert */}
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
            <strong>Legal Review Notice:</strong> This document represents a working operational draft reflecting
            current software architecture. Prior to any live production deployment, these terms must be formally
            reviewed and ratified by qualified legal counsel specialized in Indian digital healthcare regulations.
          </div>
        </div>
      </article>
    </div>
  );
}
