/* ============================================================
   Habit Quest — app.js
   Vanilla JS. Talks to the Google Apps Script backend over JSON
   (POST text/plain to avoid CORS preflight) and renders the UI.
   ============================================================ */
'use strict';

// ---------------------------------------------------------------- config
const LS = {
  url: 'hq_api_url',
  token: 'hq_token',
  cache: 'hq_state_cache',
  tab: 'hq_last_tab'
};

let API_URL = localStorage.getItem(LS.url) || '';
let API_TOKEN = localStorage.getItem(LS.token) || '';
let STATE = null;
let currentTab = localStorage.getItem(LS.tab) || 'today';
let busy = false;

// ---------------------------------------------------------------- utils
const $ = (id) => document.getElementById(id);

function localToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function showToast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove('show'), 2600);
}

// ---------------------------------------------------------------- API
function parseApiResponse(text) {
  if (/^\s*</.test(text)) {
    const err = new Error('The URL returned a Google sign-in page instead of data.');
    err.code = 'LOGIN';
    throw err;
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    const err = new Error('Unexpected response from backend. Make sure the URL ends in /exec (not /dev).');
    err.code = 'BAD';
    throw err;
  }
  if (!data.ok) {
    const err = new Error(data.error || 'Request failed');
    err.code = 'API';
    throw err;
  }
  if (!data.habits || !data.user) {
    const err = new Error('The backend responded but is out of date. Re-copy backend/Code.gs into Apps Script and deploy a new version.');
    err.code = 'STALE';
    throw err;
  }
  return data;
}

async function postRequest(body) {
  const res = await fetch(API_URL, { method: 'POST', body, redirect: 'follow' });
  return parseApiResponse(await res.text());
}

async function getRequest(req) {
  const sep = API_URL.indexOf('?') === -1 ? '?' : '&';
  const url = API_URL + sep +
    'action=' + encodeURIComponent(req.action) +
    '&token=' + encodeURIComponent(req.token) +
    '&today=' + encodeURIComponent(req.today) +
    '&payload=' + encodeURIComponent(JSON.stringify(req.payload || {}));
  const res = await fetch(url, { method: 'GET', redirect: 'follow' });
  return parseApiResponse(await res.text());
}

async function api(action, payload = {}) {
  if (!API_URL) throw new Error('Backend not configured');
  const req = { action, token: API_TOKEN, today: localToday(), payload };
  try {
    return await postRequest(JSON.stringify(req));
  } catch (e) {
    if (e.code) throw e; // real backend error (token, login, bad URL…) → surface it
    // Otherwise it was a network/CORS failure of the POST → retry over GET.
    try {
      return await getRequest(req);
    } catch (e2) {
      if (e2.code) throw e2;
      const err = new Error('Could not reach the backend (.');
      err.code = 'NETWORK';
      throw err;
    }
  }
}

function saveConfig(url, token) {
  API_URL = url.trim();
  API_TOKEN = token.trim();
  localStorage.setItem(LS.url, API_URL);
  localStorage.setItem(LS.token, API_TOKEN);
}

// ---------------------------------------------------------------- state
function applyState(data, { fromNetwork = true } = {}) {
  STATE = data;
  if (fromNetwork) localStorage.setItem(LS.cache, JSON.stringify(data));
  render();
}

async function refresh() {
  try {
    const data = await api('getState');
    applyState(data);
  } catch (e) {
    // Offline / backend down: fall back to the last cached snapshot.
    const cached = localStorage.getItem(LS.cache);
    if (cached) {
      try {
        applyState(JSON.parse(cached), { fromNetwork: false });
        showToast('Showing offline data — changes need a connection');
      } catch (_) { /* ignore */ }
    } else {
      showToast(e.message);
    }
  }
}

async function mutate(action, payload) {
  if (busy) return null;
  busy = true;
  try {
    const data = await api(action, payload);
    applyState(data);
    return data;
  } catch (e) {
    showToast(e.message);
    return null;
  } finally {
    busy = false;
  }
}

// ---------------------------------------------------------------- confetti
const confettiCanvas = document.getElementById('confetti');
const cctx = confettiCanvas ? confettiCanvas.getContext('2d') : null;
let confettiParticles = [];
let confettiRAF = null;

