// academy.js — 書院頁面邏輯
import { getUserId, loadCurrentTeam } from './firebase.js';

// ── Player state ──────────────────────────────────────────────────────────────
let playerNickname = '主公';
let playerHeroId   = 'liubei';

// ── Story state ───────────────────────────────────────────────────────────────
let stories        = [];
let activeStory    = null;
let currentNodeKey = 'start';
let nodeHistory    = [];
let twTimer        = null;

// ── Speaker config ────────────────────────────────────────────────────────────
const SPEAKER_COLOR = {
  zhugeliang: 'oklch(0.52 0.13 165)',
  liubei:     'oklch(0.50 0.10 250)',
  caocao:     'oklch(0.40 0.08 30)',
  zhangfei:   'oklch(0.45 0.10 20)',
  guanyu:     'oklch(0.42 0.09 160)',
  narrator:   'oklch(0.58 0.014 65)',
  player:     'oklch(0.65 0.10 80)',
};

function speakerColor(id) {
  return SPEAKER_COLOR[id] || 'oklch(0.52 0.13 165)';
}

function speakerDisplayName(id, jsonName) {
  if (id === 'player') return `你（${playerNickname}）`;
  return jsonName || id;
}

function speakerImgSrc(id) {
  if (id === 'narrator') return null;
  const heroId = id === 'player' ? playerHeroId : id;
  return `assets/heroes/hero_${heroId}_base.png`;
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  const userId = getUserId();
  if (!userId) { location.href = 'index.html'; return; }

  // 取暱稱（同 index.js 的做法）
  const parts = userId.split('_');
  playerNickname = parts.slice(0, -1).join('_');

  // 取玩家隊長英雄
  try {
    const team = await loadCurrentTeam(userId);
    if (team && team.length > 0) playerHeroId = team[0];
  } catch (_) { /* 保持 default */ }

  // 讀故事資料
  try {
    stories = await fetch('data/academy-stories.json').then(r => r.json());
  } catch (e) {
    console.error('載入故事失敗', e);
    stories = [];
  }

  showPhase('intro');
}

// ── Phase ─────────────────────────────────────────────────────────────────────
function showPhase(phase) {
  const content = document.getElementById('academy-content');
  const btnBack  = document.getElementById('btn-back');
  const btnRight = document.getElementById('btn-return-select');

  // 右側按鈕只在 story 階段顯示
  btnRight.style.visibility = phase === 'story' ? 'visible' : 'hidden';

  // 返回行為
  btnBack.onclick = () => {
    if (phase === 'story')        showPhase('select');
    else if (phase === 'select')  showPhase('intro');
    else                          location.href = 'index.html';
  };
  btnRight.onclick = () => showPhase('select');

  // 淡出 → 換內容 → 淡入
  content.classList.add('fading');
  setTimeout(() => {
    clearInterval(twTimer);
    if (phase === 'intro')  renderIntro(content);
    if (phase === 'select') renderSelect(content);
    if (phase === 'story')  renderStory(content);
    content.classList.remove('fading');
  }, 250);
}

// ── Typewriter ────────────────────────────────────────────────────────────────
function typewrite(el, text, speed, onDone) {
  clearInterval(twTimer);
  el.textContent = '';
  el.classList.add('is-typing');

  const cursor = document.createElement('span');
  cursor.className = 'tw-cursor';
  el.appendChild(cursor);

  let i = 0;
  twTimer = setInterval(() => {
    i++;
    el.textContent = text.slice(0, i);
    el.appendChild(cursor);
    if (i >= text.length) {
      clearInterval(twTimer);
      cursor.remove();
      el.classList.remove('is-typing');
      onDone?.();
    }
  }, speed);

  // 點擊跳過
  el.onclick = () => {
    clearInterval(twTimer);
    cursor.remove();
    el.textContent = text;
    el.classList.remove('is-typing');
    el.onclick = null;
    onDone?.();
  };
}

// ── Intro ─────────────────────────────────────────────────────────────────────
function renderIntro(container) {
  container.innerHTML = `
    <div class="academy-cover-wrap">
      <img src="assets/characters/academy_cover.png" alt="書院" class="academy-cover-img"
           onerror="this.style.display='none'">
    </div>
    <div class="scene-atmosphere">成語故事 · 書院</div>
    <div class="academy-dialog">
      <div class="dialog-header">
        <span class="speaker-name" style="color:oklch(0.52 0.13 165)">諸葛亮</span>
        <div class="speaker-line" style="background:oklch(0.52 0.13 165 / 0.18)"></div>
      </div>
      <div class="dialog-text" id="intro-text"></div>
      <div id="intro-actions"></div>
    </div>
  `;

  typewrite(
    document.getElementById('intro-text'),
    '玉不琢，不成器。今日，你想雕哪一段故事？',
    45,
    () => {
      document.getElementById('intro-actions').innerHTML = `
        <div class="dialog-choices" style="margin-top:18px">
          <button class="intro-enter-btn" id="btn-enter">進入成語故事 →</button>
        </div>
      `;
      document.getElementById('btn-enter').onclick = () => showPhase('select');
    }
  );
}

