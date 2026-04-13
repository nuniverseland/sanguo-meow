// enemy.js — Enemy class (one instance per unit on the battlefield)

export const ENEMY_EMOJIS = {
  tw_bear:          '🐻',
  tw_magpie:        '🐦',
  tw_leopard_boss:  '🐆'
};

let _nextId = 1;

export class Enemy {
  constructor(data, buffs = {}) {
    this.id      = `enemy_${_nextId++}`;
    this.enemyId = data.id;
    this.name    = data.name;
    this.type    = data.type;   // 'normal' | 'flying' | 'boss'
    this.trait   = data.trait;
    this.imgSrc  = data.imgWalk;

    this.maxHp          = data.hp;
    this.hp             = data.hp;
    this.atk            = data.atk;
    this.speed          = data.speed;
    this.range          = data.range;
    this.attackInterval = data.attackInterval;
    this.attackType     = data.attackType;
    this.knockbackCount = data.knockbackCount;
    this.reward         = data.reward;
    this.rewardScore    = data.rewardScore;

    this.facing   = -1; // -1 = left
    this.x        = 0;
    this.alive    = true;
    this.attacking    = false;
    this.lastAttackAt = 0;
    this.target       = null;

    this.knockbacksLeft = data.knockbackCount;

    // DOM element
    this.el = null;
  }

  isDead()    { return this.hp <= 0; }
  isBoss()    { return this.type === 'boss'; }
  isFlying()  { return this.type === 'flying'; }
  hpPercent() { return Math.max(0, this.hp / this.maxHp); }

  takeDamage(amount) {
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp <= 0) this.alive = false;
  }

  createElement() {
    const el = document.createElement('div');
    el.className  = `unit enemy${this.isFlying() ? ' flying' : ''}${this.isBoss() ? ' boss' : ''}`;
    el.dataset.id = this.id;

    const avatar = document.createElement('div');
    avatar.className = 'unit-img';
    avatar.style.transform = 'scaleX(-1)'; // face left

    const img = document.createElement('img');
    img.src    = this.imgSrc;
    img.width  = this.isBoss() ? 130 : 90;
    img.height = this.isBoss() ? 130 : 90;
    img.alt    = this.name;
    img.onerror = () => {
      avatar.style.fontSize = '3rem';
      avatar.textContent = ENEMY_EMOJIS[this.enemyId] || '👾';
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
