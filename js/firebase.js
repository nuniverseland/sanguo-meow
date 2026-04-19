// firebase.js — Firebase init + all Firestore access functions
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, increment,
  collection, getDocs, orderBy, query, limit, where, serverTimestamp,
  runTransaction
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey:            'AIzaSyA-E-IN6185ruhUb-TB9LkDyK5xJayLBxU',
  authDomain:        'nunuquest.firebaseapp.com',
  projectId:         'nunuquest',
  storageBucket:     'nunuquest.firebasestorage.app',
  messagingSenderId: '374919361286',
  appId:             '1:374919361286:web:64108f0715eaa69f956487'
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// ── userId helpers ───────────────────────────────────────────────────────────
export function getUserId() {
  return sessionStorage.getItem('nunuUserId');
}

export function setUserId(nickname, birthday) {
  const id = `${nickname.toLowerCase()}_${birthday}`;
  sessionStorage.setItem('nunuUserId', id);
  return id;
}

// ── User document ─────────────────────────────────────────────────────────────
export async function loadOrCreateUser(userId, nickname, birthday) {
  const nicknameLower = nickname.toLowerCase();
  const ref = doc(db, 'sanguo_users', userId);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    // 找不到 lowercase ID，查同生日的帳號做大小寫相容
    const q = query(collection(db, 'sanguo_users'), where('birthday', '==', birthday));
    const results = await getDocs(q);
    const match = results.docs.find(d => d.data().nickname.toLowerCase() === nicknameLower);

    if (match) {
      // 用舊文件的真實 ID 覆蓋 session，讓後續操作指向正確文件
      sessionStorage.setItem('nunuUserId', match.id);
      await updateDoc(match.ref, { lastLoginAt: serverTimestamp() });
      return (await getDoc(match.ref)).data();
    }

    await setDoc(ref, {
      nickname,
      birthday,
      totalScore:    0,
      weeklyScore:   0,
      scrolls:       5,   // 新用戶初始 5 卷，讓努努一進來就能抽
      pityCount:     0,
      totalDraws:    0,
      milestoneQ100: false,
      milestoneQ500: false,
      title:         '新手喵',
      createdAt:     serverTimestamp(),
      lastLoginAt:   serverTimestamp()
    });
  } else {
    await updateDoc(ref, { lastLoginAt: serverTimestamp() });
  }
  return (await getDoc(ref)).data();
}

export async function addScore(userId, delta) {
  const ref = doc(db, 'sanguo_users', userId);
  await updateDoc(ref, {
    totalScore:  increment(delta),
    weeklyScore: increment(delta)
  });
}

export async function getUserData(userId) {
  const snap = await getDoc(doc(db, 'sanguo_users', userId));
  return snap.exists() ? snap.data() : null;
}

// ── Stage Progress ────────────────────────────────────────────────────────────
export async function getProgress(userId) {
  const col  = collection(db, 'sanguo_users', userId, 'progress');
  const snap = await getDocs(col);
  const map  = {};
  snap.forEach(d => { map[d.id] = d.data(); });
  return map;
}

export async function saveStageResult(userId, stageId, { score, time, perfect, dialogChoice }) {
  const ref      = doc(db, 'sanguo_users', userId, 'progress', stageId);
  const snap     = await getDoc(ref);
  const existed  = snap.exists() && snap.data().completed;
  const best     = existed ? snap.data().bestScore || 0 : 0;
  await setDoc(ref, {
    stageId,
    completed:    true,
    bestScore:    Math.max(best, score),
    bestTime:     time,
    perfect:      perfect,
    dialogChoice: dialogChoice,
    completedAt:  serverTimestamp()
  }, { merge: true });
  return { firstClear: !existed };
}

// ── Hero Data ─────────────────────────────────────────────────────────────────
export async function loadHeroData(userId, heroId) {
  const ref  = doc(db, 'sanguo_users', userId, 'heroes', heroId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const defaults = { heroId, currentForm: 0, exp: 0, level: 1, branch: null, branchHistory: [], totalAnswered: 0, totalCorrect: 0 };
    await setDoc(ref, defaults);
    return defaults;
  }
  return snap.data();
}

export async function addHeroExp(userId, heroId, expDelta) {
  const ref = doc(db, 'sanguo_users', userId, 'heroes', heroId);
  // setDoc + merge 確保文件不存在時自動建立（初始英雄 liubei/soldier 沒有預先建立 doc）
  await setDoc(ref, {
    heroId,
    exp:           increment(expDelta),
    totalCorrect:  increment(1),
    totalAnswered: increment(1)
  }, { merge: true });
}

export async function recordWrongAnswer(userId, heroId) {
  const ref = doc(db, 'sanguo_users', userId, 'heroes', heroId);
  await setDoc(ref, { heroId, totalAnswered: increment(1) }, { merge: true });
}

