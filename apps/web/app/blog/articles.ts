export interface Article {
  slug: string;
  title: string;
  summary: string;
  category: 'Awareness' | 'Donation Guidance' | 'Project Updates';
  publishedAt: string;
  readTime: string;
  author: string;
  content: string[];
  disclaimer?: string;
  sourceAttribution?: string;
}

export const ARTICLES: Article[] = [
  {
    slug: 'why-voluntary-blood-donation-matters',
    title: 'Why Voluntary Blood Donation Matters More Than Replacement Donation',
    summary:
      'Replacement donation places undue stress on families during medical emergencies. Learn why institutional voluntary networks create a safer, more reliable blood supply.',
    category: 'Awareness',
    publishedAt: '2026-10-15',
    readTime: '4 min read',
    author: 'RaktaSetu Health Editorial Team',
    disclaimer:
      'General health awareness content. Transfusion requirements and compatibility testing are determined exclusively by clinical transfusion medicine specialists.',
    sourceAttribution:
      'National Blood Transfusion Council (NBTC) & WHO Voluntary Unremunerated Blood Donation Framework.',
    content: [
      'In India, thousands of units of blood are required every single day for planned surgeries, acute trauma cases, obstetric complications, and chronic haematological conditions like thalassemia major and sickle cell disease.',
      'Historically, hospitals have relied heavily on "replacement donation" — requiring the patient\'s family members to find replacement donors before blood units can be issued. This puts extreme emotional and logistical stress on vulnerable families during acute medical crises.',
      'World Health Organization (WHO) and National Blood Transfusion Council (NBTC) guidelines emphasize that regular voluntary unremunerated donors represent the safest source of blood. Regular donors are tested periodically, are free from acute pressure, and donate out of altruism rather than emergency coercion.',
      'By registering as voluntary donors with platforms like RaktaSetu and participating in community blood donation drives, citizens help build an active reservoir that prevents supply shocks and eliminates the panic of emergency searches.',
    ],
  },
  {
    slug: 'preparing-for-your-first-blood-donation',
    title: 'How to Prepare for Your First Voluntary Blood Donation: A Practical Guide',
    summary:
      'Simple steps to stay hydrated, maintain good iron levels, and ensure a comfortable, energised donation experience.',
    category: 'Donation Guidance',
    publishedAt: '2026-10-10',
    readTime: '5 min read',
    author: 'Clinical Advisory Contributors',
    disclaimer:
      'Guidance is educational. Donors undergo on-site physical evaluation (haemoglobin, blood pressure, pulse, medical history) before acceptance.',
    sourceAttribution: 'e-RaktKosh Donor Advisory & Indian Red Cross Blood Bank Guidelines.',
    content: [
      'Giving blood for the first time is a quick and deeply rewarding experience. Preparing your body properly ensures you feel energetic and comfortable throughout the donation and recovery.',
      '1. Hydration is Key: Drink plenty of water (at least 500 ml) 2–3 hours before arriving at the donation centre. Adequate hydration maintains steady vascular volume and minimizes post-donation lightheadedness.',
      '2. Eat a Balanced Meal: Never donate on an empty stomach. Enjoy a nutritious, low-fat meal within 2 to 3 hours prior to donation. Avoid extremely greasy or fatty foods right before donation, as lipids can temporarily cloud plasma testing.',
      '3. Get Adequate Sleep: Ensure you get at least 6 to 8 hours of restful sleep the night before donating.',
      '4. What to Expect During Collection: The actual blood collection takes only 6 to 10 minutes. A sterile, single-use needle is unsealed in your presence, and approximately 350 ml to 450 ml is collected. Afterward, rest in the observation lounge for 10–15 minutes with a light juice and snack.',
      '5. Post-Donation Care: Keep the bandage on for 4–6 hours, avoid strenuous gym workouts or heavy lifting for the rest of the day, and continue hydrating generously.',
    ],
  },
  {
    slug: 'raktasetu-verified-donation-lifecycle',
    title: 'Introducing the Verified Donation Lifecycle: Protecting Privacy & Data Integrity',
    summary:
      'How RaktaSetu distinguishes patient-reported coordination outcomes from authorized clinical verification to protect donor records and medical deferral intervals.',
    category: 'Project Updates',
    publishedAt: '2026-10-21',
    readTime: '3 min read',
    author: 'RaktaSetu Engineering & Privacy Group',
    disclaimer:
      'RaktaSetu is an open research prototype. The platform operates under strict mutual consent rules and adheres to national telecommunication privacy norms.',
    sourceAttribution: 'RaktaSetu Technical Architecture Documentation (Phases 1–12).',
    content: [
      'In digital blood coordination platforms, data integrity is not just a software metric — it directly impacts real-world patient safety and donor eligibility.',
      'One common flaw in volunteer platforms is confusing a patient marking a request "Closed" with an actual clinical donation having occurred. If a patient mistakenly marks a request complete, or blood was arranged from a different blood bank, incorrectly marking the volunteer donor as "donated" would trigger a 90-day medical deferral blocking them from donating when someone else needs them.',
      'In RaktaSetu, we solved this with the Verified Donation Lifecycle: when a patient closes a request, they can report an outcome (e.g. donation completed, blood arranged elsewhere, requirement cancelled). This records the reported state without altering the donor\'s official clinical records.',
      'Only when qualified blood centre personnel execute the verified confirmation endpoint is the donor\'s official verified last donation timestamp updated. This ensures strict auditability and prevents inaccurate volunteer deferrals.',
    ],
  },
  {
    slug: 'understanding-blood-components',
    title: 'Whole Blood vs PRBC, Platelets & Plasma: Why One Donation Saves Three Lives',
    summary:
      'Modern transfusion medicine separates blood into specific components to target specific medical conditions effectively.',
    category: 'Awareness',
    publishedAt: '2026-09-28',
    readTime: '4 min read',
    author: 'RaktaSetu Health Editorial Team',
    disclaimer:
      'Transfusion decisions are made solely by certified treating physicians based on clinical laboratory parameters.',
    sourceAttribution: 'Department of Transfusion Medicine, AIIMS & Ministry of Health & Family Welfare.',
    content: [
      'When you donate a unit of whole blood, it is rarely transfused directly as whole blood. Instead, blood centres use high-speed refrigerated centrifuges to separate it into three lifesaving components:',
      '1. Packed Red Blood Cells (PRBC): These oxygen-carrying cells are used to treat severe anaemia, acute surgical blood loss, trauma patients, and individuals suffering from thalassemia.',
      '2. Platelets: Essential for blood clotting, platelet concentrates are vital for cancer patients undergoing chemotherapy, dengue patients experiencing severe thrombocytopenia, and bone marrow transplant recipients.',
      '3. Fresh Frozen Plasma (FFP): Rich in clotting factors and proteins, plasma treats severe burns, liver disease, and complex coagulopathies.',
      'By separating each unit into these three specialized components, a single voluntary donor can directly help up to three different patients receiving treatment in different hospital departments.',
    ],
  },
];
