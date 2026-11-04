'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { authFetch } from '../../config/api';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const COMPONENTS = [
  'Packed Red Blood Cells',
  'Whole Blood',
  'Platelet Concentrate',
  'Fresh Frozen Plasma',
];

interface HospitalDirectoryItem {
  id: string;
  name: string;
  orgCode: string;
  districtName?: string;
  address?: string;
}

function RequestForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [patientName, setPatientName] = useState('');
  const [bloodGroup, setBloodGroup] = useState('B+');
  const [component, setComponent] = useState('Packed Red Blood Cells');
  const [unitsRequested, setUnitsRequested] = useState<number>(1);
  const [requiredBy, setRequiredBy] = useState<string>('');
  const [urgency, setUrgency] = useState<'NORMAL' | 'URGENT' | 'CRITICAL'>('NORMAL');
  const [searchScope, setSearchScope] = useState<string>('EXACT_CENTRE');
  const [message, setMessage] = useState<string>('');
  const [exploreDonors, setExploreDonors] = useState<boolean>(true);

  // Designated Blood Centre (Optional)
  const [designatedCentreCode, setDesignatedCentreCode] = useState<string>('');
  const [designatedCentreName, setDesignatedCentreName] = useState<string>('');
  const [bloodBankDirectory, setBloodBankDirectory] = useState<any[]>([]);
  const [loadingBanks, setLoadingBanks] = useState(false);

  // Admitted Hospital (MANDATORY)
  const [hospitalDirectory, setHospitalDirectory] = useState<HospitalDirectoryItem[]>([]);
  const [loadingDirectory, setLoadingDirectory] = useState(false);
  const [admittedHospitalType, setAdmittedHospitalType] = useState<'REGISTERED' | 'CUSTOM'>('REGISTERED');
  const [selectedHospitalId, setSelectedHospitalId] = useState<string>('');
  const [customHospitalName, setCustomHospitalName] = useState<string>('');

  // Requester identity, contact & consent
  const [requesterContact, setRequesterContact] = useState<string>('');
  const [requesterConsent, setRequesterConsent] = useState<boolean>(true);

  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Confirmation view state
  const [submittedConfirmation, setSubmittedConfirmation] = useState<any | null>(null);

  // Fetch verified hospitals directory
  useEffect(() => {
    async function loadDirectory() {
      try {
        setLoadingDirectory(true);
        const res = await authFetch('/api/v1/hospitals/directory');
        if (res.ok) {
          const data = await res.json();
          const list: HospitalDirectoryItem[] = data.data || [];
          setHospitalDirectory(list);
          if (list.length > 0) {
            setSelectedHospitalId(list[0].id);
          }
        }
      } catch (err) {
        console.error('Error loading hospitals directory:', err);
      } finally {
        setLoadingDirectory(false);
      }

      // Also load participating Blood Banks directory
      try {
        setLoadingBanks(true);
        const res = await authFetch('/api/v1/blood-centres?limit=50');
        if (res.ok) {
          const data = await res.json();
          setBloodBankDirectory(data.data || []);
        }
      } catch (err) {
        console.warn('Error loading blood centres directory:', err);
      } finally {
        setLoadingBanks(false);
      }
    }
    loadDirectory();
  }, []);

  useEffect(() => {
    // Check authentication
    const token = localStorage.getItem('raktasetu_token');
    const storedUser = localStorage.getItem('raktasetu_user');
    setIsAuthenticated(!!token);

    if (storedUser) {
      try {
        const u = JSON.parse(storedUser);
        if (u.phoneNumber) setRequesterContact(u.phoneNumber);
      } catch {
        /* Ignore parse error */
      }
    }

    // Read prefilled query parameters from search page
    const queryHospitalCode = searchParams.get('hospitalCode');
    const queryHospitalName = searchParams.get('hospitalName');
    const queryBloodGroup = searchParams.get('bloodGroup');
    const queryComponent = searchParams.get('component');

    if (queryHospitalCode) setDesignatedCentreCode(queryHospitalCode);
    if (queryHospitalName) setDesignatedCentreName(queryHospitalName);

    // Robust blood group normalisation
    if (queryBloodGroup) {
      let cleaned = queryBloodGroup.trim().toUpperCase();
      if (cleaned.endsWith(' ') && !cleaned.includes('+') && !cleaned.includes('-')) cleaned += '+';
      cleaned = cleaned
        .replace(/([+-])VE$/i, '$1')
        .replace(/[_\s]+POS(ITIVE)?$/i, '+')
        .replace(/[_\s]+NEG(ATIVE)?$/i, '-')
        .replace(/\s+/g, '+');
      if (BLOOD_GROUPS.includes(cleaned)) {
        setBloodGroup(cleaned);
      }
    }

    // Robust component normalisation
    if (queryComponent) {
      const lower = queryComponent.toLowerCase();
      if (lower.includes('prbc') || lower.includes('packed red')) {
        setComponent('Packed Red Blood Cells');
      } else if (lower.includes('whole')) {
        setComponent('Whole Blood');
      } else if (lower.includes('platelet')) {
        setComponent('Platelet Concentrate');
      } else if (lower.includes('plasma') || lower.includes('ffp')) {
        setComponent('Fresh Frozen Plasma');
      }
    }
  }, [searchParams]);

  // Handle Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Determine final admitted hospital name and facility ID
    let finalHospitalName = '';
    let finalReceivingFacilityId: string | undefined = undefined;

    if (admittedHospitalType === 'REGISTERED') {
      const chosen = hospitalDirectory.find((h) => h.id === selectedHospitalId);
      if (!chosen) {
        setError('Please select a registered hospital or choose custom entry.');
        return;
      }
      finalHospitalName = chosen.name;
      finalReceivingFacilityId = chosen.id;
    } else {
      if (!customHospitalName.trim()) {
        setError('Please enter the patient admitted hospital name.');
        return;
      }
      finalHospitalName = customHospitalName.trim();
    }

    if (!requesterConsent) {
      setError('You must confirm consent to coordinate with participating centres.');
      return;
    }

    setLoading(true);

    try {
      const res = await authFetch('/api/v1/blood-requests', {
        method: 'POST',
        body: JSON.stringify({
          patientName: patientName.trim() || undefined,
          admittedHospitalName: finalHospitalName,
          receivingFacilityId: finalReceivingFacilityId,
          bloodGroup,
          component,
          unitsRequested: Number(unitsRequested),
          hospitalCode: designatedCentreCode ? designatedCentreCode.trim() : undefined,
          urgency,
          requiredBy: requiredBy ? new Date(requiredBy).toISOString() : undefined,
          searchScope,
          message: message.trim() || undefined,
          requesterContact: requesterContact.trim() || undefined,
          requesterConsent,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to submit blood request');
      }

      // Display authoritative confirmation view
      setSubmittedConfirmation({
        ...data.data,
        admittedHospitalName: finalHospitalName,
        isHospitalVerified: admittedHospitalType === 'REGISTERED',
        designatedCentreName: designatedCentreName || designatedCentreCode || 'Unassigned / District Coordination',
      });
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

  // Authoritative Confirmation View
  if (submittedConfirmation) {
    return (
      <div className="flex-1 max-w-2xl mx-auto w-full px-4 sm:px-6 py-8">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-md p-6 sm:p-10 space-y-6">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 bg-emerald-100 text-emerald-800 rounded-full flex items-center justify-center mx-auto text-2xl font-bold shadow-xs">
              ✓
            </div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
              Request Registered Successfully
            </span>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              Reference: {submittedConfirmation.requestReference || `#${submittedConfirmation.id.slice(0, 8)}`}
            </h1>
            <p className="text-xs text-slate-500">
              Your blood request is active in the RaktaSetu coordination network.
            </p>
          </div>

          <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 space-y-3 text-xs">
            <div className="flex justify-between items-center pb-2 border-b border-slate-200/80">
              <span className="text-slate-500 font-medium">Status:</span>
              <span className="px-2.5 py-0.5 rounded-full font-bold bg-amber-100 text-amber-800 text-[11px]">
                ● {submittedConfirmation.status || 'OPEN'}
              </span>
            </div>

            <div className="flex justify-between items-center pb-2 border-b border-slate-200/80">
              <span className="text-slate-500 font-medium">Admitted Hospital:</span>
              <div className="text-right">
                <span className="font-bold text-slate-900">{submittedConfirmation.admittedHospitalName}</span>
                {submittedConfirmation.isHospitalVerified ? (
                  <span className="ml-1.5 text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-bold">
                    ✓ Verified Facility
                  </span>
                ) : (
                  <span className="ml-1.5 text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded font-semibold">
                    Unverified Entry
                  </span>
                )}
              </div>
            </div>

            <div className="flex justify-between items-center pb-2 border-b border-slate-200/80">
              <span className="text-slate-500 font-medium">Component &amp; Group:</span>
              <span className="font-bold text-slate-900">
                {submittedConfirmation.component} • <span className="text-[#B91C32]">{submittedConfirmation.bloodGroup}</span> ({submittedConfirmation.unitsRequested || unitsRequested} Unit)
              </span>
            </div>

            <div className="flex justify-between items-center pb-2 border-b border-slate-200/80">
              <span className="text-slate-500 font-medium">Designated Centre:</span>
              <span className="font-medium text-slate-800">
                {submittedConfirmation.designatedCentreName}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-medium">Urgency:</span>
              <span className="font-bold text-slate-800 uppercase">{urgency}</span>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <Link
              href={`/requests?id=${submittedConfirmation.id}&created=true`}
              className="w-full py-3.5 rounded-xl bg-[#B91C32] hover:bg-[#9B1324] text-white font-bold text-xs uppercase tracking-wider transition-all shadow-xs flex items-center justify-center gap-2"
            >
              <span>Track Request &amp; Live Coordination →</span>
            </Link>

            <Link
              href="/find-blood"
              className="w-full py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors flex items-center justify-center"
            >
              Back to Blood Availability Directory
            </Link>
          </div>
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
          Coordinate blood need with registered blood centres, receiving hospitals and voluntary donors.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
          <strong>Request submission failed:</strong> {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
        {/* Designated Centre Notice or Direct Selector */}
        {designatedCentreCode ? (
          <div className="p-4 rounded-2xl bg-red-50/50 border border-red-200 text-xs flex items-center justify-between gap-3 shadow-2xs">
            <div>
              <span className="font-extrabold text-red-950 uppercase text-[10px] tracking-wider block">
                Target Designated Blood Centre
              </span>
              <span className="text-slate-900 font-bold text-sm">
                {designatedCentreName || `Blood Centre #${designatedCentreCode}`}
              </span>
              <div className="text-[11px] text-slate-600 mt-0.5">
                Code: <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-red-200 font-bold">{designatedCentreCode}</code> • Your request will be securely routed into this Blood Bank's private operational queue.
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setDesignatedCentreCode('');
                setDesignatedCentreName('');
              }}
              className="text-xs text-rose-700 hover:text-rose-900 font-bold px-3 py-1.5 rounded-xl border border-rose-200 bg-white hover:bg-rose-50 transition-colors shrink-0 cursor-pointer shadow-xs"
              title="Remove designated centre and submit as unassigned request"
            >
              Change Centre
            </button>
          </div>
        ) : (
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-black uppercase tracking-wider text-slate-900">
                Target Blood Bank / Centre
              </label>
              <Link href="/find-blood" className="text-[11px] text-[#B91C32] font-bold hover:underline shrink-0">
                Browse on Map / Stock Directory →
              </Link>
            </div>
            <select
              value={designatedCentreCode}
              onChange={(e) => {
                const code = e.target.value;
                setDesignatedCentreCode(code);
                const found = bloodBankDirectory.find((b) => b.hospitalCode === code);
                setDesignatedCentreName(found ? found.hospitalName : '');
              }}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#B91C32]"
            >
              <option value="">— Select Target Blood Bank (or leave unassigned for District Coordination) —</option>
              {loadingBanks && <option value="">Loading accredited blood centres...</option>}
              {bloodBankDirectory.map((b) => (
                <option key={b.hospitalCode || b.id} value={b.hospitalCode}>
                  {b.hospitalName} ({b.hospitalCode}) {b.districtName ? `— ${b.districtName}` : ''}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500">
              Select an accredited Blood Bank to route your request directly to their queue, or leave empty for general district broadcast.
            </p>
          </div>
        )}

        {/* 1. ADMITTED HOSPITAL (MANDATORY REQUIREMENT) */}
        <div className="bg-slate-50/70 p-4 sm:p-5 rounded-2xl border border-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-black uppercase tracking-wider text-slate-900">
              Patient Admitted Hospital <span className="text-rose-600">*</span>
            </label>
            <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setAdmittedHospitalType('REGISTERED')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  admittedHospitalType === 'REGISTERED' ? 'bg-[#B91C32] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Registered Hospital
              </button>
              <button
                type="button"
                onClick={() => setAdmittedHospitalType('CUSTOM')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  admittedHospitalType === 'CUSTOM' ? 'bg-[#B91C32] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                + Other Hospital
              </button>
            </div>
          </div>

          {admittedHospitalType === 'REGISTERED' ? (
            <div className="space-y-1.5">
              <select
                value={selectedHospitalId}
                onChange={(e) => setSelectedHospitalId(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#B91C32]"
              >
                {loadingDirectory && <option value="">Loading verified hospitals...</option>}
                {hospitalDirectory.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name} ({h.orgCode}) {h.districtName ? `— ${h.districtName}` : ''}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-emerald-700 font-medium">
                ✓ Connecting to a canonical, verified hospital receiving facility for official hospital intake.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <input
                type="text"
                required
                placeholder="Enter complete admitted hospital name (e.g. Sahyadri Super Speciality Hospital, Pune)..."
                value={customHospitalName}
                onChange={(e) => setCustomHospitalName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#B91C32]"
              />
              <p className="text-[11px] text-amber-700 font-medium">
                ⚠ Unregistered hospital: The supplied name will be preserved and clearly marked as unverified.
              </p>
            </div>
          )}
        </div>

        {/* 2. Patient Name vs Requester */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
            Patient Display Name (Optional)
          </label>
          <input
            type="text"
            placeholder="e.g. Ramesh Kulkarni (Leave blank if you are the patient)"
            value={patientName}
            onChange={(e) => setPatientName(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-[#B91C32] text-slate-900"
          />
          <p className="text-[11px] text-slate-500 mt-1">
            Distinguishes the recipient patient from your authenticated requester account.
          </p>
        </div>

        {/* 3. Blood Group and Component */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              Required Blood Group <span className="text-rose-600">*</span>
            </label>
            <select
              value={bloodGroup}
              onChange={(e) => setBloodGroup(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-[#B91C32] text-slate-900"
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
              Component Type <span className="text-rose-600">*</span>
            </label>
            <select
              value={component}
              onChange={(e) => setComponent(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-[#B91C32] text-slate-900"
            >
              {COMPONENTS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 4. Quantity and Urgency */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              Units Requested <span className="text-rose-600">*</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={20}
                step={1}
                value={unitsRequested}
                onChange={(e) => setUnitsRequested(Math.max(1, parseInt(e.target.value, 10) || 1))}
                required
                className="w-28 px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900"
              />
              <span className="text-xs text-slate-500">Unit(s)</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              Urgency Level
            </label>
            <select
              value={urgency}
              onChange={(e) => setUrgency(e.target.value as any)}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900"
            >
              <option value="NORMAL">Normal (Routine coordination)</option>
              <option value="URGENT">Urgent (Within 24 hours)</option>
              <option value="CRITICAL">Critical Emergency (Immediate)</option>
            </select>
          </div>
        </div>

        {/* 5. Required-by Date/Time & Contact */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              Required By Deadline
            </label>
            <input
              type="datetime-local"
              value={requiredBy}
              onChange={(e) => setRequiredBy(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs text-slate-800"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              Requester Contact Phone
            </label>
            <input
              type="tel"
              value={requesterContact}
              onChange={(e) => setRequesterContact(e.target.value)}
              placeholder="+91..."
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-mono text-slate-800"
            />
          </div>
        </div>

        {/* 6. Request Note / Message */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
            Clinical / Coordination Note
          </label>
          <textarea
            rows={2}
            maxLength={500}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Ward details, surgeon instructions or specific requirements..."
            className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs text-slate-800"
          />
        </div>

        {/* 7. Requester Consent Checkbox */}
        <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              required
              checked={requesterConsent}
              onChange={(e) => setRequesterConsent(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-[#B91C32] focus:ring-[#B91C32]"
            />
            <span className="text-xs text-slate-700 leading-relaxed">
              <strong>Patient / Requester Consent:</strong> I confirm this is a genuine clinical transfusion need. I authorize designated medical staff and blood banks to coordinate inventory allocation for this patient.
            </span>
          </label>
        </div>

        {/* Submit Button */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl bg-[#B91C32] hover:bg-[#9B1324] text-white font-bold text-xs uppercase tracking-wider transition-all shadow-xs disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Submitting &amp; Validating Request...</span>
              </>
            ) : (
              <span>Submit Blood Request</span>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function NewBloodRequestPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500 text-xs">Loading request form...</div>}>
      <RequestForm />
    </Suspense>
  );
}
