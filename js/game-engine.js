// game-engine.js — Core game loop
import { getUserId, addScore, saveStageResult, loadHeroData, addHeroExp, recordWrongAnswer, recordMathStat, updateLeaderboard, addScrolls, loadOwnedHeroes } from './firebase.js';
import { Hero }     from './hero.js';
import { Enemy }    from './enemy.js';
import { loadQuestions, nextQuestion, checkAnswer, questionText } from './question.js';
import { loadDialogs, showDialog } from './dialog.js';
import { sfxCorrect, sfxWrong, sfxSummon, sfxKill, sfxCombo, sfxJinang, sfxVictory, sfxDefeat, sfxBaseHit, sfxBossAppear } from './audio.js';

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  running:    false,
  paused:     false,
  stageData:  null,
  heroesData: [],
  enemiesData: [],
  config:     null,

  heroes:     [],   // active Hero instances
  enemies:    [],   // active Enemy instances

  gold:       200,
  score:      0,
  playerBaseHp: 20,
  enemyBaseHp:  1500,
  playerBaseHpMax: 20,
  enemyBaseHpMax:  1500,

  elapsedSec:   0,
  startTime:    0,
  lastFrameTime: 0,

  spawnQueue:   [],   // time-based entries remaining
  triggersDone: new Set(),

  combo:           0,
  correctTotal:    0,   // 累計答對題數（用於每10題+1卷軸）
  comboBoostActive: false,
  comboBoostEnd:    0,
  jinangActive:     false,
  jinangEnd:        0,

  dialogChoice:  null,
  buff:          {},   // applied dialog buff

  cooldowns:     {},   // heroId → timestamp ready
  heroCount:     {},   // heroId → current count on field
  MAX_HERO_COUNT: 5,

  battlefieldW:  0,
  playerBaseX:   0,
  enemyBaseX:    0,

  rafId:     null,
  autoGoldTimer: null,
};

// ── DOM refs ─────────────────────────────────────────────────────────────────
const el = {
  bf:          () => document.getElementById('battlefield'),
  units:       () => document.getElementById('units-layer'),
  fx:          () => document.getElementById('fx-layer'),
  gold:        () => document.getElementById('gold-amount'),
  score:       () => document.getElementById('display-score-game'),
  baseHp:      () => document.getElementById('display-base-hp'),
  playerBase:  () => document.getElementById('player-base'),
  enemyBase:   () => document.getElementById('enemy-base'),
  playerHpBar: () => document.querySelector('#player-base .base-hp-bar'),
  enemyHpBar:  () => document.querySelector('#enemy-base .base-hp-bar'),
  qDisplay:    () => document.getElementById('question-display'),
  choiceBtns:  () => document.querySelectorAll('.choice-btn'),
  feedback:    () => document.getElementById('answer-feedback'),
  combo:       () => document.getElementById('combo-display'),
  comboCount:  () => document.getElementById('combo-count'),
  comboEffect: () => document.getElementById('combo-effect'),
  summonPanel: () => document.getElementById('summon-panel'),
  stageName:   () => document.getElementById('stage-name'),
  resultOverlay: () => document.getElementById('result-overlay'),
  resultTitle:   () => document.getElementById('result-title'),
  resultStats:   () => document.getElementById('result-stats'),
};

// ── Boot ──────────────────────────────────────────────────────────────────────
function loadBaseImg(wrapId, src) {
  const wrap = document.getElementById(wrapId);
  if (!wrap) return;
  const img = new Image();
  img.onload = () => {
    wrap.textContent = '';   // 清掉 emoji
    img.style.cssText = 'width:200px;height:320px;object-fit:contain;image-rendering:pixelated;display:block;';
    wrap.appendChild(img);
  };
  img.onerror = () => { /* 保留 emoji fallback */ };
  img.src = src;
}

function showError(msg) {
  document.body.innerHTML = `
    <div style="color:#ff6060;background:#1a0000;padding:32px;font-family:monospace;white-space:pre-wrap;font-size:14px;">
      <b>🐱 遊戲初始化失敗</b><br><br>${msg}<br><br>
      <a href="index.html" style="color:#f5c842">← 返回選關</a>
    </div>`;
}

