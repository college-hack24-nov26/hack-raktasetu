'use client';

import { useState } from 'react';
import Link from 'next/link';

interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category: string;
}

const FAQ_DATA: FAQItem[] = [
  // Group 1: Blood donation and eligibility
  {
    id: 'faq-1',
    category: 'Blood donation & eligibility',
    question: 'Who is eligible to donate blood under Indian transfusion guidelines?',
    answer:
      'Standard voluntary blood donors in India must be between 18 and 65 years old, weigh at least 45 kg (50 kg for 450 ml collection), maintain a minimum haemoglobin of 12.5 g/dL, and be in good general health with normal vital signs. Final clinical eligibility is confirmed on-site by medical officers.',
  },
  {
    id: 'faq-2',
    category: 'Blood donation & eligibility',
    question: 'How often can an individual donate blood?',
    answer:
      'For standard whole blood donation, adult males can donate every 90 days (3 months), and adult females can donate every 120 days (4 months). Shorter intervals apply for apheresis platelet donations. RaktaSetu enforces this interval strictly using verified donation records.',
  },
  {
    id: 'faq-3',
    category: 'Blood donation & eligibility',
    question: 'Can I donate if I am currently taking medication or got a tattoo?',
    answer:
      'Certain medications (such as active antibiotics or blood thinners) require a deferral period. Furthermore, receiving a tattoo, skin piercing, or acupuncture requires a standard 6–12 month waiting period under national regulatory guidelines to safeguard blood safety.',
  },

  // Group 2: Finding a blood bank
  {
    id: 'faq-4',
    category: 'Finding a blood bank',
    question: 'Where does RaktaSetu obtain hospital and blood centre stock numbers?',
    answer:
      'RaktaSetu integrates directly with the live e-RaktKosh national blood bank portal API and maintains snapshot caches for registered Maharashtra blood centres. Each stock entry indicates whether it is freshly verified or snapshot data.',
  },
  {
    id: 'faq-5',
    category: 'Finding a blood bank',
    question: 'Does listing available blood units guarantee the centre will reserve them?',
    answer:
      'No. RaktaSetu is an informational discovery prototype. Blood inventory changes rapidly due to ongoing emergency surgeries. Users must call the blood bank directly using the telephone number provided to verify and arrange crossmatching before traveling.',
  },

  // Group 3: Patient requests
  {
    id: 'faq-6',
    category: 'Patient requests',
    question: 'How do I create a blood request on RaktaSetu?',
    answer:
      'Registered patients or their families can visit "Find Blood Now" or "Create Request", specify the required blood group, component (PRBC, Whole Blood, Platelets, FFP), unit quantity, urgency, admitting hospital, and contact details.',
  },
  {
    id: 'faq-7',
    category: 'Patient requests',
    question: 'Does creating a request broadcast my details to everyone in the city?',
    answer:
      'No. RaktaSetu strictly forbids unsolicited mass broadcasting. When a request is created, matching nearby donors are presented to the patient in private cards, and the patient manually selects specific donors to invite.',
  },

  // Group 4: Donor invitations and responses
  {
    id: 'faq-8',
    category: 'Donor invitations & responses',
    question: 'How do donors know when someone nearby needs their blood type?',
    answer:
      'Invited donors receive direct notifications and see the invitation in their "Donor Portal". Each invitation shows the hospital, required blood group, units, and urgency so the donor can decide whether they can attend.',
  },
  {
    id: 'faq-9',
    category: 'Donor invitations & responses',
    question: 'What happens if a donor accepts or declines?',
    answer:
      'When a donor clicks Accept, mutual contact details are securely unlocked for direct coordination. If a donor declines, the patient is notified immediately so they can invite other available donors.',
  },

  // Group 5: Contact privacy and consent
  {
    id: 'faq-10',
    category: 'Contact privacy & consent',
    question: 'Is my phone number publicly visible in donor search lists?',
    answer:
      'Never. RaktaSetu enforces strict backend privacy. Donor telephone numbers are stripped from discovery lists and search APIs. Phone numbers are revealed only after a donor independently accepts a specific request.',
  },
  {
    id: 'faq-11',
    category: 'Contact privacy & consent',
    question: 'Can I withdraw my consent or pause my availability?',
    answer:
      'Yes. In your User Profile, you can toggle your donor availability or withdraw search consent at any time. When paused, you will not appear in donor matching results or receive new invitations.',
  },

  // Group 6: Accounts and profile
  {
    id: 'faq-12',
    category: 'Accounts & profile',
    question: 'How do I sign in or change my registered phone number?',
    answer:
      'Authentication is handled securely with mobile phone verification and OTP. Phone number modifications require re-verification to prevent unauthorized account takeovers or unverified identities.',
  },

  // Group 7: Data freshness and project limitations
  {
    id: 'faq-13',
    category: 'Data freshness & limitations',
    question: 'What is the distinction between a reported donation and a verified donation?',
    answer:
      'When a patient closes a request indicating blood was received, it is recorded as "Reported (Unverified)". This acknowledges the patient\'s feedback without locking the donor\'s eligibility. Official medical deferral occurs only when verified by clinical blood bank personnel.',
  },
  {
    id: 'faq-14',
    category: 'Data freshness & limitations',
    question: 'Is RaktaSetu an official government application?',
    answer:
      'RaktaSetu is an independent academic and open-source prototype designed to demonstrate privacy-first patient-to-donor coordination. While it integrates with public e-RaktKosh data, it is not an official government portal.',
  },
];

