/* ============================================================
   NULL SECTOR // ASCII FPS
   Terminal-raycaster shooter. No external assets.
   ============================================================ */
(() => {
'use strict';

/* ---------- helpers ---------- */
const $ = (sel, root) => (root || document).querySelector(sel);
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const FOV = 68 * DEG;
const FONT_STACK = '"Cascadia Mono","Consolas","Courier New",monospace';
const IS_COARSE = matchMedia('(pointer: coarse)').matches;
const PARAMS = new URLSearchParams(location.search);

function rnd(a, b) { a = a === undefined ? 0 : a; b = b === undefined ? 1 : b; return a + Math.random() * (b - a); }
function chance(p) { return Math.random() < p; }
function pad(n, len) { return String(Math.max(0, Math.floor(n))).padStart(len, '0'); }
function hash2(x, y) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}
function hash3(x, y, z) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263 + (z | 0) * 2246822519;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}
function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  return pad(Math.floor(sec / 60), 2) + ':' + pad(sec % 60, 2);
}
function norm2(x, y) {
  const d = Math.hypot(x, y) || 1;
  return [x / d, y / d];
}

/* ---------- DOM ---------- */
const els = {
  canvas: $('#screen'), hud: $('#hud'), title: $('#titleScreen'), pause: $('#pauseScreen'), end: $('#endScreen'),
  startBtn: $('#startBtn'), resumeBtn: $('#resumeBtn'), quitBtn: $('#quitBtn'), rebootBtn: $('#rebootBtn'), endTitleBtn: $('#endTitleBtn'),
  startError: $('#startError'), bootLog: $('#bootLog'), titleClock: $('#titleClock'), bestScore: $('#bestScore'),
  waveNumber: $('#waveNumber'), hostileCount: $('#hostileCount'), objectiveText: $('#objectiveText'),
  waveProgress: $('#waveProgress'), scoreValue: $('#scoreValue'), timerValue: $('#timerValue'),
  vitalBar: $('#vitalBar'), vitalNum: $('#vitalNum'), dashBar: $('#dashBar'), dashText: $('#dashText'), diagnosticText: $('#diagnosticText'),
  weaponName: $('#weaponName'), weaponMode: $('#weaponMode'), ammoMag: $('#ammoMag'), ammoReserve: $('#ammoReserve'), ammoTrack: $('#ammoTrack'),
  audioState: $('#audioState'), reticle: $('#reticle'), hitmarker: $('#hitmarker'), reloadRing: $('#reloadRing'), reloadText: $('#reloadText'),
  alertLine: $('#alertLine'), centerMsg: $('#centerMsg'), bossBar: $('#bossBar'), bossHp: $('#bossHp'), bossHpText: $('#bossHpText'),
  radar: $('#radar'), radarStatus: $('#radarStatus'), fps: $('#fpsReadout'),
  damageLayer: $('#damageLayer'), flashLayer: $('#flashLayer'), glitchLayer: $('#glitchLayer'), noiseLayer: $('#noiseLayer'),
  toastFeed: $('#toastFeed'), pickupFeed: $('#pickupFeed'),
  pauseWave: $('#pauseWave'), pauseScore: $('#pauseScore'), pauseTime: $('#pauseTime'),
  endTop: $('#endTop'), endCode: $('#endCode'), endGlyph: $('#endGlyph'), endTitle: $('#endTitle'), endSub: $('#endSub'),
  endWave: $('#endWave'), endKills: $('#endKills'), endScore: $('#endScore'), endTime: $('#endTime'), endRecord: $('#endRecord'),
  endModal: $('#endScreen .end-modal'),
};
const ctx = els.canvas.getContext('2d', { alpha: false });
const radarCtx = els.radar.getContext('2d');

/* ============================================================
   AUDIO KIT - every sound is synthesized.
   ============================================================ */
const AudioKit = {
  ctx: null, master: null, noiseBuffer: null, muted: false, started: false, ambient: null,
  init() {
    if (this.ctx) { this.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.32;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.knee.value = 20; comp.ratio.value = 5;
      comp.attack.value = 0.003; comp.release.value = 0.25;
      this.master.connect(comp); comp.connect(this.ctx.destination);
      const len = Math.floor(this.ctx.sampleRate * 0.7);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buf;
      this.started = true;
      this.buildAmbient();
    } catch (e) { /* audio is optional */ }
  },
  resume() {
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  },
  setMuted(m) {
    this.muted = m;
    if (this.master) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(m ? 0.0001 : 0.32, t, 0.025);
    }
    if (els.audioState) {
      els.audioState.textContent = m ? 'OFF' : 'ON';
      els.audioState.style.color = m ? 'var(--danger)' : 'var(--ink-mid)';
    }
  },
  toggleMute() {
    this.setMuted(!this.muted);
    if (!this.muted) this.click(660, 0.04, 0.05);
  },
  buildAmbient() {
    if (!this.ctx || this.ambient) return;
    const c = this.ctx;
    const g = c.createGain();
    g.gain.value = 0.0001;
    g.gain.setTargetAtTime(0.032, c.currentTime + 0.2, 1.8);
    g.connect(this.master);
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 220; filter.Q.value = 2;
    filter.connect(g);
    [44, 55, 82.5].forEach((f, i) => {
      const o = c.createOscillator();
      o.type = i === 2 ? 'triangle' : 'sine';
      o.frequency.value = f;
      const og = c.createGain();
      og.gain.value = i === 2 ? 0.035 : 0.085;
      o.connect(og); og.connect(filter); o.start();
    });
    const hum = c.createOscillator();
    hum.type = 'sawtooth'; hum.frequency.value = 110.3;
    const hf = c.createBiquadFilter();
    hf.type = 'lowpass'; hf.frequency.value = 160;
    const hg = c.createGain(); hg.gain.value = 0.012;
    hum.connect(hf); hf.connect(hg); hg.connect(g); hum.start();
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.045;
    const lg = c.createGain(); lg.gain.value = 0.018;
    lfo.connect(lg); lg.connect(g.gain); lfo.start();
    this.ambient = { g, filter, nodes: [hum, lfo] };
  },
  tone(o) {
    if (!this.ctx || !this.master) return;
    const c = this.ctx;
    const freq = o.freq === undefined ? 440 : o.freq;
    const end = o.end === undefined ? freq : o.end;
    const dur = o.dur === undefined ? 0.1 : o.dur;
    const type = o.type || 'square';
    const vol = o.vol === undefined ? 0.1 : o.vol;
    const delay = o.delay || 0;
    const attack = o.attack === undefined ? 0.004 : o.attack;
    const t = c.currentTime + delay;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), t);
    if (end !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, end), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let last = osc;
    if (o.filter) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(o.filter, t);
      f.frequency.exponentialRampToValueAtTime(Math.max(40, o.filter * 0.32), t + dur);
      f.Q.value = o.q || 1;
      last.connect(f); last = f;
    }
    last.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + dur + 0.03);
  },
  noise(o) {
    if (!this.ctx || !this.noiseBuffer || !this.master) return;
    o = o || {};
    const c = this.ctx;
    const dur = o.dur === undefined ? 0.1 : o.dur;
    const vol = o.vol === undefined ? 0.1 : o.vol;
    const freq = o.freq === undefined ? 1200 : o.freq;
    const t = c.currentTime + (o.delay || 0);
    const src = c.createBufferSource(); src.buffer = this.noiseBuffer;
    const f = c.createBiquadFilter();
    f.type = o.type || 'lowpass';
    f.frequency.setValueAtTime(Math.max(40, freq), t);
    if (o.sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq + o.sweep), t + dur);
    f.Q.value = o.q || 1;
    const g = c.createGain();
    g.gain.setValueAtTime(Math.max(0.0002, vol), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random() * 0.2); src.stop(t + dur + 0.03);
  },
  click(freq, dur, vol) { this.tone({ freq: freq || 900, end: (freq || 900) * 0.55, dur: dur || 0.03, type: 'square', vol: vol || 0.06 }); },
  shotPulse() {
    this.tone({ freq: 900, end: 190, dur: 0.075, type: 'square', vol: 0.12, filter: 3000 });
    this.tone({ freq: 220, end: 70, dur: 0.1, type: 'sawtooth', vol: 0.055 });
    this.noise({ dur: 0.045, vol: 0.07, type: 'highpass', freq: 1800 });
  },
  shotScatter() {
    this.noise({ dur: 0.19, vol: 0.18, type: 'lowpass', freq: 1700, sweep: -1100 });
    this.tone({ freq: 120, end: 38, dur: 0.22, type: 'sine', vol: 0.16 });
    this.tone({ freq: 480, end: 110, dur: 0.1, type: 'sawtooth', vol: 0.07 });
  },
  hit() { this.tone({ freq: 1600, end: 900, dur: 0.035, type: 'square', vol: 0.035 }); },
  kill() {
    this.noise({ dur: 0.16, vol: 0.075, type: 'bandpass', freq: 900, q: 0.7 });
    this.tone({ freq: 160, end: 45, dur: 0.22, type: 'sawtooth', vol: 0.07 });
  },
  hurt() {
    this.tone({ freq: 135, end: 55, dur: 0.28, type: 'sawtooth', vol: 0.12 });
    this.noise({ dur: 0.13, vol: 0.08, type: 'lowpass', freq: 600 });
  },
  playerDeath() {
    this.tone({ freq: 210, end: 38, dur: 1.2, type: 'sawtooth', vol: 0.11 });
    this.noise({ dur: 1.1, vol: 0.09, type: 'lowpass', freq: 1100, sweep: -900 });
  },
  reloadStart() {
    this.click(540, 0.03, 0.065);
    setTimeout(() => this.click(800, 0.03, 0.05), 110);
  },
  reloadDone() { this.click(1150, 0.04, 0.055); setTimeout(() => this.click(1600, 0.03, 0.035), 55); },
  empty() { this.click(190, 0.035, 0.08); },
  pickup() {
    this.tone({ freq: 760, dur: 0.07, type: 'sine', vol: 0.055 });
    this.tone({ freq: 1210, dur: 0.12, type: 'sine', vol: 0.045, delay: 0.07 });
  },
  dash() {
    this.noise({ dur: 0.18, vol: 0.12, type: 'highpass', freq: 500, sweep: 1400 });
    this.tone({ freq: 260, end: 80, dur: 0.14, type: 'triangle', vol: 0.06 });
  },
  waveStart() {
    this.tone({ freq: 300, end: 450, dur: 0.18, type: 'square', vol: 0.05 });
    setTimeout(() => this.tone({ freq: 450, end: 680, dur: 0.22, type: 'square', vol: 0.045 }), 180);
  },
  bossWarn() {
    this.tone({ freq: 65, end: 38, dur: 1.5, type: 'sawtooth', vol: 0.15 });
    this.tone({ freq: 122, end: 62, dur: 1.4, type: 'square', vol: 0.055 });
    this.noise({ dur: 1.0, vol: 0.06, type: 'lowpass', freq: 280 });
  },
  bossShot() {
    this.tone({ freq: 170, end: 70, dur: 0.28, type: 'sawtooth', vol: 0.08 });
    this.noise({ dur: 0.18, vol: 0.06, type: 'bandpass', freq: 420 });
  },
  victory() {
    [392, 523.25, 659.25, 783.99, 1046.5].forEach((n, i) => this.tone({ freq: n, dur: 0.5, type: 'triangle', vol: 0.06, delay: i * 0.14 }));
    this.noise({ dur: 1.5, vol: 0.03, type: 'highpass', freq: 1800 });
  },
};

/* ============================================================
   WORLD MAP - 41 x 29
   ============================================================ */
const MAP_SOURCE = [
  '#########################################',
  '#.......................................#',
  '#.#########...................#########.#',
  '#.#===....#...................#===....#.#',
  '#.#.......#...................#.......#.#',
  '#.#...S...#.##.............##.#...S...#.#',
  '#.#.......#.##.............##.#.......#.#',
  '#.###...###.........S.........###...###.#',
  '#..........#.................#..........#',
  '#..........#.................#..........#',
  '#..............####...####..............#',
  '#......##......#=.......=#......##......#',
  '#......##....#.#.........#......##......#',
  '#............#.....===..................#',
  '#...S........#.....===.....#........S...#',
  '#............#.....===.....#............#',
  '#..............#.........#.#............#',
  '#......##......#=.......=#.#....##......#',
  '#......##......####...####......##......#',
  '#.......................................#',
  '#..........#.................#..........#',
  '#.###...####.................####...###.#',
  '#.#.......#.##......S......##.#.......#.#',
  '#.#...S...#.##.............##.#...S...#.#',
  '#.#.......#.........P.........#.......#.#',
  '#.#===....#...................#===....#.#',
  '#.#########...................#########.#',
  '#.......................................#',
  '#########################################',
];
const MAP_W = MAP_SOURCE[0].length;
const MAP_H = MAP_SOURCE.length;
const WALL_NONE = 255;
const WALL_PALETTES = [
  ['#081e11', '#0d2a18', '#133c22', '#1b5330', '#276d3e', '#3c9255', '#63ba79'],
  ['#061f22', '#093034', '#0e454a', '#156067', '#1f7f88', '#34aab2', '#72dde0'],
  ['#231404', '#3d2307', '#5a3509', '#7b4a0c', '#a1620e', '#ca851b', '#ffc14b'],
];
const wallType = new Uint8Array(MAP_W * MAP_H).fill(WALL_NONE);
const floorStyle = new Uint8Array(MAP_W * MAP_H);
for (let y = 0; y < MAP_H; y++) {
  for (let x = 0; x < MAP_W; x++) {
    const c = MAP_SOURCE[y][x];
    if (c === '#') wallType[y * MAP_W + x] = 0;
    else if (c === '=') wallType[y * MAP_W + x] = 1;
    else if (c === '!') wallType[y * MAP_W + x] = 2;
  }
}
function markFloorRect(x0, y0, x1, y1, style) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) continue;
    if (wallType[y * MAP_W + x] === WALL_NONE) floorStyle[y * MAP_W + x] = style;
  }
}
[[3, 3, 9, 6], [31, 3, 37, 6], [3, 22, 9, 25], [31, 22, 37, 25]].forEach(r => markFloorRect(r[0], r[1], r[2], r[3], 1));
markFloorRect(16, 11, 24, 17, 2);
markFloorRect(19, 10, 21, 18, 2);
markFloorRect(15, 13, 25, 15, 2);
markFloorRect(16, 10, 18, 10, 2);
markFloorRect(22, 10, 24, 10, 2);
markFloorRect(16, 18, 18, 18, 2);
markFloorRect(22, 18, 24, 18, 2);

const SPAWN_POINTS = [
  { x: 6.5, y: 5.5 }, { x: 34.5, y: 5.5 },
  { x: 6.5, y: 23.5 }, { x: 34.5, y: 23.5 },
  { x: 20.5, y: 7.5 }, { x: 20.5, y: 22.5 },
  { x: 4.5, y: 14.5 }, { x: 36.5, y: 14.5 },
  { x: 17.5, y: 16.5 }, { x: 23.5, y: 16.5 },
  { x: 12.5, y: 19.5 }, { x: 28.5, y: 19.5 },
  { x: 17.5, y: 8.5 }, { x: 23.5, y: 8.5 },
];
const PLAYER_START = { x: 20.5, y: 24.5, angle: -Math.PI / 2 };

