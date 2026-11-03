import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { ARTICLES } from '../articles';

interface Props {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return ARTICLES.map((article) => ({
    slug: article.slug,
  }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = ARTICLES.find((a) => a.slug === slug);
  if (!article) return { title: 'Article Not Found — RaktaSetu' };

  return {
    title: `${article.title} — RaktaSetu`,
    description: article.summary,
  };
}

export default async function ArticleDetailPage({ params }: Props) {
  const { slug } = await params;
  const article = ARTICLES.find((a) => a.slug === slug);

  if (!article) {
    notFound();
  }

  return (
    <div className="flex-1 bg-white text-slate-900">
      {/* Breadcrumb Header */}
      <div className="border-b border-slate-200 bg-slate-50/70 py-4 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto flex items-center gap-2 text-xs text-slate-500 font-medium">
          <Link href="/" className="hover:text-[#B91C32] transition-colors">
            Home
          </Link>
          <span>/</span>
          <Link href="/blog" className="hover:text-[#B91C32] transition-colors">
            Stories &amp; Awareness
          </Link>
          <span>/</span>
          <span className="text-slate-800 font-semibold truncate max-w-[200px] sm:max-w-md">
            {article.title}
          </span>
        </div>
      </div>

      {/* Main Article Container */}
      <article className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        {/* Article Header */}
        <header className="mb-10 pb-8 border-b border-slate-200">
          <div className="flex items-center gap-2.5 text-xs text-slate-500 mb-4">
            <span className="font-bold text-[#B91C32] bg-red-100/80 px-3 py-1 rounded-full uppercase tracking-wider text-[11px]">
              {article.category}
            </span>
            <span>•</span>
            <span>{article.publishedAt}</span>
            <span>•</span>
            <span>{article.readTime}</span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight mb-4">
            {article.title}
          </h1>

          <p className="text-base sm:text-lg text-slate-600 leading-relaxed font-medium">
            {article.summary}
          </p>

          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>By {article.author}</span>
            {article.sourceAttribution && <span>Source: {article.sourceAttribution}</span>}
          </div>
        </header>

        {/* Content Paragraphs */}
        <div className="prose prose-slate max-w-none space-y-6 text-sm sm:text-base leading-relaxed text-slate-700">
          {article.content.map((paragraph, idx) => (
            <p key={idx} className="leading-relaxed">
              {paragraph}
            </p>
          ))}
        </div>

        {/* Medical & Source Disclaimer Note */}
        {article.disclaimer && (
          <div className="mt-12 p-5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1.5">
            <div className="font-bold text-slate-800 flex items-center gap-1.5">
              <span>⚠️ Health Notice &amp; Educational Advisory</span>
            </div>
            <p className="text-slate-500 leading-relaxed">{article.disclaimer}</p>
          </div>
        )}

        {/* Action Bar */}
        <div className="mt-10 pt-8 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link
            href="/blog"
            className="text-xs font-bold text-[#B91C32] hover:underline inline-flex items-center gap-1"
          >
            <span>← Back to all articles</span>
          </Link>

          <div className="flex items-center gap-3">
            <Link
              href="/donor-registration"
              className="px-5 py-2.5 rounded-xl bg-[#B91C32] hover:bg-[#9B1324] text-white text-xs font-bold transition-all shadow-xs"
            >
              Register as Donor
            </Link>
            <Link
              href="/find-blood"
              className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-all"
            >
              Find Blood Banks
            </Link>
          </div>
        </div>
      </article>
    </div>
  );
}
