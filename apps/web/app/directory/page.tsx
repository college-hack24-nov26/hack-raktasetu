'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  STATES_AND_DISTRICTS,
  DEFAULT_STATE_CODE,
  DEFAULT_DISTRICT_CODE,
  getDistrictsForState,
  getStateByCode,
  getCentreCoordinates,
} from '../config/geography';
import MapboxBloodMap, { SearchResultItem } from '../components/MapboxBloodMap';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const COMPONENTS = [
  { label: 'Packed Red Blood Cells (PRBC)', value: 'Packed Red Blood Cells' },
  { label: 'Whole Blood', value: 'Whole Blood' },
  { label: 'Platelet Concentrate', value: 'Platelet Concentrate' },
  { label: 'Fresh Frozen Plasma (FFP)', value: 'Fresh Frozen Plasma' },
];

function DirectoryContent() {
  const searchParams = useSearchParams();

  const queryStateCode = searchParams.get('stateCode');
  const queryDistrictCode = searchParams.get('districtCode');
  const queryBloodGroup = searchParams.get('bloodGroup');
  const querySearch = searchParams.get('q');

  const initialParsedStateCode = queryStateCode ? parseInt(queryStateCode, 10) : DEFAULT_STATE_CODE;
  const initialParsedDistrictCode = queryDistrictCode ? parseInt(queryDistrictCode, 10) : DEFAULT_DISTRICT_CODE;

  const [stateCode, setStateCode] = useState<number>(
    isNaN(initialParsedStateCode) ? DEFAULT_STATE_CODE : initialParsedStateCode
  );
  const [districtCode, setDistrictCode] = useState<number>(
    isNaN(initialParsedDistrictCode) ? DEFAULT_DISTRICT_CODE : initialParsedDistrictCode
  );
  const [bloodGroup, setBloodGroup] = useState<string>(
    queryBloodGroup && BLOOD_GROUPS.includes(queryBloodGroup) ? queryBloodGroup : 'O+'
  );
  const [component, setComponent] = useState<string>('Packed Red Blood Cells');
  const [hospitalSearch, setHospitalSearch] = useState<string>(querySearch || '');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [searched, setSearched] = useState(false);
  const [metaInfo, setMetaInfo] = useState<any>(null);

  const [selectedHospitalCode, setSelectedHospitalCode] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<'list' | 'map'>('list');

  const availableDistricts = getDistrictsForState(stateCode);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

  const handleStateChange = (newStateCode: number) => {
    setStateCode(newStateCode);
    const districts = getDistrictsForState(newStateCode);
    if (districts.length > 0) {
      setDistrictCode(districts[0].code);
    }
  };

  const executeSearch = async (
    targetStateCode: number,
    targetDistrictCode: number,
    targetBloodGroup: string,
    targetComponent: string
  ) => {
    setLoading(true);
    setError(null);
    setSearched(true);
    setSelectedHospitalCode(null);

    try {
      const params = new URLSearchParams({
        stateCode: String(targetStateCode),
        districtCode: String(targetDistrictCode),
        bloodGroup: targetBloodGroup,
        component: targetComponent,
      });

      const res = await fetch(`${apiUrl}/blood-availability?${params.toString()}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to search blood centres');
      }

      const rawCentres: SearchResultItem[] = Array.isArray(data.data)
        ? data.data
        : (data.data?.centres || []);

      const seenCodes = new Set<string>();
      const dedupedCentres: SearchResultItem[] = [];
      for (const item of rawCentres) {
        const code = item?.bloodCentre?.hospitalCode;
        if (!code || seenCodes.has(code)) continue;
        seenCodes.add(code);
        dedupedCentres.push(item);
      }

      setResults(dedupedCentres);
      setMetaInfo(data.meta || null);
    } catch (err: any) {
      setError(err.message || 'Unable to retrieve directory information. Please retry.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    executeSearch(stateCode, districtCode, bloodGroup, component);
  }, [stateCode, districtCode, bloodGroup, component]);

  const handleReset = () => {
    setStateCode(DEFAULT_STATE_CODE);
    setDistrictCode(DEFAULT_DISTRICT_CODE);
    setBloodGroup('O+');
    setComponent('Packed Red Blood Cells');
    setHospitalSearch('');
  };

  const filteredResults = results.filter((item) => {
    if (!hospitalSearch.trim()) return true;
    const q = hospitalSearch.toLowerCase();
    return (
      item.bloodCentre.hospitalName.toLowerCase().includes(q) ||
      (item.bloodCentre.address && item.bloodCentre.address.toLowerCase().includes(q))
    );
  });

  const selectedDistrictObj = availableDistricts.find((d) => d.code === districtCode);

  return (
    <div className="flex-1 flex flex-col bg-slate-50 min-h-screen">
      {/* Directory Page Header */}
      <section className="bg-white border-b border-slate-200 pt-8 pb-6 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100/80 text-[#B91C32] text-xs font-bold uppercase tracking-wider mb-2">
                <span>e-RaktKosh Live Directory</span>
              </div>
              <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
                Blood Bank Directory
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-2xl leading-relaxed">
                Explore registered blood banks and government hospital centres across Maharashtra with direct
                telephone lines, reported stock availability, and interactive Mapbox directions.
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <Link
                href="/requests/new"
                className="px-5 py-2.5 rounded-xl bg-[#B91C32] hover:bg-[#9B1324] text-white text-xs sm:text-sm font-bold shadow-xs transition-colors flex items-center gap-2"
              >
                <span>+ Create Request</span>
              </Link>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-4">
            {/* Row 1: State & District Selectors + Hospital Search */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  State
                </label>
                <select
                  value={stateCode}
                  onChange={(e) => handleStateChange(parseInt(e.target.value, 10))}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#B91C32]"
                >
                  {STATES_AND_DISTRICTS.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  District
                </label>
                <select
                  value={districtCode}
                  onChange={(e) => setDistrictCode(parseInt(e.target.value, 10))}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#B91C32]"
                >
                  {availableDistricts.map((d) => (
                    <option key={d.code} value={d.code}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Component
                </label>
                <select
                  value={component}
                  onChange={(e) => setComponent(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#B91C32]"
                >
                  {COMPONENTS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Search Centre Name
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={hospitalSearch}
                    onChange={(e) => setHospitalSearch(e.target.value)}
                    placeholder="e.g. Sassoon, KEM, Civil..."
                    className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#B91C32]"
                  />
                  {hospitalSearch && (
                    <button
                      type="button"
                      onClick={() => setHospitalSearch('')}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Row 2: Blood Group Quick Select Buttons & Reset */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold text-slate-700 mr-1.5">Blood Group:</span>
                {BLOOD_GROUPS.map((bg) => (
                  <button
                    key={bg}
                    type="button"
                    onClick={() => setBloodGroup(bg)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      bloodGroup === bg
                        ? 'bg-[#B91C32] text-white shadow-xs'
                        : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {bg}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleReset}
                className="text-xs font-semibold text-slate-500 hover:text-[#B91C32] transition-colors cursor-pointer"
              >
                Reset filters
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Prototype & Live Verification Alert */}
      <div className="bg-amber-50/90 border-b border-amber-200 py-2.5 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 text-xs text-amber-900">
          <div className="flex items-center gap-2">
            <span className="font-bold">⚠️ Notice:</span>
            <span>
              Reported inventory figures reflect external e-RaktKosh portal feeds. Blood stock changes
              constantly; please call the blood bank directly to confirm availability before traveling.
            </span>
          </div>
          {metaInfo?.isLive && (
            <span className="hidden sm:inline-block px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold shrink-0">
              ● Live Feed Active
            </span>
          )}
        </div>
      </div>

      {/* Main Content Area: Split View (List + Interactive Map) */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 flex flex-col">
        {/* Mobile View Toggle (List vs Map) */}
        <div className="flex md:hidden bg-slate-200 p-1 rounded-xl mb-4 text-xs font-bold">
          <button
            type="button"
            onClick={() => setMobileTab('list')}
            className={`flex-1 py-2 rounded-lg text-center transition-colors ${
              mobileTab === 'list' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Directory Cards ({filteredResults.length})
          </button>
          <button
            type="button"
            onClick={() => setMobileTab('map')}
            className={`flex-1 py-2 rounded-lg text-center transition-colors ${
              mobileTab === 'map' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Map View
          </button>
        </div>

        {/* Results Layout */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start flex-1">
          {/* Left Column: Centre Cards List */}
          <div
            className={`md:col-span-7 lg:col-span-6 space-y-4 ${
              mobileTab === 'map' ? 'hidden md:block' : 'block'
            }`}
          >
            <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
              <span>
                Showing <strong>{filteredResults.length}</strong> centres in{' '}
                <strong>{selectedDistrictObj?.name || 'Selected District'}</strong>
              </span>
              <span>Target: {bloodGroup} ({component})</span>
            </div>

            {loading && (
              <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-xs">
                <div className="w-8 h-8 border-3 border-[#B91C32] border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                <p className="text-sm font-semibold text-slate-800">Querying live e-RaktKosh directory...</p>
                <p className="text-xs text-slate-500 mt-1">Fetching verified blood banks and inventory snapshots</p>
              </div>
            )}

            {error && !loading && (
              <div className="p-6 bg-red-50 rounded-2xl border border-red-200 text-red-900 text-xs sm:text-sm">
                <div className="flex items-center gap-2 font-bold mb-1">
                  <svg className="w-4 h-4 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>Directory Query Failed</span>
                </div>
                <p className="mb-3">{error}</p>
                <button
                  type="button"
                  onClick={() => executeSearch(stateCode, districtCode, bloodGroup, component)}
                  className="px-4 py-2 bg-[#B91C32] text-white rounded-xl text-xs font-bold hover:bg-[#9B1324] cursor-pointer"
                >
                  Retry Search
                </button>
              </div>
            )}

            {!loading && !error && filteredResults.length === 0 && (
              <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-xs">
                <p className="text-base font-bold text-slate-900 mb-1">No blood centres found</p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
                  No registered centres match your current filter criteria in this district. Try searching for
                  a different district or clearing the hospital search filter.
                </p>
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Clear All Filters
                </button>
              </div>
            )}

            {!loading &&
              !error &&
              filteredResults.map(({ bloodCentre, availability }, index) => {
                const isSelected = selectedHospitalCode === bloodCentre.hospitalCode;
                const coords = getCentreCoordinates(bloodCentre.hospitalCode);
                const isStale = availability.isStale || availability.status === 'stale';
                const isAvailable =
                  availability.status === 'available' &&
                  !isStale &&
                  (availability.reportedQuantity === null || availability.reportedQuantity > 0);
                const isZero =
                  (availability.status === 'zero' || availability.reportedQuantity === 0) && !isStale;

                return (
                  <div
                    key={`${bloodCentre.hospitalCode || 'centre'}-${(bloodCentre as any).isParticipatingCentre ? 'rs' : 'ext'}-${index}`}
                    onClick={() => setSelectedHospitalCode(bloodCentre.hospitalCode)}
                    className={`p-5 rounded-2xl bg-white border transition-all cursor-pointer ${
                      isSelected
                        ? 'border-[#B91C32] ring-2 ring-red-100 shadow-md'
                        : 'border-slate-200 hover:border-slate-300 hover:shadow-xs'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                            #{bloodCentre.hospitalCode}
                          </span>
                          {(bloodCentre as any).isParticipatingCentre ? (
                            <span className="text-[10px] font-bold text-purple-900 bg-purple-100 px-2 py-0.5 rounded-full border border-purple-200">
                              ★ RaktaSetu Centre
                            </span>
                          ) : (
                            <span className="text-[10px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                              e-RaktKosh
                            </span>
                          )}
                          {coords && (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                              ● Mapped
                            </span>
                          )}
                        </div>
                        <h3 className="text-base font-bold text-slate-900 leading-tight">
                          {bloodCentre.hospitalName}
                        </h3>
                      </div>

                      {/* Stock Status Badge */}
                      <div className="shrink-0 text-right">
                        {isAvailable ? (
                          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
                            <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></span>
                            <span>{availability.reportedQuantity ?? 0} Units Available</span>
                          </div>
                        ) : isZero ? (
                          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100 text-red-800 text-xs font-bold">
                            <span>0 Units (Depleted)</span>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
                            <span>Status Unreported</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <p className="text-xs text-slate-600 leading-relaxed mb-3">
                      {bloodCentre.address || 'Address registered with State Blood Transfusion Council.'}
                    </p>

                    {/* Contact & Coordination Actions */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs">
                      <div className="flex items-center gap-2">
                        {bloodCentre.mobileNo ? (
                          <a
                            href={`tel:${bloodCentre.mobileNo}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1.5 font-bold text-[#B91C32] hover:underline"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                              />
                            </svg>
                            <span>{bloodCentre.mobileNo}</span>
                          </a>
                        ) : (
                          <span className="text-slate-400">Direct phone not listed</span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <Link
                          href={`/blood-centres/${bloodCentre.hospitalCode}`}
                          onClick={(e) => e.stopPropagation()}
                          className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 font-semibold text-slate-700 transition-colors"
                        >
                          Details &amp; Stock
                        </Link>
                        <Link
                          href={`/requests/new?centreCode=${bloodCentre.hospitalCode}&stateCode=${stateCode}&districtCode=${districtCode}&bloodGroup=${encodeURIComponent(
                            bloodGroup
                          )}`}
                          onClick={(e) => e.stopPropagation()}
                          className="px-3.5 py-1.5 rounded-xl bg-[#B91C32] hover:bg-[#9B1324] text-white font-bold transition-colors"
                        >
                          Request Blood
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>

          {/* Right Column: Sticky Mapbox Integration */}
          <div
            className={`md:col-span-5 lg:col-span-6 sticky top-20 ${
              mobileTab === 'list' ? 'hidden md:block' : 'block'
            }`}
          >
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs h-[540px] flex flex-col">
              <div className="p-3.5 border-b border-slate-100 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 font-bold text-slate-800">
                  <span className="w-2 h-2 rounded-full bg-[#B91C32]"></span>
                  <span>District Map: {selectedDistrictObj?.name}</span>
                </div>
                <span className="text-[11px] text-slate-500">
                  {filteredResults.length} centres mapped
                </span>
              </div>

              <div className="flex-1 relative">
                <MapboxBloodMap
                  districtCode={districtCode}
                  results={filteredResults}
                  selectedHospitalCode={selectedHospitalCode}
                  onSelectCentre={(code: string) => setSelectedHospitalCode(code)}
                  bloodGroup={bloodGroup}
                  component={component}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DirectoryPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center p-12 text-slate-500">
          Loading directory...
        </div>
      }
    >
      <DirectoryContent />
    </Suspense>
  );
}
