// index.js — Login + Stage Select + Chapter/Country Tab navigation
import { getUserId, setUserId, loadOrCreateUser, getProgress, loadUserScrolls } from './firebase.js';

// ── Static config ─────────────────────────────────────────────────────────────
const CHAPTER_ORDER = ['asia', 'europe', 'america', 'space', 'final'];

const CHAPTER_CONFIG = {
  asia:    { label: '🌏 亞洲篇', countries: ['taiwan', 'japan'] },
  europe:  { label: '🌍 歐洲篇', countries: ['uk', 'france', 'germany'] },
  america: { label: '🌎 美洲篇', countries: ['usa', 'brazil'] },
  space:   { label: '🚀 宇宙',   countries: [] },
  final:   { label: '⚔️ 終章',   countries: [] },
};

const COUNTRY_LABELS = {
  taiwan:  '🇹🇼 台灣',
  japan:   '🇯🇵 日本',
  uk:      '🇬🇧 英國',
  france:  '🇫🇷 法國',
  germany: '🇩🇪 德國',
  usa:     '🇺🇸 美國',
  brazil:  '🇧🇷 巴西',
};

// ── State ─────────────────────────────────────────────────────────────────────
let stagesData     = null;
let enemiesData    = null;
let progress       = {};
let userData       = null;
let currentChapter = 'asia';
let currentCountry = 'taiwan';

// ── Boot ─────────────────────────────────────────────────────────────────────
async function init() {
  const userId = getUserId();
  if (userId) {
    showScreen('stage-screen');
    await enterGame(userId);
  } else {
    showScreen('login-screen');
    document.getElementById('btn-login').addEventListener('click', onLogin);
    document.getElementById('input-birthday').addEventListener('keydown', e => {
      if (e.key === 'Enter') onLogin();
    });
  }
}

async function onLogin() {
  const btn      = document.getElementById('btn-login');
  const nickname = document.getElementById('input-nickname').value.trim();
  const birthday = document.getElementById('input-birthday').value.trim();
  if (!nickname || !/^\d{4}$/.test(birthday)) {
    alert('請輸入暱稱和4位數生日（例：0301）');
    return;
  }
  btn.textContent = '登入中…';
  btn.disabled    = true;
  try {
    const userId = setUserId(nickname, birthday);
    userData     = await loadOrCreateUser(userId, nickname, birthday);
    showScreen('stage-screen');
    await enterGame(userId);
  } catch (e) {
    btn.textContent = '出發！🐾';
    btn.disabled    = false;
    alert('登入失敗，請確認網路連線');
    console.error(e);
  }
}

async function enterGame(userId) {
  try {
    const [stages, enemies, prog, user] = await Promise.all([
      fetch('data/stages.json').then(r => r.json()),
      fetch('data/enemies.json').then(r => r.json()),
      getProgress(userId).catch(() => ({})),
      loadUserScrolls(userId).catch(() => ({}))
    ]);
    stagesData  = stages;
    enemiesData = enemies;
    progress    = prog;
    userData    = { ...(userData || {}), ...user };
  } catch (e) {
    stagesData = stagesData || [];
    progress   = {};
  }

  // Navbar
  const parts = userId.split('_');
  const nick  = parts.slice(0, -1).join('_');
  document.getElementById('display-nickname').textContent = `🐾 ${nick}`;
  document.getElementById('display-score').textContent    = `總分：${userData?.totalScore ?? 0}`;
  document.getElementById('display-scrolls').textContent  = `🎴 ${userData?.scrolls ?? 0} 卷`;

  // Gacha button
  const gachaBtn = document.getElementById('btn-gacha');
  gachaBtn.replaceWith(gachaBtn.cloneNode(true));
  document.getElementById('btn-gacha').addEventListener('click', () => {
    location.href = 'gacha.html';
  });

  // Logout
  const logoutBtn = document.getElementById('btn-logout');
  logoutBtn.replaceWith(logoutBtn.cloneNode(true));
  document.getElementById('btn-logout').addEventListener('click', () => {
    sessionStorage.removeItem('nunuUserId');
    location.reload();
  });

  // 背景設在 world-map（讓 tabs 有獨立背景不被蓋掉）
  document.getElementById('world-map').style.cssText +=
    ';background:url("assets/backgrounds/bg_main.jpg?v=2") center 20% / cover no-repeat;';

  buildChapterTabs();
  buildCountryTabs(currentChapter);
  renderStages();
}

// ── Unlock logic ──────────────────────────────────────────────────────────────
function isChapterUnlocked(chapter) {
  if (!stagesData) return chapter === 'asia';
  switch (chapter) {
    case 'asia':    return true;
    case 'europe':  return allChapterCleared('asia');
    case 'america': return allChapterCleared('europe');
    case 'space':   return allChapterCleared('asia');
    case 'final':   return allChapterCleared('space');
    default:        return false;
  }
}

