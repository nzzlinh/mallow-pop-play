(function () {
  var MP = window.MP = window.MP || {};

  // Shared timing rules (seconds) and lateral rules (units). game.js reads the same object.
  var C = MP.cfg = {
    PUFF_MIN: 0.30, PUFF_MAX: 1.20, COOLDOWN: 0.12, GRACE: 0.04, PERFECT: 0.10, SNAP_WIN: 0.12, BUFFER: 0.12,
    RUSH_SPEED: 1.10, RUSH_GATES: 8, RUSH_CAP: 16, RUSH_STREAK: 8,
    LAT: 1.8, HOLE_TOL: 0.45, TAFFY_TOL: 0.60, TAFFY_FAIL: 1.20, STEER_KEY: 5.0, TICK_BEATS: 0.5
  };

  // ---------------------------------------------------------------------------------------------------------------
  // TUNABLES. Curves are [[d, value], ...] tables, linearly interpolated in d (clamped at both ends).
  // STEP tables use the value of the last row whose d <= the current d. d = n + offset (+10 outside the tutorial).
  // ---------------------------------------------------------------------------------------------------------------
  var SEG_GATES = 25;                 // a new segment (zone / song / tempo) every 25 gates
  var SEG_BREATH = 4;                 // first gate of a segment: at least this many beats, and starts on a bar line
  // Tempo of a segment, taken at d of its first gate.
  var TEMPO = [[0, 96], [10, 96], [11, 100], [25, 104], [50, 114], [80, 126], [120, 140], [160, 154], [200, 168]];
  // Scroll speed = bpm / 60 * UNITS_PER_BEAT (units/s). Lesson ~7, d = 11 -> 8, top ~14 (v1.1 range).
  var UNITS_PER_BEAT = [[0, 4.4], [10, 4.4], [11, 4.8], [50, 5.4], [80, 5.5], [120, 5.6], [160, 5.3], [200, 5.0]];
  // Mean gap in beats (end of previous gate -> start of next) before the per-pair minimums are applied.
  // The value is dithered onto the half-beat grid so the mean is kept.
  var GAP_BEATS = [[0, 1.5], [11, 1.3], [35, 1.1], [60, 0.95], [100, 0.85], [150, 0.8], [200, 0.8]];
  var GAP_JITTER = 0.15;              // chance of an extra half beat on a free gap
  var BREATH_EVERY = [[0, 10], [76, 12], [121, 15]];   // STEP: every k-th gate gets BREATH_BEATS extra
  var BREATH_BEATS = 1;
  var TAFFY_SHARE = [[11, 0.18], [25, 0.18], [45, 0.21], [75, 0.24]];   // share of phrase walls that become taffy
  var TAFFY_MIN = [[0, 1.5], [60, 1.5], [100, 2]];                       // taffy length in beats (range 1.5..4)
  var TAFFY_MAX = [[0, 2], [40, 2.5], [80, 3], [150, 4]];
  var LOLLI_SHARE = [[11, 0.15], [25, 0.15], [45, 0.20], [75, 0.25]];   // share of phrase holes with a lollipop
  var CLUSTER_CHANCE = [[11, 0.20], [25, 0.20], [45, 0.35], [75, 0.45], [120, 0.55], [180, 0.70]];
  var CLUSTER_LEVEL = [[0, 1], [26, 2], [46, 3], [76, 4]];             // STEP: highest cluster level allowed
  // Lateral holes. Nothing while d <= LAT_FROM; then hole x is drawn inside [-AMP, AMP].
  var LAT_FROM = 20;
  var AMP = [[20, 0], [21, 0.5], [30, 0.8], [40, 1.0], [60, 1.3], [100, 1.6], [150, 1.8]];
  var SHIFT_CHANCE = [[20, 0], [21, 0.25], [30, 0.35], [40, 0.5], [80, 0.65], [150, 0.75]];   // when a shift is allowed
  var SHIFT_MAX = [[20, 0], [21, 0.4], [30, 0.6], [40, 1.0], [80, 1.6], [140, 2.4], [200, 3.0]]; // also capped by reach
  var SHIFT_MIN = 0.3;                // smaller shifts are not worth drawing
  // Zig-zag taffy paths.
  var ZIG_FROM = 40;                  // no paths while d <= ZIG_FROM
  var ZIG_CHANCE = [[40, 0], [41, 0.30], [80, 0.55], [140, 0.80]];
  var ZIG_AMP = [[41, 0.6], [80, 1.0], [140, 1.5], [200, 1.8]];          // swing around the lane centre
  var ZIG_TURNS = [[0, 1], [70, 2], [110, 3], [160, 4]];                 // STEP: max legs after the first waypoint
  var ZIG_STEP_MIN = [[0, 1], [100, 0.5]];                               // STEP: shortest leg in beats
  var PATH_MARGIN = 0.8;              // a leg needs at most this share of STEER_KEY at RUSH_SPEED
  var LOLLI_SHIFT = 0.9;              // max shift reached via a lollipop puff (keeps the lollipop collectable)
  var SLIDE_LESSON = { wallBeats: 2, holeSec: 0.9, x: 1.0 };            // generous wall -> offset hole

  // W = candy wall (puff), H = mouse hole (stay small). T = taffy bar (hold), rolled from W.
  var PHRASES = [
    'WHW', 'HWH', 'WWH', 'HHW', 'WHH', 'HWW', 'WHWH', 'HWHW', 'WWHH', 'HHWW',
    'WHHW', 'HWWH', 'WWHW', 'WHWW', 'HWHH', 'HHWH', 'WHHH', 'HWWW', 'WWWH', 'HHHW',
    'WHWHW', 'HWHWH', 'WWHHW', 'HHWWH', 'WHWWH', 'HWHHW', 'WWHWH', 'HHWHW', 'WHHWW', 'HWWHH',
    'WHWHH', 'HWHWW', 'WWHWW', 'HHWHH', 'WHHWH', 'HWWHW', 'WHHWHW', 'HWHHWH', 'WWHHWH', 'HHWWHW'
  ];

  // Scripted first-run lesson (beats at the lesson tempo). The first gate of each kind is soft (tut).
  var TUTORIAL = [
    { c: 'W', beats: 4, tut: 'wall' }, { c: 'W', beats: 2 }, { c: 'H', beats: 2, tut: 'hole' }, { c: 'W', beats: 1.5 },
    { c: 'H', beats: 1 }, { c: 'W', beats: 1.5 }, { c: 'H', beats: 2, lolli: 1, tut: 'lolli' }, { c: 'W', beats: 1.5 },
    { c: 'T', beats: 2, len: 1.5, tut: 'taffy' }, { c: 'H', beats: 1 }
  ];
  var WARMIN = [{ c: 'W', beats: 4 }, { c: 'H', beats: 1.5 }, { c: 'W', beats: 1.5 }];

  // Rhythmic figures. beats = gap before that gate (the first gate uses the normal gap). Gaps never go below the
  // fair minimum for the tempo, so at high bpm a figure stretches to the next legal half beat.
  var CLUSTERS = [
    { lv: 1, seq: [{ c: 'H' }, { c: 'H', beats: 0.5 }, { c: 'W', beats: 0.5 }] },
    { lv: 1, seq: [{ c: 'W' }, { c: 'H', beats: 1, lolli: 1 }] },
    { lv: 2, seq: [{ c: 'W' }, { c: 'W', beats: 1 }, { c: 'W', beats: 1 }] },
    { lv: 2, seq: [{ c: 'H' }, { c: 'W', beats: 0.5 }] },
    { lv: 2, seq: [{ c: 'W' }, { c: 'H', beats: 1 }, { c: 'H', beats: 0.5 }] },
    { lv: 3, seq: [{ c: 'W' }, { c: 'H', beats: 0.5 }, { c: 'W', beats: 0.5 }, { c: 'H', beats: 0.5 }] },
    { lv: 3, roll4: 1, seq: [{ c: 'W' }, { c: 'W', beats: 1 }, { c: 'W', beats: 1 }, { c: 'W', beats: 1 }] },
    { lv: 3, seq: [{ c: 'T', len: 1.5 }, { c: 'H', beats: 0.5 }] },
    { lv: 4, seq: [{ c: 'H' }, { c: 'W', beats: 0.5 }, { c: 'W', beats: 1 }] },
    { lv: 4, seq: [{ c: 'H' }, { c: 'W', beats: 0.5 }, { c: 'H', beats: 0.5 }, { c: 'W', beats: 0.5 }] }
  ];

  var TYPE = { W: 'wall', H: 'hole', T: 'taffy' };
  var EPS = 1e-9;

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
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function curve(tab, d) {
    if (d <= tab[0][0]) return tab[0][1];
    for (var i = 1; i < tab.length; i++) {
      if (d <= tab[i][0]) return lerp(tab[i - 1][1], tab[i][1], (d - tab[i - 1][0]) / (tab[i][0] - tab[i - 1][0]));
    }
    return tab[tab.length - 1][1];
  }
  function stepv(tab, d) {
    var v = tab[0][1];
    for (var i = 0; i < tab.length; i++) if (d >= tab[i][0]) v = tab[i][1];
    return v;
  }
  function ceil2(b) { return Math.max(0.5, Math.ceil(b * 2 - 1e-6) / 2); }   // round up to the half-beat grid
  function floor2(b) { return Math.floor(b * 2 + 1e-6) / 2; }

  function bpmFor(d) { return Math.round(curve(TEMPO, d)); }
  function spdForBpm(d, bpm) { return Math.round(bpm / 60 * curve(UNITS_PER_BEAT, d) * 100) / 100; }
  function speedFor(d) { return spdForBpm(d, bpmFor(d)); }
  function gapBeatsFor(d) { return curve(GAP_BEATS, d); }
  function baseGap(d) { return gapBeatsFor(d) * 60 / bpmFor(d); }   // seconds, for tooling

  // Smallest fair gap (seconds) from the end of the previous gate to the start of the next one.
  function minGap(prevType, type) {
    var p = prevType === 'wall' ? 'W' : prevType === 'taffy' ? 'T' : 'H';
    var n = type === 'hole' ? 'H' : 'W';
    if (p === 'W') return n === 'W' ? 0.48 : 0.34;
    if (p === 'T') return n === 'W' ? 0.34 : 0.24;
    return n === 'W' ? (type === 'taffy' ? 0.26 : 0.24) : 0.26;
  }

  // A lollipop sits `lead` seconds before its hole (lead >= PUFF_MIN + GRACE, so puffing right on it is safe).
  // The gap must also leave room to finish the previous puff first.
  function lolliExtra(prevType) { return prevType === 'wall' ? 0.42 : prevType === 'taffy' ? 0.22 : 0.10; }
  function lolliGap(prevType, lead) { return lead + lolliExtra(prevType); }

  // The same rules on the beat grid, holding at RUSH_SPEED (so they also hold at normal speed).
  function secToBeats(sec, bpm) { return sec * C.RUSH_SPEED * bpm / 60; }
  function minBeats(prevType, type, bpm) { return ceil2(secToBeats(minGap(prevType, type), bpm)); }
  function lolliBeatsFor(bpm) { return ceil2(secToBeats(C.PUFF_MIN + C.GRACE, bpm)); }
  function lolliMinBeats(prevType, leadBeats, bpm) { return leadBeats + ceil2(secToBeats(lolliExtra(prevType), bpm)); }

  // How far (units) a hole may sit from the anchor, given what comes right before it. Seconds are at normal speed;
  // the budget is computed at RUSH_SPEED for a player who presses 0.05 s before a wall, may hold it until GRACE
  // (+0.02) before the hole, releases a taffy 0.03 s after it, and puffs 0.05 s before a lollipop.
  // Returns 0 when the hole must stay on the anchor.
  function reachFor(prevType, prevPath, prevLenSec, gapSec, lolliSec) {
    var R = C.RUSH_SPEED, S = C.STEER_KEY, r = 0, avail;
    if (prevType === 'wall') {
      if (lolliSec) avail = C.PUFF_MIN;   // the wall is only tapped; the lollipop puff follows
      else avail = Math.min(C.PUFF_MAX, gapSec / R + 0.05 - C.GRACE - 0.02);
      r = S * (avail - 0.1);
    } else if (prevType === 'taffy' && !prevPath) {
      r = S * (prevLenSec / R + 0.08 - 0.1);
    } else return 0;   // after a hole or a path taffy the hole stays on the anchor
    if (lolliSec) {
      avail = Math.min(C.PUFF_MAX, lolliSec / R + 0.05 - C.GRACE - 0.02);
      r = Math.max(r, Math.min(LOLLI_SHIFT, S * (avail - 0.1)));
    }
    return Math.max(0, r);
  }

  // Lateral position of a taffy path at `b` beats from the taffy start; null before the first waypoint.
  function pathX(path, b) {
    if (!path || !path.length || b < path[0].b) return null;
    for (var i = 1; i < path.length; i++) {
      if (b <= path[i].b) {
        var p = path[i - 1], q = path[i];
        return p.x + (q.x - p.x) * (b - p.b) / (q.b - p.b);
      }
    }
    return path[path.length - 1].x;
  }

  // Longest lateral move allowed on a path leg of `db` beats.
  function legMax(db, bpm) { return C.STEER_KEY * (db * 60 / bpm) / C.RUSH_SPEED * PATH_MARGIN; }

  function create(seed, opts) {
    opts = opts || {};
    var rng = mulberry32(hashSeed(seed));
    var offset = (opts.offset | 0) + (opts.tutorial ? 0 : 10);
    var script = opts.tutorial ? TUTORIAL : WARMIN;
    var n = 0, queue = [], prev = null, lastCls = '', lastRun = 0, lastT = false;
    var curSeg = -1, bpm = 0, spd = 0, endBeat = 0, anchor = 0;
    var lessonQueued = !opts.slideLesson, lessonDone = !opts.slideLesson;

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

    function pushPhrase(d) {
      var i, t;
      if (!lessonQueued && d > LAT_FROM && validSeq('WH', letter)) {
        lessonQueued = true;
        track('W'); track('H'); lastT = false;
        queue.push({ c: 'W', beats: SLIDE_LESSON.wallBeats }, { c: 'H', slide: 1 });
        return;
      }
      if (rng() < curve(CLUSTER_CHANCE, d)) {
        var lv = stepv(CLUSTER_LEVEL, d);
        for (t = 0; t < 6; t++) {
          var cl = CLUSTERS[(rng() * CLUSTERS.length) | 0];
          if (cl.lv > lv) continue;
          if (cl.roll4 ? lastCls === 'W' : !validSeq(cl.seq, elc)) continue;
          if (lastT && cl.seq[0].c === 'T') continue;
          for (i = 0; i < cl.seq.length; i++) {
            var s = cl.seq[i];
            track(s.c);
            queue.push({ c: s.c, beats: i > 0 ? s.beats : undefined, len: s.len, lolli: s.lolli });
            lastT = s.c === 'T';
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
      var ts = curve(TAFFY_SHARE, d), lo = curve(LOLLI_SHARE, d);
      for (i = 0; i < ph.length; i++) {
        var c = ph[i], el = { c: c };
        track(c);
        if (c === 'W' && !lastT && rng() < ts) {
          el.c = 'T';
          el.len = clamp(Math.round(lerp(curve(TAFFY_MIN, d), curve(TAFFY_MAX, d), rng()) * 2) / 2, 1.5, 4);
        } else if (c === 'H' && rng() < lo) el.lolli = 1;
        lastT = el.c === 'T';
        queue.push(el);
      }
    }

    function makePath(d, L, a) {
      var maxT = stepv(ZIG_TURNS, d), minStep = stepv(ZIG_STEP_MIN, d);
      var m = 1 + Math.floor(rng() * maxT), step = floor2((L - 0.5) / m);
      while (m > 1 && step < minStep) { m--; step = floor2((L - 0.5) / m); }
      if (step < 0.5) return null;
      var amp = curve(ZIG_AMP, d), A = Math.min(C.LAT, Math.max(curve(AMP, d), amp));
      var dxMax = legMax(step, bpm), cur = a, pts = [{ b: 0.5, x: a }];
      var side = a > 0.05 ? -1 : a < -0.05 ? 1 : (rng() < 0.5 ? -1 : 1);
      for (var k = 1; k <= m; k++) {
        var tgt = clamp(side * amp * (0.7 + 0.3 * rng()), -A, A);
        var dx = clamp(tgt - cur, -dxMax, dxMax);
        dx = (dx > 0 ? Math.floor(dx * 1000) : Math.ceil(dx * 1000)) / 1000;   // stays on a 0.001 grid, never over
        cur = Math.round((cur + dx) * 1000) / 1000;
        pts.push({ b: 0.5 + k * step, x: cur });
        side = -side;
      }
      return pts;
    }

    function next() {
      n++;
      var d = n + offset, seg = Math.floor((n - 1) / SEG_GATES), el, beats, scripted = n <= script.length;
      if (seg !== curSeg) {
        curSeg = seg;
        var d0 = seg * SEG_GATES + 1 + offset;
        bpm = bpmFor(d0); spd = spdForBpm(d0, bpm);
      }
      if (scripted) {
        el = script[n - 1];
        track(el.c);
        lastT = el.c === 'T';
        beats = el.beats;
      } else {
        if (!queue.length) pushPhrase(d);
        el = queue.shift();
        if (el.slide) beats = ceil2(SLIDE_LESSON.holeSec * bpm / 60);
        else if (el.beats != null) beats = el.beats;
        else {
          var base = gapBeatsFor(d), f = floor2(base);
          beats = f + (rng() < (base - f) * 2 ? 0.5 : 0);
          if (n % stepv(BREATH_EVERY, d) === 0) beats += BREATH_BEATS;
          else if (rng() < GAP_JITTER) beats += 0.5;
        }
      }
      var type = TYPE[el.c];
      var lenBeats = type === 'taffy' ? (el.len || 1.5) : 0;
      var lolliBeats = el.lolli && type === 'hole' ? lolliBeatsFor(bpm) : 0;
      if (prev) {
        beats = Math.max(beats, minBeats(prev.type, type, bpm));
        if (lolliBeats) beats = Math.max(beats, lolliMinBeats(prev.type, lolliBeats, bpm));
      } else if (lolliBeats) beats = Math.max(beats, lolliBeats + 0.5);
      if (seg > 0 && n === seg * SEG_GATES + 1) {
        beats = Math.max(beats, SEG_BREATH);
        while ((endBeat + beats) % 4 !== 0) beats += 0.5;
      }
      var beat = endBeat + beats, spb = 60 / bpm;
      endBeat = beat + lenBeats;

      // lateral
      var x = 0, path = null, tutKind = scripted && opts.tutorial && el.tut ? el.tut : null;
      var latOn = !scripted && lessonDone && d > LAT_FROM;
      if (type === 'hole') {
        x = anchor;
        if (el.slide) {
          x = anchor > 0 ? -SLIDE_LESSON.x : anchor < 0 ? SLIDE_LESSON.x : (rng() < 0.5 ? -SLIDE_LESSON.x : SLIDE_LESSON.x);
          tutKind = 'slide'; lessonDone = true;
        } else if (latOn && prev) {
          var reach = reachFor(prev.type, prev.path, prev.len, beats * spb, lolliBeats * spb);
          var mx = Math.min(curve(SHIFT_MAX, d), reach), A = Math.min(C.LAT, curve(AMP, d));
          if (mx >= SHIFT_MIN && rng() < curve(SHIFT_CHANCE, d)) {
            for (var t = 0; t < 6; t++) {
              var cand = clamp(Math.round((rng() * 2 - 1) * A * 20) / 20, -C.LAT, C.LAT), sh = Math.abs(cand - anchor);
              if (sh >= SHIFT_MIN && sh <= mx + EPS) { x = cand; break; }
            }
          }
        }
        anchor = x;
      } else if (type === 'taffy') {
        if (latOn && d > ZIG_FROM && rng() < curve(ZIG_CHANCE, d)) path = makePath(d, lenBeats, anchor);
        x = path ? path[path.length - 1].x : anchor;
        anchor = x;
      }

      var g = {
        type: type, n: n, d: d, seg: seg, bpm: bpm, spd: spd,
        beats: beats, beat: beat, gapBefore: beats * spb,
        lenBeats: lenBeats, len: lenBeats * spb,
        lolli: lolliBeats * spb, lolliBeats: lolliBeats,
        x: x, path: path, tut: !!tutKind, tutKind: tutKind
      };
      prev = g;
      return g;
    }

    return { next: next };
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Time-domain feasibility. k = 1 normal speed, k = RUSH_SPEED for Sugar Rush. The bot presses 0.05 s before each
  // wall/taffy (or as soon as the cooldown allows), taps walls for PUFF_MIN (holding longer only to finish a slide to
  // the next hole, released GRACE + 0.02 before it), holds through taffy and releases 0.03 s after it, puffs 0.05 s
  // before every lollipop, and slides at STEER_KEY only while big toward the next lateral constraint (next hole, or
  // the next taffy path). Counts failures into bad[rule].
  // ---------------------------------------------------------------------------------------------------------------
  var DT_SIM = 1 / 120;
  function feasible(gates, k, bad) {
    var t = 0, i, g, S = C.STEER_KEY, lx = 0, free = -9, puffs = [], pathBad = false, nb = 0;
    function hit(rule) { bad[rule] = (bad[rule] || 0) + 1; nb++; }
    for (i = 0; i < gates.length; i++) {
      g = gates[i];
      t += g.gapBefore / k; g._t0 = t;
      t += g.len / k; g._t1 = t;
      g._spb = 60 / g.bpm / k;
    }
    function target(i0, tt) {
      for (var j = i0; j < gates.length; j++) {
        var h = gates[j];
        if (h.type === 'hole') return h.x;
        if (h.type === 'taffy' && h.path) {
          if (tt > h._t1) continue;
          var px = pathX(h.path, (tt - h._t0) / h._spb);
          return px === null ? h.path[0].x : px;
        }
      }
      return lx;
    }
    function slide(i0, from, to) {
      var steps = Math.ceil((to - from) / DT_SIM - 1e-9), g0 = gates[i0];
      if (steps <= 0) return;
      var dt = (to - from) / steps, mv = S * dt;
      var chk = g0.type === 'taffy' && g0.path, tA = chk ? g0._t0 + g0.path[0].b * g0._spb : 0;
      for (var s = 1; s <= steps; s++) {
        var tt = from + s * dt;
        lx = clamp(lx + clamp(target(i0, tt) - lx, -mv, mv), -C.LAT, C.LAT);
        if (chk && tt >= tA && tt <= g0._t1) {
          if (Math.abs(lx - pathX(g0.path, (tt - g0._t0) / g0._spb)) > C.TAFFY_TOL + 1e-9) pathBad = true;
        }
      }
    }
    for (i = 0; i < gates.length; i++) {
      g = gates[i];
      var press, end;
      if (g.type !== 'hole') {
        press = Math.max(g._t0 - 0.05, free);
        if (press > g._t0 + C.GRACE + 1e-9) hit('press');
        if (g.type === 'wall') {
          end = press + C.PUFF_MIN;
          var nx = gates[i + 1];
          if (nx && nx.type === 'hole' && !nx.lolli && Math.abs(nx.x - lx) > 1e-9) {
            var cap = Math.min(press + C.PUFF_MAX, nx._t0 - C.GRACE - 0.02);
            end = Math.max(end, Math.min(press + Math.abs(nx.x - lx) / S + 0.02, cap));
          }
        } else end = Math.max(press + C.PUFF_MIN, g._t1 + 0.03);
        pathBad = false;
        slide(i, press, end);
        if (pathBad) hit('path');
        puffs.push([press, end]);
        free = end + C.COOLDOWN;
      } else {
        if (g.lolli) {
          var tl = g._t0 - g.lolli / k;
          press = Math.max(tl - 0.05, free);
          if (press > tl + 0.05 + 1e-9) hit('lolliTime');
          else {
            slide(i, press, tl);
            if (Math.abs(lx - g.x) > C.HOLE_TOL + 0.25 + 1e-9) hit('lolliSide');
          }
          end = Math.max(press + C.PUFF_MIN, Math.min(Math.max(press, tl) + Math.abs(g.x - lx) / S + 0.02,
            g._t0 - C.GRACE - 0.02, press + C.PUFF_MAX));
          slide(i, Math.max(press, tl), end);
          puffs.push([press, end]);
          free = end + C.COOLDOWN;
        }
        if (Math.abs(lx - g.x) > C.HOLE_TOL + 1e-9) hit('side');
      }
    }
    for (i = 0; i < gates.length; i++) {
      g = gates[i];
      if (g.type !== 'hole') continue;
      var small = false;
      for (var s = -1; s <= 1 && !small; s++) {
        var at = g._t0 + s * C.GRACE, inside = false;
        for (var p = 0; p < puffs.length; p++) if (at > puffs[p][0] + 1e-9 && at < puffs[p][1] - 1e-9) { inside = true; break; }
        if (!inside) small = true;
      }
      if (!small) hit('small');
    }
    return nb;
  }

  function isHalf(v) { return typeof v === 'number' && Math.abs(v * 2 - Math.round(v * 2)) < 1e-9; }
  function near(a, b) { return Math.abs(a - b) < 1e-6; }

  // Static rule check of one generated run (gates in order). opts as given to create(). Counts into bad[rule].
  function checkRun(gates, opts, bad) {
    var nb = 0, R = C.RUSH_SPEED, S = C.STEER_KEY;
    function hit(rule) { bad[rule] = (bad[rule] || 0) + 1; nb++; }
    var scriptLen = opts.tutorial ? TUTORIAL.length : WARMIN.length;
    var prev = null, run = 0, runCls = '', endBeat = 0, anchor = 0, slideSeen = false, i, k;
    for (i = 0; i < gates.length; i++) {
      var a = gates[i], c = a.type === 'hole' ? 'H' : 'W', spb = 60 / a.bpm;
      // grid and bookkeeping
      if (!isHalf(a.beats) || !isHalf(a.beat) || !isHalf(a.lenBeats) || !isHalf(a.lolliBeats)) hit('grid');
      if (a.beats <= 0) hit('grid');
      if (a.beat !== endBeat + a.beats) hit('beat');
      if (!near(a.gapBefore, a.beats * spb) || !near(a.len, a.lenBeats * spb) || !near(a.lolli, a.lolliBeats * spb)) hit('secs');
      if (a.n !== i + 1 || a.seg !== Math.floor((a.n - 1) / SEG_GATES)) hit('seg');
      if (a.bpm !== bpmFor(a.seg * SEG_GATES + 1 + (a.d - a.n)) || a.bpm < 90 || a.bpm > 180) hit('tempo');
      if (!(a.spd >= 6 && a.spd <= 15)) hit('speed');
      if (prev && prev.seg === a.seg && (prev.bpm !== a.bpm || prev.spd !== a.spd)) hit('segConst');
      if (prev && prev.seg !== a.seg && (a.beats < SEG_BREATH || a.beat % 4 !== 0)) hit('segStart');
      endBeat = a.beat + a.lenBeats;
      // seconds rules at normal speed and at RUSH_SPEED
      for (var kk = 0; kk < 2; kk++) {
        k = kk ? R : 1;
        if (prev && a.gapBefore / k < minGap(prev.type, a.type) - 1e-9) hit('minGap');
        if (a.lolli && a.lolli / k < C.PUFF_MIN + C.GRACE - 1e-9) hit('lolliLead');
        if (a.lolli && prev && a.gapBefore / k < lolliGap(prev.type, a.lolli / k) - 1e-9) hit('lolliGap');
      }
      if (a.lolli && a.type !== 'hole') hit('lolliType');
      if (c === runCls) run++; else { runCls = c; run = 1; }
      if (run > 4) hit('run');
      if (a.type === 'taffy' && (a.lenBeats < 1.5 || a.lenBeats > 4 || (prev && prev.type === 'taffy'))) hit('taffy');
      if (a.type !== 'taffy' && (a.lenBeats !== 0 || a.path)) hit('taffy');
      // lateral
      if (typeof a.x !== 'number' || Math.abs(a.x) > C.LAT + 1e-9) hit('lat');
      if (a.type === 'wall' && a.x !== 0) hit('lat');
      if ((a.d <= LAT_FROM || a.n <= scriptLen) && (a.x !== 0 || a.path) && a.tutKind !== 'slide') hit('latEarly');
      if (a.type === 'hole' && a.x !== anchor) {
        var r = prev ? reachFor(prev.type, prev.path, prev.len, a.gapBefore, a.lolli) : 0;
        if (Math.abs(a.x - anchor) > r + 1e-9) hit('shift');
      }
      if (a.type === 'taffy') {
        var p = a.path;
        if (p) {
          if (a.d <= ZIG_FROM) hit('zigEarly');
          if (!p.length || p[0].b < 0.5 || p[p.length - 1].b > a.lenBeats + 1e-9) hit('pathShape');
          if (p.length && Math.abs(p[0].x - anchor) > Math.max(0, S * (p[0].b * spb / R - 0.05)) + 1e-9) hit('pathEntry');
          for (var j = 0; j < p.length; j++) {
            if (Math.abs(p[j].x) > C.LAT + 1e-9) hit('pathShape');
            if (j > 0) {
              if (!(p[j].b > p[j - 1].b)) hit('pathShape');
              else if (Math.abs(p[j].x - p[j - 1].x) > legMax(p[j].b - p[j - 1].b, a.bpm) + 1e-6) hit('pathLeg');
            }
          }
          if (p.length && a.x !== p[p.length - 1].x) hit('pathExit');
        } else if (a.x !== anchor) hit('pathExit');
      }
      // soft gates
      if (a.tut !== !!a.tutKind) hit('tut');
      if (a.tutKind === 'slide') {
        if (!opts.slideLesson || slideSeen || !prev || prev.type !== 'wall' || a.type !== 'hole' || a.x === 0 ||
            a.gapBefore < 0.85) hit('slideLesson');
        slideSeen = true;
      } else if (a.tut && !(opts.tutorial && a.n <= scriptLen)) hit('tut');
      if (opts.slideLesson && !slideSeen && (a.path || (a.type === 'hole' && a.x !== 0))) hit('slideLesson');
      if (a.type !== 'wall') anchor = a.x;
      prev = a;
    }
    if (opts.slideLesson && !slideSeen && prev && prev.d > LAT_FROM + 20) hit('slideMissing');
    return nb;
  }

  // Checks every rule of the v1.2 contract over `seeds` seeds of `count` gates (tutorial / offsets / slideLesson
  // mixed). Returns { ok, violations, rules: { rule: count }, runs, gates }.
  function selfTest(seeds, count, only) {
    var bad = {}, violations = 0, s, i;
    seeds = seeds || 600; count = count || 300;
    for (s = 0; s < seeds; s++) {
      var o = only || (s % 4 === 0 ? { tutorial: true, slideLesson: s % 8 === 0 } :
        { offset: (s % 13) * 15, slideLesson: s % 3 === 1 });
      var g = create('t' + s, o), g2 = create('t' + s, o), gates = [];
      for (i = 0; i < count; i++) {
        var a = g.next(), b = g2.next();
        if (JSON.stringify(a) !== JSON.stringify(b)) { bad.determinism = (bad.determinism || 0) + 1; violations++; }
        gates.push(a);
      }
      violations += checkRun(gates, o, bad);
      violations += feasible(gates, 1, bad) + feasible(gates, C.RUSH_SPEED, bad);
    }
    return { ok: violations === 0, violations: violations, rules: bad, runs: seeds, gates: seeds * count };
  }

  MP.gen = {
    VERSION: 12,
    create: create,
    selfTest: selfTest,
    checkRun: checkRun,
    feasible: feasible,
    bpmFor: bpmFor,
    pathX: pathX,
    speedFor: speedFor,
    baseGap: baseGap,
    minGap: minGap,
    reachFor: reachFor,
    rng: function (seed) { return mulberry32(hashSeed(seed)); },
    phrases: PHRASES,
    SEG_GATES: SEG_GATES,
    tables: {
      TEMPO: TEMPO, UNITS_PER_BEAT: UNITS_PER_BEAT, GAP_BEATS: GAP_BEATS, BREATH_EVERY: BREATH_EVERY,
      TAFFY_SHARE: TAFFY_SHARE, TAFFY_MIN: TAFFY_MIN, TAFFY_MAX: TAFFY_MAX, LOLLI_SHARE: LOLLI_SHARE,
      CLUSTER_CHANCE: CLUSTER_CHANCE, CLUSTER_LEVEL: CLUSTER_LEVEL, AMP: AMP, SHIFT_CHANCE: SHIFT_CHANCE,
      SHIFT_MAX: SHIFT_MAX, ZIG_CHANCE: ZIG_CHANCE, ZIG_AMP: ZIG_AMP, ZIG_TURNS: ZIG_TURNS
    }
  };
})();
