(function () {
  'use strict';
  window.MP = window.MP || {};

  var KEY = 'mallowpop.save.v1';

  // One goal per tier each day: 1 = warm-up (adds up over runs), 2 = one good run, 3 = skill.
  var GOAL_POOL = [
    { id: 'walls', tier: 1, min: 15, max: 30, step: 5 },
    { id: 'lollis', tier: 1, min: 3, max: 6, step: 1 },
    { id: 'taffy', tier: 1, min: 5, max: 10, step: 1 },
    { id: 'total', tier: 1, min: 40, max: 80, step: 10 },
    { id: 'daily', tier: 1, min: 1, max: 1, step: 1 },
    { id: 'gates', tier: 2, min: 20, max: 45, step: 5 },
    { id: 'score', tier: 2, min: 100, max: 300, step: 50 },
    { id: 'perfects', tier: 2, min: 5, max: 10, step: 1 },
    { id: 'lolli1', tier: 2, min: 2, max: 3, step: 1 },
    { id: 'combo', tier: 3, min: 3, max: 5, step: 1 },
    { id: 'streak', tier: 3, min: 5, max: 8, step: 1 },
    { id: 'snaps', tier: 3, min: 2, max: 3, step: 1 },
    { id: 'rush', tier: 3, min: 1, max: 1, step: 1 }
  ];

  var GOAL_TEXT = {
    walls: 'Smash {n} walls',
    lollis: 'Grab {n} lollipops',
    taffy: 'Clear {n} taffy bars',
    total: 'Pass {n} gates in total',
    daily: 'Play the Daily Run',
    gates: 'Pass {n} gates in one run',
    score: 'Score {n} in one run',
    perfects: 'Get {n} PERFECTs in one run',
    lolli1: 'Grab {n} lollipops in one run',
    combo: 'Reach combo x{n}',
    streak: 'Get {n} PERFECTs in a row',
    snaps: 'SNAP {n} taffy bars in one run',
    rush: 'Start a Sugar Rush'
  };
  // goal id -> [stat name, adds up across runs?]
  var GOAL_STAT = {
    walls: ['walls', 1], lollis: ['lollis', 1], taffy: ['taffy', 1], total: ['gatesDelta', 1], daily: ['daily', 0],
    gates: ['gates', 0], score: ['score', 0], perfects: ['perfects', 0], lolli1: ['lollisRun', 0],
    combo: ['combo', 0], streak: ['streak', 0], snaps: ['snaps', 0], rush: ['rush', 0]
  };

  var memory = null;
  var cache = null;
  var persistent = true;

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(a) {
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeGoals(dateStr) {
    var rnd = mulberry32(hashStr('goals:' + dateStr));
    var list = [];
    for (var tier = 1; tier <= 3; tier++) {
      var pool = GOAL_POOL.filter(function (g) { return g.tier === tier; });
      var g = pool[Math.floor(rnd() * pool.length)];
      var steps = Math.floor((g.max - g.min) / g.step) + 1;
      var target = g.min + Math.floor(rnd() * steps) * g.step;
      list.push({ id: g.id, target: target, progress: 0, done: false });
    }
    return list;
  }

  function defaults() {
    var t = todayKey();
    return {
      v: 1, best: 0, totalGates: 0, skin: 'mallow', unlocked: ['mallow'],
      dailySeed: t, dailyBest: 0,
      goals: { date: t, list: makeGoals(t) },
      stickers: 0, mute: false, runs: 0,
      sv: 1, bestGates: 0, dailyBestGates: 0, recent: [], feats: {}, freeRev: '', shortRuns: 0,
      slideOk: false,         // v1.2: passed an offset hole (ends the slide lesson)
      musicStyle: 'box'       // v1.3: 'box' | 'soft' | 'pop' | 'auto'
    };
  }

  function merge(base, src) {
    if (!src || typeof src !== 'object') return base;
    for (var k in base) {
      if (!Object.prototype.hasOwnProperty.call(base, k)) continue;
      if (!(k in src)) continue;
      var b = base[k];
      var s = src[k];
      if (typeof b === 'number') { if (typeof s === 'number' && isFinite(s)) base[k] = s; }
      else if (typeof b === 'string') { if (typeof s === 'string') base[k] = s; }
      else if (typeof b === 'boolean') { if (typeof s === 'boolean') base[k] = s; }
      else if (Array.isArray(b)) { if (Array.isArray(s)) base[k] = s; }
      else if (b && typeof b === 'object') {
        if (s && typeof s === 'object') base[k] = s;
      }
    }
    return base;
  }

  function rollDay(d) {
    var t = todayKey();
    if (d.dailySeed !== t) {
      d.dailySeed = t;
      d.dailyBest = 0;
    }
    var g = d.goals;
    if (!g || g.date !== t || !Array.isArray(g.list) || g.list.length !== 3) {
      d.goals = { date: t, list: makeGoals(t) };
    }
    if (g && g.date === t && Array.isArray(g.list) && g.list.some(function (x) { return !x || !GOAL_STAT[x.id]; })) d.goals = { date: t, list: makeGoals(t) };
    if (d.unlocked.indexOf('mallow') < 0) d.unlocked.unshift('mallow');
    // v1.1 changed scoring, so older best scores are not comparable.
    if (d.sv < 2) { d.sv = 2; d.best = 0; d.dailyBest = 0; }
    if (!d.feats || typeof d.feats !== 'object') d.feats = {};
    if (!Array.isArray(d.recent)) d.recent = [];
    if (['box', 'soft', 'pop', 'auto'].indexOf(d.musicStyle) < 0) d.musicStyle = 'box';
    return d;
  }

  function readStore() {
    try {
      var raw = window.localStorage.getItem(KEY);
      persistent = true;
      if (!raw) return null;
      try { return JSON.parse(raw); } catch (e2) { return null; }
    } catch (e) {
      persistent = false;
      return null;
    }
  }

  function writeStore(d) {
    var s = JSON.stringify(d);
    memory = s;
    try {
      window.localStorage.setItem(KEY, s);
      persistent = true;
    } catch (e) {
      persistent = false;
    }
  }

  function load() {
    var stored = readStore();
    if (!stored && memory && !persistent) {
      try { stored = JSON.parse(memory); } catch (e) { stored = null; }
    }
    cache = rollDay(merge(defaults(), stored));
    MP.save.persistent = persistent;
    return cache;
  }

  function write(partial) {
    if (!cache) load();
    if (partial && typeof partial === 'object') {
      for (var k in partial) {
        if (Object.prototype.hasOwnProperty.call(partial, k)) cache[k] = partial[k];
      }
    }
    rollDay(cache);
    writeStore(cache);
    MP.save.persistent = persistent;
  }

  function goalText(g) {
    var t = GOAL_TEXT[g.id] || '';
    return t.replace('{n}', g.target);
  }

  function statVal(v) { return v === true ? 1 : (+v || 0); }
  function progressWith(g, stats) {
    var m = GOAL_STAT[g.id];
    if (!m) return g.progress;
    var v = statVal(stats[m[0]]);
    return m[1] ? g.progress + v : Math.max(g.progress, v);
  }

  // Read-only: ids of today's open goals that the given stats would complete.
  function checkRun(stats) {
    if (!cache) load();
    stats = stats || {};
    var out = [];
    cache.goals.list.forEach(function (g) {
      if (!g.done && progressWith(g, stats) >= g.target) out.push(g.id);
    });
    return out;
  }

  // Applies run stats to today's goals and returns the goals completed by this call (adds stickers).
  // stats: {walls, lollis, taffy, gatesDelta} add up; {gates, score, perfects, lollisRun, combo, streak, snaps, rush, daily} are per run.
  function reportRun(stats) {
    if (!cache) load();
    rollDay(cache);
    stats = stats || {};
    var finished = [];
    cache.goals.list.forEach(function (g) {
      if (g.done) return;
      g.progress = progressWith(g, stats);
      if (g.progress >= g.target) {
        g.progress = g.target;
        g.done = true;
        cache.stickers += 1;
        finished.push(g);
      }
    });
    writeStore(cache);
    return finished;
  }

  MP.save = {
    load: load,
    write: write,
    persistent: true,
    todayKey: todayKey,
    makeGoals: makeGoals,
    goalText: goalText,
    reportRun: reportRun,
    checkRun: checkRun
  };
})();
