'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { authFetch } from '../../config/api';
import { DEFAULT_STATE_CODE, getDistrictsForState } from '../../config/geography';
import { isValidIndianMobile, formatPhoneNumber } from '../../config/phone';

interface ParentOrganisation {
  id: string;
  orgCode: string;
  name: string;
  districtCode: number;
  districtName?: string | null;
  address?: string | null;
  phone?: string | null;
  status: string;
}

export default function RegisterCampPage() {
  const [organizerName, setOrganizerName] = useState('');
  const [selectedParentOrgId, setSelectedParentOrgId] = useState('');
  const [parentOrganisations, setParentOrganisations] = useState<ParentOrganisation[]>([]);
  const [loadingOrgs, setLoadingOrgs] = useState(true);
  const [campDate, setCampDate] = useState('');
  const [venue, setVenue] = useState('');
  const [district, setDistrict] = useState('Pune');
  const [expectedDonors, setExpectedDonors] = useState('50');
  const [coordinatorContact, setCoordinatorContact] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [minDate, setMinDate] = useState<string | undefined>(undefined);
  const [createdCampCode, setCreatedCampCode] = useState<string | null>(null);
  const [createdCampId, setCreatedCampId] = useState<string | null>(null);

  const districts = getDistrictsForState(DEFAULT_STATE_CODE);

  useEffect(() => {
    setMinDate(new Date().toISOString().split('T')[0]);
  }, []);

  // Load verified blood banks from database
  useEffect(() => {
    async function loadVerifiedOrganisations() {
      try {
        setLoadingOrgs(true);
        const res = await authFetch('/api/v1/organisations');
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.data)) {
            setParentOrganisations(data.data);
            if (data.data.length > 0) {
              // Try to find one in the default district, otherwise select first
              const puneDistrict = districts.find((d) => d.name === 'Pune');
              const defaultOrg = data.data.find(
                (o: ParentOrganisation) => o.districtCode === puneDistrict?.code
              ) || data.data[0];
              setSelectedParentOrgId(defaultOrg.id);
            }
          }
        }
      } catch (err) {
        console.error('Failed to load parent organisations:', err);
      } finally {
        setLoadingOrgs(false);
      }
    }

    loadVerifiedOrganisations();
  }, []);

  const selectedDistrict = districts.find((d) => d.name === district) || districts[0];
  const selectedParentOrg = parentOrganisations.find((o) => o.id === selectedParentOrgId);

  // Filter blood banks: first show banks matching the selected district, then all others
  const districtOrgs = parentOrganisations.filter((o) => o.districtCode === selectedDistrict.code);
  const otherOrgs = parentOrganisations.filter((o) => o.districtCode !== selectedDistrict.code);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizerName.trim() || !selectedParentOrgId || !campDate || !venue.trim()) {
      setErrorMessage('Please fill in all mandatory fields.');
      return;
    }

    if (!isValidIndianMobile(coordinatorContact)) {
      setErrorMessage('Please enter a valid 10-digit Indian mobile number for the coordinator.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const canonicalContact = formatPhoneNumber(coordinatorContact);

      const res = await authFetch('/api/v1/camps', {
        method: 'POST',
        body: JSON.stringify({
          title: `${organizerName.trim()} Voluntary Blood Camp`,
          organizerName: organizerName.trim(),
          targetDate: campDate,
          venue: venue.trim(),
          district: selectedDistrict.name,
          districtCode: selectedDistrict.code,
          stateCode: DEFAULT_STATE_CODE,
          expectedDonors: parseInt(expectedDonors, 10) || 50,
          coordinatorContact: canonicalContact,
          organisationId: selectedParentOrgId,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || data.error || 'Failed to submit camp proposal');
      }

      setCreatedCampCode(data.data?.campCode || null);
      setCreatedCampId(data.data?.id || null);
      setSubmitted(true);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error submitting camp proposal.');
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
            <span className="text-slate-800 font-semibold">Register a Camp</span>
          </nav>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100/80 text-[#B91C32] text-xs font-bold uppercase tracking-wider mb-3">
            <span>Community Drive</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">
            Register a Voluntary Blood Donation Camp
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mb-6 leading-relaxed">
            Organizing a college, corporate, or community blood donation drive? Submit your camp proposal
            partnered with an accredited blood bank for clearance and public scheduling.
          </p>

          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 mb-6 space-y-1">
            <span className="font-bold block">⚠️ Mandatory Parent Blood Bank Protocol:</span>
            <p className="leading-relaxed">
              Every voluntary blood donation camp in India must be officially conducted by mobile medical teams
              from an accredited, licensed blood centre. Camps cannot be hosted independently without an
              authorized partner blood bank. The selected blood bank will review and accept your proposal before it is scheduled.
            </p>
          </div>

          {errorMessage && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 mb-6 flex items-start gap-2">
              <span className="font-bold">Error:</span>
              <span>{errorMessage}</span>
            </div>
          )}

          {submitted ? (
            <div className="p-8 rounded-2xl bg-emerald-50 border border-emerald-200 text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center mx-auto text-2xl">
                ✓
              </div>
              <h2 className="text-xl font-bold text-emerald-900">Camp Proposal Submitted</h2>
              <div className="bg-white p-4 rounded-xl border border-emerald-200 text-xs text-left max-w-md mx-auto space-y-2">
                <div className="flex justify-between border-b pb-1.5 border-slate-100">
                  <span className="text-slate-500">Tracking Code:</span>
                  <code className="font-mono font-bold text-emerald-800">
                    {createdCampCode || 'PROPOSED'}
                  </code>
                </div>
                <div className="flex justify-between border-b pb-1.5 border-slate-100">
                  <span className="text-slate-500">Status:</span>
                  <span className="font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded text-[11px]">
                    PENDING PARENT REVIEW
                  </span>
                </div>
                <div className="flex justify-between border-b pb-1.5 border-slate-100">
                  <span className="text-slate-500">Parent Blood Bank:</span>
                  <span className="font-semibold text-slate-800 text-right">
                    {selectedParentOrg?.name || 'Selected Blood Centre'}
                  </span>
                </div>
                <div className="flex justify-between border-b pb-1.5 border-slate-100">
                  <span className="text-slate-500">Target Date:</span>
                  <span className="font-medium text-slate-700">{campDate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Venue:</span>
                  <span className="font-medium text-slate-700 text-right">{venue}</span>
                </div>
              </div>

              <p className="text-xs text-emerald-800 leading-relaxed max-w-md mx-auto">
                Your proposal has been routed to <strong>{selectedParentOrg?.name}</strong>. Their medical
                coordinator will review the schedule and assign clinical phlebotomy staff. Once approved,
                the camp will be publicly listed on the upcoming community drive directory.
              </p>

              <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href={createdCampId ? `/camp/dashboard?campId=${createdCampId}` : '/camp/login'}
                  className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors shadow-xs"
                >
                  Track in Camp Workspace
                </Link>
                <Link
                  href="/camps"
                  className="px-5 py-2.5 rounded-xl bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 transition-colors shadow-xs"
                >
                  View Approved Camps Directory
                </Link>
                <Link
                  href="/"
                  className="px-4 py-2.5 rounded-xl border border-emerald-300 text-emerald-800 text-xs font-semibold hover:bg-emerald-100 transition-colors"
                >
                  Return to Home
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 text-xs sm:text-sm">
              {errorMessage && (
                <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-start gap-2">
                  <span className="font-bold">⚠️</span>
                  <span>{errorMessage}</span>
                </div>
              )}
              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider text-[11px] mb-1.5">
                  Organizing Entity (NGO, College, Corporation) *
                </label>
                <input
                  type="text"
                  required
                  value={organizerName}
                  onChange={(e) => setOrganizerName(e.target.value)}
                  placeholder="e.g. Youth Red Cross Society, Pune Chapter"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#B91C32] focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 uppercase tracking-wider text-[11px] mb-1.5">
                    District Location *
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
                    Licensed Parent Blood Centre *
                  </label>
                  {loadingOrgs ? (
                    <div className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-400 animate-pulse text-xs">
                      Loading registered blood banks...
                    </div>
                  ) : parentOrganisations.length === 0 ? (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
                      No verified blood banks registered yet.{' '}
                      <Link href="/organisation/register-bank" className="underline font-bold">
                        Register a Blood Centre first
                      </Link>
                    </div>
                  ) : (
                    <select
                      value={selectedParentOrgId}
                      onChange={(e) => setSelectedParentOrgId(e.target.value)}
                      required
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#B91C32] focus:bg-white"
                    >
                      <option value="">-- Select Verified Blood Centre --</option>
                      {districtOrgs.length > 0 && (
                        <optgroup label={`Blood Banks in ${district}`}>
                          {districtOrgs.map((org) => (
                            <option key={org.id} value={org.id}>
                              {org.name} ({org.orgCode}) — Verified
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {otherOrgs.length > 0 && (
                        <optgroup label="Other Districts in Maharashtra">
                          {otherOrgs.map((org) => (
                            <option key={org.id} value={org.id}>
                              {org.name} ({org.districtName || 'District ' + org.districtCode}) — Verified
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  )}
                  {selectedParentOrg && (
                    <p className="text-[11px] text-slate-500 mt-1">
                      Partner: <strong>{selectedParentOrg.name}</strong> • Licensed Centre
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 uppercase tracking-wider text-[11px] mb-1.5">
                    Venue Location &amp; Landmark *
                  </label>
                  <input
                    type="text"
                    required
                    value={venue}
                    onChange={(e) => setVenue(e.target.value)}
                    placeholder="e.g. Auditorium Hall, Main Campus, Pune"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#B91C32] focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase tracking-wider text-[11px] mb-1.5">
                    Proposed Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={campDate}
                    onChange={(e) => setCampDate(e.target.value)}
                    min={minDate}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#B91C32] focus:bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 uppercase tracking-wider text-[11px] mb-1.5">
                    Estimated Expected Donors
                  </label>
                  <select
                    value={expectedDonors}
                    onChange={(e) => setExpectedDonors(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#B91C32] focus:bg-white"
                  >
                    <option value="50">25 to 50 donors</option>
                    <option value="100">50 to 100 donors</option>
                    <option value="200">100 to 250 donors</option>
                    <option value="300">250+ donors</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase tracking-wider text-[11px] mb-1.5">
                    Organizer Mobile Contact *
                  </label>
                  <input
                    type="tel"
                    required
                    value={coordinatorContact}
                    onChange={(e) => setCoordinatorContact(e.target.value)}
                    placeholder="10-digit mobile (e.g. 9876543210)"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#B91C32] focus:bg-white"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Canonical format +91 will be normalized automatically.
                  </p>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || loadingOrgs || parentOrganisations.length === 0}
                className="w-full py-3.5 rounded-xl bg-[#B91C32] hover:bg-[#9B1324] disabled:bg-slate-400 text-white font-bold text-xs sm:text-sm shadow-xs transition-all cursor-pointer mt-4"
              >
                {loading ? 'Submitting Camp Proposal...' : 'Submit Camp Proposal for Blood Bank Clearance'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
