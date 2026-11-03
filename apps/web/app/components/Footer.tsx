'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';

export function Footer() {
  const [currentYear, setCurrentYear] = useState(2026);

  useEffect(() => {
    setCurrentYear(new Date().getFullYear());
  }, []);

  return (
    <footer className="bg-white border-t border-slate-200 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        {/* Main Grid: Brand + 5 Link Columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-8 mb-10">
          {/* Brand Column (Span 2) */}
          <div className="lg:col-span-2 space-y-3.5">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#B91C32] flex items-center justify-center text-white font-bold shadow-xs">
                <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                  <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
                </svg>
              </div>
              <span className="font-extrabold text-xl tracking-tight text-slate-900">RaktaSetu</span>
            </Link>

            <p className="text-xs sm:text-sm text-slate-600 max-w-sm leading-relaxed">
              Connecting people seeking blood with blood banks and registered donors through a more organised,
              privacy-conscious workflow.
            </p>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold text-slate-800 text-[11px] uppercase tracking-wider">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                <span>Prototype Platform</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-normal">
                RaktaSetu is an educational &amp; research prototype. In clinical emergencies, always contact a
                licensed hospital blood bank directly.
              </p>
            </div>

            <div className="text-xs text-slate-500 flex items-center gap-2">
              <span>Reference:</span>
              <a
                href="https://nhm.gov.in/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#B91C32] hover:underline font-medium inline-flex items-center gap-1"
              >
                <span>National Health Mission (NHM)</span>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          </div>

          {/* Column 1: Looking for Blood */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-3.5">
              Looking for Blood
            </h4>
            <ul className="space-y-2 text-xs sm:text-sm">
              <li>
                <Link href="/find-blood" className="text-slate-600 hover:text-[#B91C32] transition-colors">
                  Find Blood Now
                </Link>
              </li>
              <li>
                <Link href="/directory" className="text-slate-600 hover:text-[#B91C32] transition-colors">
                  Blood Bank Directory
                </Link>
              </li>
              <li>
                <span className="text-slate-400 flex items-center justify-between">
                  <span>Thalassemia Care</span>
                  <span className="text-[9px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">
                    Soon
                  </span>
                </span>
              </li>
            </ul>
          </div>

          {/* Column 2: Donate Blood */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-3.5">
              Donate Blood
            </h4>
            <ul className="space-y-2 text-xs sm:text-sm">
              <li>
                <Link href="/donor-registration" className="text-slate-600 hover:text-[#B91C32] transition-colors">
                  Register as Donor
                </Link>
              </li>
              <li>
                <Link href="/camps" className="text-slate-600 hover:text-[#B91C32] transition-colors">
                  Find a Camp
                </Link>
              </li>
              <li>
                <Link href="/about-donating" className="text-slate-600 hover:text-[#B91C32] transition-colors">
                  About Donating
                </Link>
              </li>
              <li>
                <Link href="/donor-dashboard" className="text-slate-600 hover:text-[#B91C32] transition-colors">
                  Donor Portal
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 3: Organisation */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-3.5">
              Organisation
            </h4>
            <ul className="space-y-2 text-xs sm:text-sm">
              <li>
                <Link href="/organisation/login" className="text-slate-600 hover:text-[#B91C32] transition-colors">
                  Organisation Login
                </Link>
              </li>
              <li>
                <Link href="/organisation/register-bank" className="text-slate-600 hover:text-[#B91C32] transition-colors">
                  Register a Blood Bank
                </Link>
              </li>
              <li>
                <Link href="/organisation/register-camp" className="text-slate-600 hover:text-[#B91C32] transition-colors">
                  Register a Camp
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 4: Resources & Legal */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-3.5">
              Resources &amp; Legal
            </h4>
            <ul className="space-y-2 text-xs sm:text-sm">
              <li>
                <Link href="/blog" className="text-slate-600 hover:text-[#B91C32] transition-colors">
                  Stories &amp; Awareness
                </Link>
              </li>
              <li>
                <Link href="/faqs" className="text-slate-600 hover:text-[#B91C32] transition-colors">
                  FAQs
                </Link>
              </li>
              <li>
                <Link href="/notifications" className="text-slate-600 hover:text-[#B91C32] transition-colors">
                  Notifications
                </Link>
              </li>
              <li>
                <Link href="/about" className="text-slate-600 hover:text-[#B91C32] transition-colors">
                  About Us
                </Link>
              </li>
              <li>
                <Link href="/contact" className="text-slate-600 hover:text-[#B91C32] transition-colors">
                  Contact Us
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-slate-600 hover:text-[#B91C32] transition-colors">
                  Terms &amp; Conditions
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="text-slate-600 hover:text-[#B91C32] transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/accessibility" className="text-slate-600 hover:text-[#B91C32] transition-colors">
                  Accessibility
                </Link>
              </li>
              <li>
                <Link href="/sitemap" className="text-slate-600 hover:text-[#B91C32] transition-colors">
                  Sitemap
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar: Copyright & Medical Disclaimers */}
        <div className="pt-6 border-t border-slate-200 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <p className="text-center md:text-left leading-relaxed">
            <strong>Medical Notice:</strong> RaktaSetu does not store, collect, or dispense blood. Inventory
            numbers are sourced directly from registered centres and external portal feeds. Not an official
            government portal; no NHM endorsement is implied.
          </p>
          <div className="text-center md:text-right whitespace-nowrap text-slate-600">
            &copy; {currentYear} RaktaSetu. All rights reserved.
          </div>
        </div>
      </div>
    </footer>
  );
}
