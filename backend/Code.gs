/**
 * Habit Quest — Google Apps Script backend
 * ---------------------------------------------------------------------------
 * WHAT THIS DOES
 *   Acts as a tiny JSON API for the Habit Quest PWA. All data is stored in a
 *   Google Sheet, which means Google Gemini can read/write it natively and you
 *   can sync across every device for free.
 *
 * QUICK SETUP (see ../README.md for the full walkthrough)
 *   1. Create a Google Sheet.
 *   2. Extensions > Apps Script, paste this whole file in.
 *   3. Change API_TOKEN below to a long random string.
 *   4. Deploy > New deployment > Web app
 *        - Execute as: Me
 *        - Who has access: Anyone
 *   5. Copy the Web app URL + your token into the app's Setup screen.
 * ---------------------------------------------------------------------------
 */

// 1) CHANGE THIS to a long random secret. Paste the same value in the app.
const API_TOKEN = 'change-me-to-a-long-random-token';

// 2) OPTIONAL: if this script is NOT bound to the sheet (standalone), set the
//    spreadsheet ID here. Leave '' when using Extensions > Apps Script.
const SHEET_ID = '';

// ---------------------------------------------------------------------------
// Configuration: levels & achievements. Tweak freely — the app reads these.
// ---------------------------------------------------------------------------
const LEVELS = [
  { level: 1,  title: 'Rookie',        xp: 0 },
  { level: 2,  title: 'Beginner',      xp: 100 },
  { level: 3,  title: 'Apprentice',    xp: 250 },
  { level: 4,  title: 'Consistent',    xp: 500 },
  { level: 5,  title: 'Steady',        xp: 900 },
  { level: 6,  title: 'Strong',        xp: 1400 },
  { level: 7,  title: 'Habit Hero',    xp: 2000 },
  { level: 8,  title: 'Champion',      xp: 2800 },
  { level: 9,  title: 'Legend',        xp: 3800 },
  { level: 10, title: 'Unstoppable',   xp: 5000 },
  { level: 11, title: 'Mythic',        xp: 7000 },
  { level: 12, title: 'Transcendent',  xp: 10000 }
];

const ACHIEVEMENT_DEFS = [
  { code: 'first_step',   name: 'First Step',        desc: 'Complete your first habit',        emoji: '👣', check: c => c.totalCompletions >= 1 },
  { code: 'getting_going',name: 'Getting Going',     desc: 'Complete 10 habits',               emoji: '🌱', check: c => c.totalCompletions >= 10 },
  { code: 'half_century', name: 'Half Century',      desc: 'Complete 50 habits',               emoji: '🔥', check: c => c.totalCompletions >= 50 },
  { code: 'centurion',    name: 'Centurion',         desc: 'Complete 100 habits',              emoji: '💯', check: c => c.totalCompletions >= 100 },
  { code: 'streak_3',     name: 'On a Roll',         desc: 'Reach a 3-day streak',             emoji: '✨', check: c => c.streak >= 3 },
  { code: 'streak_7',     name: 'Week Warrior',      desc: 'Reach a 7-day streak',             emoji: '🗓️', check: c => c.streak >= 7 },
  { code: 'streak_14',    name: 'Fortnight Fighter', desc: 'Reach a 14-day streak',            emoji: '⚡', check: c => c.streak >= 14 },
  { code: 'streak_30',    name: 'Monthly Master',    desc: 'Reach a 30-day streak',            emoji: '🏆', check: c => c.streak >= 30 },
  { code: 'streak_100',   name: 'Century Streak',    desc: 'Reach a 100-day streak',           emoji: '👑', check: c => c.streak >= 100 },
  { code: 'level_5',      name: 'Consistent',        desc: 'Reach level 5',                    emoji: '🎖️', check: c => c.level >= 5 },
  { code: 'level_10',     name: 'Unstoppable',       desc: 'Reach level 10',                   emoji: '💎', check: c => c.level >= 10 },
  { code: 'perfect_day',  name: 'Perfect Day',       desc: 'Complete every habit in a day',    emoji: '🌈', check: c => c.perfectDay },
  { code: 'first_reward', name: 'Treat Yourself',    desc: 'Redeem your first reward',         emoji: '🎁', check: c => c.redemptionsCount >= 1 }
];

