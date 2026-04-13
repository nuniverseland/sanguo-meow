// question.js — Math question system

let questionsData = null;
let currentQuestion = null;
let currentChoices  = [];

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
    if (questionsData[t]) pool.push(...questionsData[t].map(q => ({ ...q, type: t })));
  }
  if (!pool.length) return null;

  const q = pool[Math.floor(Math.random() * pool.length)];
  currentQuestion = q;
  currentChoices  = generateChoices(q.answer, q.type);
  return { question: q, choices: currentChoices };
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
  // Fisher-Yates shuffle
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  return choices;
}

// ── Check answer ──────────────────────────────────────────────────────────────
export function checkAnswer(chosen) {
  if (!currentQuestion) return null;
  return {
    correct: chosen === currentQuestion.answer,
    correctAnswer: currentQuestion.answer,
    type: currentQuestion.type
  };
}

// ── Build question text ───────────────────────────────────────────────────────
export function questionText(q) {
  if (q.type === 'multiplication') return `${q.a} × ${q.b} = ?`;
  if (q.type === 'addition')       return `${q.a} + ${q.b} = ?`;
  if (q.type === 'subtraction')    return `${q.a} - ${q.b} = ?`;
  return '? = ?';
}
