// Myra in pixels: a little cloudberry (a bumpy cluster of golden beads with a leafy crown, ink eyes and blush).
// She breathes, blinks, glances around, hops when she does something, and wiggles while she's thinking.
// The art is Myra's own (see TRADEMARKS.md). The API is the one the app has always used: Goo(canvas, opts) → { hop, think, pose, setColors, draw }.

(() => {
  // her shape: X is berry, the leaves sit on top; the beads are textured in below
  const SIL = [
    '................', '................', '................', '................',
    '.....XX..XX.....', '...XXXXXXXXXX...', '..XXXXXXXXXXXX..', '.XXXXXXXXXXXXXX.', '.XXXXXXXXXXXXXX.',
    'XXXXXXXXXXXXXXXX', 'XXXXXXXXXXXXXXXX', '.XXXXXXXXXXXXXX.', '.XXXXXXXXXXXXXX.', '..XXXXXXXXXXXX..', '...XX.XXXX.XX...',
  ];
  const LEAVES = { '6,0': 'l', '9,0': 'l', '3,1': 'l', '4,1': 'L', '5,1': 'L', '6,1': 'l', '9,1': 'l', '10,1': 'L', '11,1': 'L', '12,1': 'l',
    '4,2': 'l', '5,2': 'L', '6,2': 'L', '7,2': 'l', '8,2': 'l', '9,2': 'L', '10,2': 'L', '11,2': 'l', '6,3': 'l', '7,3': 'l', '8,3': 'l', '9,3': 'l' };
  // B body, S bead shine, s soft shine, D seam between beads, d shade along her bottom edge; L/l leaves
  const grid = SIL.map((row, y) => [...row].map((c, x) => {
    if (LEAVES[`${x},${y}`]) return LEAVES[`${x},${y}`];
    if (c !== 'X') return null;
    if (y === 14 || SIL[y + 1]?.[x] !== 'X') return 'd';
    const off = Math.floor(y / 3) % 2 * 2;
    if (y % 3 === 1 && (x + off) % 4 === 1) return 'S';
    if (y % 3 === 1 && (x + off) % 4 === 2) return 's';
    if (y % 3 === 0 && (x + off) % 4 === 3) return 'D';
    return 'B';
  }));
  window.MYRA_GRID = grid;
  const mix = (a, b, k) => { const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)), A = p(a), B = p(b);
    return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, '0')).join(''); };

  window.Goo = (canvas, opts = {}) => {
    const GW = 16, GH = 15, W = canvas.width, H0 = canvas.height, px0 = Math.max(1, Math.floor(Math.min(W / (GW + 1), H0 / (GH + 1))));
    if (opts.headroom) {   // rows of room above her (kept so callers that ask for it still line up)
      const cs = getComputedStyle(canvas), k = (parseFloat(cs.height) || H0) / H0, extra = opts.headroom * px0;
      canvas.height = H0 + extra; canvas.style.height = (H0 + extra) * k + 'px'; canvas.style.marginTop = `calc(${cs.marginTop || '0px'} - ${extra * k}px)`;
    }
    const g = canvas.getContext('2d'), H = canvas.height;
    let col = opts.colors || { B: '#f6a63c', S: '#ffe0a0', D: '#de8526' }, pal = null;
    const palette = () => pal || (pal = { B: col.B, S: col.S, s: mix(col.B, col.S, .45), D: col.D, d: mix(col.D, '#000000', .22), L: col.L || '#7cc95e', l: col.l || '#3f8f3c' })   // a color can bring its own leaves (a green Myra gets teal ones, so the crown still shows);
    let hopT = -9, thinking = false, look = 0, lookTo = 0, nextLook = 0, pose = null;   // pose: 'sleepy' | 'shook' | 'sigh' | null, the same faces as her stamps
    // Calmest: her colors softened toward a gentle gray (kept light so she still reads as her color)
    const mutedCache = new Map();
    const mute = hex => { if (!window.myraMuted || !/^#[0-9a-f]{6}$/i.test(hex)) return hex; if (mutedCache.has(hex)) return mutedCache.get(hex);
      const n = parseInt(hex.slice(1), 16), r = n >> 16 & 255, gg = n >> 8 & 255, b = n & 255, y = .3 * r + .59 * gg + .11 * b, k = .7;
      const out = '#' + [r, gg, b].map(v => Math.round(v + (y + (238 - y) * .25 - v) * k).toString(16).padStart(2, '0')).join(''); mutedCache.set(hex, out); return out; };
    function frame(now) {
      const t = now / 1000, px = px0, P = palette(); g.clearRect(0, 0, W, H);
      if (t > nextLook) { lookTo = [-1, 0, 0, 1][Math.floor(Math.random() * 4)]; nextLook = t + 1.5 + Math.random() * 2.5; }
      look += (lookTo - look) * .2;
      const calm = window.myraCalm, hp = t - hopT, lift = !calm && hp < .45 ? Math.sin(hp / .45 * Math.PI) * 3 : 0;   // calm: she sits still (she still blinks)
      const sighPh = pose === 'sigh' ? Math.floor((t % .78) / .26) : 0;   // the sigh runs normal, sigh, normal at 260 ms a frame, like her stamp
      // each face has its own motion: shook trembles, sleepy breathes slow and deep, and she deflates a little mid-sigh
      const wig = thinking && !calm ? Math.sin(t * 14) * .6 : pose === 'shook' && !calm ? Math.sin(t * 38) * .55 : 0;
      const breathe = calm ? 0 : pose === 'sleepy' ? Math.sin(t * 1.3) * .07 : pose === 'sigh' && sighPh === 1 ? -.06 : Math.sin(t * 2.4) * .04;
      if (calm) look = 0;
      const ox = (W - GW * px) / 2 + wig * px * .5, oy = H - GH * px - Math.round(lift) * px;
      g.save(); g.translate(W / 2, H); g.scale(1 - breathe * .5, 1 + breathe); g.translate(-W / 2, -H);
      grid.forEach((row, y) => row.forEach((c, x) => { if (c) { g.fillStyle = mute(P[c]); g.fillRect(ox + x * px, oy + y * px, px, px); } }));
      const blink = (t % 3.3) > 3.15, ex = Math.round(look), ink = mute('#2a1708');
      const closed = pose === 'sleepy' || (pose === 'sigh' && sighPh === 1);
      if (pose === 'shook') {   // wide white eyes, a round open mouth, a sweat drop
        g.fillStyle = mute('#ffffff'); [3, 10].forEach(c => g.fillRect(ox + c * px, oy + 7 * px, px * 2, px * 3));
        g.fillStyle = ink; [4, 11].forEach(c => g.fillRect(ox + c * px, oy + 8 * px, px, px)); g.fillRect(ox + 7 * px, oy + 11 * px, px * 2, px * 2);
        g.fillStyle = mute('#c8dcf0'); g.fillRect(ox + 14.5 * px, oy + (3.5 + Math.sin(t * 5) * .4) * px, px * 1.3, px * 2.4);
      } else if (closed) {   // eyes shut: sleepy, or mid-sigh
        g.fillStyle = ink; [3, 10].forEach(c => g.fillRect(ox + c * px, oy + 8.5 * px, px * 3, px * .9));
      } else {
        g.fillStyle = ink; [4, 11].forEach(c => g.fillRect(ox + (c + ex) * px, oy + (blink ? 8.5 : 8) * px, px, blink ? px * .4 : px * 2));
      }
      g.fillStyle = mute('#ff8fa8'); [2, 13].forEach(c => g.fillRect(ox + c * px, oy + 10 * px, px, px));
      if (pose !== 'shook') { g.fillStyle = mute(P.d); if (pose === 'sigh') g.fillRect(ox + 6.5 * px, oy + 11 * px, px * 3, px); else g.fillRect(ox + 7 * px, oy + 11 * px, px * 2, px); }   // a small smile
      if (pose === 'sleepy') {   // little Zs drift up and fade
        const z = (x, y, u) => { g.fillRect(x, y, u * 3, u); g.fillRect(x + u, y + u, u, u); g.fillRect(x, y + u * 2, u * 3, u); };
        g.fillStyle = mute('#3b6ea5'); [0, .5].forEach((o, i) => { const ph = (t / 2.6 + o) % 1; g.globalAlpha = Math.sin(ph * Math.PI); z(ox + (12 + i * 2) * px, oy + (2 - ph * 5) * px, Math.max(1, px * (i ? .6 : .9))); }); g.globalAlpha = 1;
      }
      if (pose === 'sigh' && sighPh === 1) {   // the puff of air
        g.fillStyle = mute('#b8a898'); g.fillRect(ox + 14 * px, oy + 8 * px, px * 3.5, px * 3.5);
        g.fillStyle = mute('#c8dcf0'); g.fillRect(ox + 14.5 * px, oy + 8.5 * px, px * 2.5, px * 2.5);
      }
      g.restore();
    }
    // she only draws while she's on screen, 30 times a second (plenty for chunky pixels)
    let seen = true, lastDraw = 0;
    if (!opts.manual && window.IntersectionObserver) new IntersectionObserver(es => { seen = es[es.length - 1].isIntersecting; }).observe(canvas);
    const loop = now => { if (seen && now - lastDraw >= 32) { lastDraw = now; frame(now); } requestAnimationFrame(loop); };
    if (!opts.manual) requestAnimationFrame(loop);   // manual: the caller draws her (the favicon runs on a timer, which keeps going in background tabs)
    return { hop() { hopT = performance.now() / 1000; }, think(on) { thinking = on; }, pose(p) { pose = p || null; }, setColors(c) { col = c; pal = null; }, draw() { frame(performance.now()); } };
  };
})();
