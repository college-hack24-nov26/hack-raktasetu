'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { STATES_AND_DISTRICTS, DEFAULT_STATE_CODE, DEFAULT_DISTRICT_CODE, getDistrictsForState } from '../config/geography';

interface CampItem {
  id: string;
  title: string;
  organizer: string;
  date: string;
  time: string;
  venue: string;
  district: string;
  state: string;
  districtCode: number;
  contactPerson?: string;
  contactPhone?: string;
  category: 'Upcoming' | 'This Week' | 'This Month';
  isDemonstrationData: boolean;
}

const DEMO_CAMPS: CampItem[] = [
  {
    id: 'camp-pune-1',
    title: 'Rotary Club & Sassoon Hospital Voluntary Donation Drive',
    organizer: 'Rotary Club of Pune Midtown & Sassoon General Hospital Blood Bank',
    date: '2026-10-25',
    time: '09:00 AM – 03:00 PM',
    venue: 'Community Hall, Near Deccan Gymkhana, Pune',
    district: 'Pune',
    state: 'Maharashtra',
    districtCode: 494,
    contactPerson: 'Drive Coordinator Desk',
    contactPhone: '+91 20 2612 8000',
    category: 'This Week',
    isDemonstrationData: true,
  },
  {
    id: 'camp-mumbai-1',
    title: 'University Campus Youth Blood Donation Camp',
    organizer: 'NSS Cell in Association with KEM Hospital Blood Centre',
    date: '2026-10-28',
    time: '10:00 AM – 04:00 PM',
    venue: 'Auditorium Foyer, Fort Campus, Mumbai',
    district: 'Mumbai',
    state: 'Maharashtra',
    districtCode: 485,
    contactPerson: 'Camp Liaison Office',
    contactPhone: '+91 22 2410 7000',
    category: 'This Week',
    isDemonstrationData: true,
  },
  {
    id: 'camp-nagpur-1',
    title: 'Civil Hospital Public Voluntary Blood Camp',
    organizer: 'Government Medical College Blood Bank, Nagpur',
    date: '2026-11-04',
    time: '09:30 AM – 02:30 PM',
    venue: 'Outreach Pavilion, Medical Square, Nagpur',
    district: 'Nagpur',
    state: 'Maharashtra',
    districtCode: 489,
    contactPerson: 'Transfusion Medicine Outreach',
    contactPhone: '+91 712 274 4444',
    category: 'This Month',
    isDemonstrationData: true,
  },
  {
    id: 'camp-nashik-1',
    title: 'Nashik Red Cross Society Weekend Camp',
    organizer: 'Indian Red Cross Society, Nashik District Branch',
    date: '2026-11-12',
    time: '08:30 AM – 01:30 PM',
    venue: 'Red Cross Bhavan, Old Agra Road, Nashik',
    district: 'Nashik',
    state: 'Maharashtra',
    districtCode: 491,
    contactPerson: 'Red Cross Helpdesk',
    contactPhone: '+91 253 257 1234',
    category: 'Upcoming',
    isDemonstrationData: true,
  },
];

function getCampCategory(targetDateStr: string): 'This Week' | 'This Month' | 'Upcoming' {
  const now = new Date();
  const target = new Date(targetDateStr);
  const diffDays = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 7 && diffDays >= 0) return 'This Week';
  if (diffDays <= 30 && diffDays >= 0) return 'This Month';
  return 'Upcoming';
}