// Sheet schema (tab name -> header row). Auto-created on first run.
const SCHEMAS = {
  Habits:       ['id', 'name', 'emoji', 'category', 'xp', 'coins', 'target', 'active', 'order', 'created_at'],
  Log:          ['id', 'habitId', 'date', 'completed', 'xp', 'coins', 'timestamp'],
  Rewards:      ['id', 'name', 'emoji', 'cost', 'active', 'created_at'],
  Redemptions:  ['id', 'rewardId', 'date', 'cost', 'timestamp'],
  Achievements: ['code', 'name', 'dateEarned'],
  User:         ['key', 'value']
};

// ---------------------------------------------------------------------------
// HTTP entry points
// ---------------------------------------------------------------------------
function doGet(e) {
  try {
    var params = (e && e.parameter) || {};
    // No action → simple health check (open the /exec URL in a browser to test).
    if (!params.action) {
      return respond({ ok: true, service: 'Habit Quest API', message: 'API is running 🎮' });
    }
    if (params.token !== API_TOKEN) {
      return respond({ ok: false, error: 'Invalid token' });
    }
    var today = params.today || todayStr();
    var payload = {};
    if (params.payload) {
      try { payload = JSON.parse(params.payload); } catch (err) { payload = {}; }
    }
    return respond(handleAction(params.action, payload, today));
  } catch (err) {
    return respond({ ok: false, error: String(err && err.stack ? err.stack : err) });
  }
}

function doPost(e) {
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }
    if (body.token !== API_TOKEN) {
      return respond({ ok: false, error: 'Invalid token' });
    }
    var today = body.today || todayStr();
    var payload = body.payload || {};
    return respond(handleAction(body.action, payload, today));
  } catch (err) {
    return respond({ ok: false, error: String(err && err.stack ? err.stack : err) });
  }
}

function respond(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleAction(action, payload, today) {
  switch (action) {
    case 'getState':        return buildState(today);
    case 'addHabit':        return addHabit(payload, today);
    case 'updateHabit':     return updateHabit(payload, today);
    case 'deleteHabit':     return deleteHabit(payload, today);
    case 'toggleHabit':     return toggleHabit(payload, today);
    case 'addReward':       return addReward(payload, today);
    case 'updateReward':    return updateReward(payload, today);
    case 'deleteReward':    return deleteReward(payload, today);
    case 'redeemReward':    return redeemReward(payload, today);
    case 'useStreakFreeze': return useStreakFreeze(payload, today);
    case 'setName':         return setName(payload, today);
    default:                return { ok: false, error: 'Unknown action: ' + action };
  }
}

// ---------------------------------------------------------------------------
// Sheet helpers
// ---------------------------------------------------------------------------
function getSS() {
  return SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet(name, headers) {
  var ss = getSS();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
  }
  return sh;
}

function ensureSheets() {
  Object.keys(SCHEMAS).forEach(function (name) { getSheet(name, SCHEMAS[name]); });
}

/** Read a sheet into an array of row objects (with _row = sheet row number). */
function toObjects(sh) {
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0];
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var o = { _row: i + 1 };
    for (var j = 0; j < headers.length; j++) {
      o[headers[j]] = values[i][j];
    }
    out.push(o);
  }
  return out;
}

function columnMap(sh) {
  var headers = sh.getDataRange().getValues()[0];
  var col = {};
  headers.forEach(function (h, i) { col[h] = i + 1; });
  return col;
}


// ---------------------------------------------------------------------------
// User (key/value) store
// ---------------------------------------------------------------------------
function getUser() {
  var objs = toObjects(getSheet('User', SCHEMAS.User));
  var u = {};
  objs.forEach(function (o) { u[o.key] = o.value; });
  return u;
}

