// Habit Tracker — runs entirely in the browser, data is kept in localStorage.

const STORAGE_KEY = 'habit-tracker-profiles-v1';
const LEGACY_KEY = 'habit-tracker-v1'; // single-profile data from before profiles existed

const startView = document.getElementById('start-view');
const trackerView = document.getElementById('tracker-view');
const profileList = document.getElementById('profile-list');
const profileForm = document.getElementById('profile-form');
const profileInput = document.getElementById('profile-name');
const profileBadge = document.getElementById('profile-badge');
const switchButton = document.getElementById('switch-profile');
const trackerTitle = document.getElementById('tracker-title');
const habitsTab = document.getElementById('habits-tab');
const gameTab = document.getElementById('game-tab');

const list = document.getElementById('habit-list');
const form = document.getElementById('add-form');
const input = document.getElementById('habit-name');
const timeInput = document.getElementById('habit-time');
const frequencySelect = document.getElementById('habit-frequency');
const timesField = document.getElementById('times-field');
const timesInput = document.getElementById('habit-times');
const summary = document.getElementById('summary');
const empty = document.getElementById('empty');
const challengesBox = document.getElementById('challenges');

// ---------- daily challenges ----------
// Each profile gets one easy, one medium and one hard challenge per day, picked
// from this pool by a random generator seeded with the profile id and the date,
// so the picks stay the same all day and differ between profiles.

const POINTS = { easy: 10, medium: 20, hard: 30 };
const ALL_DONE_BONUS = 25;
const CHALLENGES = [
  { id: 'water', level: 'easy', text: 'Drink 8 glasses of water' },
  { id: 'stretch', level: 'easy', text: 'Stretch for 5 minutes' },
  { id: 'bed', level: 'easy', text: 'Make your bed' },
  { id: 'gratitude', level: 'easy', text: "Write down 3 things you're grateful for" },
  { id: 'compliment', level: 'easy', text: 'Give someone a genuine compliment' },
  { id: 'tidy', level: 'easy', text: 'Tidy one drawer or shelf' },
  { id: 'stairs', level: 'easy', text: 'Take the stairs instead of the elevator' },
  { id: 'fruit', level: 'easy', text: 'Eat two servings of fruit' },
  { id: 'walk', level: 'medium', text: 'Go for a 20-minute walk' },
  { id: 'read', level: 'medium', text: 'Read 15 pages of a book' },
  { id: 'no-sugar', level: 'medium', text: 'Skip added sugar all day' },
  { id: 'call', level: 'medium', text: 'Call a friend or family member' },
  { id: 'learn', level: 'medium', text: 'Spend 15 minutes learning something new' },
  { id: 'cook', level: 'medium', text: 'Cook a meal from scratch' },
  { id: 'meditate', level: 'medium', text: 'Meditate for 10 minutes' },
  { id: 'pushups', level: 'medium', text: 'Do 50 push-ups (in sets is fine)' },
  { id: 'no-social', level: 'hard', text: 'No social media for the whole day' },
  { id: 'early', level: 'hard', text: 'Wake up before 7:00' },
  { id: 'workout', level: 'hard', text: 'Do a 45-minute workout' },
  { id: 'screens-off', level: 'hard', text: 'No screens in the last hour before bed' },
  { id: 'steps', level: 'hard', text: 'Walk 10,000 steps' },
  { id: 'cold', level: 'hard', text: 'Take a cold shower' },
];