async function init() {
  try {
    // 允許直接開啟 game.html 測試（預設台灣第一關）
    let stageId = sessionStorage.getItem('currentStageId') || 'taiwan_1';

    document.getElementById('btn-back').addEventListener('click', () => {
      cancelAnimationFrame(state.rafId);
      clearInterval(state.autoGoldTimer);
      location.href = 'index.html';
    });
    document.getElementById('btn-retry').addEventListener('click', () => location.reload());
    document.getElementById('btn-result-back').addEventListener('click', () => { location.href = 'index.html'; });

    // 初始英雄（大耳喵、小兵喵）不需要抽卡
    const INITIAL_HEROES = new Set(['liubei', 'soldier']);

    const userId = getUserId();
    const [stages, heroes, enemies, config, ownedMap] = await Promise.all([
      fetch('data/stages.json').then(r => r.json()),
      fetch('data/heroes.json').then(r => r.json()),
      fetch('data/enemies.json').then(r => r.json()),
      fetch('data/config.json').then(r => r.json()),
      userId ? loadOwnedHeroes(userId).catch(() => ({})) : Promise.resolve({}),
      loadQuestions(),
      loadDialogs()
    ]);

    state.stageData   = stages.find(s => s.id === stageId);
    state.heroesData  = heroes;
    state.enemiesData = enemies;
    state.config      = config;

    if (!state.stageData) { showError(`找不到關卡：${stageId}`); return; }

    el.stageName().textContent = state.stageData.name;

    // Setup battlefield size
    const bf = el.bf();
    state.battlefieldW = bf.clientWidth;
    state.playerBaseX  = 10;
    state.enemyBaseX   = state.battlefieldW - 140;

    // Set base HP
    state.playerBaseHp    = state.stageData.playerBaseHp;
    state.playerBaseHpMax = state.stageData.playerBaseHp;
    state.enemyBaseHp     = state.stageData.enemyBaseHp;
    state.enemyBaseHpMax  = state.stageData.enemyBaseHp;

    // Set backgrounds & base images
    if (state.stageData.background) {
      bf.style.backgroundImage = `url('${state.stageData.background}')`;
      bf.style.backgroundSize  = 'cover';
    }
    loadBaseImg('player-base-img-wrap', state.stageData.playerBase);
    loadBaseImg('enemy-base-img-wrap', state.stageData.enemyBase);

    // Build spawn queue (time-based)
    state.spawnQueue = state.stageData.spawnSchedule
      .filter(e => e.time !== undefined)
      .sort((a, b) => a.time - b.time);

    // 只顯示初始英雄 + 已抽到的英雄
    const availableHeroes = heroes.filter(h =>
      INITIAL_HEROES.has(h.id) || !!ownedMap[h.id]
    );
    buildSummonPanel(availableHeroes);

    // Setup math answer buttons
    el.choiceBtns().forEach(btn => {
      btn.addEventListener('click', () => onAnswer(parseInt(btn.textContent)));
    });

    // Show dialog then start
    const choice = await showDialog(state.stageData.dialogId);
    state.dialogChoice = choice;
    applyDialogBuff(choice);

    startGame();

  } catch (err) {
    console.error('[game-engine] init() 失敗：', err);
    showError(err.message + '\n\n' + err.stack);
  }
}

// ── Dialog Buff ───────────────────────────────────────────────────────────────
function applyDialogBuff(choice) {
  if (!choice) return;
  const buff = {};
  switch (choice.effect) {
    case 'speed_boost':   buff.spd_boost = 1 + choice.value; break;
    case 'hp_boost':      buff.hp_boost  = 1 + choice.value; break;
    case 'gold_boost':    buff.gold_rate = 1 + choice.value; break;
    case 'all_atk':       buff.atk_boost = 1 + choice.value; break;
    case 'gold_start':    state.gold += choice.value; break;
    case 'boss_atk_boost': buff.boss_dmg = 1 + choice.value; break;
  }
  if (choice.effect === 'gold_boost') {
    // penalise base HP
    state.playerBaseHp    = Math.max(1, state.playerBaseHp - 2);
    state.playerBaseHpMax = state.playerBaseHp;
  }
  state.buff = buff;
}

