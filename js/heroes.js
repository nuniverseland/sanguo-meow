// heroes.js — Hero encyclopedia page
import { getUserId, loadOwnedHeroes } from './firebase.js';

// 初始英雄（不需抽卡）
const INITIAL_HEROES = new Set(['liubei', 'soldier']);
const EXP_PER_LEVEL  = 1000;
const FORM_UNLOCK_LEVEL = 10; // 中間形態解鎖等級
const FRAG_TO_MAX    = 10;    // 幾片碎片解鎖 MAX

let heroesJson = [];   // heroes.json 靜態資料
let ownedMap   = {};   // Firebase：{ heroId: { level, exp, currentForm, soulFragments, maxUnlocked } }
let currentFilter = 'all';

// ── Boot ─────────────────────────────────────────────────────────────────────
async function init() {
  const userId = getUserId();
  if (!userId) { location.href = 'index.html'; return; }

  try {
    [heroesJson, ownedMap] = await Promise.all([
      fetch('data/heroes.json').then(r => r.json()),
      loadOwnedHeroes(userId).catch(() => ({}))
    ]);
    // 初始英雄如果 Firebase 還沒建立 doc，給預設值
    for (const id of INITIAL_HEROES) {
      if (!ownedMap[id]) {
        ownedMap[id] = { heroId: id, exp: 0, level: 1, currentForm: 0, soulFragments: 0, maxUnlocked: false };
      }
    }
  } catch (e) {
    console.error('載入英雄資料失敗', e);
  }

  bindFilter();
  renderGrid('all');

  document.getElementById('heroes-loading').classList.add('hidden');
  document.getElementById('heroes-main').classList.remove('hidden');
}

// ── Filter ───────────────────────────────────────────────────────────────────
function bindFilter() {
  document.getElementById('heroes-filter').addEventListener('click', e => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    renderGrid(currentFilter);
  });
}

// ── Grid ─────────────────────────────────────────────────────────────────────
function renderGrid(filter) {
  const grid = document.getElementById('heroes-grid');
  grid.innerHTML = '';

  const list = heroesJson.filter(h => {
    const owned = isOwned(h.id);
    if (filter === 'owned')  return owned;
    if (filter === 'locked') return !owned;
    return true;
  });

  if (!list.length) {
    grid.innerHTML = '<div class="heroes-empty">沒有符合條件的英雄</div>';
    return;
  }

  list.forEach(h => {
    const owned    = isOwned(h.id);
    const fireData = ownedMap[h.id] || {};
    const formIdx  = resolveFormIdx(h, fireData);
    const form     = h.forms[formIdx];
    const level    = calcLevel(fireData.exp ?? 0);
    const expInLv  = (fireData.exp ?? 0) % EXP_PER_LEVEL;
    const pct      = (expInLv / EXP_PER_LEVEL) * 100;

    const card = document.createElement('div');
    card.className = `hero-list-card${owned ? ' owned' : ' locked'}`;
    card.dataset.heroId = h.id;

    if (owned) {
      card.innerHTML = `
        <div class="hlc-img-wrap">
          <img src="assets/heroes/hero_${h.id}_base.png"
               alt="${h.nameLine[0]}"
               onerror="this.outerHTML='<div class=hlc-emoji>🐱</div>'">
          ${INITIAL_HEROES.has(h.id) ? '<span class="hlc-badge initial">初始</span>' : ''}
          ${fireData.maxUnlocked ? '<span class="hlc-badge max">MAX</span>' : ''}
        </div>
        <div class="hlc-info">
          <div class="hlc-name">${h.nameLine[formIdx]}</div>
          <div class="hlc-form">${formName(formIdx)}</div>
          <div class="hlc-level">Lv.${level}</div>
          <div class="hlc-exp-bar-bg">
            <div class="hlc-exp-bar-fill" style="width:${pct}%"></div>
          </div>
          <div class="hlc-exp-text">${expInLv} / ${EXP_PER_LEVEL}</div>
        </div>
      `;
    } else {
      card.innerHTML = `
        <div class="hlc-img-wrap locked-wrap">
          <div class="hlc-shadow">❓</div>
        </div>
        <div class="hlc-info">
          <div class="hlc-locked-label">🔒 未解鎖</div>
          <div class="hlc-locked-hint">需 5 卷軸可抽</div>
        </div>
      `;
    }

    card.addEventListener('click', () => openDetail(h.id));
    grid.appendChild(card);
  });
}

