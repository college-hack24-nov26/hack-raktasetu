import assert from 'assert';
import { DONOR_QUESTIONS, QuestionItem } from '../../web/app/components/DonorQuickCheck';

console.log('========================================================');
console.log('  RaktaSetu — Donor Quick Check Logic Verification');
console.log('========================================================\n');

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`[FAIL] ${name}: ${err.message}`);
    failed++;
  }
}

// 1. Verify 9 Questions Specification
test('1. Questionnaire contains exactly 9 questions with required fields', () => {
  assert.strictEqual(DONOR_QUESTIONS.length, 9, 'Should have exactly 9 questions');

  DONOR_QUESTIONS.forEach((q: QuestionItem, idx: number) => {
    assert.strictEqual(q.id, idx + 1, `Question ID should be ${idx + 1}`);
    assert.ok(q.question.length > 10, `Question text missing for Q${q.id}`);
    assert.ok(q.explanation.length > 10, `Explanation missing for Q${q.id}`);
    assert.ok(q.cautionOnAnswer === 'yes' || q.cautionOnAnswer === 'no', `Invalid cautionOnAnswer for Q${q.id}`);
    assert.ok(q.cautionTitle.length > 0, `Caution title missing for Q${q.id}`);
    assert.ok(q.cautionDetail.length > 10, `Caution detail missing for Q${q.id}`);
  });
});

// 2. Question Text Verification against Reference Prompts
test('2. Questions match specified screening topics in sequence', () => {
  assert.match(DONOR_QUESTIONS[0].question, /medication/i, 'Q1 must be medication');
  assert.match(DONOR_QUESTIONS[1].question, /18 and 65/i, 'Q2 must be age 18-65');
  assert.match(DONOR_QUESTIONS[2].question, /45 kg/i, 'Q3 must be body weight >= 45kg');
  assert.match(DONOR_QUESTIONS[3].question, /infection.*fever.*cold.*cough/i, 'Q4 must be infection/symptoms');
  assert.match(DONOR_QUESTIONS[4].question, /surgery.*dental/i, 'Q5 must be surgery/dental');
  assert.match(DONOR_QUESTIONS[5].question, /6 hours of sleep/i, 'Q6 must be 6 hours sleep');
  assert.match(DONOR_QUESTIONS[6].question, /light.*meal/i, 'Q7 must be light meal');
  assert.match(DONOR_QUESTIONS[7].question, /tattoos.*piercings/i, 'Q8 must be tattoos/piercings');
  assert.match(DONOR_QUESTIONS[8].question, /alcohol/i, 'Q9 must be alcohol');
});

// 3. Progress Calculation
test('3. Progress starts at 0% and reaches 100% upon answering 9 questions', () => {
  const total = DONOR_QUESTIONS.length;

  let answeredCount = 0;
  assert.strictEqual(Math.round((answeredCount / total) * 100), 0);

  answeredCount = 3;
  assert.strictEqual(Math.round((answeredCount / total) * 100), 33);

  answeredCount = 9;
  assert.strictEqual(Math.round((answeredCount / total) * 100), 100);
});

// 4. Caution Flagging Logic
test('4. Cautions are flagged without diagnosing or claiming definitive ineligibility', () => {
  // Scenario A: User answered Yes to Medication (Q1) and No to Sleep (Q6)
  const answers: Record<number, 'yes' | 'no'> = {
    1: 'yes', // cautionOnAnswer: 'yes'
    2: 'yes', // cautionOnAnswer: 'no' -> ok
    3: 'yes', // cautionOnAnswer: 'no' -> ok
    4: 'no',  // cautionOnAnswer: 'yes' -> ok
    5: 'no',  // cautionOnAnswer: 'yes' -> ok
    6: 'no',  // cautionOnAnswer: 'no' -> flagged!
    7: 'yes', // cautionOnAnswer: 'no' -> ok
    8: 'no',  // cautionOnAnswer: 'yes' -> ok
    9: 'no',  // cautionOnAnswer: 'yes' -> ok
  };

  const flagged = DONOR_QUESTIONS.filter((q: QuestionItem) => answers[q.id] === q.cautionOnAnswer);
  assert.strictEqual(flagged.length, 2, 'Should flag exactly Q1 and Q6');
  assert.strictEqual(flagged[0].id, 1);
  assert.strictEqual(flagged[1].id, 6);
});

// 5. Ideal Scenario Flagging
test('5. Favorable preliminary answers produce zero flagged cautions', () => {
  const answers: Record<number, 'yes' | 'no'> = {
    1: 'no',
    2: 'yes',
    3: 'yes',
    4: 'no',
    5: 'no',
    6: 'yes',
    7: 'yes',
    8: 'no',
    9: 'no',
  };

  const flagged = DONOR_QUESTIONS.filter((q: QuestionItem) => answers[q.id] === q.cautionOnAnswer);
  assert.strictEqual(flagged.length, 0, 'No cautions should be flagged for standard favorable responses');
});

console.log('\n--------------------------------------------------------');
console.log(`Results: ${passed} passed, ${failed} failed.`);
console.log('--------------------------------------------------------');

if (failed > 0) process.exit(1);
