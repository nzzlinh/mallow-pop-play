(function () {
  'use strict';
  window.MP = window.MP || {};

  var INIT_TIMEOUT = 4000;
  var AD_TIMEOUT = 70000;

  var mode = 'none'; // 'poki' | 'crazy' | 'none'
  var inited = false;
  var initPromise = null;
  var adShowing = false;
  var playing = false;
  var adblock = false;

  function safe(fn) {
    try { return fn(); } catch (e) { return undefined; }
  }

  function withTimeout(p, ms, fallback) {
    return new Promise(function (resolve) {
      var done = false;
      var t = setTimeout(function () {
        if (!done) { done = true; resolve(fallback); }
      }, ms);
      Promise.resolve(p).then(function (v) {
        if (!done) { done = true; clearTimeout(t); resolve(v); }
      }, function () {
        if (!done) { done = true; clearTimeout(t); resolve(fallback); }
      });
    });
  }

  function setAdMuted(b) {
    safe(function () {
      if (MP.audio && MP.audio.setAdMuted) MP.audio.setAdMuted(b);
    });
  }

  function crazy() {
    return window.CrazyGames && window.CrazyGames.SDK;
  }

  function init() {
    if (initPromise) return initPromise;
    initPromise = new Promise(function (resolve) {
      var p = null;
      try {
        if (window.PokiSDK && typeof window.PokiSDK.init === 'function') {
          mode = 'poki';
          p = window.PokiSDK.init();
        } else if (crazy() && typeof crazy().init === 'function') {
          mode = 'crazy';
          p = crazy().init();
        }
      } catch (e) {
        mode = 'none';
        p = null;
      }
      if (!p) { mode = 'none'; inited = true; resolve(); return; }
      var ok = false;
      withTimeout(Promise.resolve(p).then(function () { ok = true; }), INIT_TIMEOUT, null)
        .then(function () {
          if (!ok) {
            // Poki rejects init when an ad blocker is active but the game still runs.
            if (mode === 'poki') adblock = true;
            mode = 'none';
          }
          inited = true;
          resolve();
        });
    });
    return initPromise;
  }

  function loadingFinished() {
    safe(function () {
      if (mode === 'poki' && window.PokiSDK.gameLoadingFinished) window.PokiSDK.gameLoadingFinished();
      else if (mode === 'crazy' && crazy().game && crazy().game.loadingStop) crazy().game.loadingStop();
    });
  }

  function gameplayStart() {
    if (adShowing || playing) return;
    playing = true;
    safe(function () {
      if (mode === 'poki') window.PokiSDK.gameplayStart();
      else if (mode === 'crazy' && crazy().game) crazy().game.gameplayStart();
    });
  }

  function gameplayStop() {
    if (adShowing || !playing) return;
    playing = false;
    safe(function () {
      if (mode === 'poki') window.PokiSDK.gameplayStop();
      else if (mode === 'crazy' && crazy().game) crazy().game.gameplayStop();
    });
  }

  // Runs an ad. Resolves {shown:boolean, rewarded:boolean}; never rejects.
  function runAd(kind) {
    return new Promise(function (resolve) {
      var finished = false;
      var wasPlaying = playing;
      function done(shown, rewarded) {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        adShowing = false;
        setAdMuted(false);
        resolve({ shown: shown, rewarded: rewarded });
      }
      var timer = setTimeout(function () { done(false, false); }, AD_TIMEOUT);
      if (wasPlaying) gameplayStop();
      adShowing = true;
      if (mode !== 'crazy') setAdMuted(true);
      try {
        if (mode === 'poki') {
          var P = window.PokiSDK;
          if (kind === 'rewarded') {
            Promise.resolve(P.rewardedBreak()).then(function (ok) {
              done(true, ok === true);
            }, function () { done(false, false); });
          } else {
            Promise.resolve(P.commercialBreak()).then(function () {
              done(true, false);
            }, function () { done(false, false); });
          }
        } else if (mode === 'crazy') {
          crazy().ad.requestAd(kind === 'rewarded' ? 'rewarded' : 'midgame', {
            adStarted: function () { setAdMuted(true); },
            adFinished: function () { done(true, kind === 'rewarded'); },
            adError: function (err) {
              var code = err && (err.code || err);
              if (code === 'adblock' || code === 'adblockerDetected') adblock = true;
              done(false, false);
            }
          });
        } else {
          done(false, false);
        }
      } catch (e) {
        done(false, false);
      }
    });
  }

  function commercialBreak() {
    if (mode === 'none' || adShowing) return Promise.resolve();
    return runAd('midgame').then(function () {}, function () {});
  }

  function rewardedAvailable() {
    return mode !== 'none' && !adblock && !adShowing;
  }

  function rewardedBreak() {
    if (!rewardedAvailable()) return Promise.resolve(false);
    return runAd('rewarded').then(function (r) {
      return r.rewarded === true;
    }, function () { return false; });
  }

  MP.sdk = {
    init: init,
    loadingFinished: loadingFinished,
    gameplayStart: gameplayStart,
    gameplayStop: gameplayStop,
    commercialBreak: commercialBreak,
    rewardedBreak: rewardedBreak,
    rewardedAvailable: rewardedAvailable,
    get mode() { return mode; },
    get adShowing() { return adShowing; }
  };
})();