// ── Summon Panel ──────────────────────────────────────────────────────────────
function buildSummonPanel(heroes) {
  const panel = el.summonPanel();
  panel.innerHTML = '';
  heroes.forEach(h => {
    const form = h.forms[0]; // always show current form (simplified for Phase 1)
    const btn  = document.createElement('button');
    btn.className    = 'hero-btn';
    btn.dataset.heroId = h.id;
    btn.innerHTML = `
      <div class="hero-btn-avatar">
        <img src="assets/heroes/hero_${h.id}_base.png"
             onerror="this.outerHTML='<span>${require_emoji(h.id)}</span>'"
             width="40" height="40" alt="${h.nameLine[0]}">
      </div>
      <div class="hero-btn-info">
        <div class="hero-btn-name">${h.nameLine[0]}</div>
        <div class="hero-btn-cost">💰 ${form.cost}</div>
      </div>
      <div class="cooldown-bar-bg"><div class="cooldown-bar-fill" id="cd_${h.id}"></div></div>
    `;
    btn.addEventListener('click', () => summonHero(h.id));
    panel.appendChild(btn);
    state.cooldowns[h.id]  = 0;
    state.heroCount[h.id]  = 0;
  });
}

function require_emoji(id) {
  const map = { liubei:'🐱', guanyu:'⚔️', zhangfei:'💥', zhangjiu:'💪', soldier:'🪖' };
  return map[id] || '🐾';
}

function summonHero(heroId) {
  const now    = Date.now();
  const hData  = state.heroesData.find(h => h.id === heroId);
  const form   = hData.forms[0];

  if (state.gold < form.cost) return;
  if (state.heroCount[heroId] >= state.MAX_HERO_COUNT) return;
  if (now < state.cooldowns[heroId]) return;

  state.gold -= form.cost;
  state.cooldowns[heroId] = now + form.cooldown;
  state.heroCount[heroId]++;
  sfxSummon();

  const hero = new Hero(hData, 0, 1, state.buff);
  hero.x = state.playerBaseX + 140;
  const heroEl = hero.createElement();
  el.units().appendChild(heroEl);
  state.heroes.push(hero);
}

// ── Game Start ────────────────────────────────────────────────────────────────
function startGame() {
  state.running      = true;
  state.startTime    = Date.now();
  state.lastFrameTime = performance.now();

  // Auto gold
  const cfg = state.config.gold;
  const rate = cfg.autoRate * (state.buff.gold_rate || 1);
  state.autoGoldTimer = setInterval(() => {
    if (!state.running) return;
    addGold(rate);
  }, cfg.autoInterval);

  showNextQuestion();
  requestAnimationFrame(gameLoop);
}

// ── Game Loop ─────────────────────────────────────────────────────────────────
function gameLoop(timestamp) {
  if (!state.running) return;

  const dt = (timestamp - state.lastFrameTime) / 1000; // seconds
  state.lastFrameTime = timestamp;
  state.elapsedSec    = (Date.now() - state.startTime) / 1000;

  processSpawns();
  moveUnits(dt);
  resolveAttacks(timestamp);
  cleanDead();
  checkTriggers();
  updateUI();

  state.rafId = requestAnimationFrame(gameLoop);
}

// ── Spawn ─────────────────────────────────────────────────────────────────────
function processSpawns() {
  while (state.spawnQueue.length && state.spawnQueue[0].time <= state.elapsedSec) {
    const entry = state.spawnQueue.shift();
    spawnEnemies(entry.enemy, entry.count);
  }
}

function spawnEnemies(enemyId, count) {
  const eData = state.enemiesData.find(e => e.id === enemyId);
  if (!eData) return;
  if (eData.type === 'boss') sfxBossAppear();
  for (let i = 0; i < count; i++) {
    const enemy  = new Enemy(eData, {});
    enemy.x      = state.enemyBaseX - 90 - i * 110;
    const eEl    = enemy.createElement();
    el.units().appendChild(eEl);
    state.enemies.push(enemy);
  }
}