// ── Detail panel ──────────────────────────────────────────────────────────────
function openDetail(heroId) {
  const h        = heroesJson.find(x => x.id === heroId);
  const fireData = ownedMap[heroId] || {};
  const owned    = isOwned(heroId);
  const formIdx  = resolveFormIdx(h, fireData);
  const form     = h.forms[formIdx];
  const level    = calcLevel(fireData.exp ?? 0);
  const expInLv  = (fireData.exp ?? 0) % EXP_PER_LEVEL;
  const frags    = fireData.soulFragments ?? 0;

  // Header
  const imgEl = document.getElementById('detail-img');
  imgEl.src = `assets/heroes/hero_${heroId}_base.png`;
  imgEl.alt = h.nameLine[formIdx];

  document.getElementById('detail-form-name').textContent = owned ? formName(formIdx) : '未解鎖';
  document.getElementById('detail-hero-name').textContent  = owned ? h.nameLine[formIdx] : '???';
  document.getElementById('detail-role').textContent       = owned ? h.role : '';

  const expPct = ((expInLv / EXP_PER_LEVEL) * 100).toFixed(1);
  document.getElementById('detail-level').textContent     = owned ? `Lv.${level}` : '';
  document.getElementById('detail-exp-fill').style.width  = owned ? `${expPct}%` : '0%';
  document.getElementById('detail-exp-text').textContent  = owned ? `${expInLv} / ${EXP_PER_LEVEL}` : '';

  // Stats
  const statGrid = document.getElementById('detail-stats');
  if (owned) {
    statGrid.innerHTML = `
      <div class="stat-item"><span class="stat-label">❤️ HP</span><span class="stat-val">${form.hp}</span></div>
      <div class="stat-item"><span class="stat-label">⚔️ 攻擊</span><span class="stat-val">${form.atk}</span></div>
      <div class="stat-item"><span class="stat-label">🎯 範圍</span><span class="stat-val">${form.range}</span></div>
      <div class="stat-item"><span class="stat-label">💨 速度</span><span class="stat-val">${form.spd}</span></div>
      <div class="stat-item"><span class="stat-label">💰 費用</span><span class="stat-val">${form.cost}</span></div>
      <div class="stat-item"><span class="stat-label">⏱ 冷卻</span><span class="stat-val">${(form.cooldown / 1000).toFixed(1)}s</span></div>
    `;
  } else {
    statGrid.innerHTML = '<div class="stat-locked">解鎖後才能查看屬性</div>';
  }

  // Special ability
  const specialEl = document.getElementById('detail-special');
  if (owned && h.specialDesc) {
    specialEl.innerHTML = `<div class="detail-section-title">特殊能力</div>
      <div class="special-desc">⚡ ${h.specialDesc}</div>`;
    specialEl.style.display = '';
  } else {
    specialEl.style.display = 'none';
  }

  // Evolution path
  const evoEl = document.getElementById('detail-evo-path');
  evoEl.innerHTML = '';
  h.nameLine.forEach((name, i) => {
    const node = document.createElement('div');
    const isActive = owned && i === formIdx;
    const isReached = owned && i <= formIdx;
    node.className = `evo-node${isActive ? ' active' : ''}${isReached && !isActive ? ' reached' : ''}`;
    node.innerHTML = `
      <div class="evo-icon">${isReached ? '🐱' : '❓'}</div>
      <div class="evo-name">${isReached ? name : '???'}</div>
      <div class="evo-hint">${evoHint(h, i)}</div>
    `;
    evoEl.appendChild(node);
    if (i < h.nameLine.length - 1) {
      const arrow = document.createElement('div');
      arrow.className = 'evo-arrow';
      arrow.textContent = '→';
      evoEl.appendChild(arrow);
    }
  });

  // Soul fragments (only non-initial gacha heroes)
  const fragSection = document.getElementById('detail-frag-section');
  if (!INITIAL_HEROES.has(heroId) && owned) {
    fragSection.style.display = '';
    const fragPct = Math.min((frags / FRAG_TO_MAX) * 100, 100);
    document.getElementById('detail-frag-fill').style.width = `${fragPct}%`;
    document.getElementById('detail-frag-text').textContent = `${frags} / ${FRAG_TO_MAX}`;
    const noteEl = document.getElementById('detail-frag-note');
    if (fireData.maxUnlocked) {
      noteEl.innerHTML = '<span class="frag-maxed">✨ MAX 形態已解鎖！</span>';
    } else if (frags >= FRAG_TO_MAX) {
      noteEl.innerHTML = '<span class="frag-ready">✨ 碎片已集滿！下次抽到會自動解鎖 MAX</span>';
    } else {
      noteEl.textContent = `再集 ${FRAG_TO_MAX - frags} 片可解鎖 MAX 形態`;
    }
  } else {
    fragSection.style.display = 'none';
  }

  // Show panel
  document.getElementById('detail-backdrop').classList.remove('hidden');
  document.getElementById('detail-panel').classList.remove('hidden');
  document.getElementById('detail-panel').classList.add('open');
}

function closeDetail() {
  document.getElementById('detail-panel').classList.remove('open');
  document.getElementById('detail-backdrop').classList.add('hidden');
  setTimeout(() => document.getElementById('detail-panel').classList.add('hidden'), 300);
}

document.getElementById('btn-detail-close').addEventListener('click', closeDetail);
document.getElementById('detail-backdrop').addEventListener('click', closeDetail);

// ── Helpers ──────────────────────────────────────────────────────────────────
function isOwned(heroId) {
  return INITIAL_HEROES.has(heroId) || !!ownedMap[heroId];
}

function calcLevel(exp) {
  return Math.floor(exp / EXP_PER_LEVEL) + 1;
}

function resolveFormIdx(h, fireData) {
  if (fireData.maxUnlocked) return 2;
  const lv = calcLevel(fireData.exp ?? 0);
  if (lv >= FORM_UNLOCK_LEVEL && h.forms.length > 1) return 1;
  return fireData.currentForm ?? 0;
}

function formName(idx) {
  const names = ['基礎形態', '進化形態', 'MAX 形態'];
  return names[idx] ?? '基礎形態';
}

function evoHint(h, idx) {
  if (idx === 0) return '初始';
  if (idx === 1) return `Lv.${FORM_UNLOCK_LEVEL} 解鎖`;
  return '集滿碎片解鎖';
}

init();
