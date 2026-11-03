import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'About Donating Blood — RaktaSetu',
  description:
    'Learn why blood donation matters, who is eligible, how the process works, and red cell compatibility guidelines.',
};

export default function AboutDonatingPage() {
  return (
    <div className="flex-1 w-full bg-white text-slate-900">
      {/* Hero / Header Breadcrumb */}
      <div className="border-b border-slate-200 bg-slate-50/70 py-4">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <nav className="flex items-center gap-2 text-xs text-slate-500 font-medium">
            <Link href="/" className="hover:text-[#B91C32] transition-colors">
              Home
            </Link>
            <span>/</span>
            <span className="text-slate-800 font-semibold">About Donating</span>
          </nav>
        </div>
      </div>

      {/* Section A: About Donating */}
      <section className="py-14 sm:py-20 border-b border-slate-100 bg-gradient-to-b from-white via-slate-50/40 to-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="max-w-3xl mb-12 sm:mb-16">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100/80 border border-red-200 text-[#B91C32] text-xs font-bold uppercase tracking-wider mb-4">
              <span>Why donate</span>
            </div>
            <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight mb-5">
              One donation, several lives
            </h1>
            <p className="text-base sm:text-lg text-slate-600 leading-relaxed">
              Blood can&apos;t be manufactured — every unit on the shelf came from someone who donated.
              Patients with thalassemia and haemophilia, accident and surgery cases, and new mothers all
              depend on it being there.
            </p>
          </div>

          {/* Three Statistic Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 mb-8">
            {/* Card 1 */}
            <div className="bg-white rounded-2xl border border-slate-200 p-7 shadow-xs hover:border-red-200 hover:shadow-md transition-all">
              <div className="text-4xl sm:text-5xl font-extrabold text-[#B91C32] tracking-tight mb-3">
                Up to 3
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-2">
                lives helped by a single donation
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                A single whole blood collection is processed into packed red cells, platelets, and plasma,
                supporting multiple clinical treatments.
              </p>
            </div>

            {/* Card 2 */}
            <div className="bg-white rounded-2xl border border-slate-200 p-7 shadow-xs hover:border-red-200 hover:shadow-md transition-all">
              <div className="text-4xl sm:text-5xl font-extrabold text-[#B91C32] tracking-tight mb-3">
                88%
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-2">
                lower heart-attack risk for regular donors*
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Observational studies suggest periodic donation helps regulate excessive arterial iron levels
                and reduces blood viscosity.
              </p>
            </div>

            {/* Card 3 */}
            <div className="bg-white rounded-2xl border border-slate-200 p-7 shadow-xs hover:border-red-200 hover:shadow-md transition-all">
              <div className="text-4xl sm:text-5xl font-extrabold text-[#B91C32] tracking-tight mb-3">
                Every 3 months
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-2">
                how often you can donate again*
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Standard recovery interval for red blood cells in healthy adult males. The interval varies by
                gender and donation component.
              </p>
            </div>
          </div>

          {/* Source Note & Attribution / Medical Disclaimer */}
          <div className="p-4 sm:p-5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 leading-relaxed space-y-2">
            <p className="font-medium text-slate-800">
              Source attribution: &ldquo;Health-benefit figures per eRaktKosh, Ministry of Health &amp;
              Family Welfare.&rdquo;
            </p>
            <p className="text-slate-500">
              <strong>Medical Disclaimer &amp; Verification Note:</strong> The 88% cardiovascular risk
              reduction figure is cited from observational public-health literature. It should not be
              interpreted as personalized clinical or preventive medical advice and is flagged for formal
              institutional clinical review prior to public release. Donation intervals depend strictly on
              the donation type (e.g., 90 days for whole blood in males, 120 days for females, or shorter
              intervals for apheresis platelets/plasma) and individual clinical evaluation.
            </p>
          </div>
        </div>
      </section>

      {/* Section B: Are you eligible? */}
      <section className="py-14 sm:py-20 bg-slate-50/60 border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="max-w-2xl mb-12">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-200/80 text-slate-700 text-xs font-bold uppercase tracking-wider mb-4">
              <span>Who can donate</span>
            </div>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mb-4">
              Are you eligible?
            </h2>
            <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
              Most healthy adults can give blood. Here are the four primary baseline criteria you should
              review before visiting a donation centre.
            </p>
          </div>

          {/* Four Criteria Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
            {/* 1. Body Weight */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs hover:shadow-md transition-all">
              <div className="w-12 h-12 rounded-xl bg-red-50 text-[#B91C32] flex items-center justify-center font-bold mb-4">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">At least 45 kg</h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                The minimum body weight for a safe donation (50 kg required for a 450 ml collection).
              </p>
            </div>

            {/* 2. Age Range */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs hover:shadow-md transition-all">
              <div className="w-12 h-12 rounded-xl bg-red-50 text-[#B91C32] flex items-center justify-center font-bold mb-4">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">18 to 65 years old</h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                The eligible age range for donors under standard national blood transfusion guidelines.
              </p>
            </div>

            {/* 3. General Health */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs hover:shadow-md transition-all">
              <div className="w-12 h-12 rounded-xl bg-red-50 text-[#B91C32] flex items-center justify-center font-bold mb-4">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Generally healthy</h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Feeling well on donation day, with no fever, cold, cough, infection, or acute fatigue.
              </p>
            </div>

            {/* 4. Health Concerns */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs hover:shadow-md transition-all">
              <div className="w-12 h-12 rounded-xl bg-red-50 text-[#B91C32] flex items-center justify-center font-bold mb-4">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Flag any health concerns</h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Medication, recent surgery, or anything else — the blood bank will confirm you&apos;re clear to
                donate.
              </p>
            </div>
          </div>

          {/* CTA & Clinical Note */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 rounded-2xl bg-white border border-slate-200">
            <div>
              <p className="text-sm font-bold text-slate-900">Want to check your specific eligibility?</p>
              <p className="text-xs text-slate-600">
                Answer our 9-question interactive screener to see if any temporary waiting period applies.
              </p>
            </div>
            <Link
              href="/#eligibility-check"
              className="px-6 py-3 rounded-xl bg-[#B91C32] hover:bg-[#9B1324] text-white font-bold text-xs sm:text-sm transition-all shadow-xs flex items-center gap-2 shrink-0 cursor-pointer"
            >
              <span>Run the full eligibility check</span>
              <span>→</span>
            </Link>
          </div>

          <p className="mt-4 text-xs text-slate-500 text-center sm:text-left">
            *General guidelines only. Final clinical eligibility is determined exclusively on-site by
            qualified blood-bank medical staff.
          </p>
        </div>
      </section>

      {/* Section C: How Donation Works */}
      <section className="py-14 sm:py-20 bg-white border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="max-w-2xl mb-12 sm:mb-16">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100/80 text-[#B91C32] text-xs font-bold uppercase tracking-wider mb-4">
              <span>For donors</span>
            </div>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mb-4">
              How Donation Works
            </h2>
            <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
              Donating blood is simple, safe, and takes under an hour from start to finish. Here is what to
              expect step by step.
            </p>
          </div>

          {/* Four Steps */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 sm:gap-8">
            {/* Step 1 */}
            <div className="relative bg-slate-50/70 rounded-2xl border border-slate-200 p-6 flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 rounded-xl bg-[#B91C32] text-white flex items-center justify-center font-extrabold text-sm mb-4 shadow-xs">
                  1
                </div>
                <h3 className="text-base font-bold text-slate-900 mb-2">Registration</h3>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  Sign up and share your blood group and basic details. Valid photo identification is verified
                  at the reception.
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="relative bg-slate-50/70 rounded-2xl border border-slate-200 p-6 flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 rounded-xl bg-[#B91C32] text-white flex items-center justify-center font-extrabold text-sm mb-4 shadow-xs">
                  2
                </div>
                <h3 className="text-base font-bold text-slate-900 mb-2">Health Screening</h3>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  A short health questionnaire, plus a quick pulse, blood pressure, and haemoglobin check
                  (minimum 12.5 g/dL).
                </p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="relative bg-slate-50/70 rounded-2xl border border-slate-200 p-6 flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 rounded-xl bg-[#B91C32] text-white flex items-center justify-center font-extrabold text-sm mb-4 shadow-xs">
                  3
                </div>
                <h3 className="text-base font-bold text-slate-900 mb-2">Donation Day</h3>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  One unit takes about 6–10 minutes, using a fresh, sterile single-use kit. The needle is
                  discarded immediately.
                </p>
              </div>
            </div>

            {/* Step 4 */}
            <div className="relative bg-slate-50/70 rounded-2xl border border-slate-200 p-6 flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 rounded-xl bg-[#B91C32] text-white flex items-center justify-center font-extrabold text-sm mb-4 shadow-xs">
                  4
                </div>
                <h3 className="text-base font-bold text-slate-900 mb-2">Aftercare</h3>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  Rest with a refreshment, skip heavy lifting for approximately 5 hours, and drink plenty of
                  fluids for the next day.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section D: Blood type compatibility */}
      <section className="py-14 sm:py-20 bg-slate-50/60 border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="max-w-2xl mb-10">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-200/80 text-slate-700 text-xs font-bold uppercase tracking-wider mb-4">
              <span>Know your type</span>
            </div>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mb-4">
              Blood type compatibility
            </h2>
            <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
              Matching compatibility is essential for safe blood transfusions. Here is how standard red blood
              cell donor and recipient pairings align.
            </p>
          </div>

          {/* Responsive Compatibility Table */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs mb-6">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-800 uppercase tracking-wider text-[11px] font-bold">
                    <th scope="col" className="py-3.5 px-4 sm:px-6">
                      Type
                    </th>
                    <th scope="col" className="py-3.5 px-4 sm:px-6">
                      Can donate to
                    </th>
                    <th scope="col" className="py-3.5 px-4 sm:px-6">
                      Can receive from
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3.5 px-4 sm:px-6 font-bold text-[#B91C32] whitespace-nowrap">
                      O+
                    </td>
                    <td className="py-3.5 px-4 sm:px-6 font-medium text-slate-800">
                      O+ &nbsp; A+ &nbsp; B+ &nbsp; AB+
                    </td>
                    <td className="py-3.5 px-4 sm:px-6 text-slate-600">O+ &nbsp; O-</td>
                  </tr>

                  <tr className="hover:bg-slate-50/60 transition-colors bg-red-50/30">
                    <td className="py-3.5 px-4 sm:px-6 font-bold text-[#B91C32] whitespace-nowrap">
                      O-
                    </td>
                    <td className="py-3.5 px-4 sm:px-6 font-semibold text-emerald-700">
                      Everyone <span className="text-[11px] font-normal text-slate-500">(Universal Red Cell Donor)</span>
                    </td>
                    <td className="py-3.5 px-4 sm:px-6 text-slate-600">O-</td>
                  </tr>

                  <tr className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3.5 px-4 sm:px-6 font-bold text-[#B91C32] whitespace-nowrap">
                      A+
                    </td>
                    <td className="py-3.5 px-4 sm:px-6 font-medium text-slate-800">A+ &nbsp; AB+</td>
                    <td className="py-3.5 px-4 sm:px-6 text-slate-600">A+ &nbsp; A- &nbsp; O+ &nbsp; O-</td>
                  </tr>

                  <tr className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3.5 px-4 sm:px-6 font-bold text-[#B91C32] whitespace-nowrap">
                      A-
                    </td>
                    <td className="py-3.5 px-4 sm:px-6 font-medium text-slate-800">
                      A+ &nbsp; A- &nbsp; AB+ &nbsp; AB-
                    </td>
                    <td className="py-3.5 px-4 sm:px-6 text-slate-600">A- &nbsp; O-</td>
                  </tr>

                  <tr className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3.5 px-4 sm:px-6 font-bold text-[#B91C32] whitespace-nowrap">
                      B+
                    </td>
                    <td className="py-3.5 px-4 sm:px-6 font-medium text-slate-800">B+ &nbsp; AB+</td>
                    <td className="py-3.5 px-4 sm:px-6 text-slate-600">B+ &nbsp; B- &nbsp; O+ &nbsp; O-</td>
                  </tr>

                  <tr className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3.5 px-4 sm:px-6 font-bold text-[#B91C32] whitespace-nowrap">
                      B-
                    </td>
                    <td className="py-3.5 px-4 sm:px-6 font-medium text-slate-800">
                      B+ &nbsp; B- &nbsp; AB+ &nbsp; AB-
                    </td>
                    <td className="py-3.5 px-4 sm:px-6 text-slate-600">B- &nbsp; O-</td>
                  </tr>

                  <tr className="hover:bg-slate-50/60 transition-colors bg-red-50/30">
                    <td className="py-3.5 px-4 sm:px-6 font-bold text-[#B91C32] whitespace-nowrap">
                      AB+
                    </td>
                    <td className="py-3.5 px-4 sm:px-6 font-medium text-slate-800">AB+</td>
                    <td className="py-3.5 px-4 sm:px-6 font-semibold text-emerald-700">
                      Everyone <span className="text-[11px] font-normal text-slate-500">(Universal Recipient)</span>
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3.5 px-4 sm:px-6 font-bold text-[#B91C32] whitespace-nowrap">
                      AB-
                    </td>
                    <td className="py-3.5 px-4 sm:px-6 font-medium text-slate-800">AB+ &nbsp; AB-</td>
                    <td className="py-3.5 px-4 sm:px-6 text-slate-600">
                      A- &nbsp; B- &nbsp; AB- &nbsp; O-
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Under Table Disclaimer & Clinical Flag */}
          <div className="p-4 rounded-xl bg-white border border-slate-200 text-xs text-slate-600 leading-relaxed space-y-2">
            <p className="font-medium text-slate-800">
              &ldquo;General guidance only — always consult a doctor or the blood bank&apos;s medical team,
              who will confirm final compatibility based on the patient&apos;s full medical history before any
              transfusion.&rdquo;
            </p>
            <p className="text-slate-500">
              <strong>Clinical Review Flag:</strong> This table reflects standard red blood cell
              compatibility for general educational reference. Actual clinical transfusion compatibility
              differs for plasma (where AB is the universal donor) and platelets, and requires formal
              laboratory crossmatching and antibody screening by qualified hospital transfusion
              specialists.
            </p>
          </div>
        </div>
      </section>

      {/* Section E: Final Call To Action */}
      <section className="py-14 sm:py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="bg-gradient-to-br from-[#B91C32] to-[#8C1425] rounded-3xl p-8 sm:p-12 text-white text-center shadow-xl">
            <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight mb-4">
              Take the first step today
            </h2>
            <p className="text-sm sm:text-base text-red-100 max-w-xl mx-auto leading-relaxed mb-8">
              &ldquo;Not sure if you qualify yet? Run the quick eligibility check on the home page, then come
              back here when you&apos;re ready.&rdquo;
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/donor-registration"
                className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-white text-[#B91C32] hover:bg-red-50 font-bold text-sm transition-all shadow-md cursor-pointer"
              >
                Register as a donor
              </Link>
              <Link
                href="/#eligibility-check"
                className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-red-950/40 hover:bg-red-950/60 text-white border border-red-300/30 font-bold text-sm transition-all cursor-pointer"
              >
                Check eligibility first
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Section F: Frequently Asked Questions (Anchor for Resources Dropdown) */}
      <section id="faq" className="py-14 sm:py-20 bg-slate-50 border-t border-slate-200 scroll-mt-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-200/80 text-slate-700 text-xs font-bold uppercase tracking-wider mb-2">
              <span>Got questions?</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Frequently Asked Questions
            </h2>
          </div>

          <div className="space-y-4">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
              <h3 className="font-bold text-slate-900 text-base mb-1.5">
                Does donating blood hurt?
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                You will feel a quick, mild pinch when the sterile needle is inserted, similar to a brief
                skin pinch. The collection itself is virtually painless and takes approximately 6 to 10
                minutes.
              </p>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
              <h3 className="font-bold text-slate-900 text-base mb-1.5">
                How much blood is taken during donation?
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Standard whole blood donation collects approximately 350 ml (for body weight 45–55 kg) or 450
                ml (for weight &gt;55 kg), which represents less than 8–10% of an adult&apos;s total blood volume.
                Your body replaces the fluid volume within 24–48 hours.
              </p>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
              <h3 className="font-bold text-slate-900 text-base mb-1.5">
                Can I donate if I recently got a tattoo or piercing?
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                In India, standard blood bank guidelines require a deferral waiting period of 6 to 12 months
                following any tattoo, body piercing, or acupuncture procedure to prevent risk of blood-borne
                infections.
              </p>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
              <h3 className="font-bold text-slate-900 text-base mb-1.5">
                Is my personal contact information shared publicly?
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                No. RaktaSetu implements strict backend privacy rules. Your telephone number is never exposed
                in search or pre-acceptance donor lists. Contact details are disclosed only after you
                explicitly accept a specific patient invitation.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
