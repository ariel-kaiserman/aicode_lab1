// Habit Quest — a small turn-based RPG inside each profile.
// Points earned from daily challenges buy upgrades; current streaks give buffs.
// Loaded before script.js: everything here runs only when called, after both
// files have loaded, so it can use script.js helpers (state, save, render, ...).

const GAME_ROOT = document.getElementById('game-tab');

const HERO_BASE = { hp: 100, atk: 10, def: 2, crit: 0.05 };

const UPGRADES = {
  atk: { icon: '&#9876;&#65039;', label: 'Attack', per: 3, baseCost: 20 },
  def: { icon: '&#128737;&#65039;', label: 'Defense', per: 2, baseCost: 20 },
  hp: { icon: '&#10084;&#65039;', label: 'Max HP', per: 15, baseCost: 15 },
};

// Monsters repeat in tougher "tiers" once the list runs out.
const MONSTERS = [
  { name: 'Slime', icon: '&#129440;' },
  { name: 'Giant Rat', icon: '&#128000;' },
  { name: 'Goblin', icon: '&#128122;' },
  { name: 'Wolf', icon: '&#128058;' },
  { name: 'Skeleton', icon: '&#128128;' },
  { name: 'Ghost', icon: '&#128123;' },
  { name: 'Orc', icon: '&#128121;' },
  { name: 'Troll', icon: '&#129484;' },
  { name: 'Vampire', icon: '&#129499;' },
  { name: 'Dragon', icon: '&#128009;' },
];

const ACTIONS = {
  attack: { label: 'Attack', hint: '95% hit', hit: 0.95, mult: 1 },
  power: { label: 'Power strike', hint: '65% hit · 2× damage', hit: 0.65, mult: 2 },
  defend: { label: 'Defend', hint: 'Half damage · heal 8%' },
};

let battle = null; // in-memory only; a refresh simply ends the fight

// ---------- data ----------

// profile.game = { spent, upgrades: { atk, def, hp }, stage, defeated }
function gameData(profile) {
  const g = profile.game || (profile.game = {});
  g.spent = Number.isFinite(g.spent) && g.spent > 0 ? g.spent : 0;
  g.upgrades = Object.assign({ atk: 0, def: 0, hp: 0 }, g.upgrades);
  g.stage = Number.isInteger(g.stage) && g.stage > 0 ? g.stage : 1;
  g.defeated = Number.isInteger(g.defeated) && g.defeated > 0 ? g.defeated : 0;
  return g;
}

function availablePoints(profile) {
  return Math.max(0, totalScore(profile) - gameData(profile).spent);
}

function upgradeCost(stat, level) {
  return UPGRADES[stat].baseCost * (level + 1);
}

// Streak buffs:
//   daily points-goal streak  → +10% damage per day (max +100%)
//   weekly points-goal streak → +10% max HP per week (max +50%)
//   longest current habit streak → +2% crit chance per step (max +30%)
function streakBuffs(profile) {
  const s = pointStreaks(profile);
  const habit = Math.max(0, ...profile.habits.map(currentStreak));
  return {
    daily: s.daily,
    weekly: s.weekly,
    habit,
    dmg: Math.min(1, s.daily * 0.1),
    hp: Math.min(0.5, s.weekly * 0.1),
    crit: Math.min(0.3, habit * 0.02),
  };
}

function heroStats(profile) {
  const u = gameData(profile).upgrades;
  const b = streakBuffs(profile);
  return {
    level: 1 + u.atk + u.def + u.hp,
    atk: Math.round((HERO_BASE.atk + u.atk * UPGRADES.atk.per) * (1 + b.dmg)),
    def: HERO_BASE.def + u.def * UPGRADES.def.per,
    maxHp: Math.round((HERO_BASE.hp + u.hp * UPGRADES.hp.per) * (1 + b.hp)),
    crit: HERO_BASE.crit + b.crit,
    buffs: b,
  };
}

function monsterFor(stage) {
  const base = MONSTERS[(stage - 1) % MONSTERS.length];
  const tier = Math.floor((stage - 1) / MONSTERS.length);
  const prefix = ['', 'Elite ', 'Ancient ', 'Legendary '][Math.min(tier, 3)];
  // Gentle polynomial growth: upgrades bought with a few days of challenge
  // points always unlock the next stages, so there is no hard wall.
  const n = stage - 1;
  const hp = Math.round(40 + 16 * n + 0.8 * n * n);
  return {
    name: `${prefix}${base.name}${tier > 3 ? ` ${tier - 2}` : ''}`,
    icon: base.icon,
    hp,
    maxHp: hp,
    atk: Math.round(6 + 1.5 * n),
    def: Math.round(n * 0.9),
  };
}

// Defense softens hits smoothly instead of blocking them outright.
function rollDamage(atk, def, crit, mult = 1) {
  const isCrit = Math.random() < crit;
  const raw = atk * (10 / (10 + def)) * mult * (0.85 + Math.random() * 0.3) * (isCrit ? 1.5 : 1);
  return { dmg: Math.max(1, Math.round(raw)), isCrit };
}

