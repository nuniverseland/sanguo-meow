// gacha.js — Gacha page logic
import { getUserId, loadGachaState, executeGachaDraw } from './firebase.js';

// 抽卡池（不含初始解鎖英雄）
const GACHA_POOL    = ['guanyu', 'zhangfei', 'zhangjiu'];
// 初始英雄（不進抽卡池，但顯示在圖鑑）
const INITIAL_HEROES = ['liubei', 'soldier'];
// 所有英雄（抽卡頁展示順序）
const ALL_HEROES = ['liubei', 'soldier', 'guanyu', 'zhangfei', 'zhangjiu'];

// Hero static info（不從 JSON 載就不需 async）
const HERO_META = {
  liubei:   { name: '大耳喵',  role: '仁義肉盾',  initial: true },
  soldier:  { name: '小兵喵',  role: '量產基礎',   initial: true },
  guanyu:   { name: '紳士喵',  role: '遠程輸出',   initial: false },
  zhangfei: { name: '重擊喵',  role: '近戰暴力',   initial: false },
  zhangjiu: { name: '強壯喵',  role: '鐵壁肉盾',   initial: false },
};

// ── State ─────────────────────────────────────────────────────────────────────
let gachaState = null;
let userId     = null;

// ── Boot ─────────────────────────────────────────────────────────────────────
async function init() {
  userId = getUserId();
  if (!userId) {
    location.href = 'index.html';
    return;
  }

  try {
    gachaState = await loadGachaState(userId);
    // 初始英雄視為已擁有
    for (const h of INITIAL_HEROES) {
      if (!gachaState.heroes[h]) {
        gachaState.heroes[h] = { heroId: h, soulFragments: 0, maxUnlocked: false };
      }
    }
  } catch (e) {
    console.error('載入抽卡資料失敗', e);
    gachaState = { scrolls: 0, pityCount: 0, totalDraws: 0, heroes: {} };
  }

  renderAll();
  bindButtons();

  document.getElementById('gacha-loading').classList.add('hidden');
  document.getElementById('gacha-main').classList.remove('hidden');
}

// ── Render ───────────────────────────────────────────────────────────────────
function renderAll() {
  updateScrollDisplay();
  renderHeroPool();
  renderPity();
  renderFragments();
}

function updateScrollDisplay() {
  document.getElementById('g-scrolls').textContent = `🎴 ${gachaState.scrolls} 卷`;
}

function renderHeroPool() {
  const grid = document.getElementById('hero-pool-grid');
  grid.innerHTML = '';

  ALL_HEROES.forEach(heroId => {
    const meta    = HERO_META[heroId];
    const heroData = gachaState.heroes[heroId];
    const isOwned = meta.initial || !!heroData;
    const isMax   = heroData?.maxUnlocked;

    const card = document.createElement('div');
    card.className = `hero-card ${isOwned ? 'owned' : 'not-owned'}`;

    const imgEl = isOwned
      ? `<img class="hero-card-img" src="assets/heroes/hero_${heroId}_base.png"
              onerror="this.outerHTML='<div class=hero-card-shadow>🐱</div>'"
              alt="${meta.name}">`
      : `<div class="hero-card-shadow">❓</div>`;

    card.innerHTML = `
      ${meta.initial ? '<span class="hero-card-initial">初始</span>' : ''}
      ${isOwned && isMax ? '<span class="hero-card-badge max">MAX</span>' : ''}
      ${isOwned && !isMax && !meta.initial ? '<span class="hero-card-badge">已擁有</span>' : ''}
      ${imgEl}
      <div class="hero-card-name">${isOwned ? meta.name : '???'}</div>
      <div class="hero-card-role">${isOwned ? meta.role : '未解鎖'}</div>
    `;
    grid.appendChild(card);
  });
}

function renderPity() {
  const pity    = gachaState.pityCount ?? 0;
  const remain  = 10 - pity;
  const fillPct = (pity / 10) * 100;
  document.getElementById('pity-fill').style.width  = `${fillPct}%`;
  document.getElementById('pity-count').textContent = `距保底還有 ${remain} 抽`;
}

