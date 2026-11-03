import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About Us — RaktaSetu',
  description:
    'Learn about RaktaSetu, a privacy-conscious blood availability discovery and voluntary donor coordination prototype.',
};

export default function AboutUsPage() {
  return (
    <div className="flex-1 bg-white text-slate-900">
      {/* Header Breadcrumb */}
      <div className="border-b border-slate-200 bg-slate-50/70 py-4 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto flex items-center gap-2 text-xs text-slate-500 font-medium">
          <Link href="/" className="hover:text-[#B91C32] transition-colors">
            Home
          </Link>
          <span>/</span>
          <span className="text-slate-800 font-semibold">About Us</span>
        </div>
      </div>

      {/* Hero Section */}
      <section className="py-12 sm:py-16 border-b border-slate-100 bg-gradient-to-b from-white via-slate-50/30 to-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100/80 text-[#B91C32] text-xs font-bold uppercase tracking-wider mb-4">
            <span>Our Mission &amp; Purpose</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight mb-5">
            Organised, Privacy-Conscious Blood Coordination
          </h1>
          <p className="text-base sm:text-lg text-slate-600 leading-relaxed">
            RaktaSetu is an educational and research prototype developed to solve the friction and distress
            families face when searching for blood during urgent medical crises. By bridging real-time
            facility discovery with consent-governed voluntary donor coordination, we aim to make blood
            access dignified and transparent.
          </p>
        </div>
      </section>

      {/* Core Principles & How It Works */}
      <section className="py-12 sm:py-16 max-w-4xl mx-auto px-4 sm:px-6 space-y-12">
        {/* 1. The Challenge */}
        <div>
          <h2 className="text-2xl font-bold text-slate-900 mb-3">The Problem We Are Addressing</h2>
          <p className="text-sm sm:text-base text-slate-600 leading-relaxed mb-3">
            In hospital corridors across India, patient families often scramble in panic when told a blood
            component is urgently needed. They are forced to post phone numbers across social media groups,
            call unverified spreadsheets of past donors, or fall prey to blood touts and scams.
          </p>
          <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
            Meanwhile, voluntary donors are flooded with spam calls, out-of-date emergency forwards, and
            unauthorized telemarketing. RaktaSetu was designed to replace this chaotic broadcast model with a
            structured, mutual-consent protocol.
          </p>
        </div>

        {/* 2. Blood Bank Discovery */}
        <div className="p-6 sm:p-8 rounded-2xl bg-slate-50 border border-slate-200">
          <h2 className="text-xl font-bold text-slate-900 mb-2">How Blood Bank Discovery Works</h2>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed mb-4">
            Instead of inventing fake stock figures, RaktaSetu queries the official e-RaktKosh directory and
            availability feeds for Maharashtra districts. We clearly distinguish between available units,
            explicitly reported zero inventory, and unverified or stale records.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-3.5 bg-white rounded-xl border border-slate-200">
              <span className="font-bold text-slate-800 block mb-1">Truthful Stock States</span>
              <span>Explicit zeros are never masked as &ldquo;no data&rdquo; or assumed to be available.</span>
            </div>
            <div className="p-3.5 bg-white rounded-xl border border-slate-200">
              <span className="font-bold text-slate-800 block mb-1">Direct Verification</span>
              <span>We provide verified telephone contacts so families can call centres before traveling.</span>
            </div>
          </div>
        </div>

        {/* 3. Consent & Privacy by Design */}
        <div>
          <h2 className="text-2xl font-bold text-slate-900 mb-3">Why Privacy &amp; Consent Matter</h2>
          <p className="text-sm sm:text-base text-slate-600 leading-relaxed mb-4">
            In RaktaSetu, donor privacy is enforced strictly on the backend:
          </p>
          <ul className="space-y-2.5 text-xs sm:text-sm text-slate-600 list-disc pl-5 leading-relaxed">
            <li>
              <strong>No Unsolicited Mass Broadcast:</strong> Patients cannot spam an entire district. They
              review anonymized matching donor cards and individually select specific donors to invite.
            </li>
            <li>
              <strong>Hidden Phone Numbers:</strong> A donor&apos;s telephone number is never exposed in
              public search lists, matching cards, or network queries.
            </li>
            <li>
              <strong>Mutual Disclosure Upon Acceptance:</strong> Contact information is unlocked only when an
              invited donor independently clicks &ldquo;Accept&rdquo; for that specific active request.
            </li>
            <li>
              <strong>Unfettered Consent Control:</strong> Donors can pause their availability or withdraw
              search consent instantly at any time from their profile.
            </li>
          </ul>
        </div>

        {/* 4. Prototype Status & Disclaimers */}
        <div className="p-6 rounded-2xl bg-red-50/60 border border-red-200 text-xs sm:text-sm text-red-950 space-y-3">
          <div className="flex items-center gap-2 font-bold text-[#B91C32]">
            <svg className="w-5 h-5 fill-current shrink-0" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-base">Prototype Status &amp; Clinical Boundaries</span>
          </div>
          <p className="leading-relaxed">
            RaktaSetu is an academic, non-commercial software prototype. It is not an official government agency,
            does not collect or store physical blood units, and does not provide clinical medical clearance.
          </p>
          <p className="leading-relaxed">
            All medical eligibility decisions, blood safety screening, ABO/Rh typing, and crossmatching are
            performed exclusively by licensed blood bank personnel and hospital transfusion medical officers.
          </p>
        </div>

        {/* CTAs */}
        <div className="pt-6 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div className="text-xs text-slate-500">
            Reference standards: <a href="https://nhm.gov.in/" target="_blank" rel="noopener noreferrer" className="text-[#B91C32] hover:underline font-semibold">National Health Mission (NHM)</a>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/donor-registration"
              className="px-5 py-2.5 rounded-xl bg-[#B91C32] hover:bg-[#9B1324] text-white text-xs font-bold transition-all shadow-xs"
            >
              Join Donor Network
            </Link>
            <Link
              href="/find-blood"
              className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-all"
            >
              Search Blood Centres
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
