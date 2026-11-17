(function () {
  'use strict';
  window.MP = window.MP || {};

  // Mallow Pop audio (v1.3): WebAudio synth only, no files.
  // - Backing sequencer driven by the game's beat clock (musicTick); it plays bass, arp, pads, drums and the lead
  //   notes on steps the game does not own ("fillers", quieter). Owned steps (ownStep) are played by the player:
  //   hitNote() schedules the melody note exactly on its step (or now when late).
  // - Three styles: 'box' (Music Box), 'soft' (Soft Chip), 'pop' (Synth Pop) + 'auto' (by zone).
  // - One shared reverb (generated impulse response) and one echo; a voice pool caps simultaneous voices.

  var PENTA = [0, 2, 4, 7, 9]; // pentatonic of the current song (major or minor)
  var ROOT = 60; // tonic of the current song near C4

  var ctx = null;
  var master = null;   // mute / ad-mute gain
  var limiter = null;  // soft safety limiter before the destination
  var musicBus = null; // all music channels -> tone -> master
  var tone = null;     // lowpass on the music; style sets it, Sugar Rush opens it ("brighter")
  var sfxBus = null;
  var revIn = null, echoIn = null, echoDelay = null;
  var noiseBuf = null;
  var waves = null;    // pulse PeriodicWaves (12.5 %, 25 %) or null -> plain square
  var nf = null;       // shared noise filters for drums { sn, hat, cr }
  var CH = null;       // channels by role
  var muted = false;
  var adMuted = false;
  var musicOn = false;
  var popOffset = 0;
  var unlocked = false;
  var layer = 0;
  var rush = false;
  var clock = null;    // test/offline hook: function returning "now" in context seconds
  var offline = false; // attached offline context: skip running/hidden checks
  var noiseOff = 0;
  var errs = 0;        // internal errors swallowed (tests assert 0)

  // ---------------------------------------------------------------- styles
  var STYLE_IDS = ['box', 'soft', 'pop', 'auto'];
  var styleSel = 'box'; // what the player chose (may be 'auto')
  var zone = 0;
  var style = 'box';    // resolved style in use
  var stylePend = null; // resolved style waiting for the next bar line

  // per style: music tone cutoff, channel levels, reverb and echo sends per channel
  var STY = {
    box: { tone: 9000, lvl: { lead: 2, fill: 0.8, bass: 0.6, arp: 1.2, pad: 1, drum: 1.3, fx: 1 },
      rv: { lead: 0.42, fill: 0.4, bass: 0.12, arp: 0.35, pad: 0.5, drum: 0.14, fx: 0.3 },
      ec: { lead: 0.2, fill: 0.1, bass: 0, arp: 0, pad: 0, drum: 0, fx: 0.08 } },
    soft: { tone: 5600, lvl: { lead: 1.5, fill: 0.38, bass: 0.75, arp: 0.9, pad: 0.9, drum: 0.85, fx: 1 },
      rv: { lead: 0.34, fill: 0.34, bass: 0.08, arp: 0.4, pad: 0.6, drum: 0.2, fx: 0.3 },
      ec: { lead: 0.22, fill: 0.14, bass: 0, arp: 0.15, pad: 0, drum: 0, fx: 0.08 } },
    pop: { tone: 10000, lvl: { lead: 2, fill: 0.7, bass: 0.7, arp: 1.3, pad: 0.9, drum: 0.6, fx: 1 },
      rv: { lead: 0.28, fill: 0.28, bass: 0, arp: 0.25, pad: 0.5, drum: 0.1, fx: 0.25 },
      ec: { lead: 0.28, fill: 0.18, bass: 0, arp: 0.3, pad: 0, drum: 0, fx: 0.08 } }
  };
  var ROLES = ['lead', 'fill', 'bass', 'arp', 'pad', 'drum', 'fx'];
  var MUSIC_GAIN = 0.74, SFX_GAIN = 0.7, MASTER_GAIN = 0.85, REV_RET = 0.5, ECHO_FB = 0.3;

  function autoStyle(z) { return z <= 2 ? 'box' : (z === 3 ? 'soft' : 'pop'); }
  function resolve() { return styleSel === 'auto' ? autoStyle(zone) : styleSel; }

  // hit kinds: velocity and brightness
  var KINDS = { perfect: 0, snap: 1, great: 2, good: 3, hole: 4 };
  var KVEL = [1, 1, 0.95, 0.92, 0.9];
  var KBR = [1, 1, 0.8, 0.7, 0.65];

  function midi(n) { return 440 * Math.pow(2, (n - 69) / 12); }
  function mod(a, n) { return ((a % n) + n) % n; }

  function pentaNote(i) {
    var oct = Math.floor(i / 5);
    return ROOT + oct * 12 + PENTA[((i % 5) + 5) % 5];
  }

  function effectiveGain() { return (muted || adMuted) ? 0 : 1; }

  function hidden() {
    if (offline) return false;
    try { return typeof document !== 'undefined' && !!document.hidden; } catch (e) { return false; }
  }

  function now() { return clock ? clock() : ctx.currentTime; }

  function applyGain() {
    if (!ctx || !master) return;
    try {
      var t = now();
      master.gain.cancelScheduledValues(t);
      master.gain.setTargetAtTime(effectiveGain() * MASTER_GAIN, t, 0.02);
    } catch (e) { /* ignore */ }
  }

  function pulseWave(duty) {
    var n = 24;
    var re = new Float32Array(n);
    var im = new Float32Array(n);
    for (var i = 1; i < n; i++) {
      re[i] = (2 / (i * Math.PI)) * Math.sin(2 * Math.PI * i * duty);
      im[i] = (2 / (i * Math.PI)) * (1 - Math.cos(2 * Math.PI * i * duty));
    }
    return ctx.createPeriodicWave(re, im);
  }

  function gainNode(v) { var g = ctx.createGain(); g.gain.value = v; return g; }

  // builds the shared graph on a (real, offline or fake) context
  function build(c, opts) {
    ctx = c;
    opts = opts || {};
    master = gainNode(effectiveGain() * MASTER_GAIN);
    limiter = null;
    if (!opts.noLimiter && ctx.createDynamicsCompressor) {
      try {
        limiter = ctx.createDynamicsCompressor();
        limiter.threshold.value = -6; limiter.knee.value = 4; limiter.ratio.value = 8;
        limiter.attack.value = 0.003; limiter.release.value = 0.15;
        master.connect(limiter); limiter.connect(ctx.destination);
      } catch (e0) { limiter = null; }
    }
    if (!limiter) master.connect(ctx.destination);

    musicBus = gainNode(MUSIC_GAIN);
    try {
      tone = ctx.createBiquadFilter();
      tone.type = 'lowpass'; tone.frequency.value = STY[style].tone; tone.Q.value = 0.5;
      musicBus.connect(tone); tone.connect(master);
    } catch (e1) { tone = null; musicBus.connect(master); }
    sfxBus = gainNode(SFX_GAIN);
    sfxBus.connect(master);

    // reverb: one convolver, generated stereo IR (about 1.9 s, darker tail)
    revIn = null;
    try {
      if (ctx.createConvolver) {
        var sr = ctx.sampleRate, len = Math.floor(sr * 1.9), ir = ctx.createBuffer(2, len, sr);
        var seed = 22222;
        for (var chn = 0; chn < 2; chn++) {
          var d = ir.getChannelData(chn), lp = 0;
          for (var i = 0; i < len; i++) {
            seed = (seed * 16807) % 2147483647;
            var r = seed / 1073741823.5 - 1;
            var x = i / len, k = 0.5 - 0.42 * x; // the tail gets darker
            lp += k * (r - lp);
            d[i] = lp * Math.pow(1 - x, 2.6) * (i < sr * 0.012 ? i / (sr * 0.012) : 1);
          }
        }
        var conv = ctx.createConvolver();
        conv.normalize = true;
        conv.buffer = ir;
        revIn = gainNode(1);
        var ret = gainNode(REV_RET);
        revIn.connect(conv); conv.connect(ret);
        if (tone) ret.connect(tone); else ret.connect(master);
      }
    } catch (e2) { revIn = null; }

    // echo: dotted eighth, filtered feedback
    echoIn = null; echoDelay = null;
    try {
      if (ctx.createDelay) {
        echoIn = gainNode(1);
        echoDelay = ctx.createDelay(1.5);
        echoDelay.delayTime.value = 0.375;
        var fb = gainNode(ECHO_FB), elp = ctx.createBiquadFilter(), eret = gainNode(0.8);
        elp.type = 'lowpass'; elp.frequency.value = 2800; elp.Q.value = 0.5;
        echoIn.connect(echoDelay); echoDelay.connect(elp); elp.connect(fb); fb.connect(echoDelay); elp.connect(eret);
        if (tone) eret.connect(tone); else eret.connect(master);
      }
    } catch (e3) { echoIn = null; }

    // channels
    CH = {};
    for (var ri = 0; ri < ROLES.length; ri++) {
      var name = ROLES[ri];
      var ch = { g: gainNode(1), rv: gainNode(0), ec: gainNode(0), solo: 1 };
      ch.g.connect(name === 'fx' ? sfxBus : musicBus);
      ch.g.connect(ch.rv); ch.g.connect(ch.ec);
      if (revIn) ch.rv.connect(revIn);
      if (echoIn) ch.ec.connect(echoIn);
      CH[name] = ch;
    }

    // shared noise filters for the drums
    nf = { sn: ctx.createBiquadFilter(), hat: ctx.createBiquadFilter(), cr: ctx.createBiquadFilter() };
    nf.sn.connect(CH.drum.g); nf.hat.connect(CH.drum.g); nf.cr.connect(CH.drum.g);
    nf.hat.type = 'highpass'; nf.hat.frequency.value = 7000;
    nf.cr.type = 'highpass'; nf.cr.frequency.value = 5000;

    var nlen = Math.floor(ctx.sampleRate * 1.0);
    noiseBuf = ctx.createBuffer(1, nlen, ctx.sampleRate);
    var nd = noiseBuf.getChannelData(0), ns = 777;
    for (var q = 0; q < nlen; q++) { ns = (ns * 16807) % 2147483647; nd[q] = ns / 1073741823.5 - 1; }
    try {
      if (ctx.createPeriodicWave) waves = { p12: pulseWave(0.125), p25: pulseWave(0.25) };
    } catch (e5) { waves = null; }
    for (q = 0; q < pool.length; q++) { pool[q].g = null; pool[q].t1 = 0; }
    applyStyle();
  }

  function ensureCtx() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      build(new AC());
    } catch (e) {
      ctx = null;
    }
    return ctx;
  }

  function ready() {
    return !!ctx && (offline || (ctx.state === 'running' && !hidden())) && effectiveGain() > 0;
  }

  function applyStyle() {
    if (!ctx || !CH) return;
    var P = STY[style], t = now();
    for (var i = 0; i < ROLES.length; i++) {
      var r = ROLES[i], ch = CH[r];
      try {
        ch.g.gain.setTargetAtTime(P.lvl[r] * ch.solo, t, 0.03);
        ch.rv.gain.setTargetAtTime(P.rv[r], t, 0.03);
        ch.ec.gain.setTargetAtTime(P.ec[r], t, 0.03);
      } catch (e) { /* ignore */ }
    }
    try {
      if (style === 'box') { nf.sn.type = 'bandpass'; nf.sn.frequency.value = 3000; nf.sn.Q.value = 1.2; nf.hat.frequency.value = 6500; }
      else { nf.sn.type = 'highpass'; nf.sn.frequency.value = style === 'pop' ? 1600 : 2200; nf.sn.Q.value = 0.7; nf.hat.frequency.value = 7500; }
    } catch (e2) { /* ignore */ }
    toneTarget();
  }

  function toneTarget() {
    if (!tone || !ctx) return;
    var f = STY[style].tone * (rush ? 1.6 : 1);
    try { tone.frequency.setTargetAtTime(Math.min(16000, f), now(), 0.05); } catch (e) { /* ignore */ }
  }

  function setStyleNow(s) {
    if (s === style) { stylePend = null; return; }
    style = s; stylePend = null;
    applyStyle();
  }

  // the player's choice; while music plays the change lands on the next bar line
  function setStyle(id) {
    if (STYLE_IDS.indexOf(id) < 0) id = 'box';
    styleSel = id;
    var s = resolve();
    if (sq.active && musicOn) stylePend = s === style ? null : s;
    else setStyleNow(s);
  }
  function getStyle() { return styleSel; }
  function setZone(z) {
    zone = Math.max(0, z | 0);
    var s = resolve();
    if (sq.active && musicOn) stylePend = s === style ? null : s;
    else setStyleNow(s);
  }

  // ---------------------------------------------------------------- voice pool
  // A slot holds up to 3 sources sharing one envelope gain. When all slots are busy the oldest voice is stolen
  // (player notes count as a little younger so they survive bursts).
  var MAXV = 32;
  var pool = [];
  var steals = 0;
  function Slot() { this.g = null; this.a = null; this.b = null; this.c = null; this.t0 = 0; this.t1 = 0; this.pri = 0; }
  for (var vi = 0; vi < MAXV; vi++) pool.push(new Slot());

  function stopAt(s, t) { if (s) { try { s.stop(t); } catch (e) { /* ignore */ } } }

  function killSlot(v, n) {
    if (!v.g) return;
    var st = v.t0 > n ? n : n + 0.08;
    try {
      var p = v.g.gain;
      if (v.t0 <= n) {
        if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(n); else p.cancelScheduledValues(n);
        p.setTargetAtTime(0, n, 0.015);
      }
    } catch (e) { /* ignore */ }
    stopAt(v.a, st); stopAt(v.b, st); stopAt(v.c, st);
    v.g = null; v.a = null; v.b = null; v.c = null; v.t1 = 0;
  }

  function claim(t0, t1, pri) {
    var n = now(), best = -1, bt = Infinity;
    for (var i = 0; i < MAXV; i++) {
      var v = pool[i];
      if (!v.g || v.t1 <= n) { best = i; bt = -Infinity; break; }
      var age = v.t0 + v.pri * 0.25;
      if (age < bt) { bt = age; best = i; }
    }
    var s = pool[best];
    if (s.g && s.t1 > n) { killSlot(s, n); steals++; }
    s.t0 = t0; s.t1 = t1; s.pri = pri || 0; s.a = null; s.b = null; s.c = null;
    return s;
  }

  function activeVoices() {
    var n = now(), c = 0;
    for (var i = 0; i < MAXV; i++) if (pool[i].g && pool[i].t1 > n) c++;
    return c;
  }

  function setWave(o, type) {
    if (type === 'p12' || type === 'p25') {
      if (waves && o.setPeriodicWave) { o.setPeriodicWave(waves[type]); return; }
      o.type = 'square';
      return;
    }
    o.type = type;
  }

  function oscAt(type, f, t) {
    var o = ctx.createOscillator();
    setWave(o, type);
    o.frequency.setValueAtTime(f, t);
    return o;
  }

  // attack (linear), optional decay to a sustain level, hold until t + hold, exponential release
  // NOTE: a new GainNode is 1 until its first event; a source starting inside a render quantum would let a
  // full-scale first sample through (a click), so every envelope first zeroes its param.
  function env(p, t, a, vol, sus, dec, hold, rel) {
    if (vol < 0.0002) vol = 0.0002;
    p.value = 0;
    p.setValueAtTime(0.0001, t);
    p.linearRampToValueAtTime(vol, t + a);
    var end = Math.max(t + a + 0.005, t + hold), sv = vol;
    if (sus < 1 && t + a + dec < end) {
      sv = Math.max(0.0002, vol * sus);
      p.exponentialRampToValueAtTime(sv, t + a + dec);
    }
    p.setValueAtTime(sv, end);
    p.exponentialRampToValueAtTime(0.0001, end + rel);
    return end + rel;
  }
  // percussive: attack then exponential decay over dur
  function envP(p, t, a, vol, dur) {
    if (vol < 0.0002) vol = 0.0002;
    p.value = 0;
    p.setValueAtTime(0.0001, t);
    p.linearRampToValueAtTime(vol, t + a);
    p.exponentialRampToValueAtTime(0.0001, t + Math.max(a + 0.01, dur));
    return t + Math.max(a + 0.01, dur);
  }

  // delayed vibrato for player notes (own LFO, stopped with the voice so nothing stays connected)
  function vibrato(o1, o2, f, depth, t, e) {
    var l = ctx.createOscillator(), lg = ctx.createGain();
    l.type = 'sine';
    l.frequency.setValueAtTime(5.3, t);
    lg.gain.value = 0;
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(0, t + 0.12);
    lg.gain.linearRampToValueAtTime(f * depth, t + 0.4);
    l.connect(lg);
    lg.connect(o1.frequency);
    if (o2) lg.connect(o2.frequency);
    l.start(t); l.stop(e);
  }

  // ---------------------------------------------------------------- instruments
  // keytracking: less modulation / filter for high notes so fast repeats stay soft
  function kt(f, ref) { return Math.min(1, Math.sqrt(ref / f)); }

  // FM bell (music box): carrier f, modulator f * ratio, index decays; optional shimmer sine an octave up
  function bell(ch, f, t, len, vol, ratio, index, shim, pri) {
    var s = claim(t, t + len + 0.05, pri);
    var c = oscAt('sine', f, t), m = oscAt('sine', f * ratio, t), mg = ctx.createGain(), g = ctx.createGain();
    var ix = f * index;
    mg.gain.setValueAtTime(ix, t);
    mg.gain.exponentialRampToValueAtTime(Math.max(0.5, ix * 0.04), t + len * 0.7);
    m.connect(mg); mg.connect(c.frequency);
    env(g.gain, t, 0.003, vol, 1, 0, 0, len);
    c.connect(g);
    var e = t + len + 0.05;
    if (shim > 0 && f * 2 < 5200) {
      var h = oscAt('sine', f * 2, t), hg = ctx.createGain();
      hg.gain.value = 0;
      hg.gain.setValueAtTime(0.0001, t);
      hg.gain.linearRampToValueAtTime(shim, t + 0.002);
      hg.gain.exponentialRampToValueAtTime(0.0001, t + Math.min(0.4, len));
      h.connect(hg); hg.connect(g);
      h.start(t); h.stop(e);
      s.c = h;
    }
    g.connect(ch.g);
    c.start(t); m.start(t); c.stop(e); m.stop(e);
    s.g = g; s.a = c; s.b = m;
    return s;
  }

  // two detuned oscillators -> envelope -> lowpass (soft chip and synth pop leads, pads, plucks)
  // o: { w, w2, det, mix2, att, sus, dec, rel, lp, lpEnd, q, vib, oct }
  function duo(ch, f, t, hold, vol, o, br, pri) {
    var rel = o.rel;
    var s = claim(t, t + hold + rel + 0.05, pri);
    var a = oscAt(o.w, f, t), b = null, g = ctx.createGain(), out = g;
    a.connect(g);
    if (o.mix2 > 0) {
      b = oscAt(o.w2 || o.w, f, t);
      b.detune.setValueAtTime(o.det || 0, t);
      if (o.mix2 === 1) b.connect(g);
      else { var bg = ctx.createGain(); bg.gain.value = o.mix2; b.connect(bg); bg.connect(g); }
    }
    var c = null;
    if (o.oct > 0) {
      c = oscAt('triangle', f * 2, t);
      var cg = ctx.createGain(); cg.gain.value = o.oct;
      c.connect(cg); cg.connect(g);
    }
    var end = env(g.gain, t, o.att, vol, o.sus, o.dec, hold, rel);
    if (o.lp) {
      var fl = ctx.createBiquadFilter();
      fl.type = 'lowpass';
      var lpf = Math.min(15000, o.lp * (0.7 + 0.6 * br) * kt(f, 900));
      fl.frequency.setValueAtTime(Math.max(300, lpf), t);
      if (o.lpEnd) fl.frequency.exponentialRampToValueAtTime(Math.max(300, Math.min(lpf, o.lpEnd)), t + Math.max(0.05, Math.min(hold, 0.6)));
      fl.Q.value = o.q || 0.7;
      g.connect(fl); out = fl;
    }
    out.connect(ch.g);
    var e = end + 0.05;
    if (o.vib && pri && hold > 0.25) vibrato(a, b, f, o.vib, t, e);
    a.start(t); a.stop(e);
    if (b) { b.start(t); b.stop(e); }
    if (c) { c.start(t); c.stop(e); }
    s.g = g; s.a = a; s.b = b; s.c = c; s.t1 = e;
    return s;
  }

  // simple percussive tone with an optional pitch sweep
  function blip(ch, type, f0, f1, t, dur, vol, pri) {
    var s = claim(t, t + dur + 0.03, pri);
    var o = oscAt(type, f0, t), g = ctx.createGain();
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.8);
    envP(g.gain, t, 0.003, vol, dur);
    o.connect(g); g.connect(ch.g || ch);
    o.start(t); o.stop(t + dur + 0.03);
    s.g = g; s.a = o;
    return s;
  }

  // noise burst through a shared filter (dest) or its own sweeping bandpass (f0 -> f1)
  function noiseHit(dest, t, dur, vol, att, f0, f1, ftype, q) {
    var s = claim(t, t + dur + 0.03, 0);
    var src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = noiseBuf;
    envP(g.gain, t, att || 0.002, vol, dur);
    src.connect(g);
    if (f0) {
      var fl = ctx.createBiquadFilter();
      fl.type = ftype || 'bandpass'; fl.Q.value = q || 1;
      fl.frequency.setValueAtTime(f0, t);
      if (f1 && f1 !== f0) fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.connect(fl); fl.connect(dest);
    } else g.connect(dest);
    noiseOff = (noiseOff + 0.137) % 0.8;
    src.start(t, noiseOff);
    src.stop(t + dur + 0.03);
    s.g = g; s.a = src;
    return s;
  }

  // presets (static objects: no allocation per note)
  var SOFT_LEAD = { w: 'square', w2: 'square', det: 9, mix2: 0.5, att: 0.018, sus: 0.85, dec: 0.12, rel: 0.12, lp: 2600, q: 0.6, vib: 0.006, oct: 0 };
  var SOFT_LEAD_R = { w: 'square', w2: 'square', det: 9, mix2: 0.5, att: 0.018, sus: 0.85, dec: 0.12, rel: 0.12, lp: 2600, q: 0.6, vib: 0.006, oct: 0.22 };
  var SOFT_FILL = { w: 'square', w2: 'square', det: 9, mix2: 0.5, att: 0.02, sus: 0.8, dec: 0.12, rel: 0.1, lp: 2400, q: 0.6, vib: 0, oct: 0 };
  var POP_LEAD = { w: 'sawtooth', w2: 'sawtooth', det: 16, mix2: 1, att: 0.01, sus: 0.8, dec: 0.15, rel: 0.1, lp: 4500, lpEnd: 1800, q: 1.1, vib: 0.004, oct: 0 };
  var POP_LEAD_R = { w: 'sawtooth', w2: 'sawtooth', det: 16, mix2: 1, att: 0.01, sus: 0.8, dec: 0.15, rel: 0.1, lp: 4500, lpEnd: 2200, q: 1.1, vib: 0.004, oct: 0.25 };
  var POP_FILL = { w: 'sawtooth', w2: 'sawtooth', det: 16, mix2: 1, att: 0.012, sus: 0.75, dec: 0.15, rel: 0.08, lp: 3800, lpEnd: 1800, q: 0.8, vib: 0, oct: 0 };
  var SOFT_BASS = { w: 'triangle', w2: 'sine', det: -1200, mix2: 0.45, att: 0.01, sus: 0.9, dec: 0.1, rel: 0.08, lp: 0, oct: 0 };
  var POP_BASS = { w: 'square', w2: 'sine', det: -1200, mix2: 1.4, att: 0.006, sus: 0.8, dec: 0.12, rel: 0.05, lp: 900, q: 0.9, oct: 0 };
  var SOFT_ARP = { w: 'triangle', mix2: 0, att: 0.005, sus: 0.6, dec: 0.08, rel: 0.08, lp: 3000, q: 0.5, oct: 0 };
  var POP_ARP = { w: 'p25', mix2: 0, att: 0.004, sus: 0.5, dec: 0.06, rel: 0.05, lp: 3500, q: 0.7, oct: 0 };
  var SOFT_PAD = { w: 'triangle', mix2: 0, att: 0.3, sus: 1, dec: 0, rel: 0.5, lp: 0, oct: 0 };
  var POP_PAD = { w: 'sawtooth', w2: 'sawtooth', det: 7, mix2: 1, att: 0.25, sus: 1, dec: 0, rel: 0.4, lp: 1500, q: 0.5, oct: 0 };
  var SOFT_PLUCK = { w: 'square', mix2: 0, att: 0.003, sus: 0.3, dec: 0.05, rel: 0.06, lp: 3200, q: 0.6, oct: 0 };
  var POP_PLUCK = { w: 'p25', mix2: 0, att: 0.003, sus: 0.3, dec: 0.05, rel: 0.06, lp: 4200, q: 0.7, oct: 0 };

  // melody note: role 'lead' (player) or 'fill' (backing); vel 0..1, br brightness 0..1
  function melody(role, m, t, dur, vel, br) {
    var ch = CH[role], f = midi(m), player = role === 'lead';
    if (style === 'box') {
      var fb = f * 2; // music box sits an octave up
      var len = Math.max(0.9, dur * 1.5);
      var idx = (1.2 + 1.1 * br) * kt(fb, 700);
      var shim = player ? (0.022 + 0.018 * br) * (rush ? 1.6 : 1) : 0;
      return bell(ch, fb, t, len, 0.16 * vel, 3.5, idx, shim, player ? 1 : 0);
    }
    var hold = Math.max(0.06, dur * 0.92);
    if (style === 'soft') return duo(ch, f, t, hold, 0.12 * vel, player ? (rush ? SOFT_LEAD_R : SOFT_LEAD) : SOFT_FILL, br, player ? 1 : 0);
    return duo(ch, f, t, hold, 0.075 * vel, player ? (rush ? POP_LEAD_R : POP_LEAD) : POP_FILL, br, player ? 1 : 0);
  }

  function bassNote(m, t, dur) {
    var f = midi(m), ch = CH.bass;
    if (style === 'box') {
      // plucked sine with a quiet octave so it carries on phone speakers
      var s = claim(t, t + Math.min(dur, 0.5) + 0.2, 0);
      var a = oscAt('sine', f, t), b = oscAt('sine', f * 2, t), bg = ctx.createGain(), g = ctx.createGain();
      bg.gain.value = 0.22;
      a.connect(g); b.connect(bg); bg.connect(g);
      var end = env(g.gain, t, 0.006, 0.34, 0.25, 0.3, Math.min(dur, 0.5), 0.12);
      g.connect(ch.g);
      a.start(t); b.start(t); a.stop(end + 0.03); b.stop(end + 0.03);
      s.g = g; s.a = a; s.b = b; s.t1 = end + 0.03;
      if (layer >= 4 || rush) blip(ch, 'triangle', f * 2, 0, t, 0.12, 0.05);
      return;
    }
    if (style === 'soft') duo(ch, f, t, dur * 0.9, 0.26, SOFT_BASS, 1, 0);
    else duo(ch, f, t, dur * 0.82, 0.12, POP_BASS, 1, 0);
    if (layer >= 4 || rush) duo(ch, f * 2, t, Math.min(dur, 0.14), 0.04, style === 'soft' ? SOFT_ARP : POP_ARP, 0.5, 0);
  }

  function arpNote(m, t, dur, vol) {
    var f = midi(m), ch = CH.arp;
    if (style === 'box') bell(ch, f, t, 0.45, 0.065 * vol, 4, 1.1 * kt(f, 600), 0, 0);
    else if (style === 'soft') duo(ch, f, t, dur * 0.8, 0.05 * vol, SOFT_ARP, 0.6, 0);
    else duo(ch, f, t, dur * 0.6, 0.036 * vol, POP_ARP, 0.6, 0);
  }

  // chord pad (soft and pop): three oscillators in one voice
  function padChord(pcs, t, dur, tr) {
    var P = style === 'pop' ? POP_PAD : SOFT_PAD;
    var vol = style === 'pop' ? 0.024 : 0.03;
    var s = claim(t, t + dur + P.rel + 0.05, 0);
    var g = ctx.createGain(), out = g;
    var a = oscAt(P.w, midi(60 + mod(pcs[0] + tr, 12)), t);
    var b = oscAt(P.w, midi(60 + mod(pcs[1] + tr, 12)), t);
    var c = oscAt(P.w, midi(60 + mod(pcs[2] + tr, 12)), t);
    if (P.det) { b.detune.setValueAtTime(P.det, t); c.detune.setValueAtTime(-P.det, t); }
    a.connect(g); b.connect(g); c.connect(g);
    var end = env(g.gain, t, P.att, vol, 1, 0, dur, P.rel);
    if (P.lp) {
      var fl = ctx.createBiquadFilter();
      fl.type = 'lowpass'; fl.frequency.value = P.lp * (rush ? 1.5 : 1); fl.Q.value = P.q;
      g.connect(fl); out = fl;
    }
    out.connect(CH.pad.g);
    var e = end + 0.05;
    a.start(t); b.start(t); c.start(t); a.stop(e); b.stop(e); c.stop(e);
    s.g = g; s.a = a; s.b = b; s.c = c; s.t1 = e;
  }

  function drums(d, t, big) {
    var ch = CH.drum, v = style === 'box' ? 0.6 : (style === 'soft' ? 0.75 : 1);
    if (d & 1) {
      if (style === 'box') blip(ch, 'sine', 120, 60, t, 0.13, 0.36);
      else blip(ch, 'sine', style === 'pop' ? 160 : 150, 42, t, 0.17, 0.8 * v);
    }
    if (d & 2) {
      if (style === 'box') { blip(ch, 'sine', 820, 600, t, 0.06, 0.11); noiseHit(nf.sn, t, 0.05, 0.06, 0.001); }
      else { noiseHit(nf.sn, t, 0.13, 0.26 * v, 0.001); blip(ch, 'triangle', 190, 140, t, 0.07, 0.18 * v); }
    }
    if (layer >= 1 || rush) {
      if (d & 4) noiseHit(nf.hat, t, style === 'box' ? 0.03 : 0.035, (style === 'box' ? 0.04 : 0.075) * v * (rush ? 1.25 : 1), 0.001);
      if (d & 8) noiseHit(nf.hat, t, 0.14, 0.065 * v, 0.002);
    }
    if ((d & 16) && big) noiseHit(nf.cr, t, 0.6, 0.075 * v, 0.002);
  }

  // short in-key sparkle used by ticks, lollipops, chimes (style voice)
  function pluck(ch, m, t, vol, len) {
    var f = midi(m);
    if (style === 'box') return bell(ch, f, t, len || 0.4, vol, 3.5, 1.2 * kt(f, 700), 0, 0);
    return duo(ch, f, t, 0.05, vol * 0.75, style === 'soft' ? SOFT_PLUCK : POP_PLUCK, 0.8, 0);
  }

  // ---------------------------------------------------------------- sequencer state
  // The game calls musicTick(beatF, bpm) every frame. Step k (k = beat * 4) is scheduled once, when
  // beatF >= k / 4 - lookahead, at now + (k / 4 - beatF) * 60 / bpm. No ticks -> no notes.
  var LOOK = 0.1;      // seconds of lookahead
  var LATE = 0.03;     // a step more than this late is skipped (frame hitch) instead of played late
  var MAX_STEPS = 12;  // safety cap per tick
  var sq = {
    song: null,      // decoded song object (MP.songs)
    origin: 0,       // absolute step where song step 0 sits
    next: 0,         // next absolute step to schedule
    lastB: null,     // beatF of the previous tick (null = resync on the next tick)
    bpm: 120,
    tr: 0,           // applied transposition (Sugar Rush), changes at bar lines
    bar: 0,          // absolute step of the last bar line processed
    active: false,   // something was scheduled recently
    fresh: false,    // align song step 0 to the current bar on the next tick
    lastT: -1,
    t0: 0, b0: 0     // anchor of the latest tick: context time and beat
  };
  var queue = [];    // pending song switches { song, start (abs step) }
  var hook = null;   // test hook: function (k, t, songStep)
  var noteHook = null; // test hook: function (role, midi, t, kind)

  // scheduled step times (exact times of steps already handed to WebAudio)
  var RING = 64;
  var ringK = new Float64Array(RING), ringT = new Float64Array(RING);
  var fillK = new Float64Array(RING), fillS = new Array(RING), fillT = new Float64Array(RING);
  // owned steps (the game plays these lead notes)
  var OWN = 2048;
  var ownRing = new Float64Array(OWN);
  var lastOwn = -Infinity;
  // pending player hits for steps not scheduled yet
  var PH = 16;
  var phS = new Float64Array(PH), phM = new Float64Array(PH), phB = new Float64Array(PH), phK = new Int8Array(PH);
  var phW = 0, phN = 0;
  (function () {
    for (var i = 0; i < RING; i++) { ringK[i] = -1e9; fillK[i] = -1e9; fillS[i] = null; }
    for (i = 0; i < OWN; i++) ownRing[i] = -1e9;
    for (i = 0; i < PH; i++) phS[i] = -1e9;
  })();

  function songFor(id) {
    var S = MP.songs;
    if (!S || !S.get) return null;
    return S.get(id) || null;
  }

  function keyFromSong() {
    var s = sq.song;
    if (!s) { ROOT = 60; PENTA = [0, 2, 4, 7, 9]; return; }
    ROOT = 56 + ((s.key + sq.tr - 56) % 12 + 12) % 12; // 56..67
    PENTA = s.penta || [0, 2, 4, 7, 9];
  }

  function songStep(k) { var s = sq.song; return s ? mod(k - sq.origin, s.steps) : 0; }

  function spb() { return 60 / sq.bpm; }

  // current beat estimate from the latest tick
  function beatNow() {
    if (sq.lastB === null || !ctx) return sq.lastB || 0;
    return sq.b0 + (now() - sq.t0) / spb();
  }

  // context time of absolute step S: exact if already scheduled, else from the latest tick anchor
  function timeOf(S) {
    if (ringK[S & (RING - 1)] === S) return ringT[S & (RING - 1)];
    if (sq.lastB === null) return now();
    return sq.t0 + (S / 4 - sq.b0) * spb();
  }

  // transposition that applies at absolute step S
  function trAt(S) {
    if (S >= sq.bar + 16 && sq.next > sq.bar) return rush ? 2 : 0;
    return sq.tr;
  }

  // chord pitch classes of the song at absolute step S
  function chordAt(S) {
    var s = sq.song;
    if (!s || !s.chordPcs) return null;
    return s.chordPcs[songStep(S) >> 3] || null;
  }

  // i-th chord tone (ascending) at or above midi `base`; falls back to the pentatonic
  function chordTone(S, i, base) {
    var cp = chordAt(S), tr = trAt(S), m = base, c = -1;
    for (var guard = 0; guard < 60; guard++, m++) {
      var pc = mod(m - tr, 12);
      var inC = cp ? (pc === cp[0] || pc === cp[1] || pc === cp[2]) : PENTA.indexOf(mod(m - ROOT, 12)) >= 0;
      if (inC && ++c === i) return m;
    }
    return base;
  }

  function curStep() { return Math.round(beatNow() * 4); }

  // ---------------------------------------------------------------- owned steps
  function clearOwn() {
    for (var i = 0; i < OWN; i++) ownRing[i] = -1e9;
    lastOwn = -Infinity;
  }
  function owned(k) { return ownRing[k & (OWN - 1)] === k; }

  function ownStep(S) {
    if (typeof S !== 'number' || S !== S) return;
    S = Math.round(S);
    // steps arrive in increasing order (fill, or the game's re-send of all its gates): a lower step means a new
    // world, so the old owned steps are dropped. Owned steps survive resyncs and stop/start.
    if (S < lastOwn) clearOwn();
    lastOwn = S;
    ownRing[S & (OWN - 1)] = S;
    // already scheduled as a filler and not started yet: cancel it
    var j = S & (RING - 1);
    if (ctx && fillK[j] === S && fillS[j] && fillS[j].t0 === fillT[j] && fillT[j] > now() + 0.005) {
      killSlot(fillS[j], now());
      fillS[j] = null;
    }
  }

  // ---------------------------------------------------------------- song switching
  function queueSong(id, startBeat) {
    var s = songFor(id);
    if (!s) return;
    var st = Math.round((+startBeat || 0) * 4);
    // a start in the past means "playing since then": it applies on the next step at the matching song step
    for (var i = queue.length - 1; i >= 0; i--) if (queue[i].start >= st) queue.splice(i, 1);
    queue.push({ song: s, start: st });
    if (!sq.song) { sq.song = s; sq.origin = st; keyFromSong(); }
  }

  // legacy: switch at the next bar line (immediately if nothing is playing)
  function setSong(id) {
    var s = songFor(id);
    if (!s) return;
    if (sq.active && sq.song && musicOn) {
      var st = Math.ceil(sq.next / 16) * 16;
      for (var i = queue.length - 1; i >= 0; i--) if (queue[i].start >= st) queue.splice(i, 1);
      if (s !== sq.song) queue.push({ song: s, start: st });
      return;
    }
    sq.song = s;
    sq.fresh = true; // start from song step 0 at the bar line of the next tick's position
    keyFromSong();
  }

  function applyQueue(k) {
    var j = -1;
    for (var i = 0; i < queue.length; i++) if (queue[i].start <= k) j = i;
    if (j < 0) return;
    var e = queue[j];
    sq.song = e.song; sq.origin = e.start; sq.fresh = false;
    queue.splice(0, j + 1);
    keyFromSong();
  }

  function resync(beatF, back) {
    sq.next = Math.ceil(beatF * 4 - 1e-6);
    if (back) sq.fresh = true;
    sq.bar = Math.floor(sq.next / 16) * 16;
    sq.tr = rush ? 2 : 0;
    for (var p = 0; p < PH; p++) if (phS[p] < sq.next && phS[p] > -1e8) { phS[p] = -1e9; phN--; }
    if (phN < 0) phN = 0;
    applyQueue(sq.next);
    keyFromSong();
  }

  // called when the absolute step k is a bar line (k % 16 === 0)
  function barLine(k) {
    sq.bar = k;
    sq.tr = rush ? 2 : 0;
    if (stylePend) setStyleNow(stylePend);
    keyFromSong();
  }

  function advanceTo(k) {
    if (k % 16 === 0) barLine(k);
    if (queue.length) applyQueue(k);
  }

  // ---------------------------------------------------------------- playing steps
  function fillerDur(k, i, s, stepSec) {
    // a filler note is cut where the game owns a step inside it (held-note gates)
    var d = s.leadDur[i];
    for (var j = 1; j < d; j++) if (owned(k + j)) { d = j; break; }
    return d * stepSec;
  }

  function playStep(k, t, stepSec) {
    var s = sq.song;
    if (!s) return;
    var i = songStep(k);
    if (hook) { try { hook(k, t, i); } catch (e) { /* ignore */ } }
    var tr = sq.tr;
    var ln = s.lead[i];
    var j = k & (RING - 1);
    fillK[j] = -1e9; fillS[j] = null;
    if (ln) {
      if (!owned(k)) {
        var v = melody('fill', ln + tr, t, fillerDur(k, i, s, stepSec), 0.9, 0.6);
        fillK[j] = k; fillS[j] = v; fillT[j] = t;
        if (noteHook) noteHook('fill', ln + tr, t, '', fillerDur(k, i, s, stepSec));
      }
      if (layer >= 3 && s.harm[i]) arpNote(s.harm[i] + tr, t, Math.min(s.leadDur[i], 4) * stepSec, 0.55);
    }
    // pads (soft, pop): every bar, and on a chord change in the middle of a bar
    if ((style === 'soft' || style === 'pop') && i % 8 === 0 && s.chordPcs) {
      var h = i >> 3, nH = s.chordPcs.length;
      if (i % 16 === 0 || s.chords[(h - 1 + nH) % nH] !== s.chords[h]) {
        var plen = (i % 16 === 0 && s.chords[(h + 1) % nH] === s.chords[h]) ? 16 : 8;
        padChord(s.chordPcs[h], t, plen * stepSec * 0.98, tr);
      }
    }
    var bn = s.bass[i];
    if (bn) bassNote(bn + tr, t, s.bassDur[i] * stepSec - 0.015);
    var an = s.arp[i];
    if (an) arpNote(an + tr, t, s.arpDur[i] * stepSec, layer >= 2 || rush ? 1.35 : 1);
    var d = s.drum[i];
    if (d) drums(d, t, layer >= 5 || rush);
  }

  function playPending(k, t) {
    if (!phN) return;
    for (var p = 0; p < PH; p++) {
      if (phS[p] !== k) continue;
      phS[p] = -1e9; phN--;
      playHit(phM[p], t, phB[p], phK[p], trAt(k));
    }
  }

  function musicTick(beatF, bpm) {
    if (typeof beatF !== 'number' || beatF !== beatF) return;
    if (typeof bpm === 'number' && bpm > 0) {
      if (echoDelay && Math.abs(bpm - sq.bpm) > 0.5 && ctx) {
        try { echoDelay.delayTime.setTargetAtTime(Math.min(1.2, 45 / bpm), now(), 0.05); } catch (e0) { /* ignore */ }
      }
      sq.bpm = bpm;
    }
    bpm = sq.bpm;
    var last = sq.lastB, jumped = false;
    sq.lastB = beatF;
    if (last === null || beatF < last - 1e-6 || beatF - last > 2) { resync(beatF, last !== null && beatF < last); jumped = true; }
    // Smooth clock: run on audio time and only nudge toward the game's beat, so frame jitter, hit pauses
    // and tempo changes never bend the music. Big differences (pause, revive, new run) snap straight to it.
    if (ctx) {
      var tn = now();
      if (sq.ckT == null || jumped) sq.ckB = beatF;
      else {
        var pb = sq.ckB + (tn - sq.ckT) * sq.ckBpm / 60;
        sq.ckB = Math.abs(beatF - pb) > 0.25 ? beatF : pb + (beatF - pb) * 0.04;
      }
      sq.ckT = tn; sq.ckBpm = bpm;
      beatF = sq.ckB;
    }
    if (sq.fresh) { sq.fresh = false; sq.origin = Math.floor(sq.next / 16) * 16; }
    var playing = musicOn && !!sq.song && ready();
    if (ctx) { sq.t0 = now(); sq.b0 = beatF; }
    if (!playing) {
      // keep the position current so enabling (or unmuting) never plays a burst of old steps
      var c = Math.ceil(beatF * 4 - 1e-6);
      while (sq.next < c) {
        sq.next++;
        advanceTo(sq.next);
        if (phN) for (var p = 0; p < PH; p++) if (phS[p] < sq.next && phS[p] > -1e8) { phS[p] = -1e9; phN--; }
      }
      sq.active = false;
      return;
    }
    var n = sq.t0;
    var sp = 60 / bpm;
    var stepSec = sp / 4;
    var lim = (beatF + LOOK / sp) * 4;
    var cnt = 0;
    while (sq.next <= lim && cnt < MAX_STEPS) {
      var k = sq.next;
      sq.next = k + 1;
      cnt++;
      advanceTo(k);
      var t = n + (k / 4 - beatF) * sp;
      if (t < n - LATE) { playPending(k, n); continue; }
      if (t < n) t = n;
      ringK[k & (RING - 1)] = k; ringT[k & (RING - 1)] = t;
      try { playStep(k, t, stepSec); } catch (e) { errs++; }
      try { playPending(k, t); } catch (e2) { errs++; }
      sq.lastT = t;
    }
    sq.active = true;
  }

  // ---------------------------------------------------------------- player notes
  function kindIdx(kind) { var i = KINDS[kind]; return i === undefined ? 2 : i; }

  function playHit(m, t, beats, ki, tr) {
    var n = now();
    var late = n - t;
    if (late > 0) t = n;
    var dur = (beats > 0 ? beats : 0.5) * spb() - (late > 0 ? late : 0);
    if (dur < 0.12) dur = 0.12;
    melody('lead', m + tr, t, dur, KVEL[ki], KBR[ki]);
    if (noteHook) noteHook('lead', m + tr, t, ki, dur);
  }

  // the player cleared the gate at absolute step S: play its melody note on the beat (now if late)
  function hitNote(S, m, beats, kind) {
    if (typeof S !== 'number' || S !== S) return;
    S = Math.round(S);
    if (!(m > 0) && sq.song) {
      var i = songStep(S);
      m = sq.song.lead[i];
      if (!(beats > 0)) beats = sq.song.leadDur[i] / 4;
    }
    if (!(m > 0) || !ready()) return;
    var ki = kindIdx(kind);
    if (ringK[S & (RING - 1)] === S) { playHit(m, ringT[S & (RING - 1)], beats, ki, trAt(S)); return; }
    if (S >= sq.next && sq.active && musicOn && S - sq.next < 4 * 64) {
      // not scheduled yet: play it together with its step (exactly with the backing)
      for (var p = 0; p < PH; p++) if (phS[p] === S) { phM[p] = m; phB[p] = beats || 0; phK[p] = ki; return; }
      var w = phW;
      if (phS[w] < -1e8) phN++;
      phS[w] = S; phM[w] = m; phB[w] = beats || 0; phK[w] = ki;
      phW = (w + 1) % PH;
      return;
    }
    // music not running (or step already passed): anchor time if still ahead, else now
    var t = timeOf(S), n = now();
    if (!(t > n) || t > n + 2) t = n;
    playHit(m, t, beats, ki, trAt(S));
  }

  // taffy tick n at absolute beat b: rising arpeggio of the chord at that beat
  var TICK_CAP = 7; // 8 rising chord tones from about C4, then it stays on the top one
  function tickAt(b, n, t) {
    var S = Math.round(b * 4);
    var i = Math.max(0, Math.min(TICK_CAP, (n | 0) - 1));
    var m = chordTone(S, i, 59);
    var vol = 0.055 + 0.005 * i;
    if (style === 'box') pluck(CH.fx, m, t, vol * 0.9, 0.3);
    else pluck(CH.fx, m, t, vol * 1.1);
    noiseHit(CH.fx.g, t, 0.025, 0.012 + 0.002 * i, 0.001, 6000, 0, 'highpass', 0.7);
    if (noteHook) noteHook('tick', m, t, n);
    return m;
  }
  function when(b) {
    var n = now();
    if (typeof b !== 'number' || b !== b) return n;
    var t = timeOf(Math.round(b * 4));
    t += (b * 4 - Math.round(b * 4)) / 4 * spb();
    return t > n && t < n + 1 ? t : n;
  }
  function tickNote(absBeat, n) {
    if (!ready()) return;
    tickAt(typeof absBeat === 'number' ? absBeat : beatNow(), n, when(absBeat));
  }
  function holdTick(n) {
    if (!ready()) return;
    tickAt(beatNow(), n, now());
  }

  // lollipop: a sparkle on a chord tone of the beat
  function lolliNote(absBeat) {
    if (!ready()) return;
    var b = typeof absBeat === 'number' ? absBeat : beatNow();
    var t = when(absBeat), S = Math.round(b * 4);
    var m = chordTone(S, 4, 72);
    if (style === 'box') { pluck(CH.fx, m, t, 0.07, 0.5); pluck(CH.fx, m + 12, t + 0.06, 0.04, 0.4); }
    else { pluck(CH.fx, m, t, 0.08); pluck(CH.fx, m + 12, t + 0.06, 0.05); }
    noiseHit(CH.fx.g, t, 0.18, 0.02, 0.01, 8000, 0, 'highpass', 0.7);
    if (noteHook) noteHook('lolli', m, t, 0);
  }

  // failure on the gate at step S: a soft thud (the melody note is simply absent)
  function missNote(S) {
    if (!ready()) return;
    var t = now();
    blip(CH.fx, 'sine', 110, 52, t, 0.16, 0.11);
    noiseHit(CH.fx.g, t, 0.1, 0.05, 0.004, 500, 250, 'lowpass', 0.7);
    if (noteHook) noteHook('miss', 0, t, S);
  }

  // ---------------------------------------------------------------- sound effects (quiet, in key, by style)
  function unlock() {
    if (!ensureCtx()) return;
    try {
      if (ctx.state !== 'running') {
        var p = ctx.resume();
        if (p && p.catch) p.catch(function () {});
      }
      // Silent buffer inside the gesture to unlock iOS output.
      var b = ctx.createBuffer(1, 1, 22050);
      var s = ctx.createBufferSource();
      s.buffer = b;
      s.connect(ctx.destination);
      s.start(0);
      unlocked = true;
    } catch (e) { /* ignore */ }
  }

  function setMuted(b) {
    muted = !!b;
    applyGain();
    try {
      if (MP.save) {
        MP.save.load();
        MP.save.write({ mute: muted });
      }
    } catch (e) { /* ignore */ }
  }

  function isMuted() { return muted; }

  function setAdMuted(b) {
    adMuted = !!b;
    applyGain();
  }

  // puff: a soft airy whoosh (no pitch)
  function puff() {
    if (!ready()) return;
    var t = now();
    var f0 = style === 'pop' ? 900 : 700;
    noiseHit(CH.fx.g, t, 0.2, 0.06, 0.03, f0, f0 * 3, 'bandpass', 0.7);
  }

  // wall smash: soft percussive layer (the musical part is the hit note)
  function smash() {
    if (!ready()) return;
    var t = now();
    if (style === 'box') noiseHit(CH.fx.g, t, 0.07, 0.045, 0.001, 2600, 1400, 'bandpass', 1.4);
    else noiseHit(CH.fx.g, t, 0.09, 0.045, 0.001, style === 'pop' ? 3000 : 2000, 700, 'bandpass', 0.9);
    blip(CH.fx, 'sine', 140, 70, t, 0.08, 0.04);
  }

  function pip() {
    if (!ready()) return;
    var t = now();
    pluck(CH.fx, chordTone(curStep(), 6, 72), t, 0.035, 0.2);
  }

  function boing() {
    if (!ready()) return;
    var t = now();
    var s = claim(t, t + 0.55, 1);
    var o = ctx.createOscillator(), g = ctx.createGain(), lf = ctx.createOscillator(), lg = ctx.createGain();
    o.type = 'sine';
    g.gain.value = 0;
    o.frequency.setValueAtTime(420, t);
    o.frequency.exponentialRampToValueAtTime(90, t + 0.45);
    lf.frequency.value = 22;
    lg.gain.value = 40;
    lf.connect(lg); lg.connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.14, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g); g.connect(CH.fx.g);
    o.start(t); lf.start(t); o.stop(t + 0.52); lf.stop(t + 0.52);
    s.g = g; s.a = o; s.b = lf;
  }

  // perfect: a faint glint above the note (the note itself is brighter through hitNote)
  function perfect() {
    if (!ready()) return;
    var t = now() + 0.02;
    noiseHit(CH.fx.g, t, 0.12, 0.018, 0.005, 9000, 0, 'highpass', 0.7);
    var m = chordTone(curStep(), 5, 79);
    blip(CH.fx, 'sine', midi(m), 0, t + 0.03, 0.18, 0.015);
  }

  function unlockJingle() {
    if (!ready()) return;
    var t = now();
    var seq = [0, 1, 2, 3, 4, 5, 7];
    for (var i = 0; i < seq.length; i++) pluck(CH.fx, pentaNote(seq[i]) + 12, t + i * 0.09, 0.08, 0.6);
  }

  // combo lost: a short dull drop
  function crack() {
    if (!ready()) return;
    var t = now();
    blip(CH.fx, 'triangle', 520, 180, t, 0.16, 0.07);
    noiseHit(CH.fx.g, t, 0.06, 0.03, 0.002, 1800, 500, 'bandpass', 1);
  }

  // taffy SNAP: quick upward sparkle on chord tones
  function snap() {
    if (!ready()) return;
    var t = now(), S = curStep();
    pluck(CH.fx, chordTone(S, 3, 72), t, 0.05, 0.3);
    pluck(CH.fx, chordTone(S, 5, 72), t + 0.05, 0.045, 0.4);
    noiseHit(CH.fx.g, t, 0.05, 0.03, 0.001, 5000, 7000, 'bandpass', 1);
  }

  // milestone / zone: three rising chord tones
  function chime() {
    if (!ready()) return;
    var t = now(), S = curStep();
    for (var i = 0; i < 3; i++) pluck(CH.fx, chordTone(S, 2 + i, 70), t + i * 0.07, 0.055, 0.6);
  }

  // near miss on a best score: a soft falling two-note sigh
  function aww() {
    if (!ready()) return;
    var t = now();
    blip(CH.fx, 'sine', midi(ROOT + 12 + 4), 0, t, 0.25, 0.1);
    blip(CH.fx, 'sine', midi(ROOT + 12), midi(ROOT + 10), t + 0.18, 0.45, 0.1);
  }

  function lolli() { lolliNote(); }

  function whoosh() {
    if (!ready()) return;
    var t = now();
    noiseHit(CH.fx.g, t, 0.3, 0.05, 0.05, 400, 3000, 'bandpass', 0.8);
  }

  // taffy path scrape: a short soft scratch
  function scrape() {
    if (!ready()) return;
    var t = now();
    noiseHit(CH.fx.g, t, 0.12, 0.03, 0.01, 3200, 1800, 'bandpass', 2);
  }

  // end of a hold: ok -> a quick sparkle above the last tick; otherwise a soft falling blip
  function holdEnd(ok) {
    if (!ready()) return;
    var t = now(), S = curStep();
    if (ok) {
      var top = chordTone(S, TICK_CAP + 1, 59);
      pluck(CH.fx, top, t, 0.05, 0.3);
      pluck(CH.fx, chordTone(S, TICK_CAP + 2, 59), t + 0.06, 0.045, 0.4);
    } else {
      blip(CH.fx, 'triangle', midi(ROOT + 12), midi(ROOT + 5), t, 0.16, 0.06);
    }
  }

  // style picker: when music is running switch it to that style at once (no separate sound), otherwise play a
  // short phrase of the current (or first) song in that style
  var prevSlots = [];
  function previewStyle(id) {
    if (STYLE_IDS.indexOf(id) < 0) return;
    styleSel = id;
    setStyleNow(resolve());
    if (!ready()) return;
    var n = now(), i;
    for (i = 0; i < prevSlots.length; i++) if (prevSlots[i].t1 > n) killSlot(prevSlots[i], n);
    prevSlots.length = 0;
    if (musicOn && sq.active) return;
    var s = sq.song || (MP.songs && MP.songs.list && MP.songs.list[0]);
    if (!s) return;
    var st = 60 / 112 / 4, t0 = n + 0.05, cnt = 0, saveBar = sq.bar, saveTr = sq.tr;
    for (var k = 0; k < 32 && cnt < 8; k++) {
      var t = t0 + k * st;
      if (s.lead[k]) { prevSlots.push(melody('lead', s.lead[k], t, Math.min(s.leadDur[k], 8) * st, 0.9, 0.8)); cnt++; }
      if (s.bass[k] && k < 24) bassNote(s.bass[k], t, s.bassDur[k] * st);
      if (s.arp[k] && k < 24) arpNote(s.arp[k], t, s.arpDur[k] * st, 1);
    }
    sq.bar = saveBar; sq.tr = saveTr;
  }

  function startMusic() {
    musicOn = true;
  }

  function stopMusic() {
    musicOn = false;
    sq.active = false;
    sq.lastB = null;
    if (stylePend) setStyleNow(stylePend);
  }

  function setLayer(n) { layer = Math.max(0, n | 0); }

  function setRush(b) {
    rush = !!b;
    toneTarget();
  }

  function onVisibility() {
    if (!ctx || offline) return;
    try {
      if (document.hidden) {
        if (ctx.state === 'running') ctx.suspend();
      } else if (unlocked) {
        var p = ctx.resume();
        if (p && p.catch) p.catch(function () {});
      }
    } catch (e) { /* ignore */ }
  }

  try {
    document.addEventListener('visibilitychange', onVisibility);
  } catch (e) { /* ignore */ }
  try {
    if (MP.save) {
      var sv = MP.save.load();
      muted = !!sv.mute;
      if (sv.musicStyle && STYLE_IDS.indexOf(sv.musicStyle) >= 0) { styleSel = sv.musicStyle; style = resolve(); }
    }
  } catch (e) { /* ignore */ }

  // wraps a function so that a missing or broken audio context never throws into the game
  function safe(fn) {
    return function (a, b, c, d) {
      try { return fn(a, b, c, d); } catch (e) { errs++; return undefined; }
    };
  }

  MP.audio = {
    unlock: safe(unlock),
    setMuted: safe(setMuted),
    isMuted: isMuted,
    setAdMuted: safe(setAdMuted),
    // styles
    STYLES: STYLE_IDS.slice(0),
    setStyle: safe(setStyle),
    getStyle: getStyle,
    getActiveStyle: function () { return style; },
    setZone: safe(setZone),
    previewStyle: safe(previewStyle),
    // music
    queueSong: safe(queueSong),
    setSong: safe(setSong),
    ownStep: safe(ownStep),
    hitNote: safe(hitNote),
    tickNote: safe(tickNote),
    lolliNote: safe(lolliNote),
    missNote: safe(missNote),
    musicTick: safe(musicTick),
    startMusic: startMusic,
    stopMusic: stopMusic,
    setLayer: setLayer,
    setRush: safe(setRush),
    // sound effects
    puff: safe(puff),
    smash: safe(smash),
    pip: safe(pip),
    boing: safe(boing),
    perfect: safe(perfect),
    whoosh: safe(whoosh),
    crack: safe(crack),
    snap: safe(snap),
    chime: safe(chime),
    aww: safe(aww),
    lolli: safe(lolli),
    scrape: safe(scrape),
    holdTick: safe(holdTick),
    holdEnd: safe(holdEnd),
    unlockJingle: safe(unlockJingle),
    setPopNote: function (n) { popOffset = (n | 0) % 5; },
    get songId() { return sq.song ? sq.song.id : null; },
    get context() { return ctx; },
    // test helpers (no effect on play)
    _setHook: function (fn) { hook = typeof fn === 'function' ? fn : null; },
    _setNoteHook: function (fn) { noteHook = typeof fn === 'function' ? fn : null; },
    _state: function () {
      return { song: sq.song ? sq.song.id : null, pend: queue.length ? queue[0].song.id : null, origin: sq.origin,
        next: sq.next, lastB: sq.lastB, tr: sq.tr, active: sq.active, root: ROOT, layer: layer, rush: rush,
        style: style, styleSel: styleSel, stylePend: stylePend, voices: ctx ? activeVoices() : 0, maxVoices: MAXV,
        steals: steals, queue: queue.length, pendingHits: phN, errors: errs };
    },
    _owned: function (S) { return owned(Math.round(S)); },
    _ensure: ensureCtx,
    // offline rendering / tests: use the given context and clock (function returning seconds)
    _attach: function (c, clockFn, opts) {
      offline = !!(opts && opts.offline);
      clock = typeof clockFn === 'function' ? clockFn : null;
      sq.active = false; sq.lastB = null; stylePend = null; musicOn = false;
      build(c, opts);
      unlocked = true;
    },
    // offline measurement: level multiplier per role (1 = normal), e.g. { lead: 1, fill: 0, ... }
    _solo: function (m) {
      if (!CH) return;
      for (var i = 0; i < ROLES.length; i++) CH[ROLES[i]].solo = m && m[ROLES[i]] != null ? m[ROLES[i]] : 1;
      var P = STY[style];
      for (i = 0; i < ROLES.length; i++) CH[ROLES[i]].g.gain.value = P.lvl[ROLES[i]] * CH[ROLES[i]].solo;
    }
  };
})();