function fireTrigger(name) {
  if (state.triggersDone.has(name)) return;
  state.triggersDone.add(name);
  const entries = state.stageData.spawnSchedule.filter(e => e.trigger === name);
  entries.forEach(e => spawnEnemies(e.enemy, e.count));
}

// ── Move ──────────────────────────────────────────────────────────────────────
function moveUnits(dt) {
  // Heroes move right until they hit an enemy or enemy base
  state.heroes.forEach(h => {
    if (!h.alive) return;
    const blocked = nearestEnemy(h);
    if (blocked && dist(h, blocked) <= (h.range + blocked.range) / 2) {
      h.attacking = true;
      h.target    = blocked;
    } else if (h.x + 48 >= state.enemyBaseX) {
      h.attacking = true;
      h.target    = null; // attacking base
    } else {
      h.attacking = false;
      h.target    = null;
      h.x        += h.spd * dt * 60;
    }
    h.updateDOM();
  });

  // Enemies move left until they hit a hero or player base
  state.enemies.forEach(e => {
    if (!e.alive) return;
    const blocked = nearestHero(e);
    if (blocked && dist(e, blocked) <= (e.range + blocked.range) / 2) {
      e.attacking = true;
      e.target    = blocked;
    } else if (e.x <= state.playerBaseX + 80) {
      e.attacking = true;
      e.target    = null; // attacking base
    } else {
      e.attacking = false;
      e.target    = null;
      e.x        -= e.speed * dt * 60;
    }
    e.updateDOM();
  });
}

// ── Attacks ───────────────────────────────────────────────────────────────────
function resolveAttacks(now) {
  state.heroes.forEach(h => {
    if (!h.alive || !h.attacking) return;
    if (now - h.lastAttackAt < h.attackInterval) return;
    h.lastAttackAt = now;

    if (!h.target) {
      // Hit enemy base
      const dmg = Math.round(h.atk * (state.jinangActive ? 1 + state.config.jinang.attackBoost : 1));
      state.enemyBaseHp = Math.max(0, state.enemyBaseHp - dmg);
      spawnFx(`+${dmg}`, h.x + 24, 20, 'dmg');
      fireTrigger('base_attacked');
      if (state.enemyBaseHp <= 0) { endGame(true); return; }
    } else if (h.attackType === 'area') {
      enemiesInRange(h).forEach(e => damageEnemy(e, h.atk));
    } else {
      damageEnemy(h.target, h.atk);
    }
  });

  state.enemies.forEach(e => {
    if (!e.alive || !e.attacking) return;
    if (now - e.lastAttackAt < e.attackInterval) return;
    e.lastAttackAt = now;

    if (!e.target) {
      // Hit player base
      state.playerBaseHp = Math.max(0, state.playerBaseHp - e.atk);
      spawnFx(`-${e.atk}`, state.playerBaseX + 40, 30, 'dmg');
      shakePlayerBase();
      if (state.playerBaseHp <= 0) { endGame(false); return; }
    } else if (e.attackType === 'area') {
      heroesInRange(e).forEach(h => damageHero(h, e.atk));
    } else {
      damageHero(e.target, e.atk);
    }
  });
}

function damageEnemy(enemy, rawAtk) {
  if (!enemy || !enemy.alive) return;
  const boss_mult = (state.buff.boss_dmg && enemy.isBoss()) ? state.buff.boss_dmg : 1;
  const jinang    = state.jinangActive ? 1 + state.config.jinang.attackBoost : 1;
  const dmg       = Math.round(rawAtk * boss_mult * jinang);
  enemy.takeDamage(dmg);
  spawnFx(`-${dmg}`, enemy.x + 24, 40, 'dmg');
  if (!enemy.alive) {
    onEnemyKilled(enemy);
  }
}

function damageHero(hero, atk) {
  if (!hero || !hero.alive) return;
  hero.takeDamage(atk);
  spawnFx(`-${atk}`, hero.x + 24, 40, 'dmg');
}

