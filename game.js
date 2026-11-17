/* Nitro Nonsense: Cabinet Edition. Adapted from the owner's Scrap party racer.
   Four cars share one simulation. Track projection owns driving and lap gates.
   Artwork is deterministic game geometry; display type is the original Scrapline.
   No synthesized audio or generated media assets are used. */
const CABINET_KEYS = {
  P1_U: ['w'], P1_D: ['s'], P1_L: ['a'], P1_R: ['d'],
  P1_1: ['u'], P1_2: ['i'], P1_3: ['o'],
  P1_4: ['j'], P1_5: ['k'], P1_6: ['l'],
  P2_U: ['ArrowUp'], P2_D: ['ArrowDown'], P2_L: ['ArrowLeft'], P2_R: ['ArrowRight'],
  P2_1: ['r'], P2_2: ['t'], P2_3: ['y'],
  P2_4: ['f'], P2_5: ['g'], P2_6: ['h'],
  START1: ['Enter'], START2: ['2'],
};
const palette = [0xff9a2e, 0x42baf8, 0xc49bff, 0x42d07a];
const names = ['P1', 'P2', 'VIOLET', 'MENTA'];
const powers = [
  { name: 'NITRO', detail: 'Acelera a fondo durante 1 segundo.', color: 0xff9a2e, cd: 6 },
  { name: 'CAÑÓN', detail: 'Dispara y hace girar al rival.', color: 0xef6866, cd: 4 },
  { name: 'ACEITE', detail: 'Deja una mancha resbaladiza.', color: 0xc49bff, cd: 5 },
  { name: 'MINA', detail: 'Una sorpresa para quien te siga.', color: 0xf7d36b, cd: 6 },
  { name: 'ESCUDO', detail: 'Actívalo para bloquear un golpe.', color: 0x42baf8, cd: 7 },
  { name: 'ONDA', detail: 'Empuja a todos los autos cercanos.', color: 0x42d07a, cd: 5 },
];
const modifiers = [
  { name: 'ACEITE', color: 0xc49bff, detail: 'Menos agarre. Más caos.' },
  { name: 'CONO', color: 0xff9a2e, detail: 'Un obstáculo que te hace girar.' },
  { name: 'TURBO', color: 0x42d07a, detail: 'Un acelerador para todos.' },
];
const tuning = { step: 1 / 120, laps: 2, wins: 5, raceSeconds: 65, road: 38, maxModifiers: 16 };
const held = Object.create(null), pressed = Object.create(null), keyMap = Object.create(null);
for (const [code, keys] of Object.entries(CABINET_KEYS)) for (const key of keys) keyMap[key.toLowerCase()] = code;
window.addEventListener('keydown', event => {
  const code = keyMap[event.key.toLowerCase()];
  if (!code) return;
  event.preventDefault();
  if (!held[code] && !event.repeat) pressed[code] = true;
  held[code] = true;
});
window.addEventListener('keyup', event => {
  const code = keyMap[event.key.toLowerCase()];
  if (code) { event.preventDefault(); held[code] = false; }
});
function clearInput() { for (const key in held) delete held[key]; for (const key in pressed) delete pressed[key]; }
function tap(code) { const value = !!pressed[code]; delete pressed[code]; return value; }
function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }
function wrap(value, length) { return (value % length + length) % length; }
function angleDelta(a, b) { return wrap(a - b + Math.PI, Math.PI * 2) - Math.PI; }
function hex(color) { return '#' + color.toString(16).padStart(6, '0'); }

class Circuit {
  constructor() {
    const controls = [[190, 170], [420, 149], [660, 174], [704, 301], [636, 459], [443, 466], [333, 380], [149, 444], [88, 310]];
    this.points = []; this.length = 0;
    for (let i = 0; i < controls.length; i++) for (let j = 0; j < 24; j++) {
      const t = j / 24, p = [];
      for (let axis = 0; axis < 2; axis++) {
        const a = controls[wrap(i - 1, controls.length)][axis], b = controls[i][axis];
        const c = controls[(i + 1) % controls.length][axis], d = controls[(i + 2) % controls.length][axis];
        p.push(0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t));
      }
      this.points.push({ x: p[0], y: p[1] });
    }
    for (let i = 0; i < this.points.length; i++) {
      const p = this.points[i], q = this.points[(i + 1) % this.points.length];
      p.s = this.length; p.dx = q.x - p.x; p.dy = q.y - p.y;
      p.len = Math.hypot(p.dx, p.dy); this.length += p.len;
      p.angle = Math.atan2(p.dy, p.dx);
    }
  }
  at(distance, lane = 0) {
    const s = wrap(distance, this.length);
    let p = this.points[this.points.length - 1];
    for (let i = 0; i < this.points.length; i++) if (s < this.points[i].s + this.points[i].len) { p = this.points[i]; break; }
    const t = (s - p.s) / p.len;
    return { x: p.x + p.dx * t - Math.sin(p.angle) * lane, y: p.y + p.dy * t + Math.cos(p.angle) * lane, angle: p.angle, s };
  }
  project(x, y) {
    let best = Infinity, result;
    for (const p of this.points) {
      const t = clamp(((x - p.x) * p.dx + (y - p.y) * p.dy) / (p.len * p.len), 0, 1);
      const px = p.x + p.dx * t, py = p.y + p.dy * t;
      const d = (x - px) ** 2 + (y - py) ** 2;
      if (d < best) { best = d; result = { x: px, y: py, s: wrap(p.s + p.len * t, this.length), angle: p.angle, distance: Math.sqrt(d) }; }
    }
    return result;
  }
}

