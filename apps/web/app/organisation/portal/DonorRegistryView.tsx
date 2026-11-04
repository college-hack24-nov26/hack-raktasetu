'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { authFetch, safeJsonParse } from '../../config/api';

interface DonorRegistryViewProps {
  organisationId: string;
  userRole: string;
  isAdmin: boolean;
  onOpenCampRegistration?: () => void;
}

export function DonorRegistryView({
  organisationId,
  userRole,
  isAdmin,
  onOpenCampRegistration,
}: DonorRegistryViewProps) {
  // State: Donors list & pagination
  const [donors, setDonors] = useState<any[]>([]);
  const [pagination, setPagination] = useState({
    totalCount: 0,
    totalPages: 1,
    currentPage: 1,
    pageSize: 10,
    hasNextPage: false,
    hasPrevPage: false,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // State: Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBloodGroup, setSelectedBloodGroup] = useState('');
  const [selectedSource, setSelectedSource] = useState<'ALL' | 'DIRECT' | 'CAMP'>('ALL');
  const [currentPage, setCurrentPage] = useState(1);

  // State: Summary cards
  const [summary, setSummary] = useState<{
    totalAssociatedDonors: number;
    directRegistrationsCount: number;
    campRegistrationsCount: number;
    donorsWithCompletedDonations: number;
    donationsByBloodGroup: Record<string, number>;
  } | null>(null);

  // State: Direct Register Modal
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerForm, setRegisterForm] = useState({
    fullName: '',
    phoneNumber: '',
    bloodGroup: 'O_POS',
    dateOfBirth: '',
    cityOrLocality: '',
    consentGiven: true,
    isSearchable: true,
  });

  // State: Donor Detail Modal
  const [selectedDonorDetail, setSelectedDonorDetail] = useState<any | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Fetch summary metrics
  const fetchSummary = useCallback(async () => {
    try {
      const res = await authFetch(`/api/v1/organisation/${organisationId}/donors/summary`);
      const data = await safeJsonParse(res);
      if (res.ok && data?.success) {
        setSummary(data.data);
      }
    } catch {
      // Non-blocking
    }
  }, [organisationId]);

  // Fetch donor list with server-backed search & pagination
  const fetchDonors = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        page: String(currentPage),
        limit: '10',
      });
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      if (selectedBloodGroup) params.append('bloodGroup', selectedBloodGroup);
      if (selectedSource !== 'ALL') params.append('registrationSource', selectedSource);

      const res = await authFetch(`/api/v1/organisation/${organisationId}/donors?${params.toString()}`);
      const data = await safeJsonParse(res);

      if (!res.ok || !data?.success) {
        throw new Error(data?.error?.message || `Failed to fetch donor registry (HTTP ${res.status})`);
      }

      setDonors(data.data?.items || []);
      if (data.data?.pagination) {
        setPagination(data.data.pagination);
      }
    } catch (err: any) {
      setError(err.message || 'Error loading donor registry.');
    } finally {
      setLoading(false);
    }
  }, [organisationId, currentPage, searchQuery, selectedBloodGroup, selectedSource]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    fetchDonors();
  }, [fetchDonors]);

  // Handle direct donor registration submit
  const handleDirectRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!registerForm.fullName.trim() || !registerForm.phoneNumber.trim()) {
      setError('Please provide full name and phone number.');
      return;
    }
    if (!registerForm.consentGiven) {
      setError('Explicit voluntary donor consent is required.');
      return;
    }

    try {
      setRegisterLoading(true);
      setError(null);
      const res = await authFetch(`/api/v1/organisation/${organisationId}/donors/direct-register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registerForm),
      });

      const data = await safeJsonParse(res);
      if (!res.ok || !data?.success) {
        throw new Error(data?.error?.message || `Registration failed (HTTP ${res.status})`);
      }

      setSuccessNotice(`Donor ${registerForm.fullName} successfully registered directly with this Blood Centre!`);
      setTimeout(() => setSuccessNotice(null), 5000);
      setShowRegisterModal(false);
      setRegisterForm({
        fullName: '',
        phoneNumber: '',
        bloodGroup: 'O_POS',
        dateOfBirth: '',
        cityOrLocality: '',
        consentGiven: true,
        isSearchable: true,
      });
      fetchSummary();
      fetchDonors();
    } catch (err: any) {
      setError(err.message || 'Direct registration failed.');
    } finally {
      setRegisterLoading(false);
    }
  };

  // View donor detail
  const handleOpenDonorDetail = async (donorId: string) => {
    try {
      setLoadingDetail(true);
      setError(null);
      const res = await authFetch(`/api/v1/organisation/${organisationId}/donors/${donorId}`);
      const data = await safeJsonParse(res);
      if (res.ok && data?.success) {
        setSelectedDonorDetail(data.data);
      } else {
        throw new Error(data?.error?.message || 'Could not load donor details.');
      }
    } catch (err: any) {
      setError(err.message || 'Error fetching donor details.');
    } finally {
      setLoadingDetail(false);
    }
  };

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedBloodGroup('');
    setSelectedSource('ALL');
    setCurrentPage(1);
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Entry Points */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <span>👥</span> Voluntary Donor Registry &amp; Profile Directory
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage donors associated directly with your Blood Bank or through your accredited donation camps.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowRegisterModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer"
          >
            <span>➕</span> Register Donor (Direct)
          </button>

          {onOpenCampRegistration && (
            <button
              type="button"
              onClick={onOpenCampRegistration}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-all cursor-pointer border border-slate-300"
            >
              <span>🏕️</span> Register at Camp
            </button>
          )}
        </div>
      </div>

      {/* Notices */}
      {successNotice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-800 flex items-center justify-between">
          <span>✅ {successNotice}</span>
          <button onClick={() => setSuccessNotice(null)} className="text-emerald-600 hover:text-emerald-800 text-xs">
            ✕
          </button>
        </div>
      )}

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold text-rose-800 flex items-center justify-between">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)} className="text-rose-600 hover:text-rose-800 text-xs">
            ✕
          </button>
        </div>
      )}

      {/* Part 5: Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Associated Donors</div>
          <div className="text-2xl font-black text-slate-900 mt-1">
            {summary ? summary.totalAssociatedDonors : '—'}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Total registered across centre</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Direct Bank Registrations</div>
          <div className="text-2xl font-black text-indigo-700 mt-1">
            {summary ? summary.directRegistrationsCount : '—'}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Enrolled at centre reception</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Camp Registrations</div>
          <div className="text-2xl font-black text-amber-700 mt-1">
            {summary ? summary.campRegistrationsCount : '—'}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Enrolled at outdoor drives</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Completed Donors</div>
          <div className="text-2xl font-black text-emerald-700 mt-1">
            {summary ? summary.donorsWithCompletedDonations : '—'}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Verified completed donations</div>
        </div>
      </div>

      {/* Blood Group Breakdown Pills */}
      {summary?.donationsByBloodGroup && (
        <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-bold text-slate-600 mr-1 text-[11px] uppercase tracking-wider">Group Distribution:</span>
          {Object.entries(summary.donationsByBloodGroup).map(([grp, cnt]) => {
            const displayGrp = grp.replace('_POS', '+').replace('_NEG', '-');
            return (
              <span
                key={grp}
                className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-slate-700 font-bold text-xs shadow-2xs"
              >
                {displayGrp}: <span className="text-rose-600">{cnt}</span>
              </span>
            );
          })}
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1 w-full">
            <span className="absolute left-3 top-2.5 text-slate-400 text-sm">🔍</span>
            <input
              type="text"
              placeholder="Search by donor name, phone, blood group, or #DNR reference..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>

          {/* Blood Group Filter */}
          <select
            value={selectedBloodGroup}
            onChange={(e) => {
              setSelectedBloodGroup(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full md:w-36 py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none"
          >
            <option value="">All Blood Groups</option>
            <option value="A_POS">A+</option>
            <option value="A_NEG">A-</option>
            <option value="B_POS">B+</option>
            <option value="B_NEG">B-</option>
            <option value="AB_POS">AB+</option>
            <option value="AB_NEG">AB-</option>
            <option value="O_POS">O+</option>
            <option value="O_NEG">O-</option>
          </select>

          {/* Source Filter */}
          <select
            value={selectedSource}
            onChange={(e) => {
              setSelectedSource(e.target.value as any);
              setCurrentPage(1);
            }}
            className="w-full md:w-44 py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none"
          >
            <option value="ALL">All Sources</option>
            <option value="DIRECT">Direct Blood Bank</option>
            <option value="CAMP">Camp Enrolled</option>
          </select>

          {/* Reset Filters */}
          {(searchQuery || selectedBloodGroup || selectedSource !== 'ALL') && (
            <button
              type="button"
              onClick={resetFilters}
              className="px-3 py-2 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Donors Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs font-medium">
            <span className="inline-block animate-spin mr-2">⏳</span> Loading voluntary donor registry...
          </div>
        ) : donors.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs font-medium space-y-2">
            <p className="text-base font-bold text-slate-700">No matching donors found</p>
            <p className="text-slate-400">
              {searchQuery || selectedBloodGroup || selectedSource !== 'ALL'
                ? 'Try adjusting your search criteria or resetting filters.'
                : 'No voluntary donors are currently associated with this Blood Bank.'}
            </p>
            <button
              onClick={() => setShowRegisterModal(true)}
              className="mt-2 px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold cursor-pointer"
            >
              Register First Donor
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Donor Reference</th>
                  <th className="py-3 px-4">Full Name</th>
                  <th className="py-3 px-4">Blood Group</th>
                  <th className="py-3 px-4">Phone Number</th>
                  <th className="py-3 px-4">Enrollment Source</th>
                  <th className="py-3 px-4">Registered Date</th>
                  <th className="py-3 px-4">Donations (Centre)</th>
                  <th className="py-3 px-4">Last Donation</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {donors.map((d) => {
                  const displayGrp = d.bloodGroup?.replace('_POS', '+')?.replace('_NEG', '-');
                  return (
                    <tr key={d.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-800">{d.donorReference}</td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{d.fullName}</div>
                        {d.isSearchable && (
                          <span className="text-[10px] text-emerald-600 font-semibold">● Search Opt-in</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded font-black text-xs">
                          {displayGrp}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">{d.phoneNumber || '—'}</td>
                      <td className="py-3 px-4">
                        {d.registrationSource === 'DIRECT' ? (
                          <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-md text-[10px] font-bold">
                            Direct Bank
                          </span>
                        ) : (
                          <div className="flex flex-col">
                            <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-md text-[10px] font-bold inline-block w-fit">
                              Camp Drive
                            </span>
                            {d.campName && <span className="text-[10px] text-slate-500 truncate max-w-[140px]">{d.campName}</span>}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-500">
                        {new Date(d.registrationDate).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-800 rounded font-bold text-xs">
                          {d.totalCompletedDonationsAtBank}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-500">
                        {d.lastDonationDateAtBank
                          ? new Date(d.lastDonationDateAtBank).toLocaleDateString()
                          : 'None Recorded'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleOpenDonorDetail(d.id)}
                          className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-bold text-[11px] cursor-pointer"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-t border-slate-200 text-xs">
            <span className="text-slate-500">
              Showing page <span className="font-bold text-slate-800">{pagination.currentPage}</span> of{' '}
              <span className="font-bold text-slate-800">{pagination.totalPages}</span> ({pagination.totalCount} total donors)
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!pagination.hasPrevPage}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1 bg-white border border-slate-200 text-slate-700 rounded-lg font-bold disabled:opacity-40 cursor-pointer"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={!pagination.hasNextPage}
                onClick={() => setCurrentPage((p) => p + 1)}
                className="px-3 py-1 bg-white border border-slate-200 text-slate-700 rounded-lg font-bold disabled:opacity-40 cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* MODAL: Direct Donor Registration */}
      {/* ======================================================== */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  ➕ Direct Voluntary Donor Registration
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Register a walk-in or centre voluntary donor without requiring a camp drive.
                </p>
              </div>
              <button
                onClick={() => setShowRegisterModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleDirectRegisterSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Donor Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Kumar Sharma"
                  value={registerForm.fullName}
                  onChange={(e) => setRegisterForm({ ...registerForm, fullName: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Mobile Phone Number *</label>
                  <input
                    type="tel"
                    required
                    placeholder="10-digit mobile number"
                    value={registerForm.phoneNumber}
                    onChange={(e) => setRegisterForm({ ...registerForm, phoneNumber: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Blood Group *</label>
                  <select
                    value={registerForm.bloodGroup}
                    onChange={(e) => setRegisterForm({ ...registerForm, bloodGroup: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-none"
                  >
                    <option value="A_POS">A+</option>
                    <option value="A_NEG">A-</option>
                    <option value="B_POS">B+</option>
                    <option value="B_NEG">B-</option>
                    <option value="AB_POS">AB+</option>
                    <option value="AB_NEG">AB-</option>
                    <option value="O_POS">O+</option>
                    <option value="O_NEG">O-</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Date of Birth (Optional)</label>
                  <input
                    type="date"
                    value={registerForm.dateOfBirth}
                    onChange={(e) => setRegisterForm({ ...registerForm, dateOfBirth: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-400">Must be 18 to 65 years old</span>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">City / Locality (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Pune Central"
                    value={registerForm.cityOrLocality}
                    onChange={(e) => setRegisterForm({ ...registerForm, cityOrLocality: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none"
                  />
                </div>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={registerForm.consentGiven}
                    onChange={(e) => setRegisterForm({ ...registerForm, consentGiven: e.target.checked })}
                    className="mt-0.5 h-4 w-4 rounded text-rose-600 focus:ring-rose-500"
                  />
                  <span className="text-amber-900 font-medium text-[11px]">
                    I confirm the donor has granted informed consent to register voluntarily and be associated with this Blood Centre (v1.0 Compliance).
                  </span>
                </label>

                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={registerForm.isSearchable}
                    onChange={(e) => setRegisterForm({ ...registerForm, isSearchable: e.target.checked })}
                    className="mt-0.5 h-4 w-4 rounded text-rose-600 focus:ring-rose-500"
                  />
                  <span className="text-slate-700 font-medium text-[11px]">
                    Opt-in donor to voluntary emergency search matching (donor identity remains privacy-protected until bilateral release).
                  </span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowRegisterModal(false)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={registerLoading || !registerForm.consentGiven}
                  className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold disabled:opacity-50 cursor-pointer shadow-sm"
                >
                  {registerLoading ? 'Registering...' : 'Register Voluntary Donor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: Donor Profile & Donation History */}
      {/* ======================================================== */}
      {selectedDonorDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900">
                    {selectedDonorDetail.profile.fullName}
                  </h3>
                  <span className="px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded font-black text-xs">
                    {selectedDonorDetail.profile.bloodGroup?.replace('_POS', '+')?.replace('_NEG', '-')}
                  </span>
                </div>
                <p className="text-xs font-mono text-slate-500">
                  {selectedDonorDetail.profile.donorReference} • Enrolled via {selectedDonorDetail.profile.registrationSource === 'DIRECT' ? 'Direct Bank Reception' : 'Camp Drive'}
                </p>
              </div>
              <button
                onClick={() => setSelectedDonorDetail(null)}
                className="text-slate-400 hover:text-slate-600 text-sm p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Profile Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Phone</span>
                <span className="font-mono font-bold text-slate-800">{selectedDonorDetail.profile.phoneNumber || '—'}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">City/Locality</span>
                <span className="font-bold text-slate-800">{selectedDonorDetail.profile.cityOrLocality || 'Not recorded'}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Donations at Centre</span>
                <span className="font-bold text-emerald-700">{selectedDonorDetail.summary.totalDonationsAtBank} completed</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Donation Interval</span>
                <span className={`font-bold ${selectedDonorDetail.summary.isEligibleByInterval ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {selectedDonorDetail.summary.isEligibleByInterval ? 'Eligible (>90 days)' : 'Within 90-day interval'}
                </span>
              </div>
            </div>

            {/* Donation History Table */}
            <div>
              <h4 className="text-xs font-bold text-slate-900 mb-2 uppercase tracking-wider">
                🩸 Verified Donation History at this Blood Centre ({selectedDonorDetail.donationHistory.length})
              </h4>
              {selectedDonorDetail.donationHistory.length === 0 ? (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center text-xs text-slate-400">
                  No completed donations recorded yet at this centre.
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 text-[10px]">
                      <tr>
                        <th className="p-2">Date</th>
                        <th className="p-2">Venue / Camp</th>
                        <th className="p-2">Type</th>
                        <th className="p-2">Volume</th>
                        <th className="p-2">Unit Code</th>
                        <th className="p-2">Outcome</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedDonorDetail.donationHistory.map((dh: any) => (
                        <tr key={dh.id}>
                          <td className="p-2 font-mono text-slate-600">{new Date(dh.performedAt).toLocaleDateString()}</td>
                          <td className="p-2 font-medium text-slate-900">{dh.campTitle}</td>
                          <td className="p-2">{dh.donationType}</td>
                          <td className="p-2 font-bold">{dh.volumeMl || 450} mL</td>
                          <td className="p-2 font-mono text-slate-700">{dh.unitNumber || '—'}</td>
                          <td className="p-2">
                            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded text-[10px] font-bold">
                              {dh.outcome}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Clinical Screening History */}
            <div>
              <h4 className="text-xs font-bold text-slate-900 mb-2 uppercase tracking-wider">
                🩺 Clinical Screening Records ({selectedDonorDetail.clinicalScreenings.length})
              </h4>
              {selectedDonorDetail.clinicalScreenings.length === 0 ? (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center text-xs text-slate-400">
                  No clinical screening records on file.
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 text-[10px]">
                      <tr>
                        <th className="p-2">Screening Date</th>
                        <th className="p-2">Decision</th>
                        <th className="p-2">Deferral Details</th>
                        <th className="p-2">Clinical Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedDonorDetail.clinicalScreenings.map((cs: any) => (
                        <tr key={cs.id}>
                          <td className="p-2 font-mono text-slate-600">{new Date(cs.screenedAt).toLocaleDateString()}</td>
                          <td className="p-2 font-bold">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              cs.eligibilityDecision === 'CLEARED' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                            }`}>
                              {cs.eligibilityDecision || cs.status}
                            </span>
                          </td>
                          <td className="p-2 text-slate-600">
                            {cs.deferralCategory ? `${cs.deferralCategory} (${cs.deferralDurationDays || 0}d)` : 'None'}
                          </td>
                          <td className="p-2 text-slate-600 italic">{cs.clinicalNotes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setSelectedDonorDetail(null)}
                className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Close Profile
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