function hashString(str) {
  let h = 2166136261; // FNV-1a
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededRandom(seed) {
  return () => { // mulberry32
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function challengesFor(profile, key) {
  const rand = seededRandom(hashString(profile.id + key));
  return ['easy', 'medium', 'hard'].map(level => {
    const pool = CHALLENGES.filter(c => c.level === level);
    return pool[Math.floor(rand() * pool.length)];
  });
}

// profile.challenges = { 'YYYY-MM-DD': { challengeId: pointsEarned } }.
// Points are stored when earned, so editing the pool later never changes old scores.
function dayScore(day) {
  const entries = Object.values(day);
  const points = entries.reduce((sum, p) => sum + p, 0);
  return points + (entries.length === Object.keys(POINTS).length ? ALL_DONE_BONUS : 0);
}

function totalScore(profile) {
  return Object.values(profile.challenges || {}).reduce((sum, day) => sum + dayScore(day), 0);
}

// Completing a challenge is confirmed first and is permanent (no undo).
function completeChallenge(id) {
  const key = dateKey(today());
  const challenge = challengesFor(state, key).find(c => c.id === id);
  if (!challenge) return; // only today's challenges can be completed
  if (state.challenges?.[key]?.[id]) return; // already completed
  if (!confirm(`Did you complete "${challenge.text}"?\n\nYou'll earn ${POINTS[challenge.level]} pts. This can't be undone.`)) return;
  state.challenges ||= {};
  (state.challenges[key] ||= {})[id] = POINTS[challenge.level];
  save();
  render();
}

function renderChallenges() {
  const key = dateKey(today());
  const day = (state.challenges || {})[key] || {};
  const picks = challengesFor(state, key);
  const allDone = picks.every(c => day[c.id]);

  const items = picks.map(c => {
    const done = !!day[c.id];
    return `
      <li>
        <button class="challenge${done ? ' done' : ''}" data-challenge="${c.id}"${done ? ' disabled title="Completed"' : ''}>
          <span class="check" aria-hidden="true">${done ? '&#10003;' : ''}</span>
          <span class="challenge-text">${c.text}</span>
          <span class="badge badge-${c.level}">${c.level} · +${POINTS[c.level]}</span>
        </button>
      </li>`;
  }).join('');

  challengesBox.innerHTML = `
    <div class="challenges-head">
      <h2>Today's challenges</h2>
      <span class="score" title="Total score">&#9733; <strong>${totalScore(state)}</strong> pts</span>
    </div>
    <ul class="challenge-list">${items}</ul>
    <p class="challenge-foot">
      Today: <strong>${dayScore(day)}</strong> pts ·
      ${allDone ? `All done, +${ALL_DONE_BONUS} bonus earned!` : `Complete all ${picks.length} for a +${ALL_DONE_BONUS} bonus`}
      · New challenges every day
    </p>`;
}

challengesBox.addEventListener('click', e => {
  const btn = e.target.closest('button[data-challenge]');
  if (btn) completeChallenge(btn.dataset.challenge);
});

// ---------- points goals, streaks & history ----------

const pointsBox = document.getElementById('points');
const DEFAULT_GOALS = { daily: 50, weekly: 300 };
const CHART_DAYS = 14;
const HISTORY_DAYS = 30;
let editingGoals = false;
let historyOpen = false;

function clampGoal(n, fallback, max) {
  n = Math.round(Number(n));
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : fallback;
}

function pointGoals(profile) {
  const g = profile.pointGoals || {};
  return {
    daily: clampGoal(g.daily, DEFAULT_GOALS.daily, 1000),
    weekly: clampGoal(g.weekly, DEFAULT_GOALS.weekly, 7000),
  };
}

function pointsOn(profile, d) {
  const day = (profile.challenges || {})[dateKey(d)];
  return day ? dayScore(day) : 0;
}

function pointsInWeek(profile, start) {
  let sum = 0;
  for (let i = 0; i < 7; i++) sum += pointsOn(profile, addDays(start, i));
  return sum;
}

// Counts back from `start`; the run is still alive if `start` itself isn't met yet.
function currentRun(start, stepBack, isMet) {
  let d = isMet(start) ? start : stepBack(start);
  let count = 0;
  while (isMet(d)) {
    count++;
    d = stepBack(d);
  }
  return count;
}

function bestRun(first, last, stepForward, isMet) {
  let best = 0;
  let run = 0;
  for (let d = first; d <= last; d = stepForward(d)) {
    run = isMet(d) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

// Streaks of days (and weeks) whose points reached the daily (weekly) goal.
function pointStreaks(profile) {
  const goals = pointGoals(profile);
  const t = today();
  const keys = Object.keys(profile.challenges || {}).sort();
  const first = keys.length ? parseKey(keys[0]) : null;
  const dayMet = d => pointsOn(profile, d) >= goals.daily;
  const weekMet = s => pointsInWeek(profile, s) >= goals.weekly;
  const step = n => d => addDays(d, n);
  return {
    daily: currentRun(t, step(-1), dayMet),
    bestDaily: first ? bestRun(first, t, step(1), dayMet) : 0,
    weekly: currentRun(weekStart(t), step(-7), weekMet),
    bestWeekly: first ? bestRun(weekStart(first), weekStart(t), step(7), weekMet) : 0,
  };
}

function renderMeter(label, value, goal) {
  const pct = Math.min(100, (value / goal) * 100);
  const met = value >= goal;
  return `
    <div class="meter${met ? ' met' : ''}">
      <div class="meter-top">
        <span>${label}</span>
        <span><strong>${value}</strong> / ${goal} pts${met ? ' &#10003;' : ''}</span>
      </div>
      <div class="meter-track" role="progressbar" aria-label="${label}"
           aria-valuemin="0" aria-valuemax="${goal}" aria-valuenow="${value}">
        <div class="meter-fill" style="width: ${pct}%"></div>
      </div>
    </div>`;
}

const shortDate = d => d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

function renderPointsChart(goals) {
  const t = today();
  const days = Array.from({ length: CHART_DAYS }, (_, i) => addDays(t, i - CHART_DAYS + 1));
  const points = days.map(d => pointsOn(state, d));
  const max = Math.ceil(Math.max(goals.daily, ...points) / 10) * 10;

  const bars = days.map((d, i) => {
    const tip = `${shortDate(d)}: ${points[i]} pts`;
    return `
      <div class="bar-col" tabindex="0" data-tip="${tip}" aria-label="${tip}">
        <div class="bar" style="height: ${(points[i] / max) * 100}%"></div>
      </div>`;
  }).join('');
  const labels = days.map(d =>
    `<span${d.getTime() === t.getTime() ? ' class="today"' : ''}>${d.getDate()}</span>`).join('');

  return `
    <h3 class="sub-head">Points per day, last ${CHART_DAYS} days</h3>
    <div class="chart">
      <div class="chart-y" aria-hidden="true"><span>${max}</span><span>0</span></div>
      <div class="chart-main">
        <div class="chart-plot">
          <div class="goal-line" style="bottom: ${(goals.daily / max) * 100}%">
            <span>Daily goal ${goals.daily}</span>
          </div>
          <div class="bars">${bars}</div>
        </div>
        <div class="chart-x" aria-hidden="true">${labels}</div>
      </div>
    </div>`;
}

function renderHistory(goals) {
  const days = Object.keys(state.challenges || {}).sort().reverse().slice(0, HISTORY_DAYS);
  const rows = days.map(key => {
    const day = state.challenges[key];
    const total = dayScore(day);
    const items = Object.entries(day).map(([id, pts]) => {
      const c = CHALLENGES.find(c => c.id === id);
      return `<li><span>${c ? c.text : escapeHtml(id)}</span><span>+${pts}</span></li>`;
    });
    if (total > Object.values(day).reduce((a, b) => a + b, 0)) {
      items.push(`<li><span>All-done bonus</span><span>+${ALL_DONE_BONUS}</span></li>`);
    }
    return `
      <li class="history-day">
        <div class="history-top">
          <span>${longDate(parseKey(key))}</span>
          <span><strong>${total} pts</strong>${total >= goals.daily ? ' <span class="met-tag">&#10003; goal</span>' : ''}</span>
        </div>
        <ul class="history-items">${items.join('')}</ul>
      </li>`;
  }).join('');
  return `
    <details class="history"${historyOpen ? ' open' : ''}>
      <summary>Challenge history</summary>
      ${rows ? `<ul class="history-list">${rows}</ul>` : '<p class="muted">No challenges completed yet.</p>'}
    </details>`;
}

function renderGoalsForm(goals) {
  return `
    <form class="add-form edit-form goals-form">
      <label class="field">
        <span class="field-label">Daily goal, points</span>
        <input name="daily" type="number" min="1" max="1000" inputmode="numeric" required value="${goals.daily}">
      </label>
      <label class="field">
        <span class="field-label">Weekly goal, points</span>
        <input name="weekly" type="number" min="1" max="7000" inputmode="numeric" required value="${goals.weekly}">
      </label>
      <div class="edit-buttons">
        <button type="button" class="secondary" data-action="cancel-goals">Cancel</button>
        <button type="submit">Save</button>
      </div>
      <p class="goals-hint">A day with all challenges done is worth
        ${Object.values(POINTS).reduce((a, b) => a + b, 0) + ALL_DONE_BONUS} pts.</p>
    </form>`;
}

function renderPoints() {
  const goals = pointGoals(state);
  const t = today();
  const s = pointStreaks(state);
  pointsBox.innerHTML = `
    <div class="challenges-head">
      <h2>Points &amp; streaks</h2>
      ${editingGoals ? '' : '<button class="link-btn" data-action="edit-goals">Edit goals</button>'}
    </div>
    ${editingGoals ? renderGoalsForm(goals) : ''}
    <div class="meters">
      ${renderMeter('Today', pointsOn(state, t), goals.daily)}
      ${renderMeter('This week', pointsInWeek(state, weekStart(t)), goals.weekly)}
    </div>
    <div class="streak-row">
      <div class="streak-tile">
        <span class="streak-num">${s.daily}</span>
        <span>${s.daily === 1 ? 'day' : 'days'} hitting the daily goal</span>
        <span class="muted">Best ${plural(s.bestDaily, 'day')}</span>
      </div>
      <div class="streak-tile">
        <span class="streak-num">${s.weekly}</span>
        <span>${s.weekly === 1 ? 'week' : 'weeks'} hitting the weekly goal</span>
        <span class="muted">Best ${plural(s.bestWeekly, 'week')}</span>
      </div>
    </div>
    ${renderPointsChart(goals)}
    ${renderHistory(goals)}`;
}

pointsBox.addEventListener('click', e => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  if (btn.dataset.action === 'edit-goals') editingGoals = true;
  if (btn.dataset.action === 'cancel-goals') editingGoals = false;
  render();
});

pointsBox.addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target.elements;
  state.pointGoals = {
    daily: clampGoal(f.namedItem('daily').value, DEFAULT_GOALS.daily, 1000),
    weekly: clampGoal(f.namedItem('weekly').value, DEFAULT_GOALS.weekly, 7000),
  };
  editingGoals = false;
  save();
  render();
});

// <details> is rebuilt on every render, so remember whether it was open.
pointsBox.addEventListener('toggle', e => {
  if (e.target.matches('.history')) historyOpen = e.target.open;
}, true);

const store = loadStore(); // { profiles: [{ id, name, habits }] }
let state = null;          // the open profile, or null on the start page
let currentTab = 'habits'; // 'habits' or 'game' inside a profile
const shownMonth = {}; // habit id -> first day of the month its calendar shows (not saved)
let editingId = null; // habit whose card currently shows the edit form

// ---------- storage ----------

function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch (e) { /* storage unavailable or corrupt */ }
  return null;
}

function loadStore() {
  const data = readJson(STORAGE_KEY);
  if (data && Array.isArray(data.profiles)) {
    data.profiles.forEach(p => {
      if (!Array.isArray(p.habits)) p.habits = [];
      p.habits.forEach(normalizeHabit);
    });
    return data;
  }
  // First run with profiles: move any existing habits into a starter profile.
  const legacy = readJson(LEGACY_KEY);
  if (legacy && Array.isArray(legacy.habits) && legacy.habits.length) {
    legacy.habits.forEach(normalizeHabit);
    const migrated = { profiles: [{ id: newId(), name: 'My habits', habits: legacy.habits }] };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated)); // keep the profile id stable across reloads
    } catch (e) { /* storage unavailable */ }
    return migrated;
  }
  return { profiles: [] };
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// Habits saved before target time/frequency existed default to daily with no target.
function normalizeHabit(habit) {
  if (!['daily', 'weekly', 'perWeek'].includes(habit.frequency)) habit.frequency = 'daily';
  habit.targetMinutes = parseMinutes(habit.targetMinutes);
  delete habit.time; // replaced by targetMinutes
  habit.timesPerWeek = clampTimes(habit.timesPerWeek);
  if (!habit.done || typeof habit.done !== 'object') habit.done = {};
}

