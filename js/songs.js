(function () {
  'use strict';
  window.MP = window.MP || {};

  // Mallow Pop song library. All songs are original compositions written for this game.
  //
  // Notation (tempo independent, 16 steps per bar, 4 steps per beat; spaces and '|' are ignored):
  //   k  key pitch class (0 = C), m mode, o octave of the lead tonic (tonic midi = 12 * (o + 1) + k)
  //   c  chords, one token per bar (or 2 digits = two half-bar chords): scale degree 1..7, diatonic triads
  //   L  lead phrases of 2 bars (32 steps). Letters are scale degrees: h = tonic, i = 2nd ... n = 7th,
  //      o = tonic + 1 octave ... u; a..g = the octave below. '-' = hold, '.' = rest.
  //   f  form: one phrase letter per 2 bars
  //   B  bass pattern (1 or 2 bars): r root, f fifth, t third, o octave, n diatonic approach to the next chord
  //   A  arp pattern (1 or 2 bars): 0..5 = chord tones of a close voicing (3..5 = an octave up)
  //   D  drum pattern (1 or 2 bars): k kick, s snare, h hat, o open hat, x kick+hat, y snare+hat, b kick+snare
  //      F (optional) = fill bar used as the last bar of every 8 bars (default: snare pickups on steps 13-15)
  var RAW = [
    // ---- zone 0: Marshmallow Meadow (gentle, happy) ----
    { id: 'meadow-puffball', n: 'Puffball Morning', z: 0, k: 0, m: 'ion', o: 4,
      c: '1 4 1 5 1 4 25 1 | 6 4 1 5 6 4 25 1', f: 'abacdegc',
      L: { a: 'j---l---o---l-k- m---m-k-h-----..', b: 'j---l-j-h---j-l- i---n---l-----..',
        c: 'k---m-k-i---n-i- h-----------....', d: 'o---q---o-m-j--- k---m---o---m-k-',
        e: 'l---j---l-o-q--- p-----n-l---i---', g: 'o---m---j---m-o- r---q---o---m---' },
      B: 'r-------f-----r-', A: '0.2.3.2.1.2.3.2.', D: 'x...y.h.x...y.h.' },
    { id: 'meadow-clover', n: 'Clover Nap', z: 0, k: 5, m: 'ion', o: 4,
      c: '1 3 4 1 2 5 1 5 | 1 3 4 1 2 5 1 1', f: 'abcdabce',
      L: { a: 'l-----j-h---j--- l-----n-l---j---', b: 'm-----o-m---k--- j-----h-j-------',
        c: 'k-----m-k---i--- n-----l-i-------', d: 'h-----j-l---o--- n-----p-n---l---',
        e: 'o-----n-l---j--- h-----------....' },
      B: 'r-----f-o---f---', A: '0...2.1.0...2.1.', D: 'x...y.h.x.h.y.hh', F: 'x...y.h.x.h.ysss' },
    { id: 'meadow-dandelion', n: 'Dandelion Drift', z: 0, k: 2, m: 'mix', o: 4,
      c: '1 7 4 1 1 7 4 5 | 4 1 7 4 4 1 7 1', f: 'abacdedg',
      L: { a: 'l---l-m-l---j-h- i---k-i-n---.---', b: 'k---m-k-h---h-i- j-------.---h-i-',
        c: 'k---m-o-m---k--- l-----n-i-------', d: 'o---o-m-k---m-o- l---j---h-------',
        e: 'n---p-n-k---i--- k---h---m-------', g: 'i---k---n---k-i- h-----------....' },
      B: 'r--.f--.r--.f-r-', A: '0.2.1.2.0.2.1.2.', D: 'x.h.s.hhx.h.s.h.' },
    { id: 'meadow-softserve', n: 'Soft Serve Stroll', z: 0, k: 10, m: 'ion', o: 4,
      c: '1 6 2 5 1 6 2 5 | 4 5 3 6 2 5 1 1', f: 'abacdebg',
      L: { a: 'j-i-h-i-j---l--- m-l-j-l-m---o---', b: 'k-j-i-j-k---m--- l---n---i-------',
        c: 'm---k---i---k-m- n-------l---.---', d: 'o---m---k---m-o- p---n---l---n-p-',
        e: 'q---n---l---j--- o---m---h---j---', g: 'j-i-h-i-j---l--- h-----------....' },
      B: 'r---t---f---n---', A: '0...1...2...1...', D: 'x.h.y...x.h.y.h.' },

    // ---- zone 1: Candy Clouds (airy) ----
    { id: 'clouds-cotton', n: 'Cotton Sky', z: 1, k: 4, m: 'lyd', o: 4,
      c: '1 2 1 2 6 5 1 2 | 6 3 2 1 6 5 2 1', f: 'agbcdebh',
      L: { a: 'l-----------j--- k-----------i---', g: 'l-------o---q--- p-------m-------',
        b: 'o-------m---j--- n-------l-------', c: 'j---l---o------- p-----k-m-------',
        d: 'q-------o---m--- n-------l---j---', e: 'm-------k---i--- j---------------',
        h: 'p-------m---k--- l-----------....' },
      B: 'r-----------f---', A: '0234543202345432', D: 'x...h.h.b...h.h.', F: 'x...h.h.b...s.ss' },
    { id: 'clouds-floaty', n: 'Floaty Fluff', z: 1, k: 8, m: 'ion', o: 4,
      c: '4 1 4 5 4 1 2 5 | 6 4 1 5 6 4 5 1', f: 'abacdedg',
      L: { a: 'o-----m-----k--- l-----j-----h---', b: 'o-----r-----o--- p-----n-----l---',
        c: 'm-----k-----i--- l-----n-----p---', d: 'q-----o-----m--- r-----o-----k---',
        e: 'q-----o-----l--- p-------n---l---', g: 'n-----p-----n--- o-----------....' },
      B: 'r-------f---r---', A: '5.4.3.2.1.2.3.4.', D: 'x..hh..hb..hh..h', F: 'x..hh..hb..hs.ss' },
    { id: 'clouds-updraft', n: 'Updraft', z: 1, k: 7, m: 'ion', o: 4,
      c: '1 3 4 4 1 3 2 5 | 6 5 4 1 6 5 2 5', f: 'abacdedg',
      L: { a: 'h-----j-----l--- n-----l-----j---', b: 'k-----m-----o--- m-----k---------',
        c: 'i-----k-----m--- l-----n-----p---', d: 'o-----m-----j--- n-----l-----i---',
        e: 'm-----o-----r--- q-----o---------', g: 'p-----m-----k--- i-----n---l-----' },
      B: 'r-----r-f-----r-', A: '0..2..3.1..2..4.', D: 'x..h..h.b..h..h.' },
    { id: 'clouds-gumdrop', n: 'Gumdrop Glide', z: 1, k: 2, m: 'lyd', o: 4,
      c: '1 1 2 2 3 6 2 5 | 6 3 2 1 6 3 2 1', f: 'abcdegeh',
      L: { a: 'o---n-l-j------- l---j-h-j-------', b: 'p---o-m-k------- m---k-i-k-------',
        c: 'q---o-n-l------- m---o-q-o-------', d: 'p---m-k-i------- l---n-p-n-------',
        e: 'm-------o---m--- l-------n---q---', g: 'k-------m---p--- o---------------',
        h: 'p---o-m-k------- h-----------....' },
      B: 'r-----r-r-----r-', A: '0.2.4.3.5.3.4.2.', D: 'x...h..hb...h.h.' },

    // ---- zone 2: Jelly Lake (bouncy) ----
    { id: 'jelly-hop', n: 'Jelly Hop', z: 2, k: 5, m: 'mix', o: 4,
      c: '1 1 4 4 7 7 1 1 | 4 4 7 7 4 5 1 1', f: 'abcdefgh',
      L: { a: 'h--h--j-l---j-h- l--l--j-h-------', b: 'k--k--m-o---m-k- m--m--k-h-------',
        c: 'n--n--k-i---k-n- p--p--n-k-------', d: 'o--o--l-j---l-o- q--o--l-o-------',
        e: 'r--r--o-m---o-r- o--m--k-m-------', f: 'p--p--n-k---n-p- n--k--i-k-------',
        g: 'o--m--k-m---o--- l--n--l-i-------', h: 'h--j--l-o---l-j- h-----------....' },
      B: 'r--o--r-r--o-r-o', A: '0..1..2.3..2..1.', D: 'x..hy..hx.hky.hh' },
    { id: 'jelly-wobble', n: 'Wobble Bay', z: 2, k: 10, m: 'dor', o: 4,
      c: '1 4 1 4 3 4 1 1 | 7 7 3 3 4 4 5 5', f: 'abcdefgh',
      L: { a: 'h.h.j..lh.....j. k.k.m..ok.....m.', b: 'o.o.l..jh...j.l. m-k-h---.---h-i-',
        c: 'j.j.l..nl...j.l. m.m.o..mk-------', d: 'l---j---h.h.j.l. h-----------....',
        e: 'n.n.p..ni...k.n. p.p.n..kk-------', f: 'q.q.n..lj...l.n. q-------n---l---',
        g: 'r.r.o..mk...m.o. o-------m---k---', h: 'l.l.n..pi...n.l. i---l---n---p---' },
      B: 'r..r..f.r.o.f.r.', A: '..0...1...2...1.', D: 'x.hhy..hx.h.y.hk' },
    { id: 'jelly-gummy', n: 'Gummy Splash', z: 2, k: 4, m: 'ion', o: 4,
      c: '1 2 4 1 6 2 5 5 | 1 2 4 1 6 2 5 1', f: 'abcdaecg',
      L: { a: 'h..j..l.o.l.j.l. i..k..m.p.m.k.m.', b: 'k..m..o.r.o.m.o. o-----l-j---h---',
        c: 'm..o..q.o.m.j.m. k..m..p.m.k.i.k.', d: 'l-------n---p--- n.n.l.n.i-------',
        e: 'k..m..o.r.o.m.o. q-----o-l---j---', g: 'l-------n---p--- o-----------....' },
      B: 'r.r.o.r.f.f.o.f.', A: '0..2..1.3..2..4.', D: 'x..ky.h.x.hky.h.' },
    { id: 'jelly-ripple', n: 'Ripple Rag', z: 2, k: 9, m: 'aeo', o: 4,
      c: '1 6 7 1 1 6 7 7 | 4 4 1 1 6 7 1 1', f: 'abacdefg',
      L: { a: 'l.l.j.h.h..jl... m.m.o.m.j..hj...', b: 'n.n.p.n.k..ik... h-------l.j.h...',
        c: 'n.n.p.n.k..ik... i.k.n.p.n-------', d: 'o.o.r.o.m..km... k.m.o.m.k-------',
        e: 'q.q.o.l.j..lo... l.j.h.j.l-------', f: 'm.o.q.o.m..jm... n.p.r.p.n-------',
        g: 'o.o.l.j.h..jh... h-----------....' },
      B: 'r...o.f.r...o.f.', A: '..1...2...1...2.', D: 'x...y.hkx.h.y..h' },

    // ---- zone 3: Sprinkle Sky (bright, busier) ----
    { id: 'sky-shower', n: 'Sprinkle Shower', z: 3, k: 2, m: 'ion', o: 4,
      c: '1 4 5 1 6 2 5 5 | 4 4 1 6 2 2 5 5', f: 'abcdefgh',
      L: { a: 'h-jl-.l-o-l-j-l- k-mo-.o-r-o-m-o-', b: 'l-np-.p-s-p-n-p- o-----q-o---l---',
        c: 'm-oq-.q-o-m-j-m- i-km-.m-p-m-k-m-', d: 'n-p-n-l-i-l-n-p- l---i---l---n---',
        e: 'o-mk-.k-m-o-r-o- m-----k-h---m---', f: 'j-lo-.o-q-o-l-j- m-oq-.q-o-m-h-m-',
        g: 'p-----m-k---i--- k-mp-.p-m-k-i---', h: 'l-np-.p-s---p--- n-----l-i---.---' },
      B: 'r.r.f.r.r.r.f.o.', A: '0123210301232103', D: 'x.hhy.hhx.hhy.hh' },
    { id: 'sky-glitter', n: 'Glitter Pop', z: 3, k: 9, m: 'ion', o: 4,
      c: '1 45 1 25 6 45 36 25 | 1 45 1 25 6 45 36 51', f: 'abcdabce',
      L: { a: 'o-o-q-o-l-l-j-l- m-m-o-m-n-n-p-n-', b: 'q-q-o-q-s-q-o-l- k-k-m-k-l-n-p-n-',
        c: 'o-m-o-q-o-m-j-m- k-m-o-k-l-n-p-l-', d: 'q-n-l-n-q-o-m-o- p-m-k-m-n-l-i-l-',
        e: 'q-n-l-n-q-o-m-o- n-p-n-l-o-------' },
      B: 'r.o.r.o.r.o.r.o.', A: '2.1.0.1.2.1.0.1.', D: 'x.h.y.h.x.hhy.h.' },
    { id: 'sky-confetti', n: 'Confetti Run', z: 3, k: 7, m: 'mix', o: 4,
      c: '1 4 7 4 1 4 2 5 | 4 4 1 1 7 7 2 5', f: 'abacdefc',
      L: { a: 'h-ijl-l-o-l-j-h- k-lmo-o-m-k-m-o-', b: 'n-opk-k-i-k-n-p- o-----m-k---h---',
        c: 'p-onm-m-k-i-k-m- l-mnp-p-n-l-i---', d: 'o-pqr-r-o-m-k-m- m-----o-m---o---',
        e: 'q-pol-l-j-l-o-q- s---q---o-------', f: 'p-onk-k-n-k-i-k- n---p---n---k---' },
      B: 'r.rf.fr.r.rf.fo.', A: '0.3.1.4.2.5.1.4.', D: 'x.hky.h.x.hky.hh' },
    { id: 'sky-sparkler', n: 'Sugar Sparkler', z: 3, k: 3, m: 'ion', o: 4,
      c: '1 3 4 5 1 3 4 1 | 6 3 4 1 2 3 4 5', f: 'abacdgeh',
      L: { a: 'o-q-s-q-o...l... n-l-j-l-n...q...', b: 'r-o-m-o-r...m... p-n-l-n-p...n...',
        c: 'k-m-o-r-o...m... l-j-h-j-l-------', d: 'q-o-m-o-q...o... s-q-n-q-s...q...',
        g: 'r-o-m-o-r...k... o-l-j-l-o-------', e: 'p-m-k-m-p...m... q-n-l-n-q...l...',
        h: 'o-r-o-m-k...m... n-p-n-l-i-------' },
      B: 'r.r.r.r.f.f.f.f.', A: '0.1.2.3.2.1.0.1.', D: 'x.h.y.hkx.h.y.hy' },

    // ---- zone 4: Starlight Sundae (dreamy but driving) ----
    { id: 'star-moonscoop', n: 'Moon Scoop', z: 4, k: 11, m: 'aeo', o: 4,
      c: '1 6 3 7 1 6 4 5 | 6 7 1 1 6 7 4 5', f: 'abacdedg',
      L: { a: 'l---j---h-----j- m-------o---m---', b: 'n---l---j-----l- n-------p---i---',
        c: 'o---m---k-----m- n-------l-------', d: 'q---o---m---o-q- p---n---k---n-p-',
        e: 'o-------l---j--- h-----------l---', g: 'r---o---m---o-r- p-------n---l---' },
      B: 'r.r.r.r.r.r.f.o.', A: '0245024502450245', D: 'x.h.y.hox.hhy.ho' },
    { id: 'star-sherbet', n: 'Night Sherbet', z: 4, k: 2, m: 'dor', o: 4,
      c: '1 7 3 4 1 7 5 5 | 3 4 1 7 3 4 5 5', f: 'abacdedg',
      L: { a: 'h-l-o-l-j-l-h-l- n-p-k-p-i-k-n---', b: 'j-l-n-l-q-n-l-j- k-m-o-m-r-o-m-o-',
        c: 'l-n-p-n-l---i--- p-------n---l---', d: 'q---n---l---n-q- r---o---m-------',
        e: 'o---l---j---l-o- p---n---k---n---', g: 's---p---n---p-s- s-------p---n---' },
      B: 'r.ro.ro.r.ro.ro.', A: '0120120120120120', D: 'x..hy.hkx.h.y.oh' },
    { id: 'star-comet', n: 'Comet Cone', z: 4, k: 7, m: 'hmin', o: 4,
      c: '1 4 5 1 6 4 5 5 | 1 6 4 5 1 4 5 1', f: 'abcdefag',
      L: { a: 'l---j-l-o---l-j- k---m-k-h-------', b: 'n---i-n-l---n-p- o---------------',
        c: 'q---o-m-j---m-o- r---o-m-k-------', d: 'p---n-p-s---p-n- l---i---n---l---',
        e: 'o---l---j---l-o- q---o---m---o---', f: 'r---o---m---k--- n-------p-----n-',
        g: 'n---i-n-l---n-i- h-----------....' },
      B: 'r.rr.rr.r.rr.rf.', A: '0.1.2.3.4.3.2.1.', D: 'x.h.y.hhx.hky.hh' },
    { id: 'star-nebula', n: 'Nebula Float', z: 4, k: 6, m: 'aeo', o: 4,
      c: '6 7 1 1 6 7 3 3 | 4 4 1 1 6 7 1 1', f: 'abacdegf',
      L: { a: 'j-------h---j-lm p-------n---k-mn', b: 'o-------l---j--- l-------h-------',
        c: 'q-------n---l-np q-------l-------', d: 'r-------o---m-op r-------o---m---',
        e: 'q-------o---l--- o-------l---j---', g: 'q-------o---m-op r-------p---n---',
        f: 'o-------l---j-l- h-----------....' },
      B: 'rr.orr.orr.orr.o', A: '3543354335433543', D: 'x.h.y.ohx.h.y.oh' },

    // ---- zone 5: Rainbow Road (most energetic) ----
    { id: 'rainbow-prism', n: 'Prism Sprint', z: 5, k: 4, m: 'dor', o: 4,
      c: '1 4 3 4 1 4 7 7 | 3 4 1 4 3 4 5 5', f: 'abacefed',
      L: { a: 'o.o.q.o.l.ljo... m.m.o.m.k.kmo...', b: 'q.q.s.q.n.nlq... o.o.r.o.m.mko...',
        c: 'p.n.k.n.p.r.p.n. i---k---n---p---', e: 's.q.n.q.s.q.n.l. r.o.m.o.r.o.m.k.',
        f: 'q.o.l.o.q.o.l.j. o.m.k.m.o.m.k.m.', d: 'p.p.n.p.s.s.p.n. l.n.p.s.p.n.l.i.' },
      B: 'rrorrrorrrorrror', A: '0.1.2.1.3.2.1.2.', D: 'x.hhb.h.x.hhb.ho' },
    { id: 'rainbow-cannon', n: 'Color Cannon', z: 5, k: 9, m: 'mix', o: 4,
      c: '1 7 4 4 1 7 5 5 | 4 4 1 1 4 7 1 1', f: 'abacdefg',
      L: { a: 'h.o.hjl.o.l.j.h. n.p.nik.p.k.i.n.', b: 'k.r.kmo.r.o.m.k. m.o.r.o.m.k.h...',
        c: 'l.s.lnp.s.p.n.l. n.p.s.p.n.p.n...', d: 'r.r.o.r.m.o.r.s. r---o---m---k---',
        e: 'q.q.o.q.l.o.q.s. o---l---j---h---', f: 'o.m.k.m.o.r.o.m. n.p.n.k.i.k.i.k.',
        g: 'h.o.hjl.o.l.j.h. h.......o.......' },
      B: 'rorr.rorrorr.ror', A: '3.2.1.0.3.2.1.0.', D: 'x.hkb.h.x.hkb.hh' },
    { id: 'rainbow-gumball', n: 'Hyper Gumball', z: 5, k: 1, m: 'ion', o: 4,
      c: '1 3 6 6 4 5 1 1 | 2 2 5 5 4 5 1 1', f: 'abcdefhg',
      L: { a: 'l.ll.lo.q.o.l.j. n.nn.nq.s.q.n.l.', b: 'o.oo.oq.m.o.j.m. h.......o...q...',
        c: 'm.mm.mo.r.o.m.k. n.nn.np.s.p.n.l.', d: 'q.qq.qo.l.o.q.s. o-----------....',
        e: 'm.mm.mk.i.k.m.p. r.......p...m...', f: 'n.nn.nl.i.l.n.p. s-------p---n---',
        h: 'r.rr.ro.m.o.r.o. p.pp.pn.l.n.p.s.', g: 'q.qq.qs.q.o.l.j. h-----------....' },
      B: 'r.or.or.r.or.ofo', A: '0240240240245420', D: 'x.hhb.hhx.hhb.hh' },
    { id: 'rainbow-rocket', n: 'Rainbow Rocket', z: 5, k: 0, m: 'aeo', o: 4,
      c: '1 7 6 7 1 7 4 5 | 6 6 7 7 6 7 1 1', f: 'abacdegf',
      L: { a: 'o--o--q-o--l--j- n--n--p-k--i--n-', b: 'q--q--o-m--o--q- p--p--r-k--n--p-',
        c: 'o--o--r-m--k--m- n--n--p-l--n--i-', d: 'j-m-o-q-o-m-j-m- q-o-m-o-q-------',
        e: 'k-n-p-r-p-n-k-n- r-p-n-p-r-------', g: 'o--o--q-o--m--j- p--p--r-p--n--k-',
        f: 'o--o--q-s--q--o- o-----------....' },
      B: 'r--r--o-r--r--fo', A: '5.3.0.3.5.3.0.3.', D: 'x.h.b.hkx.hkb.hh' }
  ];

  var MODES = {
    ion: [0, 2, 4, 5, 7, 9, 11], dor: [0, 2, 3, 5, 7, 9, 10], mix: [0, 2, 4, 5, 7, 9, 10],
    lyd: [0, 2, 4, 6, 7, 9, 11], aeo: [0, 2, 3, 5, 7, 8, 10], hmin: [0, 2, 3, 5, 7, 8, 11]
  };
  var LETTERS = 'abcdefghijklmnopqrstu'; // h = tonic
  var DRUM = { '.': 0, k: 1, s: 2, h: 4, o: 8, x: 5, y: 6, b: 3 };
  var BASS_LO = 38; // bass roots fall in [D2, C#3]
  var ARP_LO = 62;  // arp voicings sit in [D4, C#5] (+ an octave for 3..5)
  var KICK = 1, SNARE = 2, HAT = 4, OHAT = 8, CRASH = 16;
  var ZONE_GATES = [0, 25, 50, 75, 100, 150];

  function strip(s) { return String(s || '').replace(/[\s|]/g, ''); }
  function mod(a, n) { return ((a % n) + n) % n; }

  // pitch of scale degree d (0 = tonic, may be negative or >= 7) above the midi note `base`
  function degPitch(scale, base, d) {
    return base + 12 * Math.floor(d / 7) + scale[mod(d, 7)];
  }

  function fillFrom(bar) {
    var f = bar.slice(0);
    f[13] = (f[13] & KICK) | SNARE; f[14] = (f[14] & KICK) | SNARE; f[15] = (f[15] & KICK) | SNARE;
    return f;
  }

  function parseDrums(s) {
    var out = [];
    for (var i = 0; i < s.length; i++) out.push(DRUM[s.charAt(i)] || 0);
    return out;
  }

  function decode(r) {
    var scale = MODES[r.m] || MODES.ion;
    var form = strip(r.f);
    var bars = form.length * 2;
    var steps = bars * 16;
    var tonic = 12 * ((r.o == null ? 4 : r.o) + 1) + r.k;
    var i, j, k;

    // chords per half bar (scale degree, 0-based)
    var toks = String(r.c).split(/[\s|]+/);
    var ct = [];
    for (i = 0; i < toks.length; i++) if (toks[i]) ct.push(toks[i]);
    var half = [];
    for (i = 0; i < bars; i++) {
      var t = ct[i % ct.length];
      var a = (+t.charAt(0)) - 1;
      var b = t.length > 1 ? (+t.charAt(1)) - 1 : a;
      half.push(a, b);
    }
    var chordPcs = [];
    var arpV = [];
    for (i = 0; i < half.length; i++) {
      var pcs = [];
      for (j = 0; j < 3; j++) pcs.push(mod(r.k + degPitch(scale, 0, half[i] + 2 * j), 12));
      chordPcs.push(pcs);
      var v = [];
      for (j = 0; j < 3; j++) v.push(ARP_LO + mod(pcs[j] - ARP_LO, 12));
      v.sort(function (x, y) { return x - y; });
      arpV.push([v[0], v[1], v[2], v[0] + 12, v[1] + 12, v[2] + 12]);
    }

    // lead
    var leadStr = '';
    for (i = 0; i < form.length; i++) leadStr += strip(r.L[form.charAt(i)]);
    var lead = new Array(steps), leadDur = new Array(steps);
    for (i = 0; i < steps; i++) { lead[i] = 0; leadDur[i] = 0; }
    var cur = -1;
    for (i = 0; i < steps; i++) {
      var ch = leadStr.charAt(i);
      if (ch === '-') { if (cur >= 0) leadDur[cur]++; continue; }
      cur = -1;
      if (ch === '.' || !ch) continue;
      var li = LETTERS.indexOf(ch);
      if (li < 0) continue;
      lead[i] = degPitch(scale, tonic, li - 7);
      leadDur[i] = 1;
      cur = i;
    }

    // harmony under the lead: highest chord tone at least 3 semitones below the lead note
    var harm = new Array(steps);
    for (i = 0; i < steps; i++) {
      harm[i] = 0;
      if (!lead[i]) continue;
      var cp = chordPcs[i >> 3];
      var best = 0;
      for (j = 0; j < 3; j++) {
        var p = lead[i] - 3 - mod(lead[i] - 3 - cp[j], 12);
        if (p > best) best = p;
      }
      harm[i] = best;
    }

    function rootAt(h) { return BASS_LO + mod(chordPcs[h][0] - BASS_LO, 12); }

    // bass
    var bp = strip(r.B), bass = new Array(steps), bassDur = new Array(steps);
    for (i = 0; i < steps; i++) { bass[i] = 0; bassDur[i] = 0; }
    cur = -1;
    for (i = 0; i < steps; i++) {
      var bc = bp.charAt(i % bp.length);
      if (bc === '-') { if (cur >= 0) bassDur[cur]++; continue; }
      cur = -1;
      if (bc === '.' || !bc) continue;
      var h = i >> 3;
      var root = rootAt(h);
      var changed = (i % 8 === 0) && h > 0 && half[h] !== half[h - 1];
      var note = root;
      if (bc === 'o') note = root + 12;
      else if (!changed) {
        if (bc === 'f') note = root + mod(chordPcs[h][2] - chordPcs[h][0], 12);
        else if (bc === 't') note = root + mod(chordPcs[h][1] - chordPcs[h][0], 12);
        else if (bc === 'n') {
          var nh = h;
          while (nh < half.length - 1 && half[nh] === half[h]) nh++;
          if (half[nh] === half[h]) nh = 0;
          var target = rootAt(nh);
          var below = mod(r.k + degPitch(scale, 0, half[nh] - 1), 12);
          note = target - mod(target - below, 12);
          if (note < BASS_LO - 2) note += 12;
        }
      }
      bass[i] = note;
      bassDur[i] = 1;
      cur = i;
    }

    // arp
    var ap = strip(r.A), arp = new Array(steps), arpDur = new Array(steps);
    for (i = 0; i < steps; i++) { arp[i] = 0; arpDur[i] = 0; }
    cur = -1;
    for (i = 0; i < steps; i++) {
      var ac = ap.charAt(i % ap.length);
      if (ac === '-') { if (cur >= 0) arpDur[cur]++; continue; }
      cur = -1;
      if (ac === '.' || !ac) continue;
      k = +ac;
      if (!(k >= 0 && k <= 5)) continue;
      arp[i] = arpV[i >> 3][k];
      arpDur[i] = 1;
      cur = i;
    }

    // drums: main pattern, fill on the last bar of every 8, crash on the first
    var dp = parseDrums(strip(r.D));
    var fill = r.F ? parseDrums(strip(r.F)) : fillFrom(dp.slice(dp.length - 16));
    var drum = new Array(steps);
    for (i = 0; i < steps; i++) {
      var bar = i >> 4;
      var d = (bar % 8 === 7) ? fill[i & 15] : dp[i % dp.length];
      if (bar % 8 === 0 && (i & 15) === 0) d |= CRASH;
      drum[i] = d;
    }

    var minor = scale[2] === 3;
    return {
      id: r.id, name: r.n, zone: r.z, key: r.k, mode: r.m, bars: bars, steps: steps, tonic: tonic,
      scale: scale, minor: minor, penta: minor ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9],
      chords: half, chordPcs: chordPcs, form: form,
      lead: lead, leadDur: leadDur, harm: harm, bass: bass, bassDur: bassDur, arp: arp, arpDur: arpDur, drum: drum
    };
  }

  var list = [];
  var byId = {};
  var byZone = [[], [], [], [], [], []];
  for (var s = 0; s < RAW.length; s++) {
    var song = decode(RAW[s]);
    list.push(song);
    byId[song.id] = song;
    byZone[Math.max(0, Math.min(5, song.zone))].push(song);
  }

  function forZone(zone) {
    var z = Math.max(0, Math.min(5, zone | 0));
    while (z > 0 && !byZone[z].length) z--;
    return byZone[z];
  }

  // segment -> zone, using the game's zone thresholds (gates 0/25/50/75/100/150; a segment is 25 gates)
  function zoneForSeg(seg) {
    var g = Math.max(0, seg | 0) * 25;
    var z = 0;
    while (z + 1 < ZONE_GATES.length && g >= ZONE_GATES[z + 1]) z++;
    return z;
  }

  // deterministic for a given rng stream; optional prevId avoids repeating the song that is playing
  function pick(seg, rng, prevId) {
    var arr = forZone(zoneForSeg(seg));
    var r = typeof rng === 'function' ? rng() : Math.random();
    if (!(r >= 0 && r < 1)) r = 0;
    var i = Math.floor(r * arr.length);
    if (prevId && arr.length > 1 && arr[i].id === prevId) i = (i + 1) % arr.length;
    return arr[i];
  }

  MP.songs = {
    list: list,
    get: function (id) { return byId[id] || null; },
    forZone: forZone,
    zoneForSeg: zoneForSeg,
    pick: pick,
    MODES: MODES,
    DRUM_BITS: { kick: KICK, snare: SNARE, hat: HAT, ohat: OHAT, crash: CRASH },
    raw: RAW
  };
})();
