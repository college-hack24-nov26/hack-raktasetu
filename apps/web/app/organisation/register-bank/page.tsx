'use client';

import { useState } from 'react';
import Link from 'next/link';
import { authFetch } from '../../config/api';
import { STATES_AND_DISTRICTS, DEFAULT_STATE_CODE, getDistrictsForState } from '../../config/geography';
import { isValidIndianMobile } from '../../config/phone';

export default function RegisterBankPage() {
  const [hospitalName, setHospitalName] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [district, setDistrict] = useState('Pune');
  const [contactPerson, setContactPerson] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [componentTypes, setComponentTypes] = useState<string[]>(['PRBC', 'Whole Blood']);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdAppId, setCreatedAppId] = useState<string | null>(null);

  const districts = getDistrictsForState(DEFAULT_STATE_CODE);

  const toggleComponent = (comp: string) => {
    setComponentTypes((prev) =>
      prev.includes(comp) ? prev.filter((c) => c !== comp) : [...prev, comp]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!hospitalName.trim() || !licenseNumber.trim() || !phone.trim()) {
      setErrorMessage('Hospital name, license number, and contact phone are required.');
      return;
    }

    if (!isValidIndianMobile(phone)) {
      setErrorMessage('Please enter a valid 10-digit Indian mobile number for the medical officer contact.');
      return;
    }

    setLoading(true);

    const selectedDistrict = districts.find((d) => d.name === district) || districts[0];

    try {
      const res = await authFetch('/api/v1/organisations/applications', {
        method: 'POST',
        body: JSON.stringify({
          hospitalName: hospitalName.trim(),
          licenseNumber: licenseNumber.trim(),
          stateCode: DEFAULT_STATE_CODE,
          districtCode: selectedDistrict.code,
          districtName: selectedDistrict.name,
          contactPerson: contactPerson.trim() || 'Medical Officer',
          email: email.trim() || 'contact@bloodbank.org',
          phone: phone.trim(),
          componentTypes,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || data.error || 'Failed to submit application');
      }

      setCreatedAppId(data.data?.id || null);
      setSubmitted(true);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error submitting application.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 bg-slate-50 min-h-screen py-10 px-4 sm:px-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <nav className="flex items-center gap-2 text-xs text-slate-500 font-medium">
            <Link href="/" className="hover:text-[#B91C32]">Home</Link>
            <span>/</span>
            <Link href="/organisation/login" className="hover:text-[#B91C32]">Organisation</Link>
            <span>/</span>
            <span className="text-slate-800 font-semibold">Register Blood Bank</span>
          </nav>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100/80 text-[#B91C32] text-xs font-bold uppercase tracking-wider mb-3">
            <span>Institutional Onboarding</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">
            Register a Blood Bank or Transfusion Centre
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mb-6 leading-relaxed">
            Apply to integrate your hospital blood centre or charitable blood bank into RaktaSetu&apos;s
            verified directory.
          </p>

          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 mb-6 space-y-1">
            <span className="font-bold block">⚠️ Licensing &amp; Compliance Requirement:</span>
            <p className="leading-relaxed">
              In accordance with national blood transfusion guidelines, inclusion in the live public directory
              requires valid licensing issued by the Central Drugs Standard Control Organisation (CDSCO) and
              the State Blood Transfusion Council.
            </p>
          </div>

          {errorMessage && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 mb-6">
              <strong>Submission Error: </strong> {errorMessage}
            </div>
          )}

          {submitted ? (
            <div className="p-8 rounded-2xl bg-emerald-50 border border-emerald-200 text-center space-y-3.5">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center mx-auto text-xl shadow-xs">
                ✓
              </div>
              <div className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300">
                Status: Pending Platform Review
              </div>
              <h2 className="text-lg font-bold text-emerald-900">Application Submitted Successfully</h2>
              <p className="text-xs text-emerald-800 leading-relaxed max-w-md mx-auto">
                Thank you for submitting institutional details for <strong>{hospitalName}</strong>. Your onboarding application
                has been recorded with Tracking UUID:
              </p>
              <div className="p-3 bg-white rounded-xl border border-emerald-200 max-w-sm mx-auto font-mono text-xs font-bold text-slate-800 select-all">
                {createdAppId || 'SUBMITTED'}
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed max-w-md mx-auto">
                Next Step: A Platform Administrator will review your license number (<strong>{licenseNumber}</strong>)
                and CDSCO compliance. Upon approval, your initial <strong>ORG_ADMIN</strong> institutional workspace will be provisioned.
                You can then sign in using your registered mobile at <strong>Organisation Staff Login</strong>.
              </p>
              <div className="pt-3 flex flex-wrap gap-2.5 justify-center">
                <Link
                  href="/organisation/login"
                  className="px-5 py-2.5 rounded-xl bg-[#B91C32] hover:bg-[#9B1324] text-white text-xs font-bold transition-colors inline-block shadow-xs"
                >
                  Go to Organisation Staff Login
                </Link>
                <Link
                  href="/directory"
                  className="px-5 py-2.5 rounded-xl border border-slate-300 hover:bg-white text-slate-700 text-xs font-bold transition-colors inline-block"
                >
                  Return to Blood Bank Directory
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 text-xs sm:text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 uppercase tracking-wider text-[11px] mb-1.5">
                    Hospital / Centre Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={hospitalName}
                    onChange={(e) => setHospitalName(e.target.value)}
                    placeholder="e.g. Anandrishiji Blood Centre"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#B91C32] focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase tracking-wider text-[11px] mb-1.5">
                    Drugs Control License No. *
                  </label>
                  <input
                    type="text"
                    required
                    value={licenseNumber}
                    onChange={(e) => setLicenseNumber(e.target.value)}
                    placeholder="e.g. MH/BLD/2021/04"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#B91C32] focus:bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 uppercase tracking-wider text-[11px] mb-1.5">
                    District
                  </label>
                  <select
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#B91C32] focus:bg-white"
                  >
                    {districts.map((d) => (
                      <option key={d.code} value={d.name}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase tracking-wider text-[11px] mb-1.5">
                    Medical Officer in Charge *
                  </label>
                  <input
                    type="text"
                    required
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    placeholder="Dr. Full Name"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#B91C32] focus:bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 uppercase tracking-wider text-[11px] mb-1.5">
                    Official Centre Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="bloodbank@hospital.org"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#B91C32] focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase tracking-wider text-[11px] mb-1.5">
                    Verified Phone Number *
                  </label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Landline or official mobile"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#B91C32] focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider text-[11px] mb-2">
                  Licensed Components Handled
                </label>
                <div className="flex flex-wrap gap-2">
                  {['Packed Red Blood Cells', 'Whole Blood', 'Platelet Concentrate', 'Fresh Frozen Plasma'].map(
                    (comp) => {
                      const selected = componentTypes.includes(comp);
                      return (
                        <button
                          key={comp}
                          type="button"
                          onClick={() => toggleComponent(comp)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                            selected
                              ? 'bg-[#B91C32] text-white shadow-2xs'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          {selected ? '✓ ' : '+ '}
                          {comp}
                        </button>
                      );
                    }
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-xl bg-[#B91C32] hover:bg-[#9B1324] disabled:bg-slate-400 text-white font-bold text-xs sm:text-sm shadow-xs transition-all cursor-pointer mt-4"
              >
                {loading ? 'Submitting Application...' : 'Submit Blood Bank Registration Application'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