function onEnemyKilled(enemy) {
  sfxKill();
  addGold(enemy.reward);
  const scoreGain = enemy.type === 'boss'  ? state.config.score.killBoss
                  : enemy.type === 'flying' ? state.config.score.killFlying
                  : state.config.score.killNormal;
  state.score += scoreGain;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function dist(a, b)    { return Math.abs(a.x - b.x); }
function nearestEnemy(hero) {
  return state.enemies.filter(e => e.alive && e.x > hero.x)
    .sort((a,b) => a.x - b.x)[0] || null;
}
function nearestHero(enemy) {
  return state.heroes.filter(h => h.alive && h.x < enemy.x)
    .sort((a,b) => b.x - a.x)[0] || null;
}
function enemiesInRange(h) {
  return state.enemies.filter(e => e.alive && Math.abs(e.x - h.x) <= h.range);
}
function heroesInRange(e) {
  return state.heroes.filter(h => h.alive && Math.abs(h.x - e.x) <= e.range);
}

// ── Triggers ──────────────────────────────────────────────────────────────────
function checkTriggers() {
  // boss_hp_50pct
  const boss = state.enemies.find(e => e.isBoss && e.isBoss());
  if (boss && boss.hpPercent() <= 0.5) {
    fireTrigger('boss_hp_50pct');
  }
}

// ── Gold ──────────────────────────────────────────────────────────────────────
function addGold(amount) {
  const boost = state.comboBoostActive ? state.config.gold.comboMultiplier : 1;
  state.gold += Math.round(amount * boost);
}

// ── Math answer ───────────────────────────────────────────────────────────────
let _currentChoices = [];

function showNextQuestion() {
  const types = state.stageData.mathTypes;
  const result = nextQuestion(types);
  if (!result) return;
  _currentChoices = result.choices;

  // 直式格式
  const q  = result.question;
  const op = q.type === 'multiplication' ? '×'
           : q.type === 'addition'       ? '+'
           : '−';
  const qDisplay = document.getElementById('question-display');
  if (qDisplay) {
    qDisplay.innerHTML = `
      <div class="question-vertical">
        <div class="q-num q-top">${q.a}</div>
        <div class="q-op-row"><span class="q-op">${op}</span><span class="q-num q-bot">${q.b}</span></div>
        <div class="q-divider"></div>
        <div class="q-num q-ans">？</div>
      </div>
    `;
  }

  el.choiceBtns().forEach((btn, i) => {
    btn.textContent = result.choices[i];
    btn.className   = 'choice-btn';
  });
  el.feedback().classList.add('hidden');
}

function onAnswer(chosen) {
  const result = checkAnswer(chosen);
  if (!result) return;

  const fb = el.feedback();

  if (result.correct) {
    // Gold
    const gain = result.type === 'multiplication'
      ? state.config.gold.correctMultiplication
      : state.config.gold.correctAddition;
    addGold(gain);
    state.score += state.config.score.correctAnswer;

    // EXP → most expensive deployed hero
    const userId = getUserId();
    if (userId) {
      try {
        const mainHero = expHero();
        const expGain  = result.type === 'multiplication'
          ? state.config.exp.correctMultiplication
          : state.config.exp.correctAddition;
        if (mainHero) addHeroExp(userId, mainHero.heroId, expGain);
        recordMathStat(userId, result.type, true);
      } catch (e) { console.warn('Firebase EXP 更新失敗', e); }
    }

    // Combo
    state.combo++;
    updateComboUI();

    // 卷軸：每答對 10 題 +1 卷
    state.correctTotal++;
    if (state.correctTotal % 10 === 0) {
      const uid = getUserId();
      if (uid) addScrolls(uid, 1).catch(() => {});
      spawnFx('🎴+1', state.battlefieldW / 2, 80, 'gold');
    }

    sfxCorrect();
    fb.textContent = `✓ 答對！+${gain} 💰`;
    fb.className   = 'answer-feedback correct';
    fb.classList.remove('hidden');
    spawnFx(`+${gain}💰`, state.battlefieldW / 2, 60, 'gold');

    highlightChoices(chosen, result.correctAnswer, true);
    setTimeout(showNextQuestion, 600);

  } else {
    // Wrong: base -1 HP
    state.playerBaseHp = Math.max(0, state.playerBaseHp - state.config.penalty.wrongAnswer);
    shakePlayerBase();

    const userId = getUserId();
    if (userId) {
      try {
        recordMathStat(userId, result.type, false);
        const mainHero = expHero();
        if (mainHero) recordWrongAnswer(userId, mainHero.heroId);
      } catch (e) { console.warn('Firebase 答錯記錄失敗', e); }
    }

    // Reset combo (but keep streak count if < 3)
    if (state.combo < state.config.combo.level1) state.combo = 0;
    updateComboUI();

    sfxWrong();
    sfxBaseHit();
    fb.textContent = `✗ 答錯！正確答案是 ${result.correctAnswer}　-1 ❤️`;
    fb.className   = 'answer-feedback wrong';
    fb.classList.remove('hidden');

    highlightChoices(chosen, result.correctAnswer, false);
    if (state.playerBaseHp <= 0) { endGame(false); return; }
    setTimeout(showNextQuestion, 1000);
  }
}

function expHero() {
  // Return the highest-cost hero currently deployed
  return state.heroes.filter(h => h.alive)
    .sort((a,b) => b.formData.cost - a.formData.cost)[0] || null;
}

function highlightChoices(chosen, correct, wasCorrect) {
  el.choiceBtns().forEach(btn => {
    const val = parseInt(btn.textContent);
    if (val === correct) btn.classList.add('correct');
    else if (val === chosen && !wasCorrect) btn.classList.add('wrong');
  });
}

// ── Combo UI ──────────────────────────────────────────────────────────────────
function updateComboUI() {
  const cfg   = state.config.combo;
  const combo = el.combo();
  if (state.combo >= cfg.level1) {
    combo.classList.remove('hidden');
    el.comboCount().textContent = state.combo;

    if (state.combo >= cfg.level2 && !state.jinangActive) {
      activateJinang();
      sfxJinang();
      el.comboEffect().textContent = '⚡ 錦囊！全軍強化';
    } else if (state.combo >= cfg.level1 && !state.comboBoostActive) {
      activateGoldBoost();
      sfxCombo();
      el.comboEffect().textContent = '💰 ×1.5';
    }
  } else {
    combo.classList.add('hidden');
  }
}

function activateGoldBoost() {
  state.comboBoostActive = true;
  state.comboBoostEnd    = Date.now() + state.config.gold.comboDuration;
  setTimeout(() => { state.comboBoostActive = false; }, state.config.gold.comboDuration);
}

function activateJinang() {
  state.jinangActive = true;
  state.jinangEnd    = Date.now() + state.config.jinang.duration;
  setTimeout(() => { state.jinangActive = false; }, state.config.jinang.duration);
}

// ── Shake ──────────────────────────────────────────────────────────────────────
function shakePlayerBase() {
  const base = el.playerBase();
  base.classList.add('shake');
  setTimeout(() => base.classList.remove('shake'), 450);
}

// ── FX Text ───────────────────────────────────────────────────────────────────
function spawnFx(text, x, y, type = 'gold') {
  const fx = el.fx();
  const span = document.createElement('span');
  span.className = `fx-text ${type}`;
  span.textContent = text;
  span.style.left = `${x}px`;
  span.style.top  = `${y}px`;
  fx.appendChild(span);
  setTimeout(() => span.remove(), 900);
}

// ── Clean dead units ──────────────────────────────────────────────────────────
function cleanDead() {
  state.heroes = state.heroes.filter(h => {
    if (!h.alive) {
      state.heroCount[h.heroId] = Math.max(0, (state.heroCount[h.heroId] || 1) - 1);
      h.remove();
      return false;
    }
    return true;
  });
  state.enemies = state.enemies.filter(e => {
    if (!e.alive) { e.remove(); return false; }
    return true;
  });
}

// ── Update UI ─────────────────────────────────────────────────────────────────
function updateUI() {
  el.gold().textContent     = state.gold;
  el.score().textContent    = `⭐ ${state.score}`;
  el.baseHp().textContent   = `🏯 HP: ${state.playerBaseHp}`;

  // HP bars + HP text
  const pBar  = el.playerHpBar();
  const eBar  = el.enemyHpBar();
  const pText = document.getElementById('player-base-hp-text');
  const eText = document.getElementById('enemy-base-hp-text');
  if (pBar)  pBar.style.setProperty('--pct', `${state.playerBaseHp / state.playerBaseHpMax * 100}%`);
  if (eBar)  eBar.style.setProperty('--pct', `${state.enemyBaseHp  / state.enemyBaseHpMax  * 100}%`);
  if (pText) pText.textContent = `🏯 ${state.playerBaseHp} / ${state.playerBaseHpMax}`;
  if (eText) eText.textContent = `🗼 ${state.enemyBaseHp}  / ${state.enemyBaseHpMax}`;

  // Cooldown bars
  const now = Date.now();
  state.heroesData.forEach(h => {
    const fill = document.getElementById(`cd_${h.id}`);
    if (!fill) return;
    const ready = state.cooldowns[h.id] || 0;
    const cd    = h.forms[0].cooldown;
    const pct   = ready <= now ? 100 : Math.round((1 - (ready - now) / cd) * 100);
    fill.style.width = `${pct}%`;

    const btn = document.querySelector(`[data-hero-id="${h.id}"]`);
    if (btn) btn.disabled = (state.gold < h.forms[0].cost || now < ready || state.heroCount[h.id] >= state.MAX_HERO_COUNT);
  });
}

// ── End Game ──────────────────────────────────────────────────────────────────
async function endGame(win) {
  state.running = false;
  cancelAnimationFrame(state.rafId);
  clearInterval(state.autoGoldTimer);

  const elapsed = Math.round(state.elapsedSec);
  const perfect = state.playerBaseHp === state.playerBaseHpMax;

  if (win) {
    // Bonus scores
    if (perfect) state.score += state.config.score.stagePerfect;
    if (elapsed < state.stageData.speedBonusTarget) state.score += state.config.score.stageSpeed;
    state.score += state.config.score.stageBase;
  }

  // Save to Firebase（失敗不影響遊戲結果顯示）
  const userId = getUserId();
  if (userId && win) {
    try {
      const prevResult = await saveStageResult(userId, state.stageData.id, {
        score: state.score, time: elapsed, perfect,
        dialogChoice: state.dialogChoice?.label || null
      });
      await addScore(userId, state.score);
      const parts = userId.split('_');
      const nick  = parts.slice(0, -1).join('_');
      await updateLeaderboard(userId, {
        nickname: nick, totalScore: state.score, weeklyScore: state.score,
        farthestStage: state.stageData.id, farthestCountry: state.stageData.country,
        title: '初出茅廬'
      });
      // 卷軸獎勵：首次通關+3、重複通關+1、完美+1
      const isFirst = prevResult?.firstClear ?? false;
      let scrollReward = isFirst ? 3 : 1;
      if (perfect) scrollReward += 1;
      await addScrolls(userId, scrollReward).catch(() => {});
    } catch (e) { console.warn('Firebase 存檔失敗', e); }
  }

  // Show result
  const overlay = el.resultOverlay();
  win ? sfxVictory() : sfxDefeat();
  el.resultTitle().textContent = win ? '🎉 勝利！' : '💀 失敗';
  el.resultTitle().className   = `result-title ${win ? 'win' : 'lose'}`;
  el.resultStats().innerHTML   = `
    得分：${state.score}<br>
    時間：${elapsed} 秒<br>
    ${perfect ? '✨ 完美通關（不失血）<br>' : ''}
    ${win && elapsed < state.stageData.speedBonusTarget ? '⚡ 速通獎勵！<br>' : ''}
  `;
  overlay.classList.remove('hidden');
}

// ── Start ─────────────────────────────────────────────────────────────────────
init();
