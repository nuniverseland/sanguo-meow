// leaderboard.js — Leaderboard page logic
import { fetchDailyLeaderboard, fetchAllTimeLeaderboard } from './firebase.js';

const tbody      = document.getElementById('leaderboard-body');
const scoreHeader = document.getElementById('score-col-header');
const tabBtns    = document.querySelectorAll('.tab-btn');

let currentTab = 'daily';

async function render(tab) {
  tbody.innerHTML = '<tr><td colspan="3" class="loading-row">載入中…</td></tr>';
  try {
    const rows = tab === 'daily'
      ? await fetchDailyLeaderboard()
      : await fetchAllTimeLeaderboard();

    scoreHeader.textContent = tab === 'daily' ? '今日得分' : '總戰功';

    if (!rows.length) {
      const msg = tab === 'daily' ? '今天還沒有人上榜，快去破關！🐾' : '還沒有紀錄，快去破關！🐾';
      tbody.innerHTML = `<tr><td colspan="3" class="loading-row">${msg}</td></tr>`;
      return;
    }

    const scoreField = tab === 'daily' ? 'dailyScore' : 'totalScore';
    tbody.innerHTML = rows.map(r => `
      <tr class="${r.rank <= 3 ? `rank-${r.rank}` : ''}">
        <td>${r.rank <= 3 ? ['🥇','🥈','🥉'][r.rank-1] : r.rank}</td>
        <td>${escHtml(r.nickname || r.id)}</td>
        <td>${r[scoreField] ?? 0}</td>
      </tr>
    `).join('');
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="3" class="loading-row">載入失敗，請稍後再試</td></tr>';
    console.error(e);
  }
}

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    tabBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentTab = btn.dataset.tab;
    render(currentTab);
  });
});

render(currentTab);

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