// ── Math Stats ────────────────────────────────────────────────────────────────
export async function recordMathStat(userId, type, correct) {
  const ref = doc(db, 'sanguo_users', userId, 'math_stats', type);
  const update = {
    totalAttempts: increment(1),
    lastPracticed: serverTimestamp()
  };
  if (correct) update.totalCorrect = increment(1);
  await setDoc(ref, update, { merge: true });
}

// ── Leaderboard ───────────────────────────────────────────────────────────────
export async function updateLeaderboard(userId, { nickname, totalScore, weeklyScore, farthestStage, farthestCountry, title }) {
  const ref = doc(db, 'sanguo_leaderboard', userId);
  await setDoc(ref, { nickname, totalScore, weeklyScore, farthestStage, farthestCountry, title, updatedAt: serverTimestamp() }, { merge: true });
}

export async function fetchLeaderboard(scoreField = 'totalScore', count = 50) {
  const q    = query(collection(db, 'sanguo_leaderboard'), orderBy(scoreField, 'desc'), limit(count));
  const snap = await getDocs(q);
  return snap.docs.map((d, i) => ({ rank: i + 1, id: d.id, ...d.data() }));
}

// ── Owned Heroes ─────────────────────────────────────────────────────────────
/** 回傳 { heroId: heroData } 的 map，只含玩家已擁有（有 doc）的英雄 */
export async function loadOwnedHeroes(userId) {
  const snap = await getDocs(collection(db, 'sanguo_users', userId, 'heroes'));
  const map  = {};
  snap.forEach(d => { map[d.id] = d.data(); });
  return map;
}

// ── Current Team ─────────────────────────────────────────────────────────────
export async function loadCurrentTeam(userId) {
  if (!userId) return null;
  const snap = await getDoc(doc(db, 'sanguo_users', userId));
  return snap.exists() ? (snap.data().currentTeam || null) : null;
}

export async function saveCurrentTeam(userId, team) {
  if (!userId) return;
  await updateDoc(doc(db, 'sanguo_users', userId), { currentTeam: team });
}

// ── Scrolls ───────────────────────────────────────────────────────────────────
export async function loadUserScrolls(userId) {
  const ref  = doc(db, 'sanguo_users', userId);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : { scrolls: 0 };
}

export async function addScrolls(userId, amount) {
  if (!userId || amount <= 0) return;
  const ref = doc(db, 'sanguo_users', userId);
  await updateDoc(ref, { scrolls: increment(amount) });
}

// ── Gacha ─────────────────────────────────────────────────────────────────────
export async function loadGachaState(userId) {
  const userSnap   = await getDoc(doc(db, 'sanguo_users', userId));
  const userData   = userSnap.data() || {};
  const heroesSnap = await getDocs(collection(db, 'sanguo_users', userId, 'heroes'));
  const heroes     = {};
  heroesSnap.forEach(d => { heroes[d.id] = d.data(); });
  return {
    scrolls:       userData.scrolls       ?? 0,
    pityCount:     userData.pityCount     ?? 0,
    totalDraws:    userData.totalDraws    ?? 0,
    milestoneQ100: userData.milestoneQ100 ?? false,
    milestoneQ500: userData.milestoneQ500 ?? false,
    heroes
  };
}

// ── Bestiary ──────────────────────────────────────────────────────────────────
/** 讀取玩家已解鎖的敵人圖鑑資料 */
export async function loadBestiary(userId) {
  const snap = await getDocs(collection(db, 'sanguo_users', userId, 'bestiary'));
  const map  = {};
  snap.forEach(d => { map[d.id] = d.data(); });
  return map;
}

/** 玩家第一次擊敗某敵人 → 解鎖圖鑑並記錄次數 */
export async function recordBestiaryDefeat(userId, enemyId) {
  if (!userId || !enemyId) return;
  const ref  = doc(db, 'sanguo_users', userId, 'bestiary', enemyId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    // 首次擊敗
    await setDoc(ref, {
      unlocked:       true,
      defeatCount:    1,
      firstDefeatedAt: serverTimestamp()
    });
  } else {
    await updateDoc(ref, { defeatCount: increment(1) });
  }
}

// ── Gacha rarity config ───────────────────────────────────────────────────────
// poolConfig: { normal: string[], rare: string[], sr: string[] }
// 普通: 60%  稀有: 35%  超稀有: 5%
// Regular pity: every 20 draws guaranteed unowned hero
// Rare pity (shared rare+sr): every 40 draws guaranteed unowned rare/sr
const FRAG_PER_LEVEL = 10; // 10 碎片 = +1 等級