function isWallCell(mx, my) {
  if (mx < 0 || my < 0 || mx >= MAP_W || my >= MAP_H) return true;
  return wallType[my * MAP_W + mx] !== WALL_NONE;
}
function isWall(x, y) { return isWallCell(Math.floor(x), Math.floor(y)); }
function collidesCircle(x, y, r) {
  const x0 = Math.floor(x - r), x1 = Math.floor(x + r);
  const y0 = Math.floor(y - r), y1 = Math.floor(y + r);
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      if (isWallCell(cx, cy)) {
        const nx = clamp(x, cx, cx + 1);
        const ny = clamp(y, cy, cy + 1);
        if ((x - nx) * (x - nx) + (y - ny) * (y - ny) < r * r) return true;
      }
    }
  }
  return false;
}
function moveCircle(obj, dx, dy, r) {
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / 0.18));
  const sx = dx / steps, sy = dy / steps;
  for (let i = 0; i < steps; i++) {
    if (!collidesCircle(obj.x + sx, obj.y, r)) obj.x += sx;
    if (!collidesCircle(obj.x, obj.y + sy, r)) obj.y += sy;
  }
}
function castRayDistance(px, py, dx, dy, maxDist) {
  maxDist = maxDist || 64;
  let mapX = Math.floor(px), mapY = Math.floor(py);
  const deltaX = dx === 0 ? 1e30 : Math.abs(1 / dx);
  const deltaY = dy === 0 ? 1e30 : Math.abs(1 / dy);
  let stepX, stepY, sideDistX, sideDistY;
  if (dx < 0) { stepX = -1; sideDistX = (px - mapX) * deltaX; }
  else { stepX = 1; sideDistX = (mapX + 1 - px) * deltaX; }
  if (dy < 0) { stepY = -1; sideDistY = (py - mapY) * deltaY; }
  else { stepY = 1; sideDistY = (mapY + 1 - py) * deltaY; }
  let side = 0;
  for (let i = 0; i < 160; i++) {
    if (sideDistX < sideDistY) { sideDistX += deltaX; mapX += stepX; side = 0; }
    else { sideDistY += deltaY; mapY += stepY; side = 1; }
    const dist = side === 0 ? sideDistX - deltaX : sideDistY - deltaY;
    if (dist > maxDist) return { dist, side, mapX, mapY, hit: false };
    if (isWallCell(mapX, mapY)) return { dist, side, mapX, mapY, hit: true, type: wallType[mapY * MAP_W + mapX] };
  }
  return { dist: maxDist, side: 0, mapX, mapY, hit: false };
}
function hasLOS(x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.001) return true;
  const steps = Math.ceil(dist / 0.22);
  const sx = dx / steps, sy = dy / steps;
  let x = x0, y = y0;
  for (let i = 1; i < steps; i++) {
    x += sx; y += sy;
    if (isWall(x, y)) return false;
  }
  return true;
}

/* ============================================================
   ASCII SPRITES
   ============================================================ */
const ENEMY_TYPES = {
  mite: {
    id: 'mite', name: 'MITE', hp: 30, speed: 2.1, radius: 0.32, height: 0.66,
    score: 100, damage: 8, attackRange: 1.0, attackCd: 0.95, ranged: false,
    art: [
      '   /\\   /\\  ',
      '  /  \\ /  \\ ',
      ' |   o o   |',
      '  \\   ^   / ',
      '   \\ === /  ',
      "    '---'   ",
      '   /|   |\\  ',
      '  /_|___|_\\ ',
    ],
    palette: {
      near: { body: '#ff7051', bright: '#ffb68e', eye: '#fff4bf', dark: '#7a2a1c' },
      mid: { body: '#c04e35', bright: '#d9865f', eye: '#e9d59a', dark: '#521b12' },
      far: { body: '#713022', bright: '#8c4c37', eye: '#a58f5d', dark: '#2a0e08' },
    },
  },
  stalker: {
    id: 'stalker', name: 'STALKER', hp: 52, speed: 1.62, radius: 0.38, height: 1.03,
    score: 180, damage: 10, attackRange: 10.5, attackCd: 2.15, ranged: true,
    preferredMin: 3.8, preferredMax: 7.2, projectileSpeed: 4.7,
    art: [
      '     .----- .',
      '    /  _ _  \\',
      '   |  (o|o)  |',
      '   |    |    |',
      '   |   ===   |',
      '   |  /| |\\  |',
      '   | / | | \\ |',
      '   |/  |_|  \\|',
      '     /     \\  ',
      '    /_/   \\_\\ ',
    ],
    palette: {
      near: { body: '#ffc168', bright: '#fff1bd', eye: '#fff9e9', dark: '#77541d' },
      mid: { body: '#c08a36', bright: '#e3c27a', eye: '#f3e6c0', dark: '#51390f' },
      far: { body: '#745427', bright: '#927844', eye: '#b0a27a', dark: '#2d200b' },
    },
  },
  brute: {
    id: 'brute', name: 'BRUTE', hp: 135, speed: 1.12, radius: 0.52, height: 1.32,
    score: 400, damage: 19, attackRange: 1.35, attackCd: 1.35, ranged: false,
    art: [
      '       .---------.',
      '      /  _______  \\',
      '     /  /       \\  \\',
      '    |  |  o   o  |  |',
      '    |  |    ^    |  |',
      '    |   \\  ===  /   |',
      "     \\   '-----'   /",
      "      '-----------'",
      '     /|  |     |  |\\',
      '    / |__|_____|__| \\',
      '   /__/           \\__\\',
    ],
    palette: {
      near: { body: '#ff525d', bright: '#ffb3a2', eye: '#fff6cc', dark: '#741a25' },
      mid: { body: '#ba3845', bright: '#dc877b', eye: '#eadba0', dark: '#4a1019' },
      far: { body: '#6e222c', bright: '#8d4a43', eye: '#a49662', dark: '#280a0f' },
    },
  },
  warden: {
    id: 'warden', name: 'WARDEN', hp: 940, speed: 0.72, radius: 0.82, height: 2.75,
    score: 5000, damage: 16, attackRange: 18, attackCd: 2.2, ranged: true,
    preferredMin: 4, preferredMax: 11, projectileSpeed: 4.3,
    art: [
      '           .-------------------------. ',
      "         .'    ____         ____      '. ",
      '        /     /    \\       /    \\       \\ ',
      '       /     |  ()  |     |  ()  |       \\ ',
      '      |       \\____/       \\____/         | ',
      '      |                                   | ',
      '      |              .------.             | ',
      '      |             /  ____  \\            | ',
      '      |            |  /    \\  |           | ',
      '      |            |  \\____/  |           | ',
      '      |             \\  ----  /            | ',
      "      |              '------'             | ",
      '       \\                                 / ',
      "        '.                             .' ",
      "          '--.__                 __.--'   ",
      '               /|   |   |   |   |\\        ',
      '              /_|___|___|___|___|_\\       ',
    ],
    palette: {
      near: { body: '#ff475b', bright: '#ffad9d', eye: '#fff8d4', dark: '#711324' },
      mid: { body: '#b73043', bright: '#d88071', eye: '#e8db9a', dark: '#490e18' },
      far: { body: '#6a1c27', bright: '#8b4840', eye: '#9f945f', dark: '#27070c' },
    },
  },
};
const PICKUP_TYPES = {
  health: {
    id: 'health', label: 'VITAL',
    art: [' .---. ', ' | + | ', ' |+++| ', ' | + | ', " '---' "],
    chars: { '+': 'bright', '-': 'body', "'": 'dim' },
    bright: '#b9ffe0', body: '#54dc94', dim: '#1e5838',
  },
  pulse: {
    id: 'pulse', label: 'CELLS',
    art: [' .---. ', ' |[] | ', ' |[] | ', ' |[] | ', " '---' "],
    chars: { '[': 'bright', ']': 'bright', '|': 'body', '-': 'dim', "'": 'dim' },
    bright: '#ffe6a1', body: '#f5ad45', dim: '#6c4b1d',
  },
  shells: {
    id: 'shells', label: 'SHELLS',
    art: ['  .-.  ', ' [|||] ', ' [|||] ', "  '-'  "],
    chars: { '[': 'bright', ']': 'bright', '|': 'body', '.': 'dim', '-': 'dim' },
    bright: '#ffd0a1', body: '#e88045', dim: '#6c351d',
  },
};
const PORTAL_ART = [
  '   .-+-.   ',
  '   | ! |   ',
  '   | . |   ',
  '  /|   |\\  ',
  ' / |   | \\ ',
  '   |   |   ',
  '   |___|   ',
];
const PROJECTILE_ART = [' . ', '*@*', ' . '];
const BOSS_SHOT_ART = [' .*. ', '*@@@*', ' .*. '];
const WEAPON_ART = {
  pulse: [
    '                     .-----------------------------------.',
    '               _____/  []   []   []   []   []   []       \\_____',
    '              |=================================================|',
    '              |  ||   V X - 9   / /   P U L S E   R I F L E ||  |',
    '              |  ||___________________________________________||  |',
    '              |======= [##]  [##]  [##]  [##]  [##] ==========|',
    '               \\____     _     _     _     _     _      _____/',
    '                    \\/ \\/  \\/ \\/  \\/ \\/  \\/ \\/  \\/ \\/',
    '                        ||                            ||',
    '                       /__\\                          /__\\',
  ],
  scatter: [
    '                     .---------------------------.',
    '               _____/   //   //   //   //         \\_____',
    '              |=========================================|',
    '              |  ||    S C A T T E R - 12        ||      |',
    '              |  ||________________________________||      |',
    '              |=====  [##]  [##]  [##]  [##]  ===========|',
    '               \\____      __     __     __        _____/',
    '                    \\\\   \\\\   \\\\   \\\\   \\\\',
    '                        ||                  ||',
    '                       /__\\                /__\\',
  ],
};
const MUZZLE_FLASH = [
  ' \\  |  / ',
  '  .-+-.  ',
  ' -*###*- ',
  "  '-+-'  ",
];
const MUZZLE_FLASH_BIG = [
  ' \\   |   / ',
  '   .--+--.  ',
  ' -**#####**-',
  '   \\#####/  ',
  "    '---'   ",
];
const WEAPONS = {
  pulse: {
    id: 'pulse', name: 'VX-9 PULSE', mode: 'AUTO / HITSCAN', art: WEAPON_ART.pulse,
    magSize: 30, damage: 22, cooldown: 0.105, spread: 0.009, pellets: 1,
    reloadTime: 1.25, auto: true, kick: 0.9, range: 40,
  },
  scatter: {
    id: 'scatter', name: 'SCATTER-12', mode: 'SHELL / SPREAD', art: WEAPON_ART.scatter,
    magSize: 6, damage: 14, cooldown: 0.78, spread: 0.085, pellets: 8,
    reloadTime: 1.65, auto: false, kick: 2.3, range: 20,
  },
};
const WAVES = [
  { title: 'PROBE SWARM', sub: 'SMALL CONTACT SIGNATURES', enemies: [['mite', 6]] },
  { title: 'HUNTER PACK', sub: 'RANGED UNITS DETECTED', enemies: [['mite', 8], ['stalker', 3]] },
  { title: 'IRON CHOIR', sub: 'HEAVY UNITS INBOUND', enemies: [['mite', 6], ['stalker', 4], ['brute', 1]] },
  { title: 'RED SHIFT', sub: 'MULTIPLE HEAVY SIGNATURES', enemies: [['mite', 9], ['stalker', 5], ['brute', 2]] },
  { title: 'THE WARDEN', sub: 'WARDEN-CLASS ENTITY UNBOUND', enemies: [['warden', 1], ['mite', 6], ['stalker', 3]] },
];
const MAX_WAVE = WAVES.length;


const __filledArtCache = new WeakMap();
function filledArt(art) {
  if (__filledArtCache.has(art)) return __filledArtCache.get(art);
  const h = art.length;
  let w = 0;
  for (const line of art) if (line.length > w) w = line.length;
  const grid = [];
  for (let y = 0; y < h; y++) {
    const row = art[y].padEnd(w, ' ').split('');
    grid.push(row);
  }
  const outside = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) { stack.push([x, 0]); stack.push([x, h - 1]); }
  for (let y = 0; y < h; y++) { stack.push([0, y]); stack.push([w - 1, y]); }
  while (stack.length) {
    const p = stack.pop();
    const x = p[0], y = p[1];
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const i = y * w + x;
    if (outside[i] || grid[y][x] !== ' ') continue;
    outside[i] = 1;
    stack.push([x + 1, y]); stack.push([x - 1, y]); stack.push([x, y + 1]); stack.push([x, y - 1]);
  }
  const out = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) {
      if (grid[y][x] === ' ' && !outside[y * w + x]) row += ':';
      else row += grid[y][x];
    }
    out.push(row);
  }
  __filledArtCache.set(art, out);
  return out;
}

function paletteForDistance(pal, depth) {
  if (depth < 5.5) return pal.near;
  if (depth < 13) return pal.mid;
  return pal.far;
}
function darkenHex(hex, factor) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * factor);
  const g = Math.round(((n >> 8) & 255) * factor);
  const b = Math.round((n & 255) * factor);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}
function fillTint(pal) {
  if (!pal.__fill) pal.__fill = darkenHex(pal.dark, 0.52);
  return pal.__fill;
}
function enemyTint(pal, ch, flash, dying, salt) {
  if (flash) return '#fff6e6';
  if (dying) {
    const pick = hash3(salt, ch.charCodeAt(0), 17);
    return pick > 0.45 ? '#b74133' : (pick > 0.2 ? '#6b2a22' : '#ffe0ac');
  }
  if (ch === 'o' || ch === 'O' || ch === '0') return pal.eye;
  if (ch === '@' || ch === '*' || ch === '!' || ch === '=') return pal.bright;
  if (ch === ':') return fillTint(pal);
  if (ch === '.' || ch === "'" || ch === '_' || ch === '#') return pal.dark;
  return pal.body;
}
function weaponCharColor(ch) {
  if (ch === '[' || ch === ']' || ch === '#') return '#ffd477';
  if (ch === '|' || ch === '=') return '#d4ffe3';
  if (ch === '/' || ch === '\\') return '#69c686';
  if (ch === '_' || ch === '-' || ch === '.' || ch === "'" || ch === ':') return '#2d7649';
  if (ch >= 'A' && ch <= 'Z') return '#f2fff4';
  return '#a6ffbe';
}

/* ============================================================
   RENDERER
   ============================================================ */
const BG_COLOR = '#010503';
const FLOOR_PALETTE = ['#07190f', '#0b2416', '#10321e', '#17452a', '#205b36', '#2f7645', '#55a367'];
const CEIL_PALETTE = ['#020b07', '#03110a', '#051a0e', '#082413', '#0a2c18'];
const GRATE_ACCENT = ['#123c44', '#1b5a63', '#2b7f89'];

