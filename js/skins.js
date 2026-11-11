(function () {
  'use strict';
  window.MP = window.MP || {};

  // feat = skill unlock (set in save.feats); gatesRequired = lifetime fallback so nobody is locked out.
  function S(id, name, gates, body, cheek, outline, accent, note, feat, featText) {
    return { id: id, name: name, gatesRequired: gates, feat: feat || '', featText: featText || '', colors: { body: body, cheek: cheek, outline: outline, accent: accent }, popNote: note };
  }

  var list = [
    S('mallow', 'Mallow', 0, '#fff4f8', '#ffa8c5', '#d9709a', '#ffd1e3', 0),
    S('bao', 'Bao Bun', 50, '#fff1dc', '#ffae9c', '#c98a58', '#f2c48e', 1),
    S('pudding', 'Pudding', 150, '#ffd978', '#ff9b8a', '#c2822a', '#7a4a1e', 2, 'gates20', '20 gates in one run'),
    S('mochi', 'Mochi', 300, '#e9fbf1', '#ffb3c8', '#6fb592', '#9fe3c1', 3, 'combo3', 'Reach combo x3'),
    S('peachy', 'Peachy', 500, '#ffb58f', '#ff7f8e', '#c9674a', '#7ccf7a', 4, 'lolli3', '3 lollipops in one run'),
    S('bunny', 'Bunny Bun', 800, '#f4ecff', '#ffa3c8', '#9a7fcf', '#ffc3dc', 0, 'zone1', 'Reach Candy Clouds'),
    S('panda', 'Panda Dumpling', 1200, '#ffffff', '#ffa3b0', '#4f4f6a', '#4f4f6a', 1, 'goals3', 'All 3 daily goals'),
    S('strawberry', 'Strawberry Jelly', 1800, '#ff7b8f', '#ffc2cc', '#c43c5a', '#6fcf6a', 2, 'rush', 'Start a Sugar Rush'),
    S('cloud', 'Cloud Puff', 2500, '#e4f3ff', '#ffb8d0', '#7fa9d9', '#ffffff', 3, 'zone2', 'Reach Jelly Lake'),
    S('icecream', 'Ice-Cream Pop', 3500, '#ffd3e6', '#ff8fb3', '#c9709a', '#f2c48e', 4, 'perfect10', '10 PERFECTs in a row'),
    S('dino', 'Dino Egg', 5000, '#c9f2c0', '#ffb3a3', '#5fa36a', '#ffe58a', 0, 'stickers12', 'Collect 12 stickers'),
    S('rainbow', 'Rainbow Mallow', 10000, '#fff8e6', '#ffa3c8', '#b98adf', '#ff9bd0', 2, 'zone4', 'Reach Starlight Sundae')
  ];

  var byId = {};
  list.forEach(function (s) { byId[s.id] = s; });

  var RAINBOW = ['#ff7b8f', '#ffb86b', '#ffe066', '#7be0a0', '#7bc4ff', '#b58cff'];

  function isUnlocked(id, d) {
    var s = byId[id];
    if (!s) return false;
    if (s.gatesRequired === 0) return true;
    d = d || {};
    if (d.unlocked && d.unlocked.indexOf(id) >= 0) return true;
    if ((d.totalGates || 0) >= s.gatesRequired) return true;
    if (s.feat && d.feats && d.feats[s.feat]) return true;
    if (id === 'rainbow' && (d.stickers || 0) >= 20) return true;
    return false;
  }

  function newlyUnlocked(prev, next) {
    return list.filter(function (s) {
      return s.gatesRequired > 0 && s.gatesRequired > prev && s.gatesRequired <= next;
    });
  }

  function circle(ctx, x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
  }

  function fillStroke(ctx, fill, stroke, lw) {
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = lw;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }

  // Back parts (ears, leaf, spikes) drawn before the body. Unit space: body radius = 1.
  function drawBack(ctx, s, c, lw) {
    var id = s.id;
    if (id === 'bunny') {
      [-0.42, 0.42].forEach(function (ex) {
        ctx.beginPath();
        ctx.ellipse(ex, -1.1, 0.2, 0.55, ex * 0.35, 0, Math.PI * 2);
        fillStroke(ctx, c.body, c.outline, lw);
        ctx.beginPath();
        ctx.ellipse(ex, -1.08, 0.09, 0.36, ex * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = c.accent;
        ctx.fill();
      });
    } else if (id === 'panda') {
      [-0.68, 0.68].forEach(function (ex) {
        circle(ctx, ex, -0.72, 0.28);
        fillStroke(ctx, c.accent, c.outline, lw);
      });
    } else if (id === 'dino') {
      for (var i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 0.4 - 0.18, -0.92);
        ctx.lineTo(i * 0.4, -1.3 + Math.abs(i) * 0.12);
        ctx.lineTo(i * 0.4 + 0.18, -0.92);
        ctx.closePath();
        fillStroke(ctx, c.accent, c.outline, lw);
      }
    } else if (id === 'peachy') {
      ctx.beginPath();
      ctx.ellipse(0.2, -1.02, 0.34, 0.16, -0.5, 0, Math.PI * 2);
      fillStroke(ctx, c.accent, c.outline, lw);
    } else if (id === 'strawberry') {
      ctx.beginPath();
      for (var k = 0; k < 5; k++) {
        var a = -Math.PI / 2 + (k - 2) * 0.55;
        ctx.moveTo(0, -0.95);
        ctx.quadraticCurveTo(Math.cos(a) * 0.6, -0.95 + Math.sin(a) * 0.6 - 0.1,
          Math.cos(a) * 0.5 + (k - 2) * 0.05, -0.95 + Math.sin(a) * 0.5 - 0.2);
        ctx.quadraticCurveTo(Math.cos(a) * 0.3, -0.95 + Math.sin(a) * 0.3, 0, -0.95);
      }
      fillStroke(ctx, c.accent, c.outline, lw);
    } else if (id === 'icecream') {
      ctx.beginPath();
      ctx.moveTo(-0.5, 0.7);
      ctx.lineTo(0, 1.55);
      ctx.lineTo(0.5, 0.7);
      ctx.closePath();
      fillStroke(ctx, c.accent, c.outline, lw);
    } else if (id === 'cloud') {
      [[-0.75, 0.1, 0.4], [0.75, 0.1, 0.4], [-0.35, -0.75, 0.42], [0.35, -0.8, 0.46]].forEach(function (b) {
        circle(ctx, b[0], b[1], b[2]);
        fillStroke(ctx, c.body, c.outline, lw);
      });
    }
  }

  function bodyPath(ctx, id) {
    if (id === 'bao') {
      ctx.beginPath();
      ctx.ellipse(0, 0.05, 1.05, 0.92, 0, 0, Math.PI * 2);
    } else if (id === 'dino') {
      ctx.beginPath();
      ctx.ellipse(0, 0, 0.9, 1.05, 0, 0, Math.PI * 2);
    } else if (id === 'mochi') {
      ctx.beginPath();
      ctx.ellipse(0, 0.08, 1.1, 0.88, 0, 0, Math.PI * 2);
    } else if (id === 'pudding') {
      ctx.beginPath();
      ctx.moveTo(-0.85, 0.85);
      ctx.quadraticCurveTo(-1.05, -0.1, -0.7, -0.6);
      ctx.quadraticCurveTo(0, -1.05, 0.7, -0.6);
      ctx.quadraticCurveTo(1.05, -0.1, 0.85, 0.85);
      ctx.quadraticCurveTo(0, 1.05, -0.85, 0.85);
      ctx.closePath();
    } else {
      circle(ctx, 0, 0, 1);
    }
  }

  function drawFront(ctx, s, c, lw) {
    var id = s.id;
    if (id === 'pudding') {
      ctx.beginPath();
      ctx.moveTo(-0.9, -0.5);
      ctx.quadraticCurveTo(-0.4, -0.2, 0, -0.55);
      ctx.quadraticCurveTo(0.45, -0.2, 0.9, -0.5);
      ctx.quadraticCurveTo(0.7, -0.95, 0, -1);
      ctx.quadraticCurveTo(-0.7, -0.95, -0.9, -0.5);
      ctx.fillStyle = c.accent;
      ctx.fill();
    } else if (id === 'dino') {
      [[-0.55, -0.4, 0.14], [0.6, -0.25, 0.12], [0.45, 0.6, 0.1]].forEach(function (p) {
        circle(ctx, p[0], p[1], p[2]);
        ctx.fillStyle = c.accent;
        ctx.fill();
      });
    } else if (id === 'icecream') {
      ctx.beginPath();
      ctx.arc(0, -0.62, 0.8, Math.PI * 1.05, Math.PI * 1.95);
      ctx.quadraticCurveTo(0.45, -0.35, 0.2, -0.5);
      ctx.quadraticCurveTo(0, -0.25, -0.25, -0.5);
      ctx.quadraticCurveTo(-0.5, -0.35, -0.78, -0.62);
      ctx.fillStyle = '#9fe3d6';
      ctx.fill();
    } else if (id === 'strawberry') {
      for (var i = 0; i < 6; i++) {
        var a = i * 1.05 + 0.3;
        ctx.beginPath();
        ctx.ellipse(Math.cos(a) * 0.65, Math.sin(a) * 0.6 + 0.15, 0.05, 0.08, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#ffe9a8';
        ctx.fill();
      }
    } else if (id === 'peachy') {
      ctx.beginPath();
      ctx.moveTo(0, -0.95);
      ctx.quadraticCurveTo(-0.25, -0.2, 0, 0.5);
      ctx.strokeStyle = 'rgba(201,103,74,0.45)';
      ctx.lineWidth = lw * 0.8;
      ctx.stroke();
    } else if (id === 'rainbow') {
      for (var j = 0; j < RAINBOW.length; j++) {
        ctx.beginPath();
        ctx.arc(0, 0.25, 0.98 - j * 0.07, Math.PI * 1.18, Math.PI * 1.82);
        ctx.strokeStyle = RAINBOW[j];
        ctx.lineWidth = lw * 0.9;
        ctx.stroke();
      }
    } else if (id === 'panda') {
      [-0.36, 0.36].forEach(function (ex) {
        ctx.beginPath();
        ctx.ellipse(ex, -0.12, 0.2, 0.26, ex * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = c.accent;
        ctx.fill();
      });
    }
  }

  function drawFace(ctx, s, c, lw, expr) {
    var id = s.id;
    var ink = id === 'panda' ? '#2d2d42' : c.outline;
    var ey = id === 'mochi' || id === 'bao' ? 0.0 : -0.1;
    var ex = 0.36;
    var puffed = expr === 'puffed';
    var hit = expr === 'hit';
    var cheekY = ey + 0.3;
    ctx.save();
    // cheeks
    ctx.globalAlpha = 0.85;
    [-0.62, 0.62].forEach(function (cx) {
      ctx.beginPath();
      ctx.ellipse(cx, cheekY, 0.15, 0.1, 0, 0, Math.PI * 2);
      ctx.fillStyle = c.cheek;
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    [-ex, ex].forEach(function (x) {
      if (hit) {
        // X eyes
        ctx.beginPath();
        ctx.moveTo(x - 0.1, ey - 0.1); ctx.lineTo(x + 0.1, ey + 0.1);
        ctx.moveTo(x + 0.1, ey - 0.1); ctx.lineTo(x - 0.1, ey + 0.1);
        ctx.lineWidth = lw * 0.9;
        ctx.strokeStyle = ink;
        ctx.stroke();
      } else if (puffed) {
        // squeezed happy arcs
        ctx.beginPath();
        ctx.arc(x, ey + 0.05, 0.12, Math.PI * 1.1, Math.PI * 1.9);
        ctx.lineWidth = lw * 0.9;
        ctx.strokeStyle = ink;
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.ellipse(x, ey, 0.1, 0.14, 0, 0, Math.PI * 2);
        ctx.fillStyle = id === 'panda' ? '#2d2d42' : '#4a3350';
        ctx.fill();
        circle(ctx, x - 0.035, ey - 0.05, 0.04);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      }
    });
    ctx.beginPath();
    if (hit) {
      ctx.ellipse(0, ey + 0.38, 0.1, 0.12, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#7a3a58';
      ctx.fill();
    } else if (puffed) {
      ctx.ellipse(0, ey + 0.28, 0.13, 0.11, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#7a3a58';
      ctx.fill();
    } else {
      ctx.arc(0, ey + 0.2, 0.14, Math.PI * 0.12, Math.PI * 0.88);
      ctx.lineWidth = lw * 0.8;
      ctx.strokeStyle = ink;
      ctx.stroke();
    }
    ctx.restore();
  }

  // Draws centered at (x,y); size = body diameter in px. Squash is applied from the bottom of the body.
  function draw(ctx, skinId, x, y, size, squash, expression) {
    var s = byId[skinId] || list[0];
    var c = s.colors;
    var sx = squash && squash.sx > 0 ? squash.sx : 1;
    var sy = squash && squash.sy > 0 ? squash.sy : 1;
    var r = size / 2;
    var lw;
    ctx.save();
    ctx.translate(x, y + r);
    ctx.scale(sx, sy);
    ctx.translate(0, -r);
    ctx.scale(r, r);
    lw = 0.1; // unit space line width
    drawBack(ctx, s, c, lw);
    bodyPath(ctx, s.id);
    fillStroke(ctx, c.body, c.outline, lw);
    drawFront(ctx, s, c, lw);
    // soft highlight
    ctx.beginPath();
    ctx.ellipse(-0.45, -0.5, 0.2, 0.11, -0.7, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fill();
    drawFace(ctx, s, c, lw, expression || 'happy');
    ctx.restore();
  }

  MP.skins = {
    list: list,
    get: function (id) { return byId[id] || list[0]; },
    isUnlocked: isUnlocked,
    newlyUnlocked: newlyUnlocked,
    draw: draw
  };
})();