class Championship {
  constructor(humans = 1) {
    this.track = new Circuit(); this.humans = humans; this.round = 0;
    this.modifiers = []; this.effects = []; this.shots = []; this.hazards = [];
    this.cars = palette.map((color, id) => ({ id, color, name: id < humans ? 'P' + (id + 1) : names[id] === 'P2' ? 'AZUL' : names[id], human: id < humans, wins: 0, levels: Array(6).fill(0), slots: [-1, -1], cooldowns: [0, 0] }));
    this.phase = 'title'; this.timer = 0; this.draft = 0; this.choice = 0; this.lane = 0; this.placeS = 0;
    this.beginRace();
  }
  beginRace() {
    this.round++; this.phase = 'countdown'; this.timer = 2.5; this.elapsed = 0;
    this.shots.length = 0; this.hazards.length = 0; this.effects.length = 0; this.finishOrder = [];
    for (const c of this.cars) {
      const s = -24 - Math.floor(c.id / 2) * 30, p = this.track.at(s, c.id % 2 ? 15 : -15);
      Object.assign(c, p, { vx: 0, vy: 0, speed: 0, lap: 0, gate: 0, started: false, progress: s, lastS: p.s, shield: 0, boost: 0, stun: 0, slick: 0, contact: 0, stuck: 0, bestProgress: s, finished: false, finishTime: 0, flash: 0 });
      c.cooldowns = [0, 0];
    }
  }
  hit(car, x, y, strength) {
    if (car.finished || car.contact > 0) return false;
    if (car.shield > 0) { car.shield = 0; car.contact = 0.25; this.burst(car.x, car.y, 0x42baf8, 32); return false; }
    const length = Math.hypot(x, y) || 1;
    car.vx += x / length * strength; car.vy += y / length * strength;
    car.stun = 0.65; car.contact = 0.65; car.flash = 0.25;
    this.burst(car.x, car.y, 0xffc37b, 25); return true;
  }
  burst(x, y, color, radius) { if (this.effects.length < 40) this.effects.push({ x, y, color, radius, life: 0.55 }); }
  fire(c, slot) {
    const kind = c.slots[slot];
    if (kind < 0 || c.cooldowns[slot] > 0 || c.finished || c.stun > 0) return false;
    if (kind === 1 && this.shots.length >= 24 || (kind === 2 || kind === 3) && this.hazards.length >= 32) return false;
    const level = c.levels[kind], x = Math.cos(c.angle), y = Math.sin(c.angle);
    c.cooldowns[slot] = powers[kind].cd / (1 + (level - 1) * 0.18);
    if (kind === 0) { c.boost = 1 + level * 0.15; this.burst(c.x, c.y, powers[kind].color, 16); }
    if (kind === 1) this.shots.push({ x: c.x + x * 18, y: c.y + y * 18, vx: x * 460 + c.vx, vy: y * 460 + c.vy, owner: c.id, life: 1.4 });
    if (kind === 2 || kind === 3) this.hazards.push({ x: c.x - x * 22, y: c.y - y * 22, kind, owner: c.id, life: kind === 2 ? 12 : 18, age: 0, radius: kind === 2 ? 17 + level * 2 : 10 });
    if (kind === 4) { c.shield = 2 + level * 0.7; this.burst(c.x, c.y, powers[kind].color, 32); }
    if (kind === 5) {
      const radius = 64 + level * 10;
      this.burst(c.x, c.y, powers[kind].color, radius);
      for (const rival of this.cars) if (rival !== c && Math.hypot(rival.x - c.x, rival.y - c.y) < radius) this.hit(rival, rival.x - c.x, rival.y - c.y, 150);
    }
    return true;
  }
  upgrade(car, kind) {
    if (car.levels[kind] >= 3) return false;
    car.levels[kind]++;
    if (!car.slots.includes(kind)) {
      const empty = car.slots.indexOf(-1);
      car.slots[empty < 0 ? this.draftSlot : empty] = kind;
    }
    return true;
  }
  order() { return this.cars.slice().sort((a, b) => a.finished !== b.finished ? (a.finished ? -1 : 1) : a.finished ? a.finishTime - b.finishTime : b.progress - a.progress || a.id - b.id); }
  finishRound() {
    this.standings = this.order(); this.winner = this.standings[0]; this.winner.wins++;
    this.phase = this.winner.wins >= tuning.wins ? 'champion' : 'results'; this.timer = 0;
    this.burst(this.winner.x, this.winner.y, this.winner.color, 80);
  }
  workshop() {
    this.phase = 'workshop'; this.timer = 18; this.choice = 0; this.placeS = this.track.length * 0.22; this.lane = 0;
  }
  canPlace(s, lane) {
    const p = this.track.at(s, lane), seam = Math.min(p.s, this.track.length - p.s);
    return this.modifiers.length < tuning.maxModifiers && seam > 100 && this.modifiers.every(m => Math.hypot(m.x - p.x, m.y - p.y) > 34);
  }
  place() {
    if (!this.canPlace(this.placeS, this.lane)) return false;
    this.modifiers.push({ ...this.track.at(this.placeS, this.lane), kind: this.choice });
    return true;
  }
  nextDraft() {
    this.draft++;
    if (this.draft >= this.drafters.length) { this.beginRace(); return; }
    this.phase = 'draft'; this.timer = 15; this.choice = 0; this.draftSlot = 0;
    const c = this.drafters[this.draft];
    const available = powers.findIndex((p, i) => c.levels[i] < 3);
    if (available < 0) { this.nextDraft(); return; }
    this.choice = available;
  }
  startDraft() { this.drafters = this.standings.slice(1); this.draft = -1; this.nextDraft(); }
  step(dt, demo = false) {
    for (const e of this.effects) e.life -= dt;
    this.effects = this.effects.filter(e => e.life > 0);
    if (this.phase === 'countdown') { this.timer -= dt; if (this.timer <= 0) this.phase = 'race'; return; }
    if (this.phase !== 'race' && !demo) return;
    this.elapsed += dt;
    for (const c of this.cars) {
      if (c.finished) continue;
      for (const name of ['shield', 'boost', 'stun', 'slick', 'contact', 'flash']) c[name] = Math.max(0, c[name] - dt);
      c.cooldowns = c.cooldowns.map(v => Math.max(0, v - dt));
      let steering, brake;
      const p = this.track.project(c.x, c.y), oldS = c.lastS;
      if (!c.human || demo) {
        const target = this.track.at(p.s + 45 + c.speed * 0.1, Math.sin(c.id * 1.7 + this.elapsed * 0.2) * 8);
        steering = clamp(angleDelta(Math.atan2(target.y - c.y, target.x - c.x), c.angle) * 2.5, -1, 1);
        brake = Math.abs(angleDelta(target.angle, c.angle)) > 0.95 && c.speed > 105;
        if (!demo) for (let slot = 0; slot < 2; slot++) {
          const power = c.slots[slot];
          const near = this.cars.some(r => r !== c && !r.finished && Math.hypot(c.x - r.x, c.y - r.y) < (power === 5 ? 72 : 145));
          if ((power === 0 && Math.abs(steering) < 0.2) || (power > 0 && near)) this.fire(c, slot);
        }
      } else {
        const prefix = 'P' + (c.id + 1) + '_';
        steering = Number(!!held[prefix + 'R']) - Number(!!held[prefix + 'L']); brake = !!held[prefix + 'D'];
      }
      const forward = c.vx * Math.cos(c.angle) + c.vy * Math.sin(c.angle);
      c.angle += steering * 3.25 * clamp(Math.abs(forward) / 65, 0.1, 1) * (forward < -3 ? -1 : 1) * (c.stun > 0 ? 0.2 : 1) * dt;
      const offroad = p.distance > tuning.road;
      const speedLimit = (c.human && !demo ? 182 : 156 + c.id * 2) * (c.boost > 0 ? 1.5 : 1) * (offroad ? 0.42 : 1);
      const targetSpeed = brake ? -55 : speedLimit;
      const motor = brake && forward > 0 ? 260 : 140;
      let nextSpeed = forward + clamp(targetSpeed - forward, -motor * dt, motor * dt);
      if (c.stun > 0) nextSpeed *= 1 - dt * 1.4;
      const lateral = -c.vx * Math.sin(c.angle) + c.vy * Math.cos(c.angle);
      const slip = lateral * Math.max(0, 1 - dt * (c.slick > 0 ? 0.8 : offroad ? 4 : 9));
      c.vx = Math.cos(c.angle) * nextSpeed - Math.sin(c.angle) * slip;
      c.vy = Math.sin(c.angle) * nextSpeed + Math.cos(c.angle) * slip;
      c.x = clamp(c.x + c.vx * dt, 23, 777); c.y = clamp(c.y + c.vy * dt, 105, 508);
      c.speed = Math.hypot(c.vx, c.vy);
      const q = this.track.project(c.x, c.y), length = this.track.length;
      const ds = wrap(q.s - oldS + length / 2, length) - length / 2;
      c.lastS = q.s;
      if (q.distance < tuning.road + 5 && Math.abs(ds) < 15) {
        c.progress += ds;
        if (ds > 0) {
          if (c.gate === 0 && oldS > length * 0.9 && q.s < length * 0.1) {
            if (c.started) c.lap++; else c.started = true;
            c.gate = 1;
            if (c.lap >= tuning.laps) { c.finished = true; c.finishTime = this.elapsed; this.finishOrder.push(c.id); this.burst(c.x, c.y, c.color, 40); }
          } else if (c.gate > 0 && oldS < length * c.gate / 4 && q.s >= length * c.gate / 4) c.gate = (c.gate + 1) % 4;
        }
      }
      if (c.progress > c.bestProgress + 12) { c.bestProgress = c.progress; c.stuck = 0; } else c.stuck += dt;
      if (c.stuck > 4) {
        const safe = this.track.at(c.lastS, (c.id % 2 ? 1 : -1) * 12);
        c.x = safe.x; c.y = safe.y; c.angle = safe.angle; c.vx = 0; c.vy = 0; c.stuck = 0;
        this.burst(c.x, c.y, 0xffffff, 20);
      }
      for (const m of this.modifiers) if (Math.hypot(c.x - m.x, c.y - m.y) < (m.kind === 1 ? 18 : 22)) {
        if (m.kind === 0) c.slick = 0.8;
        if (m.kind === 1) this.hit(c, c.x - m.x || 1, c.y - m.y, 100);
        if (m.kind === 2) c.boost = 0.5;
      }
    }
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
      const a = this.cars[i], b = this.cars[j];
      if (a.finished || b.finished) continue;
      let x = b.x - a.x, y = b.y - a.y, distance = Math.hypot(x, y);
      if (distance < 21) {
        if (distance < 0.001) { x = 1; y = 0; distance = 1; }
        x /= distance; y /= distance;
        const separation = (21 - distance) * 0.5;
        a.x -= x * separation; a.y -= y * separation; b.x += x * separation; b.y += y * separation;
        const impact = (a.vx - b.vx) * x + (a.vy - b.vy) * y;
        if (impact > 0) { a.vx -= x * impact * 0.7; a.vy -= y * impact * 0.7; b.vx += x * impact * 0.7; b.vy += y * impact * 0.7; }
      }
    }
    for (const shot of this.shots) {
      shot.life -= dt; const oldX = shot.x, oldY = shot.y;
      shot.x += shot.vx * dt; shot.y += shot.vy * dt;
      for (const c of this.cars) if (c.id !== shot.owner && !c.finished) {
        const dx = shot.x - oldX, dy = shot.y - oldY;
        const fraction = clamp(((c.x - oldX) * dx + (c.y - oldY) * dy) / (dx * dx + dy * dy || 1), 0, 1);
        if (Math.hypot(c.x - oldX - dx * fraction, c.y - oldY - dy * fraction) < 14) { this.hit(c, dx, dy, 140); shot.life = 0; break; }
      }
    }
    this.shots = this.shots.filter(s => s.life > 0 && s.x > 0 && s.x < 800 && s.y > 90 && s.y < 520);
    for (const hazard of this.hazards) {
      hazard.life -= dt; hazard.age += dt;
      if (hazard.age < 0.5) continue;
      for (const c of this.cars) if (!c.finished && Math.hypot(c.x - hazard.x, c.y - hazard.y) < hazard.radius + 10) {
        if (hazard.kind === 2) c.slick = 0.7;
        else { this.hit(c, c.x - hazard.x || 1, c.y - hazard.y, 160); hazard.life = 0; this.burst(hazard.x, hazard.y, 0xf7d36b, 48); break; }
      }
    }
    this.hazards = this.hazards.filter(h => h.life > 0);
    if (!demo && (this.finishOrder.length || this.elapsed >= tuning.raceSeconds)) this.finishRound();
  }
}