export default function CampsPage() {
  const [filterCategory, setFilterCategory] = useState<'All' | 'Upcoming' | 'This Week' | 'This Month'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDistrict, setSelectedDistrict] = useState<string>('All');
  const [registeredCampId, setRegisteredCampId] = useState<string | null>(null);
  const [liveCamps, setLiveCamps] = useState<CampItem[]>([]);
  const [loadingLive, setLoadingLive] = useState(false);

  useEffect(() => {
    async function fetchLiveCamps() {
      try {
        setLoadingLive(true);
        const res = await fetch('/api/v1/camps');
        if (res.ok) {
          const data = await res.json();
          if (data.data && Array.isArray(data.data) && data.data.length > 0) {
            const seenIds = new Set<string>();
            const deduplicated = data.data.filter((c: any) => {
              if (seenIds.has(c.id)) return false;
              seenIds.add(c.id);
              return true;
            });

            const mapped: CampItem[] = deduplicated.map((c: any) => {
              const targetIso = new Date(c.targetDate).toISOString().split('T')[0];
              const parentOrgName = c.organisation?.name || 'Accredited Blood Centre';
              const organizerDisplay = c.organizerName
                ? `${c.organizerName} (Partner: ${parentOrgName})`
                : parentOrgName;

              return {
                id: c.id,
                title: c.title,
                organizer: organizerDisplay,
                date: targetIso,
                time: c.timeSlot || '09:00 AM – 03:00 PM',
                venue: c.venue,
                district: c.district || 'Maharashtra',
                state: 'Maharashtra',
                districtCode: c.districtCode,
                contactPerson: c.coordinatorContact,
                contactPhone: c.coordinatorContact,
                category: getCampCategory(c.targetDate),
                isDemonstrationData: false,
              };
            });
            setLiveCamps(mapped);
          }
        }
      } catch {
        // Fallback to demo camps
      } finally {
        setLoadingLive(false);
      }
    }
    fetchLiveCamps();
  }, []);

  const districts = getDistrictsForState(DEFAULT_STATE_CODE);

  const displayList = liveCamps.length > 0 ? liveCamps : DEMO_CAMPS;

  const filteredCamps = displayList.filter((camp) => {
    if (filterCategory !== 'All' && camp.category !== filterCategory) return false;
    if (selectedDistrict !== 'All' && camp.district !== selectedDistrict) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match =
        camp.title.toLowerCase().includes(q) ||
        camp.organizer.toLowerCase().includes(q) ||
        camp.venue.toLowerCase().includes(q) ||
        camp.district.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  const handleRegisterInterest = (campId: string) => {
    setRegisteredCampId(campId);
    setTimeout(() => {
      setRegisteredCampId(null);
    }, 4000);
  };

  return (
    <div className="flex-1 bg-slate-50 min-h-screen">
      {/* Page Header */}
      <section className="bg-white border-b border-slate-200 py-10 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100/80 text-[#B91C32] text-xs font-bold uppercase tracking-wider mb-2">
                <span>Community Camps</span>
              </div>
              <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
                Find a Blood Donation Camp
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-xl leading-relaxed">
                Discover upcoming voluntary donation drives organized by registered blood centres, hospitals,
                and accredited social organizations.
              </p>
            </div>

            <Link
              href="/donor-registration"
              className="px-5 py-2.5 rounded-xl bg-[#B91C32] hover:bg-[#9B1324] text-white text-xs sm:text-sm font-bold shadow-xs transition-colors shrink-0"
            >
              Register as Voluntary Donor
            </Link>
          </div>

          {/* Prototype / Demo Notice */}
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 leading-relaxed flex items-start gap-2.5">
            <span className="font-bold shrink-0">⚠️ Demonstration Notice:</span>
            <span>
              The camp schedules displayed below are demonstration records illustrating community drive
              coordination. To verify actual live dates and venues in your district, please confirm with your
              local district blood bank or civil hospital.
            </span>
          </div>

          {/* Filters Bar */}
          <div className="mt-6 flex flex-col md:flex-row md:items-center justify-between gap-4 pt-4 border-t border-slate-100">
            {/* Quick Filters */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {(['All', 'This Week', 'This Month', 'Upcoming'] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setFilterCategory(cat)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    filterCategory === cat
                      ? 'bg-[#B91C32] text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* District & Search Inputs */}
            <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
              <select
                value={selectedDistrict}
                onChange={(e) => setSelectedDistrict(e.target.value)}
                className="bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#B91C32]"
              >
                <option value="All">All Maharashtra Districts</option>
                {districts.map((d) => (
                  <option key={d.code} value={d.name}>
                    {d.name}
                  </option>
                ))}
              </select>

              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search camp or venue..."
                className="bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#B91C32] w-48 sm:w-60"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Camp Cards Grid */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="text-xs text-slate-500 mb-4">
          Showing <strong>{filteredCamps.length}</strong> donation camps
        </div>

        {filteredCamps.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-xs">
            <p className="text-base font-bold text-slate-900 mb-1">No camps matching criteria</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
              Try adjusting your district or timeframe filters to view other scheduled drives.
            </p>
            <button
              type="button"
              onClick={() => {
                setFilterCategory('All');
                setSelectedDistrict('All');
                setSearchQuery('');
              }}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredCamps.map((camp) => (
              <div
                key={camp.id}
                className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs hover:shadow-md hover:border-slate-300 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-red-100 text-[#B91C32]">
                      {camp.category}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200">
                      Sample Data
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-slate-900 mb-1.5 leading-snug">
                    {camp.title}
                  </h3>
                  <p className="text-xs text-slate-600 mb-4 leading-relaxed font-medium">
                    Organized by: <span className="text-slate-800 font-semibold">{camp.organizer}</span>
                  </p>

                  <div className="space-y-2 text-xs text-slate-600 bg-slate-50/70 p-3.5 rounded-xl border border-slate-100 mb-4">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800 w-16">Date:</span>
                      <span>{camp.date}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800 w-16">Time:</span>
                      <span>{camp.time}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="font-semibold text-slate-800 w-16 shrink-0">Venue:</span>
                      <span>{camp.venue}, {camp.district}</span>
                    </div>
                    {camp.contactPhone && (
                      <div className="flex items-center gap-2 pt-1 border-t border-slate-200/60">
                        <span className="font-semibold text-slate-800 w-16">Contact:</span>
                        <a href={`tel:${camp.contactPhone}`} className="text-[#B91C32] font-semibold hover:underline">
                          {camp.contactPhone}
                        </a>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3 text-xs">
                  <span className="text-slate-500">Walk-ins welcome with Photo ID</span>

                  {registeredCampId === camp.id ? (
                    <span className="text-emerald-700 font-bold flex items-center gap-1">
                      ✓ Reminder Set
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleRegisterInterest(camp.id)}
                      className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-[#B91C32] hover:text-white text-slate-800 font-semibold transition-all cursor-pointer"
                    >
                      Remind Me
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
