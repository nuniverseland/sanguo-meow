// bestiary.js — Enemy encyclopedia page
import { getUserId, loadBestiary } from './firebase.js';

// 章節順序與標籤
const CHAPTER_ORDER = ['taiwan', 'japan'];
const CHAPTER_LABELS = {
  taiwan: '🇹🇼 台灣篇',
  japan:  '🇯🇵 日本篇',
};

// 敵人類型標籤
const TYPE_LABEL = {
  normal:  { text: '普通',  cls: 'type-normal'  },
  flying:  { text: '✈ 飛行', cls: 'type-flying'  },
  boss:    { text: '👑 Boss', cls: 'type-boss'    },
};

let enemiesData = [];   // enemies.json
let bestiaryMap = {};   // Firebase: { enemyId: { unlocked, defeatCount, firstDefeatedAt } }
let currentFilter = 'all';
let userId = null;

// ── Boot ──────────────────────────────────────────────────────────────────────
async function init() {
  userId = getUserId();
  if (!userId) { location.href = 'index.html'; return; }

  try {
    [enemiesData, bestiaryMap] = await Promise.all([
      fetch('data/enemies.json').then(r => r.json()),
      loadBestiary(userId).catch(() => ({}))
    ]);
  } catch (e) {
    console.error('載入敵人圖鑑失敗', e);
    enemiesData = [];
    bestiaryMap = {};
  }

  bindFilter();
  renderAll();

  document.getElementById('bestiary-loading').classList.add('hidden');
  document.getElementById('bestiary-main').classList.remove('hidden');
}

// ── Filter ────────────────────────────────────────────────────────────────────
function bindFilter() {
  document.getElementById('bestiary-filter').addEventListener('click', e => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    renderAll();
  });
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderAll() {
  const main = document.getElementById('bestiary-main');
  main.innerHTML = '';

  // Group by country in chapter order
  const grouped = {};
  for (const country of CHAPTER_ORDER) {
    grouped[country] = [];
  }
  for (const e of enemiesData) {
    const country = e.country || 'unknown';
    if (!grouped[country]) grouped[country] = [];
    grouped[country].push(e);
  }

  let anyVisible = false;

  for (const country of CHAPTER_ORDER) {
    const list = grouped[country] || [];
    const filtered = list.filter(e => {
      const unlocked = !!bestiaryMap[e.id]?.unlocked;
      if (currentFilter === 'unlocked') return unlocked;
      if (currentFilter === 'locked')   return !unlocked;
      return true;
    });
    if (!filtered.length) continue;

    anyVisible = true;
    const section = document.createElement('section');
    section.className = 'chapter-section';

    const hdr = document.createElement('div');
    hdr.className = 'chapter-section-title';
    hdr.textContent = CHAPTER_LABELS[country] || country;
    section.appendChild(hdr);

    const grid = document.createElement('div');
    grid.className = 'enemy-grid';

    filtered.forEach(e => {
      const unlocked = !!bestiaryMap[e.id]?.unlocked;
      const card = buildCard(e, unlocked);
      grid.appendChild(card);
    });

    section.appendChild(grid);
    main.appendChild(section);
  }

  if (!anyVisible) {
    main.innerHTML = '<div class="bestiary-empty">沒有符合條件的敵人。打倒敵人後才能解鎖！</div>';
  }
}

function buildCard(enemy, unlocked) {
  const card = document.createElement('div');
  card.className = `enemy-card${unlocked ? ' unlocked' : ' locked'}${enemy.type === 'boss' ? ' is-boss' : ''}`;

  if (unlocked) {
    card.innerHTML = `
      <div class="enemy-card-img-wrap">
        <img src="${enemy.imgWalk}"
             alt="${enemy.name}"
             onerror="this.outerHTML='<div class=enemy-card-emoji>👾</div>'">
      </div>
      <div class="enemy-card-name">${enemy.name}</div>
      <div class="enemy-card-type ${TYPE_LABEL[enemy.type]?.cls || ''}">${TYPE_LABEL[enemy.type]?.text || ''}</div>
    `;
  } else {
    card.innerHTML = `
      <div class="enemy-card-img-wrap locked-wrap">
        <div class="enemy-card-silhouette">
          <img src="${enemy.imgWalk}" alt="" aria-hidden="true"
               onerror="">
        </div>
      </div>
      <div class="enemy-card-name locked-name">???</div>
      <div class="enemy-card-type">${enemy.type === 'boss' ? '👑' : '🔒'}</div>
    `;
  }

  card.addEventListener('click', () => openDetail(enemy.id));
  return card;
}

