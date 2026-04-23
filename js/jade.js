// jade.js — 喵喵寶玉系統核心邏輯
// 直接內嵌設定，避免 JSON import assertion 瀏覽器相容問題
const jadeCfg = {
  veins: [
    { id: 'wuli',    name: '武力脈', char: '戰', effect: 'atk_boost',       color: 'red',    region: 'taiwan'   },
    { id: 'shengji', name: '生機脈', char: '生', effect: 'hp_boost',        color: 'green',  region: 'europe'   },
    { id: 'junlue',  name: '軍略脈', char: '略', effect: 'cooldown_reduce', color: 'blue',   region: 'japan'    },
    { id: 'caifu',   name: '財富脈', char: '財', effect: 'gold_rate',       color: 'purple', region: 'americas' },
    { id: 'jifeng',  name: '疾風脈', char: '疾', effect: 'spd_boost',       color: 'yellow', region: 'cosmos'   }
  ],
  qualities: ['bronze', 'silver', 'gold'],
  qualityNames: { bronze: '銅', silver: '銀', gold: '金' },
  maxLevel: 5,
  effectValues: {
    bronze: [0, 0.01, 0.02, 0.03, 0.04, 0.05],
    silver: [0, 0.02, 0.04, 0.05, 0.07, 0.08],
    gold:   [0, 0.03, 0.05, 0.07, 0.09, 0.12]
  },
  upgradeCosts: {
    bronze: { jade: [10, 20, 35, 55]    },
    silver: { jade: [25, 50, 80, 130]   },
    gold:   { jade: [60, 120, 200, 320] }
  },
  dropAmounts: { bronze: 10, silver: 30, gold: 100 },
  dropRates: {
    normal: { bronze: 0.70, silver: 0.25, gold: 0.05 },
    boss:   { bronze: 0.00, silver: 0.60, gold: 0.40 }
  },
  regionBonus: {
    taiwan:   { vein: 'wuli',    bonus: 0.30 },
    japan:    { vein: 'junlue',  bonus: 0.30 },
    europe:   { vein: 'shengji', bonus: 0.30 },
    americas: { vein: 'caifu',   bonus: 0.30 },
    cosmos:   { vein: 'jifeng',  bonus: 0.30 }
  },
  coreReward: { name: '天命大成', titleName: '天命喵王', bonusAll: 0.05 }
};

export { jadeCfg };

// ── 預設資料 ──────────────────────────────────────────────────────────────────
export function defaultJadeData() {
  const nodes = {};
  for (const v of jadeCfg.veins) {
    for (const q of jadeCfg.qualities) {
      nodes[`${v.id}_${q}`] = 0;
    }
  }
  return { frags: 0, nodes, coreUnlocked: false };
}

// ── 加成計算 ──────────────────────────────────────────────────────────────────
// 回傳 buff 物件（與 game-engine state.buff 格式相同）
export function computeJadeBonuses(jadeData) {
  if (!jadeData) return {};
  const bonuses = {};

  for (const v of jadeCfg.veins) {
    let total = 0;
    for (const q of jadeCfg.qualities) {
      const lv = jadeData.nodes?.[`${v.id}_${q}`] ?? 0;
      total += jadeCfg.effectValues[q][lv] ?? 0;
    }
    if (total > 0) {
      if (v.effect === 'cooldown_reduce') {
        bonuses.cooldown_reduce = (bonuses.cooldown_reduce ?? 0) + total;
      } else {
        // hp_boost / atk_boost / gold_rate / spd_boost 都是乘數格式
        bonuses[v.effect] = (bonuses[v.effect] ?? 1) + total;
      }
    }
  }

  // 天命大成：五脈全滿才解鎖，+5% 全能力
  if (jadeData.coreUnlocked) {
    const b = jadeCfg.coreReward.bonusAll;
    bonuses.atk_boost        = (bonuses.atk_boost        ?? 1) + b;
    bonuses.hp_boost         = (bonuses.hp_boost         ?? 1) + b;
    bonuses.gold_rate        = (bonuses.gold_rate         ?? 1) + b;
    bonuses.spd_boost        = (bonuses.spd_boost         ?? 1) + b;
    bonuses.cooldown_reduce  = (bonuses.cooldown_reduce   ?? 0) + b;
  }

  return bonuses;
}

// ── 五脈全滿判斷 ──────────────────────────────────────────────────────────────
export function isAllMaxed(jadeData) {
  for (const v of jadeCfg.veins) {
    for (const q of jadeCfg.qualities) {
      const lv = jadeData.nodes?.[`${v.id}_${q}`] ?? 0;
      if (lv < jadeCfg.maxLevel) return false;
    }
  }
  return true;
}

// ── 升級合法性 ────────────────────────────────────────────────────────────────
export function canUpgrade(jadeData, veinId, quality) {
  const key  = `${veinId}_${quality}`;
  const lv   = jadeData.nodes?.[key] ?? 0;
  if (lv >= jadeCfg.maxLevel) return { ok: false, reason: '已達最大等級' };

  const jReq = jadeCfg.upgradeCosts[quality].jade[lv];
  if ((jadeData.frags ?? 0) < jReq) return { ok: false, reason: `喵喵寶玉不足（需 ${jReq}）` };

  return { ok: true, jadeReq: jReq };
}

// ── 關卡掉落計算 ──────────────────────────────────────────────────────────────
export function rollJadeDrop(country, isBoss) {
  const rates = isBoss ? jadeCfg.dropRates.boss : jadeCfg.dropRates.normal;
  const r     = Math.random();
  let quality;
  if (r < rates.gold) quality = 'gold';
  else if (r < rates.gold + rates.silver) quality = 'silver';
  else quality = 'bronze';

  let amount = jadeCfg.dropAmounts[quality];

  // 地區加成
  const rb = jadeCfg.regionBonus[country];
  // 找出此關對應哪個脈（只是視覺/主題，實際 frags 都是同一池）
  if (rb) amount = Math.round(amount * (1 + rb.bonus));

  return { quality, amount };
}

// ── 天下氣運等級（累積效果 → 顯示用）───────────────────────────────────────
export function fortuneLevel(jadeData) {
  let total = 0;
  for (const v of jadeCfg.veins) {
    for (const q of jadeCfg.qualities) {
      total += jadeData.nodes?.[`${v.id}_${q}`] ?? 0;
    }
  }
  // 每 5 點等級 = 1 等，最高 15 等（75 點全滿）
  return { lv: Math.floor(total / 5) + 1, progress: total };
}
