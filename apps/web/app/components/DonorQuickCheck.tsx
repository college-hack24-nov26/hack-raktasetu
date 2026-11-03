'use client';

import { useState } from 'react';
import Link from 'next/link';

export interface QuestionItem {
  id: number;
  question: string;
  explanation: string;
  cautionOnAnswer: 'yes' | 'no';
  cautionTitle: string;
  cautionDetail: string;
}

export const DONOR_QUESTIONS: QuestionItem[] = [
  {
    id: 1,
    question: 'Are you currently taking any medication, such as antibiotics or blood thinners?',
    explanation: 'Certain prescription medications, including antibiotics and anticoagulants, may require a waiting period before donating.',
    cautionOnAnswer: 'yes',
    cautionTitle: 'Current medication',
    cautionDetail: 'You reported taking medication. Suitability depends on the specific drug and condition; blood-bank medical staff will evaluate whether a temporary deferral applies.',
  },
  {
    id: 2,
    question: 'Are you between 18 and 65 years of age?',
    explanation: 'In India, voluntary blood donation is standardly accepted from individuals aged 18 to 65 years who meet health criteria.',
    cautionOnAnswer: 'no',
    cautionTitle: 'Age consideration',
    cautionDetail: 'You indicated being outside the 18–65 range. Standard national regulatory guidelines require donors to be within this age window for donor and recipient safety.',
  },
  {
    id: 3,
    question: 'Is your body weight at least 45 kg?',
    explanation: 'Standard whole blood donation requires a minimum body weight of 45 kg (50 kg for 450 ml collection) to ensure donor safety.',
    cautionOnAnswer: 'no',
    cautionTitle: 'Body weight consideration',
    cautionDetail: 'You indicated body weight under 45 kg. A minimum body weight is required to ensure safe donation volume without risk of adverse reactions.',
  },
  {
    id: 4,
    question: 'Have you had any infection, fever, cold, cough, weakness, dizziness, or fatigue today?',
    explanation: 'Donors should be in good general health on the day of donation without any symptoms of infection or acute weakness.',
    cautionOnAnswer: 'yes',
    cautionTitle: 'Recent acute symptoms',
    cautionDetail: 'You reported feeling unwell today. Blood banks require donors to be fully symptom-free on the day of collection. Please wait until you have fully recovered.',
  },
  {
    id: 5,
    question: 'Have you undergone any surgery or major dental procedure recently, such as within the last 6–12 months?',
    explanation: 'Recent surgeries and invasive dental procedures require a temporary deferral period to allow full tissue recovery.',
    cautionOnAnswer: 'yes',
    cautionTitle: 'Recent procedures',
    cautionDetail: 'You reported a recent surgical or dental procedure. A temporary deferral window typically applies depending on the nature of the procedure.',
  },
  {
    id: 6,
    question: 'Did you have at least 6 hours of sleep last night?',
    explanation: 'Adequate rest before donation helps maintain stable blood pressure and prevents post-donation dizziness or fatigue.',
    cautionOnAnswer: 'no',
    cautionTitle: 'Rest & sleep',
    cautionDetail: 'You reported having less than 6 hours of rest. Getting adequate sleep prior to donation is strongly recommended to prevent vasovagal reactions.',
  },
  {
    id: 7,
    question: 'Have you eaten a light, non-oily meal in the last few hours?',
    explanation: 'Donating on an empty stomach can cause lightheadedness. A light, healthy snack or meal beforehand is recommended.',
    cautionOnAnswer: 'no',
    cautionTitle: 'Pre-donation meal',
    cautionDetail: 'You reported not having eaten recently. Please have a light, wholesome meal and drink water 2–3 hours before arriving at the blood centre.',
  },
  {
    id: 8,
    question: 'Have you had any tattoos, piercings, or acupuncture in the last 6 months?',
    explanation: 'Standard guidelines recommend a temporary deferral of 6 to 12 months after skin piercings or tattoos to rule out bloodborne infections.',
    cautionOnAnswer: 'yes',
    cautionTitle: 'Skin puncture or tattoo',
    cautionDetail: 'You reported a recent tattoo, piercing, or acupuncture. A standard 6-month deferral window from the procedure date is required by regulatory guidelines.',
  },
  {
    id: 9,
    question: 'Have you consumed alcohol in the last 24 hours?',
    explanation: 'Donors are advised not to consume alcohol for at least 24 hours prior to blood donation to avoid dehydration and blood pressure fluctuations.',
    cautionOnAnswer: 'yes',
    cautionTitle: 'Recent alcohol consumption',
    cautionDetail: 'You reported alcohol consumption within the past 24 hours. Blood centres recommend waiting at least 24 hours post-consumption before donating.',
  },
];