// ── Detail panel ──────────────────────────────────────────────────────────────
function openDetail(enemyId) {
  const enemy    = enemiesData.find(e => e.id === enemyId);
  const bData    = bestiaryMap[enemyId];
  const unlocked = !!bData?.unlocked;

  // Image wrap
  const imgWrap = document.getElementById('detail-img-wrap');
  const img     = document.getElementById('detail-img');
  if (unlocked) {
    imgWrap.classList.remove('locked-img-wrap');
    img.src = enemy.imgWalk;
    img.alt = enemy.name;
  } else {
    imgWrap.classList.add('locked-img-wrap');
    img.src = enemy.imgWalk;
    img.alt = '';
  }

  // Basic info
  document.getElementById('detail-chapter-tag').textContent  = CHAPTER_LABELS[enemy.country] || '';
  document.getElementById('detail-enemy-name').textContent   = unlocked ? enemy.name : '???';
  const typeInfo = TYPE_LABEL[enemy.type] || { text: '普通', cls: '' };
  const typeEl   = document.getElementById('detail-type-tag');
  typeEl.textContent  = typeInfo.text;
  typeEl.className    = `detail-type-tag ${typeInfo.cls}`;

  // Defeat status
  const statusEl = document.getElementById('detail-defeat-status');
  statusEl.textContent = unlocked ? '✅ 已解鎖' : '🔒 尚未擊敗';
  statusEl.className   = `detail-defeat-status ${unlocked ? 'is-unlocked' : 'is-locked'}`;

  // Stats
  const statsEl = document.getElementById('detail-stats-row');
  if (unlocked) {
    statsEl.innerHTML = `
      <div class="stat-chip">❤️ HP <strong>${enemy.hp}</strong></div>
      <div class="stat-chip">⚔️ ATK <strong>${enemy.atk}</strong></div>
      <div class="stat-chip">💨 速度 <strong>${enemy.speed}</strong></div>
      <div class="stat-chip">💰 獎勵 <strong>${enemy.reward}</strong></div>
    `;
    statsEl.style.display = '';
  } else {
    statsEl.style.display = 'none';
  }

  // Description
  const descSection = document.getElementById('detail-desc-section');
  const descText    = document.getElementById('detail-desc-text');
  if (unlocked && enemy.description) {
    descText.textContent  = enemy.description;
    descSection.style.display = '';
  } else if (!unlocked) {
    descText.textContent  = '擊敗這隻敵人後才能解鎖介紹！';
    descSection.style.display = '';
  } else {
    descSection.style.display = 'none';
  }

  // Fun fact
  const factSection = document.getElementById('detail-funfact-section');
  const factText    = document.getElementById('detail-funfact-text');
  if (unlocked && enemy.funFact) {
    factText.textContent    = enemy.funFact;
    factSection.style.display = '';
  } else {
    factSection.style.display = 'none';
  }

  // Defeat record
  const recordSection = document.getElementById('detail-defeat-record');
  const recordInfo    = document.getElementById('detail-defeat-info');
  if (unlocked && bData) {
    const count = bData.defeatCount ?? 1;
    let dateStr = '';
    if (bData.firstDefeatedAt) {
      const ts = bData.firstDefeatedAt;
      const d  = ts.toDate ? ts.toDate() : new Date(ts.seconds * 1000);
      dateStr  = d.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' });
    }
    recordInfo.innerHTML = `
      <div class="defeat-count">已擊敗 <strong>${count}</strong> 次</div>
      ${dateStr ? `<div class="defeat-date">首次擊敗：${dateStr}</div>` : ''}
    `;
    recordSection.style.display = '';
  } else {
    recordSection.style.display = 'none';
  }

  // Show panel
  document.getElementById('detail-backdrop').classList.remove('hidden');
  document.getElementById('detail-panel').classList.remove('hidden');
  setTimeout(() => document.getElementById('detail-panel').classList.add('open'), 10);
}

function closeDetail() {
  document.getElementById('detail-panel').classList.remove('open');
  document.getElementById('detail-backdrop').classList.add('hidden');
  setTimeout(() => document.getElementById('detail-panel').classList.add('hidden'), 300);
}

document.getElementById('btn-detail-close').addEventListener('click', closeDetail);
document.getElementById('detail-backdrop').addEventListener('click', closeDetail);

// ── Start ─────────────────────────────────────────────────────────────────────
init();