const renderer = {
  cols: 0, rows: 0, cellW: 8, cellH: 14, fontPx: 12, dpr: 1,
  vScale: 66, horizon: 28, cssW: 0, cssH: 0, font: '',
  chars: null, colors: null, zbuf: null, lastCamera: null,
  resize() {
    const w = Math.max(320, window.innerWidth);
    const h = Math.max(240, window.innerHeight);
    this.cssW = w; this.cssH = h;
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const baseRows = clamp(Math.round(h / 14.6), 32, 64);
    let fontPx = (h / baseRows) * 0.94;
    const measure = document.createElement('canvas').getContext('2d');
    measure.font = fontPx.toFixed(2) + 'px ' + FONT_STACK;
    let adv = measure.measureText('M').width;
    let cols = Math.ceil(w / adv) + 1;
    if (cols > 244) {
      fontPx *= cols / 244;
      measure.font = fontPx.toFixed(2) + 'px ' + FONT_STACK;
      adv = measure.measureText('M').width;
      cols = Math.ceil(w / adv) + 1;
    }
    const rows = baseRows;
    this.fontPx = fontPx;
    this.cellW = adv;
    this.cellH = h / rows;
    this.cols = cols;
    this.rows = rows;
    this.vScale = (cols / 2) / Math.tan(FOV / 2) * (adv / this.cellH);
    els.canvas.width = Math.round(w * this.dpr);
    els.canvas.height = Math.round(h * this.dpr);
    els.canvas.style.width = w + 'px';
    els.canvas.style.height = h + 'px';
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.font = fontPx.toFixed(2) + 'px ' + FONT_STACK;
    ctx.font = this.font;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    this.chars = new Array(cols * rows).fill(' ');
    this.colors = new Array(cols * rows).fill('#000000');
    this.zbuf = new Float32Array(cols);
    this.rayDirX = new Float32Array(cols);
    this.rayDirY = new Float32Array(cols);
  },
  clear() {
    this.chars.fill(' ');
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, this.cssW, this.cssH);
  },
  set(x, y, ch, color) {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return;
    const i = y * this.cols + x;
    this.chars[i] = ch;
    this.colors[i] = color;
  },
  render(camera, sprites, opts) {
    opts = opts || {};
    this.lastCamera = camera;
    const cols = this.cols, rows = this.rows;
    const dirX = Math.cos(camera.angle);
    const dirY = Math.sin(camera.angle);
    const planeScale = Math.tan(FOV / 2);
    const planeX = -dirY * planeScale;
    const planeY = dirX * planeScale;
    const bobShift = Math.sin((camera.bob || 0) * 2) * (camera.moveAmt || 0) * 0.7;
    const shake = camera.shake || 0;
    const shakeShift = (Math.random() - 0.5) * shake * 1.1;
    const horizon = rows * 0.5 + camera.pitch * rows * 0.46 + bobShift + shakeShift;
    this.horizon = horizon;
    this.camera = camera;
    this.clear();
    this.castFloorCeiling(horizon, dirX, dirY, planeX, planeY);
    this.castWalls(horizon, dirX, dirY, planeX, planeY);
    this.drawSprites(horizon, camera, sprites || []);
    if (opts.drawFx) this.drawFx(opts.drawFx);
    if (!opts.noWeapon && opts.weapon) this.drawWeapon(camera, opts.weapon);
    this.flush();
  },
  castFloorCeiling(horizon, dirX, dirY, planeX, planeY) {
    const cols = this.cols, rows = this.rows, vScale = this.vScale;
    const chars = this.chars, colors = this.colors;
    const cam = this.camera;
    const px = cam.x, py = cam.y;
    const rayStartX = dirX - planeX;
    const rayStartY = dirY - planeY;
    const stepRayX = planeX * 2 / cols;
    const stepRayY = planeY * 2 / cols;
    const halfVS = 0.5 * vScale;
    const ceilEnd = Math.min(rows, Math.ceil(Math.max(0, horizon)));
    for (let y = 0; y < ceilEnd; y++) {
      const dy = horizon - y;
      if (dy < 0.55) continue;
      const dist = halfVS / dy;
      if (dist > 27) continue;
      let wx = px + dist * rayStartX;
      let wy = py + dist * rayStartY;
      const level = clamp(4 - Math.floor(dist / 5.5), 0, 4);
      const baseColor = CEIL_PALETTE[level];
      for (let x = 0; x < cols; x++, wx += dist * stepRayX, wy += dist * stepRayY) {
        const ix = Math.floor(wx), iy = Math.floor(wy);
        if (ix < 0 || iy < 0 || ix >= MAP_W + 2 || iy >= MAP_H + 2) continue;
        const hh = hash2(ix * 3 + 11, iy * 7 + 5);
        if (hh > 0.986) {
          chars[y * cols + x] = hh > 0.996 ? '+' : "'";
          colors[y * cols + x] = hh > 0.996 ? '#175040' : baseColor;
        } else if (hh > 0.955) {
          chars[y * cols + x] = '.';
          colors[y * cols + x] = baseColor;
        }
      }
    }
    const floorStart = Math.max(0, Math.floor(horizon) + 1);
    for (let y = floorStart; y < rows; y++) {
      const dy = y - horizon;
      if (dy < 0.55) continue;
      const dist = halfVS / dy;
      if (dist > 30) continue;
      let wx = px + dist * rayStartX;
      let wy = py + dist * rayStartY;
      const level = clamp(6 - Math.floor(dist / 4.2), 0, 6);
      const baseColor = FLOOR_PALETTE[level];
      const accent = GRATE_ACCENT[clamp(level - 1, 0, 2)];
      for (let x = 0; x < cols; x++, wx += dist * stepRayX, wy += dist * stepRayY) {
        const ix = Math.floor(wx), iy = Math.floor(wy);
        if (ix < 0 || iy < 0 || ix >= MAP_W || iy >= MAP_H) continue;
        const fx = wx - ix, fy = wy - iy;
        const ex = Math.min(fx, 1 - fx), ey = Math.min(fy, 1 - fy);
        const style = floorStyle[iy * MAP_W + ix];
        let ch = '';
        let color = baseColor;
        if (style === 1) {
          if (ey < 0.035) { ch = '-'; color = accent; }
          else if (ex < 0.035) { ch = '|'; color = accent; }
          else {
            const hh = hash2(ix * 13 + 3, iy * 11 + 1);
            if (hh > 0.88) ch = ',';
            else if (hh > 0.52) ch = '.';
          }
        } else if (style === 2) {
          const a = Math.abs(fx - fy), b = Math.abs(fx + fy - 1);
          if (a < 0.028 || b < 0.028) { ch = a < b ? '\\' : '/'; color = accent; }
          else if (hash2(ix + 7, iy + 3) > 0.87) ch = ':';
        } else {
          if (ex < 0.026 && ey < 0.026) { ch = '+'; color = accent; }
          else if (ey < 0.026) ch = '-';
          else if (ex < 0.026) ch = '|';
          else {
            const hh = hash2(ix * 19 + 5, iy * 17 + 2);
            if (hh > 0.945) ch = "'";
            else if (hh > 0.72) ch = ',';
            else if (hh > 0.29) ch = '.';
          }
        }
        if (ch) {
          chars[y * cols + x] = ch;
          colors[y * cols + x] = color;
        }
      }
    }
  },
  castWalls(horizon, dirX, dirY, planeX, planeY) {
    const cols = this.cols, rows = this.rows, vScale = this.vScale;
    const chars = this.chars, colors = this.colors, zbuf = this.zbuf;
    const px = this.camera.x, py = this.camera.y;
    for (let x = 0; x < cols; x++) {
      const cameraX = 2 * x / cols - 1;
      const rdx = dirX + planeX * cameraX;
      const rdy = dirY + planeY * cameraX;
      let mapX = Math.floor(px), mapY = Math.floor(py);
      const deltaX = rdx === 0 ? 1e30 : Math.abs(1 / rdx);
      const deltaY = rdy === 0 ? 1e30 : Math.abs(1 / rdy);
      let stepX, stepY, sideDistX, sideDistY;
      if (rdx < 0) { stepX = -1; sideDistX = (px - mapX) * deltaX; }
      else { stepX = 1; sideDistX = (mapX + 1 - px) * deltaX; }
      if (rdy < 0) { stepY = -1; sideDistY = (py - mapY) * deltaY; }
      else { stepY = 1; sideDistY = (mapY + 1 - py) * deltaY; }
      let side = 0, type = 0, hit = false;
      for (let i = 0; i < 160; i++) {
        if (sideDistX < sideDistY) { sideDistX += deltaX; mapX += stepX; side = 0; }
        else { sideDistY += deltaY; mapY += stepY; side = 1; }
        if (isWallCell(mapX, mapY)) { type = wallType[mapY * MAP_W + mapX]; hit = true; break; }
      }
      if (!hit) { zbuf[x] = Infinity; continue; }
      const perp = side === 0 ? sideDistX - deltaX : sideDistY - deltaY;
      zbuf[x] = perp;
      const lineH = vScale / Math.max(perp, 0.0001);
      let wallX = side === 0 ? py + perp * rdy : px + perp * rdx;
      wallX -= Math.floor(wallX);
      const top = horizon - lineH * 0.5;
      const y0 = Math.max(0, Math.ceil(top));
      const y1 = Math.min(rows - 1, Math.floor(top + lineH));
      const invLine = 1 / lineH;
      let level = 6 - Math.floor(perp * 0.52);
      if (side === 1) level -= 1;
      level = clamp(level, 0, 6);
      const pal = WALL_PALETTES[type] || WALL_PALETTES[0];
      const seed = mapX * 37 + mapY * 101;
      const texX = Math.floor(clamp(wallX, 0, 0.999) * 15);
      for (let y = y0; y <= y1; y++) {
        const v = clamp((y - top) * invLine, 0, 0.999);
        const texY = Math.floor(v * 11);
        let ch = '#', color = pal[level];
        if (type === 0) {
          const borderX = texX === 0 || texX === 15;
          const borderY = texY === 0 || texY === 11;
          if (borderX && borderY) ch = '+';
          else if (borderX) ch = '|';
          else if (borderY) ch = '=';
          else if (texY === 5 && (texX & 3) === 0) ch = '_';
          else if (hash3(seed, texX, texY) > 0.92) ch = '.';
          if (borderX || borderY) color = pal[Math.min(6, level + 1)];
          if (texY === 6 && texX % 5 === 2) { ch = '+'; color = (mapX + mapY) % 5 === 0 ? '#8cf6ff' : '#ffc15c'; }
          if (texY === 3 && texX % 7 === 3 && hash3(seed, texX, texY) > 0.6) { ch = 'o'; color = '#ffc15c'; }
        } else if (type === 1) {
          if (texX === 0 || texX === 15) ch = '|';
          else if (texY === 0 || texY === 11) ch = '=';
          else if (texY % 3 === 0) ch = '-';
          else {
            const led = hash3(seed * 7 + 1, texX * 3 + 2, texY * 5 + 1);
            if (led > 0.955) { ch = '!'; color = led > 0.985 ? '#ffc15c' : '#8cf6ff'; }
            else if (led > 0.56) ch = ':';
            else ch = '=';
          }
        } else {
          const band = Math.floor(v * 12) % 2;
          ch = band ? '|' : '=';
          if (hash3(seed, texX, texY) > 0.91) { ch = '!'; color = WALL_PALETTES[2][clamp(level + 2, 0, 6)]; }
          else color = pal[Math.min(6, level + (band ? 0 : 1))];
        }
        chars[y * cols + x] = ch;
        colors[y * cols + x] = color;
      }
    }
  },
  drawSprites(horizon, camera, sprites) {
    const cols = this.cols, rows = this.rows, vScale = this.vScale;
    const zbuf = this.zbuf, chars = this.chars, colors = this.colors;
    const dirX = Math.cos(camera.angle), dirY = Math.sin(camera.angle);
    const planeScale = Math.tan(FOV / 2);
    const planeX = -dirY * planeScale, planeY = dirX * planeScale;
    const px = camera.x, py = camera.y;
    const invDet = 1 / (planeX * dirY - dirX * planeY || 0.00001);
    const sorted = sprites.slice().sort((a, b) => {
      const da = (a.x - px) * (a.x - px) + (a.y - py) * (a.y - py);
      const db = (b.x - px) * (b.x - px) + (b.y - py) * (b.y - py);
      return db - da;
    });
    const now = performance.now() / 1000;
    for (const s of sorted) {
      const relX = s.x - px, relY = s.y - py;
      const tx = invDet * (dirY * relX - dirX * relY);
      const ty = invDet * (-planeY * relX + planeX * relY);
      if (ty < 0.16) continue;
      const depth = ty;
      const art = s.kind === 'enemy' ? filledArt(s.art) : s.art;
      const artH = art.length;
      let artW = 0;
      for (const line of art) if (line.length > artW) artW = line.length;
      if (!artW) continue;
      const heightRows = (s.height * vScale) / depth;
      const widthCols = heightRows * (artW / artH);
      if (heightRows < 0.3 || widthCols < 0.3) continue;
      const screenCenter = (cols / 2) * (1 + tx / depth);
      const left = screenCenter - widthCols / 2;
      const right = screenCenter + widthCols / 2;
      const x0 = Math.max(0, Math.floor(left));
      const x1 = Math.min(cols - 1, Math.ceil(right));
      if (x0 > x1) continue;
      let top;
      if (s.floating) {
        const cy = horizon + (0.5 - (s.elev || 0.5)) * vScale / depth;
        top = cy - heightRows / 2;
      } else {
        const base = horizon + 0.5 * vScale / depth - (s.lift || 0) * vScale / depth;
        top = base - heightRows;
      }
      const bottom = top + heightRows;
      const y0 = Math.max(0, Math.floor(top));
      const y1 = Math.min(rows - 1, Math.ceil(bottom));
      if (y0 > y1) continue;
      const tintPal = s.palette ? paletteForDistance(s.palette, depth) : null;
      const flash = s.flash > 0;
      const dying = s.dying;
      const glitchTime = Math.floor(now * 24);
      for (let x = x0; x <= x1; x++) {
        if (zbuf[x] < depth - 0.02) continue;
        const u = (x + 0.5 - left) / widthCols;
        if (u < 0 || u >= 1) continue;
        const artX = Math.min(artW - 1, Math.floor(u * artW));
        for (let y = y0; y <= y1; y++) {
          const v = (y + 0.5 - top) / heightRows;
          if (v < 0 || v >= 1) continue;
          const artY = Math.min(artH - 1, Math.floor(v * artH));
          let ch = art[artY][artX] || ' ';
          if (ch === ' ') continue;
          let color;
          if (s.kind === 'enemy') {
            if (dying) {
              if (hash3(x * 13 + glitchTime, y * 7, 31) > 0.5) ch = hash3(x, y, 3) > 0.5 ? 'x' : ':';
              color = enemyTint(tintPal, ch, false, true, x + y * 17);
            } else {
              color = enemyTint(tintPal, ch, flash, false, artX + artY * 13);
              if (s.type === 'warden' && ch === ':') {
                const pulse = hash3(x * 5 + Math.floor(now * 5), y * 3, 29);
                if (pulse > 0.968) { ch = '+'; color = '#ff8c9c'; }
                else if (pulse > 0.94) { color = '#b43c4e'; }
              }
            }
          } else if (s.kind === 'pickup') {
            const pk = s.pickup;
            const group = pk.chars[ch] || 'body';
            color = group === 'bright' ? pk.bright : (group === 'dim' ? pk.dim : pk.body);
          } else if (s.kind === 'projectile') {
            color = ch === '@' || ch === '*' ? '#ffe9b5' : (s.bossShot ? '#ff7676' : '#ff9d5c');
          } else if (s.kind === 'portal') {
            color = Math.sin(now * 13 + s.seed) > 0 ? '#ffd379' : '#ff8a4a';
          } else {
            color = '#8dffb0';
          }
          chars[y * cols + x] = ch;
          colors[y * cols + x] = color;
        }
      }
    }
  },
  drawFx(fx) {
    const cols = this.cols, rows = this.rows;
    for (const f of fx) {
      if (f.life <= 0) continue;
      const a = clamp(f.life / f.maxLife, 0, 1);
      if (a < 0.22 && Math.random() > a * 4) continue;
      const x = Math.floor(f.x * cols);
      const y = Math.floor(f.y * rows);
      if (f.text) {
        for (let i = 0; i < f.text.length; i++) this.set(x + i, y, f.text[i], f.color);
      } else {
        this.set(x, y, f.char, f.color);
      }
    }
  },
  drawWeapon(camera, weapon) {
    const cols = this.cols, rows = this.rows;
    const art = filledArt(weapon.art);
    const artH = art.length;
    let artW = 0;
    for (const line of art) if (line.length > artW) artW = line.length;
    const move = camera.moveAmt || 0;
    const bob = camera.bob || 0;
    const bobX = Math.round(Math.sin(bob) * 1.7 * move);
    const bobY = Math.round(Math.abs(Math.cos(bob)) * 1.2 * move);
    const recoil = weapon.kick || 0;
    const reloadDip = weapon.reloadDip || 0;
    const switchDip = weapon.switchDip || 0;
    const top = Math.floor(rows - artH - 1 + bobY + recoil * 2.2 + reloadDip + switchDip);
    const left = Math.floor((cols - artW) / 2 + bobX + (weapon.sway || 0));
    for (let y = 0; y < artH; y++) {
      const line = art[y];
      for (let x = 0; x < line.length; x++) {
        const ch = line[x];
        if (ch === ' ') continue;
        this.set(left + x, top + y, ch, weaponCharColor(ch));
      }
    }
    if (weapon.flash > 0) {
      const flashArt = weapon.flashBig ? MUZZLE_FLASH_BIG : MUZZLE_FLASH;
      const fh = flashArt.length;
      let fw = 0;
      for (const line of flashArt) if (line.length > fw) fw = line.length;
      const fx = Math.floor((cols - fw) / 2 + bobX);
      const fy = top - fh + 1;
      for (let y = 0; y < fh; y++) {
        for (let x = 0; x < flashArt[y].length; x++) {
          const ch = flashArt[y][x];
          if (ch === ' ') continue;
          const color = ch === '#' ? (Math.random() > 0.35 ? '#fffbe0' : '#ffc15c') : (Math.random() > 0.5 ? '#ffd070' : '#ff8c45');
          this.set(fx + x, fy + y, ch, color);
        }
      }
    }
  },
  flush() {
    const cols = this.cols, rows = this.rows, chars = this.chars, colors = this.colors;
    const cellW = this.cellW, cellH = this.cellH;
    ctx.font = this.font;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    for (let y = 0; y < rows; y++) {
      const base = y * cols;
      let x = 0;
      while (x < cols) {
        const color = colors[base + x];
        let run = '';
        let visible = false;
        while (x < cols && colors[base + x] === color) {
          const ch = chars[base + x];
          run += ch;
          if (ch !== ' ') visible = true;
          x++;
        }
        if (visible) {
          ctx.fillStyle = color;
          ctx.fillText(run, (x - run.length) * cellW, y * cellH + cellH * 0.5);
        }
      }
    }
  },
};

