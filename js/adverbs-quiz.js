// adverbs-quiz.js — Adverbs grammar quiz for Europe chapter
import { getUserId, addScore, saveStageResult } from './firebase.js';

const BADGE_CONFIG = {
  how:       { label: 'Adverb — how?',        cls: 'badge-how' },
  when:      { label: 'Adverb — when?',        cls: 'badge-when' },
  where:     { label: 'Adverb — where?',       cls: 'badge-where' },
  adjective: { label: 'Adjective or adverb?',  cls: 'badge-adjective' },
};

let questions  = [];
let current    = 0;
let score      = 0;
let answered   = false;
const startTime = Date.now();

// ── Boot ──────────────────────────────────────────────────────────────────────
async function init() {
  const res  = await fetch('data/questions.json');
  const data = await res.json();
  questions  = shuffle([...(data.adverbs || [])]);

  document.getElementById('quiz-retry-btn').addEventListener('click', () => location.reload());
  document.getElementById('quiz-next-btn').addEventListener('click', nextQuestion);
  document.querySelectorAll('.quiz-option').forEach(btn => {
    btn.addEventListener('click', () => onAnswer(Number(btn.dataset.idx)));
  });

  showQuestion();
}

// ── Render ────────────────────────────────────────────────────────────────────
function showQuestion() {
  const q    = questions[current];
  answered   = false;
  const total = questions.length;

  // Progress
  document.getElementById('quiz-progress-text').textContent = `${current + 1} / ${total}`;
  document.getElementById('quiz-progress-bar').style.width  = `${(current / total) * 100}%`;

  // Badge
  const badge = BADGE_CONFIG[q.type] || BADGE_CONFIG.how;
  const badgeEl = document.getElementById('quiz-badge');
  badgeEl.textContent = badge.label;
  badgeEl.className   = `quiz-badge ${badge.cls}`;

  // Sentence with highlight
  const highlighted = q.sentence.replace(
    /\{(.+?)\}/g,
    '<span class="quiz-highlight">$1</span>'
  );
  document.getElementById('quiz-sentence').innerHTML = highlighted;

  // Question
  document.getElementById('quiz-question').textContent = q.question;

  // Options
  document.querySelectorAll('.quiz-option').forEach((btn, i) => {
    btn.textContent  = q.options[i];
    btn.className    = 'quiz-option';
    btn.disabled     = false;
  });

  // Reset explain + next btn
  const explain = document.getElementById('quiz-explain');
  explain.classList.add('hidden');
  explain.className = 'quiz-explain hidden';

  document.getElementById('quiz-next-btn').classList.add('hidden');
}

function onAnswer(chosenIdx) {
  if (answered) return;
  answered = true;

  const q       = questions[current];
  const correct = chosenIdx === q.answer;

  if (correct) score++;

  // Color options
  document.querySelectorAll('.quiz-option').forEach((btn, i) => {
    btn.disabled = true;
    if (i === q.answer) {
      btn.classList.add('correct');
    } else if (i === chosenIdx && !correct) {
      btn.classList.add('wrong');
    }
  });

  // Explanation
  const explain = document.getElementById('quiz-explain');
  explain.textContent = q.explain;
  explain.className   = `quiz-explain ${correct ? 'explain-correct' : 'explain-wrong'}`;

  // Next btn
  const isLast = current === questions.length - 1;
  const nextBtn = document.getElementById('quiz-next-btn');
  nextBtn.textContent = isLast ? 'See Results 🎉' : 'Next →';
  nextBtn.classList.remove('hidden');
}

function nextQuestion() {
  current++;
  if (current >= questions.length) {
    showResult();
  } else {
    showQuestion();
  }
}

// ── Result ────────────────────────────────────────────────────────────────────
function showResult() {
  const total   = questions.length;
  const pct     = Math.round((score / total) * 100);
  const elapsed = Math.round((Date.now() - startTime) / 1000);

  let emoji, title, msg;
  if (pct === 100) {
    emoji = '🏆'; title = 'Perfect Score!'; msg = 'Outstanding! You\'re an adverb expert! 🌟';
  } else if (pct >= 80) {
    emoji = '🎉'; title = 'Great Job!'; msg = 'You really know your adverbs! Keep it up! 💪';
  } else if (pct >= 60) {
    emoji = '👍'; title = 'Good Try!'; msg = 'Getting there! Try again to beat your score. 📚';
  } else {
    emoji = '📖'; title = 'Keep Practising!'; msg = 'Review the how / when / where rules and try again! 🐾';
  }

  document.getElementById('quiz-result-emoji').textContent = emoji;
  document.getElementById('quiz-result-title').textContent = title;
  document.getElementById('quiz-result-score').textContent = `${score} / ${total}  (${pct}%)`;
  document.getElementById('quiz-result-msg').textContent   = msg;

  document.getElementById('quiz-progress-bar').style.width = '100%';
  document.getElementById('quiz-progress-text').textContent = `${total} / ${total}`;

  document.getElementById('quiz-result').classList.remove('hidden');

  // Firebase
  const userId = getUserId();
  if (userId) {
    const perfect = pct === 100;
    saveStageResult(userId, 'uk_adverbs', { score: pct * 10, time: elapsed, perfect, dialogChoice: null })
      .catch(() => {});
    if (score > 0) addScore(userId, score * 5).catch(() => {});
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

init();
