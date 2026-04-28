// question.js — Math + English question system

let questionsData    = null;
let currentQuestion  = null;
let currentChoices   = [];
let _englishCorrect  = null;  // correct answer string for English questions

// ── Load ──────────────────────────────────────────────────────────────────────
export async function loadQuestions() {
  const res = await fetch('data/questions.json');
  questionsData = await res.json();
}

// ── Generate next question ────────────────────────────────────────────────────
export function nextQuestion(mathTypes) {
  if (!questionsData) return null;

  const pool = [];
  for (const t of mathTypes) {
    if (questionsData[t]) pool.push(...questionsData[t].map(q => ({ ...q, _bank: t })));
  }
  if (!pool.length) return null;

  const q = pool[Math.floor(Math.random() * pool.length)];
  currentQuestion = q;

  // English question: has options array in data
  if (Array.isArray(q.options)) {
    const opts = [...q.options];
    _englishCorrect = opts[0];  // answer is always index 0 in source data
    shuffleArray(opts);
    currentChoices = opts;
    return { question: q, choices: opts, isEnglish: true };
  }

  // Math question
  _englishCorrect = null;
  currentChoices = generateChoices(q.answer, q._bank || q.type);
  return { question: q, choices: currentChoices, isEnglish: false };
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function generateChoices(correct, type) {
  const offsets = type === 'multiplication'
    ? [1, 2, 3, 4, 6, 7, 8, 9, 10, 12]
    : [5, 10, 11, 12, 15, 20];

  const wrongs = new Set();
  while (wrongs.size < 3) {
    const off  = offsets[Math.floor(Math.random() * offsets.length)];
    const sign = Math.random() < .5 ? 1 : -1;
    const val  = correct + sign * off;
    if (val > 0 && val !== correct) wrongs.add(val);
  }

  const choices = [correct, ...wrongs];
  shuffleArray(choices);
  return choices;
}

// ── Check answer ──────────────────────────────────────────────────────────────
export function checkAnswer(chosen) {
  if (!currentQuestion) return null;

  if (_englishCorrect !== null) {
    // English question: string comparison
    return {
      correct: chosen === _englishCorrect,
      correctAnswer: _englishCorrect,
      type: 'english',
      isEnglish: true,
      explain: currentQuestion.explain ?? ''
    };
  }

  // Math question: chosen may arrive as string from dataset
  const num = typeof chosen === 'number' ? chosen : parseInt(chosen, 10);
  return {
    correct: num === currentQuestion.answer,
    correctAnswer: currentQuestion.answer,
    type: currentQuestion.type || currentQuestion._bank,
    isEnglish: false
  };
}

// ── Build question text (math only) ──────────────────────────────────────────
export function questionText(q) {
  if (q.type === 'multiplication') return `${q.a} × ${q.b} = ?`;
  if (q.type === 'addition')       return `${q.a} + ${q.b} = ?`;
  if (q.type === 'subtraction')    return `${q.a} - ${q.b} = ?`;
  return '? = ?';
}
