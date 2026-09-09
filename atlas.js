(() => {
  "use strict";

  /* ============================================================
     Pass the Atlas — doodle cartography, then survive it
     ============================================================ */

  const COLORS = ["#1d4e89", "#9b2226", "#2d6a4f", "#9c6644", "#6a4c93", "#0077b6"];
  const NAMES = ["Maple", "Ink", "Thorn", "Pip", "Soot", "Cinder"];
  const SIZES = [
    { id: "scrap", label: "Scrap 16×12", w: 16, h: 12 },
    { id: "atlas", label: "Atlas 22×14", w: 22, h: 14 },
    { id: "mural", label: "Mural 28×18", w: 28, h: 18 },
  ];
  const MODES = [
    { id: "relay", label: "Relay (pass on death)" },
    { id: "gauntlet", label: "Gauntlet (everyone runs)" },
  ];
  const TIMES = [
    { id: 0, label: "No clock" },
    { id: 75, label: "75 seconds" },
    { id: 45, label: "45 seconds" },
  ];
  const INK = [16, 11, 9];
  const CHAPTERS = [
    { id: 1, name: "Land", roman: "I", blurb: "Paint the ground. Rivers, meadows, magma, ice." },
    { id: 2, name: "Fixtures", roman: "II", blurb: "Raise walls, lock doors, hide chests, light fires." },
    { id: 3, name: "Life", roman: "III", blurb: "Stock monsters and treasure. Be a little cruel." },
  ];

  const TILE = {
    empty:  { layer: "ground", ch: 1, cost: 1, name: "Paper",   desc: "Bare notebook. Walkable.", walk: 1, friction: 0.78 },
    grass:  { layer: "ground", ch: 1, cost: 1, name: "Grass",   desc: "A scribbled meadow.", walk: 1, friction: 0.78 },
    path:   { layer: "ground", ch: 1, cost: 1, name: "Path",    desc: "Packed dirt trail. Slightly faster.", walk: 1.12, friction: 0.8 },
    dirt:   { layer: "ground", ch: 1, cost: 1, name: "Dirt",    desc: "Turned earth.", walk: 1, friction: 0.76 },
    sand:   { layer: "ground", ch: 1, cost: 1, name: "Sand",    desc: "Slow, whispery.", walk: 0.72, friction: 0.7 },
    water:  { layer: "ground", ch: 1, cost: 1, name: "Water",   desc: "Wade slowly. Dash fizzles.", walk: 0.38, friction: 0.86, swim: true },
    ice:    { layer: "ground", ch: 1, cost: 1, name: "Ice",     desc: "You will slide. That is the point.", walk: 1.15, friction: 0.985 },
    forest: { layer: "ground", ch: 1, cost: 1, name: "Forest",  desc: "Slow going. Bats lose interest a little.", walk: 0.7, friction: 0.75, cover: true },
    stone:  { layer: "ground", ch: 1, cost: 1, name: "Stone",   desc: "Cool flagstones.", walk: 1, friction: 0.8 },
    lava:   { layer: "ground", ch: 1, cost: 1, name: "Lava",    desc: "Hurts every beat you stand in it.", walk: 0.55, friction: 0.7, burn: true },
    pit:    { layer: "ground", ch: 1, cost: 1, name: "Pit",     desc: "Step in, fall out of the story.", walk: 1, friction: 0.7, fall: true },

    wall:     { layer: "fix", ch: 2, cost: 1, name: "Wall",     desc: "Solid scribble. Blocks everything.", block: true },
    fence:    { layer: "fix", ch: 2, cost: 1, name: "Fence",    desc: "Blocks walking, not bats.", block: true, airy: true },
    door:     { layer: "fix", ch: 2, cost: 1, name: "Door",     desc: "Needs a key. Eats the key.", block: true, door: true },
    bridge:   { layer: "fix", ch: 2, cost: 1, name: "Bridge",   desc: "Walk over water (and lava, if you dare).", bridge: true },
    spawn:    { layer: "fix", ch: 2, cost: 1, name: "Spawn",    desc: "Where the expedition begins. One only." },
    exit:     { layer: "fix", ch: 2, cost: 1, name: "Exit",     desc: "The way out. Place at least one." },
    chest:    { layer: "fix", ch: 2, cost: 1, name: "Chest",    desc: "Open with E. Maybe coins. Maybe a key." },
    sign:     { layer: "fix", ch: 2, cost: 1, name: "Sign",     desc: "Leave a note for whoever plays." },
    campfire: { layer: "fix", ch: 2, cost: 1, name: "Campfire", desc: "Checkpoint and a little heal." },
    portal:   { layer: "fix", ch: 2, cost: 1, name: "Portal",   desc: "All portals form a loop." },
    bounce:   { layer: "fix", ch: 2, cost: 1, name: "Bounce",   desc: "Launches you the way you were going." },
    conveyor: { layer: "fix", ch: 2, cost: 1, name: "Conveyor", desc: "Click again to spin its direction." },
    spikes:   { layer: "fix", ch: 2, cost: 1, name: "Spikes",   desc: "Painful punctuation." },

    slime:  { layer: "mob", ch: 3, cost: 2, name: "Slime",  desc: "Bounces east-west. Squishable." },
    bat:    { layer: "mob", ch: 3, cost: 2, name: "Bat",    desc: "Notices you. Hunts you." },
    knight: { layer: "mob", ch: 3, cost: 2, name: "Knight", desc: "Charges down rows and columns." },
    mimic:  { layer: "mob", ch: 3, cost: 2, name: "Mimic",  desc: "Looks like a chest until it doesn't." },
    coin:   { layer: "item", ch: 3, cost: 1, name: "Coin",   desc: "Ten points and a nice clink." },
    key:    { layer: "item", ch: 3, cost: 1, name: "Key",    desc: "Opens one door." },
    heart:  { layer: "item", ch: 3, cost: 1, name: "Heart",  desc: "A spare life, sort of." },
    star:   { layer: "item", ch: 3, cost: 1, name: "Star",   desc: "Fifty points of showing off." },
    potion: { layer: "item", ch: 3, cost: 1, name: "Potion", desc: "A brief, illegal amount of speed." },
    flower: { layer: "item", ch: 3, cost: 1, name: "Flower", desc: "Decoration. Harmless. Suspicious." },
  };

  const GROUND_ORDER = ["grass","path","dirt","sand","water","ice","forest","stone","lava","pit","empty"];
  const FIX_ORDER = ["wall","fence","door","bridge","spawn","exit","chest","sign","campfire","portal","bounce","conveyor","spikes"];
  const LIFE_ORDER = ["slime","bat","knight","mimic","coin","key","heart","star","potion","flower"];

  /* ---------- tiny rng / sketch ---------- */
  function hash(n) {
    n = Math.imul(n ^ 0x7f4a7c15, 0x27d4eb2d);
    n = n ^ (n >>> 15);
    return (n >>> 0) / 4294967296;
  }
  function seed2(x, y, k = 0) {
    return hash((x * 73856093) ^ (y * 19349663) ^ (k * 83492791) ^ 1234567);
  }
  function wobble(ctx, x1, y1, x2, y2, s, rough = 1.15) {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const steps = Math.max(2, Math.floor(len / 7));
    const nx = -dy / len, ny = dx / len;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const off = (seed2(s, i) - 0.5) * rough * 2.6;
      ctx.lineTo(x1 + dx * t + nx * off, y1 + dy * t + ny * off);
    }
    ctx.stroke();
  }
  function sketchCircle(ctx, x, y, r, s, rough = 1) {
    ctx.beginPath();
    const n = 14;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const j = (seed2(s, i) - 0.5) * rough * 1.6;
      const px = x + Math.cos(a) * (r + j);
      const py = y + Math.sin(a) * (r + j);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  function hachure(ctx, x, y, w, h, s, color, gap = 5, ang = -0.6) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    const c = Math.cos(ang), si = Math.sin(ang);
    const span = w + h + 20;
    for (let i = -span; i < span; i += gap) {
      const o = (seed2(s, i) - 0.5) * 1.4;
      ctx.beginPath();
      ctx.moveTo(x + i * c + o, y + i * si);
      ctx.lineTo(x + i * c + span * -si + o, y + i * si + span * c);
      ctx.stroke();
    }
    ctx.restore();
  }
  function ink(ctx, color, w = 1.6) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = w;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }

  /* ---------- audio (tiny paper synth) ---------- */
  let AC = null;
  function audio() {
    if (!AC) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      AC = new Ctx();
    }
    if (AC.state === "suspended") AC.resume();
    return AC;
  }
  function beep(freq, dur, type = "triangle", vol = 0.06, slide = 0) {
    const ac = audio(); if (!ac) return;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type; o.frequency.value = freq;
    if (slide) o.frequency.linearRampToValueAtTime(freq + slide, ac.currentTime + dur);
    g.gain.value = vol;
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    o.connect(g).connect(ac.destination);
    o.start(); o.stop(ac.currentTime + dur);
  }
  function noise(dur = 0.08, vol = 0.04, freq = 900) {
    const ac = audio(); if (!ac) return;
    const n = ac.createBuffer(1, ac.sampleRate * dur, ac.sampleRate);
    const d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource(); src.buffer = n;
    const f = ac.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq;
    const g = ac.createGain(); g.gain.value = vol;
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    src.connect(f).connect(g).connect(ac.destination);
    src.start();
  }
  const SFX = {
    pencil() { noise(0.05, 0.05, 1800); },
    place() { beep(420, 0.05, "square", 0.04); noise(0.04, 0.03, 1200); },
    pass() { beep(330, 0.12, "sine", 0.05); beep(494, 0.18, "sine", 0.04); },
    coin(n = 0) { beep(880 + n * 40, 0.08, "square", 0.05, 200); },
    hit() { noise(0.12, 0.08, 300); beep(140, 0.1, "sawtooth", 0.05); },
    win() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.16, "triangle", 0.05), i * 110)); },
    die() { beep(220, 0.3, "sawtooth", 0.05, -120); },
    page() { noise(0.18, 0.05, 700); },
    slash() { noise(0.07, 0.05, 1400); beep(600, 0.06, "square", 0.03, -200); },
  };

  /* ---------- game state ---------- */
  const state = {
    screen: "title",
    players: [],
    size: SIZES[1],
    mode: "relay",
    turnTime: 0,
    chapter: 1,
    turn: 0,
    ink: 16,
    inkMax: 16,
    tool: "grass",
    erase: false,
    grid: true,
    map: { w: 22, h: 14, cells: [] },
    undo: [],
    view: { x: 0, y: 0, z: 1 },
    dragging: false,
    panning: false,
    lastCell: null,
    hover: null,
    clock: 0,
    play: null,
    scores: [],
    runIndex: 0,
    share: "",
  };

  function cellsNow() {
    if (state.screen === "play" && state.play) return state.play.world;
    return state.map.cells;
  }
  function cell(x, y) {
    if (x < 0 || y < 0 || x >= state.map.w || y >= state.map.h) return null;
    return state.map.cells[y * state.map.w + x];
  }
  function makeCell() {
    return { g: "empty", f: null, m: null, i: null, a: -1, note: "", dir: 0, open: false };
  }
  function newMap(w, h) {
    state.map = { w, h, cells: Array.from({ length: w * h }, makeCell) };
  }
  function snapshot() {
    return JSON.stringify(state.map.cells);
  }
  function pushUndo() {
    state.undo.push(snapshot());
    if (state.undo.length > 80) state.undo.shift();
  }
  function undo() {
    const s = state.undo.pop();
    if (!s) return;
    state.map.cells = JSON.parse(s);
    dirtyAll();
    SFX.pencil();
  }

  /* ---------- tile drawing (cached per cell) ---------- */
  const TS = 48;
  let worldCache = null, worldDirty = true, dirtySet = new Set();

  function dirtyAll() { worldDirty = true; dirtySet.clear(); }
  function dirtyCell(x, y) { dirtySet.add(y * 1000 + x); }

  function ensureCache() {
    const w = state.map.w * TS, h = state.map.h * TS;
    if (!worldCache || worldCache.width !== w || worldCache.height !== h) {
      worldCache = document.createElement("canvas");
      worldCache.width = w; worldCache.height = h;
      dirtyAll();
    }
    if (worldDirty) {
      const ctx = worldCache.getContext("2d");
      paintPaper(ctx, 0, 0, w, h);
      const cells = cellsNow();
      for (let y = 0; y < state.map.h; y++)
        for (let x = 0; x < state.map.w; x++) drawCell(ctx, x, y, cells[y * state.map.w + x]);
      worldDirty = false; dirtySet.clear();
    } else if (dirtySet.size) {
      const ctx = worldCache.getContext("2d");
      const cells = cellsNow();
      dirtySet.forEach((k) => {
        const x = k % 1000, y = (k - x) / 1000;
        paintPaper(ctx, x * TS, y * TS, TS, TS);
        drawCell(ctx, x, y, cells[y * state.map.w + x]);
      });
      dirtySet.clear();
    }
  }
  function paintPaper(ctx, x, y, w, h) {
    ctx.fillStyle = "#f3e6c4";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(70,50,30,0.07)";
    ctx.lineWidth = 1;
    for (let gx = x - (x % 24); gx < x + w; gx += 24) {
      ctx.beginPath(); ctx.moveTo(gx + 0.5, y); ctx.lineTo(gx + 0.5, y + h); ctx.stroke();
    }
    for (let gy = y - (y % 24); gy < y + h; gy += 24) {
      ctx.beginPath(); ctx.moveTo(x, gy + 0.5); ctx.lineTo(x + w, gy + 0.5); ctx.stroke();
    }
  }

  function drawCell(ctx, x, y, c) {
    if (!c) c = cell(x, y);
    if (!c) return;
    const px = x * TS, py = y * TS, s = seed2(x, y, 9) * 1000 | 0;
    drawGround(ctx, c.g, px, py, s);
    if (c.f) drawFix(ctx, c, px, py, s + 3);
    if (c.i) drawItem(ctx, c.i, px, py, s + 7);
    if (c.m) drawMobIcon(ctx, c.m, px, py, s + 11);
    if (c.a >= 0 && state.players[c.a]) {
      ctx.fillStyle = state.players[c.a].color;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(px + 6, py + 6, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawGround(ctx, g, x, y, s) {
    const pad = 2;
    if (g === "empty") return;
    if (g === "grass") {
      hachure(ctx, x, y, TS, TS, s, "rgba(70,120,50,0.28)", 6, -0.7);
      ink(ctx, "#3d6b2f", 1.3);
      for (let i = 0; i < 7; i++) {
        const gx = x + 6 + seed2(s, i) * (TS - 12);
        const gy = y + 10 + seed2(s, i + 40) * (TS - 14);
        wobble(ctx, gx, gy, gx + 1, gy - 6 - seed2(s, i + 3) * 5, s + i, 0.8);
      }
    } else if (g === "path") {
      hachure(ctx, x + 4, y + 4, TS - 8, TS - 8, s, "rgba(150,110,60,0.35)", 5, 0.2);
      ink(ctx, "#7a5a32", 1.4);
      sketchCircle(ctx, x + 14, y + 18, 2, s, 0.6);
      sketchCircle(ctx, x + 30, y + 28, 1.6, s + 2, 0.6);
    } else if (g === "dirt") {
      hachure(ctx, x, y, TS, TS, s, "rgba(120,80,40,0.35)", 5, 0.9);
    } else if (g === "sand") {
      hachure(ctx, x, y, TS, TS, s, "rgba(200,170,80,0.35)", 7, 0.1);
      ink(ctx, "#c2a04a", 1);
      for (let i = 0; i < 5; i++) ctx.fillRect(x + 8 + i * 7, y + 10 + seed2(s, i) * 24, 1.5, 1.5);
    } else if (g === "water") {
      hachure(ctx, x, y, TS, TS, s, "rgba(50,110,170,0.28)", 6, 0);
      ink(ctx, "#2a6a96", 1.4);
      for (let i = 0; i < 3; i++) {
        const yy = y + 12 + i * 12;
        wobble(ctx, x + 6, yy, x + TS - 6, yy + (seed2(s, i) - 0.5) * 4, s + i, 1.3);
      }
    } else if (g === "ice") {
      hachure(ctx, x, y, TS, TS, s, "rgba(140,190,220,0.4)", 5, 0.8);
      ink(ctx, "#6aa0c8", 1.3);
      wobble(ctx, x + 8, y + 10, x + 20, y + 22, s, 0.7);
      wobble(ctx, x + 28, y + 14, x + 36, y + 30, s + 1, 0.7);
    } else if (g === "forest") {
      hachure(ctx, x, y, TS, TS, s, "rgba(40,90,40,0.25)", 6, -0.5);
      ink(ctx, "#2f5a28", 1.5);
      for (let i = 0; i < 3; i++) {
        const tx = x + 12 + i * 12, ty = y + 30;
        wobble(ctx, tx, ty, tx, ty - 10, s + i);
        ctx.beginPath();
        ctx.moveTo(tx, ty - 22);
        ctx.lineTo(tx - 8, ty - 8);
        ctx.lineTo(tx + 8, ty - 8);
        ctx.closePath(); ctx.stroke();
      }
    } else if (g === "stone") {
      hachure(ctx, x, y, TS, TS, s, "rgba(90,90,95,0.28)", 5, 0.4);
      ink(ctx, "#55555c", 1.4);
      wobble(ctx, x + 6, y + TS / 2, x + TS - 6, y + TS / 2, s);
      wobble(ctx, x + TS / 2, y + 6, x + TS / 2, y + TS - 6, s + 2);
    } else if (g === "lava") {
      hachure(ctx, x, y, TS, TS, s, "rgba(200,70,20,0.4)", 5, 0.3);
      ink(ctx, "#c43c12", 1.5);
      sketchCircle(ctx, x + 16, y + 18, 5, s, 1.2);
      sketchCircle(ctx, x + 32, y + 28, 4, s + 4, 1);
    } else if (g === "pit") {
      ink(ctx, "#241c14", 1.8);
      sketchCircle(ctx, x + TS / 2, y + TS / 2, 14, s, 1.2);
      hachure(ctx, x + 10, y + 10, 28, 28, s, "rgba(20,10,5,0.45)", 4, 0.9);
    }
    void pad;
  }

  function drawFix(ctx, c, x, y, s) {
    const f = c.f;
    const cx = x + TS / 2, cy = y + TS / 2;
    if (f === "wall") {
      hachure(ctx, x + 4, y + 4, TS - 8, TS - 8, s, "rgba(50,40,30,0.45)", 4, -0.5);
      ink(ctx, "#241c14", 2);
      wobble(ctx, x + 5, y + 5, x + TS - 5, y + 5, s);
      wobble(ctx, x + TS - 5, y + 5, x + TS - 5, y + TS - 5, s + 1);
      wobble(ctx, x + TS - 5, y + TS - 5, x + 5, y + TS - 5, s + 2);
      wobble(ctx, x + 5, y + TS - 5, x + 5, y + 5, s + 3);
    } else if (f === "fence") {
      ink(ctx, "#6b4226", 1.8);
      wobble(ctx, x + 10, y + 8, x + 10, y + 40, s);
      wobble(ctx, x + 38, y + 8, x + 38, y + 40, s + 1);
      wobble(ctx, x + 8, y + 18, x + 40, y + 18, s + 2);
      wobble(ctx, x + 8, y + 30, x + 40, y + 30, s + 3);
    } else if (f === "door") {
      ink(ctx, c.open ? "#6b4226" : "#5a2e12", 2);
      wobble(ctx, x + 12, y + 8, x + 12, y + 42, s);
      wobble(ctx, x + 36, y + 8, x + 36, y + 42, s + 1);
      wobble(ctx, x + 12, y + 8, x + 36, y + 8, s + 2);
      if (!c.open) sketchCircle(ctx, x + 30, y + 26, 2.2, s, 0.5);
    } else if (f === "bridge") {
      ink(ctx, "#7a5230", 2);
      wobble(ctx, x + 6, y + 16, x + 42, y + 16, s);
      wobble(ctx, x + 6, y + 32, x + 42, y + 32, s + 1);
      for (let i = 0; i < 4; i++) wobble(ctx, x + 10 + i * 8, y + 16, x + 10 + i * 8, y + 32, s + 2 + i, 0.6);
    } else if (f === "spawn") {
      ink(ctx, "#1d4e89", 2);
      sketchCircle(ctx, cx, cy, 12, s, 1);
      ctx.font = "16px Permanent Marker";
      ctx.fillStyle = "#1d4e89";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("S", cx, cy + 1);
    } else if (f === "exit") {
      ink(ctx, "#2d6a4f", 2);
      wobble(ctx, x + 10, y + 10, x + 38, y + 10, s);
      wobble(ctx, x + 38, y + 10, x + 38, y + 38, s + 1);
      wobble(ctx, x + 38, y + 38, x + 10, y + 38, s + 2);
      wobble(ctx, x + 10, y + 38, x + 10, y + 10, s + 3);
      ctx.font = "15px Permanent Marker";
      ctx.fillStyle = "#2d6a4f";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("E", cx, cy);
    } else if (f === "chest") {
      drawChest(ctx, x, y, s, c.open);
    } else if (f === "sign") {
      ink(ctx, "#6b4226", 1.8);
      wobble(ctx, cx, y + 40, cx, y + 22, s);
      ctx.fillStyle = "#f7edd2";
      ctx.fillRect(x + 10, y + 8, 28, 16);
      ink(ctx, "#241c14", 1.4);
      wobble(ctx, x + 10, y + 8, x + 38, y + 8, s + 1);
      wobble(ctx, x + 38, y + 8, x + 38, y + 24, s + 2);
      wobble(ctx, x + 38, y + 24, x + 10, y + 24, s + 3);
      wobble(ctx, x + 10, y + 24, x + 10, y + 8, s + 4);
    } else if (f === "campfire") {
      ink(ctx, "#6b4226", 1.7);
      wobble(ctx, x + 12, y + 34, x + 36, y + 34, s);
      ink(ctx, "#c43c12", 1.8);
      wobble(ctx, cx, y + 32, cx - 6, y + 16, s + 1);
      wobble(ctx, cx, y + 32, cx + 6, y + 14, s + 2);
      wobble(ctx, cx, y + 32, cx, y + 12, s + 3);
    } else if (f === "portal") {
      ink(ctx, "#6a4c93", 2);
      sketchCircle(ctx, cx, cy, 14, s, 1.2);
      sketchCircle(ctx, cx, cy, 8, s + 4, 1);
      hachure(ctx, x + 12, y + 12, 24, 24, s, "rgba(106,76,147,0.35)", 4, 0.7);
    } else if (f === "bounce") {
      ink(ctx, "#9c6644", 2);
      sketchCircle(ctx, cx, cy, 12, s, 1);
      wobble(ctx, cx - 6, cy + 2, cx, cy - 8, s + 1);
      wobble(ctx, cx, cy - 8, cx + 6, cy + 2, s + 2);
    } else if (f === "conveyor") {
      ink(ctx, "#55555c", 1.8);
      wobble(ctx, x + 6, y + 14, x + 42, y + 14, s);
      wobble(ctx, x + 6, y + 34, x + 42, y + 34, s + 1);
      const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
      const d = dirs[c.dir & 3];
      wobble(ctx, cx - d[0] * 8, cy - d[1] * 8, cx + d[0] * 10, cy + d[1] * 10, s + 2);
    } else if (f === "spikes") {
      ink(ctx, "#241c14", 1.7);
      for (let i = 0; i < 4; i++) {
        const sx = x + 10 + i * 9;
        wobble(ctx, sx, y + 36, sx + 4, y + 12, s + i);
        wobble(ctx, sx + 4, y + 12, sx + 8, y + 36, s + i + 10);
      }
    }
  }
  function drawChest(ctx, x, y, s, open) {
    ink(ctx, "#8a5a22", 1.8);
    hachure(ctx, x + 10, y + 18, 28, 18, s, "rgba(180,120,40,0.35)", 4, 0.2);
    wobble(ctx, x + 10, y + 18, x + 38, y + 18, s);
    wobble(ctx, x + 38, y + 18, x + 38, y + 36, s + 1);
    wobble(ctx, x + 38, y + 36, x + 10, y + 36, s + 2);
    wobble(ctx, x + 10, y + 36, x + 10, y + 18, s + 3);
    if (!open) {
      wobble(ctx, x + 10, y + 14, x + 38, y + 14, s + 4);
      sketchCircle(ctx, x + 24, y + 26, 2, s, 0.4);
    }
  }
  function drawItem(ctx, i, x, y, s) {
    const cx = x + TS / 2, cy = y + TS / 2;
    if (i === "coin") {
      ink(ctx, "#c9a227", 1.8);
      sketchCircle(ctx, cx, cy, 8, s, 0.8);
      ctx.font = "12px Permanent Marker";
      ctx.fillStyle = "#c9a227";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("$", cx, cy + 1);
    } else if (i === "key") {
      ink(ctx, "#c9a227", 1.7);
      sketchCircle(ctx, x + 16, cy, 5, s);
      wobble(ctx, x + 21, cy, x + 36, cy, s + 1);
      wobble(ctx, x + 32, cy, x + 32, cy + 5, s + 2);
    } else if (i === "heart") {
      ink(ctx, "#9b2226", 1.7);
      ctx.beginPath();
      ctx.moveTo(cx, cy + 8);
      ctx.bezierCurveTo(cx - 16, cy - 2, cx - 8, cy - 14, cx, cy - 4);
      ctx.bezierCurveTo(cx + 8, cy - 14, cx + 16, cy - 2, cx, cy + 8);
      ctx.stroke();
    } else if (i === "star") {
      ink(ctx, "#c9a227", 1.6);
      starPath(ctx, cx, cy, 5, 10, 4); ctx.stroke();
    } else if (i === "potion") {
      ink(ctx, "#6a4c93", 1.7);
      wobble(ctx, cx - 6, cy + 10, cx + 6, cy + 10, s);
      wobble(ctx, cx - 6, cy + 10, cx - 4, cy - 4, s + 1);
      wobble(ctx, cx + 6, cy + 10, cx + 4, cy - 4, s + 2);
      wobble(ctx, cx - 4, cy - 8, cx + 4, cy - 8, s + 3);
    } else if (i === "flower") {
      ink(ctx, "#2d6a4f", 1.4);
      wobble(ctx, cx, cy + 12, cx, cy, s);
      ink(ctx, "#9b2226", 1.4);
      sketchCircle(ctx, cx, cy - 4, 5, s + 2, 0.8);
    }
  }
  function starPath(ctx, x, y, n, r, r2) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = (i * Math.PI) / n - Math.PI / 2;
      const rad = i % 2 ? r2 : r;
      const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }
  function drawMobIcon(ctx, m, x, y, s) {
    const cx = x + TS / 2, cy = y + TS / 2;
    if (m === "slime") {
      ink(ctx, "#2d6a4f", 1.8);
      ctx.beginPath();
      ctx.moveTo(x + 12, y + 34);
      ctx.quadraticCurveTo(cx, y + 8, x + 36, y + 34);
      ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx - 5, cy + 2, 1.6, 0, 7); ctx.arc(cx + 5, cy + 2, 1.6, 0, 7); ctx.fill();
    } else if (m === "bat") {
      ink(ctx, "#4a3f32", 1.7);
      wobble(ctx, cx, cy, cx - 14, cy - 6, s);
      wobble(ctx, cx - 14, cy - 6, cx - 8, cy + 4, s + 1);
      wobble(ctx, cx, cy, cx + 14, cy - 6, s + 2);
      wobble(ctx, cx + 14, cy - 6, cx + 8, cy + 4, s + 3);
      sketchCircle(ctx, cx, cy, 3, s, 0.5);
    } else if (m === "knight") {
      ink(ctx, "#1d4e89", 1.8);
      sketchCircle(ctx, cx, y + 16, 6, s);
      wobble(ctx, cx, y + 22, cx, y + 36, s + 1);
      wobble(ctx, cx, y + 26, cx - 8, y + 22, s + 2);
      wobble(ctx, cx, y + 36, cx - 6, y + 42, s + 3);
      wobble(ctx, cx, y + 36, cx + 6, y + 42, s + 4);
      wobble(ctx, cx + 6, y + 18, cx + 6, y + 8, s + 5);
    } else if (m === "mimic") {
      drawChest(ctx, x, y, s, false);
      ink(ctx, "#9b2226", 1.4);
      ctx.beginPath(); ctx.arc(x + 18, y + 24, 1.5, 0, 7); ctx.arc(x + 30, y + 24, 1.5, 0, 7); ctx.fill();
    }
  }

  function doodleHero(ctx, x, y, color, facing, t, attacking, dash) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(facing < 0 ? -1 : 1, 1);
    ink(ctx, color, 2);
    const bob = Math.sin(t * 8) * 1.2;
    sketchCircle(ctx, 0, -10 + bob, 7, 12, 0.7);
    wobble(ctx, 0, -3 + bob, 0, 10, 13);
    wobble(ctx, 0, 2 + bob, -8, 8, 14);
    wobble(ctx, 0, 2 + bob, 8, attacking ? -2 : 8, 15);
    wobble(ctx, 0, 10, -5, 18, 16);
    wobble(ctx, 0, 10, 5, 18, 17);
    if (attacking) {
      ink(ctx, "#241c14", 1.6);
      ctx.beginPath();
      ctx.arc(10, 0, 16, -0.8, 0.9);
      ctx.stroke();
    }
    if (dash) {
      ctx.globalAlpha = 0.3;
      wobble(ctx, -16, 0, -6, 0, 20);
    }
    ctx.restore();
  }

  /* ---------- UI helpers ---------- */
  const $ = (id) => document.getElementById(id);
  function show(id) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    $(id).classList.add("active");
    state.screen = id.replace("screen-", "");
    SFX.page();
    if (id === "screen-editor") requestAnimationFrame(() => fitEditor());
    if (id === "screen-play") requestAnimationFrame(() => fitPlay());
  }
  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), 1800);
  }
  function modalPrompt(title, body, value = "") {
    return new Promise((res) => {
      $("modal-title").textContent = title;
      $("modal-body").textContent = body;
      $("modal-input").value = value;
      $("modal").classList.add("show");
      setTimeout(() => $("modal-input").focus(), 40);
      const ok = () => { cleanup(); res($("modal-input").value); };
      const cancel = () => { cleanup(); res(null); };
      function cleanup() {
        $("modal").classList.remove("show");
        $("modal-ok").onclick = null;
        $("modal-cancel").onclick = null;
      }
      $("modal-ok").onclick = ok;
      $("modal-cancel").onclick = cancel;
    });
  }

  /* ---------- setup ---------- */
  function defaultPlayers(n) {
    state.players = Array.from({ length: n }, (_, i) => ({
      name: NAMES[i], color: COLORS[i], hat: i,
    }));
  }
  function renderPlayers() {
    const box = $("player-list");
    box.innerHTML = "";
    state.players.forEach((p, i) => {
      const row = document.createElement("div");
      row.className = "player-row";
      row.innerHTML = `
        <div class="swatch" style="background:${p.color}" title="cycle ink"></div>
        <input type="text" maxlength="14" value="${p.name}" />
        <span class="tiny">P${i + 1}</span>
        <button class="btn small ghost" ${state.players.length < 2 ? "disabled" : ""}>×</button>`;
      row.querySelector(".swatch").onclick = () => {
        const idx = COLORS.indexOf(p.color);
        p.color = COLORS[(idx + 1) % COLORS.length];
        renderPlayers();
      };
      row.querySelector("input").oninput = (e) => { p.name = e.target.value || NAMES[i]; };
      row.querySelector("button").onclick = () => {
        if (state.players.length < 2) return;
        state.players.splice(i, 1);
        renderPlayers();
      };
      box.appendChild(row);
    });
    $("add-player").disabled = state.players.length >= 4;
  }
  function chips(el, items, current, key, labelKey = "label") {
    el.innerHTML = "";
    items.forEach((it) => {
      const b = document.createElement("button");
      b.className = "chip" + ((typeof it === "object" ? it.id : it) === current ? " on" : "");
      b.textContent = typeof it === "object" ? it[labelKey] : it;
      b.onclick = () => { key(it); renderSetupOpts(); };
      el.appendChild(b);
    });
  }
  function renderSetupOpts() {
    chips($("size-opts"), SIZES, state.size.id, (it) => { state.size = it; });
    chips($("mode-opts"), MODES, state.mode, (it) => { state.mode = it.id; });
    chips($("time-opts"), TIMES, state.turnTime, (it) => { state.turnTime = it.id; });
  }

  /* ---------- editor ---------- */
  const edCanvas = $("game");
  const edCtx = edCanvas.getContext("2d");
  let edDpr = 1, edW = 0, edH = 0;

  function fitEditor() {
    const stage = $("mapstage");
    if (!stage) return;
    const r = stage.getBoundingClientRect();
    edDpr = Math.min(2, window.devicePixelRatio || 1);
    edW = r.width; edH = r.height;
    edCanvas.width = Math.max(1, edW * edDpr);
    edCanvas.height = Math.max(1, edH * edDpr);
    edCanvas.style.width = edW + "px";
    edCanvas.style.height = edH + "px";
    drawEditor();
  }

  function paletteForChapter() {
    if (state.chapter === 1) return GROUND_ORDER;
    if (state.chapter === 2) return FIX_ORDER;
    return LIFE_ORDER;
  }
  function renderPalette() {
    const pal = $("palette");
    pal.innerHTML = "";
    paletteForChapter().forEach((id) => {
      const t = TILE[id];
      const b = document.createElement("button");
      b.className = "pal" + (state.tool === id && !state.erase ? " on" : "");
      const c = document.createElement("canvas");
      c.width = 64; c.height = 48;
      const cx = c.getContext("2d");
      paintPaper(cx, 0, 0, 64, 48);
      const dummy = makeCell();
      if (t.layer === "ground") dummy.g = id;
      if (t.layer === "fix") dummy.f = id;
      if (t.layer === "mob") dummy.m = id;
      if (t.layer === "item") dummy.i = id;
      cx.save();
      cx.translate(8, 0);
      if (t.layer === "ground") drawGround(cx, id, 0, 0, 3);
      if (t.layer === "fix") drawFix(cx, dummy, 0, 0, 4);
      if (t.layer === "item") drawItem(cx, id, 0, 0, 5);
      if (t.layer === "mob") drawMobIcon(cx, id, 0, 0, 6);
      cx.restore();
      b.appendChild(c);
      const nm = document.createElement("div");
      nm.className = "nm";
      nm.textContent = t.name;
      b.appendChild(nm);
      b.onclick = () => {
        state.tool = id; state.erase = false;
        renderPalette();
        updateToolInfo();
      };
      pal.appendChild(b);
    });
    updateToolInfo();
  }
  function updateToolInfo() {
    const t = TILE[state.tool];
    $("ed-toolname").textContent = state.erase ? "Eraser" : t.name;
    $("ed-tooldesc").textContent = state.erase
      ? "Scrub this chapter’s stamps back to paper."
      : `${t.desc}  ·  ${t.cost} ink`;
    $("ed-chapter").textContent = `CHAPTER ${CHAPTERS[state.chapter - 1].roman} · ${CHAPTERS[state.chapter - 1].name.toUpperCase()}`;
    const p = state.players[state.turn];
    $("inkfill").style.width = (100 * state.ink / state.inkMax) + "%";
    $("inkfill").style.background = p ? p.color : "#1d4e89";
    $("inknum").textContent = state.ink;
    renderRoster();
  }
  function renderRoster() {
    const r = $("roster");
    r.innerHTML = "";
    state.players.forEach((p, i) => {
      const d = document.createElement("div");
      d.className = "who" + (i === state.turn ? " now" : "");
      d.innerHTML = `<div class="dot" style="background:${p.color}"></div><div><strong>${p.name}</strong><div class="tiny">${i === state.turn ? "holding the pencil" : "waiting"}</div></div>`;
      r.appendChild(d);
    });
  }

  function screenToWorld(mx, my) {
    const rect = edCanvas.getBoundingClientRect();
    const sx = mx - rect.left, sy = my - rect.top;
    const wx = (sx - edW / 2) / state.view.z + state.view.x;
    const wy = (sy - edH / 2) / state.view.z + state.view.y;
    return { x: wx, y: wy, tx: Math.floor(wx / TS), ty: Math.floor(wy / TS) };
  }
  function drawEditor() {
    if (state.screen !== "editor") return;
    ensureCache();
    const ctx = edCtx;
    ctx.setTransform(edDpr, 0, 0, edDpr, 0, 0);
    ctx.fillStyle = "#e8d5a4";
    ctx.fillRect(0, 0, edW, edH);
    ctx.save();
    ctx.translate(edW / 2, edH / 2);
    ctx.scale(state.view.z, state.view.z);
    ctx.translate(-state.view.x, -state.view.y);
    ctx.drawImage(worldCache, 0, 0);
    if (state.grid) {
      ctx.strokeStyle = "rgba(40,30,20,0.12)";
      ctx.lineWidth = 1 / state.view.z;
      ctx.beginPath();
      for (let x = 0; x <= state.map.w; x++) {
        ctx.moveTo(x * TS, 0); ctx.lineTo(x * TS, state.map.h * TS);
      }
      for (let y = 0; y <= state.map.h; y++) {
        ctx.moveTo(0, y * TS); ctx.lineTo(state.map.w * TS, y * TS);
      }
      ctx.stroke();
    }
    ink(ctx, "#241c14", 2 / state.view.z);
    wobble(ctx, 0, 0, state.map.w * TS, 0, 1, 0.8);
    wobble(ctx, state.map.w * TS, 0, state.map.w * TS, state.map.h * TS, 2, 0.8);
    wobble(ctx, state.map.w * TS, state.map.h * TS, 0, state.map.h * TS, 3, 0.8);
    wobble(ctx, 0, state.map.h * TS, 0, 0, 4, 0.8);
    if (state.hover && cell(state.hover.tx, state.hover.ty)) {
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = state.erase ? "#9b2226" : (state.players[state.turn]?.color || "#000");
      ctx.fillRect(state.hover.tx * TS, state.hover.ty * TS, TS, TS);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function beginTurn() {
    state.inkMax = INK[state.chapter - 1];
    state.ink = state.inkMax;
    state.undo = [];
    state.erase = false;
    state.tool = paletteForChapter()[0];
    state.clock = state.turnTime;
    const ch = CHAPTERS[state.chapter - 1];
    const p = state.players[state.turn];
    $("pass-kicker").textContent = `CHAPTER ${ch.roman} · ${ch.name.toUpperCase()}`;
    $("pass-title").textContent = `Hand the pencil to ${p.name}`;
    $("pass-sub").textContent = `${ch.blurb} You have ${state.ink} drops of ink.`;
    const pc = $("pass-portrait");
    const cx = pc.getContext("2d");
    cx.fillStyle = "#f3e6c4";
    cx.fillRect(0, 0, 140, 140);
    doodleHero(cx, 70, 80, p.color, 1, 0, false, false);
    show("screen-pass");
  }
  function enterEditor() {
    renderPalette();
    updateToolInfo();
    show("screen-editor");
    edCanvas.classList.add("pencil-on");
    requestAnimationFrame(() => {
      fitEditor();
      const mw = state.map.w * TS, mh = state.map.h * TS;
      state.view.x = mw / 2;
      state.view.y = mh / 2;
      if (edW && edH) {
        state.view.z = Math.max(0.5, Math.min(1.35, Math.min((edW - 28) / mw, (edH - 28) / mh)));
      }
      dirtyAll();
      drawEditor();
    });
  }

  function applyStamp(tx, ty, record) {
    const c = cell(tx, ty); if (!c) return false;
    if (state.erase) {
      const ch = state.chapter;
      let changed = false;
      if (ch === 1 && c.g !== "empty") { c.g = "empty"; changed = true; }
      if (ch === 2 && c.f) { c.f = null; c.note = ""; changed = true; }
      if (ch === 3 && (c.m || c.i)) { c.m = null; c.i = null; changed = true; }
      if (changed) { c.a = state.turn; dirtyCell(tx, ty); return true; }
      return false;
    }
    const t = TILE[state.tool];
    if (state.ink < t.cost) { toast("the bottle is dry"); return false; }
    let changed = false;
    if (t.layer === "ground") {
      if (c.g !== state.tool) { c.g = state.tool; changed = true; }
    } else if (t.layer === "fix") {
      if (state.tool === "conveyor" && c.f === "conveyor") {
        c.dir = (c.dir + 1) & 3; changed = true;
      } else if (c.f !== state.tool) {
        if (state.tool === "spawn") {
          for (const o of state.map.cells) if (o.f === "spawn") o.f = null;
          dirtyAll();
        }
        c.f = state.tool;
        c.open = false;
        changed = true;
        if (state.tool === "sign") {
          modalPrompt("A sign in the margin", "What does it say?", c.note || "").then((txt) => {
            if (txt != null) { c.note = txt.slice(0, 80); dirtyCell(tx, ty); }
          });
        }
      }
    } else if (t.layer === "mob") {
      if (c.m !== state.tool) { c.m = state.tool; changed = true; }
    } else if (t.layer === "item") {
      if (c.i !== state.tool) { c.i = state.tool; changed = true; }
    }
    if (changed) {
      if (record) state.ink -= t.cost;
      c.a = state.turn;
      dirtyCell(tx, ty);
      SFX.place();
    }
    return changed;
  }

  function paintAt(mx, my, first) {
    const w = screenToWorld(mx, my);
    if (!cell(w.tx, w.ty)) return;
    const key = w.tx + "," + w.ty;
    if (state.lastCell === key && !first) return;
    if (first) pushUndo();
    if (applyStamp(w.tx, w.ty, true)) {
      state.lastCell = key;
      updateToolInfo();
    }
  }

  function passPencil() {
    SFX.pass();
    const lastPlayer = state.turn >= state.players.length - 1;
    if (!lastPlayer) {
      state.turn++;
      beginTurn();
      return;
    }
    if (state.chapter < 3) {
      state.chapter++;
      state.turn = 0;
      beginTurn();
      return;
    }
    startPlayChoice();
  }
  function startPlayChoice() {
    ensureSpawnExit();
    state.scores = [];
    dirtyAll();
    $("pass-kicker").textContent = "THE EXPEDITION";
    $("pass-title").textContent = "The atlas is closed. Walk it.";
    $("pass-sub").textContent = state.mode === "relay"
      ? "One shared run. Die and the next friend continues from the last fire."
      : "Each cartographer runs the same doodle. Best score on the cork.";
    const p = state.players[0];
    const pc = $("pass-portrait");
    const cx = pc.getContext("2d");
    cx.fillStyle = "#f3e6c4"; cx.fillRect(0, 0, 140, 140);
    doodleHero(cx, 70, 80, p.color, 1, 0, false, false);
    $("pass-go").textContent = "We go in";
    show("screen-pass");
    $("pass-go").onclick = () => { $("pass-go").textContent = "I have the pencil"; $("pass-go").onclick = enterEditor; startPlay(0); };
  }

  function ensureSpawnExit() {
    let spawn = null, exit = null;
    for (let y = 0; y < state.map.h; y++)
      for (let x = 0; x < state.map.w; x++) {
        const c = cell(x, y);
        if (c.f === "spawn") spawn = { x, y };
        if (c.f === "exit") exit = { x, y };
      }
    if (!spawn) {
      const c = cell(1, 1);
      c.g = "grass"; c.f = "spawn";
    }
    if (!exit) {
      const c = cell(state.map.w - 2, state.map.h - 2);
      if (c.f === "wall" || c.f === "fence") c.f = "exit";
      else c.f = c.f || "exit";
      if (c.g === "pit" || c.g === "lava") c.g = "stone";
    }
  }

  /* ---------- play ---------- */
  const playCanvas = $("play");
  const playCtx = playCanvas.getContext("2d");
  let playDpr = 1, playW = 0, playH = 0;
  const keys = new Set();
  const touchDir = { x: 0, y: 0 };

  function fitPlay() {
    const stage = $("playstage");
    if (!stage) return;
    const r = stage.getBoundingClientRect();
    playDpr = Math.min(2, window.devicePixelRatio || 1);
    playW = r.width; playH = r.height;
    playCanvas.width = Math.max(1, playW * playDpr);
    playCanvas.height = Math.max(1, playH * playDpr);
    playCanvas.style.width = playW + "px";
    playCanvas.style.height = playH + "px";
  }

  function findSpawn() {
    for (let y = 0; y < state.map.h; y++)
      for (let x = 0; x < state.map.w; x++)
        if (cell(x, y).f === "spawn") return { x: (x + 0.5) * TS, y: (y + 0.5) * TS, tx: x, ty: y };
    return { x: TS * 1.5, y: TS * 1.5, tx: 1, ty: 1 };
  }
  function portals() {
    const p = [];
    for (let y = 0; y < state.map.h; y++)
      for (let x = 0; x < state.map.w; x++)
        if (cell(x, y).f === "portal") p.push({ x, y });
    return p;
  }

  function cloneMapRuntime() {
    return state.map.cells.map((c) => ({ ...c }));
  }

  function startPlay(playerIndex, keepWorld) {
    ensureSpawnExit();
    const p = state.players[playerIndex];
    const sp = findSpawn();
    const world = keepWorld && state.play ? state.play.world : cloneMapRuntime();
    const checkpoint = keepWorld && state.play ? state.play.checkpoint : { x: sp.x, y: sp.y };
    state.runIndex = playerIndex;
    state.play = {
      player: playerIndex,
      hp: keepWorld && state.play ? Math.max(state.play.hp, 3) : 3,
      hpMax: 3,
      coins: keepWorld && state.play ? state.play.coins : 0,
      keys: keepWorld && state.play ? state.play.keys : 0,
      stars: keepWorld && state.play ? state.play.stars : 0,
      x: checkpoint.x,
      y: checkpoint.y,
      vx: 0, vy: 0,
      facing: 1,
      atk: 0,
      dash: 0,
      inv: 0,
      speedBuff: 0,
      t: 0,
      camx: checkpoint.x,
      camy: checkpoint.y,
      world,
      mobs: keepWorld && state.play ? state.play.mobs : spawnMobs(world),
      particles: [],
      checkpoint,
      dead: false,
      won: false,
      shake: 0,
      combo: 0,
      time: 0,
      paused: false,
      portalCd: 0,
      over: false,
    };
    show("screen-play");
    $("hud-who").textContent = p.name;
    $("play-obj").textContent = state.mode === "relay"
      ? `Relay · ${p.name} holds the boots. Reach an exit.`
      : `Gauntlet · ${p.name}'s run. Reach an exit.`;
    dirtyAll();
    updateHud();
    fitPlay();
  }

  function rtCell(world, x, y) {
    if (x < 0 || y < 0 || x >= state.map.w || y >= state.map.h) return null;
    return world[y * state.map.w + x];
  }
  function spawnMobs(world) {
    const mobs = [];
    for (let y = 0; y < state.map.h; y++)
      for (let x = 0; x < state.map.w; x++) {
        const c = world[y * state.map.w + x];
        if (!c.m) continue;
        mobs.push({
          type: c.m,
          x: (x + 0.5) * TS,
          y: (y + 0.5) * TS,
          vx: c.m === "slime" ? 40 : 0,
          vy: 0,
          hp: c.m === "knight" ? 2 : 1,
          alive: true,
          wake: false,
          t: seed2(x, y) * 10,
        });
        c.m = null;
      }
    return mobs;
  }

  function tileAtWorld(world, px, py) {
    return rtCell(world, Math.floor(px / TS), Math.floor(py / TS));
  }
  function blocked(world, px, py, r, flying) {
    const pts = [
      [px - r, py - r], [px + r, py - r], [px - r, py + r], [px + r, py + r], [px, py],
    ];
    for (const [x, y] of pts) {
      const tx = Math.floor(x / TS), ty = Math.floor(y / TS);
      const c = rtCell(world, tx, ty);
      if (!c) return true;
      if (c.f === "wall") return true;
      if (c.f === "fence" && !flying) return true;
      if (c.f === "door" && !c.open) return true;
    }
    return false;
  }
  function moveBody(world, e, dt, r, flying) {
    const nx = e.x + e.vx * dt;
    if (!blocked(world, nx, e.y, r, flying)) e.x = nx; else e.vx = flying ? e.vx : 0;
    const ny = e.y + e.vy * dt;
    if (!blocked(world, e.x, ny, r, flying)) e.y = ny; else e.vy = flying ? e.vy : 0;
    e.x = Math.max(r, Math.min(state.map.w * TS - r, e.x));
    e.y = Math.max(r, Math.min(state.map.h * TS - r, e.y));
  }

  function hurt(n = 1) {
    const P = state.play; if (!P || P.inv > 0 || P.dead || P.won) return;
    P.hp -= n;
    P.inv = 0.9;
    P.shake = 8;
    SFX.hit();
    burst(P.x, P.y, "#9b2226", 10);
    if (P.hp <= 0) die();
    updateHud();
  }
  function die() {
    const P = state.play;
    P.dead = true;
    P.over = true;
    SFX.die();
    burst(P.x, P.y, "#241c14", 18);
    setTimeout(() => afterDeath(), 700);
  }
  function win() {
    const P = state.play;
    if (P.won) return;
    P.won = true;
    P.over = true;
    SFX.win();
    burst(P.x, P.y, "#c9a227", 24);
    const score = scoreOf(P);
    const name = state.players[P.player].name;
    state.scores.push({ name, score, coins: P.coins, stars: P.stars, time: P.time, alive: true });
    setTimeout(() => {
      if (state.mode === "gauntlet" && P.player + 1 < state.players.length) {
        toast(`${name} made it. Next runner.`);
        startPlay(P.player + 1, false);
      } else {
        showResults(true, name, score);
      }
    }, 800);
  }
  function scoreOf(P) {
    return P.coins * 10 + P.stars * 50 + Math.max(0, 120 - P.time | 0) + P.hp * 15;
  }
  function afterDeath() {
    const P = state.play;
    const name = state.players[P.player].name;
    if (state.mode === "relay") {
      const next = P.player + 1;
      if (next < state.players.length) {
        toast(`${name} folds. ${state.players[next].name} continues.`);
        startPlay(next, true);
      } else {
        state.scores.push({ name: "the table", score: scoreOf(P), coins: P.coins, stars: P.stars, time: P.time, alive: false });
        showResults(false, "nobody", scoreOf(P));
      }
    } else {
      state.scores.push({ name, score: scoreOf(P), coins: P.coins, stars: P.stars, time: P.time, alive: false });
      const next = P.player + 1;
      if (next < state.players.length) {
        toast(`${name} is ink-stained. Next!`);
        startPlay(next, false);
      } else showResults(state.scores.some((s) => s.alive), name, scoreOf(P));
    }
  }
  function showResults(survived, name, score) {
    $("res-title").textContent = survived ? "The atlas holds." : "The atlas ate someone.";
    $("res-stamp").textContent = survived ? "★ SURVIVED" : "✗ FOLDED";
    const board = $("res-board");
    board.innerHTML = "";
    const rows = state.scores.slice().sort((a, b) => b.score - a.score);
    rows.forEach((r, i) => {
      const d = document.createElement("div");
      d.className = "score-row";
      d.innerHTML = `<span>${i + 1}. ${r.name} ${r.alive ? "★" : ""}</span><span>${r.score} pts · ${r.coins}¢ · ${r.time | 0}s</span>`;
      board.appendChild(d);
    });
    if (!rows.length) {
      const d = document.createElement("div");
      d.className = "score-row";
      d.textContent = `${name} · ${score} pts`;
      board.appendChild(d);
    }
    show("screen-results");
  }

  function burst(x, y, color, n) {
    const P = state.play; if (!P) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 90;
      P.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.4 + Math.random() * 0.4, color, s: 2 + Math.random() * 3 });
    }
  }
  function updateHud() {
    const P = state.play; if (!P) return;
    $("hud-hearts").textContent = "♥ ".repeat(Math.max(0, P.hp)).trim() + " " + "♡ ".repeat(Math.max(0, P.hpMax - P.hp)).trim();
    $("hud-stats").textContent = `coins ${P.coins} · keys ${P.keys} · ${P.time | 0}s`;
    $("hud-who").textContent = state.players[P.player].name;
  }

  function tryUse() {
    const P = state.play; if (!P || P.dead) return;
    const tx = Math.floor(P.x / TS), ty = Math.floor(P.y / TS);
    const c = rtCell(P.world, tx, ty);
    if (!c) return;
    if (c.f === "chest" && !c.open) {
      c.open = true;
      const roll = seed2(tx, ty, 77);
      if (roll < 0.4) { P.coins += 3; SFX.coin(P.combo++); toast("three coins in the lining"); }
      else if (roll < 0.7) { P.keys++; toast("a key, cold as a secret"); SFX.coin(); }
      else { P.hp = Math.min(P.hpMax, P.hp + 1); toast("a spare heart, folded small"); }
      burst(P.x, P.y, "#c9a227", 8);
      dirtyAll();
      updateHud();
      return;
    }
    if (c.f === "sign") {
      toast(c.note || "(blank sign. typical.)");
      return;
    }
    if (c.f === "campfire") {
      P.checkpoint = { x: P.x, y: P.y };
      P.hp = Math.min(P.hpMax, P.hp + 1);
      toast("the fire knows your name now");
      updateHud();
      SFX.pass();
      return;
    }
    // adjacent door
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const d = rtCell(P.world, tx + dx, ty + dy);
      if (d && d.f === "door" && !d.open) {
        if (P.keys > 0) {
          P.keys--; d.open = true; toast("the door sighs open");
          dirtyAll(); updateHud(); SFX.place();
        } else toast("locked. of course it's locked.");
        return;
      }
    }
  }
  function trySlash() {
    const P = state.play; if (!P || P.atk > 0 || P.dead) return;
    P.atk = 0.22;
    SFX.slash();
    const reach = 26;
    const ax = P.x + P.facing * 18, ay = P.y;
    for (const m of P.mobs) {
      if (!m.alive) continue;
      if (Math.hypot(m.x - ax, m.y - ay) < reach) {
        m.hp--;
        burst(m.x, m.y, "#241c14", 8);
        if (m.hp <= 0) {
          m.alive = false;
          P.coins++;
          SFX.coin(P.combo++);
        } else {
          m.vx += P.facing * 80;
        }
      }
    }
    updateHud();
  }

  function pickup(P, c, tx, ty) {
    if (!c.i) return;
    const i = c.i;
    c.i = null;
    dirtyCell(tx, ty); dirtyAll();
    if (i === "coin") { P.coins++; SFX.coin(P.combo++); }
    else if (i === "key") { P.keys++; SFX.coin(); toast("a key"); }
    else if (i === "heart") { P.hp = Math.min(P.hpMax, P.hp + 1); toast("mended"); }
    else if (i === "star") { P.stars++; SFX.coin(3); toast("a gold star, teacher’s pet"); }
    else if (i === "potion") { P.speedBuff = 4; toast("legs like commas"); }
    else if (i === "flower") { toast("you picked a flower. heroically."); }
    updateHud();
  }

  function updatePlay(dt) {
    const P = state.play;
    if (!P || P.paused || state.screen !== "play") return;
    P.t += dt;
    if (!P.over) P.time += dt;
    if (P.over) {
      P.particles.forEach((q) => { q.x += q.vx * dt; q.y += q.vy * dt; q.life -= dt; });
      P.particles = P.particles.filter((q) => q.life > 0);
      P.shake *= 0.9;
      return;
    }
    P.inv = Math.max(0, P.inv - dt);
    P.atk = Math.max(0, P.atk - dt);
    P.dash = Math.max(0, P.dash - dt);
    P.speedBuff = Math.max(0, P.speedBuff - dt);
    P.portalCd = Math.max(0, P.portalCd - dt);
    P.combo = Math.max(0, P.combo - dt * 0.7);

    let ix = 0, iy = 0;
    if (keys.has("arrowleft") || keys.has("a")) ix -= 1;
    if (keys.has("arrowright") || keys.has("d")) ix += 1;
    if (keys.has("arrowup") || keys.has("w")) iy -= 1;
    if (keys.has("arrowdown") || keys.has("s")) iy += 1;
    ix += touchDir.x; iy += touchDir.y;
    const mag = Math.hypot(ix, iy) || 1;
    ix /= mag; iy /= mag;
    if (ix) P.facing = ix < 0 ? -1 : 1;

    const tx = Math.floor(P.x / TS), ty = Math.floor(P.y / TS);
    const ground = rtCell(P.world, tx, ty);
    const gdef = TILE[ground?.g || "empty"] || TILE.empty;
    let accel = 920 * (gdef.walk || 1);
    if (P.speedBuff > 0) accel *= 1.45;
    const fr = gdef.friction || 0.78;
    if (gdef.swim && P.dash > 0) P.dash = 0;

    if (ground?.g !== "ice") {
      P.vx += ix * accel * dt;
      P.vy += iy * accel * dt;
    } else {
      P.vx += ix * 240 * dt;
      P.vy += iy * 240 * dt;
    }
    if (P.dash > 0.12) {
      P.vx += P.facing * 28;
    }
    P.vx *= Math.pow(fr, dt * 60);
    P.vy *= Math.pow(fr, dt * 60);
    const cap = 140 * (gdef.walk || 1) * (P.speedBuff ? 1.4 : 1);
    const sp = Math.hypot(P.vx, P.vy);
    if (sp > cap) { P.vx *= cap / sp; P.vy *= cap / sp; }

    if (ground?.f === "conveyor") {
      const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
      const d = dirs[ground.dir & 3];
      P.vx += d[0] * 220 * dt;
      P.vy += d[1] * 220 * dt;
    }
    if (ground?.f === "bounce" && Math.hypot(P.vx, P.vy) > 20) {
      const m = Math.hypot(P.vx, P.vy) || 1;
      P.vx = (P.vx / m) * 280;
      P.vy = (P.vy / m) * 280;
      SFX.place();
    }

    moveBody(P.world, P, dt, 10, false);

    const now = rtCell(P.world, Math.floor(P.x / TS), Math.floor(P.y / TS));
    if (now) {
      pickup(P, now, Math.floor(P.x / TS), Math.floor(P.y / TS));
      const gd = TILE[now.g] || TILE.empty;
      if (gd.fall && now.f !== "bridge") { hurt(3); }
      if (gd.burn && now.f !== "bridge" && (P.t * 2 | 0) !== ((P.t - dt) * 2 | 0)) hurt(1);
      if (now.f === "spikes" && P.inv <= 0) hurt(1);
      if (now.f === "exit") win();
      if (now.f === "portal" && P.portalCd <= 0) {
        const ps = portals();
        if (ps.length > 1) {
          const me = ps.findIndex((q) => q.x === Math.floor(P.x / TS) && q.y === Math.floor(P.y / TS));
          const nxt = ps[(me + 1) % ps.length];
          P.x = (nxt.x + 0.5) * TS; P.y = (nxt.y + 0.5) * TS;
          P.portalCd = 0.8;
          SFX.pass();
          burst(P.x, P.y, "#6a4c93", 12);
        }
      }
    }

    // mobs
    for (const m of P.mobs) {
      if (!m.alive) continue;
      m.t += dt;
      const flying = m.type === "bat";
      if (m.type === "slime") {
        if (blocked(P.world, m.x + Math.sign(m.vx || 1) * 12, m.y, 8, false)) m.vx *= -1;
        if (Math.abs(m.vx) < 20) m.vx = 40;
        m.vy = 0;
      } else if (m.type === "bat") {
        const dx = P.x - m.x, dy = P.y - m.y;
        const dist = Math.hypot(dx, dy);
        const cover = TILE[tileAtWorld(P.world, P.x, P.y)?.g || "empty"]?.cover;
        if (dist < (cover ? 80 : 180)) {
          m.vx += (dx / dist) * 140 * dt;
          m.vy += (dy / dist) * 140 * dt;
        } else {
          m.vx += Math.sin(m.t) * 20 * dt;
          m.vy += Math.cos(m.t * 1.3) * 20 * dt;
        }
        const ms = Math.hypot(m.vx, m.vy);
        if (ms > 90) { m.vx *= 90 / ms; m.vy *= 90 / ms; }
      } else if (m.type === "knight") {
        const dx = P.x - m.x, dy = P.y - m.y;
        if (Math.abs(dy) < 14) m.vx += Math.sign(dx) * 400 * dt;
        else if (Math.abs(dx) < 14) m.vy += Math.sign(dy) * 400 * dt;
        else { m.vx *= 0.9; m.vy *= 0.9; }
        const ms = Math.hypot(m.vx, m.vy);
        if (ms > 160) { m.vx *= 160 / ms; m.vy *= 160 / ms; }
      } else if (m.type === "mimic") {
        const dist = Math.hypot(P.x - m.x, P.y - m.y);
        if (dist < 40) m.wake = true;
        if (m.wake) {
          m.vx += Math.sign(P.x - m.x) * 80 * dt;
          m.vy += Math.sign(P.y - m.y) * 80 * dt;
        }
      }
      moveBody(P.world, m, dt, 8, flying);
      if (Math.hypot(m.x - P.x, m.y - P.y) < 16) {
        if (m.type === "mimic" && !m.wake) { m.wake = true; toast("the chest has teeth"); }
        hurt(1);
        P.vx += Math.sign(P.x - m.x) * 80;
        P.vy += Math.sign(P.y - m.y) * 80;
      }
    }

    P.particles.forEach((q) => { q.x += q.vx * dt; q.y += q.vy * dt; q.life -= dt; q.vx *= 0.96; q.vy *= 0.96; });
    P.particles = P.particles.filter((q) => q.life > 0);
    P.camx += (P.x - P.camx) * Math.min(1, dt * 6);
    P.camy += (P.y - P.camy) * Math.min(1, dt * 6);
    P.shake *= 0.88;
  }

  function drawPlay() {
    if (state.screen !== "play" || !state.play) return;
    const P = state.play;
    ensureCache();
    const ctx = playCtx;
    ctx.setTransform(playDpr, 0, 0, playDpr, 0, 0);
    ctx.fillStyle = "#cbb98a";
    ctx.fillRect(0, 0, playW, playH);
    const z = 1.15;
    const shx = (Math.random() - 0.5) * P.shake;
    const shy = (Math.random() - 0.5) * P.shake;
    ctx.save();
    ctx.translate(playW / 2 + shx, playH / 2 + shy);
    ctx.scale(z, z);
    ctx.translate(-P.camx, -P.camy);
    ctx.drawImage(worldCache, 0, 0);

    // runtime overlay: opened chests already baked if dirtyAll — mobs & hero
    for (const m of P.mobs) {
      if (!m.alive) continue;
      if (m.type === "mimic" && !m.wake) drawChest(ctx, m.x - TS / 2, m.y - TS / 2, 4, false);
      else drawMobIcon(ctx, m.type, m.x - TS / 2, m.y - TS / 2, (m.t * 3) | 0);
    }
    for (const q of P.particles) {
      ctx.globalAlpha = Math.max(0, q.life * 2);
      ctx.fillStyle = q.color;
      ctx.fillRect(q.x, q.y, q.s, q.s);
      ctx.globalAlpha = 1;
    }
    if (P.inv > 0 && (P.t * 20 | 0) % 2 === 0) ctx.globalAlpha = 0.4;
    const col = state.players[P.player].color;
    doodleHero(ctx, P.x, P.y, col, P.facing, P.t, P.atk > 0, P.dash > 0);
    ctx.globalAlpha = 1;
    ctx.restore();

    // postage minimap
    const mmW = 110, mmH = (state.map.h / state.map.w) * mmW;
    ctx.save();
    ctx.translate(playW - mmW - 16, playH - mmH - 16);
    ctx.fillStyle = "#f7edd2";
    ctx.strokeStyle = "#241c14";
    ctx.lineWidth = 2;
    ctx.fillRect(-6, -6, mmW + 12, mmH + 12);
    ctx.strokeRect(-6, -6, mmW + 12, mmH + 12);
    ctx.drawImage(worldCache, 0, 0, mmW, mmH);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc((P.x / (state.map.w * TS)) * mmW, (P.y / (state.map.h * TS)) * mmH, 3, 0, 7);
    ctx.fill();
    ctx.restore();
  }

  /* ---------- sample map ---------- */
  function buildSample() {
    defaultPlayers(1);
    state.players[0].name = "You";
    state.size = SIZES[1];
    newMap(22, 14);
    const paint = (x, y, g) => { const c = cell(x, y); if (c) c.g = g; };
    const fix = (x, y, f) => { const c = cell(x, y); if (c) c.f = f; };
    const mob = (x, y, m) => { const c = cell(x, y); if (c) c.m = m; };
    const it = (x, y, i) => { const c = cell(x, y); if (c) c.i = i; };
    for (let y = 0; y < 14; y++)
      for (let x = 0; x < 22; x++) {
        paint(x, y, "grass");
        if (x === 0 || y === 0 || x === 21 || y === 13) fix(x, y, "wall");
      }
    for (let x = 3; x < 12; x++) paint(x, 6, "water");
    for (let x = 3; x < 12; x++) paint(x, 7, "water");
    fix(6, 6, "bridge"); fix(6, 7, "bridge");
    for (let y = 2; y < 6; y++) paint(16, y, "path");
    for (let x = 8; x < 16; x++) paint(x, 3, "path");
    for (let y = 8; y < 12; y++) for (let x = 14; x < 20; x++) paint(x, y, "forest");
    paint(4, 10, "ice"); paint(5, 10, "ice"); paint(6, 10, "ice"); paint(7, 10, "ice");
    paint(18, 4, "lava"); paint(19, 4, "lava");
    paint(10, 10, "sand"); paint(11, 10, "sand");
    paint(2, 3, "pit");
    fix(1, 1, "spawn");
    fix(20, 12, "exit");
    fix(9, 3, "door");
    fix(3, 3, "chest");
    fix(12, 10, "campfire");
    fix(15, 5, "portal"); fix(4, 11, "portal");
    fix(17, 9, "spikes");
    fix(8, 9, "bounce");
    cell(13, 6).f = "conveyor"; cell(13, 6).dir = 0;
    cell(14, 6).g = "stone"; cell(15, 6).g = "stone";
    cell(3, 3).note = "";
    fix(2, 8, "sign"); cell(2, 8).note = "Don't trust the chest in the trees.";
    mob(10, 8, "slime");
    mob(18, 8, "bat");
    mob(16, 3, "knight");
    mob(18, 11, "mimic");
    it(5, 2, "key");
    it(7, 11, "coin"); it(8, 11, "coin"); it(19, 2, "star");
    it(12, 2, "heart");
    it(4, 4, "potion");
    it(15, 11, "flower");
    dirtyAll();
  }

  /* ---------- share code ---------- */
  function exportCode() {
    try {
      const data = {
        v: 1, w: state.map.w, h: state.map.h,
        cells: state.map.cells,
        players: state.players,
      };
      const code = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
      navigator.clipboard?.writeText(code);
      toast("atlas folded into the clipboard");
      return code;
    } catch {
      toast("could not fold this atlas");
      return "";
    }
  }
  function importCode(code) {
    try {
      const data = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
      if (!data || !data.cells) throw new Error("bad");
      state.map = { w: data.w, h: data.h, cells: data.cells };
      if (data.players) state.players = data.players;
      dirtyAll();
      return true;
    } catch {
      toast("that code is just a smudge");
      return false;
    }
  }

  /* ---------- loop ---------- */
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    if (state.screen === "editor") {
      if (state.clock > 0) {
        state.clock -= dt;
        const s = Math.max(0, Math.ceil(state.clock));
        $("turn-clock").textContent = s ? s + "s" : "";
        if (state.clock <= 0) { toast("the clock ate your turn"); passPencil(); }
      }
      drawEditor();
    }
    if (state.screen === "play") {
      updatePlay(dt);
      drawPlay();
    }
    requestAnimationFrame(frame);
  }

  /* ---------- events ---------- */
  function bindEditor() {
    const c = edCanvas;
    c.addEventListener("pointerdown", (e) => {
      audio();
      if (e.button === 1 || keys.has(" ")) {
        state.panning = true;
        state._pan = { x: e.clientX, y: e.clientY, vx: state.view.x, vy: state.view.y };
        return;
      }
      state.dragging = true;
      c.setPointerCapture(e.pointerId);
      if (e.button === 2) { state.erase = true; }
      paintAt(e.clientX, e.clientY, true);
      drawEditor();
    });
    c.addEventListener("pointermove", (e) => {
      const w = screenToWorld(e.clientX, e.clientY);
      state.hover = w;
      if (state.panning && state._pan) {
        state.view.x = state._pan.vx - (e.clientX - state._pan.x) / state.view.z;
        state.view.y = state._pan.vy - (e.clientY - state._pan.y) / state.view.z;
      } else if (state.dragging) paintAt(e.clientX, e.clientY, false);
    });
    const up = (e) => {
      state.dragging = false;
      state.panning = false;
      state.lastCell = null;
      if (e.button === 2) { state.erase = false; renderPalette(); updateToolInfo(); }
    };
    c.addEventListener("pointerup", up);
    c.addEventListener("pointerleave", () => { state.hover = null; });
    c.addEventListener("contextmenu", (e) => e.preventDefault());
    c.addEventListener("wheel", (e) => {
      e.preventDefault();
      const old = state.view.z;
      state.view.z = Math.max(0.45, Math.min(2.4, state.view.z * (e.deltaY > 0 ? 0.9 : 1.1)));
      const w = screenToWorld(e.clientX, e.clientY);
      // keep point stable-ish
      void old; void w;
    }, { passive: false });
  }

  window.addEventListener("keydown", (e) => {
    const tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    keys.add(e.key.toLowerCase());
    if (e.key === " " ) e.preventDefault();
    if (state.screen === "editor") {
      if (e.key === "e" || e.key === "E") { state.erase = !state.erase; updateToolInfo(); toast(state.erase ? "eraser" : TILE[state.tool].name); }
      if (e.key.toLowerCase() === "z") { e.preventDefault(); undo(); }
      if (e.key === "g" || e.key === "G") state.grid = !state.grid;
      if (e.key >= "1" && e.key <= "9") {
        const list = paletteForChapter();
        const t = list[+e.key - 1];
        if (t) { state.tool = t; state.erase = false; renderPalette(); }
      }
    }
    if (state.screen === "play" && state.play && !state.play.paused) {
      if (e.key === "j" || e.key === "J") trySlash();
      if (e.key === "k" || e.key === "K" || e.key === "Shift") {
        if (state.play.dash <= 0) state.play.dash = 0.22;
      }
      if (e.key === "e" || e.key === "E") tryUse();
      if (e.key === "p" || e.key === "P" || e.key === "Escape") {
        state.play.paused = true;
        $("pause").classList.add("show");
      }
    }
  });
  window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
  playCanvas.addEventListener("pointerdown", () => { audio(); trySlash(); });

  document.querySelectorAll(".touchpad [data-dir]").forEach((b) => {
    const set = (on) => {
      const d = b.dataset.dir;
      if (d === "left") touchDir.x = on ? -1 : (touchDir.x < 0 ? 0 : touchDir.x);
      if (d === "right") touchDir.x = on ? 1 : (touchDir.x > 0 ? 0 : touchDir.x);
      if (d === "up") touchDir.y = on ? -1 : (touchDir.y < 0 ? 0 : touchDir.y);
      if (d === "down") touchDir.y = on ? 1 : (touchDir.y > 0 ? 0 : touchDir.y);
    };
    b.addEventListener("pointerdown", (e) => { e.preventDefault(); set(true); });
    b.addEventListener("pointerup", () => set(false));
    b.addEventListener("pointerleave", () => set(false));
  });
  $("touch-atk").onclick = trySlash;
  $("touch-dash").onclick = () => { if (state.play && state.play.dash <= 0) state.play.dash = 0.22; };
  $("touch-use").onclick = tryUse;

  $("btn-new").onclick = () => { audio(); defaultPlayers(2); renderPlayers(); renderSetupOpts(); show("screen-setup"); };
  $("btn-howto").onclick = () => { audio(); show("screen-howto"); };
  $("btn-solo").onclick = () => { audio(); buildSample(); state.mode = "gauntlet"; state.chapter = 3; state.turn = 0; startPlay(0, false); };
  $("howto-back").onclick = () => show("screen-title");
  $("howto-go").onclick = () => { defaultPlayers(2); renderPlayers(); renderSetupOpts(); show("screen-setup"); };
  $("setup-back").onclick = () => show("screen-title");
  $("add-player").onclick = () => {
    if (state.players.length >= 4) return;
    const i = state.players.length;
    state.players.push({ name: NAMES[i], color: COLORS[i], hat: i });
    renderPlayers();
  };
  $("setup-go").onclick = () => {
    audio();
    const code = $("import-code").value.trim();
    if (code) {
      if (!importCode(code)) return;
      state.chapter = 3; state.turn = 0;
      startPlayChoice();
      return;
    }
    newMap(state.size.w, state.size.h);
    dirtyAll();
    state.chapter = 1;
    state.turn = 0;
    $("pass-go").textContent = "I have the pencil";
    $("pass-go").onclick = enterEditor;
    beginTurn();
  };
  $("pass-go").onclick = enterEditor;
  $("btn-erase").onclick = () => { state.erase = !state.erase; updateToolInfo(); };
  $("btn-undo").onclick = undo;
  $("btn-grid").onclick = () => { state.grid = !state.grid; };
  $("btn-pass").onclick = passPencil;
  $("btn-export").onclick = exportCode;
  $("btn-playtest").onclick = () => { state.scores = []; startPlay(state.turn, false); };
  $("btn-pause").onclick = () => {
    if (!state.play) return;
    state.play.paused = true;
    $("pause").classList.add("show");
  };
  $("pause-resume").onclick = () => { if (state.play) state.play.paused = false; $("pause").classList.remove("show"); };
  $("pause-restart").onclick = () => { $("pause").classList.remove("show"); startPlay(state.runIndex, false); };
  $("pause-edit").onclick = () => { $("pause").classList.remove("show"); enterEditor(); };
  $("pause-quit").onclick = () => { $("pause").classList.remove("show"); show("screen-title"); };
  $("res-again").onclick = () => { state.scores = []; startPlay(0, false); };
  $("res-edit").onclick = () => { state.chapter = 3; state.turn = 0; enterEditor(); };
  $("res-new").onclick = () => show("screen-title");

  window.addEventListener("resize", () => { fitEditor(); fitPlay(); });

  function persist() {
    try {
      localStorage.setItem("pass-the-atlas", JSON.stringify({
        w: state.map.w, h: state.map.h, cells: state.map.cells, players: state.players,
      }));
    } catch (_) {}
  }
  setInterval(() => { if (state.map.cells.length) persist(); }, 8000);

  // boot
  defaultPlayers(2);
  bindEditor();
  requestAnimationFrame(frame);
})();