function renderFragments() {
  const grid = document.getElementById('fragments-grid');
  grid.innerHTML = '';

  GACHA_POOL.forEach(heroId => {
    const meta    = HERO_META[heroId];
    const heroData = gachaState.heroes[heroId];
    if (!heroData) return; // 未擁有不顯示碎片

    const frags  = heroData.soulFragments ?? 0;
    const isMax  = heroData.maxUnlocked;

    const item = document.createElement('div');
    item.className = 'fragment-item';
    item.innerHTML = `
      <div class="fragment-name">${meta.name}碎片</div>
      <div class="fragment-bar-bg">
        <div class="fragment-bar-fill" style="width:${Math.min(frags/10*100,100)}%"></div>
      </div>
      <div class="fragment-count">
        ${isMax
          ? '<span class="fragment-max">✨ MAX 解鎖！</span>'
          : `${frags} / 10`}
      </div>
    `;
    grid.appendChild(item);
  });

  if (!grid.children.length) {
    grid.innerHTML = '<div style="color:var(--text-dim);font-size:.85rem">抽到英雄後才會顯示碎片進度</div>';
  }
}

// ── Draw buttons ──────────────────────────────────────────────────────────────
function bindButtons() {
  document.getElementById('btn-draw-1').addEventListener('click', () => doDraw(1));
  document.getElementById('btn-draw-10').addEventListener('click', () => doDraw(10));
  document.getElementById('btn-result-close').addEventListener('click', closeResult);
}

async function doDraw(count) {
  const cost = count === 10 ? 45 : 5;
  if (gachaState.scrolls < cost) {
    alert(`卷軸不足！需要 ${cost} 卷，目前只有 ${gachaState.scrolls} 卷`);
    return;
  }

  // Disable buttons during draw
  setDrawDisabled(true);
  showAnim(true);

  try {
    const txResult = await executeGachaDraw(userId, count, GACHA_POOL, gachaState);

    // Update local state
    gachaState.scrolls   = txResult.newScrolls;
    gachaState.pityCount = 0; // server handles pity; reset local as approximation

    // Merge newly obtained heroes into local state
    for (const r of txResult.results) {
      if (r.isNew) {
        gachaState.heroes[r.heroId] = { heroId: r.heroId, soulFragments: 0, maxUnlocked: false };
      } else {
        if (gachaState.heroes[r.heroId]) {
          gachaState.heroes[r.heroId].soulFragments =
            (gachaState.heroes[r.heroId].soulFragments ?? 0) + 1;
        }
      }
    }

    showAnim(false);
    await showResults(txResult.results, txResult.scrollBack);
    renderAll();
  } catch (e) {
    showAnim(false);
    alert(e.message || '抽卡失敗，請重試');
  } finally {
    setDrawDisabled(false);
  }
}

function setDrawDisabled(disabled) {
  document.getElementById('btn-draw-1').disabled  = disabled;
  document.getElementById('btn-draw-10').disabled = disabled;
}

function showAnim(show) {
  document.getElementById('draw-anim').classList.toggle('hidden', !show);
}

// ── Result display ────────────────────────────────────────────────────────────
async function showResults(results, scrollBack) {
  const container = document.getElementById('result-cards');
  container.innerHTML = '';

  // Track frag count per hero for labelling
  const fragCount = {};
  results.forEach(r => {
    if (!r.isNew) fragCount[r.heroId] = (fragCount[r.heroId] || 0) + 1;
  });

  for (let i = 0; i < results.length; i++) {
    await new Promise(resolve => setTimeout(resolve, results.length > 1 ? 250 : 0));

    const r    = results[i];
    const meta = HERO_META[r.heroId];
    const card = document.createElement('div');
    card.className = `result-card${r.isNew ? ' is-new' : ''}`;
    card.style.animationDelay = `${i * 0.08}s`;

    let tagHTML = '';
    if (r.isNew)          tagHTML = '<span class="result-card-tag new">✨ 新英雄！</span>';
    else if (scrollBack)  tagHTML = '<span class="result-card-tag refund">🎴×2 退還</span>';
    else                  tagHTML = '<span class="result-card-tag frag">💜 碎片</span>';

    card.innerHTML = `
      <img src="assets/heroes/hero_${r.heroId}_base.png"
           onerror="this.outerHTML='<div style=font-size:2rem>🐱</div>'"
           alt="${meta.name}">
      <div class="result-card-name">${meta.name}</div>
      ${tagHTML}
    `;
    container.appendChild(card);
  }

  if (scrollBack > 0) {
    const note = document.createElement('div');
    note.style.cssText = 'width:100%;text-align:center;font-size:.85rem;color:var(--gold);margin-top:4px;';
    note.textContent = `英雄已達 MAX！退還 🎴 × ${scrollBack} 卷`;
    container.appendChild(note);
  }

  document.getElementById('result-overlay').classList.remove('hidden');
}

function closeResult() {
  document.getElementById('result-overlay').classList.add('hidden');
}

// ── Start ─────────────────────────────────────────────────────────────────────
init();
