/* profile-celadon.js — 個人檔案頁（青瓷版）含 Firebase 整合 */
import { getUserId, getUserData, loadOwnedHeroes, getProgress } from './firebase.js';

// ── 服裝資料 ─────────────────────────────────────────────────────────────────
const OUTFITS = [
  { id: 'buyi',    name: '布衣',     rarity: 'N',  icon: '👕', note: '初心者贈品' },
  { id: 'qinglong',name: '青龍甲',   rarity: 'R',  icon: '🐉', note: '東方之鎧'   },
  { id: 'zhuque',  name: '朱雀袍',   rarity: 'R',  icon: '🔥', note: '南方之袍'   },
  { id: 'baihu',   name: '白虎鎧',   rarity: 'R',  icon: '🐯', note: '西方之鎧'   },
  { id: 'xuanwu',  name: '玄武袈裟', rarity: 'SR', icon: '🐢', note: '北方神袈'   },
  { id: 'jinsi',   name: '金絲錦袍', rarity: 'SR', icon: '👑', note: '帝王之服'   },
  { id: 'maoer',   name: '貓耳便服', rarity: 'R',  icon: '🐾', note: '限定活動'   }
];

const TOTAL_STAGES = 6;
const TOTAL_HEROES = 17;

// ── 狀態 ─────────────────────────────────────────────────────────────────────
const st = {
  equippedId:   localStorage.getItem('equippedOutfit') || 'buyi',
  previewingId: null,
  gender:       'f'
};

// ── Firebase 資料載入 ─────────────────────────────────────────────────────────
async function init() {
  const userId = getUserId();
  if (!userId) { location.href = 'index.html'; return; }

  const [userData, ownedHeroes, progress] = await Promise.all([
    getUserData(userId),
    loadOwnedHeroes(userId),
    getProgress(userId)
  ]);

  if (!userData) { location.href = 'index.html'; return; }

  fillUserData(userData, ownedHeroes, progress);
  renderWardrobe();
  bindEvents();
}

function fillUserData(userData, ownedHeroes, progress) {
  // 暱稱
  document.querySelector('.nickname-text').textContent = userData.nickname || '';

  // 卷軸
  document.getElementById('t-scrolls').textContent = userData.scrolls ?? 0;

  // 寶玉（目前 schema 無此欄位，先顯示 0）
  document.getElementById('t-jade').textContent = userData.jade ?? 0;

  // 稱號
  const title = userData.title || '新手喵';
  const match = title.match(/^(.+)的(.+)$/);
  if (match) {
    document.getElementById('title-adj-display').textContent = match[1];
    document.getElementById('title-noun-display').textContent = match[2];
    const adjSel = document.getElementById('title-adj-select');
    const nounSel = document.getElementById('title-noun-select');
    // 若 select 有這個 option 就選中
    [...adjSel.options].forEach(o => { if (o.value === match[1]) adjSel.value = match[1]; });
    [...nounSel.options].forEach(o => { if (o.value === match[2]) nounSel.value = match[2]; });
  } else {
    document.getElementById('title-noun-display').textContent = title;
  }

  // 戰績 stat chips
  const chips = document.querySelectorAll('.stat-chip');

  // 總分
  chips[0].querySelector('.stat-chip-val').textContent =
    (userData.totalScore || 0).toLocaleString();

  // 勝場（schema 未追蹤，暫顯 —）
  chips[1].querySelector('.stat-chip-val').textContent = userData.wins ?? '—';

  // 通關數
  const completedCount = progress ? Object.values(progress).filter(p => p.completed).length : 0;
  chips[2].querySelector('.stat-chip-val').innerHTML =
    `${completedCount} <span class="stat-chip-sub">/ ${TOTAL_STAGES}</span>`;

  // 英雄收集
  const heroCount = ownedHeroes ? Object.keys(ownedHeroes).length : 0;
  chips[3].querySelector('.stat-chip-val').innerHTML =
    `${heroCount} <span class="stat-chip-sub">/ ${TOTAL_HEROES}</span>`;
  const bar = chips[3].querySelector('.stat-chip-bar-fill');
  if (bar) bar.style.width = `${Math.round(heroCount / TOTAL_HEROES * 100)}%`;
}