function sizeCanvas() {
  if (!confettiCanvas) return;
  confettiCanvas.width = window.innerWidth;
  confettiCanvas.height = window.innerHeight;
}
window.addEventListener('resize', sizeCanvas);
sizeCanvas();

function burstConfetti(x, y, count = 70) {
  if (!cctx) return;
  const colors = ['#8b5cf6', '#f472b6', '#fbbf24', '#34d399', '#38bdf8', '#c4b5fd'];
  for (let i = 0; i < count; i++) {
    confettiParticles.push({
      x: x, y: y,
      vx: (Math.random() - 0.5) * 12,
      vy: (Math.random() - 0.9) * 12 - 2,
      size: 4 + Math.random() * 6,
      color: colors[(Math.random() * colors.length) | 0],
      life: 900 + Math.random() * 600,
      born: performance.now(),
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3
    });
  }
  if (!confettiRAF) confettiRAF = requestAnimationFrame(drawConfetti);
}

function drawConfetti(now) {
  cctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
  confettiParticles = confettiParticles.filter((p) => now - p.born < p.life);
  for (const p of confettiParticles) {
    p.vy += 0.35;
    p.x += p.vx;
    p.y += p.vy;
    p.rot += p.vr;
    const alpha = Math.max(0, 1 - (now - p.born) / p.life);
    cctx.save();
    cctx.globalAlpha = alpha;
    cctx.translate(p.x, p.y);
    cctx.rotate(p.rot);
    cctx.fillStyle = p.color;
    cctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
    cctx.restore();
  }
  if (confettiParticles.length) {
    confettiRAF = requestAnimationFrame(drawConfetti);
  } else {
    confettiRAF = null;
    cctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
  }
}

// ---------------------------------------------------------------- render
function render() {
  if (!STATE) return;
  renderChrome();
  renderToday();
  renderRewards();
  renderStats();
  renderSettings();
}

function renderChrome() {
  const u = STATE.user;
  $('chipStreak').textContent = u.streak;
  $('chipCoins').textContent = u.coins;
  $('chipLevel').textContent = u.level;
  $('userName').textContent = u.name;
  $('levelTitle').textContent = u.levelTitle;
  $('levelNum').textContent = u.level;

  // XP bar
  let pct = 100;
  let text = `${u.xp} XP · MAX LEVEL 🏆`;
  if (u.nextXp != null) {
    const span = u.nextXp - u.prevXp;
    const done = u.xp - u.prevXp;
    pct = Math.max(0, Math.min(100, (done / span) * 100));
    text = `${u.xp - u.prevXp} / ${span} XP to ${u.nextTitle}`;
  }
  $('xpFill').style.width = pct + '%';
  $('xpText').textContent = text;

  // Today ring
  const total = STATE.todayTotal || 0;
  const done = STATE.todayCompleted || 0;
  $('ringDone').textContent = done;
  $('ringTotal').textContent = total;
  const C = 2 * Math.PI * 42;
  const frac = total ? done / total : 0;
  const fg = $('ringFg');
  fg.style.strokeDasharray = C;
  fg.style.strokeDashoffset = C * (1 - frac);
  fg.style.stroke = frac >= 1 ? '#34d399' : '#8b5cf6';
}

function renderToday() {
  const list = $('todayList');
  list.innerHTML = '';

  const banner = $('todayBanner');
  if (STATE.perfectDay) {
    banner.classList.remove('hidden');
    banner.innerHTML = '🌈 Perfect day! Every habit done. Treat yourself!';
  } else {
    banner.classList.add('hidden');
  }

  if (!STATE.habits.length) {
    list.innerHTML = '<div class="habit-row"><div class="habit-info">' +
      '<div class="habit-name">No habits yet</div>' +
      '<div class="habit-meta">Add your first habit below to begin your quest.</div>' +
      '</div></div>';
    return;
  }

  STATE.habits.forEach((h) => {
    const done = !!STATE.todayLog[h.id];
    const row = document.createElement('div');
    row.className = 'habit-row' + (done ? ' done' : '');
    row.innerHTML =
      '<div class="habit-emoji">' + escapeHtml(h.emoji) + '</div>' +
      '<div class="habit-info">' +
        '<div class="habit-name">' + escapeHtml(h.name) + '</div>' +
        '<div class="habit-meta">' + escapeHtml(h.category) + ' · +' + h.xp + ' XP · +' + h.coins + ' 🪙</div>' +
      '</div>' +
      '<button class="habit-edit" aria-label="Edit habit">✎</button>' +
      '<button class="habit-check" aria-label="Toggle habit">' + (done ? '✓' : '') + '</button>';

    row.querySelector('.habit-edit').addEventListener('click', (ev) => {
      ev.stopPropagation();
      openEditHabitModal(h);
    });
    const btn = row.querySelector('.habit-check');
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      btn.classList.add('pop');
      toggleHabit(h, done, ev.clientX, ev.clientY);
    });
    list.appendChild(row);
  });
}