/* ============================================================
   GAME STATE
   ============================================================ */
let mode = 'title';
let titleTime = 0;
let lastFrame = performance.now();
let pointerLocked = false;
let hadPointerLock = false;
let fallbackDragging = false;
let fxFpsAccum = 0, fxFpsFrames = 0;

const input = { keys: new Set(), mouseDown: false };

const game = {
  player: null, enemies: [], portals: [], projectiles: [], pickups: [], fx: [],
  weapon: 'pulse', ammo: null, reload: 0, reloadWeapon: null, fireCooldown: 0,
  weaponKick: 0, switchingTo: null, switchDip: 0, muzzle: 0,
  score: 0, kills: 0, elapsed: 0, wave: 0, waveActive: false, waveTotal: 0, waveKilled: 0,
  spawnQueue: [], spawnTimer: 0, intermission: 0, nextWave: 1,
  boss: null, bossDefeated: false,
  damageFlash: 0, shake: 0, glitch: 0, flash: 0, deathT: 0, victoryT: 0,
  flowTimer: 0, flow: null, triggerHeld: false, triggerPressed: false,
  hudTimer: 0, messageTimers: {}, lockHintShown: false, emergencyTimer: 0, startedAt: 0,
};
let lastHud = {};
const titleScene = {
  enemies: [
    { type: 'mite', x: 16.8, y: 20.2 },
    { type: 'stalker', x: 25.4, y: 21.8 },
  ],
};

function makePlayer() {
  return {
    x: PLAYER_START.x, y: PLAYER_START.y, angle: PLAYER_START.angle,
    pitch: 0.02, hp: 100, maxHp: 100, radius: 0.28,
    bob: 0, moveAmt: 0, dashTimer: 0, dashCd: 0, dashDirX: 1, dashDirY: 0,
    invuln: 0, recoilPitch: 0,
  };
}
function freshAmmo() {
  return {
    pulse: { mag: 30, reserve: 120 },
    scatter: { mag: 6, reserve: 24 },
  };
}
function makeTitleCamera(t) {
  return {
    x: 20.5 + Math.sin(t * 0.075) * 0.9,
    y: 26.1 + Math.sin(t * 0.052) * 0.35,
    angle: -Math.PI / 2 + Math.sin(t * 0.11) * 0.16,
    pitch: 0.02 + Math.sin(t * 0.083) * 0.012,
    bob: t * 0.2, moveAmt: 0.08, shake: 0,
  };
}

/* ---------- messages + effects ---------- */
function addFx(x, y, vx, vy, ch, color, life) {
  if (game.fx.length > 260) game.fx.shift();
  game.fx.push({ x, y, vx, vy, ch, color, life, maxLife: life });
}
function addTextFx(x, y, text, color, life) {
  life = life || 0.55;
  for (let i = 0; i < text.length; i++) addFx(x + i * 0.009, y, rnd(-0.01, 0.01), -0.09, text[i], color, life);
}
function spawnImpact(x, y, color, count) {
  x = x === undefined ? 0.5 : x; y = y === undefined ? 0.5 : y;
  color = color || '#ffd07a'; count = count || 3;
  for (let i = 0; i < count; i++) {
    addFx(x + rnd(-0.015, 0.015), y + rnd(-0.012, 0.012), rnd(-0.16, 0.16), rnd(-0.2, 0.2),
      chance(0.5) ? '*' : (chance(0.5) ? "'" : '.'), color, rnd(0.18, 0.36));
  }
}
function spawnTracer(big) {
  const startX = 0.5 + rnd(-0.025, 0.025);
  const startY = 0.78 + rnd(0, 0.04);
  const endX = 0.5 + rnd(-0.02, 0.02);
  const endY = 0.5 + rnd(-0.02, 0.02);
  const n = big ? 14 : 8;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    addFx(lerp(startX, endX, t) + rnd(-0.012, 0.012), lerp(startY, endY, t), 0, 0,
      chance(0.5) ? '/' : '.', big ? '#ffca7a' : '#b8ffc8', 0.055 + t * 0.025);
  }
}
function toast(text, type) {
  if (!els.toastFeed) return;
  const el = document.createElement('div');
  el.className = 'toast ' + (type || '');
  el.textContent = text;
  els.toastFeed.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}
function pickupFeed(text, type) {
  if (!els.pickupFeed) return;
  const el = document.createElement('div');
  el.className = 'feed-item ' + (type || '');
  el.textContent = text;
  els.pickupFeed.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}
function showAlert(text, duration) {
  duration = duration === undefined ? 2.2 : duration;
  clearTimeout(game.messageTimers.alert);
  els.alertLine.textContent = text;
  els.alertLine.classList.toggle('show', !!text);
  if (duration > 0) game.messageTimers.alert = setTimeout(() => els.alertLine.classList.remove('show'), duration * 1000);
}
function showCenter(main, sub, duration) {
  duration = duration === undefined ? 2.2 : duration;
  clearTimeout(game.messageTimers.center);
  els.centerMsg.innerHTML = '<span>' + main + '</span>' + (sub ? '<span class="zh">' + sub + '</span>' : '');
  els.centerMsg.classList.add('show');
  if (duration > 0) game.messageTimers.center = setTimeout(() => els.centerMsg.classList.remove('show'), duration * 1000);
}
function clearCenter() {
  clearTimeout(game.messageTimers.center);
  els.centerMsg.classList.remove('show');
}
function triggerGlitch() {
  els.glitchLayer.classList.remove('hit');
  void els.glitchLayer.offsetWidth;
  els.glitchLayer.classList.add('hit');
}

/* ---------- HUD ---------- */
function makeBar(value, max, segs) {
  const f = clamp(Math.round((value / max) * segs), 0, segs);
  return '[' + '#'.repeat(f) + '.'.repeat(segs - f) + ']';
}
function setText(el, text, key) {
  if (!el) return;
  if (lastHud[key] !== text) { el.textContent = text; lastHud[key] = text; }
}
function updateAmmoTrack() {
  const w = WEAPONS[game.weapon];
  const ammo = game.ammo[game.weapon];
  const key = game.weapon + ':' + ammo.mag + ':' + w.magSize;
  if (lastHud.ammoTrack === key) return;
  lastHud.ammoTrack = key;
  let html = '';
  for (let i = 0; i < w.magSize; i++) html += '<i class="ammo-tick' + (i < ammo.mag ? ' full' : '') + '"></i>';
  els.ammoTrack.innerHTML = html;
}
function updateHud(force) {
  const p = game.player;
  if (!p) return;
  const hp = Math.max(0, p.hp);
  const low = hp <= 30;
  setText(els.vitalBar, makeBar(hp, p.maxHp, 10), 'vitalBar');
  els.vitalBar.classList.toggle('low', low);
  setText(els.vitalNum, String(Math.ceil(hp)), 'vitalNum');
  els.vitalNum.classList.toggle('low', low);
  const dashReady = p.dashCd <= 0;
  setText(els.dashBar, makeBar(dashReady ? 10 : (1 - p.dashCd / 2.4) * 10, 10, 10), 'dashBar');
  setText(els.dashText, dashReady ? 'READY' : p.dashCd.toFixed(1) + 'S', 'dashText');
  setText(els.diagnosticText, low ? '!! VITAL SIGNS CRITICAL !!' : 'CORE INTEGRITY NOMINAL', 'diag');
  els.diagnosticText.style.color = low ? 'var(--danger)' : 'var(--ink-dim)';
  const w = WEAPONS[game.weapon];
  const ammo = game.ammo[game.weapon];
  setText(els.weaponName, w.name, 'weaponName');
  setText(els.weaponMode, w.mode, 'weaponMode');
  setText(els.ammoMag, String(ammo.mag).padStart(2, '0'), 'ammoMag');
  els.ammoMag.classList.toggle('empty', ammo.mag === 0);
  setText(els.ammoReserve, String(ammo.reserve).padStart(3, '0'), 'ammoReserve');
  updateAmmoTrack();
  const shownWave = game.waveActive ? game.wave : (game.intermission > 0 ? game.nextWave : game.wave);
  setText(els.waveNumber, pad(shownWave || 1, 2), 'wave');
  let remaining = game.spawnQueue.length + game.portals.length;
  for (const e of game.enemies) if (e.state !== 'dying') remaining++;
  setText(els.hostileCount, game.waveActive ? pad(remaining, 2) : '--', 'hostiles');
  els.hostileCount.classList.toggle('danger', remaining > 0 && game.waveActive);
  els.hostileCount.classList.toggle('warn', remaining === 0 && game.waveActive);
  let objective = 'PURGE THE SECTOR';
  if (game.boss && game.boss.state !== 'dying') objective = 'DESTROY THE WARDEN';
  else if (!game.waveActive && game.intermission > 0) objective = 'NEXT SECTOR // T-' + Math.ceil(game.intermission);
  else if (!game.waveActive) objective = 'AWAIT UPLINK';
  setText(els.objectiveText, objective, 'objective');
  const progress = game.waveActive ? clamp(game.waveKilled / Math.max(1, game.waveTotal), 0, 1) : 0;
  els.waveProgress.style.width = (progress * 100).toFixed(1) + '%';
  setText(els.scoreValue, pad(game.score, 7), 'score');
  setText(els.timerValue, fmtTime(game.elapsed), 'timer');
  if (game.boss && game.boss.state !== 'dying') {
    els.bossBar.classList.remove('hidden');
    const ratio = clamp(game.boss.hp / game.boss.maxHp, 0, 1);
    els.bossHp.style.width = (ratio * 100).toFixed(1) + '%';
    els.bossHpText.textContent = Math.ceil(ratio * 100) + '%';
  } else {
    els.bossBar.classList.add('hidden');
  }
  if (game.reload > 0) {
    const dur = game.reloadWeapon ? WEAPONS[game.reloadWeapon].reloadTime : 1;
    const ratio = clamp(1 - game.reload / dur, 0, 1);
    els.reloadRing.classList.add('show');
    els.reloadRing.style.setProperty('--reload-p', ratio.toFixed(3));
    els.reloadText.textContent = 'RELOAD ' + Math.floor(ratio * 100) + '%';
  } else {
    els.reloadRing.classList.remove('show');
  }
  if (els.radarStatus) els.radarStatus.textContent = game.waveActive ? 'LIVE' : 'HOLD';
}
function updateFps(dt) {
  fxFpsAccum += dt; fxFpsFrames++;
  if (fxFpsAccum >= 0.55) {
    const fps = Math.round(fxFpsFrames / fxFpsAccum);
    setText(els.fps, fps + ' FPS', 'fps');
    fxFpsAccum = 0; fxFpsFrames = 0;
  }
}
function updateScreenDom() {
  const p = game.player;
  if (!p) return;
  const low = p.hp <= 30 && p.hp > 0;
  const base = game.damageFlash * 0.75 + game.flash * 0.4;
  const lowPulse = low ? (0.08 + 0.04 * (Math.sin(performance.now() / 160) * 0.5 + 0.5)) : 0;
  const dmg = clamp(base + lowPulse, 0, 0.9);
  if (Math.abs(dmg - (lastHud.dmg || 0)) > 0.02) {
    els.damageLayer.style.opacity = dmg.toFixed(2);
    lastHud.dmg = dmg;
  }
  const fl = clamp(game.flash * 0.25, 0, 0.35);
  if (Math.abs(fl - (lastHud.fla || 0)) > 0.02) {
    els.flashLayer.style.opacity = fl.toFixed(2);
    lastHud.fla = fl;
  }
  if (game.shake > 0.25) {
    const sx = (Math.random() - 0.5) * game.shake * 1.1;
    const sy = (Math.random() - 0.5) * game.shake * 0.7;
    els.canvas.style.transform = 'translate(' + sx.toFixed(1) + 'px,' + sy.toFixed(1) + 'px) scale(1.008)';
  } else if (els.canvas.style.transform) {
    els.canvas.style.transform = '';
  }
}

