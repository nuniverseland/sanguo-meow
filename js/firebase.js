// firebase.js — Firebase init + all Firestore access functions
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, increment,
  collection, getDocs, orderBy, query, limit, serverTimestamp
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
      totalScore:  0,
      weeklyScore: 0,
      title:       '新手喵',
      createdAt:   serverTimestamp(),
      lastLoginAt: serverTimestamp()
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
  const ref  = doc(db, 'sanguo_users', userId, 'progress', stageId);
  const snap = await getDoc(ref);
  const best = snap.exists() ? snap.data().bestScore || 0 : 0;
  await setDoc(ref, {
    stageId,
    completed:    true,
    bestScore:    Math.max(best, score),
    bestTime:     time,
    perfect:      perfect,
    dialogChoice: dialogChoice,
    completedAt:  serverTimestamp()
  }, { merge: true });
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
