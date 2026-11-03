'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function ContactPage() {
  const [name, setName] = useState('');
  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [subject, setSubject] = useState('Feedback');
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !emailOrPhone.trim() || !message.trim()) return;

    setSubmitting(true);
    // Simulate feedback acknowledgment (prototype)
    setTimeout(() => {
      setSubmitting(false);
      setSubmitted(true);
    }, 600);
  };

  return (
    <div className="flex-1 bg-slate-50 min-h-screen">
      {/* Header */}
      <section className="bg-white border-b border-slate-200 py-10 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100/80 text-[#B91C32] text-xs font-bold uppercase tracking-wider mb-2">
            <span>Get in Touch</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Contact Support &amp; Feedback
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-xl leading-relaxed">
            Have questions regarding the RaktaSetu prototype, suggestions for improving donor coordination,
            or encountered a technical bug? Send us a message below.
          </p>
        </div>
      </section>

      {/* Emergency Alert Banner */}
      <div className="bg-red-600 text-white py-3 px-4 sm:px-6 shadow-xs">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3 text-xs sm:text-sm font-semibold">
          <div className="flex items-center gap-2">
            <span className="text-base">🚨</span>
            <span>
              <strong>Clinical Emergency?</strong> Do not wait for a message reply. Contact a registered
              hospital blood bank directly or dial 112 / 108 immediately.
            </span>
          </div>
          <Link
            href="/find-blood"
            className="hidden sm:inline-block px-3 py-1 bg-white text-[#B91C32] rounded-lg text-xs font-bold hover:bg-red-50 shrink-0"
          >
            Find Blood Banks
          </Link>
        </div>
      </div>

      {/* Main Grid: Form + Support Details */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          {/* Left Column: Feedback Form */}
          <div className="md:col-span-7 bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs">
            <h2 className="text-lg font-bold text-slate-900 mb-1">Send Technical Feedback</h2>
            <p className="text-xs text-slate-500 mb-6">
              All inquiries are reviewed by our platform open-source engineering team.
            </p>

            {submitted ? (
              <div className="p-6 rounded-xl bg-emerald-50 border border-emerald-200 text-center space-y-3">
                <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center mx-auto text-lg">
                  ✓
                </div>
                <h3 className="text-base font-bold text-emerald-900">Feedback Submitted</h3>
                <p className="text-xs text-emerald-700 leading-relaxed">
                  Thank you, <strong>{name}</strong>. Your feedback has been logged in our research system.
                  We appreciate your contributions to making blood coordination safer.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSubmitted(false);
                    setMessage('');
                  }}
                  className="mt-2 px-4 py-2 bg-emerald-700 text-white rounded-xl text-xs font-bold hover:bg-emerald-800 transition-colors cursor-pointer"
                >
                  Send another message
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4 text-xs sm:text-sm">
                <div>
                  <label className="block font-bold text-slate-700 uppercase tracking-wider text-[11px] mb-1.5">
                    Your Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Full name"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#B91C32] focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase tracking-wider text-[11px] mb-1.5">
                    Contact Email or Phone *
                  </label>
                  <input
                    type="text"
                    required
                    value={emailOrPhone}
                    onChange={(e) => setEmailOrPhone(e.target.value)}
                    placeholder="name@example.com or mobile number"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#B91C32] focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase tracking-wider text-[11px] mb-1.5">
                    Inquiry Category
                  </label>
                  <select
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#B91C32] focus:bg-white"
                  >
                    <option value="Feedback">Platform Feedback &amp; Suggestions</option>
                    <option value="Bug">Technical Issue or Bug Report</option>
                    <option value="DonorInquiry">Donor Registration Question</option>
                    <option value="Organisation">Blood Bank / Hospital Partnership</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase tracking-wider text-[11px] mb-1.5">
                    Message Details *
                  </label>
                  <textarea
                    rows={4}
                    required
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Describe your inquiry, feedback, or any encountered bug..."
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#B91C32] focus:bg-white"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 rounded-xl bg-[#B91C32] hover:bg-[#9B1324] text-white font-bold text-sm shadow-xs transition-all cursor-pointer disabled:opacity-60"
                >
                  {submitting ? 'Submitting feedback...' : 'Submit Message'}
                </button>
              </form>
            )}
          </div>

          {/* Right Column: Support & Project Info */}
          <div className="md:col-span-5 space-y-4">
            <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3">
              <h3 className="font-bold text-slate-900 text-sm">Project Communication</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                RaktaSetu is an active hackathon and open-source project. Direct operational phone inquiries
                should be directed to registered district blood centres listed in our directory.
              </p>
              <div className="pt-2 border-t border-slate-100 text-xs space-y-1.5 text-slate-600">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-800">Support Email:</span>
                  <span className="font-mono text-slate-700">support@raktasetu.internal</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-800">Operational Hours:</span>
                  <span>10:00 AM – 06:00 PM IST (Mon–Fri)</span>
                </div>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-slate-100/70 border border-slate-200 text-xs text-slate-600 space-y-2">
              <span className="font-bold text-slate-800 block">External Official Resources</span>
              <p className="leading-relaxed">
                For official blood bank licensing, transfusion regulatory standards, or National Health
                Mission circulars:
              </p>
              <a
                href="https://nhm.gov.in/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#B91C32] hover:underline font-semibold block"
              >
                Visit National Health Mission Portal →
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