export default function FAQsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [openFaqId, setOpenFaqId] = useState<string | null>('faq-1');

  const categories = [
    'All',
    'Blood donation & eligibility',
    'Finding a blood bank',
    'Patient requests',
    'Donor invitations & responses',
    'Contact privacy & consent',
    'Accounts & profile',
    'Data freshness & limitations',
  ];

  const filteredFaqs = FAQ_DATA.filter((faq) => {
    if (selectedCategory !== 'All' && faq.category !== selectedCategory) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match =
        faq.question.toLowerCase().includes(q) ||
        faq.answer.toLowerCase().includes(q) ||
        faq.category.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  const toggleAccordion = (id: string) => {
    setOpenFaqId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="flex-1 bg-slate-50 min-h-screen">
      {/* Page Header */}
      <section className="bg-white border-b border-slate-200 py-10 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-8">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100/80 text-[#B91C32] text-xs font-bold uppercase tracking-wider mb-2">
              <span>Help &amp; Answers</span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Frequently Asked Questions
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 mt-2 leading-relaxed">
              Find answers regarding blood bank search, volunteer donor coordination, privacy guarantees, and
              clinical eligibility criteria.
            </p>
          </div>

          {/* Search Box */}
          <div className="relative max-w-xl mx-auto mb-6">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by topic, e.g. eligibility, privacy, eRaktKosh..."
              className="w-full bg-slate-50 border border-slate-300 rounded-2xl px-4 py-3 text-xs sm:text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#B91C32] focus:bg-white shadow-2xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-600 text-xs"
              >
                ✕ Clear
              </button>
            )}
          </div>

          {/* Category Tabs */}
          <div className="flex items-center justify-center gap-1.5 flex-wrap pt-2 border-t border-slate-100">
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
        </div>
      </section>

      {/* Accordion List */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
        <div className="text-xs text-slate-500 mb-4">
          Showing <strong>{filteredFaqs.length}</strong> questions
        </div>

        {filteredFaqs.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-xs">
            <p className="text-base font-bold text-slate-900 mb-1">No matching questions</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
              We couldn&apos;t find an answer matching your query. Feel free to contact our support desk or
              consult your local hospital blood bank.
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
          <div className="space-y-3">
            {filteredFaqs.map((faq) => {
              const isOpen = openFaqId === faq.id;

              return (
                <div
                  key={faq.id}
                  className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs transition-all"
                >
                  <button
                    type="button"
                    onClick={() => toggleAccordion(faq.id)}
                    aria-expanded={isOpen}
                    className="w-full flex items-center justify-between p-5 text-left font-bold text-slate-900 hover:bg-slate-50/80 transition-colors cursor-pointer gap-4"
                  >
                    <div>
                      <span className="block text-[11px] font-semibold text-[#B91C32] uppercase tracking-wider mb-1">
                        {faq.category}
                      </span>
                      <span className="text-sm sm:text-base leading-snug">{faq.question}</span>
                    </div>

                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-transform ${
                        isOpen ? 'rotate-180 bg-red-100 text-[#B91C32]' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-5 pb-5 pt-1 text-xs sm:text-sm text-slate-600 leading-relaxed border-t border-slate-100 bg-slate-50/40">
                      <p>{faq.answer}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Contact CTA */}
        <div className="mt-12 p-6 rounded-2xl bg-white border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Still have questions?</h3>
            <p className="text-xs text-slate-600 mt-0.5">
              Reach out to our team or browse our comprehensive donation guide.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/contact"
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-colors"
            >
              Contact Support
            </Link>
            <Link
              href="/about-donating"
              className="px-4 py-2 rounded-xl bg-[#B91C32] hover:bg-[#9B1324] text-white text-xs font-bold transition-colors shadow-xs"
            >
              About Donating
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
