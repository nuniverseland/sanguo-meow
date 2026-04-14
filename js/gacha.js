// gacha.js — Gacha page logic (redesign v2)
import { getUserId, loadGachaState, executeGachaDraw } from './firebase.js';
import { sfxGachaPull, sfxGachaNew, sfxGachaSR, sfxGachaFrag } from './audio.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const INITIAL_HEROES = ['liubei', 'soldier'];

const GACHA_POOL = {
  normal:     ['zhoutai'],
  rare:       ['zhangfei', 'guanyu', 'zhangjiu', 'zhaoyun', 'zhugeliang',
               'sunquan', 'zhouyu', 'diaochan', 'sunshangxiang'],
  super_rare: ['caocao', 'lvbu', 'dongzhuo', 'huangyueying', 'simayi']
};

const GACHA_RATES = {
  normal:     0.50,
  rare:       0.38,
  super_rare: 0.12
};

const ALL_HEROES = [
  'liubei', 'soldier',
  'zhoutai',
  'zhangfei', 'guanyu', 'zhangjiu', 'zhaoyun', 'zhugeliang',
  'sunquan', 'zhouyu', 'diaochan', 'sunshangxiang',
  'caocao', 'lvbu', 'dongzhuo', 'huangyueying', 'simayi'
];

const RARITY_META = {
  zhoutai:       'normal',
  zhangfei:      'rare',
  guanyu:        'rare',
  zhangjiu:      'rare',
  zhaoyun:       'rare',
  zhugeliang:    'rare',
  sunquan:       'super_rare',
  zhouyu:        'rare',
  diaochan:      'rare',
  sunshangxiang: 'rare',
  caocao:        'super_rare',
  lvbu:          'super_rare',
  dongzhuo:      'super_rare',
  huangyueying:  'super_rare',
  simayi:        'super_rare',
};

const HERO_META = {
  liubei:        { names: ['大耳喵',  '劉備喵',   '劉備喵MAX'],   role: '仁義肉盾', initial: true  },
  soldier:       { names: ['小兵喵',  '士兵喵',   '軍官喵'],      role: '量產基礎',  initial: true  },
  zhoutai:       { names: ['忠犬喵',  '周泰喵',   '周泰喵MAX'],   role: '防禦護盾', initial: false },
  zhangfei:      { names: ['重擊喵',  '張飛喵',   '張飛喵MAX'],   role: '近戰暴力', initial: false },
  guanyu:        { names: ['紳士喵',  '關羽喵',   '關羽喵MAX'],   role: '遠程輸出', initial: false },
  zhangjiu:      { names: ['強壯喵',  '張九喵',   '張九喵MAX'],   role: '鐵壁肉盾', initial: false },
  zhaoyun:       { names: ['飛腿喵',  '趙雲喵',   '趙雲喵MAX'],   role: '敏捷突擊', initial: false },
  zhugeliang:    { names: ['智慧喵',  '諸葛喵',   '諸葛喵MAX'],   role: '謀略支援', initial: false },
  sunquan:       { names: ['心機喵',  '孫權喵',   '孫權喵MAX'],   role: '江東霸主', initial: false },
  zhouyu:        { names: ['優雅喵',  '周瑜喵',   '周瑜喵MAX'],   role: '遠程火攻', initial: false },
  diaochan:      { names: ['舞娘喵',  '貂蟬喵',   '貂蟬喵MAX'],   role: '迷惑控制', initial: false },
  sunshangxiang: { names: ['弓手喵',  '孫尚香喵', '孫尚香喵MAX'], role: '遠程速攻', initial: false },
  caocao:        { names: ['狠狠喵',  '曹操喵',   '曹操喵MAX'],   role: '霸道統帥', initial: false },
  lvbu:          { names: ['自我喵',  '呂布喵',   '呂布喵MAX'],   role: '無雙武將', initial: false },
  dongzhuo:      { names: ['胖胖喵',  '董卓喵',   '董卓喵MAX'],   role: '鐵血暴君', initial: false },
  huangyueying:  { names: ['機關喵',  '黃月英喵', '黃月英喵MAX'], role: '機關輸出', initial: false },
  simayi:        { names: ['陰謀喵',  '司馬懿喵', '司馬懿喵MAX'], role: '反制削弱', initial: false },
};

const RARITY_LABEL = { normal: '普通', rare: '⭐ 稀有', super_rare: '✨ 超稀有' };
const PITY_MAX      = 20;
const RARE_PITY_MAX = 40;

// ── Helpers ───────────────────────────────────────────────────────────────────

function getHeroImg(heroId, level = 1) {
  if (level >= 30) return `assets/heroes/hero_${heroId}_max.png`;
  if (level >= 10) return `assets/heroes/hero_${heroId}.png`;
  return `assets/heroes/hero_${heroId}_base.png`;
}