// Minutes to spend on the habit each time, or null when no target is set.
function parseMinutes(n) {
  n = Math.round(Number(n));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 1440) : null;
}

function clampTimes(n) {
  n = Math.round(Number(n));
  return Number.isFinite(n) ? Math.min(7, Math.max(1, n)) : 3;
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (e) { /* storage unavailable — keep working in memory */ }
}

// ---------- dates (local time, keyed as YYYY-MM-DD) ----------

function today() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function dateKey(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// ---------- streaks ----------
// Daily habits count streaks in days; weekly habits count weeks (Sun–Sat)
// in which the weekly target was reached.

function isDaily(habit) {
  return habit.frequency === 'daily';
}

function weeklyTarget(habit) {
  return habit.frequency === 'weekly' ? 1 : habit.timesPerWeek;
}

function weekStart(d) {
  return addDays(d, -d.getDay());
}

function countInWeek(habit, start) {
  let count = 0;
  for (let i = 0; i < 7; i++) {
    if (habit.done[dateKey(addDays(start, i))]) count++;
  }
  return count;
}

function currentStreak(habit) {
  return isDaily(habit) ? currentDayStreak(habit) : currentWeekStreak(habit);
}

function bestStreak(habit) {
  return isDaily(habit) ? bestDayStreak(habit) : bestWeekStreak(habit);
}

// A week streak is still alive if this week's target isn't met yet but last week's was.
function currentWeekStreak(habit) {
  const target = weeklyTarget(habit);
  let start = weekStart(today());
  if (countInWeek(habit, start) < target) start = addDays(start, -7);
  let count = 0;
  while (countInWeek(habit, start) >= target) {
    count++;
    start = addDays(start, -7);
  }
  return count;
}

function bestWeekStreak(habit) {
  const keys = Object.keys(habit.done).sort();
  if (!keys.length) return 0;
  const target = weeklyTarget(habit);
  const last = weekStart(today());
  let best = 0;
  let run = 0;
  for (let start = weekStart(parseKey(keys[0])); start <= last; start = addDays(start, 7)) {
    run = countInWeek(habit, start) >= target ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

// A day streak is still alive if today isn't ticked yet but yesterday was.
function currentDayStreak(habit) {
  let d = today();
  if (!habit.done[dateKey(d)]) d = addDays(d, -1);
  let count = 0;
  while (habit.done[dateKey(d)]) {
    count++;
    d = addDays(d, -1);
  }
  return count;
}

function bestDayStreak(habit) {
  const keys = Object.keys(habit.done).sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const key of keys) {
    run = prev && dateKey(addDays(prev, 1)) === key ? run + 1 : 1;
    best = Math.max(best, run);
    prev = parseKey(key);
  }
  return best;
}

// ---------- actions ----------

function addHabit({ name, targetMinutes, frequency, timesPerWeek }) {
  state.habits.push({
    id: newId(),
    name,
    targetMinutes: parseMinutes(targetMinutes),
    frequency,
    timesPerWeek: clampTimes(timesPerWeek),
    done: {},
  });
  save();
  render();
}

function toggleDay(id, key) {
  const habit = state.habits.find(h => h.id === id);
  if (!habit) return;
  if (habit.done[key]) delete habit.done[key];
  else habit.done[key] = true;
  save();
  render();
}

// Changing name, target or frequency keeps the habit's ticked days.
function updateHabit(id, { name, targetMinutes, frequency, timesPerWeek }) {
  const habit = state.habits.find(h => h.id === id);
  if (!habit) return;
  Object.assign(habit, {
    name,
    targetMinutes: parseMinutes(targetMinutes),
    frequency,
    timesPerWeek: clampTimes(timesPerWeek),
  });
  editingId = null;
  save();
  render();
}

function startEditing(id) {
  editingId = id;
  render();
  list.querySelector('.edit-form input[name="name"]')?.focus();
}

function stopEditing() {
  editingId = null;
  render();
}

function deleteHabit(id) {
  const habit = state.habits.find(h => h.id === id);
  if (!habit || !confirm(`Delete "${habit.name}"? This removes its history.`)) return;
  state.habits = state.habits.filter(h => h.id !== id);
  save();
  render();
}

// ---------- rendering ----------

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

const longDate = d => d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

function renderWeek(habit, todayKey) {
  let html = '';
  for (let i = 6; i >= 0; i--) {
    const d = addDays(today(), -i);
    const key = dateKey(d);
    const done = !!habit.done[key];
    const cls = ['day', done && 'done', key === todayKey && 'today'].filter(Boolean).join(' ');
    html += `
      <button class="${cls}" data-action="toggle" data-date="${key}"
              aria-pressed="${done}" title="${longDate(d)}">
        <span class="dow">${d.toLocaleDateString(undefined, { weekday: 'short' })}</span>
        <span class="num">${d.getDate()}</span>
      </button>`;
  }
  return html;
}

function currentMonth() {
  const t = today();
  return new Date(t.getFullYear(), t.getMonth(), 1);
}

function changeMonth(id, delta) {
  const m = shownMonth[id] || currentMonth();
  const next = new Date(m.getFullYear(), m.getMonth() + delta, 1);
  if (next > currentMonth()) return; // nothing to tick in future months
  shownMonth[id] = next;
  render();
}

// A month calendar (weeks start on Sunday). Past days and today can be ticked.
function renderCalendar(habit, todayKey) {
  const t = today();
  const month = shownMonth[habit.id] || currentMonth();
  const isThisMonth = month.getTime() === currentMonth().getTime();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const title = month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  let grid = '';
  const sunday = weekStart(t);
  for (let i = 0; i < 7; i++) {
    grid += `<span class="cal-dow">${addDays(sunday, i).toLocaleDateString(undefined, { weekday: 'short' })}</span>`;
  }
  for (let i = 0; i < month.getDay(); i++) {
    grid += '<span class="cal-day blank"></span>';
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(month.getFullYear(), month.getMonth(), day);
    const key = dateKey(d);
    if (d > t) {
      grid += `<span class="cal-day future">${day}</span>`;
      continue;
    }
    const done = !!habit.done[key];
    const cls = ['cal-day', done && 'done', key === todayKey && 'today'].filter(Boolean).join(' ');
    grid += `<button class="${cls}" data-action="toggle" data-date="${key}"
                     aria-pressed="${done}" aria-label="${longDate(d)}" title="${longDate(d)}">${day}</button>`;
  }

  const monthDone = Object.keys(habit.done)
    .filter(k => k.startsWith(dateKey(month).slice(0, 7))).length;

  return `
    <div class="cal-head">
      <button class="cal-nav" data-action="prev-month" aria-label="Previous month">&#8249;</button>
      <div class="cal-title">${title} <span class="cal-count">· ${plural(monthDone, 'day')} done</span></div>
      <button class="cal-nav" data-action="next-month" aria-label="Next month"${isThisMonth ? ' disabled' : ''}>&#8250;</button>
    </div>
    <div class="cal-grid">${grid}</div>`;
}

function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

function scheduleText(habit) {
  const freq = {
    daily: 'Daily',
    weekly: 'Once a week',
    perWeek: `${habit.timesPerWeek}× per week`,
  }[habit.frequency];
  return habit.targetMinutes ? `${freq} · ${formatDuration(habit.targetMinutes)} each time` : freq;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Daily habits are on track once today is ticked; weekly ones once this week's target is met.
function isOnTrack(habit, todayKey) {
  return isDaily(habit)
    ? !!habit.done[todayKey]
    : countInWeek(habit, weekStart(today())) >= weeklyTarget(habit);
}

function renderStats(habit) {
  const unit = isDaily(habit) ? 'day' : 'week';
  let html = `
    <span>Current streak <strong>${plural(currentStreak(habit), unit)}</strong></span>
    <span>Best <strong>${plural(bestStreak(habit), unit)}</strong></span>`;
  if (!isDaily(habit)) {
    html += `<span>This week <strong>${countInWeek(habit, weekStart(today()))}/${weeklyTarget(habit)}</strong></span>`;
  }
  html += `<span>Total <strong>${Object.keys(habit.done).length}</strong></span>`;
  return html;
}

function renderEditForm(habit) {
  const option = (value, label) =>
    `<option value="${value}"${habit.frequency === value ? ' selected' : ''}>${label}</option>`;
  return `
    <form class="add-form edit-form">
      <label class="field field-name">
        <span class="field-label">Habit name</span>
        <input name="name" type="text" maxlength="60" autocomplete="off" required
               value="${escapeHtml(habit.name)}">
      </label>
      <label class="field">
        <span class="field-label">Target time, minutes <span class="optional">(optional)</span></span>
        <input name="targetMinutes" type="number" min="1" max="1440" step="1" inputmode="numeric"
               placeholder="e.g. 20" value="${habit.targetMinutes ?? ''}">
      </label>
      <label class="field">
        <span class="field-label">Frequency</span>
        <select name="frequency">
          ${option('daily', 'Daily')}${option('weekly', 'Weekly')}${option('perWeek', 'Times per week')}
        </select>
      </label>
      <label class="field field-times"${habit.frequency === 'perWeek' ? '' : ' hidden'}>
        <span class="field-label">Times</span>
        <input name="timesPerWeek" type="number" min="1" max="7" inputmode="numeric"
               value="${habit.timesPerWeek}">
      </label>
      <div class="edit-buttons">
        <button type="button" class="secondary" data-action="cancel-edit">Cancel</button>
        <button type="submit">Save</button>
      </div>
    </form>`;
}

function render() {
  if (!state) return renderStart();
  profileBadge.innerHTML = `${avatar(state.name)}<span>${escapeHtml(state.name)}</span>`;
  const inGame = currentTab === 'game';
  habitsTab.hidden = inGame;
  gameTab.hidden = !inGame;
  trackerTitle.textContent = inGame ? 'Habit Quest' : 'Habit Tracker';
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === currentTab);
    t.setAttribute('aria-current', t.dataset.tab === currentTab ? 'page' : 'false');
  });
  if (inGame) renderGame();
  else renderTracker();
}

