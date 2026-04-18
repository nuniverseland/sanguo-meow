/* profile.js — 個人檔案頁邏輯 */

// ═══════════════════════════════════════════════════════
// Mock 資料 — 之後從 Firebase 取得
// ═══════════════════════════════════════════════════════
const OUTFITS = [
  { id: 'buyi',      name: '布衣',       rarity: 'N',  icon: '👕', note: '初心者贈品' },
  { id: 'qinglong',  name: '青龍甲',     rarity: 'R',  icon: '🐉', note: '東方之鎧' },
  { id: 'zhuque',    name: '朱雀袍',     rarity: 'R',  icon: '🔥', note: '南方之袍' },
  { id: 'baihu',     name: '白虎鎧',     rarity: 'R',  icon: '🐯', note: '西方之鎧' },
  { id: 'xuanwu',    name: '玄武袈裟',   rarity: 'SR', icon: '🐢', note: '北方神袈' },
  { id: 'jinsi',     name: '金絲錦袍',   rarity: 'SR', icon: '👑', note: '帝王之服' },
  { id: 'maoer',     name: '貓耳便服',   rarity: 'R',  icon: '🐾', note: '限定活動' }
];

// 狀態
const state = {
  equippedId: 'buyi',   // 真正穿著
  previewingId: null,   // 預覽中（尚未儲存）
  gender: 'f'
};

// ═══════════════════════════════════════════════════════
// 渲染
// ═══════════════════════════════════════════════════════
function renderWardrobe() {
  const grid = document.getElementById('wardrobe-grid');
  grid.innerHTML = '';

  OUTFITS.forEach(o => {
    const card = document.createElement('div');
    card.className = 'outfit-card';
    card.dataset.id = o.id;

    const isEquipped = state.equippedId === o.id && !state.previewingId;
    const isPreview  = state.previewingId === o.id;
    if (isEquipped) card.classList.add('equipped');
    if (isPreview)  card.classList.add('previewing');

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

  // 更新立繪身體顏色
  const body = document.getElementById('ph-body');
  const activeId = state.previewingId || state.equippedId;
  const activeOutfit = OUTFITS.find(o => o.id === activeId);
  if (activeOutfit) {
    body.dataset.outfit = activeOutfit.name;
    document.getElementById('ph-outfit-label').textContent =
      `${activeOutfit.name} · ${activeOutfit.note}`;
  }

  // fitting bar 顯示
  const bar = document.getElementById('fitting-bar');
  if (state.previewingId && state.previewingId !== state.equippedId) {
    bar.classList.remove('hidden');
  } else {
    bar.classList.add('hidden');
  }
}

function onOutfitClick(id) {
  if (id === state.equippedId && !state.previewingId) return;
  state.previewingId = (id === state.equippedId) ? null : id;
  renderWardrobe();
}

// ═══════════════════════════════════════════════════════
// 確認 / 取消
// ═══════════════════════════════════════════════════════
document.getElementById('btn-confirm-outfit').addEventListener('click', () => {
  if (state.previewingId) {
    state.equippedId = state.previewingId;
    state.previewingId = null;
    renderWardrobe();
    flash('✓ 換裝成功！');
  }
});

document.getElementById('btn-cancel-outfit').addEventListener('click', () => {
  state.previewingId = null;
  renderWardrobe();
});

// ═══════════════════════════════════════════════════════
// 性別切換
// ═══════════════════════════════════════════════════════
document.querySelectorAll('.gender-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.gender-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.gender = btn.dataset.gender;
  });
});

// ═══════════════════════════════════════════════════════
// 稱號組合器
// ═══════════════════════════════════════════════════════
const adjSelect  = document.getElementById('title-adj-select');
const nounSelect = document.getElementById('title-noun-select');
const adjDisplay = document.getElementById('title-adj-display');
const nounDisplay= document.getElementById('title-noun-display');

adjSelect.addEventListener('change', () => {
  adjDisplay.textContent = adjSelect.value;
});
nounSelect.addEventListener('change', () => {
  nounDisplay.textContent = nounSelect.value;
});

// ═══════════════════════════════════════════════════════
// Inbox / 商店 placeholder
// ═══════════════════════════════════════════════════════
document.getElementById('btn-inbox').addEventListener('click', () => {
  alert('📬 信箱頁面尚未製作\n\n（之後會顯示系統通知、好友訊息、獎勵領取等）');
});

document.getElementById('btn-shop').addEventListener('click', () => {
  alert('🛒 商店頁面尚未製作\n\n（之後可以花卷軸購買更多服裝與配件）');
});

// ═══════════════════════════════════════════════════════
// Flash 提示
// ═══════════════════════════════════════════════════════
function flash(msg) {
  const el = document.createElement('div');
  el.className = 'flash-toast';
  el.textContent = msg;
  el.style.cssText = `
    position: fixed; top: 60px; left: 50%; transform: translateX(-50%);
    background: linear-gradient(135deg, #f5c842, #c9880a);
    color: #1a0e00; font-weight: bold; padding: 10px 24px;
    border-radius: 22px; box-shadow: 0 4px 14px rgba(0,0,0,0.5);
    z-index: 500; font-size: 0.92rem;
    animation: flash-in 0.3s ease, flash-out 0.3s ease 1.4s forwards;
  `;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1800);
}

// Inject flash animations
const style = document.createElement('style');
style.textContent = `
  @keyframes flash-in {
    from { opacity: 0; transform: translate(-50%, -10px); }
    to   { opacity: 1; transform: translate(-50%, 0); }
  }
  @keyframes flash-out {
    to { opacity: 0; transform: translate(-50%, -10px); }
  }
`;
document.head.appendChild(style);

// ═══════════════════════════════════════════════════════
// Init
// ═══════════════════════════════════════════════════════
renderWardrobe();
