(function () {
  var MP = window.MP = window.MP || {};

  // Shared timing rules (seconds). game.js reads the same object.
  var C = MP.cfg = {
    PUFF_MIN: 0.30, PUFF_MAX: 1.20, COOLDOWN: 0.12, GRACE: 0.04, PERFECT: 0.10, SNAP_WIN: 0.12, BUFFER: 0.12,
    RUSH_SPEED: 1.10, RUSH_GATES: 8, RUSH_CAP: 16, RUSH_STREAK: 8
  };

  // W = candy wall (puff), H = mouse hole (stay small). T = taffy bar (hold), rolled from W.
  var PHRASES = [
    'WHW', 'HWH', 'WWH', 'HHW', 'WHH', 'HWW', 'WHWH', 'HWHW', 'WWHH', 'HHWW',
    'WHHW', 'HWWH', 'WWHW', 'WHWW', 'HWHH', 'HHWH', 'WHHH', 'HWWW', 'WWWH', 'HHHW',
    'WHWHW', 'HWHWH', 'WWHHW', 'HHWWH', 'WHWWH', 'HWHHW', 'WWHWH', 'HHWHW', 'WHHWW', 'HWWHH',
    'WHWHH', 'HWHWW', 'WWHWW', 'HHWHH', 'WHHWH', 'HWWHW', 'WHHWHW', 'HWHHWH', 'WWHHWH', 'HHWWHW'
  ];

  // Scripted first-run lesson: the first gate of each kind is soft (tut), so it cannot end the run.
  var TUTORIAL = [
    { c: 'W', gap: 1.6, tut: 1 }, { c: 'W', gap: 1.1 }, { c: 'H', gap: 1.0, tut: 1 }, { c: 'W', gap: 0.9 }, { c: 'H', gap: 0.6 },
    { c: 'W', gap: 0.9 }, { c: 'H', gap: 1.0, lolli: 0.40, tut: 1 }, { c: 'W', gap: 0.8 }, { c: 'T', gap: 1.0, len: 0.5, tut: 1 }, { c: 'H', gap: 0.5 }
  ];
  var WARMIN = [{ c: 'W', gap: 1.0 }, { c: 'H', gap: 0.8 }, { c: 'W', gap: 0.7 }];

  // Difficulty bands by index d. s = speed, g = base gap, t = share of walls that become taffy, lo = share of holes
  // with a lollipop, lead = lollipop lead, tl = longest taffy, c = cluster chance, lv = cluster level, be/ba = breather.
  var BANDS = [
    { a: 11, b: 25, s: [8, 9], g: [0.95, 0.80], t: 0.18, lo: 0.15, lead: 0.40, tl: 0.55, c: [0.20, 0.20], lv: 1, be: 10, ba: 0.35 },
    { a: 26, b: 45, s: [9, 10.5], g: [0.80, 0.68], t: 0.21, lo: 0.20, lead: 0.38, tl: 0.65, c: [0.35, 0.35], lv: 2, be: 10, ba: 0.30 },
    { a: 46, b: 75, s: [10.5, 12], g: [0.68, 0.58], t: 0.24, lo: 0.25, lead: 0.36, tl: 0.80, c: [0.45, 0.45], lv: 3, be: 12, ba: 0.30 },
    { a: 76, b: 120, s: [12, 13.5], g: [0.58, 0.50], t: 0.24, lo: 0.25, lead: 0.36, tl: 0.80, c: [0.55, 0.55], lv: 4, be: 12, ba: 0.25 },
    { a: 121, b: 180, s: [13.5, 14], g: [0.50, 0.44], t: 0.24, lo: 0.25, lead: 0.34, tl: 0.80, c: [0.60, 0.70], lv: 4, be: 15, ba: 0.25 },
    { a: 181, b: 1e9, s: [14, 14], g: [0.44, 0.44], t: 0.24, lo: 0.25, lead: 0.34, tl: 0.80, c: [0.70, 0.70], lv: 4, be: 15, ba: 0.25 }
  ];

  // Fixed-rhythm figures. gap = seconds before that gate (first gate uses the normal gap).
  var CLUSTERS = [
    { lv: 1, seq: [{ c: 'H' }, { c: 'H', gap: 0.26 }, { c: 'W', gap: 0.24 }] },
    { lv: 1, seq: [{ c: 'W' }, { c: 'H', gap: 0.66, lolli: 1 }] },
    { lv: 2, seq: [{ c: 'W' }, { c: 'W', gap: 0.48 }, { c: 'W', gap: 0.48 }] },
    { lv: 2, seq: [{ c: 'H' }, { c: 'W', gap: 0.24 }] },
    { lv: 3, seq: [{ c: 'W' }, { c: 'H', gap: 0.34 }, { c: 'W', gap: 0.30 }, { c: 'H', gap: 0.34 }] },
    { lv: 3, roll4: 1, seq: [{ c: 'W' }, { c: 'W', gap: 0.48 }, { c: 'W', gap: 0.48 }, { c: 'W', gap: 0.48 }] },
    { lv: 3, seq: [{ c: 'T', len: 0.6 }, { c: 'H', gap: 0.24 }] },
    { lv: 4, seq: [{ c: 'H' }, { c: 'W', gap: 0.24 }, { c: 'W', gap: 0.48 }] }
  ];

  var TYPE = { W: 'wall', H: 'hole', T: 'taffy' };

  function hashSeed(s) {
    s = String(s);
    var h = 1779033703 ^ s.length;
    for (var i = 0; i < s.length; i++) {
      h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^ (h >>> 16)) >>> 0;
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  function bandFor(d) {
    for (var i = 0; i < BANDS.length; i++) if (d <= BANDS[i].b) return BANDS[i];
    return BANDS[BANDS.length - 1];
  }
  function frac(b, d) { return b.b > 1e8 ? 0 : Math.max(0, Math.min(1, (d - b.a) / (b.b - b.a))); }

  function speedFor(d) {
    if (d <= 10) return 7;
    var b = bandFor(d);
    return lerp(b.s[0], b.s[1], frac(b, d));
  }

  function baseGap(d) {
    if (d <= 10) return 1.0;
    var b = bandFor(d);
    return lerp(b.g[0], b.g[1], frac(b, d));
  }

  // Smallest fair gap from the end of the previous gate to the start of the next one.
  function minGap(prevType, type) {
    var p = prevType === 'wall' ? 'W' : prevType === 'taffy' ? 'T' : 'H';
    var n = type === 'hole' ? 'H' : 'W';
    if (p === 'W') return n === 'W' ? 0.48 : 0.34;
    if (p === 'T') return n === 'W' ? 0.34 : 0.24;
    return n === 'W' ? (type === 'taffy' ? 0.26 : 0.24) : 0.26;
  }

  // A lollipop sits `lead` seconds before its hole (lead >= PUFF_MIN + GRACE, so puffing right on it is safe).
  // The gap must also leave room to finish the previous puff first.
  function lolliGap(prevType, lead) {
    return lead + (prevType === 'wall' ? 0.42 : prevType === 'taffy' ? 0.22 : 0.10);
  }

  function create(seed, opts) {
    opts = opts || {};
    var rng = mulberry32(hashSeed(seed));
    var offset = (opts.offset | 0) + (opts.tutorial ? 0 : 10);
    var script = opts.tutorial ? TUTORIAL : WARMIN;
    var n = 0, queue = [], prev = null, lastCls = '', lastRun = 0, lastT = false;

    function cls(c) { return c === 'H' ? 'H' : 'W'; }

    function validSeq(seq, get) {
      var c = lastCls, r = lastRun;
      for (var i = 0; i < seq.length; i++) {
        var k = cls(get(seq[i]));
        if (k === c) r++; else { c = k; r = 1; }
        if (r > 3) return false;
      }
      return true;
    }
    function track(c) {
      var k = cls(c);
      if (k === lastCls) lastRun++; else { lastCls = k; lastRun = 1; }
    }
    function letter(x) { return x; }
    function elc(x) { return x.c; }

    function pushPhrase(b, d) {
      var i, t;
      if (rng() < lerp(b.c[0], b.c[1], frac(b, d))) {
        for (t = 0; t < 6; t++) {
          var cl = CLUSTERS[(rng() * CLUSTERS.length) | 0];
          if (cl.lv > b.lv) continue;
          if (cl.roll4 ? lastCls === 'W' : !validSeq(cl.seq, elc)) continue;
          if (lastT && cl.seq[0].c === 'T') continue;
          for (i = 0; i < cl.seq.length; i++) {
            track(cl.seq[i].c);
            queue.push({ c: cl.seq[i].c, gap: cl.seq[i].gap, len: cl.seq[i].len, lolli: cl.seq[i].lolli, fixed: i > 0 });
            lastT = cl.seq[i].c === 'T';
          }
          return;
        }
      }
      var ph = null;
      for (t = 0; t < 12; t++) {
        var cand = PHRASES[(rng() * PHRASES.length) | 0];
        if (validSeq(cand, letter)) { ph = cand; break; }
      }
      if (!ph) ph = lastCls === 'W' ? 'HW' : 'WH';
      for (i = 0; i < ph.length; i++) {
        var c = ph[i], el = { c: c };
        track(c);
        if (c === 'W' && !lastT && rng() < b.t) {
          el.c = 'T';
          el.len = Math.round(lerp(0.45, b.tl, rng()) * 100) / 100;
        } else if (c === 'H' && rng() < b.lo) el.lolli = 1;
        lastT = el.c === 'T';
        queue.push(el);
      }
    }

    function next() {
      n++;
      var d = n + offset, b = bandFor(d), el, gap, scripted = n <= script.length;
      if (scripted) {
        el = script[n - 1];
        track(el.c);
        gap = el.gap;
      } else {
        if (!queue.length) pushPhrase(b, d);
        el = queue.shift();
        if (el.fixed) gap = el.gap;
        else {
          gap = baseGap(d);
          if (n % b.be === 0) gap += b.ba;
          else if (rng() < 0.15) gap *= 1.15;
        }
      }
      var type = TYPE[el.c];
      var lolli = el.lolli ? (el.lolli === 1 ? b.lead : el.lolli) : 0;
      if (prev) {
        gap = Math.max(gap, minGap(prev, type));
        if (lolli) gap = Math.max(gap, lolliGap(prev, lolli));
      }
      gap = Math.round(gap * 1000) / 1000;
      prev = type;
      return {
        type: type, gapBefore: gap, n: n, d: d, spd: scripted && opts.tutorial ? 7 : speedFor(Math.max(11, d)),
        len: type === 'taffy' ? (el.len || 0.5) : 0, lolli: lolli, tut: !!(opts.tutorial && el.tut)
      };
    }

    return { next: next };
  }

  // Time-domain check that a player who presses 0.05s before each wall, holds through taffy and releases
  // 0.03s after its end clears every gate. k = 1 normal speed, k = RUSH_SPEED for Sugar Rush.
  function feasible(gates, k) {
    var bad = 0, t = 0, free = -9, puffs = [], i, g;
    for (i = 0; i < gates.length; i++) {
      g = gates[i];
      t += g.gapBefore / k;
      g.t0 = t;
      if (g.type === 'taffy') t += g.len / k;
      g.t1 = t;
      if (g.type === 'hole') continue;
      var press = g.t0 - 0.05;
      if (press < free - 1e-9) {
        press = free;
        if (press > g.t0 + C.GRACE) bad++;
      }
      var end = g.type === 'taffy' ? Math.max(press + C.PUFF_MIN, g.t1 + 0.03) : press + C.PUFF_MIN;
      if (end - press > C.PUFF_MAX) bad++;
      puffs.push([press, end]);
      free = end + C.COOLDOWN;
    }
    for (i = 0; i < gates.length; i++) {
      g = gates[i];
      if (g.type !== 'hole') continue;
      var small = false;
      for (var s = -1; s <= 1 && !small; s++) {
        var at = g.t0 + s * C.GRACE, inside = false;
        for (var p = 0; p < puffs.length; p++) if (at > puffs[p][0] + 1e-9 && at < puffs[p][1] - 1e-9) { inside = true; break; }
        if (!inside) small = true;
      }
      if (!small) bad++;
    }
    return bad;
  }

  function selfTest(seeds, count) {
    var violations = 0;
    seeds = seeds || 2000; count = count || 300;
    for (var s = 0; s < seeds; s++) {
      var o = s % 4 === 0 ? { tutorial: true } : { offset: (s % 7) * 10 };
      var g = create('t' + s, o), g2 = create('t' + s, o);
      var prev = null, run = 0, runCls = '', gates = [], lastT = false;
      for (var i = 1; i <= count; i++) {
        var a = g.next(), b = g2.next();
        if (a.type !== b.type || a.gapBefore !== b.gapBefore || a.len !== b.len || a.lolli !== b.lolli) violations++;
        var c = a.type === 'hole' ? 'H' : 'W';
        if (c === runCls) run++; else { runCls = c; run = 1; }
        if (run > 4) violations++;
        if (prev && a.gapBefore < minGap(prev, a.type) - 1e-9) violations++;
        if (a.lolli && prev && a.gapBefore < lolliGap(prev, a.lolli) - 1e-9) violations++;
        if (a.lolli && a.lolli < C.PUFF_MIN + C.GRACE - 1e-9) violations++;
        if (a.lolli && a.type !== 'hole') violations++;
        if (a.type === 'taffy' && (a.len < 0.45 || a.len > 0.8 || lastT)) violations++;
        if (a.tut && !o.tutorial) violations++;
        lastT = a.type === 'taffy';
        prev = a.type;
        gates.push(a);
      }
      violations += feasible(gates, 1) + feasible(gates, C.RUSH_SPEED);
    }
    return { ok: violations === 0, violations: violations };
  }

  MP.gen = {
    create: create,
    selfTest: selfTest,
    speedFor: speedFor,
    baseGap: baseGap,
    minGap: minGap,
    bands: BANDS,
    rng: function (seed) { return mulberry32(hashSeed(seed)); },
    phrases: PHRASES
  };
})();
