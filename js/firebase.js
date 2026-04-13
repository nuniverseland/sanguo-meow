// firebase.js — Firebase init + all Firestore access functions
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, increment,
  collection, getDocs, orderBy, query, limit, serverTimestamp,
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
  const id = `${nickname}_${birthday}`;
  sessionStorage.setItem('nunuUserId', id);
  return id;
}

// ── User document ─────────────────────────────────────────────────────────────
export async function loadOrCreateUser(userId, nickname, birthday) {
  const ref = doc(db, 'sanguo_users', userId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
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
  await updateDoc(ref, {
    exp:          increment(expDelta),
    totalCorrect: increment(1),
    totalAnswered: increment(1)
  });
}

export async function recordWrongAnswer(userId, heroId) {
  const ref = doc(db, 'sanguo_users', userId, 'heroes', heroId);
  await updateDoc(ref, { totalAnswered: increment(1) });
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

// Atomic draw: deduct scrolls + record results in a single transaction
export async function executeGachaDraw(userId, drawCount, pool, currentState) {
  const cost    = drawCount === 10 ? 45 : 5;
  const userRef = doc(db, 'sanguo_users', userId);

  return await runTransaction(db, async tx => {
    const snap = await tx.get(userRef);
    const data = snap.data() || {};
    if ((data.scrolls ?? 0) < cost) throw new Error('卷軸不足');

    // Perform draws
    const owned    = Object.entries(currentState.heroes)
      .filter(([, v]) => v.currentForm !== undefined || v.soulFragments !== undefined)
      .map(([k]) => k);
    let pity       = data.pityCount ?? 0;
    const results  = [];
    let scrollBack = 0;

    for (let i = 0; i < drawCount; i++) {
      let heroId;
      const unowned = pool.filter(h => !owned.includes(h));

      // Pity: every 10th draw guarantees a new hero (if available)
      if (pity >= 9 && unowned.length > 0) {
        heroId = unowned[Math.floor(Math.random() * unowned.length)];
        pity   = 0;
      } else {
        heroId = pool[Math.floor(Math.random() * pool.length)];
        if (heroId === heroId) pity++; // always increment; reset below on new
      }

      const isNew = !owned.includes(heroId);
      if (isNew) {
        owned.push(heroId);
        pity = 0;
      }
      results.push({ heroId, isNew });
    }

    // Build hero updates
    const heroUpdates = {};
    const fragCounts  = {};
    for (const r of results) {
      if (r.isNew) {
        heroUpdates[r.heroId] = { heroId: r.heroId, currentForm: 0, exp: 0, level: 1, soulFragments: 0, maxUnlocked: false };
      } else {
        fragCounts[r.heroId] = (fragCounts[r.heroId] || 0) + 1;
      }
    }

    // Apply frag counts, check MAX unlock
    for (const [hId, fragGain] of Object.entries(fragCounts)) {
      const heroRef  = doc(db, 'sanguo_users', userId, 'heroes', hId);
      const heroSnap = await tx.get(heroRef);
      const hData    = heroSnap.exists() ? heroSnap.data() : { soulFragments: 0, maxUnlocked: false };
      const newFrag  = (hData.soulFragments ?? 0) + fragGain;

      if (hData.maxUnlocked) {
        scrollBack += fragGain * 2;
        heroUpdates[hId] = { ...hData };
      } else if (newFrag >= 10) {
        heroUpdates[hId] = { ...hData, soulFragments: newFrag, maxUnlocked: true };
      } else {
        heroUpdates[hId] = { ...hData, soulFragments: newFrag };
      }
    }

    // Write hero docs
    for (const [hId, hData] of Object.entries(heroUpdates)) {
      const heroRef = doc(db, 'sanguo_users', userId, 'heroes', hId);
      tx.set(heroRef, hData, { merge: true });
    }

    // Write user doc
    tx.update(userRef, {
      scrolls:    increment(-(cost - scrollBack)),
      pityCount:  pity,
      totalDraws: increment(drawCount)
    });

    return { results, scrollBack, newScrolls: (data.scrolls ?? 0) - cost + scrollBack };
  });
}
