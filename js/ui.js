(function () {
  var MP = window.MP = window.MP || {};
  var U = MP.ui = {};
  var G, cur = null, back = 'menu', toastTimer = 0, savedWarned = false, pendingUnlocks = null, countTimer = 0, armed = false, unlockTimer = 0;

  function $(id) { return document.getElementById(id); }
  function show(el, on) { el.classList.toggle('hidden', !on); }
  function data() { return G.getData(); }
  function press(id, fn) { $(id).addEventListener('click', function (e) { e.stopPropagation(); fn(e); try { e.currentTarget.blur(); } catch (x) { /* ignore */ } }); }

  function drawSkin(cv, id, size, locked) {
    var c = cv.getContext('2d');
    c.clearRect(0, 0, cv.width, cv.height);
    if (!MP.skins || !MP.skins.draw) return;
    MP.skins.draw(c, id, cv.width / 2, cv.height / 2 - cv.height * 0.04, cv.width * size, { sx: 1, sy: 1 }, 'happy');
    if (locked) {
      c.globalCompositeOperation = 'source-atop';
      c.fillStyle = '#c2b4d8'; c.fillRect(0, 0, cv.width, cv.height);
      c.globalCompositeOperation = 'source-over';
    }
  }

  U.resize = function () {
    var w = window.innerWidth, h = window.innerHeight;
    var u = h >= w ? Math.min(w / 9, h / 16) : Math.min(w / 16, h / 9);
    document.documentElement.style.setProperty('--u', u + 'px');
  };

  U.toast = function (msg, ms) {
    var t = $('toast');
    t.textContent = msg; show(t, true);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { show(t, false); }, ms || 2200);
  };

  U.refreshMute = function () {
    var m = MP.audio && MP.audio.isMuted ? MP.audio.isMuted() : false;
    $('btnMute').classList.toggle('muted', !!m);
  };

  U.setPlaying = function (on) { show($('btnPause'), !!on); };

  function menuInfo() {
    var d = data();
    $('menuBest').textContent = d.best > 0 ? 'Best ' + d.best : '';
    drawSkin($('menuSkin'), G.skinId(), 0.8, false);
    $('musicName').textContent = styleOf(curStyle()).name;
  }

  function buildSkins() {
    var d = data(), grid = $('skinGrid');
    grid.innerHTML = '';
    var list = (MP.skins && MP.skins.list) || [];
    list.forEach(function (s) {
      var un = MP.skins.isUnlocked(s.id, d);
      var card = document.createElement('div');
      card.className = 'card' + (d.skin === s.id ? ' sel' : '') + (un ? '' : ' locked');
      var cv = document.createElement('canvas'); cv.width = 96; cv.height = 96;
      card.appendChild(cv);
      var nm = document.createElement('div');
      nm.textContent = un ? s.name : (s.featText || Math.max(0, s.gatesRequired - (d.totalGates || 0)) + ' gates');
      card.appendChild(nm);
      if (!un) card.insertAdjacentHTML('beforeend', '<svg class="lock" viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2.4"/></svg>');
      card.style.pointerEvents = 'auto';
      card.addEventListener('click', function () {
        if (!un) return;
        d.skin = s.id;
        if (MP.audio && MP.audio.setPopNote) MP.audio.setPopNote(s.popNote);
        if (MP.save && MP.save.write) MP.save.write(d);
        buildSkins();
      });
      grid.appendChild(card);
      drawSkin(cv, s.id, 0.78, !un);
    });
  }

  function goalText(g) {
    if (MP.save && MP.save.goalText) return MP.save.goalText(g);
    return g.id + ' ' + g.target;
  }

  function buildGoals() {
    var d = data(), list = $('goalList');
    list.innerHTML = '';
    var gl = (d.goals && d.goals.list) || [];
    gl.forEach(function (g) {
      var el = document.createElement('div');
      el.className = 'goal' + (g.done ? ' done' : '');
      el.innerHTML = '<div><span></span> <b class="tick"></b></div><div class="gbar"><i></i></div>';
      el.querySelector('span').textContent = goalText(g) + '  ' + Math.min(g.progress, g.target) + '/' + g.target;
      el.querySelector('.tick').textContent = g.done ? 'DONE' : '';
      el.querySelector('i').style.width = Math.min(100, 100 * g.progress / g.target) + '%';
      list.appendChild(el);
    });
    $('dailyBest').textContent = d.dailyBest > 0 ? 'Daily best ' + d.dailyBest : '';
    var st = $('stickers'), html = '', n = Math.max(20, d.stickers || 0);
    for (var i = 0; i < n; i++) html += '<i class="' + (i < (d.stickers || 0) ? 'on' : '') + '"></i>';
    st.innerHTML = html;
  }

  var STYLES = [
    { id: 'box', name: 'Music Box', desc: 'Cute bells and marimba', ic: '\u2726' },
    { id: 'soft', name: 'Soft Chip', desc: 'Cosy retro chiptune', ic: '\u266A' },
    { id: 'pop', name: 'Synth Pop', desc: 'Bright and punchy', ic: '\u26A1' },
    { id: 'auto', name: 'Auto', desc: 'Changes with each zone: cute first, energetic later', ic: '\u21BB' }
  ];
  function styleOf(id) { for (var i = 0; i < STYLES.length; i++) if (STYLES[i].id === id) return STYLES[i]; return STYLES[0]; }
  function curStyle() { return (G.getMusicStyle && G.getMusicStyle()) || data().musicStyle || 'box'; }

  function buildMusic() {
    var list = $('musicList'), cur = curStyle();
    list.innerHTML = '';
    STYLES.forEach(function (s) {
      var b = document.createElement('button');
      b.className = 'mopt' + (s.id === cur ? ' sel' : '');
      b.innerHTML = '<i class="ic"></i><div><b></b><span></span></div>';
      b.querySelector('.ic').textContent = s.ic; b.querySelector('b').textContent = s.name; b.querySelector('span').textContent = s.desc;
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        if (G.setMusicStyle) G.setMusicStyle(s.id); else { data().musicStyle = s.id; if (MP.save && MP.save.write) MP.save.write(data()); }
        if (MP.audio && MP.audio.previewStyle) { try { MP.audio.previewStyle(s.id); } catch (x) { /* ignore */ } }
        buildMusic();
      });
      list.appendChild(b);
    });
  }

  U.showScreen = function (name) {
    ['menu', 'result', 'pause', 'skins', 'goals', 'music'].forEach(function (s) { show($(s), s === name); });
    cur = name;
    clearTimeout(unlockTimer);
    clearTimeout(toastTimer); show($('toast'), false);
    if (name === 'menu') { back = 'menu'; menuInfo(); }
    if (name === 'skins') buildSkins();
    if (name === 'goals') buildGoals();
    if (name === 'music') buildMusic();
    show($('unlock'), false);
  };

  function countUp(el, to) {
    clearInterval(countTimer);
    var t0 = Date.now(), dur = Math.min(700, 250 + to * 4);
    el.textContent = to > 20 ? '0' : String(to);
    if (to <= 20) return;
    countTimer = setInterval(function () {
      var k = Math.min(1, (Date.now() - t0) / dur);
      el.textContent = String(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k >= 1) clearInterval(countTimer);
    }, 30);
  }

  U.showResult = function (r) {
    if (!r) return;
    U.showScreen('result');
    U.setPlaying(false);
    back = 'result';
    var el = $('result');
    el.classList.add('arming'); armed = false;
    setTimeout(function () { el.classList.remove('arming'); armed = true; }, 280);
    countUp($('resScore'), r.score);
    $('resBest').textContent = r.best;
    $('resGates').textContent = r.gates;
    show($('newBest'), r.isBest);
    var head = $('resHead');
    head.textContent = r.isBest ? '' : (r.headline || '');
    show(head, !r.isBest && !!r.headline);
    var sub = $('resSub');
    sub.textContent = r.sub || '';
    show(sub, !!r.sub);
    var tb = $('resToBest'), showBar = !r.isBest && r.prevBest > 0;
    show(tb, showBar);
    if (showBar) {
      var bar = $('resToBestBar');
      bar.style.width = '0%';
      setTimeout(function () { bar.style.width = Math.min(100, 100 * r.score / r.prevBest) + '%'; }, 60);
    }
    var nu = $('nextUnlock');
    if (r.next) {
      show(nu, true);
      $('nextTxt').textContent = r.next.text != null ? r.next.text : r.next.remain;
      $('nextBar').style.width = Math.min(100, r.next.frac * 100) + '%';
      drawSkin($('nextCv'), r.next.skin.id, 0.8, true);
    } else show(nu, false);
    var kind = r.reviveKind || (r.canRevive ? 'ad' : null);
    if (kind === 'ad' && !(MP.sdk && MP.sdk.rewardedAvailable && MP.sdk.rewardedAvailable())) kind = null;
    var rv = $('btnRevive');
    rv.disabled = false;
    rv.classList.toggle('freeRev', kind === 'free');
    $('reviveTxt').textContent = kind === 'free' ? 'Free Revive' : 'Revive';
    show(rv, !!kind);
    drawSkin($('resSkin'), G.skinId(), 0.8, false);
    if (r.isBest) G.confetti();
    pendingUnlocks = r.unlocked && r.unlocked.length ? r.unlocked.slice() : null;
    var gc = $('resGoal'), ng = r.goals ? r.goals.length : 0;
    gc.textContent = '\u2605 Goal done! +' + ng;
    show(gc, ng > 0);
    if (pendingUnlocks) unlockTimer = setTimeout(openUnlock, 700);
  };

  // Space / Enter on the result screen = Retry (keyboard players never have to reach for the mouse)
  U.retryKey = function () {
    if (cur !== 'result' || G.state.mode !== 'dead') return false;
    if (!$('unlock').classList.contains('hidden')) { closeUnlock(); return true; }
    if (armed) G.startRun({ daily: G.state.daily });
    return true;
  };

  // one popup for every skin unlocked by this result
  function openUnlock() {
    var list = pendingUnlocks;
    pendingUnlocks = null;
    if (!list || !list.length || cur !== 'result') return;
    var multi = list.length > 1, box = $('unlock'), grid = $('unlockGrid');
    box.classList.toggle('multi', multi);
    $('unlockTitle').textContent = multi ? 'New friends!' : 'New friend!';
    show($('unlockCv'), !multi); show($('unlockName'), !multi);
    show(grid, multi); show($('unlockBtnTxt'), multi);
    $('btnUnlockOk').setAttribute('aria-label', multi ? 'Claim all' : 'OK');
    grid.innerHTML = '';
    if (multi) {
      list.forEach(function (s) {
        var card = document.createElement('div');
        card.className = 'ucard';
        var cv = document.createElement('canvas'); cv.width = 96; cv.height = 96;
        card.appendChild(cv);
        var nm = document.createElement('div');
        nm.textContent = s.name;
        card.appendChild(nm);
        grid.appendChild(card);
        drawSkin(cv, s.id, 0.78, false);
      });
      grid.scrollTop = 0;
    } else {
      drawSkin($('unlockCv'), list[0].id, 0.8, false);
      $('unlockName').textContent = list[0].name;
    }
    show(box, true);
    if (MP.audio && MP.audio.unlockJingle) MP.audio.unlockJingle();
    G.confetti();
  }

  function closeUnlock() { pendingUnlocks = null; show($('unlock'), false); }

  U.reviveFailed = function () { show($('btnRevive'), false); };

  U.init = function () {
    G = MP.game;
    U.resize();
    U.refreshMute();
    press('btnPlay', function () { G.startRun({ daily: false }); });
    press('btnDaily', function () { G.startRun({ daily: true }); });
    press('btnSkins', function () { back = 'menu'; U.showScreen('skins'); });
    press('btnGoals', function () { U.showScreen('goals'); });
    press('btnSkinsBack', function () { U.showScreen(back === 'result' ? 'result' : 'menu'); if (back === 'result') { $('resSkin') && drawSkin($('resSkin'), G.skinId(), 0.8, false); } });
    press('btnGoalsBack', function () { U.showScreen('menu'); });
    press('btnMusic', function () { U.showScreen('music'); });
    press('btnMusicBack', function () { U.showScreen('menu'); });
    press('btnRetry', function () { G.startRun({ daily: G.state.daily }); });
    press('btnRevive', function () { $('btnRevive').disabled = true; G.revive(); });
    press('btnResHome', function () { G.toMenu(); });
    press('btnResSkins', function () { back = 'result'; U.showScreen('skins'); });
    press('btnResume', function () { G.resume(); });
    press('btnPauseHome', function () { G.toMenu(); });
    press('btnPause', function () { G.pause(); });
    press('btnUnlockOk', closeUnlock);
    press('btnMute', function () {
      var m = MP.audio && MP.audio.isMuted ? !MP.audio.isMuted() : false;
      if (MP.audio && MP.audio.setMuted) MP.audio.setMuted(m);
      var d = data(); d.mute = m;
      if (MP.save && MP.save.write) MP.save.write(d);
      U.refreshMute();
    });
    if (MP.save && MP.save.persistent === false && !savedWarned) { savedWarned = true; U.toast("Progress won't save", 3500); }
  };
})();
