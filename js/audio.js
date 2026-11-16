(function () {
  'use strict';
  window.MP = window.MP || {};

  var PENTA = [0, 2, 4, 7, 9]; // pentatonic of the current song (major or minor), used by the SFX
  var ROOT = 60; // tonic of the current song near C4 (the SFX follow the song's key)

  var ctx = null;
  var master = null;
  var musicBus = null;
  var musicTone = null; // lowpass on the music bus; Sugar Rush opens it ("brighter")
  var noiseBuf = null;
  var waves = null; // pulse PeriodicWaves (12.5%, 25%) or null -> plain square
  var muted = false;
  var adMuted = false;
  var musicOn = false;
  var popOffset = 0;
  var unlocked = false;
  var layer = 0;
  var rush = false;

  function midi(n) { return 440 * Math.pow(2, (n - 69) / 12); }

  function pentaNote(i) {
    var oct = Math.floor(i / 5);
    return ROOT + oct * 12 + PENTA[((i % 5) + 5) % 5];
  }

  function effectiveGain() { return (muted || adMuted) ? 0 : 1; }

  function hidden() {
    try { return typeof document !== 'undefined' && !!document.hidden; } catch (e) { return false; }
  }

  function applyGain() {
    if (!ctx || !master) return;
    try {
      var t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setTargetAtTime(effectiveGain() * 0.8, t, 0.02);
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

  function ensureCtx() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = effectiveGain() * 0.8;
      master.connect(ctx.destination);
      musicBus = ctx.createGain();
      musicBus.gain.value = 0.2;
      try {
        musicTone = ctx.createBiquadFilter();
        musicTone.type = 'lowpass';
        musicTone.frequency.value = 5200;
        musicTone.Q.value = 0.5;
        musicBus.connect(musicTone);
        musicTone.connect(master);
      } catch (e2) {
        musicTone = null;
        musicBus.connect(master);
      }
      var len = Math.floor(ctx.sampleRate * 0.5);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      try {
        if (ctx.createPeriodicWave) waves = { p12: pulseWave(0.125), p25: pulseWave(0.25) };
      } catch (e3) { waves = null; }
    } catch (e) {
      ctx = null;
    }
    return ctx;
  }

  function ready() {
    return ctx && ctx.state === 'running' && !hidden();
  }

  function setWave(o, type) {
    if (type === 'p12' || type === 'p25') {
      if (waves && o.setPeriodicWave) { o.setPeriodicWave(waves[type]); return; }
      o.type = 'square';
      return;
    }
    o.type = type;
  }

  function tone(type, freq, t, dur, vol, dest, freqEnd) {
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    setWave(o, type);
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest || master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  // sustained note for the sequencer: quick attack, slight decay to a sustain level, short release
  function note(type, freq, t, dur, vol, sus) {
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    setWave(o, type);
    o.frequency.setValueAtTime(freq, t);
    var a = 0.004, rel = 0.03;
    if (dur < a + rel + 0.01) dur = a + rel + 0.01;
    var dec = Math.min(0.08, dur * 0.4);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    g.gain.linearRampToValueAtTime(vol * sus, t + a + dec);
    g.gain.setValueAtTime(vol * sus, t + dur - rel);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g);
    g.connect(musicBus);
    o.start(t);
    o.stop(t + dur + 0.01);
  }

  function noise(t, dur, vol, f0, f1, dest, ftype) {
    var s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    var f = ctx.createBiquadFilter();
    f.type = ftype || 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.004, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(dest || master);
    s.start(t);
    s.stop(t + dur + 0.02);
  }

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

  function puff() {
    if (!ready()) return;
    var t = ctx.currentTime;
    tone('sine', 280, t, 0.16, 0.22, master, 520);
    noise(t, 0.12, 0.05, 600, 1800);
  }

  function smash(combo) {
    if (!ready()) return;
    var t = ctx.currentTime;
    var c = Math.max(1, combo | 0);
    var n = pentaNote(Math.min(c - 1, 9) + popOffset);
    var f = midi(n + 12);
    tone('triangle', f, t, 0.35, 0.28);
    tone('sine', f * 2, t, 0.2, 0.1);
    noise(t, 0.09, 0.1, 3000, 900);
  }

  function pip() {
    if (!ready()) return;
    var t = ctx.currentTime;
    tone('sine', 1180, t, 0.09, 0.14, master, 1500);
  }

  function boing() {
    if (!ready()) return;
    var t = ctx.currentTime;
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    var lfo = ctx.createOscillator();
    var lg = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(420, t);
    o.frequency.exponentialRampToValueAtTime(90, t + 0.45);
    lfo.frequency.value = 22;
    lg.gain.value = 40;
    lfo.connect(lg);
    lg.connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g);
    g.connect(master);
    o.start(t);
    lfo.start(t);
    o.stop(t + 0.52);
    lfo.stop(t + 0.52);
  }

  function perfect(combo) {
    if (!ready()) return;
    var t = ctx.currentTime;
    var c = Math.max(1, combo | 0);
    var n = pentaNote(Math.min(c, 8) + popOffset + 2);
    tone('sine', midi(n + 12), t + 0.05, 0.25, 0.14);
    tone('sine', midi(n + 19), t + 0.11, 0.3, 0.12);
  }

  function unlockJingle() {
    if (!ready()) return;
    var t = ctx.currentTime;
    var seq = [0, 1, 2, 3, 4, 5, 7];
    for (var i = 0; i < seq.length; i++) {
      tone('triangle', midi(pentaNote(seq[i]) + 12), t + i * 0.09, 0.3, 0.2);
    }
  }

  // combo lost: a short dull drop
  function crack() {
    if (!ready()) return;
    var t = ctx.currentTime;
    tone('triangle', 520, t, 0.18, 0.16, master, 180);
    noise(t, 0.07, 0.07, 1800, 500);
  }

  // taffy SNAP: quick upward pluck
  function snap(combo) {
    if (!ready()) return;
    var t = ctx.currentTime;
    var n = pentaNote(Math.min(Math.max(1, combo | 0), 8) + popOffset + 1);
    tone('square', midi(n + 12), t, 0.07, 0.08, master, midi(n + 24));
    tone('sine', midi(n + 24), t + 0.05, 0.28, 0.16);
    noise(t, 0.05, 0.08, 4000, 6000);
  }

  // milestone: three rising bells
  function chime() {
    if (!ready()) return;
    var t = ctx.currentTime;
    var seq = [2, 4, 7];
    for (var i = 0; i < seq.length; i++) tone('sine', midi(pentaNote(seq[i]) + 12), t + i * 0.07, 0.4, 0.16);
  }

  // near miss on a best score: a soft falling two-note sigh
  function aww() {
    if (!ready()) return;
    var t = ctx.currentTime;
    tone('sine', midi(ROOT + 12 + 4), t, 0.22, 0.2);
    tone('sine', midi(ROOT + 12), t + 0.18, 0.4, 0.2, master, midi(ROOT + 10));
  }

  function lolli() {
    if (!ready()) return;
    var t = ctx.currentTime;
    tone('sine', 1320, t, 0.08, 0.14);
    tone('sine', 1760, t + 0.06, 0.14, 0.14);
  }

  function whoosh() {
    if (!ready()) return;
    var t = ctx.currentTime;
    noise(t, 0.3, 0.1, 400, 3000);
  }

  // taffy hold tick (every half beat): a short pulse blip that slides up a step and climbs the
  // song's pentatonic with n (capped), plus a tiny tick of noise. Kept short so rapid ticks stay clean.
  var HOLD_CAP = 7; // 8 rising pitches (about A4..D6 in C), then it stays on the top note
  function holdTick(n) {
    if (!ready()) return;
    var t = ctx.currentTime;
    var i = Math.max(0, Math.min(HOLD_CAP, (n | 0) - 1));
    var m = pentaNote(i + 4);
    var vol = 0.07 + 0.006 * i;
    tone('p25', midi(m - 2), t, 0.075, vol, master, midi(m));
    tone('sine', midi(m + 12), t + 0.01, 0.06, vol * 0.6);
    noise(t, 0.03, 0.03 + 0.003 * i, 5000, 7000);
  }

  // end of a hold: ok -> a quick sparkle above the last tick; otherwise a soft falling blip
  function holdEnd(ok) {
    if (!ready()) return;
    var t = ctx.currentTime;
    if (ok) {
      var top = pentaNote(HOLD_CAP + 5);
      tone('p12', midi(top), t, 0.08, 0.07);
      tone('p12', midi(top + 5), t + 0.06, 0.12, 0.06);
    } else {
      tone('triangle', midi(ROOT + 12), t, 0.16, 0.1, master, midi(ROOT + 5));
    }
  }

  // ---- music: game-driven step sequencer (16 steps per bar, 4 per beat) ----
  // The game calls musicTick(beatF, bpm) every frame. Step k (k = beat * 4) is scheduled once, when
  // beatF >= k / 4 - lookahead, at ctx.currentTime + (k / 4 - beatF) * 60 / bpm. No ticks -> no notes.
  var LOOK = 0.1;      // seconds of lookahead
  var LATE = 0.03;     // a step more than this late is skipped (frame hitch) instead of played late
  var MAX_STEPS = 12;  // safety cap per tick
  var sq = {
    song: null,      // decoded song object (MP.songs)
    pend: null,      // song waiting for the next bar line
    origin: 0,       // absolute step where song step 0 sits (bar aligned)
    next: 0,         // next absolute step to schedule
    lastB: null,     // beatF of the previous tick (null = resync on the next tick)
    bpm: 120,
    tr: 0,           // applied transposition (Sugar Rush), changes at bar lines
    active: false,   // something was scheduled recently
    fresh: false,    // align song step 0 to the current bar on the next tick
    lastT: -1
  };
  var hook = null; // test hook: function (k, t, songStep)

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

  function setSong(id) {
    var s = songFor(id);
    if (!s) return;
    if (sq.active && sq.song && musicOn) {
      sq.pend = (s === sq.song) ? null : s;
      return;
    }
    sq.song = s;
    sq.pend = null;
    sq.fresh = true; // start from song step 0 at the bar line of the next tick's position
    keyFromSong();
  }

  function resync(beatF, hard) {
    sq.next = Math.ceil(beatF * 4 - 1e-6);
    if (sq.pend) { sq.song = sq.pend; sq.pend = null; hard = true; }
    if (hard) sq.fresh = true;
    sq.tr = rush ? 2 : 0;
    keyFromSong();
  }

  // called when the absolute step k is a bar line (k % 16 === 0)
  function barLine(k) {
    if (sq.pend) { sq.song = sq.pend; sq.pend = null; sq.origin = k; sq.fresh = false; }
    sq.tr = rush ? 2 : 0;
    keyFromSong();
  }

  function playDrums(d, t, big) {
    if (d & 1) {
      tone('sine', 150, t, 0.16, 0.9, musicBus, 42);
    }
    if (d & 2) {
      noise(t, 0.12, 0.32, 2200, 1400, musicBus);
      tone('triangle', 190, t, 0.07, 0.25, musicBus, 140);
    }
    if (layer >= 1 || rush) {
      if (d & 4) noise(t, 0.035, rush ? 0.12 : 0.09, 8000, 8000, musicBus, 'highpass');
      if (d & 8) noise(t, 0.14, 0.09, 7000, 7000, musicBus, 'highpass');
    }
    if ((d & 16) && big) noise(t, 0.6, 0.12, 6000, 3000, musicBus, 'highpass');
  }

  function playStep(k, t, stepSec) {
    var s = sq.song;
    if (!s) return;
    var i = ((k - sq.origin) % s.steps + s.steps) % s.steps;
    if (hook) { try { hook(k, t, i); } catch (e) { /* ignore */ } }
    var tr = sq.tr;
    var ln = s.lead[i];
    if (ln) {
      var ld = s.leadDur[i] * stepSec - 0.012;
      note('p25', midi(ln + tr), t, ld, 0.2, 0.7);
      if (rush) note('p12', midi(ln + tr + 12), t, Math.min(ld, stepSec * 2), 0.06, 0.5);
      if (layer >= 3 && s.harm[i]) note('triangle', midi(s.harm[i] + tr), t, ld, 0.16, 0.8);
      if (layer >= 4) note('p12', midi(ln + tr), t + stepSec * 3, Math.min(ld, stepSec * 2), 0.05, 0.6);
    }
    var bn = s.bass[i];
    if (bn) {
      var bd = s.bassDur[i] * stepSec - 0.015;
      note('triangle', midi(bn + tr), t, bd, 0.42, 0.85);
      if (layer >= 2) note('p25', midi(bn + tr + 12), t, Math.min(bd, stepSec * 1.5), 0.05, 0.5);
    }
    var an = s.arp[i];
    if (an) {
      note('p12', midi(an + tr), t, Math.min(s.arpDur[i] * stepSec, 0.14), layer >= 2 || rush ? 0.09 : 0.06, 0.4);
    }
    var d = s.drum[i];
    if (d) playDrums(d, t, layer >= 5 || rush);
  }

  function musicTick(beatF, bpm) {
    if (typeof beatF !== 'number' || beatF !== beatF) return;
    if (typeof bpm === 'number' && bpm > 0) sq.bpm = bpm;
    bpm = sq.bpm;
    var last = sq.lastB;
    sq.lastB = beatF;
    if (last === null || beatF < last - 1e-6 || beatF - last > 2) resync(beatF, last !== null && beatF < last);
    if (sq.fresh) { sq.fresh = false; sq.origin = Math.floor(sq.next / 16) * 16; }
    if (!musicOn || !sq.song || !ctx || ctx.state !== 'running' || hidden() || effectiveGain() === 0) {
      // keep the position current so enabling (or unmuting) never plays a burst of old steps
      var c = Math.ceil(beatF * 4 - 1e-6);
      while (sq.next < c) { sq.next++; if (sq.next % 16 === 0) barLine(sq.next); }
      sq.active = false;
      return;
    }
    var now = ctx.currentTime;
    var spb = 60 / bpm;
    var stepSec = spb / 4;
    var lim = (beatF + LOOK / spb) * 4;
    var n = 0;
    while (sq.next <= lim && n < MAX_STEPS) {
      var k = sq.next;
      sq.next = k + 1;
      n++;
      if (k % 16 === 0) barLine(k);
      var t = now + (k / 4 - beatF) * spb;
      if (t < now - LATE) continue;
      if (t < now) t = now;
      try { playStep(k, t, stepSec); } catch (e) { /* ignore */ }
      sq.lastT = t;
    }
    sq.active = true;
  }

  function startMusic() {
    musicOn = true;
  }

  function stopMusic() {
    musicOn = false;
    sq.active = false;
    sq.lastB = null;
  }

  function setLayer(n) { layer = Math.max(0, n | 0); }

  function setRush(b) {
    rush = !!b;
    if (musicTone && ctx) {
      try { musicTone.frequency.setTargetAtTime(rush ? 11000 : 5200, ctx.currentTime, 0.05); } catch (e) { /* ignore */ }
    }
  }

  function onVisibility() {
    if (!ctx) return;
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
    if (MP.save) muted = !!MP.save.load().mute;
  } catch (e) { /* ignore */ }

  MP.audio = {
    unlock: unlock,
    setMuted: setMuted,
    isMuted: isMuted,
    setAdMuted: setAdMuted,
    puff: puff,
    smash: smash,
    pip: pip,
    boing: boing,
    perfect: perfect,
    whoosh: whoosh,
    crack: crack,
    snap: snap,
    chime: chime,
    aww: aww,
    lolli: lolli,
    holdTick: holdTick,
    holdEnd: holdEnd,
    setLayer: setLayer,
    setRush: setRush,
    setSong: setSong,
    musicTick: musicTick,
    unlockJingle: unlockJingle,
    startMusic: startMusic,
    stopMusic: stopMusic,
    setPopNote: function (n) { popOffset = (n | 0) % 5; },
    get songId() { return sq.song ? sq.song.id : null; },
    get context() { return ctx; },
    // test helpers (no effect on play)
    _setHook: function (fn) { hook = typeof fn === 'function' ? fn : null; },
    _state: function () {
      return { song: sq.song ? sq.song.id : null, pend: sq.pend ? sq.pend.id : null, origin: sq.origin,
        next: sq.next, lastB: sq.lastB, tr: sq.tr, active: sq.active, root: ROOT, layer: layer, rush: rush };
    },
    _ensure: ensureCtx
  };
})();
