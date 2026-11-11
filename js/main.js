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
    var activeId = null, keyDown = false;
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
      G.tap(e.timeStamp);
    });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    document.addEventListener('pointerdown', unlockAudio, true);
    document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    window.addEventListener('keydown', function (e) {
      unlockAudio();
      var k = e.key;
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
      if (e.key === ' ' || e.key === 'Spacebar' || e.code === 'Space') { if (keyDown) { keyDown = false; G.release(e.timeStamp); } }
    });
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', function () { setTimeout(resize, 100); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) { activeId = null; keyDown = false; G.release(); G.pause(); } });
    window.addEventListener('blur', function () { activeId = null; keyDown = false; G.release(); G.pause(); });

    if (MP.sdk) {
      var done = function () { if (MP.sdk.loadingFinished) MP.sdk.loadingFinished(); };
      try { Promise.resolve(MP.sdk.init()).then(done, done); } catch (err) { done(); }
    }
    requestAnimationFrame(frame);
  }

  boot();
})();
