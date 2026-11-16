(function () {
  var MP = window.MP = window.MP || {};
  window.__mp = MP;
  var G = MP.game, cv = document.getElementById('game'), last = 0;

  function unlockAudio() {
    if (MP.audio && MP.audio.unlock) { try { MP.audio.unlock(); } catch (e) { /* ignore */ } }
  }

  function resize() {
    MP.render.resize();
    MP.ui.resize();
  }

  function frame(ts) {
    requestAnimationFrame(frame);
    var dt = last ? (ts - last) / 1000 : 0.016;
    last = ts;
    if (dt > 0.05) dt = 0.05;
    G.update(dt, performance.now());
    MP.render.draw(G);
  }

  function boot() {
    MP.render.init(cv);
    G.init();
    MP.ui.init();
    var d = G.getData();
    if (MP.audio && MP.audio.setMuted && d.mute) MP.audio.setMuted(true);
    MP.ui.refreshMute();
    MP.ui.showScreen('menu');

    // press = puff, hold = stay big, let go = shrink
    var activeId = null, keyDown = false, lastX = 0, lastY = 0, held = {};
    function keyDir(k) {
      if (k === 'ArrowLeft' || k === 'a' || k === 'A' || k === 'ArrowUp' || k === 'w' || k === 'W') return -1;
      if (k === 'ArrowRight' || k === 'd' || k === 'D' || k === 'ArrowDown' || k === 's' || k === 'S') return 1;
      return 0;
    }
    function applyDir() {
      var dir = 0;
      if (held[-1] && !held[1]) dir = -1; else if (held[1] && !held[-1]) dir = 1;
      if (G.steerDir) G.steerDir(dir);
    }
    function clearKeys() { held = {}; applyDir(); }
    function up(e) {
      if (activeId === null || (e && e.pointerId !== activeId)) return;
      activeId = null;
      G.release(e ? e.timeStamp : undefined);
    }
    cv.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      unlockAudio();
      if (activeId !== null) G.release(e.timeStamp);
      activeId = e.pointerId;
      lastX = e.clientX; lastY = e.clientY;
      G.tap(e.timeStamp);
    });
    window.addEventListener('pointermove', function (e) {
      if (activeId === null || e.pointerId !== activeId) return;
      var dx = e.clientX - lastX, dy = e.clientY - lastY, L = MP.render && MP.render.layout;
      lastX = e.clientX; lastY = e.clientY;
      if (!G.steer || !L || !L.S) return;
      var d = L.portrait ? dx : dy;
      if (d) G.steer(d / L.S);
    });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    document.addEventListener('pointerdown', unlockAudio, true);
    document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    window.addEventListener('keydown', function (e) {
      unlockAudio();
      var k = e.key, sd = keyDir(k);
      if (sd) {
        e.preventDefault();
        held[sd] = true; applyDir();
        return;
      }
      if (k === ' ' || k === 'Spacebar' || e.code === 'Space') {
        e.preventDefault();
        if (e.repeat || keyDown) return;
        if (MP.ui.retryKey && MP.ui.retryKey()) return;
        keyDown = true;
        G.tap(e.timeStamp);
      } else if (k === 'Enter') {
        if (!e.repeat && MP.ui.retryKey && MP.ui.retryKey()) e.preventDefault();
      } else if (k === 'Escape' || k === 'p' || k === 'P') {
        e.preventDefault();
        if (!e.repeat) G.togglePause();
      }
    });
    window.addEventListener('keyup', function (e) {
      var sd = keyDir(e.key);
      if (sd) { held[sd] = false; applyDir(); return; }
      if (e.key === ' ' || e.key === 'Spacebar' || e.code === 'Space') { if (keyDown) { keyDown = false; G.release(e.timeStamp); } }
    });
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', function () { setTimeout(resize, 100); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) { activeId = null; keyDown = false; clearKeys(); G.release(); G.pause(); } });
    window.addEventListener('blur', function () { activeId = null; keyDown = false; clearKeys(); G.release(); G.pause(); });

    if (MP.sdk) {
      var done = function () { if (MP.sdk.loadingFinished) MP.sdk.loadingFinished(); };
      try { Promise.resolve(MP.sdk.init()).then(done, done); } catch (err) { done(); }
    }
    requestAnimationFrame(frame);
  }

  boot();
})();
