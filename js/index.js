// index.js — Login + Stage Select logic
import { getUserId, setUserId, loadOrCreateUser, getProgress } from './firebase.js';

let stagesData = null;
let progress   = {};
let userData   = null;

async function init() {
  const userId = getUserId();
  if (userId) {
    // 已登入：直接跳到選關畫面，避免閃回登入頁
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
    const [stages, prog] = await Promise.all([
      fetch('data/stages.json').then(r => r.json()),
      getProgress(userId).catch(() => ({}))   // Firebase 失敗不擋路
    ]);
    stagesData = stages;
    progress   = prog;
  } catch (e) {
    stagesData = stagesData || [];
    progress   = {};
  }

  const parts = userId.split('_');
  const nick  = parts.slice(0, -1).join('_');
  document.getElementById('display-nickname').textContent = `🐾 ${nick}`;
  document.getElementById('display-score').textContent    = `總分：${userData?.totalScore ?? 0}`;

  // 防止重複綁定
  const logoutBtn = document.getElementById('btn-logout');
  logoutBtn.replaceWith(logoutBtn.cloneNode(true));
  document.getElementById('btn-logout').addEventListener('click', () => {
    sessionStorage.removeItem('nunuUserId');
    location.reload();
  });

  // 背景圖：路徑從 HTML 算，不從 CSS 算
  document.getElementById('stage-screen').style.cssText +=
    ';background:url("assets/backgrounds/bg_main.jpg") center top / cover no-repeat;';

  renderStages();
}

function renderStages() {
  const list = document.getElementById('stage-list');
  list.innerHTML = '';

  (stagesData || []).forEach(stage => {
    const unlocked = !stage.unlockRequire || progress[stage.unlockRequire]?.completed;
    const cleared  = progress[stage.id]?.completed;

    const card = document.createElement('div');
    card.className = `stage-card${unlocked ? '' : ' locked'}`;
    card.innerHTML = `
      <div class="stage-num">${stage.chapterName}</div>
      <div class="stage-title">${stage.name}</div>
      <div class="stage-story">${stage.storyText}</div>
      ${cleared   ? `<div class="stage-cleared">✅ 最高分：${progress[stage.id].bestScore}</div>` : ''}
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