// ── Select ────────────────────────────────────────────────────────────────────
function renderSelect(container) {
  const cards = stories.map(s => `
    <button class="story-card" data-id="${s.id}">
      <span class="story-card-title">${s.title}</span>
      <span class="story-card-sub">${s.subtitle} · ${s.idiom}</span>
    </button>
  `).join('');

  container.innerHTML = `
    <div class="academy-character" style="min-height:140px;max-height:200px;">
      <div class="character-silhouette" style="opacity:0.55">
        <img src="assets/heroes/hero_zhugeliang_base.png" alt="諸葛亮"
             class="character-img" style="height:160px"
             onerror="this.style.display='none'">
      </div>
    </div>
    <div class="scene-atmosphere">成語故事 · 書院</div>
    <div class="academy-dialog">
      <span class="story-select-label">選擇一段成語故事</span>
      ${cards}
    </div>
  `;

  container.querySelectorAll('.story-card').forEach(btn => {
    btn.onclick = () => {
      activeStory    = stories.find(s => s.id === btn.dataset.id);
      currentNodeKey = 'start';
      nodeHistory    = ['start'];
      showPhase('story');
    };
  });
}

// ── Story ─────────────────────────────────────────────────────────────────────
function renderStory(container) {
  const node   = activeStory.nodes[currentNodeKey];
  const color  = speakerColor(node.speaker);
  const name   = speakerDisplayName(node.speaker, node.speakerName);
  const imgSrc = speakerImgSrc(node.speaker);

  const imgHtml = imgSrc
    ? `<img src="${imgSrc}" alt="${name}" class="character-img"
            onerror="this.style.display='none'">`
    : '';

  // Progress dots
  const total  = Object.keys(activeStory.nodes).length;
  const visited = nodeHistory.length;
  const dots = Array.from({ length: Math.max(total, visited) }).map((_, i) => {
    const cls = i < visited - 1 ? 'visited' : i === visited - 1 ? 'current' : '';
    return `<div class="progress-dot ${cls}"></div>`;
  }).join('');

  const endingExtra = node.ending ? `
    <div style="margin-top:14px;text-align:center;">
      <div class="ending-idiom">${activeStory.idiom}</div>
      <div class="ending-meaning">${activeStory.idiom_meaning}</div>
    </div>
  ` : '';

  container.innerHTML = `
    <div class="academy-character">
      <div class="character-silhouette entering">${imgHtml}</div>
    </div>
    <div class="scene-atmosphere">${activeStory.title} · ${activeStory.subtitle}</div>
    <div class="academy-dialog">
      <div class="story-progress">${dots}</div>
      <div class="dialog-header">
        <span class="speaker-name" style="color:${color}">${name}</span>
        <div class="speaker-line" style="background:${color.replace(')', ' / 0.18)')}"></div>
      </div>
      <div class="dialog-text" id="story-text"></div>
      <div id="story-actions"></div>
      ${endingExtra}
    </div>
  `;

  typewrite(
    document.getElementById('story-text'),
    node.text,
    38,
    () => renderActions(document.getElementById('story-actions'), node)
  );
}

function renderActions(container, node) {
  if (node.choices) {
    const btns = node.choices.map((c, i) => `
      <button class="choice-btn" data-next="${c.next}">
        <span class="choice-index">${['一','二','三','四'][i]}</span>
        ${c.text}
      </button>
    `).join('');
    container.innerHTML = `<div class="dialog-choices" style="margin-top:14px">${btns}</div>`;
    container.querySelectorAll('.choice-btn').forEach(btn => {
      btn.onclick = () => advance(btn.dataset.next);
    });

  } else if (node.ending) {
    container.innerHTML = `
      <div class="dialog-choices" style="margin-top:14px">
        <div class="ending-card">
          <div class="ending-symbol">${node.ending_type === 'true' ? '✦' : '○'}</div>
          <div class="ending-label">${node.ending_type === 'true' ? '最佳結局' : '另一結局'}</div>
        </div>
        <button class="restart-btn" id="btn-restart">↩ 再讀一次</button>
      </div>
    `;
    document.getElementById('btn-restart').onclick = () => {
      currentNodeKey = 'start';
      nodeHistory    = ['start'];
      renderStory(document.getElementById('academy-content'));
    };

  } else {
    container.innerHTML = `
      <button class="next-btn" id="btn-next">
        繼續 <span style="font-size:16px;line-height:1">›</span>
      </button>
    `;
    document.getElementById('btn-next').onclick = () => advance(node.next);
  }
}

function advance(nextKey) {
  currentNodeKey = nextKey;
  nodeHistory.push(nextKey);
  const content = document.getElementById('academy-content');
  content.classList.add('fading');
  setTimeout(() => {
    renderStory(content);
    content.classList.remove('fading');
  }, 250);
}

// ── Boot ──────────────────────────────────────────────────────────────────────
init();