function pickHeroFromPool(poolConfig, ownedList, pity, rarePity) {
  const normalPool = poolConfig.normal     || [];
  const rarePool   = poolConfig.rare       || [];
  const srPool     = poolConfig.super_rare || [];
  const rareAndSr  = [...rarePool, ...srPool];
  const allPool    = [...normalPool, ...rareAndSr];

  const unownedAll     = allPool.filter(h => !ownedList.includes(h));
  const unownedRareAll = rareAndSr.filter(h => !ownedList.includes(h));

  // Rare pity (shared rare+super_rare): 40 draws → guarantee unowned rare or super_rare
  if (rarePity >= 39 && unownedRareAll.length > 0) {
    const heroId = unownedRareAll[Math.floor(Math.random() * unownedRareAll.length)];
    const rarity = srPool.includes(heroId) ? 'super_rare' : 'rare';
    return { heroId, rarity, resetRarePity: true };
  }

  // Regular pity: 20 draws → guarantee any unowned hero
  if (pity >= 19 && unownedAll.length > 0) {
    const heroId = unownedAll[Math.floor(Math.random() * unownedAll.length)];
    const rarity = srPool.includes(heroId) ? 'super_rare' : rarePool.includes(heroId) ? 'rare' : 'normal';
    return { heroId, rarity, resetPity: true };
  }

  // Normal draw: 12% super_rare, 38% rare, 50% normal
  const rand = Math.random();
  let pool, rarity;
  if (rand < 0.12 && srPool.length > 0) {
    pool = srPool; rarity = 'super_rare';
  } else if (rand < 0.50 && rarePool.length > 0) {
    pool = rarePool; rarity = 'rare';
  } else {
    pool = normalPool.length > 0 ? normalPool : allPool; rarity = 'normal';
  }

  const heroId = pool[Math.floor(Math.random() * pool.length)];
  return { heroId, rarity };
}

// Atomic draw: deduct scrolls + record results in a single transaction
// pool param can be either string[] (legacy) or { common: string[], rare: string[] }
export async function executeGachaDraw(userId, drawCount, pool, currentState) {
  const cost    = drawCount === 10 ? 45 : 5;
  const userRef = doc(db, 'sanguo_users', userId);

  // Normalise pool
  const poolConfig = Array.isArray(pool)
    ? { normal: pool, rare: [], super_rare: [] }
    : pool;

  return await runTransaction(db, async tx => {
    const snap = await tx.get(userRef);
    const data = snap.data() || {};
    if ((data.scrolls ?? 0) < cost) throw new Error('卷軸不足');

    const owned    = Object.keys(currentState.heroes);
    let pity       = data.pityCount    ?? 0;
    let rarePity   = data.rarePityCount ?? 0;
    const results  = [];

    for (let i = 0; i < drawCount; i++) {
      const pick   = pickHeroFromPool(poolConfig, owned, pity, rarePity);
      const heroId = pick.heroId;
      const isNew  = !owned.includes(heroId);

      const isRareOrSr = pick.rarity === 'rare' || pick.rarity === 'super_rare';
      if (isNew) {
        owned.push(heroId);
        pity     = 0;
        rarePity = isRareOrSr ? 0 : rarePity + 1;
      } else {
        pity++;
        rarePity = isRareOrSr ? 0 : rarePity + 1;
      }
      if (pick.resetPity)     pity     = 0;
      if (pick.resetRarePity) rarePity = 0;

      results.push({ heroId, isNew, rarity: pick.rarity });
    }

    // Build hero updates — fragments give EXP (10 frags = 1 level = 1000 EXP)
    const heroUpdates = {};
    const fragCounts  = {};
    for (const r of results) {
      if (r.isNew) {
        heroUpdates[r.heroId] = { heroId: r.heroId, level: 1, soulFragments: 0 };
      } else {
        fragCounts[r.heroId] = (fragCounts[r.heroId] || 0) + 1;
      }
    }

    // Apply frag counts → convert batches to level ups
    for (const [hId, fragGain] of Object.entries(fragCounts)) {
      const heroRef  = doc(db, 'sanguo_users', userId, 'heroes', hId);
      const heroSnap = await tx.get(heroRef);
      const hData    = heroSnap.exists() ? heroSnap.data() : { soulFragments: 0, level: 1 };
      const newFrag  = (hData.soulFragments ?? 0) + fragGain;
      const levelsGained  = Math.floor(newFrag / FRAG_PER_LEVEL);
      const fragRemainder = newFrag % FRAG_PER_LEVEL;

      heroUpdates[hId] = {
        ...hData,
        soulFragments: fragRemainder,
        level: (hData.level ?? 1) + levelsGained
      };
    }

    // Write hero docs
    for (const [hId, hData] of Object.entries(heroUpdates)) {
      const heroRef = doc(db, 'sanguo_users', userId, 'heroes', hId);
      tx.set(heroRef, hData, { merge: true });
    }

    // Write user doc
    tx.update(userRef, {
      scrolls:       increment(-cost),
      pityCount:     pity,
      rarePityCount: rarePity,
      totalDraws:    increment(drawCount)
    });

    return { results, scrollBack: 0, newScrolls: (data.scrolls ?? 0) - cost, newPity: pity, newRarePity: rarePity };
  });
}
