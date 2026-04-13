// index.js — Login + Stage Select logic
import { getUserId, setUserId, loadOrCreateUser, getProgress } from './firebase.js';

let stagesData = null;
let progress   = {};
let userData   = null;

async function init() {
  const userId = getUserId();
  if (userId) {
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
  const nickname = document.getElementById('input-nickname').value.trim();
  const birthday = document.getElementById('input-birthday').value.trim();
  if (!nickname || !/^\d{4}$/.test(birthday)) {
    alert('請輸入暱稱和4位數生日（例：0301）');
    return;
  }
  const userId = setUserId(nickname, birthday);
  userData = await loadOrCreateUser(userId, nickname, birthday);
  await enterGame(userId);
}

async function enterGame(userId) {
  stagesData = await (await fetch('data/stages.json')).json();
  progress   = await getProgress(userId);

  const parts = userId.split('_');
  const nick  = parts.slice(0, -1).join('_');
  document.getElementById('display-nickname').textContent = `🐾 ${nick}`;
  document.getElementById('display-score').textContent    = `總分：${userData?.totalScore ?? 0}`;

  document.getElementById('btn-logout').addEventListener('click', () => {
    sessionStorage.removeItem('nunuUserId');
    location.reload();
  });

  renderStages();
  showScreen('stage-screen');
}

function renderStages() {
  const list = document.getElementById('stage-list');
  list.innerHTML = '';

  stagesData.forEach(stage => {
    const unlocked = !stage.unlockRequire || progress[stage.unlockRequire]?.completed;
    const cleared  = progress[stage.id]?.completed;

    const card = document.createElement('div');
    card.className = `stage-card${unlocked ? '' : ' locked'}`;
    card.innerHTML = `
      <div class="stage-num">${stage.chapterName}</div>
      <div class="stage-title">${stage.name}</div>
      <div class="stage-story">${stage.storyText}</div>
      ${cleared  ? `<div class="stage-cleared">✅ 最高分：${progress[stage.id].bestScore}</div>` : ''}
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
  document.getElementById(id).classList.add('active');
}

init();
