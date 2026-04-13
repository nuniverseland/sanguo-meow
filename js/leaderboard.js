// leaderboard.js — Leaderboard page logic
import { fetchLeaderboard } from './firebase.js';

const tbody   = document.getElementById('leaderboard-body');
const tabBtns = document.querySelectorAll('.tab-btn');

let currentTab = 'weekly';

async function render(field) {
  tbody.innerHTML = '<tr><td colspan="5" class="loading-row">載入中…</td></tr>';
  try {
    const rows = await fetchLeaderboard(field === 'weekly' ? 'weeklyScore' : 'totalScore');
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="loading-row">還沒有紀錄，快去破關！🐾</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(r => `
      <tr class="${r.rank <= 3 ? `rank-${r.rank}` : ''}">
        <td>${r.rank <= 3 ? ['🥇','🥈','🥉'][r.rank-1] : r.rank}</td>
        <td>${escHtml(r.nickname || r.id)}</td>
        <td>${field === 'weekly' ? r.weeklyScore : r.totalScore}</td>
        <td>${escHtml(r.farthestStage || '—')}</td>
        <td>${escHtml(r.title || '—')}</td>
      </tr>
    `).join('');
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="5" class="loading-row">載入失敗，請稍後再試</td></tr>';
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
