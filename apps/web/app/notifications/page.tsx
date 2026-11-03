'use client';

import { useState } from 'react';
import Link from 'next/link';

interface NoticeItem {
  id: string;
  title: string;
  source: string;
  category: 'Public Health Advisory' | 'National Guidelines' | 'Platform Notice';
  date: string;
  summary: string;
  officialUrl?: string;
  isOfficialExternal: boolean;
}

const NOTICES: NoticeItem[] = [
  {
    id: 'notice-1',
    title: 'National Standards for Blood Transfusion Services & Donor Selection Guidelines',
    source: 'National Blood Transfusion Council (NBTC) / MoHFW',
    category: 'National Guidelines',
    date: '2026-08-15',
    summary:
      'Official regulatory guidelines specifying voluntary donor eligibility, screening intervals, laboratory crossmatching criteria, and component separation protocols across India.',
    officialUrl: 'https://nhm.gov.in/maa/index1.php?lang=1&level=2&lid=498&sublinkid=1214',
    isOfficialExternal: true,
  },
  {
    id: 'notice-2',
    title: 'Voluntary Blood Donation Drive Calendar for Maharashtra Districts',
    source: 'State Blood Transfusion Council (SBTC) Maharashtra',
    category: 'Public Health Advisory',
    date: '2026-09-01',
    summary:
      'State council advisory urging registered community groups and hospitals to expand voluntary non-remunerated donation camps across Pune, Mumbai, Nagpur, and Nashik districts.',
    officialUrl: 'https://nhm.gov.in/',
    isOfficialExternal: true,
  },
  {
    id: 'notice-3',
    title: 'RaktaSetu Prototype Launch: Mutual Privacy & Consent Management Architecture',
    source: 'RaktaSetu Platform Group',
    category: 'Platform Notice',
    date: '2026-10-21',
    summary:
      'Implementation of strict server-side phone number protection, preventing public exposure of donor contact details prior to verified invitation acceptance.',
    isOfficialExternal: false,
  },
  {
    id: 'notice-4',
    title: 'Thalassemia Day Awareness: Regular Voluntary Transfusion Support Initiative',
    source: 'National Health Mission Blood Safety Cell',
    category: 'Public Health Advisory',
    date: '2026-05-08',
    summary:
      'Public awareness announcement highlighting the critical need for scheduled recurring red blood cell support for pediatric thalassemia major patients.',
    officialUrl: 'https://nhm.gov.in/',
    isOfficialExternal: true,
  },
];

export default function NotificationsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  const categories = ['All', 'Public Health Advisory', 'National Guidelines', 'Platform Notice'];

  const filteredNotices = NOTICES.filter((item) => {
    if (selectedCategory !== 'All' && item.category !== selectedCategory) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match =
        item.title.toLowerCase().includes(q) ||
        item.source.toLowerCase().includes(q) ||
        item.summary.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  }).sort((a, b) => {
    const diff = new Date(b.date).getTime() - new Date(a.date).getTime();
    return sortOrder === 'desc' ? diff : -diff;
  });

  return (
    <div className="flex-1 bg-slate-50 min-h-screen">
      {/* Header */}
      <section className="bg-white border-b border-slate-200 py-10 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="max-w-2xl mb-6">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100/80 text-[#B91C32] text-xs font-bold uppercase tracking-wider mb-2">
              <span>Public Information &amp; Updates</span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Notifications &amp; Announcements
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 mt-1 leading-relaxed">
              Curated official public health advisories, national transfusion standards, and RaktaSetu
              platform release notes.
            </p>
          </div>

          {/* Prototype Attribution Disclaimer */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-start gap-2.5 mb-6">
            <span className="font-bold text-slate-800 shrink-0">Source Attribution:</span>
            <span>
              Official public notices link directly to the National Health Mission (NHM) and National Blood
              Transfusion Council (NBTC) online portals. RaktaSetu does not alter official circular texts.
            </span>
          </div>

          {/* Filters & Search */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-4 border-t border-slate-100">
            <div className="flex items-center gap-1.5 flex-wrap">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    selectedCategory === cat
                      ? 'bg-[#B91C32] text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search notices..."
                className="bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#B91C32] w-48 sm:w-60"
              />

              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as any)}
                className="bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#B91C32]"
              >
                <option value="desc">Latest first</option>
                <option value="asc">Oldest first</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* Notices Feed */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="text-xs text-slate-500 mb-4">
          Showing <strong>{filteredNotices.length}</strong> announcements
        </div>

        {filteredNotices.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-xs">
            <p className="text-base font-bold text-slate-900 mb-1">No announcements found</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
              Try adjusting your search terms or selecting a different category.
            </p>
            <button
              type="button"
              onClick={() => {
                setSelectedCategory('All');
                setSearchQuery('');
              }}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredNotices.map((notice) => (
              <div
                key={notice.id}
                className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs hover:border-slate-300 transition-all flex flex-col md:flex-row md:items-start justify-between gap-4"
              >
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap">
                    <span className="font-bold text-[#B91C32] bg-red-50 px-2.5 py-0.5 rounded-full text-[11px] uppercase tracking-wider">
                      {notice.category}
                    </span>
                    <span>•</span>
                    <span className="font-medium text-slate-700">{notice.source}</span>
                    <span>•</span>
                    <span>{notice.date}</span>
                  </div>

                  <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
                    {notice.title}
                  </h3>

                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                    {notice.summary}
                  </p>
                </div>

                <div className="shrink-0 pt-2 md:pt-0">
                  {notice.officialUrl ? (
                    <a
                      href={notice.officialUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 rounded-xl border border-slate-300 hover:border-[#B91C32] hover:text-[#B91C32] text-slate-700 text-xs font-bold transition-all inline-flex items-center gap-1.5"
                    >
                      <span>View Official Portal</span>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  ) : (
                    <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-xl inline-block">
                      Platform Release Note
                    </span>
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