let sceneRef;
window.addEventListener('blur', () => { clearInput(); if (sceneRef) sceneRef.pauseGame(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInput(); if (sceneRef) sceneRef.pauseGame(); } });

class CabinetScene extends Phaser.Scene {
  create() {
    sceneRef = this; this.match = new Championship(); this.match.phase = 'title'; this.accumulator = 0; this.age = 0; this.labels = []; this.labelIndex = 0;
    this.trackArt = this.add.graphics(); this.paintCircuit();
    this.ink = this.add.graphics(); this.overlay = this.add.graphics();
    this.best = null; this.saveMessage = ''; this.savedMatch = null; this.storageWritable = false;
    this.recordReady = this.loadRecord();
  }
  async loadRecord() {
    try {
      if (!window.platanusArcadeStorage) { this.saveMessage = 'Récord disponible en la máquina arcade'; return; }
      const record = await window.platanusArcadeStorage.get('nitro-nonsense:arcade:best');
      if (!record.found) { this.storageWritable = true; return; }
      if (!record.value || record.value.version !== 1 || !Number.isFinite(record.value.seconds) || record.value.seconds <= 0) {
        this.storageWritable = false; this.saveMessage = 'Récord anterior conservado'; return;
      }
      this.best = record.value.seconds; this.storageWritable = true;
    } catch { this.storageWritable = false; this.saveMessage = 'Sin guardado. Puedes jugar igual.'; }
  }
  async recordMatch() {
    const m = this.match;
    if (this.savedMatch === m || m.humans !== 1 || m.winner.id !== 0) return;
    this.savedMatch = m;
    await this.recordReady;
    const seconds = m.totalSeconds;
    if (!this.storageWritable || !window.platanusArcadeStorage || this.best !== null && seconds >= this.best) return;
    try {
      await window.platanusArcadeStorage.set('nitro-nonsense:arcade:best', { version: 1, seconds });
      this.best = seconds; this.saveMessage = '¡Nuevo récord guardado!';
    } catch { this.saveMessage = 'No se pudo guardar. Tu victoria cuenta.'; }
  }
  pauseGame() {
    const m = this.match;
    if (!m || m.phase === 'title' || m.phase === 'paused' || m.phase === 'champion') return;
    this.previousPhase = m.phase; m.phase = 'paused'; this.accumulator = 0;
  }
  text(value, x, y, size = 16, color = 0xf2f5fb, center = false, display = false) {
    let label = this.labels[this.labelIndex++];
    if (!label) { label = this.add.text(0, 0, '', { fontFamily: 'Arial', fontSize: 16 }).setDepth(20); this.labels.push(label); }
    label.setVisible(true).setText(value).setPosition(x, y).setOrigin(center ? 0.5 : 0, 0.5);
    label.setStyle({ fontFamily: display ? 'Scrapline, Arial Black, sans-serif' : 'Arial, sans-serif', fontSize: size + 'px', color: hex(color), fontStyle: display ? 'normal' : 'bold', align: center ? 'center' : 'left' });
    return label;
  }
  plate(x, y, w, h, color = 0x2b334a, border = 0x4a5570, g = this.overlay) {
    g.fillStyle(0x080a10).fillRoundedRect(x, y + 5, w, h, 9);
    g.fillStyle(color).fillRoundedRect(x, y, w, h, 9);
    g.lineStyle(1, border).strokeRoundedRect(x, y, w, h, 9);
  }
  paintCircuit() {
    const g = this.trackArt, track = this.match.track;
    g.clear().fillStyle(0x131b24).fillRect(0, 0, 800, 600);
    for (let i = 0; i < 105; i++) {
      const x = (i * 197 + 33) % 800, y = 105 + (i * 137) % 410;
      if (track.project(x, y).distance < 52) continue;
      g.fillStyle(i % 3 ? 0x20332e : 0x283b32).fillCircle(x, y, 2 + i % 5);
    }
    const points = track.points;
    g.lineStyle(91, 0x090e15).strokePoints(points, true);
    g.lineStyle(84, 0xe5d9c2).strokePoints(points, true);
    for (let s = 0; s < track.length; s += 16) {
      const p = track.at(s), q = track.at(s + 8);
      for (const side of [-40, 40]) {
        const a = track.at(s, side), b = track.at(s + 8, side);
        g.lineStyle(6, 0xd45845).lineBetween(a.x, a.y, b.x, b.y);
      }
    }
    g.lineStyle(74, 0x333c4c).strokePoints(points, true);
    g.lineStyle(67, 0x303948).strokePoints(points, true);
    for (let s = 0; s < track.length; s += 44) {
      const a = track.at(s), b = track.at(s + 17);
      g.lineStyle(2, 0x77818a, 0.5).lineBetween(a.x, a.y, b.x, b.y);
    }
    const p = track.at(0);
    for (let row = 0; row < 2; row++) for (let col = 0; col < 8; col++) {
      const a = track.at(row * 7 - 3, -35 + col * 9);
      g.fillStyle((row + col) % 2 ? 0x101824 : 0xf2efdf).fillRect(a.x - 4, a.y - 4, 8, 8);
    }
    for (const s of [track.length * 0.15, track.length * 0.4, track.length * 0.6, track.length * 0.82]) {
      const p = track.at(s); const a = p.angle;
      const points = [[-7, -7], [2, 0], [-7, 7], [-1, 7], [8, 0], [-1, -7]].map(([x, y]) => ({ x: p.x + x * Math.cos(a) - y * Math.sin(a), y: p.y + x * Math.sin(a) + y * Math.cos(a) }));
      g.fillStyle(0xf2efdf, 0.5).fillPoints(points, true);
    }
    g.fillStyle(0x0e1018).fillRect(0, 0, 800, 94).fillRect(0, 526, 800, 74);
    g.lineStyle(1, 0x4a5570).lineBetween(24, 94, 776, 94).lineBetween(24, 526, 776, 526);
  }
  car(c, scale = 1) {
    const g = this.ink, a = c.angle, sx = Math.cos(a), sy = Math.sin(a);
    const poly = (points, color, offset = 0) => {
      g.fillStyle(color).fillPoints(points.map(([x, y]) => ({ x: c.x + (x * sx - y * sy) * scale + offset, y: c.y + (x * sy + y * sx) * scale + offset })), true);
    };
    if (c.boost > 0) poly([[-13, -6], [-24 - Math.sin(this.age * 40) * 5, 0], [-13, 6]], 0xffbc66);
    poly([[-16, -9], [12, -9], [17, -5], [17, 5], [12, 9], [-16, 9]], 0x060a11, 3);
    for (const y of [-11, 7]) for (const x of [-12, 7]) poly([[x, y], [x + 7, y], [x + 7, y + 4], [x, y + 4]], 0x070b12);
    poly([[-16, -8], [10, -8], [16, -5], [16, 5], [10, 8], [-16, 8]], c.flash > 0 ? 0xffffff : c.color);
    poly([[-7, -6], [4, -6], [6, 6], [-7, 6]], 0x101c2b);
    poly([[-5, -5], [3, -5], [5, 5], [-5, 5]], 0x9ac4cf);
    poly([[-14, -8], [-11, -8], [-11, 8], [-14, 8]], 0x171e2c);
    poly([[10, -7], [14, -5], [14, 5], [10, 7]], 0xf4e8cb);
    if (c.shield > 0) g.lineStyle(2, 0x42baf8, 0.85).strokeCircle(c.x, c.y, 23);
  }
  drawWorld() {
    const m = this.match, g = this.ink;
    g.clear(); this.overlay.clear(); this.labelIndex = 0;
    for (const h of m.modifiers) this.modifier(h.x, h.y, h.kind);
    for (const h of m.hazards) {
      if (h.kind === 2) { g.fillStyle(0x10101c, 0.9).fillEllipse(h.x, h.y, h.radius * 2, h.radius * 1.5); g.lineStyle(2, 0x9574bd).strokeEllipse(h.x, h.y, h.radius * 1.6, h.radius); }
      else { g.fillStyle(0xf7d36b).fillCircle(h.x, h.y, 7); g.fillStyle(h.age > 0.5 && this.age % 0.3 < 0.15 ? 0xef4b4c : 0x3c3232).fillCircle(h.x, h.y, 3); }
    }
    for (const c of m.cars) {
      if (c.slick > 0 && c.speed > 40) { g.lineStyle(3, 0x11141c, 0.7).lineBetween(c.x - c.vx * 0.15, c.y - c.vy * 0.15, c.x, c.y); }
      this.car(c);
      if (c.human && ['race', 'countdown', 'workshop'].includes(m.phase)) this.text(c.name, c.x, c.y - 25, 13, c.color, true);
    }
    for (const s of m.shots) { g.lineStyle(4, 0xffdd8d).lineBetween(s.x, s.y, s.x - s.vx * 0.018, s.y - s.vy * 0.018); }
    for (const e of m.effects) g.lineStyle(3, e.color, e.life / 0.55).strokeCircle(e.x, e.y, e.radius * (1 - e.life / 0.55) + 3);
  }
  modifier(x, y, kind, valid = true) {
    const g = this.ink;
    if (kind === 0) { g.fillStyle(0x151322).fillEllipse(x, y, 38, 28); g.lineStyle(2, 0xc49bff).strokeEllipse(x, y, 30, 18); }
    if (kind === 1) { g.fillStyle(0x161b28).fillRoundedRect(x - 13, y - 5, 26, 18, 3); g.fillStyle(0xff9a2e).fillTriangle(x, y - 16, x - 10, y + 8, x + 10, y + 8); g.lineStyle(4, 0xf7ecd3).lineBetween(x - 5, y - 3, x + 5, y - 3); }
    if (kind === 2) { g.fillStyle(0x163f35).fillRoundedRect(x - 16, y - 14, 32, 28, 3); g.lineStyle(3, 0x42d07a); for (let i = -7; i < 10; i += 9) g.lineBetween(x + i - 4, y - 7, x + i + 3, y).lineBetween(x + i + 3, y, x + i - 4, y + 7); }
    if (!valid) g.lineStyle(3, 0xef4b4c).lineBetween(x - 16, y - 16, x + 16, y + 16);
  }
  hud() {
    const m = this.match;
    for (let i = 0; i < 4; i++) {
      const c = m.cars[i], x = 24 + i * 195;
      this.text(c.name, x, 24, 17, c.color); this.text(c.wins + ' / ' + tuning.wins, x + 98, 24, 18, 0xf2f5fb);
      for (let win = 0; win < tuning.wins; win++) this.ink.fillStyle(win < c.wins ? c.color : 0x2b334a).fillRoundedRect(x + win * 30, 42, 23, 6, 2);
      this.text(c.finished ? 'META' : 'VUELTA ' + Math.min(tuning.laps, c.lap + 1) + ' / ' + tuning.laps, x, 72, 13, 0xcbd4e4);
    }
    if (m.phase === 'race') {
    this.text('RONDA ' + m.round, 440, 264, 15, 0x8c98af, true);
    this.text('NITRO', 440, 296, 34, 0xff9a2e, true, true);
    this.text('NONSENSE', 440, 329, 24, 0xf2f5fb, true, true);
    const remaining = Math.max(0, tuning.raceSeconds - m.elapsed);
    this.text(m.phase === 'race' ? remaining.toFixed(1) + ' s' : 'GANA 5 CARRERAS', 440, 357, 14, 0xcbd4e4, true);
    }
    for (let id = 0; id < m.humans; id++) {
      const c = m.cars[id], x = id * 394 + 24;
      this.text(c.name, x, 548, 15, c.color);
      for (let slot = 0; slot < 2; slot++) {
        const kind = c.slots[slot], px = x + 38 + slot * 145;
        const p = kind < 0 ? null : powers[kind], cd = c.cooldowns[slot];
        this.text((slot + 1) + '  ' + (p ? p.name : 'VACÍO'), px, 546, 13, p ? p.color : 0x8c98af);
        this.ink.fillStyle(0x2b334a).fillRect(px, 562, 125, 5);
        if (p) this.ink.fillStyle(cd > 0 ? 0x4a5570 : p.color).fillRect(px, 562, 125 * clamp(1 - cd / (p.cd / (1 + (c.levels[kind] - 1) * 0.18)), 0, 1), 5);
      }
    }
    if (m.humans === 1) this.text('LOS PERDEDORES GANAN PODERES', 420, 550, 14, 0x8c98af);
    this.text('← → girar   ↓ frenar / reversa   1 / 2 poderes   START pausa', 400, 586, 14, 0xcbd4e4, true);
  }
  dim(alpha = 0.93) { this.overlay.fillStyle(0x0e1018, alpha).fillRect(0, 0, 800, 600); }
  key(label, x, y, width = 310, accent = true) {
    this.plate(x, y, width, 48, accent ? 0xff9a2e : 0x2b334a, accent ? 0xffbf77 : 0x4a5570);
    this.text(label, x + width / 2, y + 24, 18, accent ? 0x0e1018 : 0xf2f5fb, true);
  }
  title() {
    this.overlay.fillStyle(0x0e1018, 0.88).fillRect(0, 0, 800, 600);
    this.overlay.fillStyle(0xff9a2e).fillRect(35, 39, 6, 20);
    this.text('PLATANUS HACK 26  /  SANTIAGO', 55, 49, 15, 0xcbd4e4);
    this.text('NITRO', 55, 139, 82, 0xff9a2e, false, true);
    this.text('NONSENSE', 55, 217, 66, 0xf2f5fb, false, true);
    this.text('EL GANADOR CAMBIA LA PISTA.', 57, 286, 22, 0xf2f5fb);
    this.text('LOS DEMÁS SE VUELVEN MÁS PELIGROSOS.', 57, 317, 18, 0xcbd4e4);
    this.key('START 1   ·   JUGAR SOLO', 55, 365, 336);
    this.key('START 2   ·   DOS JUGADORES', 408, 365, 336, false);
    this.text('4 AUTOS', 57, 457, 20, 0xff9a2e, false, true);
    this.text('2 VUELTAS', 280, 457, 20, 0xff9a2e, false, true);
    this.text('5 VICTORIAS', 533, 457, 20, 0xff9a2e, false, true);
    this.text('Aceleración automática  ·  ← → girar  ·  ↓ frenar / reversa', 400, 503, 17, 0xf2f5fb, true);
    this.text('Teclado: P1 A/D/S + U/I     P2 flechas + R/T     Enter / 2 iniciar', 400, 541, 14, 0x8c98af, true);
    this.text(this.best !== null ? 'MEJOR CAMPEONATO SOLO  ' + this.best.toFixed(1) + ' s' : 'CARRERAS CORTAS. RENCOR PARA RATO.', 400, 577, 13, 0xcbd4e4, true);
  }
  results(champion = false) {
    const m = this.match;
    this.dim();
    this.text(champion ? 'DUEÑO DEL ASFALTO' : 'RESULTADO DE LA RONDA', 400, 65, 30, 0xff9a2e, true, true);
    this.text(m.winner.name + (champion ? ' GANA EL CAMPEONATO' : ' GANA LA RONDA ' + m.round), 400, 113, 22, m.winner.color, true);
    const ranking = champion ? m.cars.slice().sort((a, b) => b.wins - a.wins || a.id - b.id) : m.standings;
    for (let i = 0; i < ranking.length; i++) {
      const c = ranking[i], y = 153 + i * 65;
      this.plate(115, y, 570, 52, i === 0 ? 0x333b4c : 0x1a1f2e);
      this.text(String(i + 1).padStart(2, '0'), 137, y + 26, 23, 0x8c98af, false, true);
      this.text(c.name, 200, y + 26, 22, c.color);
      this.text(c.wins + ' / ' + tuning.wins + ' victorias', 445, y + 26, 18);
    }
    this.text(champion ? 'Una pista cada vez más tuya. Una revancha pendiente.' : m.winner.name + ' modifica la pista. Los demás mejoran un poder.', 400, 449, 17, 0xcbd4e4, true);
    this.key(champion ? '1   REVANCHA' : '1 / START   CONTINUAR', 225, 480, 350);
    this.text(champion ? '2  VOLVER AL INICIO' : 'Continuación automática en ' + Math.max(0, Math.ceil(7 - m.timer)) + ' s', 400, 557, 15, 0x8c98af, true);
    if (champion) this.text(this.saveMessage, 400, 585, 13, 0xcbd4e4, true);
  }
  workshopScreen() {
    const m = this.match, p = m.track.at(m.placeS, m.lane), valid = m.canPlace(m.placeS, m.lane);
    this.overlay.fillStyle(0x0e1018).fillRect(0, 0, 800, 100).fillRect(0, 526, 800, 74);
    this.text(m.winner.name + '  ·  TU PISTA, TUS REGLAS', 24, 31, 22, m.winner.color);
    this.text('← → recorrer pista   ↑ ↓ elegir carril   1 colocar   2 cambiar pieza', 24, 68, 16, 0xf2f5fb);
    this.text(Math.ceil(m.timer) + ' s', 724, 34, 20, 0xcbd4e4);
    this.modifier(p.x, p.y, m.choice, valid);
    this.ink.lineStyle(3, valid ? 0x42baf8 : 0xef4b4c).strokeCircle(p.x, p.y, 28 + Math.sin(this.age * 5) * 2);
    this.plate(257, 246, 286, 123, 0x1a1f2e);
    this.text(modifiers[m.choice].name, 400, 275, 23, modifiers[m.choice].color, true, true);
    this.text(modifiers[m.choice].detail, 400, 309, 15, 0xcbd4e4, true);
    this.text('Queda para las próximas carreras.', 400, 341, 14, 0xcbd4e4, true);
    this.text(valid ? '1  COLOCAR  ·  START  OMITIR' : 'Busca otro lugar  ·  START omitir', 400, 553, 19, valid ? 0xf2f5fb : 0xef6866, true);
    this.text('Fuera de la salida y separada de otras piezas. ' + m.modifiers.length + ' / ' + tuning.maxModifiers, 400, 585, 14, 0x8c98af, true);
  }
  draftScreen() {
    const m = this.match, c = m.drafters[m.draft];
    this.dim(0.96);
    this.text('PERDER TIENE SUS VENTAJAS', 400, 49, 29, 0xff9a2e, true, true);
    this.text(c.name + '  ·  ELIGE UNA MEJORA', 400, 91, 22, c.color, true);
    this.text('↑ ↓ fila   ← → columna   1 elegir   2 cambiar ranura', 400, 126, 16, 0xcbd4e4, true);
    for (let i = 0; i < 6; i++) {
      const p = powers[i], x = 39 + (i % 3) * 244, y = 158 + Math.floor(i / 3) * 123, selected = m.choice === i;
      this.plate(x, y, 232, 109, selected ? 0x3c4661 : 0x1a1f2e, selected ? 0x42baf8 : 0x4a5570);
      this.text(p.name, x + 17, y + 26, 21, p.color, false, true);
      this.text(c.levels[i] >= 3 ? 'NIVEL MÁXIMO' : 'NIVEL ' + c.levels[i] + ' → ' + (c.levels[i] + 1), x + 17, y + 60, 14, 0xcbd4e4);
      for (let level = 0; level < 3; level++) this.overlay.fillStyle(level < c.levels[i] ? p.color : 0x4a5570).fillRect(x + 17 + level * 62, y + 86, 53, 5);
    }
    this.text(powers[m.choice].detail, 400, 432, 18, 0xf2f5fb, true);
    const slot = m.draftSlot;
    this.text('SI LAS DOS ESTÁN LLENAS, REEMPLAZA LA RANURA ' + (slot + 1), 400, 470, 14, 0x8c98af, true);
    for (let i = 0; i < 2; i++) {
      this.plate(153 + i * 250, 496, 242, 46, i === slot ? 0x3c4661 : 0x1a1f2e, i === slot ? 0x42baf8 : 0x4a5570);
      this.text((i + 1) + '  ' + (c.slots[i] < 0 ? 'VACÍO' : powers[c.slots[i]].name), 274 + i * 250, 519, 18, 0xf2f5fb, true);
    }
    this.text('Mejora automática en ' + Math.ceil(m.timer) + ' s · Las mejoras anteriores se conservan.', 400, 578, 14, 0xcbd4e4, true);
  }
  menuInput(dt) {
    const m = this.match;
    if (m.phase === 'title') {
      const solo = tap('START1') || tap('P1_1'), duo = tap('START2') || tap('P2_1');
      if (solo || duo) { this.match = new Championship(duo ? 2 : 1); this.match.totalSeconds = 0; clearInput(); this.accumulator = 0; }
    } else if (m.phase === 'paused') {
      if (tap('START1') || tap('START2') || tap('P1_1') || tap('P2_1')) { m.phase = this.previousPhase; clearInput(); this.accumulator = 0; }
    } else if (m.phase === 'race') {
      if (tap('START1') || m.humans > 1 && tap('START2')) { this.pauseGame(); return; }
      for (let id = 0; id < m.humans; id++) for (let slot = 0; slot < 2; slot++) if (tap('P' + (id + 1) + '_' + (slot + 1))) m.fire(m.cars[id], slot);
    } else if (m.phase === 'results') {
      m.timer += dt;
      if (m.timer > 0.8 && (tap('P1_1') || tap('P2_1') || tap('START1') || tap('START2') || m.timer > 7)) { m.workshop(); clearInput(); }
    } else if (m.phase === 'workshop') {
      m.timer -= dt;
      if (!m.winner.human) {
        if (m.timer < 16.5) {
          m.choice = (m.round + m.winner.id) % 3;
          for (let i = 0; i < 24; i++) { m.placeS = m.track.length * wrap(m.round * 0.137 + i * 0.07, 1); m.lane = (i % 3 - 1) * 22; if (m.place()) break; }
          m.startDraft(); clearInput();
        }
      } else {
        const p = 'P' + (m.winner.id + 1) + '_';
        m.placeS = wrap(m.placeS + (Number(!!held[p + 'R']) - Number(!!held[p + 'L'])) * 220 * dt, m.track.length);
        if (tap(p + 'U')) m.lane = clamp(m.lane - 22, -22, 22);
        if (tap(p + 'D')) m.lane = clamp(m.lane + 22, -22, 22);
        if (tap(p + '2')) m.choice = (m.choice + 1) % 3;
        if (tap(p + '1') && m.place() || tap('START' + (m.winner.id + 1)) || m.timer <= 0) { m.startDraft(); clearInput(); }
      }
    } else if (m.phase === 'draft') {
      m.timer -= dt;
      const c = m.drafters[m.draft], p = 'P' + (c.id + 1) + '_';
      if (c.human) {
        if (tap(p + 'L')) m.choice = Math.floor(m.choice / 3) * 3 + wrap(m.choice - 1, 3);
        if (tap(p + 'R')) m.choice = Math.floor(m.choice / 3) * 3 + (m.choice + 1) % 3;
        if (tap(p + 'U') || tap(p + 'D')) m.choice = (m.choice + 3) % 6;
        if (tap(p + '2')) m.draftSlot = 1 - m.draftSlot;
      } else if (m.timer < 14) m.choice = (m.round + c.id * 2) % 6;
      const automatic = c.human ? m.timer <= 0 : m.timer < 14;
      if (automatic && c.levels[m.choice] >= 3) m.choice = powers.findIndex((p, i) => c.levels[i] < 3);
      if ((automatic || c.human && tap(p + '1')) && m.upgrade(c, m.choice)) { m.nextDraft(); clearInput(); }
    } else if (m.phase === 'champion') {
      this.recordMatch(); m.timer += dt;
      if (m.timer > 1 && (tap('P1_1') || tap('P2_1') || tap('START1') || tap('START2'))) { this.match = new Championship(m.humans); this.match.totalSeconds = 0; clearInput(); }
      else if (m.timer > 1 && (tap('P1_2') || tap('P2_2'))) { this.match = new Championship(); this.match.phase = 'title'; clearInput(); }
    }
  }
  update(time, delta) {
    const dt = Math.min(delta / 1000, 0.1); this.age += dt;
    this.menuInput(dt); const m = this.match;
    this.accumulator += dt;
    while (this.accumulator >= tuning.step) {
      if (m.phase === 'title') {
        m.step(tuning.step, true);
        if (m.elapsed > 45) { this.match = new Championship(); this.match.phase = 'title'; this.accumulator = 0; break; }
      } else {
        const previous = m.phase;
        m.step(tuning.step);
        if (previous === 'race' || previous === 'countdown') m.totalSeconds += tuning.step;
      }
      this.accumulator -= tuning.step;
    }
    this.drawWorld();
    if (m.phase === 'title') this.title();
    else {
      if (m.phase === 'race' || m.phase === 'countdown') this.hud();
      if (m.phase === 'countdown') {
        this.plate(309, 223, 182, 154, 0x1a1f2e);
        this.text(m.timer > 0.5 ? String(Math.ceil(m.timer - 0.5)) : '¡YA!', 400, 275, 58, 0xff9a2e, true, true);
        this.text('← → GIRAR', 400, 337, 18, 0xf2f5fb, true);
      }
      if (m.phase === 'results' || m.phase === 'champion') this.results(m.phase === 'champion');
      if (m.phase === 'workshop') this.workshopScreen();
      if (m.phase === 'draft') this.draftScreen();
      if (m.phase === 'paused') {
        this.dim(0.9); this.text('EN EL GARAJE', 400, 249, 42, 0xff9a2e, true, true);
        this.text('La carrera espera por ti.', 400, 309, 22, 0xf2f5fb, true);
        this.key('START / 1   CONTINUAR', 235, 366, 330);
      }
    }
    for (let i = this.labelIndex; i < this.labels.length; i++) this.labels[i].setVisible(false);
    for (const key in pressed) delete pressed[key];
  }
}
function bootCabinet() {
  new Phaser.Game({ type: Phaser.AUTO, width: 800, height: 600, parent: 'game-root', backgroundColor: '#0e1018', audio: { noAudio: true }, scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, scene: CabinetScene });
}
/* Original Scrapline font, subset and conventionally WOFF-compressed. */
const displayFont = new FontFace('Scrapline', 'url(data:font/woff;base64,d09GRk9UVE8AAAtEAAkAAAAAE2gAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAABDRkYgAAAA6AAACGgAAA+xgSbo\x2fU9TLzIAAAoQAAAARQAAAGBpzGX2Y21hcAAACuQAAABRAAAAZgGpAh1oZWFkAAAJUAAAADYAAAA2MdoGIGhoZWEAAAn0AAAAGwAAACQDQAUWaG10eAAACYgAAABpAAAAtJjIAABtYXhwAAAA4AAAAAYAAAAGAC1QAG5hbWUAAApYAAAAigAAARYUOS6icG9zdAAACzgAAAAMAAAAIAADAAAAAFAAAC0AAHicvVd7cFRXGd9N9kd4hIVUboYysbZxasGGCC0FrE4KVpzSwVIqwSoIpQ01FApJCE1Dskn2kX3k7Oa1Cck2IA9pEUsjRex06BQLUyeISk2nMmKt044DKuM0ODI95+45i37nbngkd0H+cjLJ4Z57zvf4fd\x2fv912cDleWw+l05n3nmaq1FRvXb1r3xLofbt24tkpv3iWKHGJmlijOFlNdTC403y\x2fAK+CFk1jBpNdv40V5jilOZ1a2C2Nyxo4bPyF3onvS5LzbPl88b9bs++6f88DcefO\x2fWvzgXQ\x2fNvPcrK9ZVbVm\x2fedOds4pnX3V057CnqxsOh5N+HIW3O0OTHTMpLIfLkeNY5ix0Pu\x2f8R9acrIqss9n52fdn92V\x2f5BrnWu7qghNtYyaN+VnOwpznc06M\x2fdzYX4z9aFz+uMXj\x2fjU+f3z1+E8mTJ3QlpuTe2+umlgzMTLxpxNPuyvcfvd+91vin24x2Z3s38gMsc10YJBhdwSJEOJ+RJsQ9KCxFoxBfVsNQKwxHYZYl3JAvkFb6+j8bDXfMKczsHuQosWdrGLMYPTCfJ9hXxi7\x2fEh4EK9BaxWYqka4Cv4aeDyo8aMqjMtjyeJxur4SZpPaaCRi6GlDPI62HsQSYEOIJBDqgT+OxjZ4YlAVDJ4IGkPw+xFqRMSjXcc8aGvUIfeEkIhAPM0P2kwN2Ew9bTe1dLQpd3J10kUxpr7PIEtkCSUxWedCGVFelB3laB5jOlJ1iWmzZJxckCNyx\x2fhe8CyeBdGvsam\x2fgs1JhldDeNmLnbXorkTbBjK7BKEN8FaithaVXmwIIXX5GjZPEjbnzpG9N2xZbLNnIf9uT2Nu6VVrTP3eCoPX06MuZj29Mv+cLqJe5JcNc3v6US+y5Pq37mTh\x2fzJ1Mn1YL3KOYfrSjz6rPZJTNZqbboImNQ7jO6FWWNc4HWUbEGlEyAd\x2fQCfqaYEUN8H6hHYUvHGQYhUb8Zz6phhj0KZ2p2hx8zM3vuw2feZ0esvU0dHNrA4x1Mbg6YC3G80JRHZSUHPAXXRz0eiK8CaG0S0qqlHKhv0SVDcOwizTIG5XE\x2fC9IYiTfD9Uk1xkmH9SS6ECRM0V3EuRJm9WqCHD3J0uDC3uAtdnGQ670oc\x2f0bSfor4APijoz0vkYCBVitQ3zFIkd6ccIwHKCP2wpb\x2fp9ligHkexLMTlAvEXJGdcue+6cn\x2ffIDOqWlEThycB\x2fy6E9xE0S9LF1X1pk5UlkFkyCw8PGYODBPkpG0cIkkWLqBlPZaD3FU4esxuWAVuJzzBrWx6+xs2Nsv4WdGvVLejW\x2fzV1\x2fiF\x2fksRc5UFSA8hf8dj16n0yAxrfRaQGgXo0NaE+gJoI1JBG450RaLwgF9jQ+LktqmftaDxjU\x2fEnvAbfrKZB\x2foji2yym6WqZWhRT+xhmz9bChFgtOjzo9iLRjJ0Ri\x2ft0tceaX2QsptUwX9snL+RLqwfF\x2fanV+CaZsUR1r6YqEZZoS+QlCqsTdnk5oFOhhCgtSo5SFJ9qnXFf1+xvGeaRNKVo4YfUDoOJHWliqB2aGGxYOEZL3tfpeAknORQrIDUPVHG6rqrEHgiphDx8TSb28fWantPUESSq0fEiIlaFXmxGRURPbrmc6LqMaprsZ4Yar\x2f4IXyO8XjT60dAMTxh1LfrYXAbxRTrlLkCUryKLfJc6qIdT6wsI1qGhETWBKxYfpN9f01kxS71r8GPiOXxMsLegO4SOIKJ+RLwINFhHf6M84OfF6wbBsRY9W9Beg1CdFWAAm9PmvkW\x2fPWIezE7+A0MeUR8jSPf98DfDG4I3jCYrwvsIpHd1hMmXeLs1Zkgt1BRGg0Znd44ZKb0jH2PUvta5II\x2frRHrkcsg75GNQceFG8jzB8Kh8D4vPgf+Wb4VcQ\x2fOOqedIEwlSSkaLAt1LutIT4bSaD3Ha+vdllzXpxWkxn\x2fYZSoeuqXUm5q7EhQswt2Tg7UoUFaFkyBgYoP77IJNaLF1KrfuBjRR3838bapm6E9t\x2fBx\x2fNmD609qE7gUQX+mLoC0Pki1w0LkaXB7E6hOvg9cDjQ10Eda1wi6O9Yj0Vg+bS8RmQhyTNpwdUzigFf\x2fSAxjeaQQPy0dKEsBfNPl0hbzPULvkTiKPptr9owXOAWuk9fhzdHeiMo6MLrd2Ibgc7A3VBU2aBZd13K9+H+qNBA\x2f42Q28UXe3o7ER7F6K9hFoe1PL0W73QY0svgl0IdMLXjoYo1NvWB4f4JXlT06iIsogCu12X7ktqjGGeT8dMi3hKd8AIBBboDrA+7O4ZFv08K8sfWyH3Nlghb6HtblvI0XRQAxlDHh3jh9RE\x2fOzVLlqdqYuW4dIliM1WLFJDLHMhiHF7IuijvqDuqENsK21vGzEMLticPZyeBUWINqDdh84AuoLobdEFt9K9eLWK5l4iyUoSLUmDQKwUOyxS8L8ajD+iozHXZHBPVFowaIxO+k1bGKRpDS3wBREIIOhDCynF6tEhySo1w9gaQx1RgojRh8gewu8sLFLKgygs1OyxZl6WzcGzdgfybnvSq2msVhhSz1bGtyG2B\x2fE+9PSgL449MZj0xc81nEx1IpX+xBe6E85o0gV74etCQzvqYqi6Ed4Z4ijC4CL6wHwnGDR4hW7bCsgKlmGHnRl14BRvpRp9TQGyII5ynkJY\x2fcfgZfpMGSStbnPTm3oUPM7QH8bhBvRX4uVy9JahtRzsKYTL0VCGynKUV6KsAeVhPMTga0E0is42XbFYB1gIoWX0bd6NttPoeA19h7D\x2fVfTvxqHteK0Vf2CIRxGKaG1uJp0PIRoHewUtccRI\x2fP2IN6ON3lLyjxB8C1XpyAhJR\x2flFQ1TrIuZAVeutz6ytHcNbtPI19D8OLZ48h1lS6Tbv8NTQiDOng1NV1LTUdLj\x2fC\x2fklmPUAAQAAAAEAAEkLqj5fDzz1AAMD6AAAAADnB+E7AAAAAOcH4Tv\x2fZ\x2f9TBUwDdwAAAAMAAgAAAAAAAHicY4pgYGCsYWBgkWJgYL4HxKeA+AUQLwLiPqjYJ6AaJwYGpndQfhpQ\x2fTeIOIsARA+YhumvQsix9gBpNggfLAdUw6QGpLcB8RqonjVQuW1QGogZdaDYDKj+FhBbAXESEHcxMAAAEkIbRwAAAHicY2BkYGC2++\x2fEwMC6jAECGBlQgS4APnsCXQB4nGNgZuZm\x2fMLAysDA1MW0m4GBoQdCM95nMGRkYkAFjMicCCBgcGBQYIhitvvvxMDAXM6wFqaG8RpTDlBGgYEBADaNC4gAAAB4nIWOPQ6CQBCFP36U0FgYYr3xAARbSg9AIYmFHQFCSAga1Ct4Cg\x2fri7sVIaF4M9+bmX1ZIOJGgBfGgC9Z9tjLWfbZkTgOOHN0HIoaxxsOfBxvMXylkpqJigcDPSMtF6njLV9pU2j6Ur\x2frtlAdeWpva7743swS1i+ucpMS+3++ISPltPazH\x2famJvgAAHicRYw7CoAwAENfqaNDj6CLiB901UW8Rm\x2frdUTPEEMXE0LgQQIEogM1Fdmd7OhuGVnY2DnIkkljMrMWchZi6dGrW5c\x2fUln\x2fCvQMdEwfqgsPvgAAAHicY2BmwAsAAH0ABA==)');
displayFont.load().then(font => { document.fonts.add(font); bootCabinet(); }).catch(bootCabinet);
