'use client';

import Link from 'next/link';
import { DonorQuickCheck } from './components/DonorQuickCheck';

export default function Home() {
  return (
    <div className="flex-1 w-full bg-white text-slate-900">
      {/* 1. Hero Section: Clean, Balanced Blood Discovery & Donor Registration */}
      <section className="bg-gradient-to-b from-slate-50/70 via-white to-white pt-8 pb-12 sm:pt-14 sm:pb-16 border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            {/* Left Column: Headline, Copy & CTAs */}
            <div className="lg:col-span-7 flex flex-col justify-center text-left">
              {/* Introductory Trust Badge */}
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-red-100/80 border border-red-200 text-[#B91C32] text-xs font-bold uppercase tracking-wider mb-5 w-fit">
                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                </svg>
                <span>Join the RaktaSetu donor community</span>
              </div>

              {/* Main Headline */}
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 tracking-tight leading-[1.1] mb-5">
                Become a donor.
                <span className="text-[#B91C32] block">Help save lives.</span>
              </h1>

              {/* Supporting Copy */}
              <p className="text-base sm:text-lg text-slate-600 max-w-xl leading-relaxed mb-8">
                Your blood type could be the one a patient is waiting on. Voluntary blood donation takes just a few minutes and connects with registered centres in genuine clinical need.
              </p>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 mb-4">
                <Link
                  href="/donor-registration"
                  className="px-8 py-3.5 rounded-xl bg-[#B91C32] hover:bg-[#9B1324] active:bg-[#851323] text-white font-bold text-sm sm:text-base transition-all shadow-md shadow-red-200 text-center cursor-pointer min-h-[46px] flex items-center justify-center"
                >
                  Register as a Donor
                </Link>

                <Link
                  href="/find-blood"
                  className="px-7 py-3.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 font-bold text-sm sm:text-base transition-all shadow-2xs text-center flex items-center justify-center gap-2 min-h-[46px]"
                >
                  <svg className="w-4 h-4 text-[#B91C32]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <span>Find Blood Centres</span>
                </Link>
              </div>

              {/* Secondary Helper Link */}
              <div className="text-xs text-slate-500">
                <span>or </span>
                <Link
                  href="/directory"
                  className="text-slate-700 hover:text-[#B91C32] underline font-semibold transition-colors"
                >
                  Browse blood bank directory and walk in to donate →
                </Link>
              </div>
            </div>

            {/* Right Column: Hero Visual Container & Compact Emergency Blood Discovery Card */}
            <div className="lg:col-span-5">
              <div className="relative rounded-3xl overflow-hidden shadow-xl border border-slate-200 bg-slate-900 h-[480px] sm:h-[520px] flex flex-col justify-end p-3.5 sm:p-4">
                {/* Full Visual Asset with Object-Top to Keep Donor Face Clearly Visible */}
                <img
                  src="/hero-donor.jpg"
                  alt="Voluntary blood donor smiling in clinic donation chair"
                  className="absolute inset-0 w-full h-full object-cover object-top opacity-90"
                />

                {/* Gentle Gradient Shade at the Bottom for Readability */}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/20 to-transparent pointer-events-none" />

                {/* Compact Emergency Blood Discovery Card */}
                <div className="relative w-full p-4 rounded-2xl bg-slate-900/80 backdrop-blur-md border border-white/10 shadow-xl text-white">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#B91C32] text-white text-[10px] font-extrabold uppercase tracking-wider">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" aria-hidden="true" />
                      <span>EMERGENCY ACCESS</span>
                    </div>
                    <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      Live Directory
                    </span>
                  </div>

                  <h3 className="text-lg sm:text-xl font-bold tracking-tight mb-1 text-white">
                    Need blood urgently?
                  </h3>

                  <p className="text-xs text-slate-300 leading-snug mb-3">
                    Explore reported hospital &amp; centre stock across Maharashtra districts with Mapbox directions.
                  </p>

                  <Link
                    href="/find-blood"
                    className="w-full py-2.5 px-4 rounded-xl bg-[#B91C32] hover:bg-[#9B1324] text-white font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 shadow-md shadow-red-950/40 cursor-pointer"
                  >
                    <span>Search Available Blood Units</span>
                    <span>→</span>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Slim Informational Prototype Banner */}
      <div className="bg-red-50/90 border-b border-red-200 py-3 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-center gap-2 text-xs sm:text-sm text-[#B91C32] font-medium text-center">
          <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
              clipRule="evenodd"
            />
          </svg>
          <span>
            <strong>Prototype Notice:</strong> RaktaSetu is a prototype platform. Reported stock quantities must be confirmed directly with the blood centre prior to travel.
          </span>
        </div>
      </div>

      {/* 3. Three Core Feature Cards */}
      <section className="py-14 sm:py-20 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-12 sm:mb-16">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mb-3">
              Connecting Clinical Need with Community Donors
            </h2>
            <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
              Designed to connect patients in genuine clinical need with source-reported facility stock and willing voluntary donors.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
            {/* Feature 1: Find Blood Centres */}
            <div className="bg-slate-50/80 rounded-2xl border border-slate-200 p-6 sm:p-8 flex flex-col justify-between transition-all hover:shadow-md hover:border-slate-300">
              <div>
                <div className="w-12 h-12 rounded-xl bg-red-100 text-[#B91C32] flex items-center justify-center mb-5 font-bold">
                  <svg className="w-6 h-6 fill-current" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">
                  Find Blood Centres
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed mb-4">
                  Discover registered blood banks and hospital centres across Maharashtra districts with verified telephone contact information and Mapbox navigation.
                </p>
              </div>
              <Link
                href="/find-blood"
                className="text-xs font-bold text-[#B91C32] hover:text-[#9B1324] inline-flex items-center gap-1"
              >
                <span>Find centres</span>
                <span>→</span>
              </Link>
            </div>

            {/* Feature 2: Explore Reported Availability */}
            <div className="bg-slate-50/80 rounded-2xl border border-slate-200 p-6 sm:p-8 flex flex-col justify-between transition-all hover:shadow-md hover:border-slate-300">
              <div>
                <div className="w-12 h-12 rounded-xl bg-red-100 text-[#B91C32] flex items-center justify-center mb-5 font-bold">
                  <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                    <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">
                  Explore Reported Availability
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed mb-4">
                  View source-reported inventory for PRBC, Whole Blood, Platelets, and FFP with explicit zero and freshness window indicators.
                </p>
              </div>
              <Link
                href="/find-blood"
                className="text-xs font-bold text-[#B91C32] hover:text-[#9B1324] inline-flex items-center gap-1"
              >
                <span>Check stock</span>
                <span>→</span>
              </Link>
            </div>

            {/* Feature 3: Connect with Volunteer Donors */}
            <div className="bg-slate-50/80 rounded-2xl border border-slate-200 p-6 sm:p-8 flex flex-col justify-between transition-all hover:shadow-md hover:border-slate-300">
              <div>
                <div className="w-12 h-12 rounded-xl bg-red-100 text-[#B91C32] flex items-center justify-center mb-5 font-bold">
                  <svg className="w-6 h-6 fill-current" viewBox="0 0 20 20">
                    <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">
                  Connect with Volunteer Donors
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed mb-4">
                  Consent-governed proximity donor matching with protected phone disclosure unlocked only upon independent acceptance.
                </p>
              </div>
              <Link
                href="/donor-registration"
                className="text-xs font-bold text-[#B91C32] hover:text-[#9B1324] inline-flex items-center gap-1"
              >
                <span>Join community</span>
                <span>→</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 4. How RaktaSetu Works Section (Screenshot-Inspired) */}
      <section className="py-14 sm:py-20 bg-slate-50 border-y border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-12 sm:mb-16">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-200/80 text-slate-700 text-xs font-bold uppercase tracking-wider mb-2">
              <span>How RaktaSetu Works</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              One request, every real option nearby.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
            {/* Step 1 */}
            <div className="bg-white p-6 sm:p-7 rounded-2xl border border-slate-200 shadow-xs">
              <div className="w-10 h-10 rounded-xl bg-red-50 text-[#B91C32] flex items-center justify-center font-extrabold text-sm mb-4">
                1
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-1.5">
                Share group & location
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                One screen: the patient's blood group and target district or admitted hospital centre.
              </p>
            </div>

            {/* Step 2 */}
            <div className="bg-white p-6 sm:p-7 rounded-2xl border border-slate-200 shadow-xs">
              <div className="w-10 h-10 rounded-xl bg-red-50 text-[#B91C32] flex items-center justify-center font-extrabold text-sm mb-4">
                2
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-1.5">
                We search live bank stock
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Real-time queries against e-RaktKosh integration and snapshot cache across verified blood centres.
              </p>
            </div>

            {/* Step 3 */}
            <div className="bg-white p-6 sm:p-7 rounded-2xl border border-slate-200 shadow-xs">
              <div className="w-10 h-10 rounded-xl bg-red-50 text-[#B91C32] flex items-center justify-center font-extrabold text-sm mb-4">
                3
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-1.5">
                Short on stock? We ask donors
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Falls back to nearby registered voluntary donors automatically with multi-tier proximity matching.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Interactive Donor Quick Check Section */}
      <section id="eligibility-check" className="py-14 sm:py-20 bg-white scroll-mt-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <DonorQuickCheck />
        </div>
      </section>

      {/* 6. Clear Donor-Registration CTA Section */}
      <section className="py-14 sm:py-16 bg-slate-50 border-t border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="bg-gradient-to-br from-[#B91C32] to-[#8C1425] rounded-3xl p-8 sm:p-12 text-white text-center shadow-xl">
            <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight mb-3">
              Ready to become a life-saving donor?
            </h2>
            <p className="text-sm sm:text-base text-red-100 max-w-xl mx-auto leading-relaxed mb-8">
              Every voluntary donation can save up to three lives. Register your readiness with RaktaSetu and be notified when someone near your centre is in clinical need.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/donor-registration"
                className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-white text-[#B91C32] hover:bg-red-50 font-bold text-sm transition-all shadow-md cursor-pointer"
              >
                Register as a Donor
              </Link>
              <Link
                href="/find-blood"
                className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-red-950/40 hover:bg-red-950/60 text-white border border-red-300/30 font-bold text-sm transition-all"
              >
                Find Blood Centres
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
