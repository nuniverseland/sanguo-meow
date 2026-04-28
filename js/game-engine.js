// game-engine.js — Core game loop
import { getUserId, addScore, getUserData, saveStageResult, loadHeroData, addHeroExp, recordWrongAnswer, recordMathStat, updateLeaderboard, addScrolls, loadOwnedHeroes, recordBestiaryDefeat, loadCurrentTeam, loadJadeData, addJadeFrags } from './firebase.js';
import { defaultJadeData, computeJadeBonuses, rollJadeDrop } from './jade.js';
import { isTutorialDone, runTutorial } from './tutorial.js';
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
  ownedMap:   {},   // { heroId: { exp, ... } } from Firebase

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
    img.style.cssText = 'width:400px;height:auto;object-fit:contain;image-rendering:pixelated;display:block;';
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

    // 初始英雄（大耳喵、小兵喵）不需要抽卡，作為預設隊伍備用
    const INITIAL_HEROES = new Set(['liubei', 'soldier']);

    const userId = getUserId();
    const [stages, heroes, enemies, config, ownedMap, savedTeam, jadeData] = await Promise.all([
      fetch('data/stages.json').then(r => r.json()),
      fetch('data/heroes.json').then(r => r.json()),
      fetch('data/enemies.json').then(r => r.json()),
      fetch('data/config.json').then(r => r.json()),
      userId ? loadOwnedHeroes(userId).catch(() => ({})) : Promise.resolve({}),
      userId ? loadCurrentTeam(userId).catch(() => null) : Promise.resolve(null),
      userId ? loadJadeData(userId).catch(() => null) : Promise.resolve(null),
      loadQuestions(),
      loadDialogs()
    ]);
    state.jadeBonuses = computeJadeBonuses(jadeData ?? defaultJadeData());
    state.stageCountry = null; // set below after stageData loads

    state.stageData   = stages.find(s => s.id === stageId);
    state.heroesData  = heroes;
    state.enemiesData = enemies;
    state.config      = config;
    state.ownedMap    = ownedMap;

    if (!state.stageData) { showError(`找不到關卡：${stageId}`); return; }
    state.stageCountry = state.stageData.country ?? null;

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

    // 讀取隊伍編成：sessionStorage（由 setup-team 設定）→ Firebase → 預設
    const DEFAULT_TEAM = ['liubei', 'soldier'];
    let teamIds = JSON.parse(sessionStorage.getItem('currentTeam') || 'null');
    if (!teamIds) teamIds = savedTeam;
    if (!teamIds || teamIds.length === 0) teamIds = DEFAULT_TEAM;

    const availableHeroes = teamIds
      .map(id => heroes.find(h => h.id === id))
      .filter(Boolean);
    buildSummonPanel(availableHeroes);

    // Setup answer buttons (math: number string; English: text string)
    el.choiceBtns().forEach(btn => {
      btn.addEventListener('click', () => onAnswer(btn.dataset.answer ?? btn.textContent));
    });

    // Show dialog then start
    const choice = await showDialog(state.stageData.dialogId);
    state.dialogChoice = choice;
    applyDialogBuff(choice);

    startGame();

    if (!isTutorialDone('battle')) {
      state.paused = true;
      runTutorial('battle', [
        { targetId: 'choices-grid', text: '答對數學題就能賺金幣！💰' },
        { targetId: 'summon-panel', text: '用金幣召喚英雄攻打敵人！👇' },
        { targetId: 'enemy-base',   text: '把敵人血量打到 0 就贏了！⚔️' },
      ], () => { state.paused = false; });
    }

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
  // 疊加寶玉被動加成（乘數型直接相加，冷卻另存）
  const jb = state.jadeBonuses ?? {};
  if (jb.atk_boost)       buff.atk_boost       = (buff.atk_boost       ?? 1) - 1 + jb.atk_boost;
  if (jb.hp_boost)        buff.hp_boost        = (buff.hp_boost        ?? 1) - 1 + jb.hp_boost;
  if (jb.gold_rate)       buff.gold_rate       = (buff.gold_rate       ?? 1) - 1 + jb.gold_rate;
  if (jb.spd_boost)       buff.spd_boost       = (buff.spd_boost       ?? 1) - 1 + jb.spd_boost;
  if (jb.cooldown_reduce) buff.cooldown_reduce = jb.cooldown_reduce;

  state.buff = buff;
}