// ---------- actions ----------

function buyUpgrade(stat) {
  const g = gameData(state);
  const cost = upgradeCost(stat, g.upgrades[stat]);
  if ((battle && !battle.over) || availablePoints(state) < cost) return;
  g.upgrades[stat]++;
  g.spent += cost;
  save();
  render();
}

function startBattle() {
  const g = gameData(state);
  const hero = heroStats(state);
  battle = {
    profileId: state.id,
    stage: g.stage,
    hero,
    heroHp: hero.maxHp,
    monster: monsterFor(g.stage),
    defending: false,
    over: null, // 'won' | 'lost' | 'fled'
    log: [`A wild ${monsterFor(g.stage).name} appears!`],
  };
  render();
}

function logLine(text) {
  battle.log.unshift(text);
  battle.log.length = Math.min(battle.log.length, 8);
}

function heroTurn(type) {
  if (!battle || battle.over) return;
  const { hero, monster } = battle;
  const action = ACTIONS[type];

  if (type === 'defend') {
    battle.defending = true;
    const heal = Math.min(hero.maxHp - battle.heroHp, Math.round(hero.maxHp * 0.08));
    battle.heroHp += heal;
    logLine(`You raise your guard${heal ? ` and recover ${heal} HP` : ''}.`);
  } else if (Math.random() < action.hit) {
    const { dmg, isCrit } = rollDamage(hero.atk, monster.def, hero.crit, action.mult);
    monster.hp = Math.max(0, monster.hp - dmg);
    logLine(`${isCrit ? 'Critical! ' : ''}Your ${action.label.toLowerCase()} hits for ${dmg}.`);
  } else {
    logLine(`Your ${action.label.toLowerCase()} misses.`);
  }

  if (monster.hp <= 0) return winBattle();
  monsterTurn();
  render();
}

function monsterTurn() {
  const { hero, monster } = battle;
  if (Math.random() < 0.1) {
    logLine(`The ${monster.name} misses.`);
  } else {
    let { dmg, isCrit } = rollDamage(monster.atk, hero.def, 0.05);
    if (battle.defending) dmg = Math.ceil(dmg / 2);
    battle.heroHp = Math.max(0, battle.heroHp - dmg);
    logLine(`${isCrit ? 'Critical! ' : ''}The ${monster.name} hits you for ${dmg}${battle.defending ? ' (blocked half)' : ''}.`);
  }
  battle.defending = false;
  if (battle.heroHp <= 0) {
    battle.over = 'lost';
    logLine(`You were defeated. Upgrade your hero or build your streaks, then try again.`);
  }
}

function winBattle() {
  const g = gameData(state);
  g.stage++;
  g.defeated++;
  battle.over = 'won';
  logLine(`You defeated the ${battle.monster.name}! Stage ${g.stage} unlocked.`);
  save();
  render();
}

function fleeBattle() {
  if (!battle || battle.over) return;
  battle.over = 'fled';
  logLine('You ran away. The monster will be waiting.');
  render();
}

// ---------- rendering ----------

function hpBar(current, max, kind) {
  const pct = Math.max(0, (current / max) * 100);
  return `
    <div class="hp">
      <div class="hp-track" role="progressbar" aria-label="${kind === 'hero' ? 'Your' : 'Monster'} HP"
           aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${current}">
        <div class="hp-fill hp-${kind}" style="width: ${pct}%"></div>
      </div>
      <span class="hp-text">${current} / ${max} HP</span>
    </div>`;
}