async function toggleHabit(habit, wasDone, x, y) {
  const data = await mutate('toggleHabit', { habitId: habit.id, date: localToday() });
  if (!data) return;

  if (!wasDone) {
    // Completing — celebrate immediately.
    burstConfetti(x || window.innerWidth / 2, y || window.innerHeight / 2);
    showToast(`+${habit.xp} XP   +${habit.coins} 🪙  ·  ${habit.name}`);
    celebrateLevel(data);
    celebrateAchievements(data);
  } else {
    showToast('Unchecked — XP removed');
  }
}

function celebrateLevel(data) {
  // Compare against previous level held on STATE before applyState? We only
  // have the new state here, so detect a level-up via a stored last level.
  const prev = Number(localStorage.getItem('hq_last_level') || '0');
  const now = data.user.level;
  if (prev && now > prev) {
    burstConfetti(window.innerWidth / 2, window.innerHeight * 0.35, 140);
    showToast(`🎉 LEVEL UP! You're now Level ${now} — ${data.user.levelTitle}!`);
  }
  localStorage.setItem('hq_last_level', String(now));
}

function celebrateAchievements(data) {
  if (data.newAchievements && data.newAchievements.length) {
    const names = data.newAchievements.map((a) => `${a.emoji} ${a.name}`).join(', ');
    setTimeout(() => {
      burstConfetti(window.innerWidth / 2, window.innerHeight * 0.35, 120);
      showToast(`🏅 Badge unlocked: ${names}`);
    }, 700);
  }
}


// ---------------------------------------------------------------- rewards
function renderRewards() {
  $('rewardCoins').textContent = STATE.user.coins;
  const list = $('rewardList');
  list.innerHTML = '';

  if (!STATE.rewards.length) {
    list.innerHTML = '<div class="reward-row"><div class="reward-info">' +
      '<div class="reward-name">No rewards yet</div>' +
      '<div class="reward-cost">Add something you actually want.</div>' +
      '</div></div>';
    return;
  }

  STATE.rewards.forEach((r) => {
    const affordable = STATE.user.coins >= r.cost;
    const row = document.createElement('div');
    row.className = 'reward-row';
    row.innerHTML =
      '<div class="reward-emoji">' + escapeHtml(r.emoji) + '</div>' +
      '<div class="reward-info">' +
        '<div class="reward-name">' + escapeHtml(r.name) + '</div>' +
        '<div class="reward-cost">🪙 ' + r.cost + ' coins</div>' +
      '</div>' +
      '<button class="redeem-btn"' + (affordable ? '' : ' disabled') + '>' +
        (affordable ? 'Redeem' : 'Locked') + '</button>';

    if (affordable) {
      row.querySelector('.redeem-btn').addEventListener('click', (ev) => {
        ev.stopPropagation();
        redeemReward(r, ev.clientX, ev.clientY);
      });
    }
    list.appendChild(row);
  });
}

async function redeemReward(reward, x, y) {
  const data = await mutate('redeemReward', { rewardId: reward.id });
  if (!data) return;
  burstConfetti(x || window.innerWidth / 2, y || window.innerHeight / 2, 110);
  showToast(`🎉 Enjoy your reward: ${reward.name}!`);
  celebrateAchievements(data);
}