// ── Summon Panel ──────────────────────────────────────────────────────────────
function buildSummonPanel(heroes) {
  const panel = el.summonPanel();
  panel.innerHTML = '';
  heroes.forEach(h => {
    const form = h.forms[0];
    const btn  = document.createElement('button');
    btn.className    = 'hero-btn';
    btn.dataset.heroId = h.id;
    btn.innerHTML = `
      <div class="hero-btn-avatar">
        <img src="assets/heroes/hero_${h.id}_base.png"
             onerror="this.style.display='none'"
             width="52" height="52" alt="${h.nameLine[0]}">
        <div class="hero-cd-overlay" id="cd_${h.id}"></div>
      </div>
      <div class="hero-btn-name">${h.nameLine[0]}</div>
      <div class="hero-btn-cost">💰${form.cost}</div>
    `;
    btn.addEventListener('click', () => summonHero(h.id));
    panel.appendChild(btn);
    state.cooldowns[h.id] = 0;
    state.heroCount[h.id] = 0;
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
  const cdReduce = state.buff.cooldown_reduce ?? 0;
  state.cooldowns[heroId] = now + form.cooldown * (1 - Math.min(cdReduce, 0.6));
  state.heroCount[heroId]++;
  sfxSummon();

  // 從已儲存的 ownedMap 算出英雄等級與形態索引
  const owned   = state.ownedMap[heroId];
  const heroExp = owned?.exp ?? 0;
  const heroLv  = Math.floor(heroExp / (state.config?.exp?.perLevel ?? 1000)) + 1;
  const formIdx = heroLv >= 30 && hData.forms.length > 2 ? 2
                : heroLv >= 10 && hData.forms.length > 1 ? 1
                : 0;
  const hero = new Hero(hData, formIdx, heroLv, state.buff, state.config?.levelUp ?? {});
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
  if (state.paused) { state.rafId = requestAnimationFrame(gameLoop); return; }

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
  const mult = state.stageData.enemyMultiplier ?? 1;
  const scaledData = mult === 1 ? eData : {
    ...eData,
    hp:  Math.round(eData.hp  * mult),
    atk: Math.round(eData.atk * mult)
  };
  for (let i = 0; i < count; i++) {
    const enemy  = new Enemy(scaledData, {});
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
    } else if (h.x + 48 >= state.enemyBaseX - 180) {
      if (state.enemies.some(e => e.alive)) {
        h.attacking = false;
        h.target    = null; // 有敵兵時停在極限線等待
      } else {
        h.attacking = true;
        h.target    = null; // 無敵兵才打砲台
      }
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
    h.el?.classList.remove('atk-punch');
    requestAnimationFrame(() => h.el?.classList.add('atk-punch'));

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
    e.el?.classList.remove('atk-punch');
    requestAnimationFrame(() => e.el?.classList.add('atk-punch'));

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

  // 記錄圖鑑：擊敗敵人解鎖 + 計次（非同步，不影響遊戲）
  const userId = getUserId();
  if (userId && enemy.enemyId) {
    recordBestiaryDefeat(userId, enemy.enemyId).catch(() => {});
  }
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

  el.feedback().classList.add('hidden');

  if (result.isEnglish) {
    showEnglishQuestion(result);
  } else {
    showMathQuestion(result);
  }
}

function showMathQuestion(result) {
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
    btn.textContent     = result.choices[i];
    btn.dataset.answer  = result.choices[i];
    btn.className       = 'choice-btn';
    btn.disabled        = false;
  });
}

function showEnglishQuestion(result) {
  const q = result.question;
  const qDisplay = document.getElementById('question-display');
  if (qDisplay) {
    let html = '';
    if (q.question) {
      // adverbs bank: sentence has {word} highlight + question text below
      const sentHtml = q.sentence.replace(/\{(\w+)\}/g, (_, w) => `<span class="q-highlight">${w}</span>`);
      html = `<div class="q-english-sentence">${sentHtml}</div><div class="q-english-q">${q.question}</div>`;
    } else if (q.word) {
      // vocabulary bank: show word prominently + sentence with blank
      const sentHtml = q.sentence.replace(/___/g, '<span class="q-blank">______</span>');
      html = `<div class="q-vocab-word">${q.word}</div><div class="q-english-sentence">${sentHtml}</div>`;
    } else {
      // fill-in-blank bank: sentence with blank only
      const sentHtml = q.sentence.replace(/___/g, '<span class="q-blank">______</span>');
      html = `<div class="q-english-sentence">${sentHtml}</div>`;
    }
    qDisplay.innerHTML = html;
  }
  el.choiceBtns().forEach((btn, i) => {
    btn.textContent    = result.choices[i] ?? '';
    btn.dataset.answer = result.choices[i] ?? '';
    btn.className      = 'choice-btn choice-btn--english';
    btn.disabled       = false;
  });
}

function onAnswer(chosen) {
  const result = checkAnswer(chosen);
  if (!result) return;

  const fb = el.feedback();

  if (result.correct) {
    const gain = result.isEnglish
      ? (state.config.gold.correctEnglish ?? state.config.gold.correctMultiplication)
      : result.type === 'multiplication'
        ? state.config.gold.correctMultiplication
        : state.config.gold.correctAddition;
    addGold(gain);
    state.score += state.config.score.correctAnswer;

    if (!result.isEnglish) {
      const userId = getUserId();
      if (userId) {
        try { recordMathStat(userId, result.type, true); }
        catch (e) { console.warn('Firebase 統計失敗', e); }
      }
    }

    state.combo++;
    updateComboUI();

    state.correctTotal++;
    if (state.correctTotal % 10 === 0) {
      const uid = getUserId();
      if (uid) addScrolls(uid, 1).catch(() => {});
      spawnFx('🎴+1', state.battlefieldW / 2, 80, 'gold');
    }

    sfxCorrect();
    if (result.isEnglish && result.explain) {
      fb.textContent = `✓ ${result.explain}`;
    } else {
      fb.textContent = `✓ 答對！+${gain} 💰`;
    }
    fb.className = 'answer-feedback correct';
    fb.classList.remove('hidden');
    spawnFx(`+${gain}💰`, state.battlefieldW / 2, 60, 'gold');

    highlightChoices(chosen, result.correctAnswer, true);
    setTimeout(showNextQuestion, result.isEnglish ? 1200 : 600);

  } else {
    state.playerBaseHp = Math.max(0, state.playerBaseHp - state.config.penalty.wrongAnswer);
    shakePlayerBase();

    if (!result.isEnglish) {
      const userId = getUserId();
      if (userId) {
        try {
          recordMathStat(userId, result.type, false);
          const mainHero = expHero();
          if (mainHero) recordWrongAnswer(userId, mainHero.heroId);
        } catch (e) { console.warn('Firebase 答錯記錄失敗', e); }
      }
    }

    if (state.combo < state.config.combo.level1) state.combo = 0;
    updateComboUI();

    sfxWrong();
    sfxBaseHit();
    if (result.isEnglish) {
      fb.textContent = `✗ 答錯！正確答案：${result.correctAnswer}　-1 ❤️`;
    } else {
      fb.textContent = `✗ 答錯！正確答案是 ${result.correctAnswer}　-1 ❤️`;
    }
    fb.className = 'answer-feedback wrong';
    fb.classList.remove('hidden');

    highlightChoices(chosen, result.correctAnswer, false);
    if (state.playerBaseHp <= 0) { endGame(false); return; }
    setTimeout(showNextQuestion, result.isEnglish ? 1500 : 1000);
  }
}

function expHero() {
  // Return the highest-cost hero currently deployed
  return state.heroes.filter(h => h.alive)
    .sort((a,b) => b.formData.cost - a.formData.cost)[0] || null;
}

function highlightChoices(chosen, correct, wasCorrect) {
  el.choiceBtns().forEach(btn => {
    const val = btn.dataset.answer ?? btn.textContent;
    // use == for number/string compat in math mode
    if (val == correct) btn.classList.add('correct');
    else if (val == chosen && !wasCorrect) btn.classList.add('wrong');
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

  // Cooldown overlays + visual states
  const now = Date.now();
  state.heroesData.forEach(h => {
    const overlay = document.getElementById(`cd_${h.id}`);
    if (!overlay) return;
    const ready = state.cooldowns[h.id] || 0;
    const cd    = h.forms[0].cooldown;
    const cdPct = ready <= now ? 0 : Math.round(((ready - now) / cd) * 100);
    overlay.style.setProperty('--cd-pct', `${cdPct}%`);

    const btn = document.querySelector(`[data-hero-id="${h.id}"]`);
    if (!btn) return;
    const onCooldown     = now < ready;
    const notEnoughGold  = state.gold < h.forms[0].cost;
    const maxed          = state.heroCount[h.id] >= state.MAX_HERO_COUNT;
    btn.disabled = onCooldown || notEnoughGold || maxed;
    btn.classList.toggle('hero-btn--cooldown', onCooldown && !maxed);
    btn.classList.toggle('hero-btn--broke',    !onCooldown && notEnoughGold && !maxed);
    btn.classList.toggle('hero-btn--ready',    !onCooldown && !notEnoughGold && !maxed);
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
  let scrollReward = 0;
  if (userId && win) {
    try {
      const prevResult = await saveStageResult(userId, state.stageData.id, {
        score: state.score, time: elapsed, perfect,
        dialogChoice: state.dialogChoice?.label || null
      });
      await addScore(userId, state.score);
      const userData = await getUserData(userId);
      const parts = userId.split('_');
      const nick  = parts.slice(0, -1).join('_');
      await updateLeaderboard(userId, {
        nickname: nick,
        totalScore: userData?.totalScore ?? state.score,
        score: state.score
      });
      // 卷軸獎勵：首次通關+3、重複通關+1、完美+1
      const isFirst = prevResult?.firstClear ?? false;
      scrollReward = isFirst ? 3 : 1;
      if (perfect) scrollReward += 1;
      await addScrolls(userId, scrollReward).catch(() => {});

      // 寶玉掉落
      const isBoss = state.stageData.id?.includes('boss') ?? false;
      const jadeDrop = rollJadeDrop(state.stageCountry, isBoss);
      await addJadeFrags(userId, jadeDrop.amount).catch(() => {});
      state._jadeDrop = jadeDrop;
    } catch (e) { console.warn('Firebase 存檔失敗', e); }
  }

  // Show result
  win ? sfxVictory() : sfxDefeat();
  el.resultTitle().textContent = win ? '🎉 勝利！' : '💀 失敗';
  el.resultTitle().className   = `result-title ${win ? 'win' : 'lose'}`;
  const jd = state._jadeDrop;
  el.resultStats().innerHTML   = `
    得分：${state.score}<br>
    時間：${elapsed} 秒<br>
    ${perfect ? '✨ 完美通關（不失血）<br>' : ''}
    ${win && elapsed < state.stageData.speedBonusTarget ? '⚡ 速通獎勵！<br>' : ''}
    ${win && scrollReward > 0 ? `📜 獲得卷軸：+${scrollReward}<br>` : ''}
    ${win && jd ? `🪬 喵喵寶玉：+${jd.amount}（${{'bronze':'銅','silver':'銀','gold':'金'}[jd.quality]}品）<br>` : ''}
  `;

  if (win) {
    // 隱藏 retry/back，先讓玩家分配 EXP
    document.getElementById('btn-retry').classList.add('hidden');
    document.getElementById('btn-result-back').classList.add('hidden');
    buildExpDistributeUI(getUserId());
  }

  el.resultOverlay().classList.remove('hidden');
}

// ── EXP Distribution UI ───────────────────────────────────────────────────────
const STAGE_EXP = 50;  // 每次通關得到的 EXP 總量

function buildExpDistributeUI(userId) {
  const section  = document.getElementById('exp-distribute-section');
  const heroGrid = document.getElementById('exp-hero-grid');
  const poolEl   = document.getElementById('exp-pool');
  if (!section || !heroGrid) return;

  const EXP_PER_LEVEL = state.config?.exp?.perLevel ?? 1000;
  const assignments   = {};  // heroId → expAssigned
  let pool = STAGE_EXP;

  // 取得可分配英雄（初始 + 已擁有）
  const INITIAL = new Set(['liubei', 'soldier']);
  const availHeroes = state.heroesData.filter(h =>
    INITIAL.has(h.id) || !!state.ownedMap[h.id]
  );

  heroGrid.innerHTML = '';
  availHeroes.forEach(h => {
    assignments[h.id] = 0;
    const owned   = state.ownedMap[h.id] || {};
    const curExp  = owned.exp ?? 0;
    const curLv   = Math.floor(curExp / EXP_PER_LEVEL) + 1;
    const inLvExp = curExp % EXP_PER_LEVEL;

    const item = document.createElement('div');
    item.className = 'exp-hero-item';
    item.innerHTML = `
      <img src="assets/heroes/hero_${h.id}_base.png"
           onerror="this.outerHTML='<div style=font-size:1.6rem>🐱</div>'"
           class="exp-hero-img" alt="${h.nameLine[0]}">
      <div class="exp-hero-name">${h.nameLine[0]}</div>
      <div class="exp-hero-lv" id="exp_lv_${h.id}">Lv.${curLv}</div>
      <div class="exp-bar-bg"><div class="exp-bar-fill" id="exp_bar_${h.id}"
        style="width:${(inLvExp/EXP_PER_LEVEL*100).toFixed(1)}%"></div></div>
      <div class="exp-hero-assign" id="exp_assign_${h.id}">+0</div>
      <button class="exp-add-btn" data-hero="${h.id}">+10</button>
    `;
    heroGrid.appendChild(item);
  });

  poolEl.textContent = pool;

  // +10 click handler
  heroGrid.querySelectorAll('.exp-add-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (pool < 10) return;
      const hid = btn.dataset.hero;
      assignments[hid] = (assignments[hid] || 0) + 10;
      pool -= 10;
      poolEl.textContent = pool;
      document.getElementById(`exp_assign_${hid}`).textContent = `+${assignments[hid]}`;
      if (pool <= 0) heroGrid.querySelectorAll('.exp-add-btn').forEach(b => b.disabled = true);
    });
  });

  // Confirm button
  document.getElementById('btn-exp-confirm').addEventListener('click', async () => {
    if (!userId) { finishExpDistribute(); return; }
    document.getElementById('btn-exp-confirm').disabled = true;
    document.getElementById('btn-exp-confirm').textContent = '儲存中…';
    for (const [hid, expGain] of Object.entries(assignments)) {
      if (expGain <= 0) continue;
      try {
        await addHeroExp(userId, hid, expGain);
      } catch (e) { console.warn(`EXP 儲存失敗 (${hid})`, e); }
    }
    finishExpDistribute();
  });

  section.classList.remove('hidden');
}

function finishExpDistribute() {
  document.getElementById('exp-distribute-section').classList.add('hidden');
  document.getElementById('btn-retry').classList.remove('hidden');
  document.getElementById('btn-result-back').classList.remove('hidden');
}

// ── Start ─────────────────────────────────────────────────────────────────────
init();