function renderHeroCard(hero, points) {
  const b = hero.buffs;
  const buff = (active, text, idle) =>
    `<li class="buff${active ? ' on' : ''}">${active ? text : idle}</li>`;
  return `
    <section class="challenges game-card">
      <div class="hero-top">
        ${avatar(state.name)}
        <div class="hero-name">
          <strong>${escapeHtml(state.name)}</strong>
          <span class="muted">Level ${hero.level} hero · ${plural(gameData(state).defeated, 'monster')} defeated</span>
        </div>
        <span class="score" title="Points available to spend">&#9733; <strong>${points}</strong> pts</span>
      </div>
      <div class="stat-grid">
        <div><span class="muted">Attack</span><strong>${hero.atk}</strong></div>
        <div><span class="muted">Defense</span><strong>${hero.def}</strong></div>
        <div><span class="muted">Max HP</span><strong>${hero.maxHp}</strong></div>
        <div><span class="muted">Crit</span><strong>${Math.round(hero.crit * 100)}%</strong></div>
      </div>
      <h3 class="sub-head">Streak buffs</h3>
      <ul class="buffs">
        ${buff(b.daily, `&#128293; ${plural(b.daily, 'day')} daily-goal streak: +${Math.round(b.dmg * 100)}% damage`,
               '&#128293; Hit your daily points goal for +10% damage per day')}
        ${buff(b.weekly, `&#128197; ${plural(b.weekly, 'week')} weekly-goal streak: +${Math.round(b.hp * 100)}% max HP`,
               '&#128197; Hit your weekly points goal for +10% max HP per week')}
        ${buff(b.habit, `&#9989; Habit streak of ${b.habit}: +${Math.round(b.crit * 100)}% crit chance`,
               '&#9989; Keep a habit streak for +2% crit chance per step')}
      </ul>
    </section>`;
}

function renderArena() {
  const g = gameData(state);
  const active = battle && battle.profileId === state.id ? battle : null;

  if (!active) {
    const m = monsterFor(g.stage);
    return `
      <section class="challenges game-card arena">
        <div class="challenges-head"><h2>Stage ${g.stage}</h2></div>
        <div class="monster-preview">
          <span class="monster-icon" aria-hidden="true">${m.icon}</span>
          <div>
            <strong>${m.name}</strong>
            <div class="muted">${m.maxHp} HP · ${m.atk} attack · ${m.def} defense</div>
          </div>
        </div>
        <button class="primary-btn" data-game="fight">Fight!</button>
      </section>`;
  }

  const { hero, monster } = active;
  const banner = {
    won: `<p class="banner won">Victory! On to stage ${g.stage}.</p>`,
    lost: '<p class="banner lost">Defeated. Spend points on upgrades or grow your streaks, then try again.</p>',
    fled: '<p class="banner">You escaped.</p>',
  }[active.over] || '';

  const controls = active.over
    ? `<div class="actions">
         <button class="primary-btn" data-game="fight">${active.over === 'won' ? `Fight stage ${g.stage}` : 'Try again'}</button>
         <button class="secondary-btn" data-game="leave">Leave arena</button>
       </div>`
    : `<div class="actions">
         ${Object.entries(ACTIONS).map(([key, a]) => `
           <button class="action-btn" data-game="${key}">
             <strong>${a.label}</strong><span>${a.hint}</span>
           </button>`).join('')}
         <button class="action-btn flee" data-game="flee"><strong>Flee</strong><span>End the fight</span></button>
       </div>`;

  return `
    <section class="challenges game-card arena">
      <div class="challenges-head"><h2>Stage ${active.stage}</h2></div>
      <div class="combatants">
        <div class="combatant">
          ${avatar(state.name)}
          <strong>${escapeHtml(state.name)}${active.defending ? ' &#128737;&#65039;' : ''}</strong>
          ${hpBar(active.heroHp, hero.maxHp, 'hero')}
        </div>
        <span class="versus" aria-hidden="true">VS</span>
        <div class="combatant">
          <span class="monster-icon" aria-hidden="true">${monster.icon}</span>
          <strong>${monster.name}</strong>
          ${hpBar(monster.hp, monster.maxHp, 'monster')}
        </div>
      </div>
      ${banner}
      ${controls}
      <ol class="battle-log" aria-live="polite">
        ${active.log.map(line => `<li>${line}</li>`).join('')}
      </ol>
    </section>`;
}

function renderShop(points) {
  const g = gameData(state);
  const locked = battle && battle.profileId === state.id && !battle.over;
  const rows = Object.entries(UPGRADES).map(([stat, u]) => {
    const level = g.upgrades[stat];
    const cost = upgradeCost(stat, level);
    return `
      <li class="shop-row">
        <span class="shop-icon" aria-hidden="true">${u.icon}</span>
        <div class="shop-text">
          <strong>${u.label} <span class="muted">Lv ${level}</span></strong>
          <span class="muted">+${u.per} ${u.label.toLowerCase()} per level</span>
        </div>
        <button class="buy-btn" data-game="buy" data-stat="${stat}"
                ${locked || points < cost ? 'disabled' : ''}>&#9733; ${cost}</button>
      </li>`;
  }).join('');
  return `
    <section class="challenges game-card">
      <div class="challenges-head"><h2>Upgrades</h2></div>
      <ul class="shop">${rows}</ul>
      <p class="challenge-foot">
        ${locked ? 'Finish or flee the fight to buy upgrades. ' : ''}Earn points by completing daily challenges.
        Spending points doesn't lower your challenge score or streaks.
      </p>
    </section>`;
}

function renderGame() {
  const points = availablePoints(state);
  const hero = heroStats(state);
  summary.textContent = 'Turn your real-life streaks into power.';
  GAME_ROOT.innerHTML = renderHeroCard(hero, points) + renderArena() + renderShop(points);
}

GAME_ROOT.addEventListener('click', e => {
  const btn = e.target.closest('button[data-game]');
  if (!btn || !state) return;
  const action = btn.dataset.game;
  if (action === 'fight') startBattle();
  else if (action === 'leave') { battle = null; render(); }
  else if (action === 'flee') fleeBattle();
  else if (action === 'buy') buyUpgrade(btn.dataset.stat);
  else if (ACTIONS[action]) heroTurn(action);
});
