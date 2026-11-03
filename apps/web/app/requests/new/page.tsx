'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const COMPONENTS = [
  'Packed Red Blood Cells',
  'Whole Blood',
  'Platelet Concentrate',
  'Fresh Frozen Plasma',
];

function RequestForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [patientName, setPatientName] = useState('');
  const [bloodGroup, setBloodGroup] = useState('B+');
  const [component, setComponent] = useState('Packed Red Blood Cells');
  const [unitsRequested, setUnitsRequested] = useState<number>(1);
  const [hospitalCode, setHospitalCode] = useState<string>('');
  const [hospitalName, setHospitalName] = useState<string>('');
  const [requiredBy, setRequiredBy] = useState<string>('');
  const [searchScope, setSearchScope] = useState<string>('EXACT_CENTRE');
  const [message, setMessage] = useState<string>('');
  const [exploreDonors, setExploreDonors] = useState<boolean>(true);

  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

  useEffect(() => {
    // Check authentication
    const token = localStorage.getItem('raktasetu_token');
    setIsAuthenticated(!!token);

    // Read prefilled query parameters
    const queryHospitalCode = searchParams.get('hospitalCode');
    const queryHospitalName = searchParams.get('hospitalName');
    const queryBloodGroup = searchParams.get('bloodGroup');
    const queryComponent = searchParams.get('component');

    if (queryHospitalCode) setHospitalCode(queryHospitalCode);
    if (queryHospitalName) setHospitalName(queryHospitalName);
    if (queryBloodGroup && BLOOD_GROUPS.includes(queryBloodGroup)) {
      setBloodGroup(queryBloodGroup);
    }
    if (queryComponent && COMPONENTS.includes(queryComponent)) {
      setComponent(queryComponent);
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const token = localStorage.getItem('raktasetu_token');
      if (!token) {
        throw new Error('Please sign in to submit a blood request.');
      }

      const res = await fetch(`${apiUrl}/blood-requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          patientName: patientName.trim() || undefined,
          bloodGroup,
          component,
          unitsRequested: Number(unitsRequested),
          hospitalCode: hospitalCode ? hospitalCode.trim() : undefined,
          requiredBy: requiredBy ? new Date(requiredBy).toISOString() : undefined,
          searchScope,
          message: message.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to submit blood request');
      }

      // Successfully created -> navigate to tracking dashboard with auto-focused coordination
      const createdId = data?.data?.id;
      if (createdId) {
        router.push(`/requests?id=${createdId}&created=true`);
      } else {
        router.push('/requests');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (isAuthenticated === false) {
    return (
      <div className="flex-1 max-w-lg mx-auto w-full px-4 sm:px-6 py-12">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-red-50 text-[#B91C32] mx-auto flex items-center justify-center mb-4">
            <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
              <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Sign In Required</h2>
          <p className="text-sm text-slate-600 mb-6">
            To submit and track a blood request, please sign in using the development demo phone login.
          </p>
          <Link
            href="/login"
            className="inline-block px-6 py-2.5 rounded-xl bg-[#B91C32] text-white font-semibold text-sm hover:bg-[#9B1324] active:bg-[#851323] transition-colors shadow-sm"
          >
            Sign In with Demo OTP (123456)
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 max-w-2xl mx-auto w-full px-4 sm:px-6 py-8">
      <div className="mb-8">
        <Link href="/find-blood" className="text-xs text-slate-500 hover:text-slate-800 font-medium mb-2 inline-block">
          ← Back to Blood Search
        </Link>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Request Blood Coordination
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Coordinate blood need with registered blood centres and consent-aware voluntary donors.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
          <strong>Request submission failed:</strong> {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-8 space-y-5">
        {/* Target Centre Notice if prefilled */}
        {hospitalCode && (
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs">
            <span className="font-bold text-slate-800">Designated Centre:</span>{' '}
            <span className="text-slate-900 font-medium">{hospitalName || `Hospital #${hospitalCode}`}</span>
            <div className="text-[11px] text-slate-500 mt-1">
              Code: #{hospitalCode}. You can also leave this blank to coordinate without a target centre.
            </div>
          </div>
        )}

        {/* Patient Name vs Requester */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
            Patient Name (Optional if requester is the patient)
          </label>
          <input
            type="text"
            placeholder="e.g. Ramesh Kulkarni (Leave blank if you are the patient)"
            value={patientName}
            onChange={(e) => setPatientName(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#B91C32] text-slate-900"
          />
          <p className="text-[11px] text-slate-500 mt-1">
            Clearly distinguish the recipient patient from your authenticated requester account.
          </p>
        </div>

        {/* Blood Group and Component */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              Required Blood Group *
            </label>
            <select
              value={bloodGroup}
              onChange={(e) => setBloodGroup(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 font-semibold text-slate-800"
            >
              {BLOOD_GROUPS.map((bg) => (
                <option key={bg} value={bg}>
                  {bg}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              Component Type *
            </label>
            <select
              value={component}
              onChange={(e) => setComponent(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 text-slate-800"
            >
              {COMPONENTS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Quantity (Units) */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
            Quantity (Units Requested) *
          </label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={1}
              max={20}
              step={1}
              value={unitsRequested}
              onChange={(e) => setUnitsRequested(Math.max(1, parseInt(e.target.value, 10) || 1))}
              required
              className="w-32 px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 font-bold text-slate-900"
            />
            <span className="text-xs text-slate-500">
              Positive whole units (1 to 20 units).
            </span>
          </div>
        </div>

        {/* Required-by Date/Time */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
            Required By (Optional Deadline)
          </label>
          <input
            type="datetime-local"
            value={requiredBy}
            onChange={(e) => setRequiredBy(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 text-slate-800"
          />
          <p className="text-[11px] text-slate-500 mt-1">
            Specify if there is an urgency timeframe for medical procedures.
          </p>
        </div>

        {/* Search Scope */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
            Search Scope
          </label>
          <select
            value={searchScope}
            onChange={(e) => setSearchScope(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 text-slate-800"
          >
            <option value="EXACT_CENTRE">Exact Blood Centre Only</option>
            <option value="DISTRICT_EXPANDED">Entire District (Expanded)</option>
            <option value="OUT_OF_DISTRICT">Out of District (Emergency)</option>
          </select>
        </div>

        {/* Request Message */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
            Optional Note / Message
          </label>
          <textarea
            rows={3}
            maxLength={500}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Provide non-sensitive details (e.g. planned surgery schedule, hospital ward)..."
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 text-slate-800"
          />
          <div className="text-[11px] text-slate-400 text-right mt-0.5">
            {message.length}/500 characters
          </div>
        </div>

        {/* Donor coordination preference */}
        <div className="pt-2">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={exploreDonors}
              onChange={(e) => setExploreDonors(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
            />
            <span className="text-xs text-slate-700 leading-relaxed">
              <strong>Explore Voluntary Donor Coordination:</strong> If blood bank inventory is insufficient, allow RaktaSetu to identify eligible voluntary donors who have opted into assistance requests.
            </span>
          </label>
        </div>

        {/* Submit Button & Disclaimer */}
        <div className="pt-4 border-t border-slate-200">
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl bg-[#B91C32] hover:bg-[#9B1324] active:bg-[#851323] text-white font-bold text-sm transition-colors shadow-sm disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading ? (
              <>
                <svg className="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                </svg>
                <span>Submitting Request...</span>
              </>
            ) : (
              <span>Submit Blood Request</span>
            )}
          </button>

          <p className="text-[11px] text-slate-500 text-center mt-3 leading-relaxed">
            Submitting a request records your genuine need and notifies coordinated volunteers where permitted. It does <strong>not</strong> guarantee blood inventory or reserve stock.
          </p>
        </div>
      </form>
    </div>
  );
}

export default function NewBloodRequestPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500">Loading request form...</div>}>
      <RequestForm />
    </Suspense>
  );
}