/* ---------- radar ---------- */
function drawRadar() {
  const c = els.radar;
  const g = radarCtx;
  const W = c.width, H = c.height;
  g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgba(0,8,4,.92)';
  g.fillRect(0, 0, W, H);
  const cell = Math.min((W - 32) / MAP_W, (H - 26) / MAP_H);
  const ox = (W - MAP_W * cell) / 2;
  const oy = (H - MAP_H * cell) / 2 + 4;
  g.strokeStyle = 'rgba(90,220,140,.065)';
  g.lineWidth = 1;
  for (let x = 0; x <= W; x += 20) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let y = 0; y <= H; y += 20) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const wt = wallType[y * MAP_W + x];
      if (wt !== WALL_NONE) {
        g.fillStyle = wt === 1 ? 'rgba(66,187,194,.28)' : (wt === 2 ? 'rgba(214,148,48,.3)' : 'rgba(65,166,103,.23)');
        g.fillRect(ox + x * cell, oy + y * cell, Math.max(1, cell - 0.5), Math.max(1, cell - 0.5));
      } else {
        const st = floorStyle[y * MAP_W + x];
        if (st === 1) {
          g.fillStyle = 'rgba(40,150,170,.085)';
          g.fillRect(ox + x * cell, oy + y * cell, Math.max(1, cell - 1), Math.max(1, cell - 1));
        } else if (st === 2) {
          g.fillStyle = 'rgba(80,220,130,.06)';
          g.fillRect(ox + x * cell, oy + y * cell, Math.max(1, cell - 1), Math.max(1, cell - 1));
        }
      }
    }
  }
  const p = game.player;
  if (p && mode !== 'title') {
    const scanAng = performance.now() / 1400;
    const px = ox + p.x * cell, py = oy + p.y * cell;
    const grad = g.createLinearGradient(px, py, px + Math.cos(scanAng) * W, py + Math.sin(scanAng) * W);
    grad.addColorStop(0, 'rgba(120,255,170,.23)');
    grad.addColorStop(0.7, 'rgba(120,255,170,.03)');
    grad.addColorStop(1, 'rgba(120,255,170,0)');
    g.strokeStyle = grad;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(px, py);
    g.lineTo(px + Math.cos(scanAng) * W, py + Math.sin(scanAng) * W);
    g.stroke();
    for (const pk of game.pickups) {
      g.fillStyle = pk.type === 'health' ? 'rgba(115,255,189,.9)' : 'rgba(255,193,92,.9)';
      g.fillRect(ox + pk.x * cell - 2, oy + pk.y * cell - 2, 4, 4);
    }
    for (const e of game.enemies) {
      if (e.state === 'dying') continue;
      const big = e.type === 'warden';
      g.fillStyle = big ? 'rgba(255,70,80,1)' : (e.type === 'brute' ? 'rgba(255,110,86,.95)' : 'rgba(255,155,98,.9)');
      const size = big ? 9 : (e.type === 'brute' ? 5 : 3);
      g.fillRect(ox + e.x * cell - size / 2, oy + e.y * cell - size / 2, size, size);
      if (big) {
        g.strokeStyle = 'rgba(255,90,100,.5)';
        g.beginPath();
        g.arc(ox + e.x * cell, oy + e.y * cell, 9 + Math.sin(performance.now() / 120) * 2, 0, TAU);
        g.stroke();
      }
    }
    for (const portal of game.portals) {
      g.fillStyle = 'rgba(255,220,110,.75)';
      g.fillRect(ox + portal.x * cell - 2, oy + portal.y * cell - 2, 4, 4);
    }
    g.save();
    g.translate(px, py);
    g.rotate(p.angle + Math.PI / 2);
    g.fillStyle = '#ffd477';
    g.beginPath();
    g.moveTo(0, -8); g.lineTo(6, 6); g.lineTo(0, 3); g.lineTo(-6, 6); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,212,119,.25)';
    g.beginPath();
    g.arc(0, 0, 13 + Math.sin(performance.now() / 240) * 2, 0, TAU);
    g.stroke();
    g.restore();
  }
  g.fillStyle = 'rgba(0,0,0,.18)';
  for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 1);
  g.strokeStyle = 'rgba(120,255,163,.16)';
  g.lineWidth = 2;
  g.strokeRect(1, 1, W - 2, H - 2);
}

/* ============================================================
   RUN LIFECYCLE / SPAWNING
   ============================================================ */
function resetRun() {
  clearCenter();
  showAlert('', 0);
  if (els.toastFeed) els.toastFeed.innerHTML = '';
  if (els.pickupFeed) els.pickupFeed.innerHTML = '';
  game.runId = (game.runId || 0) + 1;
  const runId = game.runId;
  game.player = makePlayer();
  game.enemies = [];
  game.portals = [];
  game.projectiles = [];
  game.pickups = [];
  game.fx = [];
  game.ammo = freshAmmo();
  game.weapon = 'pulse';
  game.reload = 0;
  game.reloadWeapon = null;
  game.fireCooldown = 0;
  game.weaponKick = 0;
  game.switchingTo = null;
  game.switchDip = 0;
  game.muzzle = 0;
  game.score = 0;
  game.kills = 0;
  game.elapsed = 0;
  game.wave = 0;
  game.waveActive = false;
  game.waveTotal = 0;
  game.waveKilled = 0;
  game.spawnQueue = [];
  game.spawnTimer = 0;
  game.intermission = 2.6;
  game.nextWave = 1;
  game.boss = null;
  game.bossDefeated = false;
  game.damageFlash = 0;
  game.shake = 0;
  game.glitch = 0;
  game.flash = 0;
  game.deathT = 0;
  game.victoryT = 0;
  game.flowTimer = 0;
  game.flow = null;
  game.triggerHeld = false;
  game.triggerPressed = false;
  game.hudTimer = 0;
  game.lockHintShown = false;
  game.emergencyTimer = 0;
  game.startedAt = performance.now();
  lastHud = {};
  spawnPickup(19.6, 19.4, 'health');
  spawnPickup(16.6, 22.2, 'pulse');
  spawnPickup(24.4, 22.2, 'shells');
  showCenter('AUDIT DAEMON ONLINE', 'UPLINK ESTABLISHED // SURVIVE THE HAB-RING', 2.8);
  setTimeout(() => {
    if (mode === 'playing' && game.runId === runId) showCenter('SECTOR 01 INBOUND', 'HOSTILE SIGNAL ACQUIRED', 2.2);
  }, 950);
  setText(els.fps, '-- FPS', 'fps');
  updateHud(true);
  drawRadar();
}
function spawnPickup(x, y, type) {
  if (isWall(x, y)) return;
  if (x < 0.5 || y < 0.5 || x > MAP_W - 0.5 || y > MAP_H - 0.5) return;
  game.pickups.push({ x, y, type, bob: rnd(0, TAU), age: 0 });
}
function randomPickupSpot(minDist, maxDist) {
  const p = game.player;
  for (let tries = 0; tries < 40; tries++) {
    const a = rnd(0, TAU);
    const d = rnd(minDist, maxDist);
    const x = p.x + Math.cos(a) * d;
    const y = p.y + Math.sin(a) * d;
    if (!isWall(x, y) && !collidesCircle(x, y, 0.2)) return { x, y };
  }
  return { x: p.x + 0.9, y: p.y };
}
function buildQueue(waveNum) {
  const def = WAVES[waveNum - 1];
  const queue = [];
  def.enemies.forEach((pair) => {
    for (let i = 0; i < pair[1]; i++) queue.push(pair[0]);
  });
  if (waveNum === 5) {
    const first = queue.shift();
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = queue[i]; queue[i] = queue[j]; queue[j] = tmp;
    }
    queue.unshift(first);
  } else {
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = queue[i]; queue[i] = queue[j]; queue[j] = tmp;
    }
  }
  return queue;
}
function startWave(n) {
  game.wave = n;
  game.waveActive = true;
  game.waveKilled = 0;
  const def = WAVES[n - 1];
  game.waveTotal = def.enemies.reduce((a, b) => a + b[1], 0);
  game.spawnQueue = buildQueue(n);
  game.spawnTimer = n === 1 ? 1.0 : 0.7;
  game.boss = null;
  game.bossDefeated = false;
  game.intermission = 0;
  if (n === 5) {
    AudioKit.bossWarn();
    showAlert('!! WARDEN-CLASS ENTITY DETECTED !!', 4.5);
    showCenter('SECTOR 05 // THE WARDEN', '最终审计协议 // 目标已解除封印', 3.6);
    els.bossBar.classList.remove('hidden');
  } else {
    AudioKit.waveStart();
    showCenter('SECTOR ' + pad(n, 2) + ' // ' + def.title, def.sub, 2.6);
  }
  toast('SECTOR ' + pad(n, 2) + ' // ' + def.title, 'green');
  updateHud(true);
}
function choosePortalPoint() {
  const p = game.player;
  let best = null, bestScore = -Infinity;
  const shuffled = SPAWN_POINTS.slice().sort(() => Math.random() - 0.5);
  for (const sp of shuffled) {
    const d = Math.hypot(sp.x - p.x, sp.y - p.y);
    if (d < 6.2) continue;
    let occupied = false;
    for (const e of game.enemies) if (Math.hypot(e.x - sp.x, e.y - sp.y) < 1.4) { occupied = true; break; }
    if (!occupied) for (const po of game.portals) if (Math.hypot(po.x - sp.x, po.y - sp.y) < 1.4) { occupied = true; break; }
    if (occupied) continue;
    const sc = d + rnd(0, 3);
    if (sc > bestScore) { bestScore = sc; best = sp; }
  }
  if (best) return best;
  return SPAWN_POINTS.reduce((a, b) => {
    const da = Math.hypot(a.x - p.x, a.y - p.y);
    const db = Math.hypot(b.x - p.x, b.y - p.y);
    return db > da ? b : a;
  });
}
function spawnPortal(type) {
  const sp = choosePortalPoint();
  game.portals.push({ x: sp.x, y: sp.y, type, t: 0, duration: type === 'warden' ? 1.8 : 1.05, seed: rnd(0, 100) });
}
function materializeEnemy(portal) {
  const def = ENEMY_TYPES[portal.type];
  const e = {
    type: portal.type, x: portal.x, y: portal.y, hp: def.hp, maxHp: def.hp,
    radius: def.radius, state: 'active', anim: rnd(0, TAU), attackCd: rnd(0.1, 0.9),
    shootCd: rnd(0.7, 1.7), charge: 0, hitFlash: 0, dyingT: 0, stun: 0,
    strafe: chance(0.5) ? 1 : -1, strafeTimer: rnd(0.8, 2.4), los: false, seed: rnd(0, 1000),
    angle: 0, enraged: false, specialCd: 7.5,
  };
  game.enemies.push(e);
  if (def.id === 'warden') {
    game.boss = e;
    showAlert('WARDEN HAS ENTERED THE SECTOR', 2.8);
    AudioKit.bossWarn();
  }
  spawnImpact(0.5, 0.5, '#ffd27a', 4);
  AudioKit.tone({ freq: 240, end: 90, dur: 0.12, type: 'sawtooth', vol: 0.055 });
  updateHud(true);
}
function spawnSupplyCache() {
  const spots = [];
  for (let i = 0; i < 2; i++) spots.push(randomPickupSpot(1.4, 3.5));
  spawnPickup(spots[0].x, spots[0].y, chance(0.58) ? 'health' : 'pulse');
  spawnPickup(spots[1].x, spots[1].y, chance(0.5) ? 'shells' : 'pulse');
  toast('SUPPLY CACHE DEPLOYED // 补给已投放', 'green');
}
function completeWave() {
  game.waveActive = false;
  game.projectiles = [];
  game.spawnQueue = [];
  game.portals = [];
  const bonus = 200 + game.wave * 150;
  game.score += bonus;
  game.player.hp = Math.min(game.player.maxHp, game.player.hp + 15);
  game.ammo.pulse.reserve = Math.min(300, game.ammo.pulse.reserve + 45);
  game.ammo.scatter.reserve = Math.min(60, game.ammo.scatter.reserve + 6);
  spawnSupplyCache();
  if (game.wave >= MAX_WAVE) { triggerVictory(); return; }
  game.intermission = 5.5;
  game.nextWave = game.wave + 1;
  AudioKit.waveStart();
  showCenter('SECTOR ' + pad(game.wave, 2) + ' PURGED', '// +' + bonus + ' SCORE // 补给已投放', 3.2);
  const runId = game.runId;
  setTimeout(() => {
    if (mode === 'playing' && !game.waveActive && game.runId === runId) showCenter('INCOMING // SECTOR ' + pad(game.nextWave, 2), 'NEXT WAVE LINKED IN 5 SECONDS', 2.2);
  }, 1900);
  triggerGlitch();
  updateHud(true);
}
function triggerVictory() {
  if (mode !== 'playing') return;
  mode = 'victory-transition';
  game.victoryT = 0;
  game.flash = 1;
  game.shake = 3;
  game.score += 2500 + Math.floor(game.player.hp * 20);
  AudioKit.victory();
  showCenter('CORE RESTORED', '全部扇区已净化 // 终端重新上线', 4);
  if (document.pointerLockElement) document.exitPointerLock();
}
function triggerDeath() {
  if (mode !== 'playing') return;
  mode = 'dying';
  game.deathT = 0;
  game.damageFlash = 1;
  game.shake = 8;
  AudioKit.playerDeath();
  if (document.pointerLockElement) document.exitPointerLock();
}
function applyPlayerDamage(amount) {
  if (mode !== 'playing') return;
  const p = game.player;
  if (window.__godMode || p.invuln > 0) return;
  p.hp -= amount;
  p.invuln = 0.42;
  game.damageFlash = 1;
  game.shake = Math.min(11, game.shake + 4.5);
  game.flash = 0.25;
  AudioKit.hurt();
  triggerGlitch();
  pickupFeed('-' + amount + ' VITAL', 'hurt');
  spawnImpact(0.5 + rnd(-0.13, 0.13), 0.5 + rnd(-0.1, 0.1), '#ff5f63', 4);
  if (p.hp <= 0) { p.hp = 0; triggerDeath(); }
}
function insertDroppedPickup(x, y, type) {
  if (!isWall(x, y) && game.pickups.length < 14) spawnPickup(x, y, type);
}
function killEnemy(e) {
  if (e.state === 'dying') return;
  e.state = 'dying';
  e.dyingT = 0.48;
  game.kills++;
  game.waveKilled++;
  const def = ENEMY_TYPES[e.type];
  game.score += def.score;
  spawnImpact(0.5 + rnd(-0.08, 0.08), 0.5 + rnd(-0.06, 0.06), '#ff8a72', 7);
  spawnImpact(0.5 + rnd(-0.1, 0.1), 0.5 + rnd(-0.08, 0.08), '#ffd7a1', 4);
  AudioKit.kill();
  if (e.type === 'warden') {
    game.boss = null;
    game.bossDefeated = true;
    game.score += 1500;
    game.flash = 0.8;
    game.shake = 6;
    triggerGlitch();
    showAlert('WARDEN CORE SHATTERED', 3);
    AudioKit.victory();
  } else {
    if (chance(0.24)) {
      const roll = Math.random();
      insertDroppedPickup(e.x, e.y, roll < 0.45 ? 'health' : (roll < 0.78 ? 'pulse' : 'shells'));
    }
    addTextFx(0.44, 0.4, '+' + def.score, '#ffd27a', 0.6);
    if (e.type === 'brute') toast('BRUTE PURGED // +' + def.score, 'green');
  }
  updateHud(true);
}

