// setup-team.js — 隊伍編成頁面邏輯
import { getUserId, loadOwnedHeroes, loadCurrentTeam, saveCurrentTeam } from './firebase.js';

const INITIAL_HEROES = new Set(['liubei', 'soldier']);
const MAX_TEAM       = 6;
const DEFAULT_TEAM   = ['liubei', 'soldier'];

let heroesData  = [];
let ownedMap    = {};
let currentTeam = [];   // array of heroIds (ordered)

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  const userId = getUserId();
  if (!userId) { location.href = 'index.html'; return; }

  const [heroes, owned, savedTeam] = await Promise.all([
    fetch('data/heroes.json').then(r => r.json()),
    loadOwnedHeroes(userId).catch(() => ({})),
    loadCurrentTeam(userId).catch(() => null),
  ]);

  heroesData = heroes;
  ownedMap   = owned;

  // 解析已儲存隊伍，過濾掉已不存在的英雄 id
  if (savedTeam && savedTeam.length > 0) {
    currentTeam = savedTeam.filter(id => heroes.find(h => h.id === id));
  } else {
    currentTeam = [...DEFAULT_TEAM];
  }

  render();

  document.getElementById('btn-back').addEventListener('click', () => {
    location.href = 'index.html';
  });
  document.getElementById('btn-confirm').addEventListener('click', confirmTeam);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getAvailableHeroes() {
  return heroesData.filter(h => INITIAL_HEROES.has(h.id) || !!ownedMap[h.id]);
}

function updateCountLabel() {
  document.getElementById('team-count-label').textContent =
    `${currentTeam.length} / ${MAX_TEAM}`;
}

// ── Render ────────────────────────────────────────────────────────────────────
function render() {
  renderTeamGrid();
  renderHeroPool();
  updateCountLabel();
}

function renderTeamGrid() {
  const grid = document.getElementById('team-grid');
  grid.innerHTML = '';

  for (let i = 0; i < MAX_TEAM; i++) {
    const heroId = currentTeam[i];
    const slot   = document.createElement('div');

    if (heroId) {
      const hero = heroesData.find(h => h.id === heroId);
      slot.className = 'team-slot filled';
      slot.innerHTML = `
        <img src="assets/heroes/hero_${heroId}_base.png"
             onerror="this.style.display='none'"
             alt="${hero?.nameLine[0] || heroId}">
        <span class="slot-name">${hero?.nameLine[0] || heroId}</span>
        <button class="slot-remove" aria-label="移除">✕</button>
      `;
      slot.querySelector('.slot-remove').addEventListener('click', () => removeFromTeam(i));
    } else {
      slot.className = 'team-slot empty';
      slot.innerHTML = `<span class="slot-empty-icon">＋</span>`;
    }

    grid.appendChild(slot);
  }
}

function renderHeroPool() {
  const pool = document.getElementById('hero-pool');
  pool.innerHTML = '';

  getAvailableHeroes().forEach(h => {
    const inTeam = currentTeam.includes(h.id);
    const card   = document.createElement('div');
    card.className = 'pool-card' + (inTeam ? ' in-team' : '');
    card.innerHTML = `
      <img src="assets/heroes/hero_${h.id}_base.png"
           onerror="this.style.display='none'"
           alt="${h.nameLine[0]}">
      ${inTeam ? '<div class="pool-mask">出戰中</div>' : ''}
      <span class="pool-name">${h.nameLine[0]}</span>
    `;
    if (!inTeam) {
      card.addEventListener('click', () => addToTeam(h.id));
    }
    pool.appendChild(card);
  });
}

// ── Team Actions ──────────────────────────────────────────────────────────────
function addToTeam(heroId) {
  if (currentTeam.length >= MAX_TEAM) return;
  if (currentTeam.includes(heroId)) return;
  currentTeam.push(heroId);
  render();
}

function removeFromTeam(idx) {
  currentTeam.splice(idx, 1);
  render();
}

// ── Confirm ───────────────────────────────────────────────────────────────────
async function confirmTeam() {
  if (currentTeam.length === 0) {
    showToast('請至少選擇一位英雄！');
    return;
  }

  const btn = document.getElementById('btn-confirm');
  btn.disabled    = true;
  btn.textContent = '存檔中...';
  showToast('存檔中...');

  const userId = getUserId();
  try {
    await saveCurrentTeam(userId, currentTeam);
    sessionStorage.setItem('currentTeam', JSON.stringify(currentTeam));
    location.href = 'index.html';
  } catch (e) {
    console.error('saveCurrentTeam failed', e);
    btn.disabled    = false;
    btn.textContent = '確認出戰 ⚔️';
    showToast('儲存失敗，請重試');
  }
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(msg) {
  let toast = document.querySelector('.st-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'st-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('visible');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('visible'), 1800);
}

init();