function avatar(name) {
  const initial = Array.from(name.trim())[0] || '?';
  return `<span class="avatar" aria-hidden="true">${escapeHtml(initial.toUpperCase())}</span>`;
}

function renderStart() {
  const todayKey = dateKey(today());
  profileList.innerHTML = store.profiles.length
    ? store.profiles.map(p => {
        const onTrack = p.habits.filter(h => isOnTrack(h, todayKey)).length;
        const habitsText = p.habits.length
          ? `${plural(p.habits.length, 'habit')} · ${onTrack} on track`
          : 'No habits yet';
        const meta = `${habitsText} · &#9733; ${totalScore(p)} pts · &#9876;&#65039; Stage ${gameData(p).stage}`;
        return `
          <li class="profile-card" data-profile="${p.id}">
            <button class="profile-open" data-action="open-profile">
              ${avatar(p.name)}
              <span class="profile-text">
                <span class="profile-name">${escapeHtml(p.name)}</span>
                <span class="profile-meta">${meta}</span>
              </span>
            </button>
            <div class="habit-actions">
              <button class="icon-btn" data-action="rename-profile" aria-label="Rename ${escapeHtml(p.name)}" title="Rename">&#9998;</button>
              <button class="icon-btn delete" data-action="delete-profile" aria-label="Delete ${escapeHtml(p.name)}" title="Delete">&times;</button>
            </div>
          </li>`;
      }).join('')
    : '<li class="empty">No profiles yet. Create one below to get started.</li>';
}