/* ============================================================
   PLAYER / WEAPONS
   ============================================================ */
function switchWeapon(key) {
  if (mode !== 'playing') return;
  if (!WEAPONS[key] || game.weapon === key || game.switchingTo === key) return;
  if (game.reload > 0) { game.reload = 0; game.reloadWeapon = null; }
  game.switchingTo = key;
  game.switchDip = 0;
  game.triggerHeld = false;
  game.triggerPressed = false;
  AudioKit.click(460, 0.04, 0.045);
}
function startReload() {
  if (mode !== 'playing' || game.reload > 0 || game.switchingTo) return;
  const w = WEAPONS[game.weapon], a = game.ammo[game.weapon];
  if (a.mag >= w.magSize) return;
  if (a.reserve <= 0) {
    AudioKit.empty();
    pickupFeed('NO CELLS IN RESERVE', 'hurt');
    return;
  }
  game.reload = w.reloadTime;
  game.reloadWeapon = game.weapon;
  game.triggerHeld = false;
  game.triggerPressed = false;
  AudioKit.reloadStart();
}
function finishReload() {
  const key = game.reloadWeapon || game.weapon;
  const w = WEAPONS[key], a = game.ammo[key];
  const need = w.magSize - a.mag;
  const take = Math.min(need, a.reserve);
  a.mag += take;
  a.reserve -= take;
  game.reload = 0;
  game.reloadWeapon = null;
  AudioKit.reloadDone();
  updateHud(true);
}
function findTarget(angle, range) {
  const p = game.player;
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const wall = castRayDistance(p.x, p.y, dx, dy, range + 8);
  const wallDist = wall.hit ? wall.dist : range + 8;
  let best = null, bestAlong = Infinity;
  for (const e of game.enemies) {
    if (e.state !== 'active') continue;
    const relX = e.x - p.x, relY = e.y - p.y;
    const along = relX * dx + relY * dy;
    if (along <= 0.2 || along > range + e.radius) continue;
    const perp = Math.abs(relX * dy - relY * dx);
    if (perp <= e.radius && along < bestAlong && along < wallDist) {
      best = e; bestAlong = along;
    }
  }
  return { enemy: best, along: bestAlong, wallDist, wall };
}
function damageEnemy(e, dmg, angle) {
  if (e.state !== 'active') return;
  e.hp -= dmg;
  e.hitFlash = 0.09;
  e.stun = 0.06;
  e.x -= Math.cos(angle) * 0.05;
  e.y -= Math.sin(angle) * 0.05;
  const total = Math.round(dmg);
  addTextFx(0.5 + rnd(-0.02, 0.02), 0.46 + rnd(-0.02, 0.02), String(total), e.type === 'warden' ? '#ffb0a0' : '#ffe2b0', 0.42);
  spawnImpact(0.5 + rnd(-0.03, 0.03), 0.5 + rnd(-0.03, 0.03), '#ffb08a', 2);
  if (e.type === 'warden' && e.hp > 0 && e.hp < e.maxHp * 0.5 && !e.enraged) {
    e.enraged = true;
    game.waveTotal += 3;
    showAlert('WARDEN ENRAGED // ESCORTS DEPLOYING', 3);
    const types = ['stalker', 'mite', 'mite'];
    for (let i = 0; i < types.length; i++) {
      const sp = SPAWN_POINTS[Math.floor(rnd(0, SPAWN_POINTS.length))];
      if (sp) game.portals.push({ x: sp.x, y: sp.y, type: types[i], t: 0, duration: 0.9, seed: rnd(0, 100) });
    }
  }
  if (e.hp <= 0) killEnemy(e);
}
function fireWeapon() {
  const key = game.weapon;
  const w = WEAPONS[key], a = game.ammo[key];
  if (game.reload > 0 || game.switchingTo) return;
  if (a.mag <= 0) {
    AudioKit.empty();
    if (a.reserve > 0) startReload();
    return;
  }
  a.mag--;
  game.fireCooldown = w.cooldown;
  game.weaponKick = Math.min(3.4, game.weaponKick + w.kick);
  game.muzzle = key === 'scatter' ? 0.085 : 0.05;
  game.shake = Math.min(10, game.shake + (key === 'scatter' ? 2.1 : 0.5));
  game.player.recoilPitch = Math.min(0.11, (game.player.recoilPitch || 0) + (key === 'scatter' ? 0.075 : 0.023));
  game.flash = Math.max(game.flash, key === 'scatter' ? 0.22 : 0.05);
  if (key === 'pulse') AudioKit.shotPulse(); else AudioKit.shotScatter();
  spawnTracer(key === 'scatter');
  els.reticle.classList.remove('firing');
  void els.reticle.offsetWidth;
  els.reticle.classList.add('firing');
  let hitSomething = false;
  for (let i = 0; i < w.pellets; i++) {
    const spread = w.spread * (w.pellets > 1 ? 1 : 0.7);
    const angle = game.player.angle + rnd(-spread, spread);
    const targetInfo = findTarget(angle, w.range);
    if (targetInfo.enemy) {
      hitSomething = true;
      let dmg = w.damage;
      if (key === 'scatter') {
        const d = Math.hypot(targetInfo.enemy.x - game.player.x, targetInfo.enemy.y - game.player.y);
        dmg *= clamp(1.08 - d / 18, 0.32, 1);
        dmg = Math.max(3, Math.round(dmg));
      }
      damageEnemy(targetInfo.enemy, dmg, angle);
    } else {
      spawnImpact(0.5 + rnd(-0.022, 0.022), 0.5 + rnd(-0.018, 0.018), '#ffd07a', key === 'scatter' ? 2 : 1);
    }
  }
  if (hitSomething) {
    AudioKit.hit();
    els.hitmarker.classList.remove('show');
    void els.hitmarker.offsetWidth;
    els.hitmarker.classList.add('show');
    els.reticle.classList.add('hit');
    setTimeout(() => els.reticle.classList.remove('hit'), 90);
  }
  if (a.mag <= 0 && a.reserve > 0) setTimeout(() => { if (mode === 'playing' && game.weapon === key) startReload(); }, 180);
  updateHud(true);
}
function tryDash() {
  if (mode !== 'playing') return;
  const p = game.player;
  if (p.dashCd > 0) return;
  let dx = Math.cos(p.angle), dy = Math.sin(p.angle);
  const f = (input.keys.has('KeyW') ? 1 : 0) - (input.keys.has('KeyS') ? 1 : 0);
  const s = (input.keys.has('KeyD') ? 1 : 0) - (input.keys.has('KeyA') ? 1 : 0);
  if (f !== 0 || s !== 0) {
    const mx = Math.cos(p.angle) * f - Math.sin(p.angle) * s;
    const my = Math.sin(p.angle) * f + Math.cos(p.angle) * s;
    const n = norm2(mx, my);
    dx = n[0]; dy = n[1];
  }
  p.dashDirX = dx; p.dashDirY = dy;
  p.dashTimer = 0.15;
  p.dashCd = 2.4;
  p.invuln = Math.max(p.invuln, 0.3);
  game.shake = Math.max(game.shake, 2.4);
  AudioKit.dash();
  spawnImpact(0.5, 0.55, '#b9ffdc', 7);
}
function updatePlayer(dt) {
  const p = game.player;
  p.invuln = Math.max(0, p.invuln - dt);
  p.dashCd = Math.max(0, p.dashCd - dt);
  p.recoilPitch = Math.max(0, p.recoilPitch - dt * 0.5);
  game.fireCooldown = Math.max(0, game.fireCooldown - dt);
  game.weaponKick = Math.max(0, game.weaponKick - dt * 7);
  game.muzzle = Math.max(0, game.muzzle - dt);
  let f = 0, s = 0;
  if (input.keys.has('KeyW')) f += 1;
  if (input.keys.has('KeyS')) f -= 1;
  if (input.keys.has('KeyA')) s -= 1;
  if (input.keys.has('KeyD')) s += 1;
  if (input.keys.has('ArrowLeft')) p.angle -= 1.85 * dt;
  if (input.keys.has('ArrowRight')) p.angle += 1.85 * dt;
  if (input.keys.has('ArrowUp')) p.pitch = clamp(p.pitch + 1.15 * dt, -0.52, 0.52);
  if (input.keys.has('ArrowDown')) p.pitch = clamp(p.pitch - 1.15 * dt, -0.52, 0.52);
  const dirX = Math.cos(p.angle), dirY = Math.sin(p.angle);
  const rightX = -dirY, rightY = dirX;
  let mx = dirX * f + rightX * s;
  let my = dirY * f + rightY * s;
  const moving = (mx !== 0 || my !== 0);
  if (moving) { const n = norm2(mx, my); mx = n[0]; my = n[1]; }
  const sprint = (input.keys.has('ShiftLeft') || input.keys.has('ShiftRight')) && f > 0;
  const speed = sprint ? 4.55 : 3.15;
  if (p.dashTimer > 0) {
    p.dashTimer -= dt;
    moveCircle(p, p.dashDirX * 15.5 * dt, p.dashDirY * 15.5 * dt, p.radius);
  } else {
    moveCircle(p, mx * speed * dt, my * speed * dt, p.radius);
  }
  p.moveAmt = moving ? Math.min(1, p.moveAmt + dt * 6) : Math.max(0, p.moveAmt - dt * 5);
  p.bob += dt * (moving ? (sprint ? 11 : 8.2) : 1.2);
  p.pitch = clamp(p.pitch, -0.52, 0.52);
  if (game.switchingTo) {
    game.switchDip = Math.min(4.5, game.switchDip + dt * 30);
    if (game.switchDip >= 4.4) {
      game.weapon = game.switchingTo;
      game.switchingTo = null;
      game.fireCooldown = 0.2;
      updateHud(true);
    }
  } else if (game.switchDip > 0) {
    game.switchDip = Math.max(0, game.switchDip - dt * 28);
  }
  if (game.reload > 0) {
    game.reload -= dt;
    if (game.reload <= 0) finishReload();
  }
  const curW = WEAPONS[game.weapon];
  if (game.reload <= 0 && !game.switchingTo && game.fireCooldown <= 0) {
    if ((game.triggerPressed || (game.triggerHeld && curW.auto))) {
      fireWeapon();
      game.triggerPressed = false;
    }
  } else {
    game.triggerPressed = false;
  }
  const totalAmmo = game.ammo.pulse.mag + game.ammo.pulse.reserve + game.ammo.scatter.mag + game.ammo.scatter.reserve;
  if (totalAmmo <= 0) {
    game.emergencyTimer += dt;
    if (game.emergencyTimer >= 1.5) {
      game.emergencyTimer = 0;
      game.ammo.pulse.mag = Math.min(3, game.ammo.pulse.mag + 1);
      toast('EMERGENCY CELL FABRICATED // +1', '');
      updateHud(true);
    }
  } else game.emergencyTimer = 0;
  for (let i = game.pickups.length - 1; i >= 0; i--) {
    const pk = game.pickups[i];
    pk.age += dt;
    const d = Math.hypot(pk.x - p.x, pk.y - p.y);
    if (d < 0.68) {
      let removed = false;
      if (pk.type === 'health') {
        if (p.hp < p.maxHp) { p.hp = Math.min(p.maxHp, p.hp + 25); pickupFeed('+25 VITAL', ''); AudioKit.pickup(); removed = true; }
      } else if (pk.type === 'pulse') {
        if (game.ammo.pulse.reserve < 300) { game.ammo.pulse.reserve = Math.min(300, game.ammo.pulse.reserve + 30); pickupFeed('+30 PULSE CELLS', 'ammo'); AudioKit.pickup(); removed = true; }
      } else if (pk.type === 'shells') {
        if (game.ammo.scatter.reserve < 60) { game.ammo.scatter.reserve = Math.min(60, game.ammo.scatter.reserve + 6); pickupFeed('+6 SHELLS', 'ammo'); AudioKit.pickup(); removed = true; }
      }
      if (removed) { game.pickups.splice(i, 1); updateHud(true); }
    }
  }
  game.damageFlash = Math.max(0, game.damageFlash - dt * 2.2);
  game.flash = Math.max(0, game.flash - dt * 4.2);
  game.shake = Math.max(0, game.shake - dt * 9);
  game.glitch = Math.max(0, game.glitch - dt * 2.4);
}

/* ============================================================
   WAVES / ENEMIES / PROJECTILES
   ============================================================ */