function isCountryUnlocked(chapter, country) {
  if (!isChapterUnlocked(chapter)) return false;
  const countries = CHAPTER_CONFIG[chapter]?.countries || [];
  const idx = countries.indexOf(country);
  if (idx < 0) return false;
  if (idx === 0) return true;
  return allCountryCleared(chapter, countries[idx - 1]);
}

function allChapterCleared(chapter) {
  if (!stagesData) return false;
  const chStages = stagesData.filter(s => s.chapter === chapter);
  if (!chStages.length) return false;
  return chStages.every(s => progress[s.id]?.completed);
}

function allCountryCleared(chapter, country) {
  if (!stagesData) return false;
  const cStages = stagesData.filter(s => s.chapter === chapter && s.country === country);
  if (!cStages.length) return false;
  return cStages.every(s => progress[s.id]?.completed);
}

// ── Chapter Tabs ──────────────────────────────────────────────────────────────
function buildChapterTabs() {
  const tabsEl = document.getElementById('chapter-tabs');
  tabsEl.innerHTML = '';

  CHAPTER_ORDER.forEach(id => {
    const cfg      = CHAPTER_CONFIG[id];
    const unlocked = isChapterUnlocked(id);
    const btn      = document.createElement('button');
    btn.className        = `chapter-tab${id === currentChapter ? ' active' : ''}${!unlocked ? ' locked' : ''}`;
    btn.dataset.chapter  = id;
    btn.textContent      = cfg.label;
    if (!unlocked) btn.disabled = true;

    if (unlocked) {
      btn.addEventListener('click', () => {
        if (id === currentChapter) return;
        currentChapter = id;
        currentCountry = CHAPTER_CONFIG[id].countries[0] || '';
        buildChapterTabs();
        buildCountryTabs(id);
        switchCountry(currentCountry);
      });
    }
    tabsEl.appendChild(btn);
  });
}

// ── Country Tabs ──────────────────────────────────────────────────────────────
function buildCountryTabs(chapter) {
  const wrap     = document.getElementById('country-tabs-wrap');
  wrap.innerHTML = '';
  const countries = CHAPTER_CONFIG[chapter]?.countries || [];
  if (!countries.length) return;

  const div = document.createElement('div');
  div.className = 'country-tabs';

  countries.forEach(country => {
    const unlocked = isCountryUnlocked(chapter, country);
    const btn      = document.createElement('button');
    btn.className       = `country-tab${country === currentCountry ? ' active' : ''}${!unlocked ? ' locked' : ''}`;
    btn.dataset.country = country;
    btn.textContent     = COUNTRY_LABELS[country] || country;
    if (!unlocked) btn.disabled = true;

    if (unlocked) {
      btn.addEventListener('click', () => {
        if (country === currentCountry) return;
        currentCountry = country;
        buildCountryTabs(chapter);
        switchCountry(country);
      });
    }
    div.appendChild(btn);
  });

  wrap.appendChild(div);
}

// ── Stage rendering ───────────────────────────────────────────────────────────
function switchCountry(country) {
  const stageList           = document.getElementById('stage-list');
  stageList.style.opacity   = '0';
  stageList.style.transition = 'opacity 0.25s';
  setTimeout(() => {
    renderStages(currentChapter, country);
    stageList.style.opacity = '1';
  }, 250);
}

function getStageRepEnemy(stage) {
  const schedule = stage.spawnSchedule || [];
  const bossEntry = schedule.find(e => enemiesData?.find(en => en.id === e.enemy && en.type === 'boss'));
  const entry     = bossEntry || schedule[schedule.length - 1];
  return enemiesData?.find(en => en.id === entry?.enemy);
}

function renderStages(chapter = currentChapter, country = currentCountry) {
  const list     = document.getElementById('stage-list');
  list.innerHTML = '';

  const filtered = (stagesData || []).filter(s =>
    s.chapter === chapter && s.country === country
  );

  filtered.forEach(stage => {
    const unlocked = !stage.unlockRequire || progress[stage.unlockRequire]?.completed;
    const cleared  = progress[stage.id]?.completed;
    const repEnemy = getStageRepEnemy(stage);
    const isBoss   = repEnemy?.type === 'boss';
    const enemyImg = repEnemy
      ? `<img class="stage-enemy-img" src="${repEnemy.imgWalk}" alt="${repEnemy.name}" onerror="this.style.display='none'">`
      : '';

    const card = document.createElement('div');
    card.className = `stage-card${unlocked ? '' : ' locked'}${isBoss ? ' boss' : ''}`;
    card.innerHTML = `
      ${enemyImg}
      <div class="stage-title">${stage.name}</div>
      <div class="stage-story">${stage.storyText}</div>
      ${cleared   ? `<div class="stage-cleared">✅</div>` : ''}
      ${!unlocked ? `<div class="stage-lock">🔒 先完成上一關</div>` : ''}
    `;

    if (unlocked) {
      card.addEventListener('click', () => {
        sessionStorage.setItem('currentStageId', stage.id);
        location.href = 'game.html';
      });
    }
    list.appendChild(card);
  });
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

init();
