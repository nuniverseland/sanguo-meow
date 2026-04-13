// hero.js — Hero class (one instance per unit on the battlefield)

export const HERO_EMOJIS = {
  liubei:   '🐱',
  guanyu:   '⚔️',
  zhangfei: '💥',
  zhangjiu: '💪',
  soldier:  '🪖'
};

let _nextId = 1;

export class Hero {
  constructor(data, formIndex, levelMult = 1, buffs = {}) {
    this.id       = `hero_${_nextId++}`;
    this.heroId   = data.id;
    this.name     = data.nameLine[formIndex];
    this.formData = data.forms[formIndex];
    this.imgSrc   = formIndex === 0
      ? `assets/heroes/hero_${data.id}_base.png`
      : formIndex === 2
        ? `assets/heroes/hero_${data.id}_max.png`
        : `assets/heroes/hero_${data.id}.png`;

    // Stats with level multiplier & buffs
    const f = this.formData;
    const hpBuff  = buffs.hp_boost  || 1;
    const atkBuff = buffs.atk_boost || 1;
    const spdBuff = buffs.spd_boost || 1;

    this.maxHp    = Math.round(f.hp  * levelMult * hpBuff);
    this.hp       = this.maxHp;
    this.atk      = Math.round(f.atk * levelMult * atkBuff);
    this.range    = f.range;
    this.spd      = f.spd * spdBuff;
    this.attackInterval = f.attackInterval;
    this.attackType     = f.attackType;  // 'single' | 'area'

    // Position (px, set by engine)
    this.x        = 0;
    this.facing   = 1; // 1 = right

    // State
    this.alive        = true;
    this.attacking    = false;
    this.lastAttackAt = 0;
    this.target       = null;   // current enemy target

    // DOM element (set by engine)
    this.el = null;
  }

  isDead()      { return this.hp <= 0; }
  hpPercent()   { return Math.max(0, this.hp / this.maxHp); }

  takeDamage(amount) {
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp <= 0) this.alive = false;
  }

  // Create DOM element
  createElement() {
    const el = document.createElement('div');
    el.className  = 'unit hero';
    el.dataset.id = this.id;

    const avatar = document.createElement('div');
    avatar.className = 'unit-img';

    const img = document.createElement('img');
    img.src    = this.imgSrc;
    img.width  = 80;
    img.height = 80;
    img.alt    = this.name;
    img.onerror = () => {
      avatar.style.fontSize = '3rem';
      avatar.textContent = HERO_EMOJIS[this.heroId] || '🐾';
      img.remove();
    };
    avatar.appendChild(img);

    const hpBar  = document.createElement('div');
    hpBar.className = 'unit-hp-bar';
    const hpFill = document.createElement('div');
    hpFill.className = 'unit-hp-fill';
    hpFill.style.width = '100%';
    hpBar.appendChild(hpFill);

    el.appendChild(avatar);
    el.appendChild(hpBar);
    this.el       = el;
    this.hpFillEl = hpFill;
    return el;
  }

  updateDOM() {
    if (!this.el) return;
    this.el.style.left = `${this.x}px`;
    if (this.hpFillEl) {
      this.hpFillEl.style.width = `${this.hpPercent() * 100}%`;
    }
  }

  remove() {
    this.alive = false;
    if (this.el) { this.el.remove(); this.el = null; }
  }
}