function updateWave(dt) {
  if (game.waveActive) {
    if (game.spawnQueue.length > 0) {
      game.spawnTimer -= dt;
      if (game.spawnTimer <= 0) {
        const type = game.spawnQueue.shift();
        spawnPortal(type);
        game.spawnTimer = type === 'warden' ? 2.0 : rnd(0.42, 0.8);
      }
    }
    if (game.spawnQueue.length === 0 && game.portals.length === 0) {
      let alive = 0;
      for (const e of game.enemies) if (e.state === 'active') alive++;
      if (alive === 0 && game.waveTotal > 0) completeWave();
    }
  } else if (game.intermission > 0) {
    game.intermission -= dt;
    if (game.intermission <= 0) {
      game.intermission = 0;
      if (game.nextWave <= MAX_WAVE) startWave(game.nextWave);
    }
  }
  for (let i = game.portals.length - 1; i >= 0; i--) {
    const portal = game.portals[i];
    portal.t += dt;
    if (portal.t >= portal.duration) {
      materializeEnemy(portal);
      game.portals.splice(i, 1);
    }
  }
}
function computeFlow() {
  const p = game.player;
  const sx = Math.floor(p.x), sy = Math.floor(p.y);
  const dist = new Int16Array(MAP_W * MAP_H).fill(-1);
  if (isWallCell(sx, sy)) { game.flow = dist; return; }
  const qx = new Int16Array(MAP_W * MAP_H), qy = new Int16Array(MAP_W * MAP_H);
  let head = 0, tail = 0;
  qx[tail] = sx; qy[tail] = sy; tail++;
  dist[sy * MAP_W + sx] = 0;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  while (head < tail) {
    const x = qx[head], y = qy[head]; head++;
    const d = dist[y * MAP_W + x];
    for (let i = 0; i < 8; i++) {
      const nx = x + dirs[i][0], ny = y + dirs[i][1];
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
      if (isWallCell(nx, ny)) continue;
      if (i >= 4 && (isWallCell(x + dirs[i][0], y) || isWallCell(x, y + dirs[i][1]))) continue;
      const idx = ny * MAP_W + nx;
      if (dist[idx] !== -1) continue;
      dist[idx] = d + 1;
      qx[tail] = nx; qy[tail] = ny; tail++;
    }
  }
  game.flow = dist;
}
function flowDirection(e) {
  const p = game.player;
  const dist = game.flow;
  if (!dist) return null;
  const cx = Math.floor(e.x), cy = Math.floor(e.y);
  if (cx < 0 || cy < 0 || cx >= MAP_W || cy >= MAP_H) return null;
  if (Math.hypot(p.x - e.x, p.y - e.y) < 1.7 && hasLOS(e.x, e.y, p.x, p.y)) return norm2(p.x - e.x, p.y - e.y);
  let bestD = dist[cy * MAP_W + cx];
  if (bestD < 0) return null;
  let bx = -1, by = -1;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  for (let i = 0; i < 8; i++) {
    const nx = cx + dirs[i][0], ny = cy + dirs[i][1];
    if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
    if (isWallCell(nx, ny)) continue;
    if (i >= 4 && (isWallCell(cx + dirs[i][0], cy) || isWallCell(cx, cy + dirs[i][1]))) continue;
    const d = dist[ny * MAP_W + nx];
    if (d >= 0 && d < bestD) { bestD = d; bx = nx; by = ny; }
  }
  if (bx < 0) return norm2(p.x - e.x, p.y - e.y);
  return norm2(bx + 0.5 - e.x, by + 0.5 - e.y);
}
function updateEnemies(dt) {
  const p = game.player;
  game.flowTimer -= dt;
  if (game.flowTimer <= 0) { game.flowTimer = 0.32; computeFlow(); }
  for (const e of game.enemies) e.attackCd -= dt;
  for (let i = game.enemies.length - 1; i >= 0; i--) {
    const e = game.enemies[i];
    e.anim += dt;
    e.hitFlash = Math.max(0, e.hitFlash - dt);
    if (e.state === 'dying') {
      e.dyingT -= dt;
      if (e.dyingT <= 0) game.enemies.splice(i, 1);
      continue;
    }
    if (e.stun > 0) { e.stun -= dt; continue; }
    const def = ENEMY_TYPES[e.type];
    const dxp = p.x - e.x, dyp = p.y - e.y;
    const distP = Math.hypot(dxp, dyp);
    const los = distP < 19 && hasLOS(e.x, e.y, p.x, p.y);
    e.los = los;
    e.shootCd -= dt;
    e.strafeTimer -= dt;
    if (e.strafeTimer <= 0) { e.strafe = -e.strafe; e.strafeTimer = rnd(0.9, 2.2); }
    if (e.type === 'warden') { updateWarden(e, dt, distP, los); continue; }
    let dir = null;
    let moveSpeed = def.speed;
    if (def.ranged && los && distP > def.preferredMin && distP < def.preferredMax) {
      const awayX = dxp / (distP || 1), awayY = dyp / (distP || 1);
      const strafeX = -awayY * e.strafe, strafeY = awayX * e.strafe;
      const forward = distP > def.preferredMax - 0.5 ? 0.35 : (distP < def.preferredMin + 0.6 ? -0.6 : 0);
      dir = norm2(strafeX + awayX * forward, strafeY + awayY * forward);
      moveSpeed *= 0.62;
    } else if (def.ranged && los && distP < def.preferredMin) {
      dir = norm2(-dxp, -dyp);
      moveSpeed *= 0.9;
    } else {
      let fd = flowDirection(e);
      if (!fd) fd = norm2(dxp, dyp);
      dir = fd;
      if (los && distP < 4.2 && !def.ranged) dir = norm2(dxp, dyp);
    }
    let sepX = 0, sepY = 0;
    for (const other of game.enemies) {
      if (other === e || other.state !== 'active') continue;
      const ox = e.x - other.x, oy = e.y - other.y;
      const od = Math.hypot(ox, oy);
      const minDist = e.radius + other.radius + 0.2;
      if (od > 0.001 && od < minDist) {
        sepX += ox / od * (minDist - od) * 1.6;
        sepY += oy / od * (minDist - od) * 1.6;
      }
    }
    if (dir) {
      dir = norm2(dir[0] + sepX, dir[1] + sepY);
      const wob = Math.sin(e.anim * 4 + e.seed) * 0.16;
      moveCircle(e, (dir[0] - dir[1] * wob) * moveSpeed * dt, (dir[1] + dir[0] * wob) * moveSpeed * dt, e.radius);
    }
    if (e.type === 'stalker') {
      if (e.charge > 0) {
        e.charge -= dt;
        if (e.charge <= 0) {
          if (los && distP < def.attackRange) fireEnemyProjectile(e, p, def.projectileSpeed, def.damage, 0.02);
          e.shootCd = def.attackCd;
        }
      } else if (e.shootCd <= 0 && los && distP < def.attackRange && distP > 1.4) {
        e.charge = 0.42;
        e.shootCd = def.attackCd + 0.6;
        AudioKit.tone({ freq: 420, end: 620, dur: 0.2, type: 'sawtooth', vol: 0.03 });
      }
    } else if (e.attackCd <= 0 && distP < def.attackRange && hasLOS(e.x, e.y, p.x, p.y)) {
      applyPlayerDamage(def.damage);
      e.attackCd = def.attackCd;
      game.shake = Math.min(12, game.shake + 2.5);
      spawnImpact(0.5 + rnd(-0.12, 0.12), 0.5 + rnd(-0.1, 0.1), '#ff7a60', 3);
    }
  }
}
function updateWarden(e, dt, distP, los) {
  const p = game.player;
  const def = ENEMY_TYPES.warden;
  let dir;
  if (los) {
    const fwd = norm2(p.x - e.x, p.y - e.y);
    const strafe = Math.sin(e.anim * 0.9) * 0.55;
    const advance = distP > def.preferredMax + 1.5 ? 0.8 : (distP < def.preferredMin + 1.5 ? -0.6 : 0);
    dir = norm2(fwd[0] * advance - fwd[1] * strafe, fwd[1] * advance + fwd[0] * strafe);
  } else {
    dir = flowDirection(e) || norm2(p.x - e.x, p.y - e.y);
  }
  let sx = 0, sy = 0;
  for (const other of game.enemies) {
    if (other === e || other.state !== 'active') continue;
    const dx = e.x - other.x, dy = e.y - other.y;
    const d = Math.hypot(dx, dy);
    if (d < 2 && d > 0.001) { sx += dx / d * (2 - d); sy += dy / d * (2 - d); }
  }
  dir = norm2(dir[0] + sx, dir[1] + sy);
  moveCircle(e, dir[0] * def.speed * dt, dir[1] * def.speed * dt, e.radius);
  if (e.charge > 0) {
    e.charge -= dt;
    if (e.charge <= 0) {
      if (los) bossVolley(e);
      e.shootCd = e.enraged ? 1.55 : 2.15;
    }
    return;
  }
  if (e.shootCd <= 0 && los && distP < 18) {
    e.charge = e.enraged ? 0.34 : 0.52;
    AudioKit.bossWarn();
    showAlert('WARDEN CHARGING // BREAK LINE OF SIGHT', 1.0);
    return;
  }
  e.specialCd -= dt;
  if (e.specialCd <= 0) {
    e.specialCd = e.enraged ? 6 : 8.5;
    const base = Math.atan2(p.y - e.y, p.x - e.x);
    for (let i = 0; i < 10; i++) {
      const a = base + (i / 10) * TAU;
      spawnProjectile(e.x, e.y, Math.cos(a) * 2.6, Math.sin(a) * 2.6, 12, true);
    }
    AudioKit.bossShot();
    game.shake = Math.max(game.shake, 4);
    showAlert('WARDEN RADIAL BURST', 1.2);
  }
}
function bossVolley(e) {
  const p = game.player;
  const base = Math.atan2(p.y - e.y, p.x - e.x);
  const n = e.enraged ? 7 : 5;
  for (let i = 0; i < n; i++) {
    const a = base + (i - (n - 1) / 2) * 0.13;
    spawnProjectile(e.x + Math.cos(a) * 0.8, e.y + Math.sin(a) * 0.8, Math.cos(a) * 4.2, Math.sin(a) * 4.2, 11, true);
  }
  AudioKit.bossShot();
  game.shake = Math.max(game.shake, 2.5);
}
function fireEnemyProjectile(e, p, speed, damage, inaccuracy) {
  const a = Math.atan2(p.y - e.y, p.x - e.x) + rnd(-inaccuracy, inaccuracy);
  spawnProjectile(e.x + Math.cos(a) * 0.35, e.y + Math.sin(a) * 0.35, Math.cos(a) * speed, Math.sin(a) * speed, damage, false);
  AudioKit.tone({ freq: 660, end: 190, dur: 0.12, type: 'sawtooth', vol: 0.045 });
}
function spawnProjectile(x, y, vx, vy, damage, bossShot) {
  game.projectiles.push({ x, y, vx, vy, damage, life: 6, bossShot, radius: 0.16 });
}
function updateProjectiles(dt) {
  const p = game.player;
  for (let i = game.projectiles.length - 1; i >= 0; i--) {
    const pr = game.projectiles[i];
    pr.life -= dt;
    const steps = Math.max(1, Math.ceil(Math.hypot(pr.vx * dt, pr.vy * dt) / 0.12));
    let hit = false;
    for (let s = 0; s < steps; s++) {
      pr.x += pr.vx * dt / steps;
      pr.y += pr.vy * dt / steps;
      if (isWall(pr.x, pr.y)) {
        spawnImpact(0.5 + rnd(-0.05, 0.05), 0.5 + rnd(-0.05, 0.05), pr.bossShot ? '#ff7f7f' : '#ffb168', 3);
        hit = true;
        break;
      }
      if (Math.hypot(pr.x - p.x, pr.y - p.y) < p.radius + pr.radius) {
        applyPlayerDamage(pr.damage);
        hit = true;
        break;
      }
    }
    if (hit || pr.life <= 0) game.projectiles.splice(i, 1);
  }
}
function updateFx(dt) {
  for (let i = game.fx.length - 1; i >= 0; i--) {
    const f = game.fx[i];
    f.x += f.vx * dt; f.y += f.vy * dt;
    f.vy += 0.28 * dt;
    f.life -= dt;
    if (f.life <= 0) game.fx.splice(i, 1);
  }
}
function updateGame(dt) {
  game.elapsed += dt;
  updatePlayer(dt);
  updateWave(dt);
  updateEnemies(dt);
  updateProjectiles(dt);
  updateFx(dt);
  game.hudTimer -= dt;
  if (game.hudTimer <= 0) {
    game.hudTimer = 0.075;
    updateHud();
    drawRadar();
  }
  updateScreenDom();
}

/* ============================================================
   CAMERA / SPRITE COLLECTION
   ============================================================ */
function getCamera() {
  const p = game.player;
  const low = p.hp <= 30 && p.hp > 0;
  const pulse = low ? Math.sin(performance.now() / 220) * 0.003 : 0;
  return {
    x: p.x, y: p.y, angle: p.angle,
    pitch: clamp(p.pitch + (p.recoilPitch || 0) + pulse, -0.75, 0.75),
    bob: p.bob, moveAmt: p.moveAmt, shake: game.shake,
  };
}
function collectGameSprites() {
  const sprites = [];
  for (const e of game.enemies) {
    if (e.state === 'dying' && e.dyingT <= 0) continue;
    const def = ENEMY_TYPES[e.type];
    sprites.push({
      kind: 'enemy', type: e.type, x: e.x, y: e.y, art: def.art, height: def.height,
      palette: def.palette, flash: e.hitFlash, dying: e.state === 'dying',
      lift: e.state === 'dying' ? -0.08 : 0,
    });
  }
  for (const portal of game.portals) {
    sprites.push({ kind: 'portal', x: portal.x, y: portal.y, art: PORTAL_ART, height: 1.55, seed: portal.seed, lift: 0.02 });
  }
  for (const pk of game.pickups) {
    const def = PICKUP_TYPES[pk.type];
    sprites.push({
      kind: 'pickup', x: pk.x, y: pk.y, art: def.art, height: 0.2, pickup: def,
      lift: 0.09 + Math.sin(pk.age * 2.2 + pk.bob) * 0.035 + 0.03,
    });
  }
  for (const pr of game.projectiles) {
    sprites.push({
      kind: 'projectile', x: pr.x, y: pr.y, art: pr.bossShot ? BOSS_SHOT_ART : PROJECTILE_ART,
      height: 0.26, floating: true, elev: 0.55, bossShot: pr.bossShot,
    });
  }
  return sprites;
}
function collectTitleSprites(t) {
  const sprites = [];
  for (const te of titleScene.enemies) {
    const def = ENEMY_TYPES[te.type];
    sprites.push({
      kind: 'enemy', type: te.type, x: te.x, y: te.y, art: def.art, height: def.height,
      palette: def.palette, flash: 0, dying: false, lift: 0,
    });
  }
  return sprites;
}

/* ============================================================
   OVERLAYS / RUN SHELL
   ============================================================ */
