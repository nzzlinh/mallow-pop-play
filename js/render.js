(function () {
  var MP = window.MP = window.MP || {};
  var R = MP.render = {};
  var cv, ctx, W = 0, H = 0, dpr = 1, dim = 1;
  var L = R.layout = { portrait: true, S: 40, px: 0, py: 0, ext: 6, ahead: 12, back: 4 };
  var FONT = '"Baloo 2","Fredoka","Arial Rounded MT Bold","Nunito","Trebuchet MS",system-ui,sans-serif';
  var CANDY = ['#ff86bd', '#ffe14d', '#6fe0bd', '#7fe0ff', '#b08cff', '#ffa94d'];
  var decor = [], streaks = [], i;
  for (i = 0; i < 16; i++) decor.push({ u: Math.random() * 30, v: (Math.random() - 0.5) * 16, r: 0.5 + Math.random() * 1.1, d: 0.12 + Math.random() * 0.3 });
  for (i = 0; i < 18; i++) streaks.push({ u: Math.random() * 20, v: (Math.random() - 0.5) * 14, l: 1 + Math.random() * 2 });
  // render-only state: spin of the mallow while holding taffy
  var spinA = 0, lastT = -1;

  R.init = function (canvas) {
    cv = canvas; ctx = cv.getContext('2d');
    R.resize();
  };

  R.resize = function () {
    if (tcache) tcache.clear();
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

  // ---- defensive readers (old worlds / demo may lack the v1.2 fields) ----
  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }
  function cfg(k, d) { return MP.cfg ? num(MP.cfg[k], d) : d; }
  function gx(g) { return num(g.x, 0); }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function hasPath(g) { return !!(g.path && g.path.length); }
  // lateral x of a taffy path at world position p (null before the first waypoint, holds the last x after it)
  function pathAt(g, p) {
    var a = g.path, k, q, r, d;
    if (!a || !a.length || p < a[0].p) return null;
    for (k = 1; k < a.length; k++) {
      if (p <= a[k].p) { q = a[k - 1]; r = a[k]; d = r.p - q.p; return d > 1e-6 ? num(q.x, 0) + (num(r.x, 0) - num(q.x, 0)) * (p - q.p) / d : num(r.x, 0); }
    }
    return num(a[a.length - 1].x, 0);
  }
  R.pathAt = pathAt;

  function rr(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
  }

  // star sub-path added to the current path (for batching)
  function addStar(x, y, ro, ri, n, rot) {
    for (var k = 0; k < n * 2; k++) {
      var r = k % 2 ? ri : ro, a = rot + k * Math.PI / n - Math.PI / 2;
      if (k) ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
  }
  var cols = [];

  function starPath(x, y, ro, ri, n, rot) {
    ctx.beginPath();
    for (var k = 0; k < n * 2; k++) {
      var r = k % 2 ? ri : ro, a = rot + k * Math.PI / n - Math.PI / 2;
      if (k) ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
  }

  // Outlined text is costly to rasterise every frame (strokeText), so each label is drawn once into a small
  // canvas at a size bucket at least as large as asked, then blitted (and scaled down) with drawImage.
  var tcache = typeof Map === 'function' ? new Map() : null, TC_MAX = 96;
  function makeText(s, q, fill, stroke, lw) {
    var c = document.createElement('canvas'), g = c.getContext('2d'), font = '900 ' + q + 'px ' + FONT;
    g.font = font;
    var tw = g.measureText(s).width, pad = (stroke ? lw / 2 : 0) + 2, cw = tw + pad * 2, ch = q * 1.35 + pad * 2;
    c.width = Math.max(1, Math.ceil(cw * dpr)); c.height = Math.max(1, Math.ceil(ch * dpr));
    g.scale(dpr, dpr);
    g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    if (stroke) { g.lineWidth = lw; g.strokeStyle = stroke; g.strokeText(s, cw / 2, ch / 2); }
    g.fillStyle = fill; g.fillText(s, cw / 2, ch / 2);
    return { c: c, w: cw, h: ch, pad: pad };
  }
  function text(s, x, y, size, fill, stroke, lw, align) {
    if (!(size > 0)) return;
    s = String(s);
    if (!tcache || typeof document === 'undefined') {
      ctx.font = '900 ' + size + 'px ' + FONT;
      ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      if (stroke) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.strokeText(s, x, y); }
      ctx.fillStyle = fill; ctx.fillText(s, x, y);
      return;
    }
    var q = size <= 24 ? Math.ceil(size / 2) * 2 : Math.ceil(size / 6) * 6;
    var lq = stroke ? (lw || 0) * q / size : 0;
    var key = s + '|' + q + '|' + fill + '|' + (stroke || '') + '|' + Math.round(lq * 2);
    var e = tcache.get(key);
    if (!e) {
      e = makeText(s, q, fill, stroke, lq);
      if (tcache.size >= TC_MAX) tcache.delete(tcache.keys().next().value);
      tcache.set(key, e);
    }
    var k = size / q, dw = e.w * k, dh = e.h * k;
    var ox = align === 'left' ? -e.pad * k : align === 'right' ? -dw + e.pad * k : -dw / 2;
    ctx.drawImage(e.c, x + ox, y - dh / 2, dw, dh);
  }

  // filled arrow head (screen space) at x,y pointing along (dx,dy)
  function arrowTri(x, y, dx, dy, s, fill, stroke, lw) {
    var nx = -dy, ny = dx;
    ctx.beginPath();
    ctx.moveTo(x + dx * s, y + dy * s);
    ctx.lineTo(x - dx * s * 0.6 + nx * s * 0.8, y - dy * s * 0.6 + ny * s * 0.8);
    ctx.lineTo(x - dx * s * 0.25, y - dy * s * 0.25);
    ctx.lineTo(x - dx * s * 0.6 - nx * s * 0.8, y - dy * s * 0.6 - ny * s * 0.8);
    ctx.closePath();
    ctx.lineJoin = 'round';
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
    ctx.fillStyle = fill; ctx.fill();
  }

  function mod(a, b) { return ((a % b) + b) % b; }

  // ---- world pieces (drawn in the track frame: x = distance ahead, y = across) ----
  function drawDecor(pos, speed, w, bp) {
    var span = L.ahead + L.back + 8, k, d, u;
    ctx.fillStyle = 'rgba(255,255,255,0.38)';
    for (k = 0; k < decor.length; k++) {
      d = decor[k];
      u = mod(d.u - pos * d.d, span) - L.back - 4;
      ctx.beginPath();
      ctx.arc(u, d.v, d.r, 0, 6.2832); ctx.arc(u + d.r * 0.9, d.v + d.r * 0.2, d.r * 0.75, 0, 6.2832); ctx.arc(u - d.r * 0.8, d.v + d.r * 0.25, d.r * 0.65, 0, 6.2832);
      ctx.fill();
    }
    // lane (pulses on the beat)
    var lo = -L.back - 1, hi = L.ahead + 1;
    ctx.fillStyle = 'rgba(255,255,255,' + (0.34 + 0.2 * bp) + ')';
    ctx.fillRect(lo, -0.75, hi - lo, 1.5);
    ctx.fillStyle = 'rgba(255,255,255,' + (0.75 + 0.25 * bp) + ')';
    var ew = 0.06 + 0.05 * bp;
    ctx.fillRect(lo, -0.77 - ew / 2, hi - lo, ew); ctx.fillRect(lo, 0.77 - ew / 2, hi - lo, ew);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (u = mod(-pos, 1.8) + lo - 1.8; u < hi; u += 1.8) ctx.fillRect(u, -0.05, 0.7, 0.1);
    // beat grid: soft ticks on the lane edges at every beat, a faint bar line every 4 beats
    var bf = num(w.beatF, -1), bpm = num(w.bpm, 0), sp = num(w.speed, 0) * 60 / (bpm || 1);
    if (bf >= 0 && bpm > 0 && sp > 0.4) {
      var e = L.ext, k0 = Math.ceil(bf - (L.back + 1) / sp), k1 = bf + (L.ahead + 1) / sp, base = num(w.pos, pos) - pos;
      for (k = k0; k <= k1; k++) {
        u = base + (k - bf) * sp;
        if (mod(k, 4) === 0) {
          ctx.fillStyle = 'rgba(255,255,255,' + (0.16 + 0.12 * bp) + ')';
          ctx.fillRect(u - 0.04, -e, 0.08, 2 * e);
        }
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath(); ctx.arc(u, -1.05, 0.09, 0, 6.2832); ctx.arc(u, 1.05, 0.09, 0, 6.2832); ctx.fill();
      }
    }
    var hk = clamp01(num(w.holdK, 0));
    if (speed > 7 || hk > 0.02) {
      var sa = Math.max(speed > 7 ? Math.min(0.5, (speed - 7) * 0.08) : 0, hk * 0.75), sl = 1 + hk * 2.5;
      ctx.fillStyle = 'rgba(255,255,255,' + sa + ')';
      for (k = 0; k < streaks.length; k++) {
        d = streaks[k];
        if (hk < 0.5 && k > 13) break;
        u = mod(d.u - pos * (1.5 + hk * 2.5), 20) - 4;
        ctx.fillRect(u, d.v + (d.v < 0 ? -1.2 : 1.2), d.l * sl, 0.05 + hk * 0.04);
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

  function drawWall(g, u, e, grow, alpha, bump) {
    var h = 0.45 * (1 + grow) * (1 + 0.14 * bump);
    ctx.save(); ctx.globalAlpha = alpha * dim;
    ctx.fillStyle = '#ff86bd'; ctx.fillRect(u - h, -e, 2 * h, 2 * e);
    stripes(u, h, -e, e, 'rgba(255,255,255,0.4)');
    ctx.fillStyle = '#ffc3de'; ctx.fillRect(u - h, -e, 0.12, 2 * e);
    ctx.fillStyle = '#e8629f'; ctx.fillRect(u + h - 0.12, -e, 0.12, 2 * e);
    slabEdges(u, h, e, '#c92a78');
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    var sr = 1 + 0.18 * bump;
    starPath(u, 0, 0.5 * sr, 0.26 * sr, 8, 0); ctx.fill();
    ctx.strokeStyle = '#c92a78'; ctx.lineWidth = 0.06; ctx.stroke();
    ctx.restore();
  }

  function drawHole(g, u, e, alpha, bump) {
    var h = 0.45 * (1 + 0.14 * bump), gap = 0.75, cx = gx(g), E = e + Math.abs(cx) + 1;
    ctx.save(); ctx.globalAlpha = alpha * dim;
    var sides = [[-E, cx - gap], [cx + gap, E]];
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
      ctx.fillStyle = '#b4f5e0';
      ctx.beginPath(); ctx.arc(u, inner + (s ? 0.06 : -0.06), 0.09, 0, 6.3); ctx.fill();
    }
    ctx.restore();
  }

  // soft mint "landing strip" in front of a hole: shows where to line up
  function drawApproach(g, u, alpha) {
    var cx = gx(g), tol = cfg('HOLE_TOL', 0.45) + 0.3, u0 = Math.max(u - 4, -L.back - 1), u1 = u - 0.45;
    if (u1 <= u0) return;
    var gr = ctx.createLinearGradient(u0, 0, u1, 0);
    gr.addColorStop(0, 'rgba(180,245,224,0)'); gr.addColorStop(1, 'rgba(180,245,224,0.75)');
    ctx.save(); ctx.globalAlpha = alpha * dim;
    ctx.fillStyle = gr; ctx.fillRect(u0, cx - tol, u1 - u0, 2 * tol);
    ctx.restore();
  }

  // chevrons walking along a polyline [[u, v], ...]; off = animated phase, step = spacing
  function polyChevrons(pts, off, step, half) {
    var k, s = mod(off, step);
    ctx.beginPath();
    for (k = 1; k < pts.length; k++) {
      var ax = pts[k - 1][0], ay = pts[k - 1][1], dx = pts[k][0] - ax, dy = pts[k][1] - ay, len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1e-4) continue;
      dx /= len; dy /= len;
      var nx = -dy, ny = dx;
      while (s < len) {
        var x = ax + dx * s, y = ay + dy * s;
        ctx.moveTo(x - dx * half * 0.55 + nx * half, y - dy * half * 0.55 + ny * half);
        ctx.lineTo(x + dx * half * 0.45, y + dy * half * 0.45);
        ctx.lineTo(x - dx * half * 0.55 - nx * half, y - dy * half * 0.55 - ny * half);
        s += step;
      }
      s -= len;
    }
    ctx.stroke();
  }

  function strokePoly(pts, lw, col) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (var k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
    ctx.lineWidth = lw; ctx.strokeStyle = col; ctx.stroke();
  }

  // taffy bar: a long chewy slab from u0 to u1 that must be held through
  function drawTaffy(g, u0, u1, e, alpha, w, pos) {
    var t = w.t, inside = g.state === 4, hk = inside ? clamp01(num(w.holdK, 0)) : 0;
    var a0 = u0 - 0.45, a1 = u1 + 0.45, k, wob = inside ? Math.sin(t * 40) * 0.04 : 0;
    var path = hasPath(g);
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
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    var speed = 1.6 + hk * 7, off = t * speed;
    if (path) {
      // zig-zag taffy: the sticky slab is darker, a cream "safe ribbon" shows the path to follow
      var tol = cfg('TAFFY_TOL', 0.6), fl = cfg('TAFFY_FAIL', 1.2), pts = [], wp = g.path;
      ctx.fillStyle = 'rgba(214,96,24,0.28)'; ctx.fillRect(a0, -e, a1 - a0, 2 * e);
      for (k = 0; k < wp.length; k++) pts.push([num(wp[k].p, g.p) - pos, num(wp[k].x, 0)]);
      var x0 = pts[0][1], xl = pts[pts.length - 1][1];
      if (pts[pts.length - 1][0] < a1) pts.push([a1 + 0.5, xl]);
      var lead = [[a0 - 0.5, x0], [pts[0][0], x0]];
      var scr = inside && num(w.scrape, 0) > 0, scraped = !!g.scraped;
      var edge = scr ? (Math.sin(t * 50) > 0 ? '#ff3d6e' : '#ffffff') : (scraped ? '#d98aa6' : '#ff5f9b');
      // free lead-in before the first waypoint: a faint hint of where the path starts
      ctx.globalAlpha = alpha * dim * 0.45;
      strokePoly(lead, 2 * tol + 0.16, edge);
      strokePoly(lead, 2 * tol, '#fff4d9');
      ctx.globalAlpha = alpha * dim;
      strokePoly(pts, 2 * fl, 'rgba(255,236,200,0.35)');
      strokePoly(pts, 2 * tol + 0.18, edge);
      strokePoly(pts, 2 * tol, scraped ? '#f6e3dc' : '#fff4d9');
      strokePoly(pts, 0.12, 'rgba(255,183,77,0.5)');
      ctx.lineCap = 'butt';
      ctx.strokeStyle = scraped ? '#e6a0b8' : '#ff5f9b'; ctx.lineWidth = 0.13 + hk * 0.06;
      polyChevrons(pts, off, 0.75, 0.26);
      // waypoint knobs show the turns
      ctx.fillStyle = edge;
      ctx.beginPath();
      for (k = 0; k < wp.length; k++) { ctx.moveTo(pts[k][0] + 0.13, pts[k][1]); ctx.arc(pts[k][0], pts[k][1], 0.13, 0, 6.2832); }
      ctx.fill();
    } else {
      // straight taffy: chevrons along the mallow's row say "keep going"
      var lv = num(w.lx, 0);
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.95) + ')'; ctx.lineWidth = 0.12 + hk * 0.07;
      polyChevrons([[a0 + 0.2, lv], [a1, lv]], off, 0.8 - hk * 0.15, 0.3);
    }
    ctx.restore();
    ctx.fillStyle = '#ffe0a3'; ctx.fillRect(a0, -e, 0.12, 2 * e);
    ctx.fillStyle = '#f08c2e'; ctx.fillRect(a1 - 0.12, -e, 0.12, 2 * e);
    ctx.strokeStyle = '#c96a12'; ctx.lineWidth = 0.07;
    ctx.beginPath(); ctx.moveTo(a0, -e); ctx.lineTo(a0, e); ctx.moveTo(a1, -e); ctx.lineTo(a1, e); ctx.stroke();
    ctx.restore();
  }

  function drawLolli(g, u, t) {
    var bob = Math.sin(t * 5 + g.n) * 0.06, dx = L.portrait ? -1 : 0, dy = L.portrait ? 0 : 1, r = 0.36;
    ctx.save(); ctx.globalAlpha = dim;
    ctx.translate(u - dx * bob, gx(g) - dy * bob);
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

  function drawGates(w, pos, bp) {
    var e = L.ext, k, g, u, tn = num(w.tickN, 0);
    for (k = w.gates.length - 1; k >= 0; k--) {
      g = w.gates[k];
      u = g.p - pos;
      if (u > L.ahead + 2 || g.pe - pos < -L.back - 2) continue;
      var bump = g.state === 0 ? bp : 0;
      if (g.type === 'wall') {
        if (g.state === 0 || g.state === 3) drawWall(g, u, e, 0, 1, bump);
        else if (g.t < 0.25) drawWall(g, u, e, g.t * 6, 1 - g.t / 0.25, 0);
      } else if (g.type === 'taffy') {
        if (g.state === 4 && tn > 0) g._rk = Math.max(g._rk || 0, tn);   // remembered for the release flourish
        if (g.state !== 2) drawTaffy(g, u, g.pe - pos, e, 1, w, pos);
        else if (g.t < 0.25) drawTaffy(g, u, g.pe - pos, e, 1 - g.t / 0.25, w, pos);
      } else {
        if (g.state === 0 && u > 0.3) drawApproach(g, u, Math.min(1, (L.ahead + 1 - u) / 3));
        drawHole(g, u, e, 1, bump);
      }
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

  // ---- hold juice ----
  function holdInfo(w) {
    var hk = clamp01(num(w.holdK, 0)), tn = num(w.tickN, 0), tt = num(w.tickT, 9);
    return { hk: hk, tn: tn, tt: tt, tp: tn > 0 ? Math.max(0, 1 - tt / 0.16) : 0, big: tn > 0 && tn % 4 === 0 };
  }

  function curTaffy(w) {
    var g = w.gates[w.ni];
    return g && g.type === 'taffy' && g.state === 4 ? g : null;
  }

  // glow, spin swooshes, tick rings and popcorn stars behind/around the mallow
  function drawHoldBack(w, p, size, h) {
    var chg = clamp01(num(w.charge, 0));
    if (chg > 0.03) drawSwirl(w, p, size, chg);
    if (h.hk < 0.02 && h.tp <= 0) return;
    var S = L.S, k, a;
    var r1 = size * (0.8 + 0.4 * h.hk + 0.3 * h.tp);
    var gr = ctx.createRadialGradient(p.x, p.y, size * 0.25, p.x, p.y, r1);
    gr.addColorStop(0, 'rgba(255,246,170,' + Math.min(0.85, 0.35 * h.hk + 0.4 * h.tp) + ')');
    gr.addColorStop(0.6, 'rgba(255,170,205,' + Math.min(0.5, 0.25 * h.hk + 0.25 * h.tp) + ')');
    gr.addColorStop(1, 'rgba(255,170,205,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(p.x, p.y, r1, 0, 6.2832); ctx.fill();
    if (h.hk > 0.08) {
      // sunburst rays rotate with the spin and kick out on each tick
      var n = 12, ri = size * 0.6, ro = size * (0.7 + 0.12 * h.hk + 0.3 * h.tp);
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.35 * h.hk + 0.4 * h.tp) + ')'; ctx.lineWidth = S * 0.07; ctx.lineCap = 'round';
      ctx.beginPath();
      for (k = 0; k < n; k++) {
        a = spinA * 0.35 + k * 6.2832 / n;
        ctx.moveTo(p.x + Math.cos(a) * ri, p.y + Math.sin(a) * ri); ctx.lineTo(p.x + Math.cos(a) * ro, p.y + Math.sin(a) * ro);
      }
      ctx.stroke();
    }
  }

  // two candy-cane spiral arms turning round the mallow, faster and wider with the charge
  function drawSwirl(w, p, size, chg) {
    var S = L.S, sw = num(w.swirlA, 0), arm, i, N = 14;
    ctx.lineCap = 'round';
    for (arm = 0; arm < 3; arm++) {
      var base = sw + arm * 2.0944;
      for (var pass = 0; pass < 2; pass++) {
        ctx.beginPath();
        for (i = 0; i <= N; i++) {
          var f = i / N, a = base + f * (2.2 + 1.2 * chg), r = size * (0.5 + f * (0.55 + 0.6 * chg));
          var x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.globalAlpha = 0.85 * chg;
        ctx.strokeStyle = pass ? CANDY[arm % CANDY.length] : '#ffffff';
        ctx.lineWidth = S * (pass ? 0.07 : 0.13) * (0.6 + 0.6 * chg);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  // wrapped candies orbiting the mallow, one per pop (max 12); they fly off in the release burst
  function drawOrbit(w, p, size, h) {
    var n = Math.min(12, h.tn), chg = clamp01(num(w.charge, 0));
    if (n <= 0 || chg < 0.05 || w.dead) return;
    var S = L.S, sw = num(w.swirlA, 0) * 1.5, r = size * 0.95, k;
    for (k = 0; k < n; k++) {
      var a = sw + k * 6.2832 / n, x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r * (L.portrait ? 1 : 1);
      var sz = S * 0.16 * (1 + 0.3 * h.tp);
      ctx.fillStyle = CANDY[k % CANDY.length];
      ctx.beginPath(); ctx.arc(x, y, sz, 0, 6.2832); ctx.fill();
      // wrapper ends
      var ca = Math.cos(a + 1.5708) * sz, sa = Math.sin(a + 1.5708) * sz;
      ctx.beginPath();
      ctx.moveTo(x + ca * 0.8, y + sa * 0.8); ctx.lineTo(x + ca * 1.7 - sa * 0.5, y + sa * 1.7 + ca * 0.5); ctx.lineTo(x + ca * 1.7 + sa * 0.5, y + sa * 1.7 - ca * 0.5);
      ctx.moveTo(x - ca * 0.8, y - sa * 0.8); ctx.lineTo(x - ca * 1.7 - sa * 0.5, y - sa * 1.7 + ca * 0.5); ctx.lineTo(x - ca * 1.7 + sa * 0.5, y - sa * 1.7 - ca * 0.5);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath(); ctx.arc(x - sz * 0.3, y - sz * 0.3, sz * 0.3, 0, 6.2832); ctx.fill();
    }
  }

  function drawHoldFront(w, p, size, h) {
    var S = L.S, k, a;
    drawOrbit(w, p, size, h);
    if (h.hk > 0.08) {
      // spin swooshes: two arcs chasing round the mallow
      ctx.lineCap = 'round';
      for (k = 0; k < 2; k++) {
        a = spinA + k * Math.PI;
        ctx.strokeStyle = k ? 'rgba(255,134,189,' + (0.8 * h.hk) + ')' : 'rgba(255,255,255,' + (0.9 * h.hk) + ')';
        ctx.lineWidth = S * (0.06 + 0.05 * h.hk);
        ctx.beginPath(); ctx.arc(p.x, p.y, size * 0.6, a, a + 0.6 + 1.2 * h.hk); ctx.stroke();
      }
    }
    if (h.tn > 0 && h.tt < 0.3) {
      var f = h.tt / 0.3, col = CANDY[h.tn % CANDY.length];
      ctx.globalAlpha = 1 - f;
      ctx.strokeStyle = col; ctx.lineWidth = S * (h.big ? 0.16 : 0.1) * (1 - f) + 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, size * 0.55 + f * S * (h.big ? 3.2 : 2), 0, 6.2832); ctx.stroke();
      // popcorn stars fly out on every tick, a new angle each time
      ctx.fillStyle = col;
      var n = h.big ? 8 : 5, rad = size * 0.55 + f * S * (h.big ? 2.8 : 1.8), ss = S * (h.big ? 0.2 : 0.15) * (1 - f * 0.5);
      for (k = 0; k < n; k++) {
        a = h.tn * 0.9 + k * 6.2832 / n;
        starPath(p.x + Math.cos(a) * rad, p.y + Math.sin(a) * rad, ss, ss * 0.45, 5, a); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    // scrape: orange sparks on the side of the mallow that rubs the taffy
    if (num(w.scrape, 0) > 0 && !w.dead) {
      ctx.fillStyle = '#fff3a8'; ctx.strokeStyle = '#ff7a2e'; ctx.lineWidth = S * 0.04;
      for (k = 0; k < 6; k++) {
        a = w.t * 23 + k * 2.4;
        var d2 = size * (0.5 + 0.35 * mod(w.t * 7 + k * 0.37, 1));
        starPath(p.x + Math.cos(a) * d2, p.y + Math.sin(a) * d2, S * 0.12, S * 0.05, 4, a); ctx.fill(); ctx.stroke();
      }
    }
  }

  function popsLabel(n) { return n + (n === 1 ? ' POP' : ' POPS'); }

  // the tick counter sits just behind the mallow (landscape: behind and a bit below), kept on screen
  function counterText(s, lx, size, dy, fill, stroke) {
    var S = L.S, c = L.portrait ? R.toScreen(-1.75, lx) : R.toScreen(-1.9, lx + 0.7);
    var fs = size * (L.portrait ? 0.5 : 0.4), tw = s.length * fs * 0.58, mg = S * 0.15;
    var x = Math.max(mg + tw / 2, Math.min(W - mg - tw / 2, c.x)), y = Math.max(fs, Math.min(H - fs * 0.7, c.y + dy));
    text(s, x, y, fs, fill, stroke, S * 0.13);
  }

  function drawTickCounter(w, h, lx) {
    if (h.tn <= 0 || w.dead) return;
    var sc = (1 + 0.35 * h.tp * (h.big ? 1.5 : 1)) * (1 + Math.min(0.3, h.tn * 0.02));
    var col = h.tn >= 12 ? '#ff5f9b' : h.tn >= 6 ? '#ffe14d' : '#ffffff';
    counterText(popsLabel(h.tn), lx, L.S * sc, 0, col, h.tn >= 12 ? '#ffffff' : '#e8791e');
  }

  // big flourish when a held taffy ends cleanly
  function drawFlourish(w, lx) {
    var k, g = null;
    for (k = 0; k < w.gates.length; k++) {
      var q = w.gates[k];
      if (q.type === 'taffy' && q.state === 2 && q._rk > 0 && q.t < 0.6) { g = q; break; }
    }
    if (!g || w.dead || w.hitT > 0) return;
    var S = L.S, p = R.toScreen(0, lx), f = g.t / 0.6, e = 1 - Math.pow(1 - f, 3), ok = !g.scraped, a;
    var big = ok ? 1 : 0.6;
    ctx.save();
    if (g.t < 0.12) { ctx.fillStyle = 'rgba(255,255,255,' + (0.3 * big * (1 - g.t / 0.12)) + ')'; ctx.fillRect(0, 0, W, H); }
    ctx.globalAlpha = 1 - f;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = S * 0.22 * (1 - f) + 1;
    ctx.beginPath(); ctx.arc(p.x, p.y, S * (0.9 + 5 * e * big), 0, 6.2832); ctx.stroke();
    ctx.strokeStyle = ok ? '#ffe14d' : '#ffc3de'; ctx.lineWidth = S * 0.14 * (1 - f) + 1;
    ctx.beginPath(); ctx.arc(p.x, p.y, S * (0.7 + 3.3 * e * big), 0, 6.2832); ctx.stroke();
    var n = ok ? 16 : 10;
    ctx.lineWidth = S * 0.12 * (1 - f) + 1;
    for (k = 0; k < n; k++) {
      a = k * 6.2832 / n + f * 0.8;
      var r0 = S * (0.9 + 2.2 * e * big), r1 = r0 + S * (0.6 + (k % 2) * 0.7) * (1 - f) * big;
      ctx.strokeStyle = CANDY[k % CANDY.length];
      ctx.beginPath(); ctx.moveTo(p.x + Math.cos(a) * r0, p.y + Math.sin(a) * r0); ctx.lineTo(p.x + Math.cos(a) * r1, p.y + Math.sin(a) * r1); ctx.stroke();
    }
    if (ok) {
      for (k = 0; k < 10; k++) {
        a = k * 0.6283 - f * 2;
        var rs = S * (1.2 + 4 * e);
        ctx.fillStyle = CANDY[(k + 2) % CANDY.length];
        starPath(p.x + Math.cos(a) * rs, p.y + Math.sin(a) * rs, S * 0.24 * (1 - f * 0.5), S * 0.1, 5, a + f * 4); ctx.fill();
      }
    }
    ctx.globalAlpha = 1 - f * f;
    counterText(popsLabel(g._rk) + (ok ? '!' : ''), lx, S * (1.45 - 0.3 * f) * (1 + Math.min(0.3, g._rk * 0.02)), -S * 0.5 * e, ok ? '#ffe14d' : '#ffffff', '#e8791e');
    ctx.restore();
  }

  // while big: small arrows on both lateral sides say "you can slide"; the side to go is highlighted
  function drawSlideCue(G, w, p, size, lx) {
    var st = G.state;
    if (st.mode !== 'run' || !st.running || st.paused || w.dead || !(w.puffT > 0)) return;
    var S = L.S, lat = cfg('LAT', 1.8), tx = null, g = w.gates[w.ni], k;
    if (g) {
      if (g.type === 'taffy' && g.state === 4 && hasPath(g)) tx = pathAt(g, w.pos + 1.6);
      else if (g.type === 'taffy' && g.state === 0 && hasPath(g)) tx = num(g.path[0].x, 0);
      else if (g.type === 'hole' && g.state === 0) tx = gx(g);
      else if (g.type === 'wall') {
        for (k = w.ni + 1; k < w.gates.length && k < w.ni + 3; k++) if (w.gates[k].type === 'hole') { tx = gx(w.gates[k]); break; }
      }
    }
    var want = tx === null || Math.abs(tx - lx) < 0.12 ? 0 : (tx > lx ? 1 : -1);
    var off = Math.abs(tx === null ? 0 : tx - lx), urgent = g && g.type === 'taffy' && g.state === 4 && hasPath(g) && off > cfg('TAFFY_TOL', 0.6) * 0.6;
    var d = R.vec(0, 1), bob = (0.5 + 0.5 * Math.sin(w.t * 9)) * S * 0.08;
    for (var s = -1; s <= 1; s += 2) {
      if (s * lx >= lat - 0.04) continue;
      var on = want === s, gap = size * 0.5 + S * (on ? 0.38 : 0.3) + (on ? bob * 1.6 : bob * 0.5);
      var x = p.x + d.x * s * gap, y = p.y + d.y * s * gap, sz = S * (on ? 0.3 : 0.2);
      ctx.globalAlpha = want === 0 ? 0.7 : (on ? 1 : 0.3);
      var fill = on ? (urgent && Math.sin(w.t * 30) > 0 ? '#ff3d6e' : '#ff6fae') : '#ffffff';
      arrowTri(x, y, d.x * s, d.y * s, sz, fill, on ? '#ffffff' : '#e0508f', S * 0.06);
      if (on) arrowTri(x + d.x * s * sz * 1.1, y + d.y * s * sz * 1.1, d.x * s, d.y * s, sz * 0.75, fill, '#ffffff', S * 0.05);
    }
    ctx.globalAlpha = 1;
  }

  function drawPlayer(G, w, pos, lx, h) {
    var S = L.S, st = G.state;
    var p = R.toScreen(-w.dOff, lx);
    var running = (st.mode === 'run' || w.demo) && !w.dead;
    var hh = running ? Math.abs(Math.sin(w.phase * 1.4)) : 0;
    var hop = w.puffT > 0 ? 0 : hh * 0.16 * S;
    var strain = w.puffT > 1.0 && !w.dead && h.hk < 0.05 ? Math.sin(w.t * 60) * 0.06 : 0;
    var chg = clamp01(num(w.charge, 0));
    var size = S * 0.8 * w.pop * (1 + 0.15 * h.tp * (h.big ? 1.4 : 1) + 0.3 * chg + 0.05 * chg * Math.sin(w.t * 40));
    var sx = 1 + Math.max(-0.3, Math.min(0.3, w.popV * 0.012)), sy = 2 - sx;
    if (!w.puffT && !w.dead) { sy *= 1 + (hh < 0.15 ? -0.1 : 0.04); sx *= 1 + (hh < 0.15 ? 0.06 : -0.02); }
    ctx.fillStyle = 'rgba(80,60,120,0.18)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y + size * 0.42, size * 0.42 * (1 - hh * 0.2), size * 0.14, 0, 0, 6.2832); ctx.fill();
    var pc = { x: p.x, y: p.y - hop };
    drawHoldBack(w, pc, size, h);
    var expr = w.dead || w.hitT > 0 ? 'hit' : (w.puffT > 0 ? 'puffed' : 'happy');
    ctx.save();
    ctx.translate(pc.x, pc.y);
    var rot = (w.rot || 0) + strain + spinA;
    if (rot) ctx.rotate(rot);
    if (MP.skins && MP.skins.draw) MP.skins.draw(ctx, G.skinId(), 0, 0, size, { sx: sx, sy: sy }, expr);
    else { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, size / 2, 0, 6.2832); ctx.fill(); }
    ctx.restore();
    drawHoldFront(w, pc, size, h);
    drawSlideCue(G, w, pc, size, lx);
    return p;
  }

  // spin accumulates with holdK, then settles back upright
  function updateSpin(w, h) {
    var dt = lastT < 0 ? 0 : Math.max(0, Math.min(0.05, w.t - lastT));
    lastT = w.t;
    if (w.dead) { spinA = 0; return; }
    if (h.hk > 0.04 && curTaffy(w)) spinA += dt * (3 + 15 * h.hk) * (1 + 0.6 * h.tp);
    else if (spinA) {
      var tgt = Math.ceil(spinA / 6.2832) * 6.2832;
      spinA += Math.min(tgt - spinA, dt * 14);
      if (tgt - spinA < 0.01) spinA = 0;
    }
  }

  function drawParts(w, lx) {
    var k, p, a, n = w.nParts != null ? w.nParts : w.parts.length, list = w.parts;
    // Batched: one path per (colour, alpha level) instead of one draw call per particle.
    // Alpha is quantised to 4 levels; confetti quads are rotated by hand (no save/rotate/restore).
    cols.length = 0;
    for (k = 0; k < n; k++) {
      p = list[k];
      a = Math.min(1, p.life / (p.max * 0.5));
      p._b = a > 0.75 ? 3 : a > 0.5 ? 2 : a > 0.25 ? 1 : 0;
      if (cols.indexOf(p.col) < 0) cols.push(p.col);
    }
    for (var b = 0; b < 4; b++) {
      ctx.globalAlpha = (b + 1) * 0.25;
      for (var c = 0; c < cols.length; c++) {
        var col = cols[c], any = false;
        for (k = 0; k < n; k++) {
          p = list[k];
          if (p._b !== b || p.col !== col) continue;
          if (!any) { ctx.beginPath(); any = true; }
          if (p.kind === 0) {
            var cr = Math.cos(p.rot), sr = Math.sin(p.rot), hw = p.size, hh = p.size * 0.6;
            ctx.moveTo(p.x + cr * hw - sr * hh, p.y + sr * hw + cr * hh);
            ctx.lineTo(p.x - cr * hw - sr * hh, p.y - sr * hw + cr * hh);
            ctx.lineTo(p.x - cr * hw + sr * hh, p.y - sr * hw - cr * hh);
            ctx.lineTo(p.x + cr * hw + sr * hh, p.y + sr * hw - cr * hh);
            ctx.closePath();
          } else if (p.kind === 1) {
            ctx.moveTo(p.x + p.size * 0.8, p.y); ctx.arc(p.x, p.y, p.size * 0.8, 0, 6.2832);
          } else addStar(p.x, p.y, p.size * 1.4, p.size * 0.6, 5, p.rot);
        }
        if (any) { ctx.fillStyle = col; ctx.fill(); }
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
    var py0 = R.toScreen(0, lx).y;
    for (k = 0; k < w.texts.length; k++) {
      p = w.texts[k];
      var sc = 1 + Math.max(0, p.life - p.max * 0.8) * 3;
      ctx.globalAlpha = Math.min(1, p.life / (p.max * 0.4));
      var fs = L.S * 0.62 * p.size * sc, tw = p.s.length * fs * 0.6, mg = L.S * 0.2;
      if (tw > W - mg * 2) { fs *= (W - mg * 2) / tw; tw = W - mg * 2; }
      var tx = Math.max(mg + tw / 2, Math.min(W - mg - tw / 2, p.x));
      // landscape: the HUD sits above the mallow, so lines go below it (mirrored around the mallow's row)
      var ty = L.portrait ? p.y : Math.max(fs * 0.6, Math.min(H - fs * 0.6, py0 + Math.abs(py0 - p.y) * 0.62));
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

  // dashed lateral arrow from one screen point to another
  function lateralArrow(a, b, col) {
    var S = L.S, dx = b.x - a.x, dy = b.y - a.y, len = Math.sqrt(dx * dx + dy * dy);
    if (len < S * 0.3) return;
    dx /= len; dy /= len;
    ctx.strokeStyle = col; ctx.lineWidth = S * 0.09; ctx.lineCap = 'round'; ctx.setLineDash([S * 0.16, S * 0.14]);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x - dx * S * 0.25, b.y - dy * S * 0.25); ctx.stroke();
    ctx.setLineDash([]);
    arrowTri(b.x - dx * S * 0.12, b.y - dy * S * 0.12, dx, dy, S * 0.22, col, '#e0508f', S * 0.05);
  }

  // after a miss: a faint outline of the size (and place) the mallow should have been, plus a short tip
  function drawGhost(G, w, lx) {
    if (!w.dead || !w.ghost) return;
    var S = L.S, tv = lx, fg = w.failGate, a = Math.min(1, w.deadT / 0.2);
    if (fg && w.cause === 'side') tv = gx(fg);
    else if (fg && w.cause === 'path' && hasPath(fg)) { var px = pathAt(fg, w.pos); if (px !== null) tv = px; }
    var p = R.toScreen(0, tv);
    var size = S * 0.8 * (w.ghost === 2 ? PUFF_VIEW : 1);
    ctx.save();
    ctx.globalAlpha = 0.4 * a;
    if (MP.skins && MP.skins.draw) MP.skins.draw(ctx, G.skinId(), p.x, p.y, size, { sx: 1, sy: 1 }, w.ghost === 2 ? 'puffed' : 'happy');
    ctx.globalAlpha = 0.9 * a;
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = S * 0.08; ctx.setLineDash([S * 0.22, S * 0.16]);
    ctx.beginPath(); ctx.arc(p.x, p.y, size * 0.6, 0, 6.2832); ctx.stroke();
    ctx.setLineDash([]);
    if (Math.abs(tv - lx) > 0.25) {
      var d = R.vec(0, tv > lx ? 1 : -1), m = R.toScreen(0, lx);
      lateralArrow({ x: m.x + d.x * S * 0.5, y: m.y + d.y * S * 0.5 }, { x: p.x - d.x * size * 0.62, y: p.y - d.y * size * 0.62 }, '#ffffff');
    }
    var p0 = R.toScreen(0, 0);
    if (w.tip) text(w.tip, W / 2, Math.max(S * 3.6, p0.y - S * 3), Math.min(S * 0.6, W / (w.tip.length * 0.56)), '#ffffff', '#e0508f', S * 0.13);
    ctx.restore();
  }
  var PUFF_VIEW = 2;

  // slide lesson: dashed target where the mallow must line up, an arrow, and a hand that presses and swipes
  function slideHint(G, w, lx) {
    var k, g = null;
    for (k = w.ni; k < w.gates.length && k < w.ni + 3; k++) {
      var q = w.gates[k];
      if (q.tutKind === 'slide' && q.state === 0) { g = q; break; }
    }
    if (!g) return false;
    var u = g.p - w.pos;
    if (u > L.ahead - 0.5 || u < -0.5) return false;
    var S = L.S, t = w.t, tx = gx(g), p = R.toScreen(0, lx), tgt = R.toScreen(0, tx), hp = R.toScreen(u, tx);
    var tol = cfg('HOLE_TOL', 0.45), lined = Math.abs(lx - tx) <= tol, big = w.puffT > 0;
    var pulse = 0.5 + 0.5 * Math.sin(t * 8);
    // rail from the hole gap down to the target spot
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = S * 0.07; ctx.setLineDash([S * 0.1, S * 0.18]);
    ctx.beginPath(); ctx.moveTo(hp.x, hp.y); ctx.lineTo(tgt.x, tgt.y); ctx.stroke();
    ctx.setLineDash([S * 0.2, S * 0.14]);
    ctx.strokeStyle = lined ? '#6fe0bd' : '#ffffff'; ctx.lineWidth = S * 0.09;
    ctx.beginPath(); ctx.arc(tgt.x, tgt.y, S * (0.48 + 0.06 * pulse), 0, 6.2832); ctx.stroke();
    ctx.setLineDash([]);
    if (!lined) {
      var d = R.vec(0, tx > lx ? 1 : -1), r0 = S * 0.8 * (w.pop || 1) * 0.5 + S * 0.15;
      // while big the slide arrows beside the mallow already point the way
      if (!big) lateralArrow({ x: p.x + d.x * r0, y: p.y + d.y * r0 }, { x: tgt.x - d.x * S * 0.55, y: tgt.y - d.y * S * 0.55 }, '#ffe14d');
      // hand: press, swipe toward the hole, lift
      var ph = mod(t, 1.6) / 1.6, press = ph < 0.15 ? ph / 0.15 : ph < 0.85 ? 1 : 1 - (ph - 0.85) / 0.15;
      var f = ph < 0.15 ? 0 : ph < 0.7 ? (ph - 0.15) / 0.55 : 1;
      f = f * f * (3 - 2 * f);
      var hx, hy;
      if (L.portrait) { hx = p.x + (tgt.x - p.x) * f; hy = p.y + S * 1.8; }
      else { hx = p.x - S * 1.9; hy = p.y + (tgt.y - p.y) * f + S * 0.2; }
      ctx.globalAlpha = Math.max(0.25, Math.min(1, press * 1.5));
      drawHand(hx, hy, S * 1.05, press);
      ctx.globalAlpha = 1;
    }
    var msg = lined ? (big ? 'LET GO!' : 'NICE!') : (big ? 'SLIDE!' : 'HOLD + SLIDE!');
    var ty = L.portrait ? p.y - S * 2.1 : (tx < lx ? p.y + S * 1.9 : p.y - S * 1.9), tX = L.portrait ? W / 2 : p.x;
    text(msg, tX, ty, S * 0.7 * (1 + 0.05 * pulse), '#ffffff', lined ? '#1e8f72' : '#e0508f', S * 0.15);
    return true;
  }

  function hints(G, w, lx) {
    var st = G.state, S = L.S, p = R.toScreen(0, lx);
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
    if (slideHint(G, w, lx)) return;
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
    var lx = num(w.lx, 0), h = holdInfo(w);
    var bf = num(w.beatF, -1), bp = bf >= 0 ? Math.pow(1 - mod(bf, 1), 3) : 0;
    if (bf >= 0 && mod(Math.floor(bf), 4) !== 0) bp *= 0.65;   // the bar's downbeat is a little stronger
    updateSpin(w, h);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var gr = ctx.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, 'rgb(' + (c[0][0] | 0) + ',' + (c[0][1] | 0) + ',' + (c[0][2] | 0) + ')');
    gr.addColorStop(1, 'rgb(' + (c[1][0] | 0) + ',' + (c[1][1] | 0) + ',' + (c[1][2] | 0) + ')');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    if (bp > 0.02 && st.mode !== 'menu') { ctx.fillStyle = 'rgba(255,255,255,' + (0.06 * bp) + ')'; ctx.fillRect(0, 0, W, H); }
    if (w.rush > 0) {
      ctx.fillStyle = 'rgba(255,190,70,' + (0.16 + 0.05 * Math.sin(w.t * 8)) + ')'; ctx.fillRect(0, 0, W, H);
    }
    ctx.save();
    if (w.shake > 0 && !w.demo) {
      // smooth decaying wobble instead of random jumps every frame (random offsets read as stutter)
      var sk = Math.min(1, w.shake / 0.12), sk2 = sk * sk * w.shakeAmp;
      ctx.translate(Math.sin(w.t * 53) * sk2, Math.cos(w.t * 41) * sk2 * 0.8);
    }
    // hold rumble: grows with holdK, kicks on each tick (smooth noise, not random jumps)
    if (h.hk > 0.05 && !w.demo && !w.dead && !st.paused && curTaffy(w)) {
      var am = S * (0.025 * h.hk + 0.07 * h.tp * h.hk);
      ctx.translate((Math.sin(w.t * 71) + Math.sin(w.t * 43)) * 0.5 * am, (Math.cos(w.t * 67) + Math.sin(w.t * 39)) * 0.5 * am);
    }
    var vel = w.vel || w.speed;
    var pos = w.pos + (w.demo || (st.mode === 'run' && st.running && !w.dead && !st.paused) ? vel * (G.alpha || 0) / 120 : 0);
    ctx.save();
    ctx.translate(L.px, L.py);
    if (L.portrait) ctx.rotate(-Math.PI / 2);
    ctx.scale(S, S);
    dim = st.mode === 'menu' ? 0.35 : 1;
    drawDecor(pos, vel + (w.rush > 0 ? 4 : 0), w, st.mode === 'menu' ? 0 : bp);
    ctx.globalAlpha = dim;
    drawGates(w, pos, st.mode === 'menu' ? 0 : bp);
    ctx.restore();
    if (st.mode !== 'menu') {
      drawFlag(w, pos); drawGhost(G, w, lx); drawPlayer(G, w, pos, lx, h);
      drawTickCounter(w, h, lx); drawFlourish(w, lx);
      if (h.big && h.tp > 0 && !w.dead) { ctx.fillStyle = 'rgba(255,255,255,' + (0.14 * h.tp) + ')'; ctx.fillRect(0, 0, W, H); }
    }
    drawParts(w, lx);
    hints(G, w, lx);
    if (st.mode === 'run') { drawHud(G, w); drawBanner(w); }
    ctx.restore();
  };
})();
