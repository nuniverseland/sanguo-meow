// uk-quiz-2.js — Fill-in-the-blank adverb/adjective quiz for UK chapter (stage 2)
import { getUserId, addScore, saveStageResult } from './firebase.js';

const TOPIC_BADGE = {
  adverb_how:        { label: 'Adverb — how?',      cls: 'badge-how' },
  adverb_when_where: { label: 'Adverb — when/where?', cls: 'badge-when' },
  adj_vs_adverb:     { label: 'Adjective or adverb?', cls: 'badge-adjective' },
  review:            { label: 'Review',              cls: 'badge-where' },
  writing_context:   { label: 'Best choice',         cls: 'badge-adjective' },
};

let questions   = [];   // shuffled question list
let displayOpts = [];   // per-question: { opts: [str, str], correctIdx: 0|1 }
let current     = 0;
let score       = 0;
let answered    = false;
const startTime = Date.now();

// ── Boot ──────────────────────────────────────────────────────────────────────
async function init() {
  const res  = await fetch('data/questions.json');
  const data = await res.json();

  // Shuffle question order
  questions = shuffle([...(data.adverbs_uk_2 || [])]);

  // Pre-compute per-question shuffled options
  // Data: answer is always 0 (options[0] is correct)
  // Randomly swap so correct isn't always on the left
  displayOpts = questions.map(q => {
    const swapped = Math.random() < 0.5;
    return {
      opts:       swapped ? [q.options[1], q.options[0]] : [q.options[0], q.options[1]],
      correctIdx: swapped ? 1 : 0,
    };
  });

  document.getElementById('quiz-retry-btn').addEventListener('click', () => location.reload());
  document.getElementById('quiz-next-btn').addEventListener('click', nextQuestion);
  document.querySelectorAll('.france-option').forEach(btn => {
    btn.addEventListener('click', () => onAnswer(Number(btn.dataset.idx)));
  });

  showQuestion();
}

// ── Render ────────────────────────────────────────────────────────────────────
function showQuestion() {
  const q     = questions[current];
  const d     = displayOpts[current];
  const total = questions.length;
  answered    = false;

  // Progress
  document.getElementById('quiz-progress-text').textContent = `${current + 1} / ${total}`;
  document.getElementById('quiz-progress-bar').style.width  = `${(current / total) * 100}%`;

  // Badge
  const badge = TOPIC_BADGE[q.topic] || TOPIC_BADGE.review;
  const badgeEl = document.getElementById('quiz-badge');
  badgeEl.textContent = badge.label;
  badgeEl.className   = `quiz-badge ${badge.cls}`;

  // Sentence: replace ___ with styled underline span
  const rendered = q.sentence.replace(/___/g, '<span class="france-blank">______</span>');
  document.getElementById('quiz-sentence').innerHTML = rendered;

  // Options
  document.querySelectorAll('.france-option').forEach((btn, i) => {
    btn.textContent = d.opts[i];
    btn.className   = 'france-option';
    btn.disabled    = false;
  });

  // Reset explain + next
  const explain = document.getElementById('quiz-explain');
  explain.classList.add('hidden');
  explain.className = 'quiz-explain hidden';
  document.getElementById('quiz-next-btn').classList.add('hidden');
}

function onAnswer(chosenIdx) {
  if (answered) return;
  answered = true;

  const q          = questions[current];
  const d          = displayOpts[current];
  const correct    = chosenIdx === d.correctIdx;

  if (correct) score++;

  // Color buttons
  document.querySelectorAll('.france-option').forEach((btn, i) => {
    btn.disabled = true;
    if (i === d.correctIdx)               btn.classList.add('correct');
    else if (i === chosenIdx && !correct) btn.classList.add('wrong');
  });

  // Explanation
  const explain = document.getElementById('quiz-explain');
  explain.textContent = q.explain;
  explain.className   = `quiz-explain ${correct ? 'explain-correct' : 'explain-wrong'}`;

  // Next
  const isLast  = current === questions.length - 1;
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
    emoji = '🏆'; title = 'Perfect Score!'; msg = 'You nailed every adverb and adjective! 🌟';
  } else if (pct >= 80) {
    emoji = '🎉'; title = 'Great Job!'; msg = 'You\'ve got a strong feel for adverbs! 💪';
  } else if (pct >= 60) {
    emoji = '👍'; title = 'Good Try!'; msg = 'Remember: adverbs describe verbs, adjectives describe nouns. 📚';
  } else {
    emoji = '📖'; title = 'Keep Practising!'; msg = 'Tip: if it ends in -ly, it\'s usually an adverb! 🐾';
  }

  document.getElementById('quiz-result-emoji').textContent = emoji;
  document.getElementById('quiz-result-title').textContent = title;
  document.getElementById('quiz-result-score').textContent = `${score} / ${total}  (${pct}%)`;
  document.getElementById('quiz-result-msg').textContent   = msg;

  document.getElementById('quiz-progress-bar').style.width  = '100%';
  document.getElementById('quiz-progress-text').textContent = `${total} / ${total}`;

  document.getElementById('quiz-result').classList.remove('hidden');

  const userId = getUserId();
  if (userId) {
    const perfect = pct === 100;
    saveStageResult(userId, 'uk_adverbs_2', { score: pct * 10, time: elapsed, perfect, dialogChoice: null })
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