function getHeroName(heroId, level = 1) {
  const names = HERO_META[heroId].names;
  if (level >= 30) return names[2];
  if (level >= 10) return names[1];
  return names[0];
}

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
    for (const h of INITIAL_HEROES) {
      if (!gachaState.heroes[h]) {
        gachaState.heroes[h] = { heroId: h, level: 1, soulFragments: 0 };
      }
    }
  } catch (e) {
    console.error('載入抽卡資料失敗', e);
    gachaState = { scrolls: 0, pityCount: 0, rarePityCount: 0, totalDraws: 0, heroes: {} };
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
  document.getElementById('g-scrolls').textContent = gachaState.scrolls;
}

function renderHeroPool() {
  const grid = document.getElementById('hero-pool-grid');
  grid.innerHTML = '';

  ALL_HEROES.forEach(heroId => {
    const meta     = HERO_META[heroId];
    const heroData = gachaState.heroes[heroId];
    const isOwned  = meta.initial || !!heroData;
    const rarity   = RARITY_META[heroId];
    const level    = heroData?.level ?? 1;

    const card = document.createElement('div');
    const rarityClass = rarity ? ` rarity-${rarity}` : '';
    card.className = `hero-card ${isOwned ? 'owned' : 'not-owned'}${rarityClass}`;

    let imgEl;
    if (isOwned) {
      const imgSrc = getHeroImg(heroId, level);
      imgEl = `<img class="hero-card-img" src="${imgSrc}"
        onerror="this.src='assets/gacha/card_back_sanguo.png'"
        alt="${getHeroName(heroId, level)}">`;
    } else {
      imgEl = `<img class="hero-card-shadow" src="assets/gacha/card_back_sanguo.png" alt="未解鎖">`;
    }

    const rarityTag = rarity
      ? `<span class="hero-card-rarity ${rarity}">${RARITY_LABEL[rarity]}</span>`
      : '';

    const levelEl = isOwned
      ? `<span class="hero-card-level">Lv.${level}</span>`
      : '';

    let evolvedEl = '';
    if (isOwned && level >= 30) {
      evolvedEl = `<span class="hero-card-evolved">MAX進化</span>`;
    } else if (isOwned && level >= 10) {
      evolvedEl = `<span class="hero-card-evolved">進化</span>`;
    }

    card.innerHTML = `
      ${meta.initial ? '<span class="hero-card-initial">初始</span>' : rarityTag}
      ${isOwned && !meta.initial ? '<span class="hero-card-badge">已擁有</span>' : ''}
      ${imgEl}
      <div class="hero-card-name">${isOwned ? getHeroName(heroId, level) : '???'}</div>
      ${levelEl}
      ${evolvedEl}
    `;

    if (isOwned) {
      card.style.cursor = 'pointer';
      card.addEventListener('click', () => showHeroDetail(heroId));
    }

    grid.appendChild(card);
  });
}

function renderPity() {
  const rarePity   = gachaState.rarePityCount ?? 0;
  const rareRemain = RARE_PITY_MAX - rarePity;
  const fillPct    = (rarePity / RARE_PITY_MAX) * 100;
  document.getElementById('pity-fill').style.width  = `${fillPct}%`;
  document.getElementById('pity-count').textContent = `距保底 ${rareRemain} 抽`;
}

function renderFragments() {
  const grid = document.getElementById('fragments-grid');
  grid.innerHTML = '';

  const allPoolHeroes = [
    ...GACHA_POOL.normal,
    ...GACHA_POOL.rare,
    ...GACHA_POOL.sr
  ];

  allPoolHeroes.forEach(heroId => {
    const meta     = HERO_META[heroId];
    const heroData = gachaState.heroes[heroId];
    if (!heroData) return;

    const frags   = heroData.soulFragments ?? 0;
    const FRAG_MAX = 10;
    const level    = heroData.level ?? 1;

    const item = document.createElement('div');
    item.className = 'fragment-item';
    item.innerHTML = `
      <div class="fragment-name">${getHeroName(heroId, level)}</div>
      <div class="fragment-count">
        <img class="fragment-icon" src="assets/gacha/soul_shard_r.png" alt="">
        ${frags >= FRAG_MAX
          ? '<span class="fragment-max">⚡ 集滿！升一等</span>'
          : `${frags} / ${FRAG_MAX}`}
      </div>
      <div class="fragment-bar-bg">
        <div class="fragment-bar-fill" style="width:${Math.min(frags / FRAG_MAX * 100, 100)}%"></div>
      </div>
      <div class="fragment-tip">集滿10個自動 +1 Lv</div>
    `;
    grid.appendChild(item);
  });

  if (!grid.children.length) {
    grid.innerHTML = '<div style="font-size:.82rem;color:#7a4a20;padding:4px 0">抽到英雄後才會顯示碎片進度</div>';
  }
}

