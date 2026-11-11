(function () {
  var MP = window.MP = window.MP || {};
  var C = MP.cfg, DT = 1 / 120, GRACE = C.GRACE, PUFF_SCALE = 2.0;
  var ZONES = [[0, 'Marshmallow Meadow'], [25, 'Candy Clouds'], [50, 'Jelly Lake'], [75, 'Sprinkle Sky'], [100, 'Starlight Sundae'], [150, 'Rainbow Road']];
  var TIPS = { wall: 'Puff into pink walls!', hole: 'Stay small for green holes!', taffy: 'Hold through the taffy!', early: 'Too early! Wait for it...' };
  var BG = [
    [[190, 232, 255], [255, 226, 242]], [[217, 204, 255], [255, 240, 214]], [[255, 217, 194], [255, 246, 201]],
    [[201, 240, 255], [231, 216, 255]], [[255, 209, 232], [217, 241, 255]], [[255, 241, 168], [255, 214, 232]]
  ];
  var CANDY = ['#ff86bd', '#ffc3de', '#ffffff', '#ffd84d', '#e0508f'];
  var G = MP.game = {};
  var st = G.state = { mode: 'menu', score: 0, gates: 0, combo: 0, mult: 1, alive: true, running: false, paused: false, daily: false };
  var W = null, data = null, acc = 0, lastFrameMs = 0, runsDone = 0, busy = false, musicOn = false, tipSeen = {};

  function sdk(name) {
    var s = MP.sdk;
    if (s && typeof s[name] === 'function') {
      try { return s[name].apply(s, Array.prototype.slice.call(arguments, 1)); } catch (e) { return undefined; }
    }
    return undefined;
  }
  function aud(name, a) {
    if (W && W.demo) return;
    var s = MP.audio;
    if (s && typeof s[name] === 'function') { try { s[name](a); } catch (e) { /* ignore */ } }
  }
  function ui(name, a, b) {
    if (MP.ui && typeof MP.ui[name] === 'function') return MP.ui[name](a, b);
    return undefined;
  }
  function persist() {
    try { if (MP.save && MP.save.write) MP.save.write(data); } catch (e) { /* ignore */ }
  }
  function dateKey() {
    if (MP.save && MP.save.todayKey) { try { return MP.save.todayKey(); } catch (e) { /* ignore */ } }
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function bgAt(i) { return BG[i % BG.length]; }

  G.dateKey = dateKey;
  G.getData = function () { return data; };
  G.getWorld = function () { return W; };
  G.skinId = function () { return (data && data.skin) || 'mallow'; };
  G.isDemo = function () { return !W || W.demo; };

  G.init = function () {
    try { data = MP.save.load(); } catch (e) { data = null; }
    if (!data) data = { v: 1, best: 0, totalGates: 0, skin: 'mallow', unlocked: ['mallow'], dailySeed: '', dailyBest: 0, goals: { date: '', list: [] }, stickers: 0, mute: false, runs: 0 };
    if (!data.unlocked) data.unlocked = ['mallow'];
    if (data.dailySeed !== dateKey()) { data.dailySeed = dateKey(); data.dailyBest = 0; data.dailyBestGates = 0; }
    if (!data.feats) data.feats = {};
    if (!data.recent) data.recent = [];
    try {
      var cur = MP.skins && MP.skins.get && MP.skins.get(data.skin);
      if (cur && MP.audio && MP.audio.setPopNote) MP.audio.setPopNote(cur.popNote);
    } catch (e) {}
    newWorld({ demo: true });
    st.mode = 'menu';
  };

  function newWorld(o) {
    var seed = o.seed != null ? o.seed : String((Math.random() * 4294967296) >>> 0);
    var bg0 = bgAt(0);
    var prevBest = o.demo ? 0 : (o.daily ? data.dailyBest : data.best) || 0;
    var bestGates = o.demo ? 0 : (o.daily ? data.dailyBestGates : data.bestGates) || 0;
    W = {
      demo: !!o.demo, daily: !!o.daily, seed: seed, tutorial: !!o.tutorial, offset: o.offset || 0,
      gen: MP.gen.create(seed, { offset: o.offset || 0, tutorial: !!o.tutorial }), gates: [], ni: 0, genN: 0, lastP: 0,
      pos: 0, speed: 7, vel: 7, simT: 0, runT: 0, puffT: 0, own: false, held: false, cd: 0, pend: -1, lastTap: -9, puffEnd: -9, evs: [], invT: 0,
      pop: 1, popV: 0, phase: 0, hitT: 0, dOff: 0, deadT: 0, rot: 0, shake: 0, shakeAmp: 6, hitStop: 0,
      parts: [], texts: [], rings: [], streak: 0, maxStreak: 0, maxMult: 1,
      walls: 0, lollisC: 0, taffyC: 0, perfects: 0, lollis: 0, snaps: 0, rushes: 0,
      rush: 0, rushNext: C.RUSH_STREAK, snap: null, crackT: 0, banner: null, zone: 0,
      prevBest: prevBest, bestGates: bestGates, flagN: bestGates >= 10 ? bestGates + 1 : 0, far: false, nb: false,
      goalsLive: {}, newUnlocks: [], cause: '', tip: '', ghost: 0,
      bgIdx: 0, bgFrom: bg0, bgTo: bg0, bgT: 1, hint: false, revived: false, counted: false,
      savedGates: 0, failGate: null, uiShown: false, result: null, scoreAnim: 0, comboAnim: 0, t: 0
    };
    acc = 0;
    fill();
    return W;
  }

  function fill() {
    var w = W, limit = w.pos + 26;
    while (w.lastP < limit) {
      if (w.demo && w.genN >= 16) { w.gen = MP.gen.create(String(Math.random())); w.genN = 0; }
      var nx = w.gen.next();
      w.genN++;
      var sp = nx.spd;
      var p = w.lastP + nx.gapBefore * sp, pe = p + nx.len * sp;
      w.gates.push({ n: nx.n, type: nx.type, p: p, pe: pe, lp: p - nx.lolli * sp, lolli: nx.lolli, len: nx.len, tut: nx.tut, state: 0, ok: false, t: 0, got: false, perf: false, spd: sp });
      w.lastP = pe;
    }
  }

  // ---- run lifecycle ----
  G.startRun = function (opts) {
    opts = opts || {};
    if (busy) return Promise.resolve();
    busy = true;
    // No ad break after a revive or when a Revive was on offer: one ad decision per break.
    var skip = W && !W.demo && (W.revived || (W.result && W.result.reviveKind));
    var p = runsDone >= 1 && !skip ? Promise.resolve(sdk('commercialBreak')).catch(function () {}) : Promise.resolve();
    return p.then(function () { busy = false; beginRun(!!opts.daily); }, function () { busy = false; beginRun(!!opts.daily); });
  };

  function startOffset(daily) {
    if (daily) return 10;
    var bg = data.bestGates || 0, s = bg >= 20 ? Math.min(60, 5 * Math.floor(0.4 * bg / 5)) : 0;
    var r = data.recent || [];
    if (r.length >= 3 && r[r.length - 1] < 10 && r[r.length - 2] < 10 && r[r.length - 3] < 10) s = Math.max(0, s - 10);
    return s;
  }
  G.startOffset = startOffset;

  function beginRun(daily) {
    var seed = daily ? 'daily-' + dateKey() : undefined;
    var tut = !daily && ((data.runs || 0) < 2 || (data.bestGates || 0) < 12);
    newWorld({ daily: daily, seed: seed, tutorial: tut, offset: tut ? 0 : startOffset(daily) });
    st.mode = 'run'; st.score = 0; st.gates = 0; st.combo = 0; st.mult = 1; st.alive = true;
    st.running = false; st.paused = false; st.daily = daily;
    aud('setLayer', 0); aud('setRush', false);
    ui('showScreen', null);
    ui('setPlaying', true);
  }

  G.toMenu = function () {
    if (st.mode === 'run' && W && !W.demo && st.gates > 0) { finishRun(); }
    sdk('gameplayStop');
    if (musicOn) { musicOn = false; aud('stopMusic'); }
    newWorld({ demo: true });
    st.mode = 'menu'; st.running = false; st.paused = false; st.alive = true; st.score = 0; st.gates = 0; st.combo = 0; st.mult = 1;
    ui('setPlaying', false);
    ui('showScreen', 'menu');
  };

  G.pause = function () {
    if (st.mode !== 'run' || st.paused || !W || W.demo) return;
    st.paused = true;
    W.evs.length = 0; W.held = false; W.own = false;
    sdk('gameplayStop');
    if (musicOn) { musicOn = false; if (MP.audio && MP.audio.stopMusic) MP.audio.stopMusic(); }
    ui('showScreen', 'pause');
  };

  G.resume = function () {
    if (!st.paused) return;
    st.paused = false;
    st.running = false;
    W.evs.length = 0; W.held = false; W.own = false;
    ui('showScreen', null);
  };

  G.togglePause = function () {
    if (st.paused) G.resume(); else G.pause();
  };

  G.revive = function () {
    if (busy || st.mode !== 'dead' || !W || W.revived || !W.result || !W.result.reviveKind) return Promise.resolve(false);
    if (W.result.reviveKind === 'free') {
      data.freeRev = dateKey(); persist();
      doRevive();
      return Promise.resolve(true);
    }
    busy = true;
    return Promise.resolve(sdk('rewardedBreak')).then(function (ok) {
      busy = false;
      if (ok === true && st.mode === 'dead') { doRevive(); return true; }
      ui('reviveFailed');
      return false;
    }, function () { busy = false; ui('reviveFailed'); return false; });
  };

  function doRevive() {
    var w = W, g = w.failGate;
    w.revived = true; w.dead = false; w.invT = 1.5; w.dOff = 0; w.hitT = 0; w.rot = 0; w.uiShown = false;
    w.tip = ''; w.ghost = 0; w.puffT = 0; w.cd = 0; w.own = false; w.held = false; w.snap = null;
    if (g) {
      if (g.type === 'hole') g.state = 1; else { g.state = 2; g.t = 0; burst(24, false); }
      st.gates++;
      w.ni = w.gates.indexOf(g) + 1;
      w.failGate = null;
    }
    st.mode = 'run'; st.alive = true; st.running = false; st.paused = false;
    w.evs.length = 0;
    ui('showScreen', null);
    ui('setPlaying', true);
  }

  // ---- input: press = puff, hold = stay big (up to PUFF_MAX), release = shrink (after PUFF_MIN) ----
  function evTime(evMs) {
    var at = W.simT;
    if (typeof evMs === 'number') {
      at = W.simT + acc + (evMs - lastFrameMs) / 1000;
      if (at < W.simT) at = W.simT;
      if (at > W.simT + 0.06) at = W.simT + 0.06;
    }
    return at;
  }

  G.tap = function (evMs) {
    if (!W) return;
    if (st.mode !== 'run' || st.paused || W.dead) return;
    var at = W.simT;
    if (!st.running) {
      st.running = true;
      sdk('gameplayStart');
      if (!musicOn) { musicOn = true; aud('startMusic'); }
    } else at = evTime(evMs);
    W.evs.push({ t: at, d: 1 });
  };

  G.release = function (evMs) {
    if (!W || W.demo || st.mode !== 'run' || st.paused || W.dead || !st.running) return;
    W.evs.push({ t: evTime(evMs), d: 0 });
  };

  function canPuff() { return W.puffT <= 0 && W.cd <= 0; }

  function doDown(t) {
    var w = W;
    w.held = true;
    if (canPuff()) doPuff(t);
    else {
      // buffer a press that lands just before the mallow can puff again
      var wait = w.puffT > 0 ? (w.own ? 9 : Math.max(0, C.PUFF_MIN - w.puffT) + C.COOLDOWN) : w.cd;
      if (wait <= C.BUFFER) w.pend = t;
    }
  }

  function doPuff(t) {
    var w = W;
    w.puffT = 1e-6; w.own = w.held; w.lastTap = t; w.pend = -1;
    w.popV += 14;
    aud('puff');
    if (MP.headless) return;
    var p = MP.render.toScreen(0, 0);
    w.rings.push({ x: p.x, y: p.y, r: 0.5, life: 0.3, max: 0.3, col: 'rgba(255,255,255,0.9)', grow: 3.5 });
  }

  // ---- update loop ----
  G.update = function (dt, nowMs) {
    lastFrameMs = nowMs || performance.now();
    var w = W;
    if (!w) return;
    w.t += dt;
    if (st.paused) return;
    if (w.hitStop > 0) { w.hitStop -= dt; return; }
    acc += Math.min(dt, 0.05);
    var n = 0;
    while (acc >= DT && n < 12) { step(); acc -= DT; n++; if (w.hitStop > 0) { break; } }
    if (acc > DT * 12) acc = 0;
    G.alpha = acc / DT;
    if (w.dead && !w.uiShown && w.deadT > (w.tip ? 1.0 : 0.5)) {
      w.uiShown = true;
      ui('showResult', w.result);
    }
  };

  G.alpha = 0;
  G.step = function () { step(); };

  function step() {
    var w = W, e;
    w.simT += DT;
    while (w.evs.length && w.evs[0].t <= w.simT) {
      e = w.evs.shift();
      if (e.d) doDown(e.t); else { w.held = false; w.own = false; }
    }
    if (w.puffT > 0) {
      w.puffT += DT;
      if ((w.puffT >= C.PUFF_MIN && !w.own) || w.puffT >= C.PUFF_MAX) { w.puffT = 0; w.own = false; w.cd = C.COOLDOWN; w.puffEnd = w.simT; }
    } else if (w.cd > 0) {
      w.cd = Math.max(0, w.cd - DT);
    }
    if (w.pend >= 0) {
      if (w.simT - w.pend > C.BUFFER) w.pend = -1;
      else if (canPuff()) doPuff(w.simT);
    }
    if (w.invT > 0) w.invT -= DT;
    // squash/stretch spring
    var tgt = w.puffT > 0 ? PUFF_SCALE : 1;
    w.popV += ((tgt - w.pop) * 900 - w.popV * 24) * DT;
    w.pop += w.popV * DT;
    if (w.hitT > 0) w.hitT -= DT;
    if (w.shake > 0) w.shake -= DT;
    if (w.scoreAnim > 0) w.scoreAnim -= DT;
    if (w.comboAnim > 0) w.comboAnim -= DT;
    if (w.crackT > 0) w.crackT -= DT;
    if (w.banner && (w.banner.t -= DT) <= 0) w.banner = null;
    if (w.bgT < 1) w.bgT = Math.min(1, w.bgT + DT / 1.5);
    if (w.demo || (st.mode === 'run' && st.running && !w.dead)) advance();
    if (w.dead) {
      w.deadT += DT;
      w.dOff = Math.min(1.4, w.deadT * 5);
      w.rot = Math.sin(w.deadT * 14) * 0.35 * Math.max(0, 1 - w.deadT * 1.4);
    }
    if (!MP.headless) updateFx();
  }

  function advance() {
    var w = W, i, g;
    var ng = w.gates[w.ni];
    if (ng) w.speed = ng.spd;
    var v = w.vel = w.speed * (w.rush > 0 ? C.RUSH_SPEED : 1);
    w.pos += v * DT;
    w.runT += DT;
    w.phase += v * DT * 1.7;
    fill();
    while (w.gates.length > 2 && w.ni > 1 && w.gates[0].pe < w.pos - 7) { w.gates.shift(); w.ni--; }
    // demo bot: puffs 0.1s before each wall and holds through taffy
    if (w.demo) {
      g = w.gates[w.ni];
      if (g && g.type !== 'hole') {
        if (g.state === 0 && (g.p - w.pos) / v <= 0.1 && canPuff()) { w.held = g.type === 'taffy'; doPuff(w.simT); }
        if (g.state === 4 && g.pe - w.pos <= 0.02 * v) { w.held = false; w.own = false; }
      }
    }
    var puffed = w.puffT > 0;
    // lollipops sit just before a hole: puff to grab, then shrink in time
    for (i = w.ni; i < w.gates.length && i < w.ni + 3; i++) {
      g = w.gates[i];
      if (g.lolli && !g.got && puffed && Math.abs(w.pos - g.lp) <= 0.05 * v) collectLolli(g);
    }
    var win = GRACE * v, dist;
    while ((g = w.gates[w.ni])) {
      dist = g.p - w.pos;
      if (g.type === 'wall') {
        if (puffed && dist <= Math.min(win, 0.55)) { smash(g, dist); w.ni++; continue; }
        if (dist < -win) { fail(g, 'wall'); if (w.dead) return; w.ni++; continue; }
        break;
      } else if (g.type === 'taffy') {
        if (g.state === 0) {
          if (puffed && dist <= Math.min(win, 0.55)) enterTaffy(g, dist);
          else if (dist < -win) { fail(g, 'wall'); if (w.dead) return; w.ni++; continue; }
          else break;
        }
        var de = g.pe - w.pos;
        if (de <= win) { clearTaffy(g, de); w.ni++; continue; }
        if (!puffed) { fail(g, 'taffy'); if (w.dead) return; w.ni++; continue; }
        break;
      } else {
        if (dist > win) break;
        if (!puffed) g.ok = true;
        if (g.ok && dist <= 0) { passGate(g); w.ni++; continue; }
        if (dist < -win) { fail(g, 'hole'); if (w.dead) return; w.ni++; continue; }
        break;
      }
    }
    if (w.snap) {
      if (!puffed) endSnap(w.simT <= w.snap.tExit + C.SNAP_WIN);
      else if (w.simT > w.snap.tExit + C.SNAP_WIN) endSnap(false);
    }
  }

  // ---- scoring ----
  function pts(n, flat) { return n * (flat ? 1 : st.mult) * (W.rush > 0 ? 2 : 1); }
  function here() { return MP.render.toScreen(0, 0); }
  function unit() { return MP.render.layout.S; }

  function feat(id) {
    var w = W;
    if (w.demo || data.feats[id]) return;
    data.feats[id] = 1;
    var list = (MP.skins && MP.skins.list) || [];
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      if (s.feat === id && data.unlocked.indexOf(s.id) < 0) {
        data.unlocked.push(s.id); w.newUnlocks.push(s);
        var p = here();
        addText('Unlocked: ' + s.name + '!', p.x, p.y - unit() * 3.4, '#7fe0ff', 0.85, 1.6);
        aud('chime');
      }
    }
    persist();
  }

  function runStats() {
    var w = W;
    return {
      walls: w.walls, lollis: w.lollisC, taffy: w.taffyC, gatesDelta: st.gates - w.savedGates,
      gates: st.gates, score: st.score, perfects: w.perfects, lollisRun: w.lollis, combo: w.maxMult, streak: w.maxStreak,
      snaps: w.snaps, rush: w.rushes > 0 ? 1 : 0, daily: w.daily
    };
  }

  function liveChecks() {
    var w = W;
    if (w.demo) return;
    var p = here(), S = unit();
    if (!w.nb && w.prevBest > 0 && st.score > w.prevBest) {
      w.nb = true;
      addText('NEW BEST!', p.x, p.y - S * 3.2, '#ffd84d', 1.1, 1.4);
      aud('chime');
    }
    if (st.mult >= 3) feat('combo3');
    if (w.maxStreak >= 10) feat('perfect10');
    if (MP.save && MP.save.checkRun) {
      var done = [];
      try { done = MP.save.checkRun(runStats()) || []; } catch (e) { done = []; }
      for (var i = 0; i < done.length; i++) {
        if (w.goalsLive[done[i]]) continue;
        w.goalsLive[done[i]] = 1;
        addText('★ Goal done!', p.x, p.y - S * 2.7, '#ffffff', 0.85, 1.4);
        aud('chime');
      }
    }
  }

  function gateCounted(good) {
    var w = W;
    st.gates++;
    if (w.demo) return;
    var p = here(), S = unit();
    if (w.rush > 0) {
      if (good) w.rush = Math.min(C.RUSH_CAP, w.rush + 1);
      if (--w.rush <= 0) {
        w.rush = 0;
        aud('setRush', false);
        addText('Sweet!', p.x, p.y - S * 2.4, '#ffffff', 0.9);
      }
    }
    if (w.streak >= w.rushNext) {
      w.rushNext += C.RUSH_STREAK;
      if (w.rush <= 0) {
        w.rush = C.RUSH_GATES; w.rushes++;
        w.banner = { s: 'SUGAR RUSH!', sub: 'x2 points', t: 1.6, max: 1.6, rush: true };
        aud('setRush', true); aud('chime');
        feat('rush');
      }
    }
    var z = w.zone;
    while (z + 1 < ZONES.length && st.gates >= ZONES[z + 1][0]) z++;
    if (z !== w.zone) {
      w.zone = z;
      w.bgFrom = lerpBg(); w.bgIdx = z; w.bgTo = bgAt(z); w.bgT = 0;
      w.banner = { s: ZONES[z][1], sub: 'Zone ' + (z + 1), t: 2, max: 2 };
      aud('chime'); aud('setLayer', z);
      if (z >= 1) feat('zone1');
      if (z >= 2) feat('zone2');
      if (z >= 4) feat('zone4');
    }
    if (st.gates >= 20) feat('gates20');
    if (w.flagN && !w.far && st.gates >= w.flagN) {
      w.far = true;
      addText('FARTHEST EVER!', p.x, p.y - S * 2.4, '#ffd84d', 1, 1.4);
      aud('chime');
      if (!MP.headless) for (var i = 0; i < 24; i++) addPart(p.x, p.y, rnd(-7, 7) * S, rnd(-9, 2) * S, 1, 0.14 * S, CANDY[i % CANDY.length], 2, 0.8);
    }
    liveChecks();
  }
  function lerpBg() {
    var w = W, o = [[0, 0, 0], [0, 0, 0]];
    for (var k = 0; k < 2; k++) for (var c = 0; c < 3; c++) o[k][c] = lerp(w.bgFrom[k][c], w.bgTo[k][c], w.bgT);
    return o;
  }
  G.bgColors = function () { return W.bgT >= 1 ? W.bgTo : lerpBg(); };
  G.zoneName = function (i) { return ZONES[Math.max(0, Math.min(ZONES.length - 1, i))][1]; };

  function streakUp() {
    var w = W;
    w.streak++;
    if (w.streak > w.maxStreak) w.maxStreak = w.streak;
    st.mult = Math.min(5, 1 + Math.floor(w.streak / 2));
    if (st.mult > w.maxMult) w.maxMult = st.mult;
    st.combo = w.streak;
    w.comboAnim = 0.3;
  }
  function streakBreak() {
    var w = W;
    if (w.streak >= 2) { w.crackT = 0.45; aud('crack'); }
    w.streak = 0; w.rushNext = C.RUSH_STREAK; st.mult = 1; st.combo = 0;
  }

  function passGate(g) {
    var w = W;
    g.state = 1;
    st.score += pts(1);
    gateCounted(false);
    w.scoreAnim = 0.15;
    aud('pip');
    if (MP.headless) return;
    var p = here(), S = unit();
    for (var i = 0; i < 5; i++) addPart(p.x, p.y, rnd(-3, 3) * S, rnd(-3, 3) * S, 0.4, 0.07 * S, '#ffffff', 1, 0);
  }

  function isPerfect(dist) {
    var w = W, tap = (w.simT - w.lastTap) + dist / w.vel;
    return tap <= C.PERFECT && tap >= -GRACE;
  }

  function smash(g, dist) {
    var w = W, perfect = isPerfect(dist);
    g.state = 2; g.t = 0;
    w.walls++;
    var p = here(), S = unit();
    if (perfect) {
      streakUp();
      st.score += pts(3);
      w.perfects++;
      addText(st.mult > 1 ? 'PERFECT! x' + st.mult : 'PERFECT!', p.x, p.y - S * 1.8, '#ffd84d', 1);
    } else {
      streakBreak();
      st.score += pts(1, true);
      addText('GREAT', p.x, p.y - S * 1.6, '#ffffff', 0.8);
    }
    gateCounted(perfect);
    w.scoreAnim = 0.2;
    aud('smash', w.streak);
    if (perfect) aud('perfect', w.streak);
    if (!w.demo) { w.shake = 0.12; w.shakeAmp = 6; w.hitStop = 0.04; }
    burst(perfect ? 56 : 36, true);
  }

  function enterTaffy(g, dist) {
    var w = W;
    g.state = 4; g.perf = isPerfect(dist);
    aud('smash', w.streak);
    if (!w.demo) { w.shake = 0.08; w.shakeAmp = 4; }
    burst(14, false);
  }

  function clearTaffy(g, de) {
    var w = W;
    g.state = 2; g.t = 0;
    w.taffyC++;
    if (w.snap) endSnap(false);
    w.snap = { perf: g.perf, tExit: w.simT + de / w.vel };
    if (w.puffT <= 0) endSnap(true);
  }

  // Taffy pays out when the mallow lets go: right at the end = SNAP.
  function endSnap(inTime) {
    var w = W, sn = w.snap, p = here(), S = unit();
    w.snap = null;
    var good = inTime && sn.perf;
    if (good) {
      streakUp();
      st.score += pts(5);
      w.snaps++; w.perfects++;
      addText(st.mult > 1 ? 'SNAP! x' + st.mult : 'SNAP!', p.x, p.y - S * 1.8, '#7fe0ff', 1.05);
      aud('snap', w.streak);
      burst(40, true);
    } else {
      streakBreak();
      st.score += pts(2, true);
      addText('GOOD', p.x, p.y - S * 1.6, '#ffffff', 0.8);
      aud('pip');
    }
    gateCounted(good);
    w.scoreAnim = 0.2;
  }

  function burst(count, big) {
    if (MP.headless) return;
    var R = MP.render, S = R.layout.S, ext = Math.min(R.layout.ext, 5);
    for (var i = 0; i < count; i++) {
      var v = rnd(-ext, ext);
      var pt = R.toScreen(0.2, v);
      var vel = R.vec(rnd(-1, 9), v * 1.1 + rnd(-3, 3));
      var life = rnd(0.7, 1.3);
      addPart(pt.x, pt.y, vel.x * S * (big ? 1 : 0.7), vel.y * S * (big ? 1 : 0.7) - S * 2, life, rnd(0.1, 0.22) * S, CANDY[(Math.random() * CANDY.length) | 0], 0, 1);
    }
    var c = R.toScreen(0, 0);
    W.rings.push({ x: c.x, y: c.y, r: 0.7, life: 0.35, max: 0.35, col: 'rgba(255,255,255,0.95)', grow: 6 });
  }

  function collectLolli(g) {
    var w = W;
    g.got = true;
    if (w.demo) return;
    w.lollis++; w.lollisC++;
    var n = pts(5);
    st.score += n; w.scoreAnim = 0.2;
    aud('lolli');
    if (w.lollis >= 3) feat('lolli3');
    liveChecks();
    if (MP.headless) return;
    var p = here(), S = unit();
    addText('+' + n, p.x, p.y - S * 1.5, '#ff86bd', 0.9);
    for (var i = 0; i < 12; i++) addPart(p.x, p.y, rnd(-6, 6) * S, rnd(-6, 6) * S, 0.6, 0.14 * S, i % 2 ? '#ff86bd' : '#ffffff', 2, 0.5);
  }

  function fail(g, cause) {
    var w = W;
    if (w.demo || w.invT > 0) {
      if (g.type === 'hole') g.state = 1; else { g.state = 2; g.t = 0; burst(20, false); }
      return;
    }
    if (cause === 'wall' && w.simT - w.puffEnd < 0.45 && w.puffEnd > w.lastTap) cause = 'early';
    if (g.tut) {
      // first gate of each kind in the lesson run only bumps
      if (g.type === 'hole') g.state = 1; else { g.state = 2; g.t = 0; }
      w.hint = true; w.hitT = 0.5; w.shake = 0.2; w.shakeAmp = 8;
      streakBreak();
      aud('boing');
      var p = here();
      addText(TIPS[cause], p.x, p.y - unit() * 2.2, '#ffffff', 0.7, 1.6);
      burst(16, false);
      return;
    }
    die(g, cause);
  }

  function die(g, cause) {
    var w = W;
    if (w.snap) endSnap(false);
    g.state = 3;
    w.failGate = g; w.dead = true; w.deadT = 0; w.hitT = 9;
    w.cause = cause; w.ghost = cause === 'hole' ? 1 : 2;
    w.tip = '';
    if ((tipSeen[cause] || 0) < 2) { tipSeen[cause] = (tipSeen[cause] || 0) + 1; w.tip = TIPS[cause]; }
    w.streak = 0; st.mult = 1; st.combo = 0; st.alive = false; st.mode = 'dead'; st.running = false;
    w.shake = 0.25; w.shakeAmp = 10; w.hitStop = 0.06;
    w.popV -= 10;
    if (w.rush > 0) { w.rush = 0; aud('setRush', false); }
    var near = w.prevBest > 0 && st.score < w.prevBest && st.score >= 0.8 * w.prevBest;
    aud(near ? 'aww' : 'boing');
    sdk('gameplayStop');
    if (!MP.headless) {
      var p = here(), S = unit();
      for (var i = 0; i < 14; i++) addPart(p.x, p.y, rnd(-7, 7) * S, rnd(-9, 3) * S, 0.9, 0.16 * S, i % 2 ? '#ffd84d' : '#ff86bd', 2, 1);
    }
    w.result = finishRun();
  }

  // ---- end of run bookkeeping ----
  function finishRun() {
    var w = W;
    if (!w || w.demo) return null;
    var stats = runStats();
    var prevTotal = data.totalGates || 0;
    w.savedGates = st.gates;
    data.totalGates = prevTotal + stats.gatesDelta;
    var isBest = false;
    if (w.daily) {
      if (st.score > (data.dailyBest || 0)) { data.dailyBest = st.score; isBest = st.score > 0; }
      if (st.gates > (data.dailyBestGates || 0)) data.dailyBestGates = st.gates;
      data.dailySeed = dateKey();
    } else {
      if (st.score > (data.best || 0)) { data.best = st.score; isBest = st.score > 0; }
      if (st.gates > (data.bestGates || 0)) data.bestGates = st.gates;
    }
    var finished = [];
    if (!w.counted) {
      w.counted = true;
      runsDone++;
      data.runs = (data.runs || 0) + 1;
      if (!w.daily) { data.recent = (data.recent || []).concat([st.gates]).slice(-3); }
    } else if (!w.daily && data.recent && data.recent.length) data.recent[data.recent.length - 1] = st.gates;
    if (MP.save && MP.save.reportRun) {
      try { finished = MP.save.reportRun(stats) || []; } catch (e) { finished = []; }
      w.walls = 0; w.lollisC = 0; w.taffyC = 0;
    }
    var gl = (data.goals && data.goals.list) || [];
    if (gl.length >= 3 && gl.every(function (g) { return g.done; })) data.feats.goals3 = 1;
    if ((data.stickers || 0) >= 12) data.feats.stickers12 = 1;
    var unlocked = w.newUnlocks.slice(), list = (MP.skins && MP.skins.list) || [];
    w.newUnlocks = [];
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      if (data.unlocked.indexOf(s.id) < 0 && MP.skins.isUnlocked(s.id, data)) { data.unlocked.push(s.id); unlocked.push(s); }
    }
    var next = null;
    list.some(function (s) {
      if (data.unlocked.indexOf(s.id) >= 0) return false;
      var remain = Math.max(0, s.gatesRequired - data.totalGates);
      next = { skin: s, remain: remain, frac: data.totalGates / s.gatesRequired, text: s.featText ? s.featText : remain + ' gates' };
      return true;
    });
    var best = w.daily ? data.dailyBest : data.best, kind = null;
    if (!w.revived && st.gates >= 15 && st.score >= 0.6 * w.prevBest) {
      if (data.freeRev !== dateKey()) kind = 'free';
      else if (sdk('rewardedAvailable')) kind = 'ad';
    }
    persist();
    var head, sub = w.zone > 0 ? 'You reached ' + ZONES[w.zone][1] + '!' : '';
    if (isBest) head = 'NEW BEST!';
    else if (w.prevBest > 0 && st.score >= 0.8 * w.prevBest) { head = 'So close!'; sub = 'Just ' + (w.prevBest - st.score + 1) + ' more to beat ' + w.prevBest + '!'; }
    else if (finished.length) head = 'Goal done!';
    else if (st.gates >= 20) head = 'Nice run!';
    else if (st.gates < 5) head = 'Keep trying!';
    else head = 'Good try!';
    if (w.daily && !sub) sub = 'Same map for everyone today!';
    return {
      score: st.score, best: best, prevBest: w.prevBest, isBest: isBest, gates: st.gates, daily: w.daily, unlocked: unlocked, next: next,
      goals: finished, reviveKind: kind, canRevive: !!kind, headline: head, sub: sub, zone: w.zone, cause: w.cause
    };
  }

  // ---- particles ----
  function addPart(x, y, vx, vy, life, size, col, kind, grav) {
    var w = W;
    if (MP.headless) return;
    if (w.parts.length > 420) w.parts.shift();
    w.parts.push({ x: x, y: y, vx: vx, vy: vy, life: life, max: life, size: size, col: col, kind: kind, grav: grav, rot: Math.random() * 6.28, vr: rnd(-10, 10) });
  }
  function addText(s, x, y, col, size, life) {
    if (MP.headless) return;
    life = life || 0.9;
    // announcements (long-lived lines) stack upward instead of covering each other
    if (life > 1) {
      var S = unit(), ts = W.texts;
      for (var n = 0; n < 4; n++) {
        var hit = false;
        for (var i = 0; i < ts.length; i++) if (ts[i].life > 0.25 && Math.abs(ts[i].y - y) < S * 0.7) { hit = true; break; }
        if (!hit) break;
        y -= S * 0.75;
      }
    }
    W.texts.push({ s: s, x: x, y: y, col: col, size: size, life: life, max: life });
  }
  G.confetti = function () {
    var w = W, L = MP.render.layout, cols = ['#ff86bd', '#ffd84d', '#7fe0ff', '#b08cff', '#ffa94d', '#ffffff'];
    for (var i = 0; i < 90; i++) {
      addPart(rnd(0, window.innerWidth), rnd(-window.innerHeight * 0.4, 0), rnd(-2, 2) * L.S, rnd(1, 5) * L.S, rnd(1.6, 2.6), rnd(0.12, 0.22) * L.S, cols[i % cols.length], 0, 0.5);
    }
    w.parts.length > 420 && w.parts.splice(0, w.parts.length - 420);
  };

  function updateFx() {
    var w = W, i, p, S = MP.render.layout.S;
    for (i = w.parts.length - 1; i >= 0; i--) {
      p = w.parts[i];
      p.life -= DT;
      if (p.life <= 0) { w.parts.splice(i, 1); continue; }
      p.vy += p.grav * 30 * S * DT;
      p.x += p.vx * DT; p.y += p.vy * DT; p.rot += p.vr * DT;
      if (p.grav > 0.5) p.vx *= 0.995;
    }
    for (i = w.texts.length - 1; i >= 0; i--) {
      p = w.texts[i];
      p.life -= DT; p.y -= S * (0.9 / p.max) * 1.2 * DT;
      if (p.life <= 0) w.texts.splice(i, 1);
    }
    for (i = w.rings.length - 1; i >= 0; i--) {
      p = w.rings[i];
      p.life -= DT; p.r += p.grow * DT;
      if (p.life <= 0) w.rings.splice(i, 1);
    }
    for (i = 0; i < w.gates.length; i++) {
      p = w.gates[i];
      if (p.state === 2 || p.state === 3) p.t += DT;
    }
  }
})();