function renderTracker() {
  renderChallenges();
  renderPoints();
  const todayKey = dateKey(today());
  const onTrack = state.habits.filter(h => isOnTrack(h, todayKey)).length;

  summary.textContent = state.habits.length
    ? `${onTrack} of ${state.habits.length} habits on track`
    : 'Build streaks, one day at a time.';
  empty.hidden = state.habits.length > 0;

  list.innerHTML = state.habits.map(habit => {
    const head = habit.id === editingId ? renderEditForm(habit) : `
        <div class="habit-head">
          <div>
            <h2>${escapeHtml(habit.name)}</h2>
            <p class="schedule">${scheduleText(habit)}</p>
          </div>
          <div class="habit-actions">
            <button class="icon-btn" data-action="edit" aria-label="Edit ${escapeHtml(habit.name)}" title="Edit">&#9998;</button>
            <button class="icon-btn delete" data-action="delete" aria-label="Delete ${escapeHtml(habit.name)}" title="Delete">&times;</button>
          </div>
        </div>`;
    return `
      <li class="habit" data-id="${habit.id}">
        ${head}
        <div class="stats">${renderStats(habit)}</div>
        <div class="week">${renderWeek(habit, todayKey)}</div>
        <div class="calendar">${renderCalendar(habit, todayKey)}</div>
      </li>`;
  }).join('');
}

