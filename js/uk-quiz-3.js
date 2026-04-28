// uk-quiz-3.js — Vocabulary boss quiz for UK chapter (stage 3)
import { getUserId, addScore, saveStageResult } from './firebase.js';

const TYPE_BADGE = {
  definition: { label: "What's the word?", cls: 'badge-when' },
  sentence:   { label: 'Fill in the blank!', cls: 'badge-how' },
};

let questions   = [];
let displayOpts = [];  // per-question: { opts: string[], correctIdx: number }
let current     = 0;
let score       = 0;
let answered    = false;
const startTime = Date.now();

// ── Boot ──────────────────────────────────────────────────────────────────────
async function init() {
  const res  = await fetch('data/questions.json');
  const data = await res.json();

  questions = shuffle([...(data.vocabulary_uk3 || [])]);

  // Pre-shuffle each question's 4 options; record correct index after shuffle
  // Data: answer is always 0 (correct = options[0])
  displayOpts = questions.map(q => {
    const opts = [...q.options];
    const correctWord = opts[0];
    shuffleArray(opts);
    return { opts, correctIdx: opts.indexOf(correctWord) };
  });

  document.getElementById('quiz-retry-btn').addEventListener('click', () => location.reload());
  document.getElementById('quiz-next-btn').addEventListener('click', nextQuestion);
  document.querySelectorAll('.quiz-option').forEach(btn => {
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

  // Word spotlight
  document.getElementById('vocab-word').textContent = q.word;

  // Badge
  const badge = TYPE_BADGE[q.type] || TYPE_BADGE.sentence;
  const badgeEl = document.getElementById('quiz-badge');
  badgeEl.textContent = badge.label;
  badgeEl.className   = `quiz-badge ${badge.cls}`;

  // Sentence with underline blank
  const rendered = q.sentence.replace(/___/g, '<span class="france-blank">______</span>');
  document.getElementById('quiz-sentence').innerHTML = rendered;

  // Options
  document.querySelectorAll('.quiz-option').forEach((btn, i) => {
    btn.textContent = d.opts[i];
    btn.className   = 'quiz-option';
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

  const q       = questions[current];
  const d       = displayOpts[current];
  const correct = chosenIdx === d.correctIdx;

  if (correct) score++;

  document.querySelectorAll('.quiz-option').forEach((btn, i) => {
    btn.disabled = true;
    if (i === d.correctIdx)               btn.classList.add('correct');
    else if (i === chosenIdx && !correct) btn.classList.add('wrong');
  });

  const explain = document.getElementById('quiz-explain');
  explain.textContent = q.explain;
  explain.className   = `quiz-explain ${correct ? 'explain-correct' : 'explain-wrong'}`;

  const isLast  = current === questions.length - 1;
  const nextBtn = document.getElementById('quiz-next-btn');
  nextBtn.textContent = isLast ? 'See Results 🏰' : 'Next →';
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
    emoji = '👑'; title = 'Castle Conquered!'; msg = 'Perfect vocabulary master! The castle is yours! 🏰✨';
  } else if (pct >= 80) {
    emoji = '🎉'; title = 'Great Job!'; msg = 'You stormed the castle! Keep building that vocabulary! 💪';
  } else if (pct >= 60) {
    emoji = '⚔️'; title = 'Good Fight!'; msg = 'The castle put up a battle — try again to claim victory! 📚';
  } else {
    emoji = '🛡️'; title = 'Keep Practising!'; msg = 'Review the word list and charge again! You\'ve got this! 🐾';
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
    saveStageResult(userId, 'uk_vocabulary', { score: pct * 10, time: elapsed, perfect: pct === 100, dialogChoice: null })
      .catch(() => {});
    if (score > 0) addScore(userId, score * 5).catch(() => {});
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function shuffle(arr) {
  shuffleArray(arr);
  return arr;
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

init();