// ---------------------------------------------------------------- stats
function renderStats() {
  const badges = STATE.achievements.filter((a) => a.earned).length;
  let total = 0;
  Object.values(STATE.history || {}).forEach((n) => { total += n; });
  $('statStreak').textContent = STATE.user.streak;
  $('statBest').textContent = STATE.user.bestStreak;
  $('statTotal').textContent = total;
  $('statBadges').textContent = badges;

  renderHeatmap();
  renderBadges();
}

function renderHeatmap() {
  const wrap = $('heatmap');
  wrap.innerHTML = '';
  const WEEKS = 20;
  const today = new Date(localToday() + 'T00:00:00');
  // Start on the Sunday such that we show WEEKS weeks ending this week.
  const start = new Date(today);
  start.setDate(start.getDate() - (WEEKS * 7 - 1));
  // align to Sunday
  start.setDate(start.getDate() - start.getDay());

  const counts = STATE.history || {};
  for (let i = 0; i < WEEKS * 7 + 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    if (d > today) break;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const n = counts[key] || 0;
    let lvl = 0;
    if (n >= 1) lvl = 1;
    if (n >= 2) lvl = 2;
    if (n >= 3) lvl = 3;
    if (n >= 4) lvl = 4;
    const cell = document.createElement('div');
    cell.className = 'heat-cell l' + lvl;
    cell.title = `${key}: ${n} completed`;
    wrap.appendChild(cell);
  }
}

function renderBadges() {
  const grid = $('badgeGrid');
  grid.innerHTML = '';
  STATE.achievements.forEach((a) => {
    const div = document.createElement('div');
    div.className = 'badge' + (a.earned ? ' earned' : '');
    div.innerHTML =
      '<div class="badge-emoji">' + escapeHtml(a.emoji) + '</div>' +
      '<div class="badge-name">' + escapeHtml(a.name) + '</div>' +
      '<div class="badge-desc">' + escapeHtml(a.desc) + '</div>';
    grid.appendChild(div);
  });
}

// ---------------------------------------------------------------- settings
function renderSettings() {
  $('nameInput').value = STATE.user.name;
  $('freezeCount').textContent = STATE.user.streakFreezes;
  $('freezeBtn').disabled = STATE.user.streakFreezes <= 0;
  $('freezeBtn').textContent = STATE.user.streakFreezes > 0
    ? 'Freeze yesterday'
    : 'No freezes — earn one weekly';
  $('geminiKeyInput').value = localStorage.getItem('hq_gemini_key') || '';
  $('geminiModelInput').value = localStorage.getItem('hq_gemini_model') || DEFAULT_GEMINI_MODEL;
  applyTheme(getTheme());
}

// ---------------------------------------------------------------- tabs
function showTab(tab) {
  currentTab = tab;
  localStorage.setItem(LS.tab, tab);
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.add('hidden'));
  const panel = $('tab-' + tab);
  if (panel) panel.classList.remove('hidden');
  document.querySelectorAll('.tab-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
}


// ---------------------------------------------------------------- modal
function openModal(html) {
  $('modalBody').innerHTML = html;
  $('modal').classList.remove('hidden');
}
function closeModal() {
  $('modal').classList.add('hidden');
  $('modalBody').innerHTML = '';
}

const HABIT_EMOJIS = ['💧', '🏃', '📚', '🧘', '🥗', '😴', '🚶', '🎸', '✍️', '🧹', '💪', '🎨', '🌞', '🦷', '📵', '🧠'];
const REWARD_EMOJIS = ['🎁', '📺', '☕', '🎮', '🍕', '🍫', '🛌', '🎬', '🛍️', '🎧', '🍦', '🌮'];

function emojiPicker(emojis, selected) {
  return emojis.map((e) =>
    `<button type="button" class="${e === selected ? 'sel' : ''}" data-emoji="${e}">${e}</button>`
  ).join('');
}

function wireEmojiPicker(wrapSelector, onPick) {
  document.querySelectorAll(wrapSelector + ' button').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll(wrapSelector + ' button').forEach((x) => x.classList.remove('sel'));
      b.classList.add('sel');
      onPick(b.dataset.emoji);
    });
  });
}