function setUserValue(key, value) {
  var sh = getSheet('User', SCHEMAS.User);
  var values = sh.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (values[i][0] === key) {
      sh.getRange(i + 1, 2).setValue(value);
      return;
    }
  }
  sh.appendRow([key, value]);
}

function ensureUserDefaults() {
  var u = getUser();
  var defaults = {
    name: 'Habit Hero',
    xp: 0,
    coins: 0,
    level: 1,
    streakFreezes: 1,
    frozenDates: '[]',
    lastFreezeGrant: todayStr(),
    createdAt: new Date().toISOString()
  };
  Object.keys(defaults).forEach(function (k) {
    if (u[k] === undefined || u[k] === '') {
      setUserValue(k, defaults[k]);
      u[k] = defaults[k];
    }
  });
  return u;
}

function adjustXp(delta) {
  var u = getUser();
  setUserValue('xp', Math.max(0, (Number(u.xp) || 0) + delta));
}

function adjustCoins(delta) {
  var u = getUser();
  setUserValue('coins', Math.max(0, (Number(u.coins) || 0) + delta));
}

function recalcLevel() {
  var u = getUser();
  setUserValue('level', levelForXp(Number(u.xp) || 0).level);
}

// ---------------------------------------------------------------------------
// Date & value helpers
// ---------------------------------------------------------------------------
function todayStr() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

/** Normalise anything (Date or string) to a yyyy-MM-dd string. */
function normDate(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(v).slice(0, 10);
}