// ---------- profiles & navigation ----------
// The open profile lives in the URL (#/p/<id>) so reloading keeps you on it
// and the browser's back button returns to the start page.

function route() {
  const match = location.hash.match(/^#\/p\/([^/]+)(\/game)?$/);
  state = (match && store.profiles.find(p => p.id === match[1])) || null;
  currentTab = match && match[2] ? 'game' : 'habits';
  editingId = null;
  editingGoals = false;
  startView.hidden = !!state;
  trackerView.hidden = !state;
  document.title = state ? `${state.name} · Habit Tracker` : 'Habit Tracker';
  render();
  window.scrollTo(0, 0);
}

function openProfile(id, tab = 'habits') {
  location.hash = tab === 'game' ? `#/p/${id}/game` : `#/p/${id}`;
}

document.querySelector('.tabs').addEventListener('click', e => {
  const tab = e.target.closest('[data-tab]');
  if (tab && state) openProfile(state.id, tab.dataset.tab);
});

function goToStart() {
  history.pushState(null, '', location.pathname + location.search);
  route();
}

function createProfile(name) {
  const profile = { id: newId(), name, habits: [], challenges: {} };
  store.profiles.push(profile);
  save();
  openProfile(profile.id);
}

function renameProfile(id) {
  const profile = store.profiles.find(p => p.id === id);
  if (!profile) return;
  const name = prompt('Rename profile', profile.name)?.trim();
  if (!name) return;
  profile.name = name.slice(0, 30);
  save();
  render();
}

function deleteProfile(id) {
  const profile = store.profiles.find(p => p.id === id);
  if (!profile || !confirm(`Delete profile "${profile.name}" and all of its habits?`)) return;
  store.profiles = store.profiles.filter(p => p.id !== id);
  save();
  render();
}

profileForm.addEventListener('submit', e => {
  e.preventDefault();
  const name = profileInput.value.trim();
  if (!name) return;
  profileInput.value = '';
  createProfile(name);
});

profileList.addEventListener('click', e => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const id = btn.closest('.profile-card').dataset.profile;
  if (btn.dataset.action === 'open-profile') openProfile(id);
  if (btn.dataset.action === 'rename-profile') renameProfile(id);
  if (btn.dataset.action === 'delete-profile') deleteProfile(id);
});