function openHabitModal() {
  let chosen = '💧';
  openModal(`
    <h2>New habit</h2>
    <label>Name
      <input id="mHabitName" type="text" maxlength="40" placeholder="e.g. Meditate 5 minutes" />
    </label>
    <label>Icon
      <div class="emoji-pick" id="mHabitEmoji">${emojiPicker(HABIT_EMOJIS, chosen)}</div>
    </label>
    <div class="row-2">
      <label>Category
        <input id="mHabitCat" type="text" maxlength="20" value="Health" />
      </label>
      <label>XP reward
        <input id="mHabitXp" type="number" min="1" max="100" value="10" />
      </label>
    </div>
    <label>Coins reward
      <input id="mHabitCoins" type="number" min="0" max="100" value="5" />
    </label>
    <button id="mHabitSave" class="primary-btn">Create habit</button>
  `);
  wireEmojiPicker('#mHabitEmoji', (e) => { chosen = e; });
  $('mHabitSave').addEventListener('click', async () => {
    const name = $('mHabitName').value.trim();
    if (!name) { showToast('Give your habit a name'); return; }
    const category = $('mHabitCat').value.trim() || 'General';
    const xp = Number($('mHabitXp').value) || 10;
    const coins = Number($('mHabitCoins').value) || 0;
    closeModal();
    const data = await mutate('addHabit', { name, emoji: chosen, category, xp, coins });
    if (data) showToast(`Added "${name}" ✨`);
  });
}

function openEditHabitModal(habit) {
  let chosen = habit.emoji || '✅';
  const emojis = HABIT_EMOJIS.includes(chosen) ? HABIT_EMOJIS : [chosen].concat(HABIT_EMOJIS);
  openModal(`
    <h2>Edit habit</h2>
    <label>Name
      <input id="eHabitName" type="text" maxlength="40" value="${escapeHtml(habit.name)}" />
    </label>
    <label>Icon
      <div class="emoji-pick" id="eHabitEmoji">${emojiPicker(emojis, chosen)}</div>
    </label>
    <div class="row-2">
      <label>Category
        <input id="eHabitCat" type="text" maxlength="20" value="${escapeHtml(habit.category)}" />
      </label>
      <label>XP reward
        <input id="eHabitXp" type="number" min="1" max="100" value="${habit.xp}" />
      </label>
    </div>
    <label>Coins reward
      <input id="eHabitCoins" type="number" min="0" max="100" value="${habit.coins}" />
    </label>
    <button id="eHabitSave" class="primary-btn">Save changes</button>
    <button id="eHabitDelete" class="danger-btn">Delete habit</button>
  `);
  wireEmojiPicker('#eHabitEmoji', (e) => { chosen = e; });

  $('eHabitSave').addEventListener('click', async () => {
    const name = $('eHabitName').value.trim();
    if (!name) { showToast('Give your habit a name'); return; }
    const category = $('eHabitCat').value.trim() || 'General';
    const xp = Number($('eHabitXp').value) || 10;
    const coins = Number($('eHabitCoins').value) || 0;
    closeModal();
    const data = await mutate('updateHabit', { id: habit.id, name, emoji: chosen, category, xp, coins });
    if (data) showToast('Habit updated ✨');
  });

  $('eHabitDelete').addEventListener('click', async () => {
    if (!confirm(`Archive "${habit.name}"? Your completion history is kept.`)) return;
    closeModal();
    const data = await mutate('deleteHabit', { id: habit.id });
    if (data) showToast('Habit archived');
  });
}

function openRewardModal() {
  let chosen = '🎁';
  openModal(`
    <h2>New reward</h2>
    <label>Reward name
      <input id="mRewardName" type="text" maxlength="40" placeholder="e.g. 30 min of gaming" />
    </label>
    <label>Icon
      <div class="emoji-pick" id="mRewardEmoji">${emojiPicker(REWARD_EMOJIS, chosen)}</div>
    </label>
    <label>Coin cost
      <input id="mRewardCost" type="number" min="1" max="100000" value="100" />
    </label>
    <button id="mRewardSave" class="primary-btn">Create reward</button>
  `);
  wireEmojiPicker('#mRewardEmoji', (e) => { chosen = e; });
  $('mRewardSave').addEventListener('click', async () => {
    const name = $('mRewardName').value.trim();
    if (!name) { showToast('Give your reward a name'); return; }
    const cost = Number($('mRewardCost').value) || 100;
    closeModal();
    const data = await mutate('addReward', { name, emoji: chosen, cost });
    if (data) showToast(`Reward "${name}" added 🎁`);
  });
}