function requestLock() {
  if (IS_COARSE) return;
  try {
    const maybe = els.canvas.requestPointerLock();
    if (maybe && typeof maybe.catch === 'function') maybe.catch(function () { showLockHintOnce(); });
  } catch (e) {
    try { els.canvas.requestPointerLock(); } catch (err) {}
  }
}
function showLockHintOnce() {
  if (game.lockHintShown) return;
  game.lockHintShown = true;
  toast('POINTER LOCK OFFLINE // 使用 ← → 转向 / 右键拖动', 'red');
  const hint = document.querySelector('.hud-hint');
  if (hint) hint.classList.add('fallback');
  const fallback = document.getElementById('lockFallback');
  if (fallback) fallback.classList.remove('hidden');
}
function hideOverlays() {
  els.title.classList.add('hidden');
  els.pause.classList.add('hidden');
  els.end.classList.add('hidden');
}
function showHud() {
  els.hud.classList.remove('hidden');
  els.hud.classList.remove('dim');
}
function hideHud() { els.hud.classList.add('hidden'); }
function hideBoss() { els.bossBar.classList.add('hidden'); }
function resetHudHint() {
  const hint = document.querySelector('.hud-hint');
  if (hint) hint.classList.remove('fallback');
  const fallback = document.getElementById('lockFallback');
  if (fallback) fallback.classList.add('hidden');
}
function startRun() {
  AudioKit.init();
  AudioKit.resume();
  input.keys.clear();
  game.triggerHeld = false;
  game.triggerPressed = false;
  resetHudHint();
  hideOverlays();
  showHud();
  mode = 'playing';
  game.lockHintShown = false;
  resetRun();
  els.canvas.focus();
  requestLock();
}
function pauseGame() {
  if (mode !== 'playing') return;
  mode = 'paused';
  els.pause.classList.remove('hidden');
  els.hud.classList.add('dim');
  input.keys.clear();
  game.triggerHeld = false;
  game.triggerPressed = false;
  els.pauseWave.textContent = pad(game.wave || 1, 2);
  els.pauseScore.textContent = pad(game.score, 7);
  els.pauseTime.textContent = fmtTime(game.elapsed);
  if (document.pointerLockElement) document.exitPointerLock();
  AudioKit.click(330, 0.08, 0.04);
}
function resumeGame() {
  if (mode !== 'paused') return;
  AudioKit.init();
  AudioKit.resume();
  els.pause.classList.add('hidden');
  els.hud.classList.remove('dim');
  mode = 'playing';
  requestLock();
  AudioKit.click(720, 0.06, 0.05);
}
function returnToTitle() {
  mode = 'title';
  input.keys.clear();
  game.triggerHeld = false;
  game.triggerPressed = false;
  if (els.toastFeed) els.toastFeed.innerHTML = '';
  if (els.pickupFeed) els.pickupFeed.innerHTML = '';
  if (document.pointerLockElement) document.exitPointerLock();
  hideOverlays();
  hideHud();
  els.title.classList.remove('hidden');
  els.hud.classList.remove('dim');
  hideBoss();
  clearCenter();
  showAlert('', 0);
  els.endModal.classList.remove('victory');
  updateBestLabel();
  titleTime = 0;
  AudioKit.click(320, 0.08, 0.04);
}
function getBest() {
  try {
    const raw = localStorage.getItem('nullsector.best');
    if (!raw) return null;
    const b = JSON.parse(raw);
    if (typeof b.score === 'number') return b;
  } catch (e) {}
  return null;
}
function updateBestLabel() {
  const b = getBest();
  els.bestScore.textContent = b
    ? 'BEST RUN // SECTOR ' + pad(b.wave || 1, 2) + ' / ' + pad(b.score, 7) + ' PTS'
    : 'BEST RUN // ---';
}
function saveBestIfNeeded(victory) {
  const b = getBest();
  const record = { score: game.score, wave: victory ? MAX_WAVE : game.wave, kills: game.kills, time: game.elapsed, victory: victory };
  if (!b || record.score > b.score) {
    try { localStorage.setItem('nullsector.best', JSON.stringify(record)); } catch (e) {}
    return true;
  }
  return false;
}
function showEnd(victory) {
  mode = victory ? 'victory' : 'dead';
  if (document.pointerLockElement) document.exitPointerLock();
  const isRecord = saveBestIfNeeded(victory);
  game.triggerHeld = false;
  game.triggerPressed = false;
  if (els.toastFeed) els.toastFeed.innerHTML = '';
  els.end.classList.remove('hidden');
  els.hud.classList.add('dim');
  hideBoss();
  els.endModal.classList.toggle('victory', victory);
  if (victory) {
    els.endTop.textContent = 'CORE LINK RESTORED';
    els.endCode.textContent = 'ALL_SECTORS_PURGED';
    els.endGlyph.textContent = '[ OK ]';
    els.endTitle.textContent = 'CORE RESTORED';
    els.endSub.textContent = 'AUDIT DAEMON VICTORIOUS // THE HAB-RING IS SILENT';
  } else {
    els.endTop.textContent = 'CONNECTION TERMINATED';
    els.endCode.textContent = 'ERR_SIGNAL_LOST';
    els.endGlyph.textContent = '[ X ]';
    els.endTitle.textContent = 'SIGNAL LOST';
    els.endSub.textContent = 'AUDIT DAEMON OFFLINE // THE SECTOR REMAINS HOSTILE';
  }
  els.endWave.textContent = victory ? pad(MAX_WAVE, 2) + '/' + pad(MAX_WAVE, 2) : pad(game.wave || 1, 2);
  els.endKills.textContent = pad(game.kills, 3);
  els.endScore.textContent = pad(game.score, 7);
  els.endTime.textContent = fmtTime(game.elapsed);
  els.endRecord.classList.toggle('hidden', !isRecord);
  updateBestLabel();
  clearCenter();
  showAlert('', 0);
}
function updateTransitions(dt) {
  if (mode === 'dying') {
    game.deathT += dt;
    updateFx(dt);
    game.damageFlash = Math.max(0.25, game.damageFlash - dt * 0.45);
    game.shake = Math.max(0, game.shake - dt * 5);
    updateScreenDom();
    if (game.deathT > 1.7) showEnd(false);
  } else if (mode === 'victory-transition') {
    game.victoryT += dt;
    updateFx(dt);
    game.flash = Math.max(0, game.flash - dt * 1.2);
    game.shake = Math.max(0, game.shake - dt * 4);
    updateScreenDom();
    if (game.victoryT > 2.1) showEnd(true);
  }
}
function deathCamera() {
  const p = game.player;
  const t = clamp(game.deathT / 1.7, 0, 1);
  return {
    x: p.x, y: p.y, angle: p.angle + t * 0.35,
    pitch: lerp(p.pitch, -0.6, t), bob: p.bob, moveAmt: 0.2, shake: game.shake,
  };
}
function victoryCamera() {
  const p = game.player;
  const t = clamp(game.victoryT / 2.1, 0, 1);
  return {
    x: p.x, y: p.y, angle: p.angle + Math.sin(t * 3) * 0.05 * (1 - t),
    pitch: p.pitch + 0.025, bob: p.bob, moveAmt: 0, shake: game.shake,
  };
}

/* ============================================================
   INPUT
   ============================================================ */
function bindInput() {
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
      if (mode === 'playing') { e.preventDefault(); pauseGame(); }
      else if (mode === 'paused') { e.preventDefault(); resumeGame(); }
      return;
    }
    if (e.code === 'KeyM') {
      AudioKit.init(); AudioKit.toggleMute();
      return;
    }
    if (e.code === 'KeyF' && mode !== 'title') {
      e.preventDefault();
      toggleFullscreen();
      return;
    }
    if (mode === 'title') {
      if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); startRun(); }
      return;
    }
    if (mode === 'paused') {
      if (e.code === 'Enter') { e.preventDefault(); resumeGame(); }
      return;
    }
    if (mode === 'dead' || mode === 'victory') {
      if (e.code === 'Enter') { e.preventDefault(); startRun(); }
      return;
    }
    if (mode !== 'playing') return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) tryDash();
      return;
    }
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].indexOf(e.code) !== -1) {
      if (e.code.indexOf('Arrow') === 0) e.preventDefault();
      input.keys.add(e.code);
    }
    if (e.repeat) return;
    if (e.code === 'KeyR') startReload();
    if (e.code === 'Digit1') switchWeapon('pulse');
    if (e.code === 'Digit2') switchWeapon('scatter');
    if (e.code === 'KeyQ') switchWeapon(game.weapon === 'pulse' ? 'scatter' : 'pulse');
  });
  window.addEventListener('keyup', (e) => { input.keys.delete(e.code); });
  window.addEventListener('mousemove', (e) => {
    if (mode !== 'playing') return;
    if (pointerLocked || fallbackDragging) {
      const p = game.player;
      const sens = pointerLocked ? 0.00215 : 0.004;
      p.angle += (e.movementX || 0) * sens;
      p.pitch = clamp(p.pitch - (e.movementY || 0) * sens, -0.52, 0.52);
    }
  });
  window.addEventListener('mousedown', (e) => {
    if (mode !== 'playing') return;
    if (e.button === 0) {
      game.triggerHeld = true;
      game.triggerPressed = true;
      if (!pointerLocked && !hadPointerLock && !IS_COARSE) requestLock();
    } else if (e.button === 2) {
      fallbackDragging = true;
    }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) { game.triggerHeld = false; game.triggerPressed = false; }
    if (e.button === 2) fallbackDragging = false;
  });
  window.addEventListener('contextmenu', (e) => { if (mode !== 'title') e.preventDefault(); });
  window.addEventListener('wheel', () => {
    if (mode !== 'playing') return;
    switchWeapon(game.weapon === 'pulse' ? 'scatter' : 'pulse');
  }, { passive: true });
  window.addEventListener('pointerlockchange', () => {
    pointerLocked = document.pointerLockElement === els.canvas;
    if (pointerLocked) {
      hadPointerLock = true;
      if (els.startError) els.startError.classList.add('hidden');
      const lf = document.getElementById('lockFallback');
      if (lf) lf.classList.add('hidden');
      const hh = document.querySelector('.hud-hint');
      if (hh) hh.classList.remove('fallback');
    }
    else if (mode === 'playing' && hadPointerLock) pauseGame();
  });
  document.addEventListener('pointerlockerror', showLockHintOnce);
  document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'playing') pauseGame(); });
  window.addEventListener('blur', () => {
    input.keys.clear();
    if (mode === 'playing') pauseGame();
  });
  window.addEventListener('resize', () => {
    clearTimeout(window.__resizeTimer);
    window.__resizeTimer = setTimeout(() => { renderer.resize(); drawRadar(); }, 90);
  });
  els.startBtn.addEventListener('click', startRun);
  els.resumeBtn.addEventListener('click', resumeGame);
  els.quitBtn.addEventListener('click', returnToTitle);
  els.rebootBtn.addEventListener('click', startRun);
  els.endTitleBtn.addEventListener('click', returnToTitle);
  els.canvas.addEventListener('click', () => { if (mode === 'playing' && !pointerLocked) requestLock(); });
  window.addEventListener('pointerdown', () => { AudioKit.resume(); }, { passive: true });
}
function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
  } catch (e) {}
}

/* ============================================================
   TITLE EXTRAS
   ============================================================ */
function makeNoiseTexture() {
  try {
    const c = document.createElement('canvas');
    c.width = 180; c.height = 180;
    const g = c.getContext('2d');
    const img = g.createImageData(180, 180);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = v * 0.6;
      img.data[i + 1] = v;
      img.data[i + 2] = v * 0.7;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    els.noiseLayer.style.backgroundImage = 'url(' + c.toDataURL() + ')';
  } catch (e) {}
}
function updateTitleClock() {
  const d = new Date();
  els.titleClock.textContent = '2087.' + pad(d.getMonth() + 1, 2) + '.' + pad(d.getDate(), 2) + ' \u2014 ' +
    pad(d.getHours(), 2) + ':' + pad(d.getMinutes(), 2) + ':' + pad(d.getSeconds(), 2);
}
function tickBootLog() {
  if (!els.bootLog) return;
  const lines = els.bootLog.children;
  for (let i = 0; i < lines.length; i++) {
    lines[i].style.opacity = '0';
    (function (el, delay) {
      setTimeout(function () {
        el.style.transition = 'opacity .16s';
        el.style.opacity = '1';
      }, delay);
    })(lines[i], 200 + i * 95);
  }
}

/* ============================================================
   MAIN LOOP
   ============================================================ */
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  updateFps(dt);
  if (mode === 'title') {
    titleTime += dt;
    renderer.render(makeTitleCamera(titleTime), collectTitleSprites(titleTime), { noWeapon: true });
    return;
  }
  if (mode === 'playing') {
    updateGame(dt);
    if (mode !== 'playing') return;
    renderer.render(getCamera(), collectGameSprites(), {
      drawFx: game.fx,
      weapon: {
        art: WEAPONS[game.weapon].art,
        kick: Math.min(4, game.weaponKick),
        reloadDip: game.reload > 0 ? Math.sin(clamp(1 - game.reload / WEAPONS[game.reloadWeapon || game.weapon].reloadTime, 0, 1) * Math.PI) * 4.2 : 0,
        switchDip: game.switchDip,
        flash: game.muzzle,
        flashBig: game.weapon === 'scatter',
        sway: Math.sin(game.elapsed * 1.7) * 0.5 * game.player.moveAmt,
      },
    });
    return;
  }
  if (mode === 'dying') {
    updateTransitions(dt);
    renderer.render(deathCamera(), collectGameSprites(), { noWeapon: true, drawFx: game.fx });
    return;
  }
  if (mode === 'victory-transition') {
    updateTransitions(dt);
    renderer.render(victoryCamera(), collectGameSprites(), { noWeapon: true, drawFx: game.fx });
    return;
  }
  if (mode === 'paused') {
    renderer.render(getCamera(), collectGameSprites(), {
      drawFx: game.fx,
      weapon: {
        art: WEAPONS[game.weapon].art, kick: 0, reloadDip: 0, switchDip: game.switchDip,
        flash: 0, flashBig: false, sway: 0,
      },
    });
    return;
  }
  renderer.render(getCamera(), collectGameSprites(), { noWeapon: true, drawFx: game.fx });
}

/* ============================================================
   BOOT + DEBUG HOOKS
   ============================================================ */
function boot() {
  makeNoiseTexture();
  tickBootLog();
  updateTitleClock();
  setInterval(updateTitleClock, 1000);
  updateBestLabel();
  bindInput();
  renderer.resize();
  drawRadar();
  lastFrame = performance.now();
  requestAnimationFrame(loop);

  const api = {
    get mode() { return mode; },
    get game() { return game; },
    get renderer() { return renderer; },
    start(wave) {
      startRun();
      if (wave && wave > 1) {
        game.intermission = 0;
        startWave(wave);
      }
      return true;
    },
    pause: pauseGame,
    resume: resumeGame,
    setPlayer(x, y, angle, pitch) {
      if (!game.player) return;
      game.player.x = x; game.player.y = y;
      if (angle !== undefined) game.player.angle = angle;
      game.player.pitch = pitch === undefined ? game.player.pitch : pitch;
    },
    giveAmmo(pulse, scatter) {
      if (!game.ammo) return;
      game.ammo.pulse.reserve = pulse === undefined ? 300 : pulse;
      game.ammo.scatter.reserve = scatter === undefined ? 60 : scatter;
    },
    spawn(type, x, y) {
      if (!game.player) return false;
      const def = ENEMY_TYPES[type];
      if (!def) return false;
      const p = game.player;
      game.enemies.push({
        type: type, x: x === undefined ? p.x + 3 : x, y: y === undefined ? p.y : y,
        hp: def.hp, maxHp: def.hp, radius: def.radius, state: 'active',
        anim: rnd(0, TAU), attackCd: 1.5, shootCd: 1.8, charge: 0, hitFlash: 0,
        dyingT: 0, stun: 0, strafe: 1, strafeTimer: 1, los: false, seed: rnd(0, 1000),
        angle: 0, enraged: false, specialCd: 7.5,
      });
      return true;
    },
    setWave(n) {
      if (mode !== 'playing') return;
      game.waveActive = false;
      game.intermission = 0;
      game.spawnQueue = [];
      game.portals = [];
      startWave(n);
    },
    killAll() {
      for (const e of game.enemies) if (e.state === 'active') killEnemy(e);
    },
    damage(amount) { applyPlayerDamage(amount); },
    heal(amount) { if (game.player) game.player.hp = Math.min(game.player.maxHp, game.player.hp + amount); },
    setGod(v) { window.__godMode = !!v; },
    addScore(n) { game.score += n; updateHud(true); },
    clearEnemies() { game.enemies = []; game.projectiles = []; },
    screenshotCamera() { return getCamera(); },
  };
  window.NULLSECTOR = api;
  window.__NS__ = api;
  if (PARAMS.has('autostart')) {
    setTimeout(() => {
      try { api.start(parseInt(PARAMS.get('wave') || '1', 10) || 1); } catch (e) {}
    }, 150);
  }
}
boot();
})();