// ── Draw buttons ──────────────────────────────────────────────────────────────
function bindButtons() {
  document.getElementById('btn-draw-1').addEventListener('click', () => doDraw(1));
  document.getElementById('btn-draw-10').addEventListener('click', () => doDraw(10));
  document.getElementById('btn-result-close').addEventListener('click', closeResult);
  document.getElementById('btn-hero-detail-close').addEventListener('click', closeHeroDetail);
  document.getElementById('hero-detail-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeHeroDetail();
  });
}

async function doDraw(count) {
  const cost = count === 10 ? 45 : 5;
  if (gachaState.scrolls < cost) {
    alert(`卷軸不足！需要 ${cost} 卷，目前只有 ${gachaState.scrolls} 卷`);
    return;
  }

  sfxGachaPull();
  setDrawDisabled(true);
  showAnim(true);

  try {
    const txResult = await executeGachaDraw(userId, count, GACHA_POOL, gachaState);

    gachaState.scrolls       = txResult.newScrolls;
    gachaState.pityCount     = txResult.newPity     ?? 0;
    gachaState.rarePityCount = txResult.newRarePity ?? (gachaState.rarePityCount ?? 0);

    for (const r of txResult.results) {
      if (r.isNew) {
        gachaState.heroes[r.heroId] = { heroId: r.heroId, level: 1, soulFragments: 0 };
      } else {
        if (gachaState.heroes[r.heroId]) {
          const h = gachaState.heroes[r.heroId];
          const newFrag = (h.soulFragments ?? 0) + 1;
          if (newFrag >= 10) {
            h.soulFragments = newFrag - 10;
            h.level = (h.level ?? 1) + 1;
          } else {
            h.soulFragments = newFrag;
          }
        }
      }
    }

    showAnim(false);
    await showResults(txResult.results);
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
async function showResults(results) {
  const container = document.getElementById('result-cards');
  container.innerHTML = '';

  for (let i = 0; i < results.length; i++) {
    await new Promise(resolve => setTimeout(resolve, results.length > 1 ? 200 : 0));

    const r       = results[i];
    const meta    = HERO_META[r.heroId];
    const level   = gachaState.heroes[r.heroId]?.level ?? 1;
    const imgSrc  = getHeroImg(r.heroId, level);
    const name    = getHeroName(r.heroId, level);
    const rarity  = r.rarity ?? RARITY_META[r.heroId];

    if (rarity === 'sr')   sfxGachaSR();
    else if (r.isNew)      sfxGachaNew();
    else                   sfxGachaFrag();

    const card = document.createElement('div');
    card.className = `result-card${r.isNew ? ' is-new' : ''}`;
    card.style.animationDelay = `${i * 0.07}s`;

    const rarityTag = rarity
      ? `<span class="result-card-rarity ${rarity}">${RARITY_LABEL[rarity]}</span>`
      : '';

    const tagHTML = r.isNew
      ? '<span class="result-card-tag new">✨ 新英雄！</span>'
      : '<span class="result-card-tag frag">碎片 +1</span>';

    card.innerHTML = `
      ${rarityTag}
      <img src="${imgSrc}"
           onerror="this.src='assets/gacha/card_back_sanguo.png'"
           alt="${name}">
      <div class="result-card-name">${name}</div>
      ${tagHTML}
    `;
    container.appendChild(card);
  }

  document.getElementById('result-overlay').classList.remove('hidden');
}

function closeResult() {
  document.getElementById('result-overlay').classList.add('hidden');
}

// ── Hero detail overlay ───────────────────────────────────────────────────────
function showHeroDetail(heroId) {
  const meta     = HERO_META[heroId];
  const heroData = gachaState.heroes[heroId];
  const level    = heroData?.level ?? 1;
  const rarity   = RARITY_META[heroId];
  const name     = getHeroName(heroId, level);
  const imgSrc   = getHeroImg(heroId, level);

  const rarityEl = document.getElementById('hero-detail-rarity');
  rarityEl.textContent = rarity ? RARITY_LABEL[rarity] : '初始';
  rarityEl.className   = `hero-detail-rarity${rarity ? ' ' + rarity : ''}`;

  document.getElementById('hero-detail-img').src = imgSrc;
  document.getElementById('hero-detail-img').alt = name;
  document.getElementById('hero-detail-name').textContent = name;

  let metaText = `Lv.${level}`;
  if (level >= 30) metaText += '　MAX進化';
  else if (level >= 10) metaText += '　進化';
  document.getElementById('hero-detail-meta').textContent = metaText;

  document.getElementById('hero-detail-overlay').classList.remove('hidden');
}

function closeHeroDetail() {
  document.getElementById('hero-detail-overlay').classList.add('hidden');
}

// ── Start ─────────────────────────────────────────────────────────────────────
init();
