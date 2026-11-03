import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Accessibility Statement — RaktaSetu',
  description:
    'Our commitment to accessible digital design, keyboard navigation, high contrast, and inclusive healthcare access.',
};

export default function AccessibilityPage() {
  return (
    <div className="flex-1 bg-white text-slate-900">
      <div className="border-b border-slate-200 bg-slate-50/70 py-4 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto flex items-center gap-2 text-xs text-slate-500 font-medium">
          <Link href="/" className="hover:text-[#B91C32] transition-colors">
            Home
          </Link>
          <span>/</span>
          <span className="text-slate-800 font-semibold">Accessibility Statement</span>
        </div>
      </div>

      <article className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        <header className="mb-8 pb-6 border-b border-slate-200">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-bold uppercase tracking-wider mb-3">
            <span>Universal Design</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mb-2">
            Accessibility Statement
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Last Updated: 21 October 2026 • Commitment to Inclusive Emergency Health Coordination
          </p>
        </header>

        <div className="space-y-8 text-xs sm:text-sm text-slate-700 leading-relaxed">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 mb-2">
              Our Accessibility Commitment
            </h2>
            <p>
              RaktaSetu believes that access to critical blood coordination tools must be accessible to everyone,
              including individuals with visual, motor, auditory, or cognitive disabilities, as well as users on
              low-bandwidth mobile networks.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <h3 className="font-bold text-slate-900 text-sm">Keyboard Navigation</h3>
              <p className="text-slate-600">
                All navigation menus, dropdowns, and form buttons are operable via standard keyboard controls
                (Tab, Enter, Space, and Escape keys) with visible focus indicators.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <h3 className="font-bold text-slate-900 text-sm">Semantic Structure</h3>
              <p className="text-slate-600">
                Pages use semantic HTML5 elements (`header`, `nav`, `main`, `footer`, `section`, `article`) and
                accurate heading hierarchies for screen readers.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <h3 className="font-bold text-slate-900 text-sm">High Contrast &amp; Typography</h3>
              <p className="text-slate-600">
                Text colours maintain high contrast against crisp white and light neutral backgrounds. Status
                badges pair colour indicators with explicit textual descriptions.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <h3 className="font-bold text-slate-900 text-sm">Responsive Mobile Experience</h3>
              <p className="text-slate-600">
                Layouts adapt fluidly from narrow mobile touchscreens to wide desktop monitors, ensuring large
                touch targets (minimum 44x44px).
              </p>
            </div>
          </div>

          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 mb-2">
              Reporting Accessibility Barriers
            </h2>
            <p>
              We welcome feedback on the accessibility of the RaktaSetu platform. If you encounter barriers while
              navigating, please let us know via our{' '}
              <Link href="/contact" className="text-[#B91C32] font-semibold hover:underline">
                Contact &amp; Feedback desk
              </Link>
              .
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500">
            <strong>Compliance Note:</strong> While we continuously test against Web Content Accessibility
            Guidelines (WCAG 2.1 Level AA) principles, formal external third-party certification has not yet been
            conducted as RaktaSetu is an active research prototype.
          </div>
        </div>
      </article>
    </div>
  );
}