switchButton.addEventListener('click', goToStart);
window.addEventListener('hashchange', route);
window.addEventListener('popstate', route);

// ---------- events ----------

form.addEventListener('submit', e => {
  e.preventDefault();
  const name = input.value.trim();
  if (!name) return;
  addHabit({
    name,
    targetMinutes: timeInput.value,
    frequency: frequencySelect.value,
    timesPerWeek: timesInput.value,
  });
  input.value = '';
  timeInput.value = '';
  input.focus();
});

// Only ask "how many times" when the frequency is "Times per week".
function syncTimesField() {
  timesField.hidden = frequencySelect.value !== 'perWeek';
}
frequencySelect.addEventListener('change', syncTimesField);
syncTimesField(); // the browser may restore the select's value on reload

list.addEventListener('click', e => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const id = btn.closest('.habit').dataset.id;
  if (btn.dataset.action === 'toggle') toggleDay(id, btn.dataset.date);
  if (btn.dataset.action === 'delete') deleteHabit(id);
  if (btn.dataset.action === 'edit') startEditing(id);
  if (btn.dataset.action === 'cancel-edit') stopEditing();
  if (btn.dataset.action === 'prev-month') changeMonth(id, -1);
  if (btn.dataset.action === 'next-month') changeMonth(id, 1);
});

// Edit form (rendered inside a habit card).
list.addEventListener('submit', e => {
  if (!e.target.matches('.edit-form')) return;
  e.preventDefault();
  const f = e.target.elements;
  const value = field => f.namedItem(field).value;
  const name = value('name').trim();
  if (!name) return;
  updateHabit(e.target.closest('.habit').dataset.id, {
    name,
    targetMinutes: value('targetMinutes'),
    frequency: value('frequency'),
    timesPerWeek: value('timesPerWeek'),
  });
});

list.addEventListener('change', e => {
  if (!e.target.matches('.edit-form select[name="frequency"]')) return;
  e.target.form.querySelector('.field-times').hidden = e.target.value !== 'perWeek';
});

list.addEventListener('keydown', e => {
  if (e.key === 'Escape' && e.target.closest('.edit-form')) stopEditing();
});

// Refresh when the tab comes back into view, so "today" rolls over after midnight.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) render();
});

route();
