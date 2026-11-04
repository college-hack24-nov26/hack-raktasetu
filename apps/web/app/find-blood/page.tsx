'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
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
import { CardSkeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const COMPONENTS = [
  { label: 'Packed Red Blood Cells (PRBC)', value: 'Packed Red Blood Cells' },
  { label: 'Whole Blood', value: 'Whole Blood' },
  { label: 'Platelet Concentrate', value: 'Platelet Concentrate' },
  { label: 'Fresh Frozen Plasma (FFP)', value: 'Fresh Frozen Plasma' },
];

function parseBloodGroupParam(param?: string | null): string {
  if (!param) return 'B+';
  const cleaned = param.trim().toUpperCase().replace(/VE$/, '').replace(/\s+/g, '+');
  if (cleaned === 'A+' || cleaned === 'A_POS') return 'A+';
  if (cleaned === 'A-' || cleaned === 'A_NEG') return 'A-';
  if (cleaned === 'B+' || cleaned === 'B_POS') return 'B+';
  if (cleaned === 'B-' || cleaned === 'B_NEG') return 'B-';
  if (cleaned === 'AB+' || cleaned === 'AB_POS') return 'AB+';
  if (cleaned === 'AB-' || cleaned === 'AB_NEG') return 'AB-';
  if (cleaned === 'O+' || cleaned === 'O_POS') return 'O+';
  if (cleaned === 'O-' || cleaned === 'O_NEG') return 'O-';
  return BLOOD_GROUPS.includes(param) ? param : 'B+';
}

function parseComponentParam(param?: string | null): string {
  if (!param) return 'Packed Red Blood Cells';
  const s = param.toLowerCase().replace(/[\-_]/g, ' ');
  if (s.includes('prbc') || s.includes('packed red')) return 'Packed Red Blood Cells';
  if (s.includes('whole blood')) return 'Whole Blood';
  if (s.includes('fresh frozen') || s.includes('ffp') || s.includes('plasma')) return 'Fresh Frozen Plasma';
  if (s.includes('platelet')) return 'Platelet Concentrate';
  return 'Packed Red Blood Cells';
}

/**
 * Determines availability ranking tier for availability-first sorting:
 * Rank 1: Verified positive stock (status === 'available', not stale, reportedQuantity > 0)
 * Rank 2: Unknown / stale / unverified stock
 * Rank 3: Confirmed zero stock (status === 'zero' or reportedQuantity === 0)
 */
function getAvailabilityRank(item: SearchResultItem): number {
  const isStale = item.availability?.isStale || item.availability?.status === 'stale';
  const qty = item.availability?.reportedQuantity;
  const status = item.availability?.status;

  if (!isStale && status === 'available' && qty !== null && qty !== undefined && qty > 0) {
    return 1;
  }
  if (!isStale && (status === 'zero' || qty === 0)) {
    return 3;
  }
  return 2;
}

/**
 * Sorts blood availability search results availability-first:
 * 1. Positive eligible stock (highest units first)
 * 2. Unknown / stale / unverified stock
 * 3. Confirmed zero stock
 * Secondary tiebreaker: Centre name ascending, then hospitalCode
 */
function sortAvailabilityResults(items: SearchResultItem[]): SearchResultItem[] {
  return [...items].sort((a, b) => {
    const rankA = getAvailabilityRank(a);
    const rankB = getAvailabilityRank(b);

    if (rankA !== rankB) {
      return rankA - rankB;
    }

    if (rankA === 1) {
      const qtyA = a.availability?.reportedQuantity ?? 0;
      const qtyB = b.availability?.reportedQuantity ?? 0;
      if (qtyA !== qtyB) return qtyB - qtyA;
    }

    const nameA = a.bloodCentre?.hospitalName || '';
    const nameB = b.bloodCentre?.hospitalName || '';
    const nameComp = nameA.localeCompare(nameB);
    if (nameComp !== 0) return nameComp;

    const codeA = a.bloodCentre?.hospitalCode || '';
    const codeB = b.bloodCentre?.hospitalCode || '';
    return codeA.localeCompare(codeB);
  });
}

function FindBloodContent() {
  const searchParams = useSearchParams();

  // Read initial params from URL if present
  const queryStateCode = searchParams.get('stateCode');
  const queryDistrictCode = searchParams.get('districtCode');
  const queryBloodGroup = searchParams.get('bloodGroup');
  const queryComponent = searchParams.get('component');
  const querySource = searchParams.get('source');

  const initialParsedStateCode = queryStateCode ? parseInt(queryStateCode, 10) : DEFAULT_STATE_CODE;
  const initialParsedDistrictCode = queryDistrictCode ? parseInt(queryDistrictCode, 10) : DEFAULT_DISTRICT_CODE;

  const [stateCode, setStateCode] = useState<number>(
    isNaN(initialParsedStateCode) ? DEFAULT_STATE_CODE : initialParsedStateCode
  );
  const [districtCode, setDistrictCode] = useState<number>(
    isNaN(initialParsedDistrictCode) ? DEFAULT_DISTRICT_CODE : initialParsedDistrictCode
  );
  const [bloodGroup, setBloodGroup] = useState<string>(
    parseBloodGroupParam(queryBloodGroup)
  );
  const [component, setComponent] = useState<string>(
    parseComponentParam(queryComponent)
  );
  const [source, setSource] = useState<'internal' | 'external'>(
    querySource === 'external' ? 'external' : 'internal'
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [searched, setSearched] = useState(false);
  const [metaInfo, setMetaInfo] = useState<any>(null);

  // Selected centre for map-card synchronization
  const [selectedHospitalCode, setSelectedHospitalCode] = useState<string | null>(null);

  // Mobile tab state: 'list' or 'map'
  const [mobileTab, setMobileTab] = useState<'list' | 'map'>('list');

  // Sorted results ensuring availability-first order
  const sortedResults = useMemo(() => {
    return sortAvailabilityResults(results);
  }, [results]);

  const availableDistricts = getDistrictsForState(stateCode);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

  // When state changes, update district to the first district in that state
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
    targetComponent: string,
    targetSource: 'internal' | 'external'
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
        source: targetSource,
      });

      const res = await fetch(`${apiUrl}/blood-availability?${params.toString()}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to search blood centres');
      }

      const rawList = Array.isArray(data.data) ? data.data : [];
      const seenCodes = new Set<string>();
      const dedupedResults: SearchResultItem[] = [];
      for (const item of rawList) {
        const code = item?.bloodCentre?.hospitalCode;
        if (!code || seenCodes.has(code)) continue;
        seenCodes.add(code);
        dedupedResults.push(item);
      }

      setResults(dedupedResults);
      setMetaInfo(data.meta || null);
    } catch (err: any) {
      setError(err.message);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    executeSearch(stateCode, districtCode, bloodGroup, component, source);
  };

  const handleSourceChange = (newSource: 'internal' | 'external') => {
    setSource(newSource);
    executeSearch(stateCode, districtCode, bloodGroup, component, newSource);
  };

  // Run initial search on mount
  useEffect(() => {
    executeSearch(stateCode, districtCode, bloodGroup, component, source);
  }, []);

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return 'Not reported';
    try {
      const d = new Date(isoString);
      return d.toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return isoString;
    }
  };

  const currentStateName = getStateByCode(stateCode)?.name || `State ${stateCode}`;

  const handleSelectCentreFromCard = (code: string) => {
    setSelectedHospitalCode(code);
  };

  const handleViewOnMapMobile = (code: string) => {
    setSelectedHospitalCode(code);
    setMobileTab('map');
  };

  return (
    <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8">
      {/* Page Header */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Find Blood & Components
        </h1>
        <p className="text-sm sm:text-base text-slate-600 mt-1.5 max-w-2xl leading-relaxed">
          Interactive blood centre discovery powered by Mapbox and live government directory availability. Select your state and district to explore inventory and map locations.
        </p>
      </div>

      {/* RaktKhoj Search Controls Form */}
      {/* RaktKhoj Search Controls Form */}
      <form
        onSubmit={handleSearchSubmit}
        className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6 mb-6 transition-shadow hover:shadow-md"
      >
        {/* Quick Blood Group Pill Selector for instant touch access */}
        <div className="mb-4 pb-4 border-b border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Quick Blood Group Select
            </span>
            <span className="text-[11px] font-medium text-slate-500">
              Selected: <strong className="text-[#B91C32]">{bloodGroup}</strong>
            </span>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
            {BLOOD_GROUPS.map((bg) => (
              <button
                key={bg}
                type="button"
                onClick={() => setBloodGroup(bg)}
                className={`py-2 px-3 rounded-xl text-xs font-extrabold transition-all text-center cursor-pointer ${
                  bloodGroup === bg
                    ? 'bg-[#B91C32] text-white shadow-sm ring-2 ring-red-200 scale-102'
                    : 'bg-slate-50 text-slate-800 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                {bg}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. State Selector */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              1. State
            </label>
            <select
              value={stateCode}
              onChange={(e) => handleStateChange(Number(e.target.value))}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#B91C32]"
            >
              {STATES_AND_DISTRICTS.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* 2. District Selector */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              2. District
            </label>
            <select
              value={districtCode}
              onChange={(e) => setDistrictCode(Number(e.target.value))}
              disabled={availableDistricts.length === 0}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#B91C32] disabled:bg-slate-50"
            >
              {availableDistricts.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Blood Group Dropdown */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              3. Blood Group
            </label>
            <select
              value={bloodGroup}
              onChange={(e) => setBloodGroup(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#B91C32]"
            >
              {BLOOD_GROUPS.map((bg) => (
                <option key={bg} value={bg}>
                  {bg}
                </option>
              ))}
            </select>
          </div>

          {/* 4. Component */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              4. Blood Component
            </label>
            <select
              value={component}
              onChange={(e) => setComponent(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#B91C32]"
            >
              {COMPONENTS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-5 flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-200">
          <div className="text-xs text-slate-500 text-center sm:text-left">
            Showing centres in {currentStateName}. Data reflects source-reported inventory and is not an online reservation.
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-[#B91C32] hover:bg-[#9B1324] active:bg-[#851323] text-white font-semibold text-sm transition-colors shadow-sm disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading ? (
              <>
                <svg className="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                </svg>
                <span>Searching Inventory...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                </svg>
                <span>Search Blood Centres</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Source Selection Controls */}
      <div className="mb-6 bg-white p-2.5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => handleSourceChange('internal')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
              source === 'internal'
                ? 'bg-[#B91C32] text-white shadow-xs'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
            }`}
          >
            <span>🩸 RaktaSetu Participating Centres</span>
            {metaInfo && (
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                  source === 'internal' ? 'bg-white/20 text-white' : 'bg-rose-100 text-[#B91C32]'
                }`}
              >
                {metaInfo.centresWithStock !== undefined && metaInfo.centresWithStock > 0
                  ? `${metaInfo.centresWithStock} in stock (${metaInfo.totalCentresSearched ?? metaInfo.totalCentres})`
                  : `${metaInfo.totalCentresSearched ?? metaInfo.totalCentres ?? metaInfo.participatingCentresCount} centres`}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleSourceChange('external')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
              source === 'external'
                ? 'bg-[#B91C32] text-white shadow-xs'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
            }`}
          >
            <span>🏛️ e-RaktKosh Blood Banks</span>
            {metaInfo && (
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                  source === 'external' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {metaInfo.centresWithStock !== undefined && metaInfo.centresWithStock > 0
                  ? `${metaInfo.centresWithStock} reported stock (${metaInfo.totalCentresSearched ?? metaInfo.totalCentres})`
                  : `${metaInfo.totalCentresSearched ?? metaInfo.totalCentres ?? metaInfo.externalCentresCount} centres`}
              </span>
            )}
          </button>
        </div>

        <div className="text-[11px] text-slate-500 px-2 text-center md:text-right">
          {source === 'internal' ? (
            <span className="text-purple-800 font-semibold flex items-center justify-center md:justify-end gap-1.5">
              <span className="w-2 h-2 rounded-full bg-purple-600 animate-pulse"></span>
              Live Authoritative Hospital Stock released by verified clinical staff
            </span>
          ) : (
            <span className="text-slate-600 font-medium">
              External reported stock figures from Central Ministry e-RaktKosh Portal
            </span>
          )}
        </div>
      </div>

      {/* Meta Notice */}
      {metaInfo && (
        <div className="mb-4 p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div>
            <strong>Search Scope:</strong> {metaInfo.totalCentresSearched ?? metaInfo.totalCentres} centres searched &bull;{' '}
            <span className="font-bold text-emerald-700">
              {metaInfo.centresWithStock ?? 0} with available stock
            </span>{' '}
            for {metaInfo.component} ({metaInfo.bloodGroup}) under {source === 'internal' ? 'RaktaSetu Participating Centres' : 'e-RaktKosh Directory'}.
          </div>
          <div className="text-[11px] text-slate-500">
            {metaInfo.notes}
          </div>
        </div>
      )}

      {/* Source-specific Safety & Medical Notice */}
      {source === 'internal' ? (
        <div className="mb-6 px-4 py-3 rounded-xl bg-purple-50/80 border border-purple-200 text-xs text-purple-900 flex items-start gap-2.5 shadow-2xs">
          <svg className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <div>
            <span className="font-bold">Authoritative Internal Inventory:</span> Stock counts for RaktaSetu participating centres are computed from <strong>clinically released, non-expired, unheld units</strong> verified by authorized facility pathologists. Contact centre staff directly to schedule release and transfer.
          </div>
        </div>
      ) : results.length > 0 ? (
        <div className="mb-6 px-4 py-3 rounded-xl bg-blue-50/70 border border-blue-200 text-xs text-blue-900 flex items-start gap-2.5">
          <svg className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <span className="font-semibold">Externally Reported e-RaktKosh Data:</span> Figures represent periodic reported availability from external facility portals. <strong>Units are not guaranteed or reserved online.</strong> Always call the blood bank directly before travel to verify live physical stock.
          </div>
        </div>
      ) : null}

      {/* Error state */}
      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-[#B91C32]">
          <strong>Search Failed:</strong> {error}
        </div>
      )}

      {/* Mobile Tab Switcher */}
      <div className="lg:hidden flex items-center justify-center p-1 mb-4 rounded-xl bg-slate-100 border border-slate-200">
        <button
          onClick={() => setMobileTab('list')}
          className={`flex-1 py-2 px-4 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
            mobileTab === 'list'
              ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          </svg>
          <span>List View ({sortedResults.length})</span>
        </button>
        <button
          onClick={() => setMobileTab('map')}
          className={`flex-1 py-2 px-4 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
            mobileTab === 'map'
              ? 'bg-[#B91C32] text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
          </svg>
          <span>Mapbox Map</span>
        </button>
      </div>

      {/* Main Split Layout: Desktop = side-by-side (List left, Map right); Mobile = tabbed */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Results List Column */}
        <div className={`lg:col-span-7 xl:col-span-7 space-y-4 ${mobileTab === 'map' ? 'hidden lg:block' : 'block'}`}>
          {loading ? (
            <CardSkeleton count={3} />
          ) : searched && sortedResults.length === 0 ? (
            <EmptyState
              title={source === 'internal' ? "No Participating Centres with Matching Stock" : "No e-RaktKosh Blood Centres Found"}
              description={
                source === 'internal'
                  ? `No RaktaSetu participating blood centres currently have available ${bloodGroup} ${component} in this district. You can check the "e-RaktKosh Blood Banks" tab to explore external directory stock.`
                  : "No registered external blood centres were found for the selected state and district combination."
              }
              actionText={source === 'internal' ? "Switch to e-RaktKosh Blood Banks" : "Reset to All Maharashtra"}
              onAction={source === 'internal' ? () => handleSourceChange('external') : () => handleStateChange(27)}
            />
          ) : (
            <div className="space-y-4">
              {sortedResults.map(({ bloodCentre, availability }: SearchResultItem, index: number) => {
                const isStale = availability.isStale || availability.status === 'stale';
                const isAvailable = availability.status === 'available' && !isStale && (availability.reportedQuantity === null || availability.reportedQuantity > 0);
                const isZero = (availability.status === 'zero' || availability.reportedQuantity === 0) && !isStale;
                const isUnknown = !isStale && !isAvailable && !isZero;
                const isSelected = selectedHospitalCode === bloodCentre.hospitalCode;
                const coords = getCentreCoordinates(bloodCentre.hospitalCode);

                return (
                  <div
                    key={`${bloodCentre.hospitalCode || 'centre'}-${(bloodCentre as any).isParticipatingCentre ? 'rs' : 'ext'}-${index}`}
                    onClick={() => handleSelectCentreFromCard(bloodCentre.hospitalCode)}
                    className={`bg-white rounded-2xl border p-4 sm:p-5 transition-all cursor-pointer ${
                      isSelected
                        ? 'border-[#B91C32] ring-2 ring-red-100 shadow-md'
                        : 'border-slate-200 shadow-sm hover:border-slate-300 hover:shadow-md'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                      {/* Centre Info */}
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                            Code #{bloodCentre.hospitalCode}
                          </span>
                          {(bloodCentre as any).isParticipatingCentre ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-900 border border-purple-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-purple-600"></span>
                              <span>RaktaSetu Participating Centre</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                              e-RaktKosh Directory
                            </span>
                          )}
                          {coords ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                              <span>Mapped Location</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-500">
                              Map Location Unavailable
                            </span>
                          )}
                        </div>

                        <h3 className="text-base sm:text-lg font-bold text-slate-900 mb-1">
                          <Link
                            href={`/blood-centres/${bloodCentre.hospitalCode}`}
                            className="hover:text-[#B91C32] transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {bloodCentre.hospitalName}
                          </Link>
                        </h3>
                        <p className="text-xs sm:text-sm text-slate-600 mb-3">
                          {bloodCentre.address || 'Address not supplied in directory'}
                        </p>

                        {/* Contact & Map Action Buttons */}
                        <div className="flex flex-wrap items-center gap-2">
                          {bloodCentre.hasValidContact ? (
                            <a
                              href={`tel:${bloodCentre.mobileNo}`}
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold hover:bg-emerald-100 transition-colors"
                            >
                              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 20 20">
                                <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 4V3z" />
                              </svg>
                              <span>Call: {bloodCentre.mobileNo}</span>
                            </a>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 text-slate-500 text-xs font-medium border border-slate-200">
                              No telephone recorded
                            </span>
                          )}

                          {coords && (
                            <>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleViewOnMapMobile(bloodCentre.hospitalCode);
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-200 text-xs font-semibold text-slate-800 border border-slate-200 transition-colors cursor-pointer"
                              >
                                🗺️ View on Map
                              </button>
                              <a
                                href={`https://www.google.com/maps/dir/?api=1&destination=${coords.latitude},${coords.longitude}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-xs font-medium text-slate-600 hover:text-[#B91C32] underline px-2 py-1 transition-colors"
                              >
                                Directions
                              </a>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Availability & Request Column */}
                      <div className="sm:w-56 flex flex-col justify-between p-3.5 rounded-xl bg-slate-50 border border-slate-200 shrink-0">
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                              {bloodGroup} {component}
                            </span>
                          </div>

                          {/* Status Badge */}
                          <div className="mb-2">
                            {(bloodCentre as any).isParticipatingCentre ? (
                              isAvailable ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-900 border border-purple-200">
                                  ✓ Verified In Stock
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                  0 Verified Units
                                </span>
                              )
                            ) : (
                              <>
                                {isAvailable && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                                    Stock Reported
                                  </span>
                                )}
                                {isZero && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800">
                                    Reported: 0 Units
                                  </span>
                                )}
                                {isStale && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                                    Stale (&gt;24h)
                                  </span>
                                )}
                                {isUnknown && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                                    Stock Unverified Online
                                  </span>
                                )}
                              </>
                            )}
                          </div>

                          {/* Quantity Display */}
                          <div className="mb-2">
                            {isAvailable && availability.reportedQuantity !== null ? (
                              <div>
                                <div className="text-lg font-extrabold text-slate-900">
                                  {availability.reportedQuantity}{' '}
                                  <span className="text-xs font-normal text-slate-500">
                                    {availability.quantityUnit || 'units'}
                                  </span>
                                </div>
                                <div className="text-[10px] text-purple-700 font-semibold">
                                  {(bloodCentre as any).isParticipatingCentre
                                    ? 'Live verified stock • Hospital release'
                                    : 'Reported stock • Not reserved'}
                                </div>
                              </div>
                            ) : isZero ? (
                              <div>
                                <div className="text-lg font-extrabold text-rose-700">
                                  0 <span className="text-xs font-normal text-slate-500">units</span>
                                </div>
                                <div className="text-[10px] text-rose-600 font-medium">
                                  {(bloodCentre as any).isParticipatingCentre
                                    ? 'Out of stock in facility inventory'
                                    : 'Out of stock at source'}
                                </div>
                              </div>
                            ) : isStale ? (
                              <div>
                                {availability.reportedQuantity !== null ? (
                                  <div className="text-base font-bold text-amber-900">
                                    {availability.reportedQuantity} units{' '}
                                    <span className="text-xs font-normal text-amber-700">(Outdated)</span>
                                  </div>
                                ) : (
                                  <div className="text-xs text-amber-800 italic">
                                    {availability.rawStockString || 'Historical stock unverified'}
                                  </div>
                                )}
                                <div className="text-[10px] text-amber-700">Entry exceeds 24h window</div>
                              </div>
                            ) : (
                              <div>
                                <div className="text-xs text-slate-600 italic">
                                  Call centre to check stock
                                </div>
                                <div className="text-[10px] text-slate-400">Stock unverified online</div>
                              </div>
                            )}
                          </div>

                          <div className="text-[10px] text-slate-500 border-t border-slate-200 pt-1.5 mb-2">
                            Source: {formatDate(availability.sourceEntryDate)}
                          </div>
                        </div>

                        {/* Request Blood Button */}
                        <Link
                          href={`/requests/new?hospitalCode=${bloodCentre.hospitalCode}&hospitalName=${encodeURIComponent(bloodCentre.hospitalName)}&bloodGroup=${encodeURIComponent(bloodGroup)}&component=${encodeURIComponent(component)}`}
                          onClick={(e) => e.stopPropagation()}
                          className="w-full text-center py-2 px-2.5 rounded-lg bg-[#B91C32] hover:bg-[#9B1324] active:bg-[#851323] text-white font-semibold text-xs transition-colors shadow-xs"
                        >
                          Request Blood
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Interactive Mapbox Map Column (Sticky on desktop, toggleable on mobile) */}
        <div className={`lg:col-span-5 xl:col-span-5 lg:sticky lg:top-24 ${mobileTab === 'list' ? 'hidden lg:block' : 'block'}`}>
          <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-sm">
            <div className="flex items-center justify-between px-2 pb-2 mb-2 border-b border-slate-200">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#B91C32]"></span>
                <span className="text-xs font-bold text-slate-900">Interactive Blood Map</span>
              </div>
              <span className="text-[11px] text-slate-500">
                Mapbox GL JS
              </span>
            </div>

            <MapboxBloodMap
              districtCode={districtCode}
              results={sortedResults}
              selectedHospitalCode={selectedHospitalCode}
              onSelectCentre={(code) => setSelectedHospitalCode(code)}
              bloodGroup={bloodGroup}
              component={component}
            />

            <div className="pt-2 px-1 text-[11px] text-slate-500 flex items-center justify-between">
              <span>Click a pin to view stock and directions</span>
              <span>{currentStateName}</span>
            </div>
          </div>
        </div>
      </div>


      {/* Medical Safety Notice */}
      <div className="mt-8 p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 leading-relaxed">
        <strong>Important Medical Notice:</strong> RaktaSetu does not store or dispense blood directly. Inventory numbers and map positions reflect verified public directory coordinates and time-stamped government portal feeds. Units are not reserved online. Always contact blood centre staff before travelling.
      </div>
    </div>
  );
}

export default function FindBloodPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500">Loading blood search...</div>}>
      <FindBloodContent />
    </Suspense>
  );
}