function addDays(dateStr, n) {
  var p = normDate(dateStr).split('-');
  var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  d.setDate(d.getDate() + n);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function daysBetween(a, b) {
  var da = new Date(normDate(a) + 'T00:00:00');
  var db = new Date(normDate(b) + 'T00:00:00');
  return Math.round((db - da) / 86400000);
}

function isNextDay(a, b) {
  return addDays(a, 1) === normDate(b);
}

function isTrue(v) {
  return v === true || v === 'TRUE' || v === 'true' || v === 1 || v === '1';
}

function parseFrozen(raw) {
  if (!raw) return [];
  if (raw instanceof Array) return raw.map(normDate);
  try {
    var arr = JSON.parse(String(raw));
    return Array.isArray(arr) ? arr.map(normDate) : [];
  } catch (e) {
    return String(raw).split(',').map(function (s) { return normDate(s.trim()); }).filter(Boolean);
  }
}

function levelForXp(xp) {
  var cur = LEVELS[0];
  var next = null;
  for (var i = 0; i < LEVELS.length; i++) {
    if (xp >= LEVELS[i].xp) {
      cur = LEVELS[i];
      next = LEVELS[i + 1] || null;
    }
  }
  return {
    level: cur.level,
    title: cur.title,
    prevXp: cur.xp,
    nextXp: next ? next.xp : null,
    nextTitle: next ? next.title : null
  };
}


// ---------------------------------------------------------------------------
// Streaks
// ---------------------------------------------------------------------------
/** Build a set of "active" dates (completed any habit, or frozen). */
function activeDateSet(logs, frozenDates) {
  var active = {};
  logs.forEach(function (l) { if (isTrue(l.completed)) active[normDate(l.date)] = true; });
  (frozenDates || []).forEach(function (d) { active[normDate(d)] = true; });
  return active;
}

/** Current streak. Today not yet active => start counting from yesterday. */
function computeStreak(logs, frozenDates, today) {
  var active = activeDateSet(logs, frozenDates);
  var start = normDate(today);
  if (!active[start]) {
    var yest = addDays(start, -1);
    if (!active[yest]) return 0;
    start = yest;
  }
  var count = 0;
  var d = start;
  while (active[d]) {
    count++;
    d = addDays(d, -1);
  }
  return count;
}

/** Longest run of consecutive active dates ever. */
function computeBestStreak(logs, frozenDates) {
  var active = activeDateSet(logs, frozenDates);
  var dates = Object.keys(active).sort();
  var best = 0, cur = 0, prev = null;
  dates.forEach(function (d) {
    if (prev && isNextDay(prev, d)) cur++; else cur = 1;
    if (cur > best) best = cur;
    prev = d;
  });
  return best;
}

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------
function evaluateAchievements(ctx) {
  var sh = getSheet('Achievements', SCHEMAS.Achievements);
  var earned = toObjects(sh);
  var earnedCodes = {};
  earned.forEach(function (e) { earnedCodes[e.code] = true; });
  var newly = [];
  ACHIEVEMENT_DEFS.forEach(function (def) {
    if (!earnedCodes[def.code] && def.check(ctx)) {
      sh.appendRow([def.code, def.name, new Date().toISOString()]);
      newly.push({ code: def.code, name: def.name, desc: def.desc, emoji: def.emoji });
    }
  });
  return newly;
}

// ---------------------------------------------------------------------------
// Build the full state object returned to the client
// ---------------------------------------------------------------------------
function buildState(today) {
  ensureSheets();
  var user = ensureUserDefaults();
  ensureSeeded();

  var habits = toObjects(getSheet('Habits', SCHEMAS.Habits))
    .filter(function (h) { return isTrue(h.active); })
    .sort(function (a, b) { return (Number(a.order) || 0) - (Number(b.order) || 0); })
    .map(function (h) {
      return {
        id: String(h.id),
        name: String(h.name),
        emoji: h.emoji || '✅',
        category: h.category || 'General',
        xp: Number(h.xp) || 10,
        coins: Number(h.coins) || 5,
        target: Number(h.target) || 1
      };
    });

  var logs = toObjects(getSheet('Log', SCHEMAS.Log));
  var frozenDates = parseFrozen(user.frozenDates);

  // Grant one streak freeze per week, capped at 3.
  var freezes = Number(user.streakFreezes) || 0;
  var lastGrant = user.lastFreezeGrant ? normDate(user.lastFreezeGrant) : today;
  if (daysBetween(lastGrant, today) >= 7 && freezes < 3) {
    freezes = Math.min(3, freezes + 1);
    setUserValue('streakFreezes', freezes);
    setUserValue('lastFreezeGrant', today);
  }

  var xp = Number(user.xp) || 0;
  var coins = Number(user.coins) || 0;
  var lvl = levelForXp(xp);

  var todayLog = {};
  var completionsByDate = {};
  var totalCompletions = 0;
  logs.forEach(function (l) {
    if (!isTrue(l.completed)) return;
    var d = normDate(l.date);
    completionsByDate[d] = (completionsByDate[d] || 0) + 1;
    totalCompletions++;
    if (d === normDate(today)) todayLog[String(l.habitId)] = true;
  });

  var streak = computeStreak(logs, frozenDates, today);
  var bestStreak = computeBestStreak(logs, frozenDates);
  var todayCompleted = habits.filter(function (h) { return todayLog[h.id]; }).length;
  var perfectDay = habits.length > 0 && todayCompleted === habits.length;
  var redemptions = toObjects(getSheet('Redemptions', SCHEMAS.Redemptions));

  var ctx = {
    totalCompletions: totalCompletions,
    streak: streak,
    bestStreak: bestStreak,
    level: lvl.level,
    xp: xp,
    perfectDay: perfectDay,
    redemptionsCount: redemptions.length
  };
  var newlyEarned = evaluateAchievements(ctx);

  var achRows = toObjects(getSheet('Achievements', SCHEMAS.Achievements));
  var earnedMap = {};
  achRows.forEach(function (a) { earnedMap[a.code] = a.dateEarned; });
  var achievements = ACHIEVEMENT_DEFS.map(function (def) {
    return {
      code: def.code, name: def.name, desc: def.desc, emoji: def.emoji,
      earned: !!earnedMap[def.code], dateEarned: earnedMap[def.code] || null
    };
  });

  var rewards = toObjects(getSheet('Rewards', SCHEMAS.Rewards))
    .filter(function (r) { return isTrue(r.active); })
    .map(function (r) {
      return { id: String(r.id), name: String(r.name), emoji: r.emoji || '🎁', cost: Number(r.cost) || 50 };
    });

  return {
    ok: true,
    today: normDate(today),
    habits: habits,
    todayLog: todayLog,
    user: {
      name: user.name || 'Habit Hero',
      xp: xp,
      level: lvl.level,
      levelTitle: lvl.title,
      prevXp: lvl.prevXp,
      nextXp: lvl.nextXp,
      nextTitle: lvl.nextTitle,
      coins: coins,
      streak: streak,
      bestStreak: bestStreak,
      streakFreezes: freezes
    },
    rewards: rewards,
    achievements: achievements,
    history: completionsByDate,
    newAchievements: newlyEarned,
    todayCompleted: todayCompleted,
    todayTotal: habits.length,
    perfectDay: perfectDay
  };
}


// ---------------------------------------------------------------------------
// Habit actions
// ---------------------------------------------------------------------------
function addHabit(p, today) {
  var sh = getSheet('Habits', SCHEMAS.Habits);
  var id = Utilities.getUuid();
  var order = toObjects(sh).length + 1;
  sh.appendRow([
    id,
    p.name || 'New Habit',
    p.emoji || '✅',
    p.category || 'General',
    Number(p.xp) || 10,
    Number(p.coins) || 5,
    Number(p.target) || 1,
    true,
    order,
    new Date().toISOString()
  ]);
  return buildState(today);
}

function updateHabit(p, today) {
  var sh = getSheet('Habits', SCHEMAS.Habits);
  var rows = toObjects(sh);
  var target = rows.filter(function (r) { return String(r.id) === String(p.id); })[0];
  if (!target) return { ok: false, error: 'Habit not found' };
  var col = columnMap(sh);
  var updates = {
    name: p.name, emoji: p.emoji, category: p.category, xp: p.xp,
    coins: p.coins, target: p.target, active: p.active, order: p.order
  };
  Object.keys(updates).forEach(function (k) {
    if (updates[k] !== undefined && col[k]) {
      sh.getRange(target._row, col[k]).setValue(updates[k]);
    }
  });
  return buildState(today);
}

function deleteHabit(p, today) {
  return updateHabit({ id: p.id, active: false }, today);
}

function toggleHabit(p, today) {
  var logSh = getSheet('Log', SCHEMAS.Log);
  var habit = toObjects(getSheet('Habits', SCHEMAS.Habits))
    .filter(function (h) { return String(h.id) === String(p.habitId); })[0];
  if (!habit) return { ok: false, error: 'Habit not found' };

  var date = normDate(p.date || today);
  var logs = toObjects(logSh);
  var existing = logs.filter(function (l) {
    return String(l.habitId) === String(p.habitId) && normDate(l.date) === date;
  })[0];

  var xpVal = Number(habit.xp) || 10;
  var coinVal = Number(habit.coins) || 5;
  var col = columnMap(logSh);

  if (existing) {
    var nowCompleted = !isTrue(existing.completed);
    logSh.getRange(existing._row, col.completed).setValue(nowCompleted);
    logSh.getRange(existing._row, col.timestamp).setValue(new Date().toISOString());
    if (nowCompleted) { adjustXp(xpVal); adjustCoins(coinVal); }
    else { adjustXp(-xpVal); adjustCoins(-coinVal); }
  } else {
    logSh.appendRow([Utilities.getUuid(), p.habitId, date, true, xpVal, coinVal, new Date().toISOString()]);
    adjustXp(xpVal);
    adjustCoins(coinVal);
  }

  recalcLevel();
  return buildState(today);
}

// ---------------------------------------------------------------------------
// Reward actions
// ---------------------------------------------------------------------------
function addReward(p, today) {
  getSheet('Rewards', SCHEMAS.Rewards).appendRow([
    Utilities.getUuid(),
    p.name || 'Treat',
    p.emoji || '🎁',
    Number(p.cost) || 50,
    true,
    new Date().toISOString()
  ]);
  return buildState(today);
}

function updateReward(p, today) {
  var sh = getSheet('Rewards', SCHEMAS.Rewards);
  var target = toObjects(sh).filter(function (r) { return String(r.id) === String(p.id); })[0];
  if (!target) return { ok: false, error: 'Reward not found' };
  var col = columnMap(sh);
  var updates = { name: p.name, emoji: p.emoji, cost: p.cost, active: p.active };
  Object.keys(updates).forEach(function (k) {
    if (updates[k] !== undefined && col[k]) {
      sh.getRange(target._row, col[k]).setValue(updates[k]);
    }
  });
  return buildState(today);
}

function deleteReward(p, today) {
  return updateReward({ id: p.id, active: false }, today);
}

function redeemReward(p, today) {
  var reward = toObjects(getSheet('Rewards', SCHEMAS.Rewards))
    .filter(function (r) { return String(r.id) === String(p.rewardId); })[0];
  if (!reward) return { ok: false, error: 'Reward not found' };

  var cost = Number(reward.cost) || 0;
  var u = getUser();
  var coins = Number(u.coins) || 0;
  if (coins < cost) return { ok: false, error: 'Not enough coins (need ' + cost + ')' };

  adjustCoins(-cost);
  getSheet('Redemptions', SCHEMAS.Redemptions).appendRow([
    Utilities.getUuid(), p.rewardId, today, cost, new Date().toISOString()
  ]);
  return buildState(today);
}

// ---------------------------------------------------------------------------
// Misc actions
// ---------------------------------------------------------------------------
function useStreakFreeze(p, today) {
  var u = ensureUserDefaults();
  var freezes = Number(u.streakFreezes) || 0;
  if (freezes <= 0) return { ok: false, error: 'No streak freezes available' };

  var frozen = parseFrozen(u.frozenDates);
  var date = normDate(p.date || addDays(today, -1));

  var logs = toObjects(getSheet('Log', SCHEMAS.Log));
  var hasCompletion = logs.some(function (l) {
    return isTrue(l.completed) && normDate(l.date) === date;
  });
  if (hasCompletion) return { ok: false, error: 'That day already has a completion' };

  if (frozen.indexOf(date) === -1) frozen.push(date);
  setUserValue('streakFreezes', freezes - 1);
  setUserValue('frozenDates', JSON.stringify(frozen));
  return buildState(today);
}

function setName(p, today) {
  setUserValue('name', p.name || 'Habit Hero');
  return buildState(today);
}


// ---------------------------------------------------------------------------
// One-time starter content so the app is never empty on first launch.
// ---------------------------------------------------------------------------
function ensureSeeded() {
  var u = getUser();
  if (isTrue(u.seeded)) return;

  var habitSh = getSheet('Habits', SCHEMAS.Habits);
  if (toObjects(habitSh).length === 0) {
    var now = new Date().toISOString();
    habitSh.appendRow([Utilities.getUuid(), 'Drink water',     '💧', 'Health', 10, 5, 1, true, 1, now]);
    habitSh.appendRow([Utilities.getUuid(), 'Move your body',  '🏃', 'Health', 15, 8, 1, true, 2, now]);
    habitSh.appendRow([Utilities.getUuid(), 'Read 10 minutes', '📚', 'Growth', 10, 5, 1, true, 3, now]);
  }

  var rewardSh = getSheet('Rewards', SCHEMAS.Rewards);
  if (toObjects(rewardSh).length === 0) {
    var t = new Date().toISOString();
    rewardSh.appendRow([Utilities.getUuid(), 'Watch an episode',       '📺', 100, true, t]);
    rewardSh.appendRow([Utilities.getUuid(), 'Favourite coffee',       '☕', 300, true, t]);
    rewardSh.appendRow([Utilities.getUuid(), 'Guilt-free gaming hour', '🎮', 500, true, t]);
  }

  setUserValue('seeded', true);
}