// ── 衣櫃渲染 ─────────────────────────────────────────────────────────────────
function renderWardrobe() {
  const grid = document.getElementById('wardrobe-grid');
  grid.innerHTML = '';

  OUTFITS.forEach(o => {
    const isEquipped  = st.equippedId === o.id && !st.previewingId;
    const isPreview   = st.previewingId === o.id;

    const card = document.createElement('div');
    card.className = 'outfit-card' +
      (isEquipped ? ' equipped'  : '') +
      (isPreview  ? ' previewing': '');
    card.dataset.id = o.id;

    card.innerHTML = `
      <div class="outfit-thumb ${o.name}">${o.icon}</div>
      <div class="outfit-name">${o.name}</div>
      <div class="outfit-rarity ${o.rarity}">${o.rarity}</div>
      ${isEquipped ? '<div class="equipped-stamp">穿著中</div>' : ''}
      ${isPreview  ? '<div class="preview-stamp">預覽中</div>' : ''}
    `;

    card.addEventListener('click', () => onOutfitClick(o.id));
    grid.appendChild(card);
  });

  // 立繪更新
  const activeId     = st.previewingId || st.equippedId;
  const activeOutfit = OUTFITS.find(o => o.id === activeId);
  if (activeOutfit) {
    const body = document.getElementById('ph-body');
    if (body) body.dataset.outfit = activeOutfit.name;
    const label = document.getElementById('ph-outfit-label');
    if (label) label.textContent = `${activeOutfit.name} · ${activeOutfit.note}`;
  }

  // fitting bar
  const bar = document.getElementById('fitting-bar');
  if (st.previewingId && st.previewingId !== st.equippedId) {
    bar.classList.remove('hidden');
  } else {
    bar.classList.add('hidden');
  }
}

function onOutfitClick(id) {
  if (id === st.equippedId && !st.previewingId) return;
  st.previewingId = (id === st.equippedId) ? null : id;
  renderWardrobe();
}

// ── 事件綁定 ─────────────────────────────────────────────────────────────────
function bindEvents() {
  document.getElementById('btn-confirm-outfit').addEventListener('click', () => {
    if (!st.previewingId) return;
    st.equippedId = st.previewingId;
    st.previewingId = null;
    localStorage.setItem('equippedOutfit', st.equippedId);
    renderWardrobe();
    flash('✓ 換裝成功！');
  });

  document.getElementById('btn-cancel-outfit').addEventListener('click', () => {
    st.previewingId = null;
    renderWardrobe();
  });

  // 稱號選單
  const adjSel  = document.getElementById('title-adj-select');
  const nounSel = document.getElementById('title-noun-select');
  adjSel.addEventListener('change',  () => {
    document.getElementById('title-adj-display').textContent = adjSel.value;
  });
  nounSel.addEventListener('change', () => {
    document.getElementById('title-noun-display').textContent = nounSel.value;
  });

  // 性別切換
  document.querySelectorAll('.gender-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.gender-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      st.gender = btn.dataset.gender;
    });
  });

  // Placeholder 按鈕
  document.getElementById('btn-inbox').addEventListener('click', () =>
    alert('📬 信箱頁面尚未製作'));
  document.getElementById('btn-shop').addEventListener('click', () =>
    alert('🛒 商店頁面尚未製作'));
}

// ── Flash 提示 ───────────────────────────────────────────────────────────────
function flash(msg) {
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = `
    position:fixed;top:60px;left:50%;transform:translateX(-50%);
    background:linear-gradient(135deg,#7ba89e,#47776a);
    color:#fff;font-weight:bold;padding:10px 24px;
    border-radius:22px;box-shadow:0 4px 14px rgba(71,119,106,0.5);
    z-index:500;font-size:0.92rem;
    animation:flash-in .3s ease,flash-out .3s ease 1.4s forwards;
  `;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1800);
}

const _s = document.createElement('style');
_s.textContent = `
  @keyframes flash-in  { from{opacity:0;transform:translate(-50%,-10px)} to{opacity:1;transform:translate(-50%,0)} }
  @keyframes flash-out { to{opacity:0;transform:translate(-50%,-10px)} }
`;
document.head.appendChild(_s);

init();
