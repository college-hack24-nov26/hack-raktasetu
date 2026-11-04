export interface CounsellingQuestionDef {
  id: number;
  code: string;
  category: string;
  question: string;
  type: 'YES_NO' | 'YES_NO_OPTIONS' | 'YES_NO_NA';
  options?: string[];
  defaultAnswer: 'Yes' | 'No' | 'Not applicable';
  defaultSelectedOptions?: string[];
  defaultRemarks: string;
  requiresReviewNote?: boolean;
}

export const COUNSELLING_QUESTIONS_26: CounsellingQuestionDef[] = [
  {
    id: 1,
    code: 'Q01',
    category: 'General & Donation History',
    question: 'Have you donated blood previously? If yes, what was the date of your last donation?',
    type: 'YES_NO',
    defaultAnswer: 'Yes',
    defaultRemarks: 'Prior voluntary donation recorded; verified elapsed interval > 90 days.',
  },
  {
    id: 2,
    code: 'Q02',
    category: 'General Health Today',
    question: 'Are you feeling well today and in good health?',
    type: 'YES_NO',
    defaultAnswer: 'Yes',
    defaultRemarks: 'Donor confirms normal wellbeing and appetite today.',
  },
  {
    id: 3,
    code: 'Q03',
    category: 'Prior Donation Reactions',
    question: 'Did you suffer from any discomfort, dizziness, nausea, or fainting during previous donations?',
    type: 'YES_NO',
    defaultAnswer: 'No',
    defaultRemarks: 'No adverse reactions experienced during prior donations.',
  },
  {
    id: 4,
    code: 'Q04',
    category: 'Pre-donation Readiness',
    question: 'Have you taken food or refreshments in the last 4 hours?',
    type: 'YES_NO',
    defaultAnswer: 'Yes',
    defaultRemarks: 'Light meal taken within the last 2 hours.',
  },
  {
    id: 5,
    code: 'Q05',
    category: 'Pre-donation Readiness',
    question: 'Did you get at least 6 hours of sound sleep the previous night?',
    type: 'YES_NO',
    defaultAnswer: 'Yes',
    defaultRemarks: 'Adequate 7-hour rest reported.',
  },
  {
    id: 6,
    code: 'Q06',
    category: 'Current Acute Symptoms',
    question: 'Do you currently have a cough, fever, acute sinusitis, acute migraine, sore throat, cold, or any flu-like illness?',
    type: 'YES_NO',
    defaultAnswer: 'No',
    defaultRemarks: 'Afebrile, asymptomatic.',
  },
  {
    id: 7,
    code: 'Q07',
    category: 'Current Medications',
    question: 'Are you currently taking any prescription, herbal, or over-the-counter medications?',
    type: 'YES_NO_OPTIONS',
    options: ['None of these', 'Antibiotics', 'Antihypertensives', 'Antidiabetic agents', 'Analgesics / Painkillers', 'Other prescription drugs'],
    defaultAnswer: 'No',
    defaultSelectedOptions: ['None of these'],
    defaultRemarks: 'No concurrent medications affecting donor clearance.',
  },
  {
    id: 8,
    code: 'Q08',
    category: 'Past Donor Refusal',
    question: 'Have you ever been refused, deferred, or advised not to donate blood anywhere in the past?',
    type: 'YES_NO',
    defaultAnswer: 'No',
    defaultRemarks: 'No prior clinical deferrals on state/national registry.',
  },
  {
    id: 9,
    code: 'Q09',
    category: 'Post-donation Safety',
    question: 'Do you plan to drive heavy commercial vehicles, pilot an aircraft, work at heights, or engage in hazardous physical activities immediately after donation?',
    type: 'YES_NO',
    defaultAnswer: 'No',
    defaultRemarks: 'Post-donation resting schedule confirmed; no high-risk occupations scheduled today.',
  },
  {
    id: 10,
    code: 'Q10',
    category: 'Substance Intake (24 Hours)',
    question: 'Have you consumed alcohol or any intoxicating substances in the previous 24 hours?',
    type: 'YES_NO',
    defaultAnswer: 'No',
    defaultRemarks: 'No alcohol consumption in last 24 hours verified.',
  },
  {
    id: 11,
    code: 'Q11',
    category: 'Medications (72 Hours)',
    question: 'Have you taken aspirin, NSAIDs (Ibuprofen/Diclofenac), steroids, or anticoagulants in the previous 72 hours?',
    type: 'YES_NO_OPTIONS',
    options: ['None of these', 'Aspirin', 'Ibuprofen / NSAIDs', 'Oral / Injectable Steroids', 'Anticoagulants / Blood thinners'],
    defaultAnswer: 'No',
    defaultSelectedOptions: ['None of these'],
    defaultRemarks: 'Platelet and plasma function uninhibited.',
  },
  {
    id: 12,
    code: 'Q12',
    category: 'Vaccinations (15 Days)',
    question: 'Have you received toxoids or killed vaccines in the previous 15 days (e.g., Tetanus toxoid, Hepatitis B, Cholera, Diphtheria, HPV)?',
    type: 'YES_NO_OPTIONS',
    options: ['None of these', 'Tetanus toxoid', 'Hepatitis B vaccine', 'Cholera', 'Diphtheria', 'HPV'],
    defaultAnswer: 'No',
    defaultSelectedOptions: ['None of these'],
    defaultRemarks: 'No vaccines received in the last 15 days.',
  },
  {
    id: 13,
    code: 'Q13',
    category: 'Vaccines & Sera (4 Weeks)',
    question: 'Have you received live attenuated vaccines or sera in the previous 4 weeks (e.g., MMR, Chickenpox/Varicella, Yellow Fever, Oral Polio, BCG, Rabies immunisation)?',
    type: 'YES_NO_OPTIONS',
    options: ['None of these', 'MMR (Measles, Mumps, Rubella)', 'Chickenpox / Varicella', 'Yellow Fever', 'Oral Polio Vaccine', 'BCG', 'Anti-rabies serum / vaccine'],
    defaultAnswer: 'No',
    defaultSelectedOptions: ['None of these'],
    defaultRemarks: 'No live attenuated virus vaccines received in last 4 weeks.',
  },
  {
    id: 14,
    code: 'Q14',
    category: 'Acute Illness (2 Weeks)',
    question: 'Have you suffered from any acute illnesses in the previous 2 weeks (e.g., typhoid, gastroenteritis, viral fever, severe dental infection)?',
    type: 'YES_NO_OPTIONS',
    options: ['None of these', 'Typhoid fever', 'Gastroenteritis / Diarrhoea', 'Acute viral fever', 'Severe dental infection / abscess'],
    defaultAnswer: 'No',
    defaultSelectedOptions: ['None of these'],
    defaultRemarks: 'No febrile or gastrointestinal illness in previous 14 days.',
  },
  {
    id: 15,
    code: 'Q15',
    category: 'Procedures & History (3 Months)',
    question: 'In the previous 3 months, have you donated whole blood, had minor surgery / dental extraction, or suffered from malaria?',
    type: 'YES_NO_OPTIONS',
    options: ['None of these', 'Whole-blood donation within 90 days', 'Minor surgical procedure', 'Dental extraction', 'Malaria diagnosis/treatment'],
    defaultAnswer: 'No',
    defaultSelectedOptions: ['None of these'],
    defaultRemarks: 'Over 90 days elapsed since any prior donation; no malaria.',
  },
  {
    id: 16,
    code: 'Q16',
    category: 'Travel & Arbovirus (4 Months)',
    question: 'In the previous 4 months, have you been diagnosed with Zika virus or West Nile virus infection, or travelled to areas with active ongoing outbreaks?',
    type: 'YES_NO',
    defaultAnswer: 'No',
    defaultRemarks: 'No travel to Zika/WNV transmission zones.',
  },
  {
    id: 17,
    code: 'Q17',
    category: 'Surgery & Infections (6 Months)',
    question: 'In the previous 6 months, have you had major surgery, serious infections, unexplained weight loss, night sweats, dengue, or chikungunya?',
    type: 'YES_NO_OPTIONS',
    options: ['None of these', 'Major surgical operation', 'Dengue fever', 'Chikungunya', 'Unexplained weight loss or night sweats', 'Needlestick / Mucosal exposure'],
    defaultAnswer: 'No',
    defaultSelectedOptions: ['None of these'],
    defaultRemarks: 'Fully recovered and cleared of acute arboviral infections.',
  },
  {
    id: 18,
    code: 'Q18',
    category: 'Hepatitis Exposure (1 Year)',
    question: 'Have you been in close household or sexual contact with someone suffering from jaundice, Hepatitis B, or Hepatitis C in the previous 1 year?',
    type: 'YES_NO',
    defaultAnswer: 'No',
    defaultRemarks: 'No close contact with acute hepatitis index cases.',
  },
  {
    id: 19,
    code: 'Q19',
    category: 'Procedures & Transfusions (1 Year)',
    question: 'In the previous 1 year, have you received blood / component transfusions, organ transplants, tattooing, body piercing, endoscopy, or rabies vaccination after animal bite?',
    type: 'YES_NO_OPTIONS',
    options: ['None of these', 'Blood or component transfusion', 'Tattooing or body piercing', 'Endoscopy / Colonoscopy', 'Organ / Tissue transplant', 'Animal bite requiring rabies vaccine / IG'],
    defaultAnswer: 'No',
    defaultSelectedOptions: ['None of these'],
    defaultRemarks: 'No parenteral or mucous membrane risk exposures in last 12 months.',
  },
  {
    id: 20,
    code: 'Q20',
    category: 'Chronic Infections (2 Years)',
    question: 'In the previous 2 years, have you been treated for tuberculosis (TB) or osteomyelitis?',
    type: 'YES_NO',
    defaultAnswer: 'No',
    defaultRemarks: 'No history or treatment of TB or osteomyelitis in past 2 years.',
  },
  {
    id: 21,
    code: 'Q21',
    category: 'Major Medical Conditions',
    question: 'Do you have or have you ever been diagnosed with heart disease, chronic kidney disease, cancer, epilepsy, severe asthma, chronic liver disease, or bleeding disorders?',
    type: 'YES_NO_OPTIONS',
    options: ['None of these', 'Heart disease / Coronary condition', 'Chronic kidney disease', 'Cancer / Malignancy', 'Epilepsy / Convulsions', 'Severe chronic asthma', 'Bleeding / Coagulation disorder', 'Chronic liver disease / Cirrhosis'],
    defaultAnswer: 'No',
    defaultSelectedOptions: ['None of these'],
    defaultRemarks: 'Negative for major systemic, cardiovascular, and neoplastic illnesses.',
  },
  {
    id: 22,
    code: 'Q22',
    category: 'Confidential Self-Exclusion',
    question: 'Confidential Self-Exclusion: Do you wish to self-exclude this donation from clinical transfusion if you believe your blood may not be completely safe for a patient?',
    type: 'YES_NO',
    defaultAnswer: 'No',
    defaultRemarks: 'Donor affirms confidence in safety for clinical transfusion.',
  },
  {
    id: 23,
    code: 'Q23',
    category: 'High-Risk Behaviour (6 Months)',
    question: 'In the previous 6 months, have you engaged in high-risk sexual behaviour, multiple casual sexual partners, commercial sex work, or injected recreational drugs?',
    type: 'YES_NO',
    defaultAnswer: 'No',
    defaultRemarks: 'Confidential assessment denies high-risk behaviours for TTI.',
  },
  {
    id: 24,
    code: 'Q24',
    category: 'Female Specific: Pregnancy',
    question: '(For female donors) Are you currently pregnant or suspect you might be pregnant?',
    type: 'YES_NO_NA',
    defaultAnswer: 'No',
    defaultRemarks: 'Not currently pregnant.',
  },
  {
    id: 25,
    code: 'Q25',
    category: 'Female Specific: Delivery / Abortion',
    question: '(For female donors) Have you had an abortion, miscarriage, or delivery in the previous 6 months?',
    type: 'YES_NO_NA',
    defaultAnswer: 'No',
    defaultRemarks: 'No delivery or pregnancy loss in past 6 months.',
  },
  {
    id: 26,
    code: 'Q26',
    category: 'Female Specific: Lactation',
    question: '(For female donors) Are you currently breastfeeding a child?',
    type: 'YES_NO_NA',
    defaultAnswer: 'No',
    defaultRemarks: 'Not actively breastfeeding.',
  },
];

export function getInitialCounsellingAnswers(isFemale: boolean = false, isDemoMode: boolean = false) {
  return COUNSELLING_QUESTIONS_26.map((q) => {
    let answer: string | null = null;
    let selectedOptions: string[] = [];
    let remarks = '';
    let reviewStatus = 'UNANSWERED';

    // Female-specific questions are not applicable to male donors
    if (q.type === 'YES_NO_NA' && !isFemale) {
      answer = 'Not applicable';
      remarks = 'Not applicable for male donors.';
      reviewStatus = 'APPROVED';
    } else if (isDemoMode) {
      answer = q.defaultAnswer;
      selectedOptions = q.defaultSelectedOptions ? [...q.defaultSelectedOptions] : [];
      remarks = q.defaultRemarks || '';
      reviewStatus = 'DEMO_DRAFT';
    }

    return {
      id: q.id,
      code: q.code,
      question: q.question,
      category: q.category,
      type: q.type,
      options: q.options || [],
      answer,
      selectedOptions,
      remarks,
      reviewStatus,
      isDemoDefault: isDemoMode,
      staffEdited: false,
    };
  });
}

export function getDemoCounsellingAnswers(isFemale: boolean = false) {
  return getInitialCounsellingAnswers(isFemale, true);
}