// ---------------------------------------------------------------- theme
function getTheme() {
  return localStorage.getItem('hq_theme') || 'dark';
}

function applyTheme(theme) {
  localStorage.setItem('hq_theme', theme);
  document.documentElement.setAttribute('data-theme', theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#f6f4ff' : '#0f0a1f');
  const d = $('themeDark');
  const l = $('themeLight');
  if (d && l) {
    d.classList.toggle('active', theme === 'dark');
    l.classList.toggle('active', theme === 'light');
  }
}

// ---------------------------------------------------------------- AI coach (Gemini)
const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash';

function buildCoachPrompt() {
  const u = STATE.user;
  const total = STATE.todayTotal;
  const done = STATE.todayCompleted;
  const remaining = STATE.habits.filter((h) => !STATE.todayLog[h.id]).map((h) => h.name);
  const lines = [
    'You are an upbeat, ADHD-friendly habit coach inside a gamified app called Habit Quest.',
    `The user's name is ${u.name}. Level ${u.level} (${u.levelTitle}), ${u.xp} XP, ${u.coins} coins.`,
    `Current streak: ${u.streak} days (personal best ${u.bestStreak}).`,
    `Today they completed ${done} of ${total} habits.`,
    remaining.length
      ? `Still to do today: ${remaining.join(', ')}.`
      : `They already finished every habit today — celebrate that!`
  ];
  lines.push('Give a SHORT, energetic pep talk of 2-4 sentences, then ONE tiny concrete next action.');
  lines.push('Be warm and specific, never preachy. Use at most one emoji. Plain text only, no markdown.');
  return lines.join('\n');
}

async function callGemini(key, prompt) {
  const model = localStorage.getItem('hq_gemini_model') || DEFAULT_GEMINI_MODEL;
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
    encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(key);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.95, maxOutputTokens: 260 }
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data.error && data.error.message) || ('HTTP ' + res.status));
  }
  const cand = data.candidates && data.candidates[0];
  const parts = cand && cand.content && cand.content.parts;
  const text = parts ? parts.map((p) => p.text || '').join('') : '';
  if (!text.trim()) throw new Error('Gemini returned an empty response');
  return text.trim();
}

function askCoach() {
  const key = localStorage.getItem('hq_gemini_key') || '';
  if (!key) { openCoachKeyModal(); return; }
  runCoach(key);
}

function openCoachKeyModal() {
  openModal(`
    <h2>🤖 Set up your coach</h2>
    <p class="muted small">Add a free Gemini API key from <b>aistudio.google.com/app/apikey</b>. It's stored only on this device and never sent to our servers.</p>
    <label>Gemini API key
      <input id="coachKeyInput" type="password" placeholder="AIza…" autocomplete="off" />
    </label>
    <button id="coachKeySave" class="primary-btn">Save &amp; get a pep talk</button>
  `);
  $('coachKeySave').addEventListener('click', () => {
    const k = $('coachKeyInput').value.trim();
    if (!k) { showToast('Paste your API key first'); return; }
    localStorage.setItem('hq_gemini_key', k);
    closeModal();
    runCoach(k);
  });
}

async function runCoach(key) {
  openModal('<h2>🤖 Your coach</h2><div class="coach-loading">Thinking…</div>');
  try {
    const text = await callGemini(key, buildCoachPrompt());
    $('modalBody').innerHTML =
      '<h2>🤖 Your coach</h2>' +
      '<div class="coach-msg">' + escapeHtml(text) + '</div>' +
      '<button id="coachAgain" class="ghost-btn">One more pep talk</button>';
    burstConfetti(window.innerWidth / 2, window.innerHeight * 0.35, 50);
    $('coachAgain').addEventListener('click', () => runCoach(key));
  } catch (e) {
    $('modalBody').innerHTML =
      '<h2>🤖 Your coach</h2>' +
      '<div class="coach-msg error">Couldn\'t reach Gemini: ' + escapeHtml(e.message) + '</div>' +
      '<button id="coachRetry" class="primary-btn">Try again</button>';
    $('coachRetry').addEventListener('click', () => runCoach(key));
  }
}

