'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ARTICLES, Article } from './articles';

export default function BlogIndexPage() {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest'>('newest');

  const categories = ['All', 'Awareness', 'Donation Guidance', 'Project Updates'];

  const filteredArticles = ARTICLES.filter((article) => {
    if (selectedCategory !== 'All' && article.category !== selectedCategory) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match =
        article.title.toLowerCase().includes(q) ||
        article.summary.toLowerCase().includes(q) ||
        article.content.some((para) => para.toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  }).sort((a, b) => {
    if (sortBy === 'newest') {
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    }
    return new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime();
  });

  return (
    <div className="flex-1 bg-slate-50 min-h-screen">
      {/* Header */}
      <section className="bg-white border-b border-slate-200 py-10 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-2xl mb-6">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100/80 text-[#B91C32] text-xs font-bold uppercase tracking-wider mb-2">
              <span>Knowledge &amp; Community</span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Stories &amp; Awareness
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 mt-1 leading-relaxed">
              Educational guides on voluntary blood donation, patient coordination, clinical safety, and
              updates from the RaktaSetu prototype platform.
            </p>
          </div>

          {/* Search, Categories & Sort Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-4 border-t border-slate-100">
            {/* Categories */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    selectedCategory === cat
                      ? 'bg-[#B91C32] text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Search & Sort */}
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search articles..."
                className="bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#B91C32] w-48 sm:w-60"
              />

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#B91C32]"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* Articles Grid */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="text-xs text-slate-500 mb-4">
          Showing <strong>{filteredArticles.length}</strong> articles
        </div>

        {filteredArticles.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-xs">
            <p className="text-base font-bold text-slate-900 mb-1">No articles found</p>
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredArticles.map((article) => (
              <article
                key={article.slug}
                className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-7 shadow-xs hover:border-slate-300 hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-3">
                    <span className="font-bold text-[#B91C32] bg-red-50 px-2.5 py-0.5 rounded-full text-[11px] uppercase tracking-wider">
                      {article.category}
                    </span>
                    <span>{article.readTime}</span>
                  </div>

                  <h2 className="text-lg sm:text-xl font-bold text-slate-900 mb-2 leading-snug">
                    <Link
                      href={`/blog/${article.slug}`}
                      className="hover:text-[#B91C32] transition-colors"
                    >
                      {article.title}
                    </Link>
                  </h2>

                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed mb-4">
                    {article.summary}
                  </p>
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-slate-500">{article.publishedAt}</span>
                  <Link
                    href={`/blog/${article.slug}`}
                    className="font-bold text-[#B91C32] hover:text-[#9B1324] inline-flex items-center gap-1"
                  >
                    <span>Read Article</span>
                    <span>→</span>
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