export function DonorQuickCheck() {
  const [started, setStarted] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, 'yes' | 'no'>>({});
  const [isCompleted, setIsCompleted] = useState(false);

  const totalQuestions = DONOR_QUESTIONS.length;
  const answeredCount = Object.keys(answers).length;
  const progressPct = !started
    ? 0
    : isCompleted
    ? 100
    : Math.round((answeredCount / totalQuestions) * 100);

  const handleStart = () => {
    setStarted(true);
    setCurrentIdx(0);
    setIsCompleted(false);
  };

  const handleAnswer = (answer: 'yes' | 'no') => {
    const question = DONOR_QUESTIONS[currentIdx];
    const newAnswers = { ...answers, [question.id]: answer };
    setAnswers(newAnswers);

    if (currentIdx + 1 < totalQuestions) {
      setCurrentIdx(currentIdx + 1);
    } else {
      setIsCompleted(true);
    }
  };

  const handlePrevious = () => {
    if (currentIdx > 0) {
      setCurrentIdx(currentIdx - 1);
    }
  };

  const handleStartOver = () => {
    setStarted(false);
    setCurrentIdx(0);
    setAnswers({});
    setIsCompleted(false);
  };

  // Identify questions where user's answer warrants educational caution
  const flaggedCautions = DONOR_QUESTIONS.filter((q) => {
    const ans = answers[q.id];
    return ans && ans === q.cautionOnAnswer;
  });

  const currentQ = DONOR_QUESTIONS[currentIdx];

  return (
    <div className="bg-slate-50/70 border border-slate-200 rounded-3xl p-6 sm:p-10 shadow-sm transition-all">
      <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
        {/* Left Column: Interactive Questionnaire Content */}
        <div className="md:col-span-8 flex flex-col justify-between">
          {!started && !isCompleted && (
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-100 text-[#B91C32] text-xs font-bold uppercase tracking-wider mb-4">
                <span className="w-2 h-2 rounded-full bg-[#B91C32]"></span>
                <span>Check Eligibility</span>
              </div>

              <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mb-3">
                Can you donate blood?
              </h3>

              <p className="text-sm sm:text-base text-slate-600 leading-relaxed mb-6">
                Donating blood is a simple, safe and life-saving act — but not everyone may be eligible today.
                Answer a short 9-question preliminary check to get a general sense of standard screening considerations.
              </p>

              <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200 text-xs text-blue-900 mb-6">
                <strong>Preliminary Educational Check:</strong> This self-check does not grant medical clearance. Formal physical screening is always conducted by qualified medical officers at the blood centre.
              </div>

              <button
                type="button"
                onClick={handleStart}
                className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-[#B91C32] hover:bg-[#9B1324] active:bg-[#851323] text-white font-bold text-sm transition-all shadow-md shadow-red-200 cursor-pointer"
              >
                Start the quick check
              </button>
            </div>
          )}

          {started && !isCompleted && currentQ && (
            <div>
              {/* Progress and Question Counter */}
              <div className="flex items-center justify-between gap-4 mb-4">
                <span className="text-xs font-bold text-[#B91C32] uppercase tracking-wider">
                  Question {currentIdx + 1} of {totalQuestions}
                </span>
                <span className="text-xs font-medium text-slate-500">
                  {progressPct}% completed
                </span>
              </div>

              {/* Progress Bar */}
              <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden mb-6">
                <div
                  className="h-full bg-[#B91C32] transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                ></div>
              </div>

              {/* Question Text */}
              <h4 className="text-lg sm:text-xl font-bold text-slate-900 leading-snug mb-3">
                {currentQ.question}
              </h4>

              {/* Explanation Text */}
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed mb-8">
                {currentQ.explanation}
              </p>

              {/* Yes / No Action Buttons */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <button
                  type="button"
                  onClick={() => handleAnswer('yes')}
                  className={`py-3.5 px-6 rounded-xl font-bold text-base transition-all border cursor-pointer ${
                    answers[currentQ.id] === 'yes'
                      ? 'bg-[#B91C32] text-white border-[#B91C32] shadow-sm'
                      : 'bg-white text-slate-800 border-slate-300 hover:border-[#B91C32] hover:bg-red-50/40'
                  }`}
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => handleAnswer('no')}
                  className={`py-3.5 px-6 rounded-xl font-bold text-base transition-all border cursor-pointer ${
                    answers[currentQ.id] === 'no'
                      ? 'bg-[#B91C32] text-white border-[#B91C32] shadow-sm'
                      : 'bg-white text-slate-800 border-slate-300 hover:border-[#B91C32] hover:bg-red-50/40'
                  }`}
                >
                  No
                </button>
              </div>

              {/* Secondary Controls: Back & Start Over */}
              <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-200">
                {currentIdx > 0 ? (
                  <button
                    type="button"
                    onClick={handlePrevious}
                    className="hover:text-slate-800 font-semibold cursor-pointer"
                  >
                    ← Previous question
                  </button>
                ) : (
                  <span></span>
                )}
                <button
                  type="button"
                  onClick={handleStartOver}
                  className="hover:text-[#B91C32] underline cursor-pointer"
                >
                  Start over
                </button>
              </div>
            </div>
          )}

          {isCompleted && (
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold uppercase tracking-wider mb-3">
                <span>✓ Self-Check Completed</span>
              </div>

              <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mb-2">
                Your donor self-check is complete
              </h3>

              {/* Mandatory Medical Safety Disclaimer */}
              <div className="p-4 rounded-xl bg-amber-50/80 border border-amber-200 text-xs text-amber-900 mb-5">
                <span className="font-bold block mb-1">Medical Assessment Notice:</span>
                Your self-check is complete. This questionnaire does not confirm your eligibility to donate.
                Blood-bank staff must assess you before donation.
              </div>

              {/* Contextual Advisory Notes (Without diagnosing) */}
              {flaggedCautions.length > 0 ? (
                <div className="mb-6 space-y-2">
                  <h5 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Points to discuss with blood-bank staff:
                  </h5>
                  <div className="space-y-2 text-xs text-slate-600 bg-white p-3.5 rounded-xl border border-slate-200">
                    {flaggedCautions.map((item) => (
                      <div key={item.id} className="flex items-start gap-2">
                        <span className="text-[#B91C32] font-bold">•</span>
                        <div>
                          <strong className="text-slate-800">{item.cautionTitle}:</strong>{' '}
                          {item.cautionDetail}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mb-6 p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 text-xs text-emerald-900">
                  Based on your responses, your answers align with general preliminary screening considerations.
                  Final determination will be confirmed through standard hemoglobin, temperature, and blood pressure checks by staff at the centre.
                </div>
              )}

              {/* Action Buttons: Register as Donor & Start Over */}
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <Link
                  href="/donor-registration"
                  className="w-full sm:w-auto text-center px-8 py-3.5 rounded-xl bg-[#B91C32] hover:bg-[#9B1324] active:bg-[#851323] text-white font-bold text-sm transition-all shadow-md shadow-red-200"
                >
                  Register as a Donor
                </Link>
                <button
                  type="button"
                  onClick={handleStartOver}
                  className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-semibold text-sm transition-colors cursor-pointer"
                >
                  Start over
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Visual Person Silhouette & Progress Indicator */}
        <div className="md:col-span-4 flex flex-col items-center justify-center p-6 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <div className="relative w-28 h-56 flex items-center justify-center mb-4">
            <svg
              className="w-full h-full"
              viewBox="0 0 100 200"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="bodyProgressGradient" x1="0" y1="100%" x2="0" y2="0%">
                  <stop offset={`${progressPct}%`} stopColor="#B91C32" />
                  <stop offset={`${progressPct}%`} stopColor="#CBD5E1" />
                </linearGradient>
              </defs>

              {/* Head */}
              <circle
                cx="50"
                cy="26"
                r="15"
                fill="url(#bodyProgressGradient)"
              />

              {/* Body Silhouette (Torso, Arms, Legs) */}
              <path
                d="M 33 48 C 24 48 20 54 20 64 L 20 108 C 20 114 26 114 26 108 L 26 70 L 32 70 L 32 184 C 32 192 44 192 44 184 L 44 118 L 56 118 L 56 184 C 56 192 68 192 68 184 L 68 70 L 74 70 L 74 108 C 74 114 80 114 80 108 L 80 64 C 80 54 76 48 67 48 Z"
                fill="url(#bodyProgressGradient)"
              />
            </svg>
          </div>

          {/* Progress label (Never health percentage) */}
          <div className="text-center">
            <div className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {progressPct}%
            </div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mt-0.5">
              Self-check progress
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              {isCompleted
                ? 'Questionnaire completed'
                : `${answeredCount} of ${totalQuestions} answered`}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
