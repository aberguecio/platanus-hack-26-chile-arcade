/* Nitro Nonsense: Cabinet Edition. Adapted from the owner's Scrap party racer.
   Four cars share one simulation with seeded track geometry and physical lap gates.
   Artwork is deterministic game geometry; display type is the original Scrapline.
   Music: 8-bit-style edit of Ska del Último Perno, from the original Scrap soundtrack. */
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
const powerKeys = [1, 2, 3, 4, 5, 6];
const powerKey = (id, slot) => CABINET_KEYS['P' + (id + 1) + '_' + (slot + 1)][0].toUpperCase();
const powers = [
  { name: 'NITRO', detail: 'Acelera a fondo durante 1 segundo.', color: 0xff9a2e, cd: 6 },
  { name: 'CAÑÓN', detail: 'Dispara y hace girar al rival.', color: 0xef6866, cd: 4 },
  { name: 'ACEITE', detail: 'Deja una mancha resbaladiza.', color: 0xc49bff, cd: 5 },
  { name: 'MINA', detail: 'Una sorpresa para quien te siga.', color: 0xf7d36b, cd: 6 },
  { name: 'ESCUDO', detail: 'Actívalo para bloquear un golpe.', color: 0x42baf8, cd: 7 },
  { name: 'ONDA', detail: 'Empuja a todos los autos cercanos.', color: 0x42d07a, cd: 5 },
];
const modifiers = [
  { name: 'ACEITE', color: 0xc49bff, detail: 'Pierdes agarre al pisarlo.', radius: 22 },
  { name: 'CONO', color: 0xff9a2e, detail: 'Un golpe que te hace girar.', radius: 18 },
  { name: 'TURBO', color: 0x42d07a, detail: 'Velocidad para quien lo pise.', radius: 22 },
  { name: 'BARRERA', color: 0xef6866, detail: 'Un bloqueo de alto impacto.', radius: 25 },
  { name: 'MINA FIJA', color: 0xf7d36b, detail: 'Explota y se recarga en 3 s.', radius: 20 },
  { name: 'PINCHOS', color: 0xcbd4e4, detail: 'Te frenan durante 1.8 s.', radius: 21 },
  { name: 'RAMPA', color: 0x42baf8, detail: 'Salta sobre autos y trampas.', radius: 22 },
  { name: 'MARTILLO', color: 0xf08db9, detail: 'Recorre el tramo y avisa antes de golpear.', radius: 25 },
  { name: 'PUERTAS', color: 0x52e5be, detail: 'Un carril abre y el otro se cierra.', radius: 0 },
];
const hammerKind = 7, doorsKind = 8, hammerReach = 92, doorInterval = 2.6;
const tuning = { step: 1 / 120, pace: 1.12, laps: 2, wins: 5, road: 38, gateWidth: 80, maxModifiers: 16 };
const trackSizes = [{ name: 'COMPACTA', width: 1060, height: 760 }, { name: 'GRANDE', width: 1640, height: 1080 }];
const held = Object.create(null), pressed = Object.create(null), keyMap = Object.create(null);
for (const [code, keys] of Object.entries(CABINET_KEYS)) for (const key of keys) keyMap[key.toLowerCase()] = code;
window.addEventListener('keydown', event => {
  const code = keyMap[event.key.toLowerCase()];
  if (!code) return;
  event.preventDefault();
  if (!held[code] && !event.repeat) { pressed[code] = true; playMusic(); }
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

function newSeed() { return (Math.random() * 4294967296) >>> 0 || 1; }
function doorSide(time) { return Math.floor(time / doorInterval) % 2 ? 1 : -1; }

class Circuit {
  constructor(seed, size) {
    this.seed = seed >>> 0;
    this.size = size;
    const { width, height } = trackSizes[size];
    this.width = width; this.height = height;
    let state = this.seed || 1;
    const random = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; };
    const notch = width * (0.48 + random() * 0.10), shoulder = height * (0.65 + random() * 0.12);
    const left = 110 + random() * 70, right = width - 105 - random() * 45;
    const top = 110 + random() * 38, bottom = height - 105 - random() * 30;
    const slant = 75 + random() * 55;
    const corners = [
      [right - slant, top, 105], [right, top + slant, 112], [right, bottom, 118],
      [notch + 110, bottom, 88], [notch - 10, shoulder, 111], [left, shoulder + 20, 107],
      [left, top + 105, 94], [left + 75, top, 83],
    ];
    this.points = [{ x: width * 0.42, y: top }];
    this.sections = [{ kind: 'straight', start: 0 }];
    for (let i = 0; i < corners.length; i++) {
      const [x, y, radius] = corners[i], a = corners[wrap(i - 1, corners.length)], b = corners[(i + 1) % corners.length];
      const before = Math.hypot(a[0] - x, a[1] - y), after = Math.hypot(b[0] - x, b[1] - y);
      const cut = Math.min(radius * (0.85 + random() * 0.31), before * 0.42, after * 0.42);
      const start = { x: x + (a[0] - x) * cut / before, y: y + (a[1] - y) * cut / before };
      const end = { x: x + (b[0] - x) * cut / after, y: y + (b[1] - y) * cut / after };
      this.sections.push({ kind: 'curve', start: this.points.length });
      const samples = Math.ceil(cut / 7);
      for (let j = 0; j < samples; j++) {
        const t = j / samples, u = 1 - t;
        this.points.push({ x: u * u * start.x + 2 * u * t * x + t * t * end.x, y: u * u * start.y + 2 * u * t * y + t * t * end.y });
      }
      this.sections.push({ kind: 'straight', start: this.points.length });
      this.points.push(end);
    }
    this.length = 0;
    for (let i = 0; i < this.points.length; i++) {
      const p = this.points[i], q = this.points[(i + 1) % this.points.length];
      p.s = this.length; p.dx = q.x - p.x; p.dy = q.y - p.y;
      p.len = Math.hypot(p.dx, p.dy); this.length += p.len;
      p.angle = Math.atan2(p.dy, p.dx);
    }
    for (const section of this.sections) section.s = this.points[section.start].s;
    this.gates = Array.from({ length: 4 }, (_, id) => this.at(this.length * id / 4));
    this.seconds = Math.max(65, Math.ceil(this.length * tuning.laps / 105) + 12);
    this.buildings = [];
    for (let row = 0, y = 245; y < height - 170; row++, y += 115) {
      for (let x = 210 + row % 2 * 46; x < width - 170; x += 141) {
        const w = 62 + random() * 36, h = 52 + random() * 26, cx = x + random() * 25, cy = y + random() * 22;
        if (this.project(cx, cy).distance >= Math.hypot(w, h) / 2 + tuning.road + 16) {
          this.buildings.push({ left: cx - w / 2, right: cx + w / 2, top: cy - h / 2, bottom: cy + h / 2 });
        }
      }
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
      if (d < best) { best = d; result = { x: px, y: py, s: p.s + p.len * t, angle: p.angle }; }
    }
    if (result.s >= this.length) result.s = 0;
    result.distance = Math.sqrt(best);
    return result;
  }
  blocks(x, y, radius) {
    return this.buildings.some(b => {
      const dx = x - clamp(x, b.left, b.right), dy = y - clamp(y, b.top, b.bottom);
      return dx * dx + dy * dy < radius * radius;
    });
  }
  crossesGate(index, x, y, car) {
    const gate = this.gates[index], cos = Math.cos(gate.angle), sin = Math.sin(gate.angle);
    const ax = x - gate.x, ay = y - gate.y, bx = car.x - gate.x, by = car.y - gate.y;
    const before = ax * cos + ay * sin, after = bx * cos + by * sin;
    if (before >= 0 || after < 0) return false;
    const fraction = -before / (after - before);
    return Math.abs(-(ax + (bx - ax) * fraction) * sin + (ay + (by - ay) * fraction) * cos) < tuning.gateWidth;
  }
}

class Championship {
  constructor(humans = 1, seed = newSeed(), size = 0) {
    this.track = new Circuit(seed, size); this.humans = humans; this.round = 0;
    this.modifiers = []; this.effects = []; this.shots = []; this.hazards = [];
    this.cars = palette.map((color, id) => ({ id, color, name: id < humans ? 'P' + (id + 1) : names[id] === 'P2' ? 'AZUL' : names[id], human: id < humans, wins: 0, levels: Array(powers.length).fill(0), slots: powerKeys.map(() => -1) }));
    this.phase = 'title'; this.timer = 0; this.draft = 0; this.choice = 0; this.lane = 0; this.placeS = 0;
    this.beginRace();
  }
  beginRace() {
    for (const modifier of this.modifiers) modifier.readyAt = 0;
    this.round++; this.phase = 'countdown'; this.timer = 2.5; this.elapsed = 0;
    this.shots.length = 0; this.hazards.length = 0; this.effects.length = 0; this.finishOrder = [];
    for (const c of this.cars) {
      const s = -24 - Math.floor(c.id / 2) * 30, p = this.track.at(s, c.id % 2 ? 15 : -15);
      Object.assign(c, p, { vx: 0, vy: 0, speed: 0, lap: 0, gate: 0, gateTravel: 0, started: false, progress: s, safeS: p.s, shield: 0, boost: 0, stun: 0, slick: 0, air: 0, slow: 0, contact: 0, stuck: 0, bestProgress: s, finished: false, finishTime: 0, flash: 0 });
      c.cooldowns = powerKeys.map(() => 0);
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
  upgrade(car, kind, slot) {
    const previous = car.slots.indexOf(kind);
    if (car.levels[kind] >= 3 || (previous >= 0 ? slot !== previous : car.slots[slot] !== -1)) return false;
    car.slots[slot] = kind;
    car.levels[kind]++;
    return true;
  }
  order() { return this.cars.slice().sort((a, b) => a.finished !== b.finished ? (a.finished ? -1 : 1) : a.finished ? a.finishTime - b.finishTime : b.progress - a.progress || a.id - b.id); }
  finishRound() {
    this.standings = this.order(); this.winner = this.standings[0]; this.winner.wins++;
    this.phase = this.winner.wins >= tuning.wins ? 'champion' : 'results'; this.timer = 0; this.endChoice = 0;
    this.burst(this.winner.x, this.winner.y, this.winner.color, 80);
  }
  workshop() {
    this.phase = 'workshop'; this.workshopMode = 'choice'; this.timer = 18; this.choice = 0; this.placeS = this.track.length * 0.22; this.lane = 0;
  }
  canPlace(s, lane) {
    const p = this.track.at(s, this.choice === doorsKind ? 0 : lane), seam = Math.min(p.s, this.track.length - p.s);
    const reach = this.choice === hammerKind ? hammerReach : 0;
    return this.modifiers.length < tuning.maxModifiers && seam > 100 + reach && this.modifiers.every(m => {
      const distance = Math.abs(m.s - p.s);
      return Math.hypot(m.x - p.x, m.y - p.y) > 34 &&
        Math.min(distance, this.track.length - distance) > 25 + reach + (m.kind === hammerKind ? hammerReach : 0);
    });
  }
  place() {
    if (!this.canPlace(this.placeS, this.lane)) return false;
    const lane = this.choice === doorsKind ? 0 : this.lane;
    this.modifiers.push({ ...this.track.at(this.placeS, lane), lane, kind: this.choice });
    return true;
  }
  nextDraft() {
    this.draft++;
    if (this.draft >= this.drafters.length) { this.beginRace(); return; }
    this.phase = 'draft'; this.timer = 15;
    const c = this.drafters[this.draft];
    const available = powers.findIndex((p, i) => c.levels[i] < 3);
    if (available < 0) { this.nextDraft(); return; }
    this.choice = available;
  }
  startDraft() { this.drafters = this.standings.slice(1); this.draft = -1; this.nextDraft(); }
  applyModifier(car, modifier, hammer) {
    const kind = modifier.kind;
    if (kind === doorsKind || car.air > 0) return;
    const position = kind === hammerKind ? hammer : modifier;
    const dx = car.x - position.x, dy = car.y - position.y;
    if (Math.hypot(dx, dy) >= modifiers[kind].radius) return;
    if (kind === 0) car.slick = 0.8;
    if (kind === 1 || kind === 3) this.hit(car, car.x - modifier.x || 1, car.y - modifier.y, kind === 3 ? 165 : 100);
    if (kind === 2) car.boost = 0.5;
    if (kind === 4 && this.elapsed >= (modifier.readyAt || 0)) {
      modifier.readyAt = this.elapsed + 3;
      this.hit(car, car.x - modifier.x || 1, car.y - modifier.y, 175);
      this.burst(modifier.x, modifier.y, modifiers[kind].color, 54);
    }
    if (kind === 5 && this.hit(car, 0, 0, 0)) car.slow = 1.8;
    if (kind === 6) { car.air = 0.85; this.burst(car.x, car.y, modifiers[kind].color, 30); }
    if (kind === hammerKind && hammer.striking) this.hit(car, dx || 1, dy, 190);
  }
  hammer(modifier, time = this.elapsed) {
    const phase = wrap(time + modifier.s / 105, 2.7);
    return { ...this.track.at(modifier.s + hammerReach * Math.sin(phase * Math.PI * 2 / 2.7), modifier.lane), warning: phase > 1.52, striking: phase > 2.06 };
  }
  blockDoor(car, door, oldX, oldY) {
    const x = Math.cos(door.angle), y = Math.sin(door.angle);
    const dx = car.x - door.x, dy = car.y - door.y;
    const along = dx * x + dy * y, lane = (dy * x - dx * y) * doorSide(this.elapsed);
    if (Math.abs(along) >= 15 || lane <= -6 || lane >= 48) return;
    const side = Math.sign((oldX - door.x) * x + (oldY - door.y) * y) || -1;
    const push = side * 15 - along;
    car.x += push * x; car.y += push * y;
    const speed = car.vx * x + car.vy * y;
    if (speed * side < 0) { car.vx -= speed * x * 1.18; car.vy -= speed * y * 1.18; }
  }
  moveCar(c, x, y, dt) {
    const track = this.track, radius = 12;
    const nextX = clamp(x + c.vx * dt, radius, track.width - radius);
    const nextY = clamp(y + c.vy * dt, radius, track.height - radius);
    if (track.blocks(nextX, y, radius)) c.vx *= -0.25; else c.x = nextX;
    if (track.blocks(c.x, nextY, radius)) c.vy *= -0.25; else c.y = nextY;
  }
  step(dt, demo = false) {
    for (const e of this.effects) e.life -= dt;
    this.effects = this.effects.filter(e => e.life > 0);
    if (this.phase === 'countdown') { this.timer -= dt; if (this.timer <= 0) this.phase = 'race'; return; }
    if (this.phase !== 'race' && !demo) return;
    this.elapsed += dt;
    const doors = [], hammers = new Map();
    for (const modifier of this.modifiers) {
      if (modifier.kind === doorsKind) doors.push(modifier);
      if (modifier.kind === hammerKind) hammers.set(modifier, this.hammer(modifier));
    }
    for (const c of this.cars) {
      if (c.finished) continue;
      for (const name of ['shield', 'boost', 'stun', 'slick', 'air', 'slow', 'contact', 'flash']) c[name] = Math.max(0, c[name] - dt);
      c.cooldowns = c.cooldowns.map(v => Math.max(0, v - dt));
      let steering, brake;
      const oldX = c.x, oldY = c.y, p = this.track.project(oldX, oldY);
      if (!c.human || demo) {
        let lane = Math.sin(c.id * 1.7 + this.elapsed * 0.2) * 8;
        let approach = 170;
        for (const door of doors) {
          const ahead = wrap(door.s - p.s + 17, this.track.length) - 17;
          if (ahead < approach) {
            approach = ahead;
            lane = -25 * doorSide(this.elapsed + Math.max(0, ahead - 20) / Math.max(130, c.speed));
          }
        }
        const target = this.track.at(p.s + 45 + c.speed * 0.1, lane);
        steering = clamp(angleDelta(Math.atan2(target.y - c.y, target.x - c.x), c.angle) * 2.5, -1, 1);
        brake = Math.abs(angleDelta(target.angle, c.angle)) > 0.95 && c.speed > 105;
        if (!demo) for (let slot = 0; slot < c.slots.length; slot++) {
          const power = c.slots[slot];
          const near = this.cars.some(r => r !== c && !r.finished && Math.hypot(c.x - r.x, c.y - r.y) < (power === 5 ? 72 : 145));
          if ((power === 0 && Math.abs(steering) < 0.2) || (power > 0 && near)) this.fire(c, slot);
        }
      } else {
        const prefix = 'P' + (c.id + 1) + '_';
        steering = Number(!!held[prefix + 'R']) - Number(!!held[prefix + 'L']); brake = !!held[prefix + 'D'];
      }
      const forward = c.vx * Math.cos(c.angle) + c.vy * Math.sin(c.angle);
      c.angle += steering * 3.25 * tuning.pace * clamp(Math.abs(forward) / 65, 0.1, 1) * (forward < -3 ? -1 : 1) * (c.stun > 0 ? 0.2 : 1) * dt;
      const offroad = p.distance > tuning.road;
      const speedLimit = (c.human && !demo ? 182 : 156 + c.id * 2) * tuning.pace * (c.boost > 0 ? 1.5 : 1) * (offroad ? 0.42 : 1) * (c.slow > 0 ? 0.5 : 1);
      const targetSpeed = brake ? -55 : speedLimit;
      const motor = (brake && forward > 0 ? 260 : 140) * tuning.pace;
      let nextSpeed = forward + clamp(targetSpeed - forward, -motor * dt, motor * dt);
      if (c.stun > 0) nextSpeed *= 1 - dt * 1.4;
      const lateral = -c.vx * Math.sin(c.angle) + c.vy * Math.cos(c.angle);
      const slip = lateral * Math.max(0, 1 - dt * (c.slick > 0 ? 0.8 : offroad ? 4 : 9));
      c.vx = Math.cos(c.angle) * nextSpeed - Math.sin(c.angle) * slip;
      c.vy = Math.sin(c.angle) * nextSpeed + Math.cos(c.angle) * slip;
      this.moveCar(c, oldX, oldY, dt);
      for (const door of doors) this.blockDoor(c, door, oldX, oldY);
      c.speed = Math.hypot(c.vx, c.vy);
      const q = this.track.project(c.x, c.y), length = this.track.length;
      const ds = wrap(q.s - p.s + length / 2, length) - length / 2;
      if (p.distance < tuning.gateWidth && q.distance < tuning.gateWidth && Math.abs(ds) < 14) {
        c.gateTravel += ds;
        // Give ranking credit only up to the next checkpoint until it is crossed.
        const nextGate = (c.lap + (c.gate === 0 && c.started ? 1 : c.gate / 4)) * length;
        c.progress = Math.min(nextGate, c.progress + ds);
        if (q.distance < tuning.road && ds > 0) c.safeS = q.s;
      }
      if ((!c.started || c.gateTravel >= length * 0.17) && this.track.crossesGate(c.gate, oldX, oldY, c)) {
        if (c.gate === 0) {
          if (c.started) c.lap++;
          c.started = true;
          if (c.lap >= tuning.laps) { c.finished = true; c.finishTime = this.elapsed; this.finishOrder.push(c.id); this.burst(c.x, c.y, c.color, 40); }
        }
        c.progress = (c.lap + c.gate / 4) * length;
        c.gate = (c.gate + 1) % 4;
        c.gateTravel = 0;
      }
      if (c.progress > c.bestProgress + 12) { c.bestProgress = c.progress; c.stuck = 0; } else c.stuck += dt;
      if (c.stuck > 4) {
        const safe = this.track.at(c.safeS, (c.id % 2 ? 1 : -1) * 12);
        c.x = safe.x; c.y = safe.y; c.angle = safe.angle; c.vx = 0; c.vy = 0; c.stuck = 0;
        this.burst(c.x, c.y, 0xffffff, 20);
      }
      for (const modifier of this.modifiers) this.applyModifier(c, modifier, hammers.get(modifier));
    }
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
      const a = this.cars[i], b = this.cars[j];
      if (a.finished || b.finished || a.air > 0 || b.air > 0) continue;
      let x = b.x - a.x, y = b.y - a.y, distance = Math.hypot(x, y);
      if (distance < 21) {
        if (distance < 0.001) { x = 1; y = 0; distance = 1; }
        x /= distance; y /= distance;
        const separation = (21 - distance) * 0.5;
        const ax = a.x - x * separation, ay = a.y - y * separation, bx = b.x + x * separation, by = b.y + y * separation;
        if (!this.track.blocks(ax, ay, 12)) { a.x = ax; a.y = ay; }
        if (!this.track.blocks(bx, by, 12)) { b.x = bx; b.y = by; }
        const impact = (a.vx - b.vx) * x + (a.vy - b.vy) * y;
        if (impact > 0) { a.vx -= x * impact * 0.7; a.vy -= y * impact * 0.7; b.vx += x * impact * 0.7; b.vy += y * impact * 0.7; }
      }
    }
    for (const shot of this.shots) {
      shot.life -= dt; const oldX = shot.x, oldY = shot.y;
      shot.x += shot.vx * dt; shot.y += shot.vy * dt;
      if (this.track.blocks(shot.x, shot.y, 3)) { shot.life = 0; continue; }
      for (const c of this.cars) if (c.id !== shot.owner && !c.finished && c.air <= 0) {
        const dx = shot.x - oldX, dy = shot.y - oldY;
        const fraction = clamp(((c.x - oldX) * dx + (c.y - oldY) * dy) / (dx * dx + dy * dy || 1), 0, 1);
        if (Math.hypot(c.x - oldX - dx * fraction, c.y - oldY - dy * fraction) < 14) { this.hit(c, dx, dy, 140); shot.life = 0; break; }
      }
    }
    this.shots = this.shots.filter(s => s.life > 0 && s.x > 0 && s.x < this.track.width && s.y > 0 && s.y < this.track.height);
    for (const hazard of this.hazards) {
      hazard.life -= dt; hazard.age += dt;
      if (hazard.age < 0.5) continue;
      for (const c of this.cars) if (!c.finished && c.air <= 0 && Math.hypot(c.x - hazard.x, c.y - hazard.y) < hazard.radius + 10) {
        if (hazard.kind === 2) c.slick = 0.7;
        else { this.hit(c, c.x - hazard.x || 1, c.y - hazard.y, 160); hazard.life = 0; this.burst(hazard.x, hazard.y, 0xf7d36b, 48); break; }
      }
    }
    this.hazards = this.hazards.filter(h => h.life > 0);
    if (!demo && (this.finishOrder.length || this.elapsed >= this.track.seconds)) this.finishRound();
  }
}

let sceneRef;
let musicContext;
function playMusic() {
  if (!window.AudioContext || !sceneRef || sceneRef.match.phase === 'paused' || document.hidden) return;
  if (!musicContext) {
    musicContext = new AudioContext();
    const bytes = Uint8Array.from(atob(cabinetMusic), value => value.charCodeAt(0));
    musicContext.decodeAudioData(bytes.buffer).then(buffer => {
      const music = musicContext.createBufferSource(), volume = musicContext.createGain();
      music.buffer = buffer; music.loop = true; volume.gain.value = 0.38;
      music.connect(volume).connect(musicContext.destination);
      music.start();
    }).catch(() => {});
  }
  if (musicContext.state !== 'running') musicContext.resume().catch(() => {});
}
document.addEventListener('pointerdown', playMusic);
window.addEventListener('blur', () => { clearInput(); if (sceneRef) sceneRef.pauseGame(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInput(); if (sceneRef) sceneRef.pauseGame(); } });

class CabinetScene extends Phaser.Scene {
  create() {
    sceneRef = this; this.match = new Championship(); this.match.phase = 'title'; this.accumulator = 0; this.age = 0; this.titleRow = 2; this.titleHumans = 1; this.titleSize = 0; this.labels = []; this.labelIndex = 0;
    this.trackArt = this.add.graphics();
    this.ink = this.add.graphics(); this.overlay = this.add.graphics();
    this.worldView = this.cameras.main.setViewport(0, 94, 800, 407).setBackgroundColor('#192827').ignore(this.overlay);
    this.cameras.add(0, 0, 800, 600).ignore([this.trackArt, this.ink]);
    this.paintCircuit();
    this.best = null; this.legacyBest = null;
    this.loadRecord();
  }
  async loadRecord() {
    try {
      if (!window.platanusArcadeStorage) return;
      const [legacy, current] = await Promise.all([
        window.platanusArcadeStorage.get('nitro-nonsense:arcade:best'),
        window.platanusArcadeStorage.get('nitro-nonsense:arcade:best-v2'),
      ]);
      if (legacy.found && legacy.value && legacy.value.version === 1 && Number.isFinite(legacy.value.seconds) && legacy.value.seconds > 0) this.legacyBest = legacy.value.seconds;
      if (current.found && current.value && current.value.version === 2 && current.value.track === 'original' && Number.isFinite(current.value.seconds) && current.value.seconds > 0) this.best = current.value.seconds;
    } catch { /* Cabinet storage availability does not affect play. */ }
  }
  menuOwner() {
    const m = this.match;
    if (m.phase === 'paused') return this.pauseOwner;
    if (m.phase === 'draft') return m.drafters[m.draft].human ? m.drafters[m.draft].id : -1;
    if (m.phase === 'workshop') return m.winner.human ? m.winner.id : -1;
    if (m.phase === 'results' || m.phase === 'champion') return m.winner.human ? m.winner.id : 0;
    return 0;
  }
  confirm(owner) { return owner >= 0 && (tap('P' + (owner + 1) + '_1') || tap('START' + (owner + 1))); }
  menuMove(owner) {
    if (owner < 0) return { x: 0, y: 0 };
    const m = this.match, prefix = 'P' + (owner + 1) + '_';
    const context = [m.phase, owner, m.workshopMode, m.draft, m.round].join(':');
    if (context !== this.navContext) { this.navContext = context; this.navDirection = ''; this.navNext = 0; }
    const x = Number(tap(prefix + 'R')) - Number(tap(prefix + 'L')) || Number(!!held[prefix + 'R']) - Number(!!held[prefix + 'L']);
    const y = Number(tap(prefix + 'D')) - Number(tap(prefix + 'U')) || Number(!!held[prefix + 'D']) - Number(!!held[prefix + 'U']);
    if (!x && !y) { this.navDirection = ''; return { x: 0, y: 0 }; }
    const direction = x + ',' + y, changed = direction !== this.navDirection;
    if (!changed && this.age < this.navNext) return { x: 0, y: 0 };
    this.navDirection = direction; this.navNext = this.age + (changed ? 0.32 : 0.14);
    return y ? { x: 0, y } : { x, y: 0 };
  }
  menuHint(owner, action = 'confirmar', back = false) {
    return owner < 0 ? 'Turno del bot · espera' : owner === 0 ? 'P1: W/A/S/D mover · U ' + action + (back ? ' · I volver' : '') : 'P2: flechas mover · R ' + action + (back ? ' · T volver' : '');
  }
  startMatch(humans, size) {
    this.match = new Championship(humans, newSeed(), size);
    this.paintCircuit(); clearInput(); this.accumulator = 0;
  }
  showTitle() {
    this.match = new Championship(); this.match.phase = 'title'; this.titleRow = 2;
    this.paintCircuit(); clearInput(); this.accumulator = 0;
  }
  pauseGame(owner = this.menuOwner()) {
    const m = this.match;
    if (musicContext) musicContext.suspend().catch(() => {});
    if (!m || ['title', 'paused', 'champion'].includes(m.phase)) return;
    this.pauseOwner = Math.max(0, owner); this.previousPhase = m.phase;
    m.phase = 'paused'; this.accumulator = 0; clearInput();
  }
  text(value, x, y, size = 16, color = 0xf2f5fb, center = false, display = false) {
    let label = this.labels[this.labelIndex++];
    if (!label) {
      label = this.add.text(0, 0, '', { fontFamily: 'Arial', fontSize: 16 }).setDepth(20);
      this.worldView.ignore(label); this.labels.push(label);
    }
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
    g.clear().fillStyle(0x192827).fillRect(0, 0, track.width, track.height);
    for (let i = 0; i < track.width / 5; i++) {
      const x = (i * 197 + 33) % track.width, y = (i * 137) % track.height;
      if (track.project(x, y).distance < 52) continue;
      g.fillStyle(i % 3 ? 0x20332e : 0x283b32).fillCircle(x, y, 2 + i % 5);
    }
    const points = track.points;
    g.lineStyle(91, 0x090e15).strokePoints(points, true);
    g.lineStyle(84, 0xe5d9c2).strokePoints(points, true);
    for (let s = 0; s < track.length; s += 16) {
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
    for (let row = 0; row < 2; row++) for (let col = 0; col < 8; col++) {
      const a = track.at(row * 7 - 3, -35 + col * 9);
      g.fillStyle((row + col) % 2 ? 0x101824 : 0xf2efdf).fillRect(a.x - 4, a.y - 4, 8, 8);
    }
    for (const gate of track.gates.slice(1)) {
      const a = track.at(gate.s, -34), b = track.at(gate.s, 34);
      g.lineStyle(3, 0x91c7c4, 0.6).lineBetween(a.x, a.y, b.x, b.y);
    }
    for (const [index, section] of track.sections.entries()) {
      const end = track.sections[index + 1]?.s ?? track.length;
      if (section.kind !== 'straight' || end - section.s < 90) continue;
      for (let s = section.s + 55; s < end - 32; s += 220) {
        const a = track.at(s - 8, -7), b = track.at(s + 8), c = track.at(s - 8, 7);
        g.lineStyle(3, 0xdeddd0, 0.55).strokePoints([a, b, c]);
      }
    }
    for (const [index, b] of track.buildings.entries()) {
      const w = b.right - b.left, h = b.bottom - b.top;
      g.fillStyle(0x11191b, 0.72).fillRect(b.left + 8, b.top + 9, w, h);
      g.fillStyle(index % 3 ? 0x56686e : 0x75615a).fillRect(b.left, b.top, w, h);
      g.lineStyle(3, 0x262d38).strokeRect(b.left, b.top, w, h);
      g.lineStyle(2, 0x96a6a5, 0.5).strokeRect(b.left + 6, b.top + 6, w - 12, h - 12);
      g.fillStyle(0x363f45).fillRect(b.left + 13, b.top + 14, 21, 14).fillRect(b.right - 31, b.bottom - 24, 18, 11);
    }
    this.viewTrack = null;
  }
  frameWorld(dt) {
    const { match: m, worldView: view } = this, track = m.track;
    const phase = m.phase === 'paused' ? this.previousPhase : m.phase;
    let x = track.width / 2, y = track.height / 2;
    let zoom = Math.min(800 / track.width, 407 / track.height);
    let range;
    if (phase === 'race' || phase === 'countdown') {
      const [a, b = a] = m.cars.slice(0, m.humans);
      range = [Math.min(a.x, b.x), Math.max(a.x, b.x), Math.min(a.y, b.y), Math.max(a.y, b.y)];
      x = (a.x + b.x) / 2; y = (a.y + b.y) / 2;
      zoom = Math.min(1.06, 670 / (range[1] - range[0] + 1), 310 / (range[3] - range[2] + 1));
    } else if (phase === 'workshop' && m.workshopMode === 'placement') {
      const cursor = track.at(m.placeS, m.lane);
      x = cursor.x; y = cursor.y; zoom = 0.84;
    }
    if (this.viewTrack === track && this.viewPhase === phase) {
      const ease = Math.min(1, dt * 8);
      x = this.viewX + (x - this.viewX) * ease;
      y = this.viewY + (y - this.viewY) * ease;
      zoom = Math.min(zoom, view.zoom + (zoom - view.zoom) * ease);
      if (range) {
        x = clamp(x, range[1] - 350 / zoom, range[0] + 350 / zoom);
        y = clamp(y, range[3] - 170 / zoom, range[2] + 170 / zoom);
      }
    }
    this.viewTrack = track; this.viewPhase = phase; this.viewX = x; this.viewY = y;
    view.setZoom(zoom).centerOn(x, y);
  }
  car(c, scale = 1) {
    const g = this.ink, a = c.angle, sx = Math.cos(a), sy = Math.sin(a);
    const lift = c.air > 0 ? Math.sin(c.air / 0.85 * Math.PI) * 16 : 0;
    if (lift > 0) g.fillStyle(0x030608, 0.7).fillEllipse(c.x + 3, c.y + 3, 27, 15);
    const poly = (points, color, offset = 0) => {
      g.fillStyle(color).fillPoints(points.map(([x, y]) => ({ x: c.x + (x * sx - y * sy) * scale + offset, y: c.y - lift + (x * sy + y * sx) * scale + offset })), true);
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
    for (const h of m.modifiers) this.modifier(h.x, h.y, h.kind, true, h);
    for (const h of m.hazards) {
      if (h.kind === 2) { g.fillStyle(0x10101c, 0.9).fillEllipse(h.x, h.y, h.radius * 2, h.radius * 1.5); g.lineStyle(2, 0x9574bd).strokeEllipse(h.x, h.y, h.radius * 1.6, h.radius); }
      else { g.fillStyle(0xf7d36b).fillCircle(h.x, h.y, 7); g.fillStyle(h.age > 0.5 && this.age % 0.3 < 0.15 ? 0xef4b4c : 0x3c3232).fillCircle(h.x, h.y, 3); }
    }
    for (const c of m.cars) {
      if (c.slick > 0 && c.speed > 40) { g.lineStyle(3, 0x11141c, 0.7).lineBetween(c.x - c.vx * 0.15, c.y - c.vy * 0.15, c.x, c.y); }
      this.car(c);
      if (c.human && ['race', 'countdown'].includes(m.phase)) {
        const zoom = this.worldView.zoom;
        this.text(c.name, 400 + (c.x - this.viewX) * zoom, 297.5 + (c.y - this.viewY) * zoom - 18, 13, c.color, true);
      }
    }
    for (const h of m.modifiers) if (h.kind === hammerKind) this.hammerSignal(g, m.hammer(h));
    for (const s of m.shots) { g.lineStyle(4, 0xffdd8d).lineBetween(s.x, s.y, s.x - s.vx * 0.018, s.y - s.vy * 0.018); }
    for (const e of m.effects) g.lineStyle(3, e.color, e.life / 0.55).strokeCircle(e.x, e.y, e.radius * (1 - e.life / 0.55) + 3);
  }
  modifier(x, y, kind, valid = true, state = null, g = this.ink, preview = false) {
    if (kind === 0) { g.fillStyle(0x151322).fillEllipse(x, y, 38, 28); g.lineStyle(2, 0xc49bff).strokeEllipse(x, y, 30, 18); }
    if (kind === 1) { g.fillStyle(0x161b28).fillRoundedRect(x - 13, y - 5, 26, 18, 3); g.fillStyle(0xff9a2e).fillTriangle(x, y - 16, x - 10, y + 8, x + 10, y + 8); g.lineStyle(4, 0xf7ecd3).lineBetween(x - 5, y - 3, x + 5, y - 3); }
    if (kind === 2) { g.fillStyle(0x163f35).fillRoundedRect(x - 16, y - 14, 32, 28, 3); g.lineStyle(3, 0x42d07a); for (let i = -7; i < 10; i += 9) g.lineBetween(x + i - 4, y - 7, x + i + 3, y).lineBetween(x + i + 3, y, x + i - 4, y + 7); }
    if (kind === 3) {
      g.fillStyle(0x181c28).fillRoundedRect(x - 22, y - 12, 44, 27, 3);
      g.fillStyle(0xcbd4e4).fillRoundedRect(x - 21, y - 13, 42, 20, 3);
      for (let i = -17; i < 20; i += 14) g.fillStyle(0xef6866).fillRect(x + i, y - 13, 7, 20);
    }
    if (kind === 4) {
      const ready = !state || this.match.elapsed >= (state.readyAt || 0);
      g.fillStyle(0x101520).fillCircle(x, y, 16);
      g.lineStyle(3, ready ? 0xf7d36b : 0x4a5570).strokeCircle(x, y, 13);
      if (!ready) g.lineStyle(2, 0xf7d36b).beginPath().arc(x, y, 18, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - (state.readyAt - this.match.elapsed) / 3)).strokePath();
      g.fillStyle(ready ? 0xef4b4c : 0x4a5570).fillCircle(x, y, 5);
    }
    if (kind === 5) {
      g.fillStyle(0x876337).fillRect(x - 22, y - 11, 44, 22);
      g.fillStyle(0x171d28).fillRect(x - 19, y - 8, 38, 16);
      for (let i = -15; i < 20; i += 10) g.fillStyle(0xcbd4e4).fillTriangle(x + i - 4, y + 6, x + i, y - 9, x + i + 4, y + 6);
    }
    if (kind === 6) {
      g.fillStyle(0x18405c).fillRect(x - 20, y - 12, 40, 28);
      for (let i = -12; i < 18; i += 10) g.lineStyle(3, 0x42baf8).lineBetween(x - 14, y + i * 0.6, x + 14, y + i * 0.6 - 6);
      g.lineStyle(4, 0x98ddff).lineBetween(x - 20, y - 12, x + 20, y - 12);
    }
    if (kind === hammerKind) this.drawHammer(g, x, y, state, preview);
    if (kind === doorsKind) this.drawDoors(g, x, y, state, preview);
    if (!valid) g.lineStyle(3, 0xef4b4c).lineBetween(x - 16, y - 16, x + 16, y + 16);
  }
  drawHammer(g, x, y, state, preview) {
    const pose = state ? this.match.hammer(state, preview ? this.age : this.match.elapsed) : { x, y, warning: false, striking: false };
    if (state) {
      const { track } = this.match;
      for (let s = -hammerReach; s < hammerReach; s += 14) {
        const a = track.at(state.s + s, state.lane), b = track.at(state.s + Math.min(s + 8, hammerReach), state.lane);
        g.lineStyle(4, 0xf08db9, 0.63).lineBetween(a.x, a.y, b.x, b.y);
      }
    }
    const head = pose.y - (pose.striking ? 11 : 26);
    g.fillStyle(0x181c28).fillEllipse(pose.x, pose.y + 10, 39, 17);
    g.lineStyle(7, 0x181c28).lineBetween(pose.x - 13, pose.y + 13, pose.x + 5, head);
    g.lineStyle(3, 0xe8c0d9).lineBetween(pose.x - 13, pose.y + 12, pose.x + 5, head);
    g.fillStyle(0xf5a6d8).fillRoundedRect(pose.x - 14, head - 9, 34, 17, 3);
    g.fillStyle(0x63394a).fillRect(pose.x + 12, head - 7, 5, 13);
    if (preview) this.hammerSignal(g, pose);
  }
  hammerSignal(g, { x, y, warning, striking }) {
    if (!warning) { g.lineStyle(2, 0xf08db9, 0.7).strokeCircle(x, y, 25); return; }
    g.lineStyle(3, striking ? 0xffede0 : 0xffd36c);
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3, cos = Math.cos(a), sin = Math.sin(a);
      if (striking) g.lineBetween(x + 27 * cos, y + 27 * sin, x + 37 * cos, y + 37 * sin);
      else g.beginPath().arc(x, y, 25, a, a + 0.68).strokePath();
    }
    if (striking) g.strokeCircle(x, y, 24);
  }
  drawDoors(g, x, y, state, preview) {
    const time = state && !preview ? this.match.elapsed : this.age;
    const angle = state ? state.angle : 0;
    const cos = Math.cos(angle), sin = Math.sin(angle), scale = state ? 1 : 0.6;
    const at = (along, lane) => ({ x: x + (along * cos - lane * sin) * scale, y: y + (along * sin + lane * cos) * scale });
    const closed = doorSide(time), open = -closed;
    const warning = wrap(time, doorInterval) > doorInterval - 0.55;
    const color = warning && Math.floor(time * 12) % 2 ? 0xf7d36b : 0x52e5be;
    const bar = (width, value, along, from, to) => g.lineStyle(width * scale, value).strokePoints([at(along, from), at(along, to)]);
    bar(14, 0x271c23, 0, closed * 3, closed * 41);
    bar(9, 0xff766d, 0, closed * 6, closed * 39);
    for (let lane = 12; lane < 39; lane += 8) bar(9, 0xfbe6d1, 0, closed * lane, closed * (lane + 2));
    for (const along of [-15, 4]) {
      g.lineStyle(3 * scale, color).strokePoints([at(along, open * 14), at(along + 7, open * 24), at(along, open * 34)]);
    }
    for (const side of [-1, 1]) {
      const p = at(0, side * 44);
      g.fillStyle(0x171d28).fillCircle(p.x, p.y, 7 * scale);
      g.fillStyle(side === closed ? 0xff766d : color).fillCircle(p.x, p.y, 4 * scale);
    }
  }
  hud() {
    const m = this.match;
    this.overlay.fillStyle(0x0e1018).fillRect(0, 0, 800, 94).fillRect(0, 501, 800, 99);
    this.overlay.lineStyle(1, 0x4a5570).lineBetween(0, 93, 800, 93).lineBetween(0, 501, 800, 501);
    for (let i = 0; i < 4; i++) {
      const c = m.cars[i], x = 24 + i * 195;
      this.text(c.name, x, 20, 17, c.color); this.text(c.wins + ' / ' + tuning.wins, x + 98, 20, 18, 0xf2f5fb);
      for (let win = 0; win < tuning.wins; win++) this.overlay.fillStyle(win < c.wins ? c.color : 0x2b334a).fillRoundedRect(x + win * 30, 35, 23, 6, 2);
      this.text(c.finished ? 'META' : 'VUELTA ' + Math.min(tuning.laps, c.lap + 1) + ' / ' + tuning.laps, x, 55, 13, 0xcbd4e4);
    }
    const remaining = Math.max(0, m.track.seconds - m.elapsed);
    this.text('RONDA ' + m.round + '  ·  ' + remaining.toFixed(1) + ' s', 400, 78, 14, 0xcbd4e4, true);
    for (let id = 0; id < m.humans; id++) {
      const c = m.cars[id], x = id * 394 + 20;
      this.text(c.name, x, 523, 15, c.color);
      for (let slot = 0; slot < c.slots.length; slot++) {
        const kind = c.slots[slot], px = x + 35 + slot % 3 * 116, py = 521 + Math.floor(slot / 3) * 29;
        const p = kind < 0 ? null : powers[kind], cd = c.cooldowns[slot];
        this.text((slot + 1) + '/' + powerKey(id, slot) + '  ' + (p ? p.name : '—'), px, py, 13, p ? p.color : 0x8c98af);
        this.overlay.fillStyle(0x2b334a).fillRect(px, py + 10, 101, 4);
        if (p) this.overlay.fillStyle(cd > 0 ? 0x4a5570 : p.color).fillRect(px, py + 10, 101 * clamp(1 - cd / (p.cd / (1 + (c.levels[kind] - 1) * 0.18)), 0, 1), 4);
      }
    }
    this.text('A/D girar · S frenar · ENTER pausa', 24, 582, 14, palette[0]);
    this.text(m.humans > 1 ? '←/→ girar · ↓ frenar · 2 pausa' : 'Los poderes se consiguen al perder', 418, 582, 14, m.humans > 1 ? palette[1] : 0xcbd4e4);
  }
  dim(alpha = 0.93) { this.overlay.fillStyle(0x0e1018, alpha).fillRect(0, 0, 800, 600); }
  key(label, x, y, width = 310, accent = true) {
    this.plate(x, y, width, 48, accent ? 0xff9a2e : 0x2b334a, accent ? 0xffbf77 : 0x4a5570);
    this.text(label, x + width / 2, y + 24, 18, accent ? 0x0e1018 : 0xf2f5fb, true);
  }
  title() {
    this.overlay.fillStyle(0x0e1018, 0.88).fillRect(0, 0, 800, 600);
    this.overlay.fillStyle(0xff9a2e).fillRect(35, 29, 6, 20);
    this.text('PLATANUS HACK 26  /  SANTIAGO', 55, 39, 15, 0xcbd4e4);
    this.text('NITRO', 55, 112, 76, 0xff9a2e, false, true);
    this.text('NONSENSE', 55, 188, 62, 0xf2f5fb, false, true);
    this.text('Gana. Cambia la pista. Pierde. Gana poderes.', 57, 249, 20, 0xf2f5fb);
    for (let row = 0; row < 3; row++) {
      const y = 282 + row * 63, focused = this.titleRow === row;
      this.plate(55, y, 690, 49, focused ? row === 2 ? 0xff9a2e : 0x3c4661 : 0x1a1f2e, focused ? 0x42baf8 : 0x4a5570);
      if (row === 2) this.text('JUGAR', 400, y + 25, 22, focused ? 0x0e1018 : 0xf2f5fb, true);
      else {
        this.text(row === 0 ? 'JUGADORES' : 'TAMAÑO DEL CIRCUITO', 79, y + 25, 17, 0xcbd4e4);
        this.text('◀  ' + (row === 0 ? this.titleHumans + (this.titleHumans === 1 ? ' JUGADOR' : ' JUGADORES') : trackSizes[this.titleSize].name) + '  ▶', 566, y + 25, 18, focused ? 0xffbc66 : 0xf2f5fb, true);
      }
    }
    this.text('P1: W/S elegir · A/D ajustar · U o ENTER confirmar', 400, 484, 16, palette[0], true);
    this.text('P1: A/D girar · S frenar · U/I/O/J/K/L poderes', 400, 514, 16, palette[0], true);
    this.text('P2: ←/→ girar · ↓ frenar · R/T/Y/F/G/H poderes', 400, 540, 16, palette[1], true);
    this.text('Circuito nuevo en cada campeonato. Aceleración automática.', 400, 565, 15, 0xcbd4e4, true);
    const records = [];
    if (this.best !== null) records.push('ORIGINAL ' + this.best.toFixed(1) + ' s');
    if (this.legacyBest !== null) records.push('LEGADO ' + this.legacyBest.toFixed(1) + ' s');
    this.text(records.length ? 'RÉCORDS: ' + records.join(' · ') : '9 PIEZAS DE PISTA · 6 PODERES · 2 VUELTAS', 400, 588, 13, 0x8c98af, true);
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
    const owner = this.menuOwner();
    if (champion) {
      this.key('REVANCHA', 225, 451, 350, m.endChoice === 0);
      this.key('VOLVER AL INICIO', 225, 511, 350, m.endChoice === 1);
    } else {
      this.text(m.winner.name + ' modifica la pista. Los demás mejoran un poder.', 400, 449, 17, 0xcbd4e4, true);
      this.key('CONTINUAR', 225, 480, 350);
    }
    this.text(this.menuHint(owner), 400, champion ? 573 : 557, 15, palette[owner], true);
  }
  workshopScreen() {
    const m = this.match, owner = this.menuOwner();
    if (m.workshopMode === 'choice' && owner >= 0) {
      this.dim(0.96);
      this.text(m.winner.name + ' · TALLER DE TRAMPAS', 400, 38, 27, m.winner.color, true, true);
      this.text('Las piezas quedan en la pista durante todo el campeonato.', 400, 76, 16, 0xcbd4e4, true);
      for (let i = 0; i <= modifiers.length; i++) {
        const x = 32 + i % 2 * 372, y = 105 + Math.floor(i / 2) * 85, selected = m.choice === i;
        const item = modifiers[i] || { name: 'OMITIR', detail: 'Seguir sin agregar una pieza.', color: 0xcbd4e4 };
        this.plate(x, y, 364, 76, selected ? 0x3c4661 : 0x1a1f2e, selected ? 0x42baf8 : 0x4a5570);
        if (i < modifiers.length) this.modifier(x + 324, y + 38, i, true, null, this.overlay);
        this.text(item.name, x + 16, y + 23, 20, item.color, false, true);
        this.text(item.detail, x + 16, y + 52, 14, 0xcbd4e4);
      }
      this.text(this.menuHint(owner, 'elegir'), 400, 555, 16, m.winner.color, true);
      this.text(m.modifiers.length + ' / ' + tuning.maxModifiers + ' piezas colocadas · Puedes elegir OMITIR', 400, 585, 14, 0x8c98af, true);
      return;
    }
    const doors = m.choice === doorsKind, lane = doors ? 0 : m.lane;
    const p = m.track.at(m.placeS, lane), valid = m.canPlace(m.placeS, lane);
    this.overlay.fillStyle(0x0e1018).fillRect(0, 0, 800, 94).fillRect(0, 501, 800, 99);
    this.text(m.winner.name + ' · ' + (owner < 0 ? 'ESTÁ EDITANDO' : 'UBICA ' + modifiers[m.choice].name), 24, 31, 23, m.winner.color);
    this.text(owner === 0 ? 'A/D recorrer pista' + (doors ? '' : ' · W/S cambiar carril') + ' · U colocar · I volver' : owner === 1 ? '←/→ recorrer pista' + (doors ? '' : ' · ↑/↓ cambiar carril') + ' · R colocar · T volver' : 'Espera a que el bot coloque su pieza.', 24, 70, 16, 0xf2f5fb);
    this.modifier(p.x, p.y, m.choice, valid, { ...p, lane }, this.ink, true);
    this.text(doors ? 'Flechas: carril abierto · Barrera: carril cerrado' : m.choice === hammerKind ? 'Aro amarillo: aviso · Destello: golpe' : modifiers[m.choice].detail, 400, 523, 16, modifiers[m.choice].color, true);
    this.text(valid ? 'Posición libre' : m.modifiers.length >= tuning.maxModifiers ? 'Pista llena. Vuelve y elige OMITIR.' : 'Busca un lugar libre, lejos de la salida.', 400, 553, 17, valid ? 0xf2f5fb : 0xef6866, true);
    this.text('Fuera de la salida y separada de otras piezas. ' + m.modifiers.length + ' / ' + tuning.maxModifiers, 400, 585, 14, 0x8c98af, true);
  }
  draftScreen() {
    const m = this.match, c = m.drafters[m.draft], assigned = c.slots.indexOf(m.choice);
    this.dim(0.96);
    this.text('PERDER TIENE SUS VENTAJAS', 400, 49, 29, 0xff9a2e, true, true);
    this.text(c.name + ' · ELIGE UN PODER', 400, 91, 21, c.color, true);
    this.text(c.human ? 'Mueve el joystick y presiona el botón con el que quieres dispararlo.' : c.name + ' está eligiendo una mejora.', 400, 126, 16, 0xcbd4e4, true);
    for (let i = 0; i < 6; i++) {
      const p = powers[i], x = 39 + (i % 3) * 244, y = 158 + Math.floor(i / 3) * 123, selected = m.choice === i;
      this.plate(x, y, 232, 109, selected ? 0x3c4661 : 0x1a1f2e, selected ? 0x42baf8 : 0x4a5570);
      this.text(p.name, x + 17, y + 26, 21, p.color, false, true);
      this.text(c.levels[i] >= 3 ? 'NIVEL MÁXIMO' : 'NIVEL ' + c.levels[i] + ' → ' + (c.levels[i] + 1), x + 17, y + 60, 14, 0xcbd4e4);
      for (let level = 0; level < 3; level++) this.overlay.fillStyle(level < c.levels[i] ? p.color : 0x4a5570).fillRect(x + 17 + level * 62, y + 86, 53, 5);
    }
    this.text(c.levels[m.choice] >= 3 ? 'Nivel máximo. Elige otro poder.' : powers[m.choice].detail, 400, 416, 18, 0xf2f5fb, true);
    if (!c.human) return;
    this.text(assigned < 0 ? 'Usa un botón libre. Los poderes asignados se conservan.' : 'Para mejorar, presiona su botón ' + (assigned + 1) + ' (' + powerKey(c.id, assigned) + ').', 400, 455, 16, c.color, true);
    for (let i = 0; i < c.slots.length; i++) {
      const kind = c.slots[i], x = 38 + i % 3 * 244, y = 482 + Math.floor(i / 3) * 49;
      this.plate(x, y, 234, 39, assigned === i ? 0x3c4661 : 0x1a1f2e, assigned === i ? 0x42baf8 : 0x4a5570);
      this.text((i + 1) + ' (' + powerKey(c.id, i) + ') · ' + (kind < 0 ? 'LIBRE' : powers[kind].name), x + 117, y + 20, 15, kind < 0 ? 0xcbd4e4 : powers[kind].color, true);
    }
  }
  menuInput(dt) {
    const m = this.match, owner = this.menuOwner(), move = this.menuMove(owner);
    if (m.phase === 'title') {
      if (move.y) this.titleRow = wrap(this.titleRow + move.y, 3);
      if (move.x && this.titleRow === 0) this.titleHumans = this.titleHumans === 1 ? 2 : 1;
      if (move.x && this.titleRow === 1) this.titleSize = wrap(this.titleSize + move.x, trackSizes.length);
      if (this.confirm(owner)) {
        if (this.titleRow === 2) this.startMatch(this.titleHumans, this.titleSize);
        else this.titleRow++;
      }
    } else if (m.phase === 'paused') {
      if (this.confirm(owner)) { m.phase = this.previousPhase; clearInput(); this.accumulator = 0; playMusic(); }
    } else if (m.phase === 'race' || m.phase === 'countdown') {
      if (tap('START1')) { this.pauseGame(0); return; }
      if (m.humans > 1 && tap('START2')) { this.pauseGame(1); return; }
      if (m.phase === 'race') for (let id = 0; id < m.humans; id++) for (const button of powerKeys) if (tap('P' + (id + 1) + '_' + button)) m.fire(m.cars[id], button - 1);
    } else if (m.phase === 'results') {
      m.timer += dt;
      if (m.timer > 0.6 && this.confirm(owner)) { m.workshop(); clearInput(); }
    } else if (m.phase === 'workshop') {
      if (owner < 0) {
        m.timer -= dt;
        if (m.timer < 16.5) {
          m.choice = (m.round + m.winner.id) % modifiers.length;
          for (let i = 0; i < 24; i++) { m.placeS = m.track.length * wrap(m.round * 0.137 + i * 0.07, 1); m.lane = (i % 3 - 1) * 22; if (m.place()) break; }
          m.startDraft(); clearInput();
        }
      } else if (m.workshopMode === 'choice') {
        if (move.x) m.choice ^= 1;
        if (move.y) m.choice = wrap(m.choice + move.y * 2, modifiers.length + 1);
        if (this.confirm(owner)) {
          if (m.choice === modifiers.length) m.startDraft();
          else { m.workshopMode = 'placement'; if (m.choice === doorsKind) m.lane = 0; }
          clearInput();
        }
      } else {
        const prefix = 'P' + (owner + 1) + '_';
        m.placeS = wrap(m.placeS + (Number(!!held[prefix + 'R']) - Number(!!held[prefix + 'L'])) * 220 * dt, m.track.length);
        if (move.y && m.choice !== doorsKind) m.lane = clamp(m.lane + move.y * 22, -22, 22);
        if (tap(prefix + '2')) { m.workshopMode = 'choice'; clearInput(); }
        else if (this.confirm(owner) && m.place()) { m.startDraft(); clearInput(); }
      }
    } else if (m.phase === 'draft') {
      const c = m.drafters[m.draft];
      if (owner < 0) {
        m.timer -= dt;
        if (m.timer < 14) {
          m.choice = (m.round + c.id * 2) % powers.length;
          if (c.levels[m.choice] >= 3) m.choice = powers.findIndex((p, i) => c.levels[i] < 3);
          const assigned = c.slots.indexOf(m.choice);
          const slot = assigned < 0 ? c.slots.indexOf(-1) : assigned;
          if (m.upgrade(c, m.choice, slot)) { m.nextDraft(); clearInput(); }
        }
      } else {
        if (move.x) m.choice = Math.floor(m.choice / 3) * 3 + wrap(m.choice + move.x, 3);
        if (move.y) m.choice = (m.choice + 3) % powers.length;
        for (const button of powerKeys) {
          if (tap('P' + (owner + 1) + '_' + button) && m.upgrade(c, m.choice, button - 1)) {
            m.nextDraft(); clearInput(); break;
          }
        }
      }
    } else if (m.phase === 'champion') {
      m.timer += dt;
      if (move.y) m.endChoice = 1 - m.endChoice;
      if (m.timer > 0.6 && this.confirm(owner)) {
        if (m.endChoice === 0) this.startMatch(m.humans, m.track.size);
        else this.showTitle();
      }
    }
  }
  update(time, delta) {
    const dt = Math.min(delta / 1000, 0.1); this.age += dt;
    this.menuInput(dt); const m = this.match;
    this.accumulator += dt;
    while (this.accumulator >= tuning.step) {
      if (m.phase === 'title') {
        m.step(tuning.step, true);
        if (m.elapsed > 45) { m.beginRace(); m.phase = 'title'; }
      } else {
        m.step(tuning.step);
      }
      this.accumulator -= tuning.step;
    }
    this.frameWorld(dt); this.drawWorld();
    if (m.phase === 'title') this.title();
    else {
      if (m.phase === 'race' || m.phase === 'countdown') this.hud();
      if (m.phase === 'countdown') {
        this.plate(345, 117, 110, 67, 0x1a1f2e);
        this.text(m.timer > 0.5 ? String(Math.ceil(m.timer - 0.5)) : '¡YA!', 400, 151, 45, 0xff9a2e, true, true);
      }
      if (m.phase === 'results' || m.phase === 'champion') this.results(m.phase === 'champion');
      if (m.phase === 'workshop') this.workshopScreen();
      if (m.phase === 'draft') this.draftScreen();
      if (m.phase === 'paused') {
        this.dim(0.9); this.text('EN EL GARAJE', 400, 249, 42, 0xff9a2e, true, true);
        this.text('Pausa de P' + (this.pauseOwner + 1), 400, 309, 22, palette[this.pauseOwner], true);
        this.key('CONTINUAR', 235, 366, 330);
        this.text(this.menuHint(this.pauseOwner), 400, 449, 16, palette[this.pauseOwner], true);
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
const cabinetMusic = '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';
const displayFont = new FontFace('Scrapline', 'url(data:font/woff;base64,d09GRk9UVE8AAAtEAAkAAAAAE2gAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAABDRkYgAAAA6AAACGgAAA+xgSbo\x2fU9TLzIAAAoQAAAARQAAAGBpzGX2Y21hcAAACuQAAABRAAAAZgGpAh1oZWFkAAAJUAAAADYAAAA2MdoGIGhoZWEAAAn0AAAAGwAAACQDQAUWaG10eAAACYgAAABpAAAAtJjIAABtYXhwAAAA4AAAAAYAAAAGAC1QAG5hbWUAAApYAAAAigAAARYUOS6icG9zdAAACzgAAAAMAAAAIAADAAAAAFAAAC0AAHicvVd7cFRXGd9N9kd4hIVUboYysbZxasGGCC0FrE4KVpzSwVIqwSoIpQ01FApJCE1Dskn2kX3k7Oa1Cck2IA9pEUsjRex06BQLUyeISk2nMmKt044DKuM0ODI95+45i37nbngkd0H+cjLJ4Z57zvf4fd\x2fv912cDleWw+l05n3nmaq1FRvXb1r3xLofbt24tkpv3iWKHGJmlijOFlNdTC403y\x2fAK+CFk1jBpNdv40V5jilOZ1a2C2Nyxo4bPyF3onvS5LzbPl88b9bs++6f88DcefO\x2fWvzgXQ\x2fNvPcrK9ZVbVm\x2fedOds4pnX3V057CnqxsOh5N+HIW3O0OTHTMpLIfLkeNY5ix0Pu\x2f8R9acrIqss9n52fdn92V\x2f5BrnWu7qghNtYyaN+VnOwpznc06M\x2fdzYX4z9aFz+uMXj\x2fjU+f3z1+E8mTJ3QlpuTe2+umlgzMTLxpxNPuyvcfvd+91vin24x2Z3s38gMsc10YJBhdwSJEOJ+RJsQ9KCxFoxBfVsNQKwxHYZYl3JAvkFb6+j8bDXfMKczsHuQosWdrGLMYPTCfJ9hXxi7\x2fEh4EK9BaxWYqka4Cv4aeDyo8aMqjMtjyeJxur4SZpPaaCRi6GlDPI62HsQSYEOIJBDqgT+OxjZ4YlAVDJ4IGkPw+xFqRMSjXcc8aGvUIfeEkIhAPM0P2kwN2Ew9bTe1dLQpd3J10kUxpr7PIEtkCSUxWedCGVFelB3laB5jOlJ1iWmzZJxckCNyx\x2fhe8CyeBdGvsam\x2fgs1JhldDeNmLnbXorkTbBjK7BKEN8FaithaVXmwIIXX5GjZPEjbnzpG9N2xZbLNnIf9uT2Nu6VVrTP3eCoPX06MuZj29Mv+cLqJe5JcNc3v6US+y5Pq37mTh\x2fzJ1Mn1YL3KOYfrSjz6rPZJTNZqbboImNQ7jO6FWWNc4HWUbEGlEyAd\x2fQCfqaYEUN8H6hHYUvHGQYhUb8Zz6phhj0KZ2p2hx8zM3vuw2feZ0esvU0dHNrA4x1Mbg6YC3G80JRHZSUHPAXXRz0eiK8CaG0S0qqlHKhv0SVDcOwizTIG5XE\x2fC9IYiTfD9Uk1xkmH9SS6ECRM0V3EuRJm9WqCHD3J0uDC3uAtdnGQ670oc\x2f0bSfor4APijoz0vkYCBVitQ3zFIkd6ccIwHKCP2wpb\x2fp9ligHkexLMTlAvEXJGdcue+6cn\x2ffIDOqWlEThycB\x2fy6E9xE0S9LF1X1pk5UlkFkyCw8PGYODBPkpG0cIkkWLqBlPZaD3FU4esxuWAVuJzzBrWx6+xs2Nsv4WdGvVLejW\x2fzV1\x2fiF\x2fksRc5UFSA8hf8dj16n0yAxrfRaQGgXo0NaE+gJoI1JBG450RaLwgF9jQ+LktqmftaDxjU\x2fEnvAbfrKZB\x2foji2yym6WqZWhRT+xhmz9bChFgtOjzo9iLRjJ0Ri\x2ft0tceaX2QsptUwX9snL+RLqwfF\x2fanV+CaZsUR1r6YqEZZoS+QlCqsTdnk5oFOhhCgtSo5SFJ9qnXFf1+xvGeaRNKVo4YfUDoOJHWliqB2aGGxYOEZL3tfpeAknORQrIDUPVHG6rqrEHgiphDx8TSb28fWantPUESSq0fEiIlaFXmxGRURPbrmc6LqMaprsZ4Yar\x2f4IXyO8XjT60dAMTxh1LfrYXAbxRTrlLkCUryKLfJc6qIdT6wsI1qGhETWBKxYfpN9f01kxS71r8GPiOXxMsLegO4SOIKJ+RLwINFhHf6M84OfF6wbBsRY9W9Beg1CdFWAAm9PmvkW\x2fPWIezE7+A0MeUR8jSPf98DfDG4I3jCYrwvsIpHd1hMmXeLs1Zkgt1BRGg0Znd44ZKb0jH2PUvta5II\x2frRHrkcsg75GNQceFG8jzB8Kh8D4vPgf+Wb4VcQ\x2fOOqedIEwlSSkaLAt1LutIT4bSaD3Ha+vdllzXpxWkxn\x2fYZSoeuqXUm5q7EhQswt2Tg7UoUFaFkyBgYoP77IJNaLF1KrfuBjRR3838bapm6E9t\x2fBx\x2fNmD609qE7gUQX+mLoC0Pki1w0LkaXB7E6hOvg9cDjQ10Eda1wi6O9Yj0Vg+bS8RmQhyTNpwdUzigFf\x2fSAxjeaQQPy0dKEsBfNPl0hbzPULvkTiKPptr9owXOAWuk9fhzdHeiMo6MLrd2Ibgc7A3VBU2aBZd13K9+H+qNBA\x2f42Q28UXe3o7ER7F6K9hFoe1PL0W73QY0svgl0IdMLXjoYo1NvWB4f4JXlT06iIsogCu12X7ktqjGGeT8dMi3hKd8AIBBboDrA+7O4ZFv08K8sfWyH3Nlghb6HtblvI0XRQAxlDHh3jh9RE\x2fOzVLlqdqYuW4dIliM1WLFJDLHMhiHF7IuijvqDuqENsK21vGzEMLticPZyeBUWINqDdh84AuoLobdEFt9K9eLWK5l4iyUoSLUmDQKwUOyxS8L8ajD+iozHXZHBPVFowaIxO+k1bGKRpDS3wBREIIOhDCynF6tEhySo1w9gaQx1RgojRh8gewu8sLFLKgygs1OyxZl6WzcGzdgfybnvSq2msVhhSz1bGtyG2B\x2fE+9PSgL449MZj0xc81nEx1IpX+xBe6E85o0gV74etCQzvqYqi6Ed4Z4ijC4CL6wHwnGDR4hW7bCsgKlmGHnRl14BRvpRp9TQGyII5ynkJY\x2fcfgZfpMGSStbnPTm3oUPM7QH8bhBvRX4uVy9JahtRzsKYTL0VCGynKUV6KsAeVhPMTga0E0is42XbFYB1gIoWX0bd6NttPoeA19h7D\x2fVfTvxqHteK0Vf2CIRxGKaG1uJp0PIRoHewUtccRI\x2fP2IN6ON3lLyjxB8C1XpyAhJR\x2flFQ1TrIuZAVeutz6ytHcNbtPI19D8OLZ48h1lS6Tbv8NTQiDOng1NV1LTUdLj\x2fC\x2fklmPUAAQAAAAEAAEkLqj5fDzz1AAMD6AAAAADnB+E7AAAAAOcH4Tv\x2fZ\x2f9TBUwDdwAAAAMAAgAAAAAAAHicY4pgYGCsYWBgkWJgYL4HxKeA+AUQLwLiPqjYJ6AaJwYGpndQfhpQ\x2fTeIOIsARA+YhumvQsix9gBpNggfLAdUw6QGpLcB8RqonjVQuW1QGogZdaDYDKj+FhBbAXESEHcxMAAAEkIbRwAAAHicY2BkYGC2++\x2fEwMC6jAECGBlQgS4APnsCXQB4nGNgZuZm\x2fMLAysDA1MW0m4GBoQdCM95nMGRkYkAFjMicCCBgcGBQYIhitvvvxMDAXM6wFqaG8RpTDlBGgYEBADaNC4gAAAB4nIWOPQ6CQBCFP36U0FgYYr3xAARbSg9AIYmFHQFCSAga1Ct4Cg\x2fri7sVIaF4M9+bmX1ZIOJGgBfGgC9Z9tjLWfbZkTgOOHN0HIoaxxsOfBxvMXylkpqJigcDPSMtF6njLV9pU2j6Ur\x2frtlAdeWpva7743swS1i+ucpMS+3++ISPltPazH\x2famJvgAAHicRYw7CoAwAENfqaNDj6CLiB901UW8Rm\x2frdUTPEEMXE0LgQQIEogM1Fdmd7OhuGVnY2DnIkkljMrMWchZi6dGrW5c\x2fUln\x2fCvQMdEwfqgsPvgAAAHicY2BmwAsAAH0ABA==)');
displayFont.load().then(font => { document.fonts.add(font); bootCabinet(); }).catch(bootCabinet);
