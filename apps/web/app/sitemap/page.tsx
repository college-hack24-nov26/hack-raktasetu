import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sitemap — RaktaSetu',
  description:
    'Complete directory of accessible routes, patient coordination workflows, and volunteer donor portals on RaktaSetu.',
};

interface SitemapGroup {
  title: string;
  description: string;
  links: {
    label: string;
    href: string;
    status: 'Live' | 'Coming Soon' | 'Portal';
    description?: string;
  }[];
}

const SITEMAP_GROUPS: SitemapGroup[] = [
  {
    title: 'Blood Discovery & Directory',
    description: 'Explore live hospital stock, search registered blood centres, and view interactive maps.',
    links: [
      { label: 'Home Page', href: '/', status: 'Live', description: 'Platform overview, quick check & hero discovery' },
      { label: 'Find Blood Now', href: '/find-blood', status: 'Live', description: 'Real-time stock query across components' },
      { label: 'Blood Bank Directory', href: '/directory', status: 'Live', description: 'District hospital centre listing and Mapbox map' },
      { label: 'Thalassemia Care', href: '#', status: 'Coming Soon', description: 'Scheduled recurring patient transfusion support' },
    ],
  },
  {
    title: 'Voluntary Donors & Community Drives',
    description: 'Donor registration, eligibility guidelines, and community blood collection camps.',
    links: [
      { label: 'Register as Donor', href: '/donor-registration', status: 'Live', description: 'Create voluntary profile and grant consent' },
      { label: 'About Donating Blood', href: '/about-donating', status: 'Live', description: 'Benefits, eligibility rules, and compatibility table' },
      { label: 'Donation Guide (/donate)', href: '/donate', status: 'Live', description: 'Quick access alias to donation guidelines' },
      { label: 'Find a Camp', href: '/camps', status: 'Live', description: 'Upcoming community blood collection schedules' },
      { label: 'Interactive Eligibility Screener', href: '/#eligibility-check', status: 'Live', description: '9-question pre-donation screener' },
    ],
  },
  {
    title: 'Patient Coordination & Dashboards',
    description: 'Create requests, manage selective invitations, and coordinate directly with accepted donors.',
    links: [
      { label: 'Create Blood Request', href: '/requests/new', status: 'Live', description: 'Specify component, units, urgency, and admitted hospital' },
      { label: 'My Blood Requests', href: '/requests', status: 'Live', description: 'Review matching candidates, send invitations, and manage closures' },
      { label: 'Donor Portal', href: '/donor-dashboard', status: 'Live', description: 'Incoming invitations, accept/decline actions, and contact exchange' },
      { label: 'User Profile & Consent', href: '/profile', status: 'Live', description: 'Manage availability, location, and verified contact badge' },
      { label: 'Sign In / Register', href: '/login', status: 'Live', description: 'Phone verification with demo OTP 123456' },
    ],
  },
  {
    title: 'Organisation & Blood Centres',
    description: 'Institutional onboarding, hospital directory verification, and camp registration.',
    links: [
      { label: 'Organisation Login', href: '/organisation/login', status: 'Portal', description: 'Verified blood bank administrator sign-in' },
      { label: 'Register a Blood Bank', href: '/organisation/register-bank', status: 'Portal', description: 'Hospital centre onboarding interest application' },
      { label: 'Register a Camp', href: '/organisation/register-camp', status: 'Portal', description: 'Community organization drive submission form' },
    ],
  },
  {
    title: 'Knowledge, Support & Transparency',
    description: 'Educational articles, FAQs, regulatory notices, and technical feedback channels.',
    links: [
      { label: 'Stories & Awareness', href: '/blog', status: 'Live', description: 'Educational articles on transfusion science and safety' },
      { label: 'Frequently Asked Questions', href: '/faqs', status: 'Live', description: 'Answers regarding privacy, eRaktKosh feeds, and eligibility' },
      { label: 'Notifications & Advisories', href: '/notifications', status: 'Live', description: 'Curated official NHM circulars and release notes' },
      { label: 'About Us', href: '/about', status: 'Live', description: 'Platform mission, architectural boundaries, and principles' },
      { label: 'Contact & Feedback', href: '/contact', status: 'Live', description: 'Send technical bug reports or platform suggestions' },
    ],
  },
  {
    title: 'Legal & Compliance',
    description: 'Prototype governance, terms of service, and accessibility commitments.',
    links: [
      { label: 'Terms & Conditions', href: '/terms', status: 'Live', description: 'Permitted non-commercial use and medical disclaimers' },
      { label: 'Privacy Policy', href: '/privacy', status: 'Live', description: 'Mutual consent protocols and E.164 phone number protection' },
      { label: 'Accessibility Statement', href: '/accessibility', status: 'Live', description: 'Keyboard navigation, semantic structure, and WCAG goals' },
      { label: 'Sitemap', href: '/sitemap', status: 'Live', description: 'Visual directory of all accessible platform destinations' },
    ],
  },
];

export default function SitemapPage() {
  return (
    <div className="flex-1 bg-slate-50 min-h-screen">
      <div className="bg-white border-b border-slate-200 py-10 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100/80 text-[#B91C32] text-xs font-bold uppercase tracking-wider mb-2">
            <span>Website Architecture</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            RaktaSetu Sitemap
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-xl leading-relaxed">
            A comprehensive, human-readable overview of all public pages, patient coordination workflows, and
            volunteer donor tools implemented on RaktaSetu.
          </p>
        </div>
      </div>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {SITEMAP_GROUPS.map((group) => (
            <div
              key={group.title}
              className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-7 shadow-xs flex flex-col justify-between"
            >
              <div>
                <h2 className="text-lg font-bold text-slate-900 mb-1">{group.title}</h2>
                <p className="text-xs text-slate-500 mb-5 leading-relaxed">{group.description}</p>

                <ul className="space-y-3.5">
                  {group.links.map((link) => (
                    <li key={link.label} className="text-xs border-b border-slate-100 pb-3 last:border-b-0 last:pb-0">
                      <div className="flex items-center justify-between gap-2">
                        {link.status === 'Coming Soon' ? (
                          <span className="font-semibold text-slate-400">{link.label}</span>
                        ) : (
                          <Link
                            href={link.href}
                            className="font-bold text-slate-900 hover:text-[#B91C32] transition-colors"
                          >
                            {link.label}
                          </Link>
                        )}

                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                            link.status === 'Live'
                              ? 'bg-emerald-50 text-emerald-700'
                              : link.status === 'Portal'
                              ? 'bg-blue-50 text-blue-700'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {link.status}
                        </span>
                      </div>
                      {link.description && (
                        <p className="text-[11px] text-slate-500 mt-1 leading-normal">
                          {link.description}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
