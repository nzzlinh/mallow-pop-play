(function () {
  var MP = window.MP = window.MP || {};
  var R = MP.render = {};
  var cv, ctx, W = 0, H = 0, dpr = 1, dim = 1;
  var L = R.layout = { portrait: true, S: 40, px: 0, py: 0, ext: 6, ahead: 12, back: 4 };
  var FONT = '"Baloo 2","Fredoka","Arial Rounded MT Bold","Nunito","Trebuchet MS",system-ui,sans-serif';
  var decor = [], streaks = [], i;
  for (i = 0; i < 16; i++) decor.push({ u: Math.random() * 30, v: (Math.random() - 0.5) * 16, r: 0.5 + Math.random() * 1.1, d: 0.12 + Math.random() * 0.3 });
  for (i = 0; i < 14; i++) streaks.push({ u: Math.random() * 20, v: (Math.random() - 0.5) * 14, l: 1 + Math.random() * 2 });

  R.init = function (canvas) {
    cv = canvas; ctx = cv.getContext('2d');
    R.resize();
  };

  R.resize = function () {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    L.portrait = H >= W;
    if (L.portrait) {
      L.S = Math.min(H / 16, W / 6); L.px = W / 2; L.py = H * 0.74;
      L.ahead = L.py / L.S; L.back = (H - L.py) / L.S; L.ext = W / L.S / 2 + 1;
    } else {
      L.S = Math.min(W / 16, H / 6); L.px = W * 0.24; L.py = H * 0.55;
      L.ahead = (W - L.px) / L.S; L.back = L.px / L.S; L.ext = H / L.S / 2 + 1;
    }
    L.w = W; L.h = H;
  };

  R.toScreen = function (u, v) {
    return L.portrait ? { x: L.px + v * L.S, y: L.py - u * L.S } : { x: L.px + u * L.S, y: L.py + v * L.S };
  };
  R.vec = function (du, dv) {
    return L.portrait ? { x: dv, y: -du } : { x: du, y: dv };
  };

  function rr(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
  }

  function starPath(x, y, ro, ri, n, rot) {
    ctx.beginPath();
    for (var k = 0; k < n * 2; k++) {
      var r = k % 2 ? ri : ro, a = rot + k * Math.PI / n - Math.PI / 2;
      if (k) ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
  }

  function text(s, x, y, size, fill, stroke, lw, align) {
    ctx.font = '900 ' + size + 'px ' + FONT;
    ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    if (stroke) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.strokeText(s, x, y); }
    ctx.fillStyle = fill; ctx.fillText(s, x, y);
  }

  function mod(a, b) { return ((a % b) + b) % b; }

  // ---- world pieces (drawn in the track frame: x = distance ahead, y = across) ----
  function drawDecor(pos, speed) {
    var span = L.ahead + L.back + 8, k, d, u;
    ctx.fillStyle = 'rgba(255,255,255,0.38)';
    for (k = 0; k < decor.length; k++) {
      d = decor[k];
      u = mod(d.u - pos * d.d, span) - L.back - 4;
      ctx.beginPath();
      ctx.arc(u, d.v, d.r, 0, 6.2832); ctx.arc(u + d.r * 0.9, d.v + d.r * 0.2, d.r * 0.75, 0, 6.2832); ctx.arc(u - d.r * 0.8, d.v + d.r * 0.25, d.r * 0.65, 0, 6.2832);
      ctx.fill();
    }
    // lane
    var lo = -L.back - 1, hi = L.ahead + 1;
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(lo, -0.75, hi - lo, 1.5);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillRect(lo, -0.8, hi - lo, 0.06); ctx.fillRect(lo, 0.74, hi - lo, 0.06);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (u = mod(-pos, 1.8) + lo - 1.8; u < hi; u += 1.8) ctx.fillRect(u, -0.05, 0.7, 0.1);
    if (speed > 7) {
      ctx.fillStyle = 'rgba(255,255,255,' + Math.min(0.5, (speed - 7) * 0.08) + ')';
      for (k = 0; k < streaks.length; k++) {
        d = streaks[k];
        u = mod(d.u - pos * 1.5, 20) - 4;
        ctx.fillRect(u, d.v + (d.v < 0 ? -1.2 : 1.2), d.l, 0.05);
      }
    }
  }

  function slabEdges(u, h, e, dark) {
    ctx.strokeStyle = dark; ctx.lineWidth = 0.07;
    ctx.beginPath(); ctx.moveTo(u - h, -e); ctx.lineTo(u - h, e); ctx.moveTo(u + h, -e); ctx.lineTo(u + h, e); ctx.stroke();
  }

  function stripes(u, h, v0, v1, col) {
    ctx.save();
    ctx.beginPath(); ctx.rect(u - h, v0, 2 * h, v1 - v0); ctx.clip();
    ctx.fillStyle = col;
    for (var k = v0 - 1.5; k < v1; k += 1.1) {
      ctx.beginPath(); ctx.moveTo(u - h, k); ctx.lineTo(u - h, k + 0.45); ctx.lineTo(u + h, k + 1.35); ctx.lineTo(u + h, k + 0.9); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function drawWall(g, u, e, grow, alpha) {
    var h = 0.45 * (1 + grow);
    ctx.save(); ctx.globalAlpha = alpha * dim;
    ctx.fillStyle = '#ff86bd'; ctx.fillRect(u - h, -e, 2 * h, 2 * e);
    stripes(u, h, -e, e, 'rgba(255,255,255,0.4)');
    ctx.fillStyle = '#ffc3de'; ctx.fillRect(u - h, -e, 0.12, 2 * e);
    ctx.fillStyle = '#e8629f'; ctx.fillRect(u + h - 0.12, -e, 0.12, 2 * e);
    slabEdges(u, h, e, '#c92a78');
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    starPath(u, 0, 0.5, 0.26, 8, 0); ctx.fill();
    ctx.strokeStyle = '#c92a78'; ctx.lineWidth = 0.06; ctx.stroke();
    ctx.restore();
  }

  function drawHole(g, u, e, alpha) {
    var h = 0.45, gap = 0.75;
    ctx.save(); ctx.globalAlpha = alpha * dim;
    var sides = [[-e, -gap], [gap, e]];
    for (var s = 0; s < 2; s++) {
      var a = sides[s][0], b = sides[s][1];
      ctx.fillStyle = '#6fe0bd'; ctx.fillRect(u - h, a, 2 * h, b - a);
      stripes(u, h, a, b, 'rgba(255,255,255,0.3)');
      ctx.fillStyle = '#b4f5e0'; ctx.fillRect(u - h, a, 0.12, b - a);
      ctx.fillStyle = '#3fb996'; ctx.fillRect(u + h - 0.12, a, 0.12, b - a);
      ctx.strokeStyle = '#1e8f72'; ctx.lineWidth = 0.07;
      ctx.beginPath(); ctx.moveTo(u - h, a); ctx.lineTo(u - h, b); ctx.moveTo(u + h, a); ctx.lineTo(u + h, b);
      var inner = s ? a : b;
      ctx.moveTo(u - h, inner); ctx.lineTo(u + h, inner);
      ctx.stroke();
      // rounded bumps at the hole mouth
      ctx.fillStyle = '#6fe0bd';
      ctx.beginPath(); ctx.arc(u - h + 0.02, inner, 0.01, 0, 6.3); ctx.fill();
    }
    ctx.restore();
  }

  // taffy bar: a long chewy slab from u0 to u1 that must be held through
  function drawTaffy(g, u0, u1, e, alpha, t) {
    var a0 = u0 - 0.45, a1 = u1 + 0.45, k, wob = g.state === 4 ? Math.sin(t * 40) * 0.04 : 0;
    ctx.save(); ctx.globalAlpha = alpha * dim;
    ctx.fillStyle = '#ffb74d'; ctx.fillRect(a0, -e, a1 - a0, 2 * e);
    ctx.save();
    ctx.beginPath(); ctx.rect(a0, -e, a1 - a0, 2 * e); ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 0.16;
    for (k = -e; k < e + 1; k += 0.8) {
      ctx.beginPath(); ctx.moveTo(a0, k + wob);
      ctx.bezierCurveTo(a0 + (a1 - a0) * 0.33, k - 0.35 - wob * 4, a0 + (a1 - a0) * 0.66, k + 0.35 + wob * 4, a1, k - wob);
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = '#ffe0a3'; ctx.fillRect(a0, -e, 0.12, 2 * e);
    ctx.fillStyle = '#f08c2e'; ctx.fillRect(a1 - 0.12, -e, 0.12, 2 * e);
    ctx.strokeStyle = '#c96a12'; ctx.lineWidth = 0.07;
    ctx.beginPath(); ctx.moveTo(a0, -e); ctx.lineTo(a0, e); ctx.moveTo(a1, -e); ctx.lineTo(a1, e); ctx.stroke();
    // chevrons along the lane say "keep going"
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 0.12; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (k = a0 + 0.5; k < a1 - 0.3; k += 0.8) {
      ctx.beginPath(); ctx.moveTo(k - 0.16, -0.3); ctx.lineTo(k + 0.14, 0); ctx.lineTo(k - 0.16, 0.3); ctx.stroke();
    }
    ctx.restore();
  }

  function drawLolli(g, u, t) {
    var bob = Math.sin(t * 5 + g.n) * 0.06, dx = L.portrait ? -1 : 0, dy = L.portrait ? 0 : 1, r = 0.36;
    ctx.save(); ctx.globalAlpha = dim;
    ctx.translate(u - dx * bob, -dy * bob);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.1; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(dx * r, dy * r); ctx.lineTo(dx * (r + 0.5), dy * (r + 0.5)); ctx.stroke();
    ctx.fillStyle = '#ff86bd'; ctx.strokeStyle = '#c92a78'; ctx.lineWidth = 0.06;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.2832); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.08;
    ctx.beginPath();
    for (var k = 0; k <= 20; k++) {
      var a = t * 2 + k * 0.5, rr2 = r * 0.85 * k / 20;
      if (k) ctx.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2); else ctx.moveTo(0, 0);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawGates(w, pos) {
    var e = L.ext, k, g, u;
    for (k = w.gates.length - 1; k >= 0; k--) {
      g = w.gates[k];
      u = g.p - pos;
      if (u > L.ahead + 2 || g.pe - pos < -L.back - 2) continue;
      if (g.type === 'wall') {
        if (g.state === 0 || g.state === 3) drawWall(g, u, e, 0, 1);
        else if (g.t < 0.25) drawWall(g, u, e, g.t * 6, 1 - g.t / 0.25);
      } else if (g.type === 'taffy') {
        if (g.state !== 2) drawTaffy(g, u, g.pe - pos, e, 1, w.t);
        else if (g.t < 0.25) drawTaffy(g, u, g.pe - pos, e, 1 - g.t / 0.25, w.t);
      } else drawHole(g, u, e, 1);
      if (g.lolli && !g.got) {
        var lu = g.lp - pos;
        if (lu > -L.back && lu < L.ahead + 1) drawLolli(g, lu, w.t);
      }
    }
  }

  // "BEST" pennant beside the gate that would beat the farthest run (screen space, so the text stays upright)
  function drawFlag(w, pos) {
    if (!w.flagN || w.far) return;
    for (var k = 0; k < w.gates.length; k++) {
      var g = w.gates[k];
      if (g.n !== w.flagN) continue;
      var u = g.p - pos;
      if (u > L.ahead + 1 || u < -L.back) return;
      var p = R.toScreen(u, L.portrait ? -2.1 : -1.9), S = L.S;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = S * 0.09; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(p.x, p.y + S * 0.7); ctx.lineTo(p.x, p.y - S * 0.7); ctx.stroke();
      var fl = Math.sin(w.t * 6) * S * 0.06;
      ctx.fillStyle = '#ffd84d'; ctx.strokeStyle = '#d89a00'; ctx.lineWidth = S * 0.05; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(p.x, p.y - S * 0.7); ctx.lineTo(p.x + S * 1.25, p.y - S * 0.42 + fl); ctx.lineTo(p.x, p.y - S * 0.12); ctx.closePath(); ctx.fill(); ctx.stroke();
      text('BEST', p.x + S * 0.48, p.y - S * 0.41 + fl * 0.4, S * 0.26, '#a86400', null, 0);
      return;
    }
  }

  function drawHand(x, y, s, press) {
    ctx.save();
    ctx.translate(x, y + press * s * 0.12);
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#e0508f'; ctx.lineWidth = s * 0.07; ctx.lineJoin = 'round';
    rr(-s * 0.3, 0, s * 0.6, s * 0.5, s * 0.2); ctx.fill(); ctx.stroke();
    rr(-s * 0.1 - s * 0.1, -s * 0.5, s * 0.2, s * 0.7, s * 0.1); ctx.fill(); ctx.stroke();
    rr(-s * 0.3, 0.06 * s, s * 0.6, s * 0.44, s * 0.2); ctx.fill();
    ctx.restore();
  }

  function drawPlayer(G, w, pos) {
    var S = L.S, st = G.state;
    var p = R.toScreen(-w.dOff, 0);
    var h = (st.mode === 'run' || w.demo) && !w.dead ? Math.abs(Math.sin(w.phase * 1.4)) : 0;
    var hop = w.puffT > 0 ? 0 : h * 0.16 * S;
    var strain = w.puffT > 1.0 && !w.dead ? Math.sin(w.t * 60) * 0.06 : 0;
    var size = S * 0.8 * w.pop;
    var sx = 1 + Math.max(-0.3, Math.min(0.3, w.popV * 0.012)), sy = 2 - sx;
    if (!w.puffT && !w.dead) { sy *= 1 + (h < 0.15 ? -0.1 : 0.04); sx *= 1 + (h < 0.15 ? 0.06 : -0.02); }
    ctx.fillStyle = 'rgba(80,60,120,0.18)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y + size * 0.42, size * 0.42 * (1 - h * 0.2), size * 0.14, 0, 0, 6.2832); ctx.fill();
    var expr = w.dead || w.hitT > 0 ? 'hit' : (w.puffT > 0 ? 'puffed' : 'happy');
    ctx.save();
    ctx.translate(p.x, p.y - hop);
    if (w.rot || strain) ctx.rotate(w.rot + strain);
    if (MP.skins && MP.skins.draw) MP.skins.draw(ctx, G.skinId(), 0, 0, size, { sx: sx, sy: sy }, expr);
    else { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, size / 2, 0, 6.2832); ctx.fill(); }
    ctx.restore();
    return p;
  }

  function drawParts(w) {
    var k, p, a;
    for (k = 0; k < w.parts.length; k++) {
      p = w.parts[k];
      a = Math.min(1, p.life / (p.max * 0.5));
      ctx.globalAlpha = a; ctx.fillStyle = p.col;
      if (p.kind === 0) {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.size, -p.size * 0.6, p.size * 2, p.size * 1.2); ctx.restore();
      } else if (p.kind === 1) {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 0.8, 0, 6.2832); ctx.fill();
      } else {
        starPath(p.x, p.y, p.size * 1.4, p.size * 0.6, 5, p.rot); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    for (k = 0; k < w.rings.length; k++) {
      p = w.rings[k];
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.strokeStyle = p.col; ctx.lineWidth = L.S * 0.08;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * L.S, 0, 6.2832); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (k = 0; k < w.texts.length; k++) {
      p = w.texts[k];
      var sc = 1 + Math.max(0, p.life - p.max * 0.8) * 3;
      ctx.globalAlpha = Math.min(1, p.life / (p.max * 0.4));
      var fs = L.S * 0.62 * p.size * sc, tw = p.s.length * fs * 0.6, mg = L.S * 0.2;
      if (tw > W - mg * 2) { fs *= (W - mg * 2) / tw; tw = W - mg * 2; }
      var tx = Math.max(mg + tw / 2, Math.min(W - mg - tw / 2, p.x)), py0 = R.toScreen(0, 0).y, ty = L.portrait ? p.y : py0 + (py0 - p.y) * 0.62;   // landscape: the HUD sits above the mallow, so lines go below it
      text(p.s, tx, ty, fs, p.col, '#c0306f', L.S * 0.12);
    }
    ctx.globalAlpha = 1;
  }

  function drawHud(G, w) {
    var st = G.state, S = L.S;
    var cx = W / 2, sy = L.portrait ? H * 0.09 : H * 0.12;
    var pulse = 1 + Math.max(0, w.scoreAnim) * 2;
    var rush = w.rush > 0;
    text(String(st.score), cx, sy, S * 1.5 * pulse, rush ? '#fff3a8' : '#ffffff', rush ? '#e8791e' : '#e0508f', S * 0.2);
    var bw = S * 4.6, bh = S * 0.34, by = sy + S * 1.1, bx = cx - bw / 2;
    if (w.crackT > 0) bx += Math.sin(w.crackT * 70) * S * 0.12 * (w.crackT / 0.45);
    ctx.fillStyle = w.crackT > 0 ? 'rgba(255,150,170,0.8)' : 'rgba(255,255,255,0.55)'; rr(bx, by, bw, bh, bh / 2); ctx.fill();
    // five steps: the bar fills as the PERFECT streak grows (2 per step)
    var f = Math.min(1, w.streak / 8);
    if (f > 0) {
      var gr = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      gr.addColorStop(0, '#ff5f8f'); gr.addColorStop(0.25, '#ffa94d'); gr.addColorStop(0.5, '#ffe14d'); gr.addColorStop(0.75, '#6fe0bd'); gr.addColorStop(1, '#7a8bff');
      ctx.fillStyle = gr; rr(bx, by, Math.max(bh, bw * f), bh, bh / 2); ctx.fill();
    }
    if (st.mult > 1) text('x' + st.mult, bx + bw + S * 0.55, by + bh / 2, S * 0.55 * (1 + w.comboAnim), '#ffffff', '#e0508f', S * 0.12);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = S * 0.05; rr(bx, by, bw, bh, bh / 2); ctx.stroke();
    if (w.crackT > 0) {
      ctx.strokeStyle = '#e0508f'; ctx.lineWidth = S * 0.06; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(bx + bw * 0.46, by - bh * 0.2); ctx.lineTo(bx + bw * 0.52, by + bh * 0.35); ctx.lineTo(bx + bw * 0.47, by + bh * 0.6); ctx.lineTo(bx + bw * 0.54, by + bh * 1.2); ctx.stroke();
    }
    var ly = by + bh + S * 0.5;
    if (rush) text('SUGAR RUSH x2  ' + w.rush, cx, ly, S * 0.42 * (1 + 0.06 * Math.sin(w.t * 12)), '#fff3a8', '#e8791e', S * 0.1);
    else if (w.prevBest > 0) text(w.nb ? '★ NEW BEST' : 'BEST ' + w.prevBest, cx, ly, S * 0.36, w.nb ? '#ffe14d' : '#ffffff', w.nb ? '#c98a00' : 'rgba(224,80,143,0.85)', S * 0.08);
  }

  function drawBanner(w) {
    var b = w.banner;
    if (!b) return;
    var S = L.S * (L.portrait ? 1 : 0.78), age = b.max - b.t, a = Math.min(1, age / 0.2, b.t / 0.3), sc = 1 + Math.max(0, 0.2 - age) * 2;
    var y = L.portrait ? H * 0.3 : H * 0.9, bw = Math.min(W * 0.92, S * 9), bh = S * 1.5;
    ctx.globalAlpha = Math.max(0, a) * 0.9;
    ctx.fillStyle = b.rush ? '#ffb347' : '#ffffff';
    rr(W / 2 - bw / 2, y - bh / 2, bw, bh, bh / 2); ctx.fill();
    ctx.globalAlpha = Math.max(0, a);
    text(b.s, W / 2, y - S * 0.14, Math.min(S * 0.72, bw / (b.s.length * 0.62)) * sc, b.rush ? '#ffffff' : '#e0508f', b.rush ? '#c96a12' : null, S * 0.12);
    if (b.sub) text(b.sub, W / 2, y + S * 0.44, S * 0.3, b.rush ? '#fff3a8' : '#b08cff', null, 0);
    ctx.globalAlpha = 1;
  }

  // after a miss: a faint outline of the size the mallow should have been, plus a short tip
  function drawGhost(G, w) {
    if (!w.dead || !w.ghost) return;
    var S = L.S, p = R.toScreen(0, 0), a = Math.min(1, w.deadT / 0.2);
    var size = S * 0.8 * (w.ghost === 2 ? PUFF_VIEW : 1);
    ctx.save();
    ctx.globalAlpha = 0.4 * a;
    if (MP.skins && MP.skins.draw) MP.skins.draw(ctx, G.skinId(), p.x, p.y, size, { sx: 1, sy: 1 }, w.ghost === 2 ? 'puffed' : 'happy');
    ctx.globalAlpha = 0.9 * a;
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = S * 0.08; ctx.setLineDash([S * 0.22, S * 0.16]);
    ctx.beginPath(); ctx.arc(p.x, p.y, size * 0.6, 0, 6.2832); ctx.stroke();
    ctx.setLineDash([]);
    if (w.tip) text(w.tip, W / 2, Math.max(S * 3.6, p.y - S * 3), Math.min(S * 0.6, W / (w.tip.length * 0.56)), '#ffffff', '#e0508f', S * 0.13);
    ctx.restore();
  }
  var PUFF_VIEW = 2;

  function hints(G, w) {
    var st = G.state, S = L.S, p = R.toScreen(0, 0);
    if (st.mode !== 'run' || st.paused || w.dead) return;
    var t = w.t;
    if (!st.running) {
      var press = Math.max(0, Math.sin(t * 6));
      drawHand(p.x, p.y + S * 1.7, S * 1.1, press);
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.9 - press * 0.5) + ')'; ctx.lineWidth = S * 0.1;
      ctx.beginPath(); ctx.arc(p.x, p.y + S * 1.7, S * (0.9 + 0.4 * (1 - press)), 0, 6.2832); ctx.stroke();
      text('TAP!', p.x, p.y - S * 1.6, S * 0.9 * (1 + press * 0.1), '#ffffff', '#e0508f', S * 0.16);
      return;
    }
    var g = w.gates[w.ni];
    if (!g || g.type === 'hole' || !((w.tutorial && g.n <= 10) || (w.hint && g.n <= 14))) return;
    if (g.state === 4) {
      drawHand(p.x, p.y + S * 1.7, S * 1.1, 1);
      text('HOLD!', p.x, p.y - S * 1.9, S * 0.8, '#ffffff', '#e8791e', S * 0.15);
      return;
    }
    var ttc = (g.p - w.pos) / w.vel - 0.06;
    if (ttc < 0.9 && ttc > -0.3) {
      var k = Math.max(0, ttc) / 0.9;
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = S * 0.12;
      ctx.beginPath(); ctx.arc(p.x, p.y, S * (0.9 + 1.4 * k), 0, 6.2832); ctx.stroke();
      drawHand(p.x, p.y + S * 1.7, S * 1.1, ttc < 0.12 ? 1 : 0);
      if (g.type === 'taffy') text('HOLD!', p.x, p.y - S * 1.9, S * 0.8, '#ffffff', '#e8791e', S * 0.15);
    }
  }

  R.draw = function (G) {
    var w = G.getWorld();
    if (!w || !ctx) return;
    var st = G.state, S = L.S, c = G.bgColors();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var gr = ctx.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, 'rgb(' + (c[0][0] | 0) + ',' + (c[0][1] | 0) + ',' + (c[0][2] | 0) + ')');
    gr.addColorStop(1, 'rgb(' + (c[1][0] | 0) + ',' + (c[1][1] | 0) + ',' + (c[1][2] | 0) + ')');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    if (w.rush > 0) {
      ctx.fillStyle = 'rgba(255,190,70,' + (0.16 + 0.05 * Math.sin(w.t * 8)) + ')'; ctx.fillRect(0, 0, W, H);
    }
    ctx.save();
    if (w.shake > 0 && !w.demo) ctx.translate((Math.random() - 0.5) * 2 * w.shakeAmp * (w.shake / 0.12 > 1 ? 1 : w.shake / 0.12), (Math.random() - 0.5) * 2 * w.shakeAmp * Math.min(1, w.shake / 0.12));
    var vel = w.vel || w.speed;
    var pos = w.pos + (w.demo || (st.mode === 'run' && st.running && !w.dead && !st.paused) ? vel * (G.alpha || 0) / 120 : 0);
    ctx.save();
    ctx.translate(L.px, L.py);
    if (L.portrait) ctx.rotate(-Math.PI / 2);
    ctx.scale(S, S);
    drawDecor(pos, vel + (w.rush > 0 ? 4 : 0));
    dim = st.mode === 'menu' ? 0.35 : 1;
    ctx.globalAlpha = dim;
    drawGates(w, pos);
    ctx.restore();
    if (st.mode !== 'menu') { drawFlag(w, pos); drawGhost(G, w); drawPlayer(G, w, pos); }
    drawParts(w);
    hints(G, w);
    if (st.mode === 'run') { drawHud(G, w); drawBanner(w); }
    ctx.restore();
  };
})();