// ---------------------------------------------------------------- setup flow
function showSetup() {
  $('setupScreen').classList.remove('hidden');
  $('app').classList.add('hidden');
  $('setupUrl').value = API_URL;
  $('setupToken').value = API_TOKEN;
}

async function tryConnect() {
  const url = $('setupUrl').value.trim();
  const token = $('setupToken').value.trim();
  const status = $('setupStatus');
  if (!url || !token) {
    status.textContent = 'Enter both the URL and token.';
    status.className = 'setup-status error';
    return;
  }
  status.textContent = 'Connecting…';
  status.className = 'setup-status';
  saveConfig(url, token);
  try {
    const data = await api('getState');
    applyState(data);
    localStorage.setItem('hq_last_level', String(data.user.level));
    status.textContent = 'Connected! 🎉';
    status.className = 'setup-status ok';
    $('setupScreen').classList.add('hidden');
    $('app').classList.remove('hidden');
    showTab(currentTab);
  } catch (e) {
    let msg = 'Could not connect: ' + e.message;
    if (e.code === 'NETWORK') {
      msg = 'Couldn’t reach the script. In Apps Script set “Who has access” to “Anyone” (Execute as: Me), and use the /exec Web App URL.';
    } else if (e.code === 'LOGIN') {
      msg = 'The URL is asking for a Google sign-in. Redeploy the Web App with “Who has access: Anyone”.';
    } else if (e.code === 'BAD') {
      msg = 'That URL didn’t return valid data. Copy the /exec Web App URL (not /dev) and try again.';
    } else if (e.code === 'STALE') {
      msg = e.message;
    } else if (e.code === 'API') {
      msg = 'Backend says: ' + e.message;
    }
    status.textContent = msg;
    status.className = 'setup-status error';
  }
}

// ---------------------------------------------------------------- wiring
function wireEvents() {
  // Setup
  $('setupConnect').addEventListener('click', tryConnect);

  // Tabs
  document.querySelectorAll('.tab-btn').forEach((b) => {
    b.addEventListener('click', () => showTab(b.dataset.tab));
  });

  // Add buttons
  $('addHabitBtn').addEventListener('click', openHabitModal);
  $('addRewardBtn').addEventListener('click', openRewardModal);

  // Modal
  $('modalClose').addEventListener('click', closeModal);
  $('modal').addEventListener('click', (e) => {
    if (e.target.id === 'modal') closeModal();
  });

  // Settings
  $('saveNameBtn').addEventListener('click', async () => {
    const name = $('nameInput').value.trim();
    if (!name) return;
    const data = await mutate('setName', { name });
    if (data) showToast('Name saved ✨');
  });

  $('freezeBtn').addEventListener('click', async () => {
    const data = await mutate('useStreakFreeze', {});
    if (data) showToast('❄️ Streak protected for a missed day');
  });

  $('reconfigBtn').addEventListener('click', showSetup);

  // Coach
  $('coachBtn').addEventListener('click', askCoach);

  // Theme
  $('themeDark').addEventListener('click', () => applyTheme('dark'));
  $('themeLight').addEventListener('click', () => applyTheme('light'));

  // Gemini coach settings
  $('saveGeminiBtn').addEventListener('click', () => {
    const key = $('geminiKeyInput').value.trim();
    const model = $('geminiModelInput').value.trim() || DEFAULT_GEMINI_MODEL;
    localStorage.setItem('hq_gemini_key', key);
    localStorage.setItem('hq_gemini_model', model);
    showToast(key ? 'Coach ready 🤖' : 'Coach key cleared');
  });
}

// ---------------------------------------------------------------- init
async function init() {
  applyTheme(getTheme());
  wireEvents();
  showTab(currentTab);

  if (API_URL && API_TOKEN) {
    $('app').classList.remove('hidden');
    $('setupScreen').classList.add('hidden');
    await refresh();
    localStorage.setItem('hq_last_level', String(STATE ? STATE.user.level : 0));
  } else {
    showSetup();
  }

  // Register service worker for installable / offline shell (ignored on file://)
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

document.addEventListener('DOMContentLoaded', init);

