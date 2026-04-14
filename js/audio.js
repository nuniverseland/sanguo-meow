// audio.js — Web Audio 音效（無需外部音效檔）
let ctx = null;

function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  return ctx;
}

function tone(freq, type, duration, vol = 0.25, delay = 0) {
  try {
    const c   = getCtx();
    const osc = c.createOscillator();
    const g   = c.createGain();
    osc.connect(g);
    g.connect(c.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, c.currentTime + delay);
    g.gain.setValueAtTime(vol, c.currentTime + delay);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + delay + duration);
    osc.start(c.currentTime + delay);
    osc.stop(c.currentTime + delay + duration);
  } catch (e) { /* 瀏覽器不支援則靜默略過 */ }
}

// ✓ 答對：清脆三音上揚
export function sfxCorrect() {
  tone(523, 'sine', 0.12);
  tone(659, 'sine', 0.12, 0.25, 0.08);
  tone(784, 'sine', 0.18, 0.3,  0.16);
}

// ✗ 答錯：低沉短促嗡
export function sfxWrong() {
  tone(180, 'sawtooth', 0.25, 0.2);
  tone(150, 'sawtooth', 0.25, 0.15, 0.15);
}

// 召喚英雄：輕快兩音
export function sfxSummon() {
  tone(440, 'sine', 0.08);
  tone(660, 'sine', 0.12, 0.2, 0.07);
}

// 敵人死亡：短促打擊
export function sfxKill() {
  tone(350, 'triangle', 0.08, 0.3);
  tone(220, 'triangle', 0.1,  0.2, 0.06);
}

// Boss 登場：低沉轟鳴
export function sfxBossAppear() {
  tone(80,  'sawtooth', 0.5, 0.35);
  tone(120, 'sawtooth', 0.4, 0.25, 0.1);
}

// 連答獎勵：閃爍音效
export function sfxCombo() {
  [523, 659, 784, 1047].forEach((f, i) => tone(f, 'sine', 0.1, 0.2, i * 0.06));
}

// 錦囊：神聖感
export function sfxJinang() {
  [784, 988, 1175, 1568].forEach((f, i) => tone(f, 'sine', 0.25, 0.25, i * 0.08));
}

// 勝利：歡快上揚
export function sfxVictory() {
  [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, 'sine', 0.2, 0.35, i * 0.1));
}

// 失敗：沉重下行
export function sfxDefeat() {
  [400, 320, 250, 200].forEach((f, i) => tone(f, 'sawtooth', 0.3, 0.3, i * 0.15));
}

// 基地受擊：震動低音
export function sfxBaseHit() {
  tone(100, 'sawtooth', 0.2, 0.4);
}

// ── Gacha 專用音效 ────────────────────────────────────────────────────────────

// 按下召喚按鈕：低沉期待感，三音微微上揚
export function sfxGachaPull() {
  tone(200, 'sine', 0.12, 0.28);
  tone(300, 'sine', 0.14, 0.24, 0.09);
  tone(400, 'sine', 0.18, 0.2,  0.18);
}

// 新英雄揭曉：亮眼三音上揚
export function sfxGachaNew() {
  tone(659,  'sine', 0.14, 0.32);
  tone(784,  'sine', 0.16, 0.36, 0.1);
  tone(1047, 'sine', 0.28, 0.42, 0.2);
}

// SR 英雄揭曉：六音華麗上揚 + 閃爍尾音
export function sfxGachaSR() {
  [330, 415, 523, 659, 830, 1047].forEach((f, i) =>
    tone(f, 'sine', 0.13, 0.28, i * 0.055)
  );
  tone(1319, 'sine', 0.38, 0.45, 0.34);
  tone(1047, 'sine', 0.22, 0.3,  0.44);
}

// 碎片獲得：輕快短促兩音
export function sfxGachaFrag() {
  tone(440, 'triangle', 0.09, 0.2);
  tone(523, 'triangle', 0.1,  0.2, 0.07);
}
