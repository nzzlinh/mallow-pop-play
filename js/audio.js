(function () {
  'use strict';
  window.MP = window.MP || {};

  var PENTA = [0, 2, 4, 7, 9]; // major pentatonic semitones
  var ROOT = 60; // C4

  var ctx = null;
  var master = null;
  var musicBus = null;
  var noiseBuf = null;
  var muted = false;
  var adMuted = false;
  var musicOn = false;
  var musicTimer = null;
  var nextBeat = 0;
  var beatIdx = 0;
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

  function applyGain() {
    if (!ctx || !master) return;
    try {
      var t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setTargetAtTime(effectiveGain() * 0.8, t, 0.02);
    } catch (e) { /* ignore */ }
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
      musicBus.gain.value = 0.22;
      musicBus.connect(master);
      var len = Math.floor(ctx.sampleRate * 0.5);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) {
      ctx = null;
    }
    return ctx;
  }

  function ready() {
    return ctx && ctx.state === 'running' && !document.hidden;
  }

  function tone(type, freq, t, dur, vol, dest, freqEnd) {
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = type;
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

  function noise(t, dur, vol, f0, f1, dest) {
    var s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    var f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.3);
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
    if (musicOn) scheduleMusic();
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

  // ---- music: 8 bars of 4 beats, 104 bpm, pentatonic melody over a simple bass ----
  var BEAT = 60 / 104;
  var BASS = [0, 0, 7, 7, 9, 9, 4, 7]; // semitones from C, one per bar
  var MELODY = [
    4, -1, 7, 9, 7, -1, 4, 2,
    0, 2, 4, -1, 7, 4, 2, -1,
    9, 7, 4, 7, 9, -1, 12, 9,
    7, 4, 2, 4, 0, -1, -1, -1
  ]; // 32 steps of half-bars (2 beats each => eighth pairs); -1 = rest

  // Layers build with the zone: 1 = hi-hat, 2 = bass octave, 3 = counter-melody, 4+ = brighter key. Sugar Rush lifts it 2 semitones.
  function playStep(step, t) {
    var bar = Math.floor(step / 8) % 8;
    var inBar = step % 8; // eighth notes
    var tr = (layer >= 4 ? 2 : 0) + (rush ? 2 : 0);
    if (inBar % 4 === 0) {
      tone('sine', midi(ROOT - 24 + BASS[bar] + tr), t, BEAT * 1.8, 0.5, musicBus);
    }
    if (layer >= 2 && inBar % 4 === 2) {
      tone('sine', midi(ROOT - 12 + BASS[bar] + tr), t, BEAT * 0.5, 0.3, musicBus);
    }
    if (inBar % 2 === 1) {
      tone('triangle', midi(ROOT + 12 + PENTA[(bar + inBar) % 5] + tr), t, BEAT * 0.3, 0.12, musicBus);
    }
    if (layer >= 1 || rush) noise(t, 0.04, inBar % 2 ? 0.16 : 0.07, 7000, 9000, musicBus);
    var m = MELODY[Math.floor(step / 2) % MELODY.length];
    if (step % 2 === 0 && m >= 0) {
      tone('sine', midi(ROOT + 12 + m + tr), t, BEAT * 0.9, 0.4, musicBus);
    }
    if (layer >= 3 && step % 4 === 2) {
      var cm = MELODY[(Math.floor(step / 2) + 8) % MELODY.length];
      if (cm >= 0) tone('triangle', midi(ROOT + 24 + cm + tr), t, BEAT * 0.5, 0.1, musicBus);
    }
  }

  function pump() {
    if (!ctx || !musicOn) return;
    if (ctx.state !== 'running') { nextBeat = ctx.currentTime + 0.05; return; }
    var ahead = ctx.currentTime + 0.4;
    if (nextBeat < ctx.currentTime) nextBeat = ctx.currentTime + 0.05;
    while (nextBeat < ahead) {
      playStep(beatIdx, nextBeat);
      beatIdx = (beatIdx + 1) % 64;
      nextBeat += BEAT / 2;
    }
  }

  function scheduleMusic() {
    if (musicTimer || !ctx) return;
    nextBeat = ctx.currentTime + 0.05;
    musicTimer = setInterval(pump, 120);
  }

  function startMusic() {
    musicOn = true;
    if (ctx) scheduleMusic();
  }

  function stopMusic() {
    musicOn = false;
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
    beatIdx = 0;
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
    setLayer: function (n) { layer = n | 0; },
    setRush: function (b) { rush = !!b; },
    unlockJingle: unlockJingle,
    startMusic: startMusic,
    stopMusic: stopMusic,
    setPopNote: function (n) { popOffset = (n | 0) % 5; },
    get context() { return ctx; }
  };
})();
