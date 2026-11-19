/* Nitro Nonsense: Cabinet Edition. Adapted from the owner's Scrap party racer.
   Four cars share one simulation with seeded track geometry and physical lap gates.
   Artwork is deterministic game geometry; display type is the original Scrapline.
   Music uses note patterns and individual instrument samples from Scrap's Centro score. */
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
const carTimers = ['shield', 'boost', 'stun', 'slick', 'air', 'slow', 'reversed', 'contact', 'flash'];
const powerKey = (id, slot) => CABINET_KEYS['P' + (id + 1) + '_' + (slot + 1)][0].toUpperCase();
const powers = [
  // Name, description, color, cooldown.
  ['NITRO', 'Acelera a fondo durante 1 segundo.', 0xff9a2e, 6],
  ['CAÑÓN', 'Dispara y hace girar al rival.', 0xef6866, 4],
  ['ACEITE', 'Deja una mancha resbaladiza.', 0xc49bff, 5],
  ['MINA', 'Una sorpresa para quien te siga.', 0xf7d36b, 6],
  ['ESCUDO', 'Actívalo para bloquear un golpe.', 0x42baf8, 7],
  ['ONDA', 'Empuja a todos los autos cercanos.', 0x42d07a, 5],
  ['ZAP', 'Electrocuta y aturde a un rival cercano.', 0xffeb72, 6],
  ['INVERSIÓN', 'Onda frontal que invierte el giro del rival.', 0xe690ff, 6],
].map(([name, detail, color, cd]) => ({ name, detail, color, cd }));
const modifiers = [
  // Name, description, color, collision radius, optional placement reach.
  ['ACEITE', 'Pierdes agarre al pisarlo.', 0xc49bff, 22],
  ['CONO', 'Un golpe que te hace girar.', 0xff9a2e, 18],
  ['TURBO', 'Velocidad para quien lo pise.', 0x42d07a, 22],
  ['BARRERA', 'Un bloqueo de alto impacto.', 0xef6866, 25],
  ['MINA FIJA', 'Explota y se recarga en 3 s.', 0xf7d36b, 20],
  ['PINCHOS', 'Te frenan durante 1.8 s.', 0xcbd4e4, 21],
  ['RAMPA', 'Salta sobre autos y trampas.', 0x42baf8, 22],
  ['BOLA DE DEMOLICIÓN', 'Cruza de lado a lado y golpea al tocarte.', 0xffc579, 24, 30],
  ['PUERTAS', 'Un carril abre y el otro se cierra.', 0x52e5be, 0],
  ['IMÁN', 'Te arrastra hacia el borde señalado.', 0x8ba9ff, 0, 67],
  ['PORTAL', 'Te devuelve a un tramo anterior.', 0xe7a3ff, 21, 125],
  ['HIELO', 'Tramo grande con menos agarre.', 0xa0e3fa, 0, 76],
  ['CAÑÓN FIJO', 'Dispara proyectiles de lado a lado.', 0xffa978, 0, 30],
  ['TREN', 'Las luces avisan antes de que cruce el tren.', 0xffae64, 0, 32],
  ['CHICANA', 'Tres barreras alternadas te obligan a zigzaguear.', 0xff9082, 0, 90],
].map(([name, detail, color, radius, reach]) => ({ name, detail, color, radius, reach }));
const ballKind = 7, doorsKind = 8, magnetKind = 9, portalKind = 10, iceKind = 11, cannonKind = 12, trainKind = 13, chicaneKind = 14;
const zapKind = 6, invertKind = 7;
const doorInterval = 2.6, cannonInterval = 2.35;
const magnetReach = modifiers[magnetKind].reach, portalReach = modifiers[portalKind].reach, iceReach = modifiers[iceKind].reach;
const tuning = { step: 1 / 120, pace: 1.12, topSpeed: 162, laps: 2, wins: 5, road: 38, gateWidth: 80, maxModifiers: 32, jumpSeconds: 1.26 };
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
function signedDistance(distance, period) { return wrap(distance + period / 2, period) - period / 2; }
function angleDelta(a, b) { return signedDistance(a - b, Math.PI * 2); }
function hex(color) { return '#' + color.toString(16).padStart(6, '0'); }

function newSeed() { return (Math.random() * 4294967296) >>> 0 || 1; }
function doorSide(time) { return Math.floor(time / doorInterval) % 2 ? 1 : -1; }
function sideTrap(kind) { return kind === magnetKind || kind === cannonKind || kind === chicaneKind; }
function fullRoadTrap(kind) { return kind === ballKind || kind === doorsKind || kind === iceKind || kind === trainKind; }
function drawOffers(items, count, allowed = () => true) {
  const pool = [...items.keys()].filter(allowed), offers = [];
  while (offers.length < count && pool.length) offers.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return offers;
}
function trainPhase(trap, time) { return wrap(time + trap.s / 170, 6.6); }
function trainHead(phase) { return 108 * (phase - 1.2) - 69; }
function lateralPoint(anchor, lane) {
  return { x: anchor.x - Math.sin(anchor.angle) * lane, y: anchor.y + Math.cos(anchor.angle) * lane };
}

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
    for (const modifier of this.modifiers) modifier.readyAt = modifier.kind === cannonKind ? 1.25 : 0;
    this.round++; this.phase = 'countdown'; this.timer = 2.5; this.elapsed = 0;
    this.shots.length = 0; this.hazards.length = 0; this.effects.length = 0; this.finishOrder = [];
    for (const c of this.cars) {
      const s = -24 - Math.floor(c.id / 2) * 30, p = this.track.at(s, c.id % 2 ? 15 : -15);
      Object.assign(c, p, { vx: 0, vy: 0, speed: 0, lap: 0, gate: 0, gateTravel: 0, started: false, progress: s, safeS: p.s, stuck: 0, bestProgress: s, finished: false, finishTime: 0 });
      for (const name of carTimers) c[name] = 0;
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
    if ((kind === 1 || kind === invertKind) && this.shots.length >= 24 || (kind === 2 || kind === 3) && this.hazards.length >= 32) return false;
    const level = c.levels[kind], x = Math.cos(c.angle), y = Math.sin(c.angle);
    c.cooldowns[slot] = powers[kind].cd / (1 + (level - 1) * 0.18);
    if (kind === 0) { c.boost = 1 + level * 0.15; this.burst(c.x, c.y, powers[kind].color, 16); }
    if (kind === 1 || kind === invertKind) {
      const invert = kind === invertKind;
      const shot = {
        x: c.x + x * 18, y: c.y + y * 18,
        vx: invert ? x * 340 : x * 460 + c.vx, vy: invert ? y * 340 : y * 460 + c.vy,
        owner: c.id, life: invert ? 0.72 : 1.4,
      };
      if (invert) shot.invert = 1.6 + level * 0.42;
      this.shots.push(shot);
    }
    if (kind === 2 || kind === 3) {
      const px = c.x - x * 22, py = c.y - y * 22;
      this.hazards.push({ x: px, y: py, angle: this.track.project(px, py).angle, kind, owner: c.id, life: kind === 2 ? 12 : 18, age: 0, radius: kind === 2 ? 17 + level * 2 : 10 });
    }
    if (kind === 4) { c.shield = 2 + level * 0.7; this.burst(c.x, c.y, powers[kind].color, 32); }
    if (kind === 5) {
      const radius = 64 + level * 10;
      this.burst(c.x, c.y, powers[kind].color, radius);
      for (const rival of this.cars) if (rival !== c && Math.hypot(rival.x - c.x, rival.y - c.y) < radius) this.hit(rival, rival.x - c.x, rival.y - c.y, 150);
    }
    if (kind === zapKind) {
      const color = powers[kind].color;
      let distance = 102 + level * 10, target;
      for (const rival of this.cars) {
        const gap = Math.hypot(rival.x - c.x, rival.y - c.y);
        if (rival !== c && !rival.finished && gap < distance) { distance = gap; target = rival; }
      }
      this.burst(c.x, c.y, color, distance);
      if (target) {
        if (this.hit(target, 0, 0, 0)) target.stun = 0.87 + level * 0.22;
        if (this.effects.length < 40) this.effects.push({ x: c.x, y: c.y, target, color, life: 0.36 });
      }
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
    this.phase = 'workshop'; this.workshopMode = 'choice'; this.timer = 18;
    this.offers = drawOffers(modifiers, 5); this.choice = this.offers[0]; this.piecesLeft = 2;
    this.placeS = this.track.length * 0.22; this.lane = 0;
  }
  selectOffer(move) { this.choice = this.offers[wrap(this.offers.indexOf(this.choice) + move, this.offers.length)]; }
  canPlace(s, lane) {
    const p = this.trapAnchor(s, lane), seam = Math.min(p.s, this.track.length - p.s);
    const reach = modifiers[this.choice].reach || 0, seamPadding = this.choice === iceKind || this.choice === ballKind || this.choice === chicaneKind ? reach : 0;
    if (this.choice === portalKind && !this.portalFits(p.s)) return false;
    return this.modifiers.length < tuning.maxModifiers && seam > 100 + seamPadding && this.modifiers.every(m => {
      const distance = Math.abs(m.s - p.s);
      const field = reach + (modifiers[m.kind].reach || 0);
      return Math.hypot(m.x - p.x, m.y - p.y) > 34 &&
        Math.min(distance, this.track.length - distance) > 25 + field;
    });
  }
  portalFits(distance) {
    const sector = this.track.length / 4, offset = wrap(distance, sector);
    return offset >= portalReach + 39 && offset <= sector - 39;
  }
  trapAnchor(s, lane) { return this.track.at(s, fullRoadTrap(this.choice) || sideTrap(this.choice) ? 0 : lane); }
  chicane(trap) {
    return [-90, 0, 90].map((ds, i) => ({ ...this.track.at(trap.s + ds), side: (trap.lane < 0 ? -1 : 1) * (i === 1 ? -1 : 1) }));
  }
  place() {
    if (!this.canPlace(this.placeS, this.lane)) return false;
    const lane = fullRoadTrap(this.choice) ? 0 : this.lane;
    const trap = { ...this.trapAnchor(this.placeS, lane), lane, kind: this.choice };
    if (this.choice === chicaneKind) trap.gates = this.chicane(trap);
    this.modifiers.push(trap);
    return true;
  }
  nextDraft() {
    this.draft++;
    if (this.draft >= this.drafters.length) { this.beginRace(); return; }
    this.phase = 'draft'; this.timer = 15;
    const c = this.drafters[this.draft];
    const free = c.slots.includes(-1);
    this.offers = drawOffers(powers, 3, i => c.levels[i] < 3 && (free || c.slots.includes(i)));
    if (!this.offers.length) { this.nextDraft(); return; }
    this.choice = this.offers[0];
  }
  startDraft() { this.drafters = this.standings.slice(1); this.draft = -1; this.nextDraft(); }
  applyModifier(car, modifier, ball, dt) {
    const kind = modifier.kind;
    if (kind === doorsKind || kind === chicaneKind || kind === cannonKind || kind === iceKind || car.air > 0 || car.finished) return;
    if (kind === magnetKind) { this.pullMagnet(car, modifier, dt); return; }
    if (kind === trainKind) {
      const phase = trainPhase(modifier, this.elapsed);
      if (phase >= 1.2 && phase < 4.1) {
        const head = trainHead(phase), cos = Math.cos(modifier.angle), sin = Math.sin(modifier.angle);
        const dx = car.x - modifier.x, dy = car.y - modifier.y;
        const lane = dy * cos - dx * sin;
        if (Math.abs(dx * cos + dy * sin) < 22 && Math.abs(lane) < 98 && lane > head - 122 && lane < head + 12) this.hit(car, -sin, cos, 236);
      }
      return;
    }
    const position = kind === ballKind ? ball : modifier;
    const dx = car.x - position.x, dy = car.y - position.y;
    if (Math.hypot(dx, dy) >= modifiers[kind].radius) return;
    if (kind === 0) car.slick = 0.8;
    if (kind === 1 || kind === 3) this.hit(car, dx || 1, dy, kind === 3 ? 165 : 100);
    if (kind === 2) car.boost = 0.5;
    if (kind === 4 && this.elapsed >= (modifier.readyAt || 0)) {
      modifier.readyAt = this.elapsed + 3;
      this.hit(car, dx || 1, dy, 175);
      this.burst(modifier.x, modifier.y, modifiers[kind].color, 54);
    }
    if (kind === 5 && this.hit(car, 0, 0, 0)) car.slow = 1.8;
    if (kind === 6) { car.air = tuning.jumpSeconds; this.burst(car.x, car.y, modifiers[kind].color, 30); }
    if (kind === ballKind) this.hit(car, dx || -Math.sin(modifier.angle), dy || Math.cos(modifier.angle), 190);
    if (kind === portalKind && this.elapsed >= (modifier.readyAt || 0)) this.rewindPortal(car, modifier);
  }
  pullMagnet(car, modifier, dt) {
    const x = Math.cos(modifier.angle), y = Math.sin(modifier.angle), sign = modifier.lane < 0 ? -1 : 1;
    const dx = car.x - modifier.x, dy = car.y - modifier.y;
    const along = Math.abs(dx * x + dy * y), lane = (dy * x - dx * y) * sign;
    if (along >= magnetReach || Math.abs(lane) > 46 || car.shield > 0) return;
    const force = 570 * (1 - along / magnetReach) * dt * sign;
    car.vx -= y * force;
    car.vy += x * force;
  }
  portalExit(modifier) {
    return this.track.at(modifier.s - portalReach, modifier.lane > 0 ? -22 : 22);
  }
  rewindPortal(car, modifier) {
    modifier.readyAt = this.elapsed + 3;
    this.burst(car.x, car.y, 0xe7a3ff, 38);
    if (car.shield > 0) { car.shield = 0; return; }
    const exit = this.portalExit(modifier), length = this.track.length;
    const before = this.track.project(car.x, car.y).s;
    const rewind = signedDistance(before - exit.s, length);
    const speed = Math.hypot(car.vx, car.vy) * 0.8;
    Object.assign(car, exit, { vx: Math.cos(exit.angle) * speed, vy: Math.sin(exit.angle) * speed, safeS: exit.s });
    car.progress -= Math.max(0, rewind);
    car.gateTravel = Math.max(0, car.gateTravel - rewind);
    car.bestProgress = car.progress;
    car.stuck = 0;
    this.burst(exit.x, exit.y, 0x62e4f1, 38);
  }
  wreckingBall(modifier, time = this.elapsed) {
    return lateralPoint(modifier, 53 * Math.sin(time * 2.55 + modifier.s / 105));
  }
  fireTrackCannon(modifier) {
    if (this.elapsed < modifier.readyAt || this.shots.length >= 24) return;
    modifier.readyAt = this.elapsed + cannonInterval;
    const side = modifier.lane < 0 ? -1 : 1, muzzle = lateralPoint(modifier, side * 37);
    this.shots.push({ ...muzzle, vx: Math.sin(modifier.angle) * side * 270, vy: -Math.cos(modifier.angle) * side * 270, owner: -1, life: 0.43 });
  }
  blockDoor(car, door, oldX, oldY) {
    if (car.air > 0) return;
    const x = Math.cos(door.angle), y = Math.sin(door.angle);
    const dx = car.x - door.x, dy = car.y - door.y;
    const along = dx * x + dy * y, lane = (dy * x - dx * y) * (door.side || doorSide(this.elapsed));
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
    const doors = [], icePatches = [], balls = new Map();
    for (const modifier of this.modifiers) {
      if (modifier.kind === doorsKind) doors.push(modifier);
      if (modifier.kind === chicaneKind) doors.push(...modifier.gates);
      if (modifier.kind === ballKind) balls.set(modifier, this.wreckingBall(modifier));
      if (modifier.kind === iceKind) icePatches.push(modifier);
      if (modifier.kind === cannonKind) this.fireTrackCannon(modifier);
    }
    for (const c of this.cars) {
      if (c.finished) continue;
      for (const name of carTimers) c[name] = Math.max(0, c[name] - dt);
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
            lane = -25 * (door.side || doorSide(this.elapsed + Math.max(0, ahead - 20) / Math.max(130, c.speed)));
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
      c.angle += steering * 3.25 * tuning.pace * clamp(Math.abs(forward) / 65, 0.1, 1) * (forward < -3 ? -1 : 1) * (c.reversed > 0 ? -1 : 1) * (c.stun > 0 ? 0.2 : 1) * dt;
      const offroad = p.distance > tuning.road;
      const onIce = !offroad && c.air <= 0 && icePatches.some(patch => Math.abs(patch.s - p.s) < iceReach);
      const speedLimit = tuning.topSpeed * tuning.pace * (c.boost > 0 ? 1.5 : 1) * (offroad ? 0.42 : 1) * (c.slow > 0 ? 0.5 : 1);
      const targetSpeed = brake ? -55 : speedLimit;
      const motor = (brake && forward > 0 ? 260 : 140) * tuning.pace;
      let nextSpeed = forward + clamp(targetSpeed - forward, -motor * dt, motor * dt);
      if (c.stun > 0) nextSpeed *= 1 - dt * 1.4;
      const lateral = -c.vx * Math.sin(c.angle) + c.vy * Math.cos(c.angle);
      const slip = lateral * Math.max(0, 1 - dt * (c.slick > 0 ? 0.8 : onIce ? 3.2 : offroad ? 4 : 9));
      c.vx = Math.cos(c.angle) * nextSpeed - Math.sin(c.angle) * slip;
      c.vy = Math.sin(c.angle) * nextSpeed + Math.cos(c.angle) * slip;
      this.moveCar(c, oldX, oldY, dt);
      for (const door of doors) this.blockDoor(c, door, oldX, oldY);
      c.speed = Math.hypot(c.vx, c.vy);
      const q = this.track.project(c.x, c.y), length = this.track.length;
      const ds = signedDistance(q.s - p.s, length);
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
      for (const modifier of this.modifiers) this.applyModifier(c, modifier, balls.get(modifier), dt);
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
        if (Math.hypot(c.x - oldX - dx * fraction, c.y - oldY - dy * fraction) < (shot.invert ? 28 : 14)) {
          if (shot.invert && c.shield <= 0) { c.reversed = shot.invert; this.burst(c.x, c.y, powers[invertKind].color, 36); }
          else this.hit(c, dx, dy, 140);
          shot.life = 0; break;
        }
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
function renderCabinetMusic(context) {
  const sampleRate = 24000, samplesPerBeat = sampleRate * 60 / 144;
  const chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62], [52, 56, 59, 62]];
  const roots = [45, 41, 36, 43, 40];
  const length = samplesPerBeat * chords.length * 4;
  const buffer = context.createBuffer(1, length, sampleRate);
  const output = buffer.getChannelData(0);
  const [keys, bass] = cabinetSamples.map(data => Float32Array.from(atob(data), value => (value.charCodeAt(0) - 128) / 127));
  function note(wave, cycles, beat, pitch, beats, volume, tail) {
    const start = Math.round(beat * samplesPerBeat), hold = Math.round(beats * samplesPerBeat);
    const release = Math.round(tail * sampleRate), attack = sampleRate * 0.012;
    const step = wave.length * (440 * 2 ** ((pitch - 69) / 12)) / (sampleRate * cycles);
    let phase = 0;
    for (let i = 0; i < hold + release; i++) {
      const index = Math.floor(phase), fraction = phase - index;
      const sample = wave[index] + (wave[(index + 1) % wave.length] - wave[index]) * fraction;
      const envelope = Math.min(1, i / attack) * (1 - 0.34 * Math.min(i / hold, 1)) * Math.min(1, (hold + release - i) / release);
      // Release tails continue across the loop boundary.
      output[(start + i) % length] += sample * envelope * volume;
      phase = (phase + step) % wave.length;
    }
  }
  for (const [bar, chord] of chords.entries()) {
    const beat = bar * 4, root = roots[bar];
    for (let i = 0; i < 4; i++) note(keys, 6, beat + i + 0.5, chord[(i + 1) % chord.length] + 12, 0.23, 0.22, 0.14);
    for (const [offset, pitch, duration] of [[0, root, 0.7], [1.5, root + 12, 0.35], [2, root + 7, 0.65], [3.25, root + 12, 0.45]]) {
      note(bass, 3, beat + offset, pitch, duration, 0.26, 0.18);
    }
  }
  return buffer;
}
function playMusic() {
  if (!window.AudioContext || !sceneRef || sceneRef.match.phase === 'paused' || document.hidden) return;
  if (!musicContext) {
    musicContext = new AudioContext();
    const music = musicContext.createBufferSource(), volume = musicContext.createGain();
    music.buffer = renderCabinetMusic(musicContext); music.loop = true; volume.gain.value = 0.42;
    music.connect(volume).connect(musicContext.destination);
    music.start();
  }
  if (musicContext.state !== 'running') musicContext.resume().catch(() => {});
}
function pauseForFocusLoss() { clearInput(); sceneRef?.pauseGame(); }
document.addEventListener('pointerdown', playMusic);
window.addEventListener('blur', pauseForFocusLoss);
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseForFocusLoss(); });

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
    if (m.phase === 'workshop' || m.phase === 'results' || m.phase === 'champion') {
      return m.winner.human ? m.winner.id : m.phase === 'workshop' ? -1 : 0;
    }
    return 0;
  }
  confirm(owner) { return owner >= 0 && (tap('P' + (owner + 1) + '_1') || tap('START' + (owner + 1))); }
  menuMove(owner) {
    if (owner < 0) return { x: 0, y: 0 };
    const m = this.match, prefix = 'P' + (owner + 1) + '_';
    const context = [m.phase, owner, m.workshopMode, m.draft, m.round].join(':');
    if (context !== this.navContext) { this.navContext = context; this.navDirection = ''; this.navNext = 0; }
    const axis = (positive, negative) => Number(tap(positive)) - Number(tap(negative)) || Number(!!held[positive]) - Number(!!held[negative]);
    const x = axis(prefix + 'R', prefix + 'L'), y = axis(prefix + 'D', prefix + 'U');
    if (!x && !y) { this.navDirection = ''; return { x: 0, y: 0 }; }
    const direction = x + ',' + y, changed = direction !== this.navDirection;
    if (!changed && this.age < this.navNext) return { x: 0, y: 0 };
    this.navDirection = direction; this.navNext = this.age + (changed ? 0.32 : 0.14);
    return y ? { x: 0, y } : { x, y: 0 };
  }
  menuHint(owner, action = 'confirmar') {
    if (owner < 0) return 'Turno del bot · espera';
    return (owner === 0 ? 'P1: W/A/S/D mover · U ' : 'P2: flechas mover · R ') + action;
  }
  startMatch(humans, size, phase) {
    this.match = new Championship(humans, newSeed(), size);
    if (phase) this.match.phase = phase;
    this.paintCircuit(); clearInput(); this.accumulator = 0;
  }
  showTitle() {
    this.titleRow = 2;
    this.startMatch(1, 0, 'title');
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
  solidRect(g, color, x, y, width, height, alpha) {
    return g.fillStyle(color, alpha).fillRect(x, y, width, height);
  }
  disk(g, color, x, y, radius, alpha) {
    return g.fillStyle(color, alpha).fillCircle(x, y, radius);
  }
  segment(g, width, color, x1, y1, x2, y2, alpha) {
    return g.lineStyle(width, color, alpha).lineBetween(x1, y1, x2, y2);
  }
  orient(g, x, y, angle) {
    return g.save().translateCanvas(x, y).rotateCanvas(angle);
  }
  paintCircuit() {
    const g = this.trackArt, track = this.match.track;
    g.clear().fillStyle(0x192827).fillRect(0, 0, track.width, track.height);
    for (let i = 0; i < track.width / 5; i++) {
      const x = (i * 197 + 33) % track.width, y = (i * 137) % track.height;
      if (track.project(x, y).distance < 52) continue;
      this.disk(g, i % 3 ? 0x20332e : 0x283b32, x, y, 2 + i % 5);
    }
    const points = track.points;
    g.lineStyle(91, 0x090e15).strokePoints(points, true);
    g.lineStyle(84, 0xe5d9c2).strokePoints(points, true);
    for (let s = 0; s < track.length; s += 16) {
      for (const side of [-40, 40]) {
        const a = track.at(s, side), b = track.at(s + 8, side);
        this.segment(g, 6, 0xd45845, a.x, a.y, b.x, b.y);
      }
    }
    g.lineStyle(74, 0x333c4c).strokePoints(points, true);
    g.lineStyle(67, 0x303948).strokePoints(points, true);
    for (let s = 0; s < track.length; s += 44) {
      const a = track.at(s), b = track.at(s + 17);
      this.segment(g, 2, 0x77818a, a.x, a.y, b.x, b.y, 0.5);
    }
    for (let row = 0; row < 2; row++) for (let col = 0; col < 8; col++) {
      const a = track.at(row * 7 - 3, -35 + col * 9);
      this.solidRect(g, (row + col) % 2 ? 0x101824 : 0xf2efdf, a.x - 4, a.y - 4, 8, 8);
    }
    for (const gate of track.gates.slice(1)) {
      const a = track.at(gate.s, -34), b = track.at(gate.s, 34);
      this.segment(g, 3, 0x91c7c4, a.x, a.y, b.x, b.y, 0.6);
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
      this.solidRect(g, 0x11191b, b.left + 8, b.top + 9, w, h, 0.72);
      this.solidRect(g, index % 3 ? 0x56686e : 0x75615a, b.left, b.top, w, h);
      g.lineStyle(3, 0x262d38).strokeRect(b.left, b.top, w, h);
      g.lineStyle(2, 0x96a6a5, 0.5).strokeRect(b.left + 6, b.top + 6, w - 12, h - 12);
      this.solidRect(g, 0x363f45, b.left + 13, b.top + 14, 21, 14).fillRect(b.right - 31, b.bottom - 24, 18, 11);
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
    const lift = c.air > 0 ? Math.sin(c.air / tuning.jumpSeconds * Math.PI) * 16 : 0;
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
    if (c.reversed > 0) g.lineStyle(2, powers[invertKind].color).strokeCircle(c.x, c.y, 21);
  }
  drawWorld() {
    const m = this.match, g = this.ink;
    g.clear(); this.overlay.clear(); this.labelIndex = 0;
    for (const h of m.modifiers) this.modifier(h.x, h.y, h.kind, true, h);
    for (const h of m.hazards) {
      if (h.kind === 2) {
        this.orient(g, h.x, h.y, h.angle);
        g.fillStyle(0x10101c, 0.9).fillEllipse(0, 0, h.radius * 2, h.radius * 1.5);
        g.lineStyle(2, 0x9574bd).strokeEllipse(0, 0, h.radius * 1.6, h.radius).restore();
      }
      else { this.disk(g, 0xf7d36b, h.x, h.y, 7); this.disk(g, h.age > 0.5 && this.age % 0.3 < 0.15 ? 0xef4b4c : 0x3c3232, h.x, h.y, 3); }
    }
    for (const c of m.cars) {
      if (c.slick > 0 && c.speed > 40) { this.segment(g, 3, 0x11141c, c.x - c.vx * 0.15, c.y - c.vy * 0.15, c.x, c.y, 0.7); }
      this.car(c);
      if (c.human && ['race', 'countdown'].includes(m.phase)) {
        const zoom = this.worldView.zoom;
        this.text(c.name, 400 + (c.x - this.viewX) * zoom, 297.5 + (c.y - this.viewY) * zoom - 18, 13, c.color, true);
      }
    }
    for (const s of m.shots) {
      const fixed = s.owner < 0;
      if (s.invert) {
        const angle = Math.atan2(s.vy, s.vx);
        g.lineStyle(4, powers[invertKind].color).beginPath().arc(s.x, s.y, 22, angle - 1.45, angle + 1.45).strokePath();
        continue;
      }
      this.segment(g, fixed ? 6 : 4, fixed ? 0xff9a52 : 0xffdd8d, s.x, s.y, s.x - s.vx * (fixed ? 0.065 : 0.018), s.y - s.vy * (fixed ? 0.065 : 0.018));
      if (fixed) this.disk(g, 0xffe8bf, s.x, s.y, 5);
    }
    for (const e of m.effects) {
      g.lineStyle(3, e.color, e.life / 0.55);
      if (e.target) {
        const dx = e.target.x - e.x, dy = e.target.y - e.y;
        g.strokePoints(Array.from({ length: 7 }, (_, i) => {
          const zig = i === 0 || i === 6 ? 0 : i % 2 ? 0.09 : -0.09;
          return { x: e.x + dx * i / 6 - dy * zig, y: e.y + dy * i / 6 + dx * zig };
        }));
      } else g.strokeCircle(e.x, e.y, e.radius * (1 - e.life / 0.55) + 3);
    }
  }
  modifier(x, y, kind, valid = true, state = null, g = this.ink, preview = false) {
    const rotated = state && kind < ballKind, worldX = x, worldY = y;
    if (rotated) { this.orient(g, x, y, state.angle); x = 0; y = 0; }
    if (kind === 0) { g.fillStyle(0x151322).fillEllipse(x, y, 38, 28); g.lineStyle(2, 0xc49bff).strokeEllipse(x, y, 30, 18); }
    if (kind === 1) { g.fillStyle(0x161b28).fillRoundedRect(x - 13, y - 5, 26, 18, 3); g.fillStyle(0xff9a2e).fillTriangle(x, y - 16, x - 10, y + 8, x + 10, y + 8); this.segment(g, 4, 0xf7ecd3, x - 5, y - 3, x + 5, y - 3); }
    if (kind === 2) { g.fillStyle(0x163f35).fillRoundedRect(x - 16, y - 14, 32, 28, 3); g.lineStyle(3, 0x42d07a); for (let i = -7; i < 10; i += 9) g.lineBetween(x + i - 4, y - 7, x + i + 3, y).lineBetween(x + i + 3, y, x + i - 4, y + 7); }
    if (kind === 3) {
      g.fillStyle(0x181c28).fillRoundedRect(x - 11, y - 23, 25, 46, 3);
      g.fillStyle(0xcbd4e4).fillRoundedRect(x - 10, y - 21, 19, 42, 3);
      for (let i = -17; i < 20; i += 14) this.solidRect(g, 0xef6866, x - 10, y + i, 19, 7);
    }
    if (kind === 4) {
      const ready = !state || this.match.elapsed >= (state.readyAt || 0);
      this.disk(g, 0x101520, x, y, 16);
      g.lineStyle(3, ready ? 0xf7d36b : 0x4a5570).strokeCircle(x, y, 13);
      if (!ready) g.lineStyle(2, 0xf7d36b).beginPath().arc(x, y, 18, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - (state.readyAt - this.match.elapsed) / 3)).strokePath();
      this.disk(g, ready ? 0xef4b4c : 0x4a5570, x, y, 5);
    }
    if (kind === 5) {
      this.solidRect(g, 0x876337, x - 11, y - 22, 22, 44);
      this.solidRect(g, 0x171d28, x - 8, y - 19, 16, 38);
      for (let i = -15; i < 20; i += 10) g.fillStyle(0xcbd4e4).fillTriangle(x + 6, y + i - 4, x - 9, y + i, x + 6, y + i + 4);
    }
    if (kind === 6) {
      this.solidRect(g, 0x18405c, x - 20, y - 14, 40, 28);
      for (const along of [-12, 0]) {
        this.segment(g, 3, 0x42baf8, x + along, y - 8, x + along + 7, y).lineBetween(x + along + 7, y, x + along, y + 8);
      }
      this.segment(g, 4, 0x98ddff, x + 19, y - 14, x + 19, y + 14);
    }
    if (rotated) g.restore();
    if (kind === ballKind) this.drawWreckingBall(g, x, y, state, preview);
    if (kind === doorsKind) this.drawDoors(g, x, y, state, preview);
    if (kind === magnetKind) this.drawMagnet(g, x, y, state);
    if (kind === portalKind) this.drawPortal(g, x, y, state, preview);
    if (kind === iceKind) this.drawIce(g, x, y, state);
    if (kind === cannonKind) this.drawCannon(g, x, y, state, preview);
    if (kind === trainKind) this.drawTrain(g, x, y, state, preview);
    if (kind === chicaneKind) {
      if (state) for (const door of state.gates || this.match.chicane(state)) this.drawDoors(g, door.x, door.y, door, preview);
      else for (let i = -1; i <= 1; i++) this.segment(g, 5, 0xff9082, x + i * 16, y, x + i * 16, y + (i ? 1 : -1) * 17);
    }
    if (!valid) this.segment(g, 3, 0xef4b4c, worldX - 16, worldY - 16, worldX + 16, worldY + 16);
  }
  drawWreckingBall(g, x, y, state, preview) {
    const pose = state ? this.match.wreckingBall(state, preview ? this.age : this.match.elapsed) : { x: x + 7, y: y + 5 };
    const anchor = state ? lateralPoint(state, -66) : { x: x - 17, y: y - 16 };
    if (state) {
      for (let lane = -51; lane <= 47; lane += 12) {
        const a = lateralPoint(state, lane), b = lateralPoint(state, lane + 6);
        this.segment(g, 4, 0xffc579, a.x, a.y, b.x, b.y, 0.76);
      }
    }
    this.disk(g, 0x252025, anchor.x, anchor.y, state ? 13 : 6);
    this.segment(g, state ? 7 : 4, 0x2b272c, anchor.x, anchor.y, pose.x, pose.y);
    this.segment(g, state ? 3 : 2, 0xbeb1a0, anchor.x, anchor.y, pose.x, pose.y);
    const radius = state ? 21 : 13;
    this.disk(g, 0x202633, pose.x + 3, pose.y + 5, radius + 2);
    this.disk(g, 0x69788a, pose.x, pose.y, radius);
    g.fillStyle(0xaab4bd).fillEllipse(pose.x - radius * 0.22, pose.y - radius * 0.28, radius, radius * 0.53);
    g.lineStyle(3, 0xffc579).strokeCircle(pose.x, pose.y, radius);
  }
  drawTrain(g, x, y, state, preview) {
    const phase = state ? trainPhase(state, preview ? this.age : this.match.elapsed) : 2.5;
    const scale = state ? 1 : 0.46;
    this.orient(g, x, y, state?.angle || 0).scaleCanvas(scale, scale);
    if (state) {
      g.lineStyle(4, 0x99949a);
      for (const rail of [-13, 13]) g.lineBetween(rail, -77, rail, 77);
      for (const edge of [-50, 50]) {
        this.disk(g, 0x252530, -22, edge, 10);
        this.disk(g, phase < 4.1 && Math.floor(phase * 7) % 2 ? 0xff6853 : 0x513940, -22, edge, 6);
      }
    }
    if (phase >= 1.2 && phase < 4.1) for (let i = 0; i < (state ? 3 : 1); i++) {
      const lane = state ? trainHead(phase) - i * 40 - 12 : 0;
      if (Math.abs(lane) > 100) continue;
      g.fillStyle(0x1a202b).fillRoundedRect(-19, lane - 21, 38, 43, 5);
      g.fillStyle(i ? 0x9f657d : 0xe09456).fillRoundedRect(-15, lane - 18, 30, 36, 4);
      this.solidRect(g, 0x372b3f, -12, lane - 8, 24, 13);
      if (i === 0) this.disk(g, 0xffe7b5, 0, lane + 14, 5);
    }
    g.restore();
  }
  drawIce(g, x, y, state) {
    if (state) {
      const track = this.match.track, left = [], right = [];
      for (let delta = -iceReach; delta <= iceReach; delta += 8) {
        left.push(track.at(state.s + delta, -37)); right.push(track.at(state.s + delta, 37));
      }
      const outline = left.concat(right.reverse());
      g.fillStyle(0x64c4e3, 0.68).fillPoints(outline, true);
      g.lineStyle(2, 0xc4efff, 0.84).strokePoints(outline, true);
    } else {
      g.fillStyle(0x478ba8).fillRoundedRect(x - 22, y - 15, 44, 30, 3);
      g.lineStyle(2, 0xa0e3fa).strokeRoundedRect(x - 22, y - 15, 44, 30, 3);
    }
    const crests = state ? [-51, -18, 21, 53] : [0];
    for (const along of crests) {
      const p = state ? this.match.track.at(state.s + along, along % 2 ? 15 : -14) : { x, y, angle: 0 };
      this.orient(g, p.x, p.y, p.angle);
      g.lineStyle(2, 0xe1f8ff, 0.9).strokePoints([{ x: -10, y: -8 }, { x: 0, y: -1 }, { x: -2, y: 4 }, { x: 10, y: 8 }]).restore();
    }
  }
  drawCannon(g, x, y, state, preview) {
    const side = state?.lane < 0 ? -1 : 1, base = state ? side * 58 : 8;
    const remaining = state && !preview ? (state.readyAt || 1.25) - this.match.elapsed : 0.25;
    const warning = remaining < 0.42;
    this.orient(g, x, y, state?.angle || 0);
    if (state) {
      for (let lane = -32; lane <= 32; lane += 13) {
        this.segment(g, warning ? 4 : 2, 0xffbd70, 0, lane, 0, lane + 6, warning ? 0.86 : 0.44);
      }
    }
    g.fillStyle(0x20222b).fillRoundedRect(-15, base - 12, 30, 24, 5);
    this.disk(g, 0x93665f, 0, base, 12);
    const mouth = base - side * 19;
    this.segment(g, 16, 0x2c252c, 0, base, 0, mouth);
    this.segment(g, 12, 0xb6836c, 0, base, 0, mouth);
    if (warning && state) this.disk(g, 0xffb36a, 0, mouth, 10, 0.45);
    this.segment(g, 6, warning ? 0xffd485 : 0x514755, -6, mouth, 6, mouth);
    g.restore();
  }
  drawDoors(g, x, y, state, preview) {
    const time = state && !preview ? this.match.elapsed : this.age;
    const angle = state ? state.angle : 0;
    const cos = Math.cos(angle), sin = Math.sin(angle), scale = state ? 1 : 0.51;
    const at = (along, lane) => ({ x: x + (along * cos - lane * sin) * scale, y: y + (along * sin + lane * cos) * scale });
    const closed = state?.side || doorSide(time), open = -closed;
    const warning = !state?.side && wrap(time, doorInterval) > doorInterval - 0.55;
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
      this.disk(g, 0x171d28, p.x, p.y, 7 * scale);
      this.disk(g, side === closed ? 0xff766d : color, p.x, p.y, 4 * scale);
    }
  }
  drawMagnet(g, x, y, state) {
    const side = state?.lane < 0 ? -1 : 1, angle = state?.angle || 0;
    const cos = Math.cos(angle), sin = Math.sin(angle), scale = state ? 1 : 0.7;
    const at = (along, lane) => {
      const lateral = state ? lane * side : lane - 51;
      return { x: x + (along * cos - lateral * sin) * scale, y: y + (along * sin + lateral * cos) * scale };
    };
    if (state) {
      g.fillStyle(0x778fff, 0.13).fillPoints([at(-magnetReach, -46), at(magnetReach, -46), at(magnetReach, 46), at(-magnetReach, 46)], true);
      for (const along of [-43, 0, 43]) {
        for (const lane of [-19, 5, 29]) {
          const alpha = 0.7 + Math.sin(this.age * 9 - lane * 0.11) * 0.24;
          g.lineStyle(3, 0xaabaff, alpha).strokePoints([at(along - 9, lane - 6), at(along, lane + 2), at(along + 9, lane - 6)]);
        }
      }
    }
    const fixture = [at(-17, 43), at(-17, 59), at(-10, 66), at(10, 66), at(17, 59), at(17, 43)];
    g.lineStyle(14 * scale, 0x172342).strokePoints(fixture);
    g.lineStyle(9 * scale, 0x8ba9ff).strokePoints(fixture);
    for (const along of [-17, 17]) g.lineStyle(10 * scale, 0xf9c4be).strokePoints([at(along, 43), at(along, 49)]);
  }
  drawPortal(g, x, y, state, preview) {
    const scale = state ? 1 : 0.7;
    const remaining = !state || preview ? 0 : Math.max(0, (state.readyAt || 0) - this.match.elapsed);
    const ready = remaining === 0;
    const exit = state ? this.match.portalExit(state) : { x: x - 25, y };
    if (state) {
      const track = this.match.track, exitLane = state.lane > 0 ? -22 : 22;
      for (let d = 20; d < portalReach - 14; d += 13) {
        const p = track.at(state.s - d, state.lane + (exitLane - state.lane) * d / portalReach);
        this.disk(g, d < portalReach / 2 ? 0xe7a3ff : 0x62e4f1, p.x, p.y, 2.5, ready ? 0.8 : 0.36);
      }
    }
    this.orient(g, exit.x, exit.y, exit.angle || 0);
    g.fillStyle(0x102833, 0.88).fillEllipse(0, 0, 34 * scale, 27 * scale);
    g.lineStyle(3 * scale, 0x62e4f1, ready ? 1 : 0.5).strokeEllipse(0, 0, 34 * scale, 27 * scale);
    this.segment(g, 2 * scale, 0x62e4f1, -6 * scale, -2 * scale, 6 * scale, -2 * scale);
    g.lineBetween(-6 * scale, 3 * scale, 6 * scale, 3 * scale).restore();
    this.orient(g, x, y, state?.angle || 0);
    g.fillStyle(0x322044, 0.92).fillEllipse(0, 0, 41 * scale, 33 * scale);
    g.lineStyle(3 * scale, ready ? 0xe7a3ff : 0x7d628c).strokeEllipse(0, 0, 41 * scale, 33 * scale);
    if (!ready) g.lineStyle(2, 0xe7a3ff).beginPath().arc(0, 0, 23, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - remaining / 3)).strokePath();
    g.lineStyle(3 * scale, ready ? 0xe7a3ff : 0x7d628c)
      .strokePoints([{ x: 6 * scale, y: -7 * scale }, { x: -6 * scale, y: 0 }, { x: 6 * scale, y: 7 * scale }]).restore();
  }
  hud() {
    const m = this.match, g = this.overlay;
    this.solidRect(g, 0x0e1018, 0, 0, 800, 94).fillRect(0, 501, 800, 99);
    this.segment(g, 1, 0x4a5570, 0, 93, 800, 93).lineBetween(0, 501, 800, 501);
    for (let i = 0; i < 4; i++) {
      const c = m.cars[i], x = 24 + i * 195;
      this.text(c.name, x, 20, 17, c.color); this.text(c.wins + ' / ' + tuning.wins, x + 98, 20, 18, 0xf2f5fb);
      for (let win = 0; win < tuning.wins; win++) g.fillStyle(win < c.wins ? c.color : 0x2b334a).fillRoundedRect(x + win * 30, 35, 23, 6, 2);
      this.text(c.finished ? 'META' : 'VUELTA ' + Math.min(tuning.laps, c.lap + 1) + ' / ' + tuning.laps, x, 55, 13, 0xcbd4e4);
      if (c.reversed > 0) this.text('GIRO INV.', x + 92, 55, 13, powers[invertKind].color);
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
        this.solidRect(g, 0x2b334a, px, py + 10, 101, 4);
        if (p) this.solidRect(g, cd > 0 ? 0x4a5570 : p.color, px, py + 10, 101 * clamp(1 - cd / (p.cd / (1 + (c.levels[kind] - 1) * 0.18)), 0, 1), 4);
      }
    }
    this.text('A/D girar · S frenar · ENTER pausa', 24, 582, 14, palette[0]);
    this.text(m.humans > 1 ? '←/→ girar · ↓ frenar · 2 pausa' : 'Los poderes se consiguen al perder', 418, 582, 14, m.humans > 1 ? palette[1] : 0xcbd4e4);
  }
  center(value, y, size, color, display = false) {
    return this.text(value, 400, y, size, color, true, display);
  }
  dim(alpha = 0.93) { this.overlay.fillStyle(0x0e1018, alpha).fillRect(0, 0, 800, 600); }
  key(label, x, y, width = 310, accent = true) {
    this.plate(x, y, width, 48, accent ? 0xff9a2e : 0x2b334a, accent ? 0xffbf77 : 0x4a5570);
    this.text(label, x + width / 2, y + 24, 18, accent ? 0x0e1018 : 0xf2f5fb, true);
  }
  choicePlate(x, y, width, height, selected, color = 0x3c4661) {
    this.plate(x, y, width, height, selected ? color : 0x1a1f2e, selected ? 0x42baf8 : 0x4a5570);
  }
  title() {
    this.dim(0.88);
    this.overlay.fillStyle(0xff9a2e).fillRect(35, 29, 6, 20);
    this.text('PLATANUS HACK 26  /  SANTIAGO', 55, 39, 15, 0xcbd4e4);
    this.text('NITRO', 55, 112, 76, 0xff9a2e, false, true);
    this.text('NONSENSE', 55, 188, 62, 0xf2f5fb, false, true);
    this.text('Gana. Cambia la pista. Pierde. Gana poderes.', 57, 249, 20, 0xf2f5fb);
    for (let row = 0; row < 3; row++) {
      const y = 282 + row * 63, focused = this.titleRow === row;
      this.choicePlate(55, y, 690, 49, focused, row === 2 ? 0xff9a2e : undefined);
      if (row === 2) this.center('JUGAR', y + 25, 22, focused ? 0x0e1018 : 0xf2f5fb);
      else {
        this.text(row === 0 ? 'JUGADORES' : 'TAMAÑO DEL CIRCUITO', 79, y + 25, 17, 0xcbd4e4);
        this.text('◀  ' + (row === 0 ? this.titleHumans + (this.titleHumans === 1 ? ' JUGADOR' : ' JUGADORES') : trackSizes[this.titleSize].name) + '  ▶', 566, y + 25, 18, focused ? 0xffbc66 : 0xf2f5fb, true);
      }
    }
    this.center('P1: W/S elegir · A/D ajustar · U o ENTER confirmar', 484, 16, palette[0]);
    this.center('P1: A/D girar · S frenar · U/I/O/J/K/L poderes', 514, 16, palette[0]);
    this.center('P2: ←/→ girar · ↓ frenar · R/T/Y/F/G/H poderes', 540, 16, palette[1]);
    this.center('Circuito nuevo en cada campeonato. Aceleración automática.', 565, 15, 0xcbd4e4);
    const records = [];
    if (this.best !== null) records.push('ORIGINAL ' + this.best.toFixed(1) + ' s');
    if (this.legacyBest !== null) records.push('LEGADO ' + this.legacyBest.toFixed(1) + ' s');
    this.center(records.length ? 'RÉCORDS: ' + records.join(' · ') : modifiers.length + ' PIEZAS DE PISTA · ' + powers.length + ' PODERES · 2 VUELTAS', 588, 13, 0x8c98af);
  }
  results(champion = false) {
    const m = this.match;
    this.dim();
    this.center(champion ? 'DUEÑO DEL ASFALTO' : 'RESULTADO DE LA RONDA', 65, 30, 0xff9a2e, true);
    this.center(m.winner.name + (champion ? ' GANA EL CAMPEONATO' : ' GANA LA RONDA ' + m.round), 113, 22, m.winner.color);
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
      this.center(m.winner.name + ' puede colocar 2 trampas. Los demás mejoran un poder.', 449, 17, 0xcbd4e4);
      this.key('CONTINUAR', 225, 480, 350);
    }
    this.center(this.menuHint(owner), champion ? 573 : 557, 15, palette[owner]);
  }
  workshopScreen() {
    const m = this.match, owner = this.menuOwner();
    if (m.workshopMode === 'choice' && owner >= 0) {
      this.dim(0.96);
      this.center(m.winner.name + ' · TALLER DE TRAMPAS', 38, 27, m.winner.color, true);
      this.center('Puedes colocar ' + m.piecesLeft + (m.piecesLeft === 1 ? ' trampa más' : ' trampas'), 76, 16, 0xcbd4e4);
      for (const [i, kind] of m.offers.entries()) {
        const y = 111 + i * 80, selected = m.choice === kind, item = modifiers[kind];
        this.choicePlate(56, y, 688, 68, selected);
        this.modifier(683, y + 34, kind, true, null, this.overlay);
        this.text(item.name, 75, y + 21, 20, item.color, false, true);
        this.text(item.detail, 75, y + 49, 15, 0xcbd4e4);
      }
      this.center(this.menuHint(owner, 'elegir'), 555, 16, m.winner.color);
      this.center((owner === 0 ? 'I' : 'T') + ' terminar el taller', 585, 14, 0xcbd4e4);
      return;
    }
    const kind = m.choice, portal = kind === portalKind;
    const p = m.trapAnchor(m.placeS, m.lane), valid = m.canPlace(m.placeS, m.lane);
    this.overlay.fillStyle(0x0e1018).fillRect(0, 0, 800, 94).fillRect(0, 501, 800, 99);
    this.text(m.winner.name + ' · ' + (owner < 0 ? 'ESTÁ EDITANDO' : 'UBICA ' + modifiers[m.choice].name), 24, 31, 23, m.winner.color);
    const first = owner === 0;
    const lateral = fullRoadTrap(kind) ? '' :
      ' · ' + (first ? 'W/S' : '↑/↓') + (sideTrap(kind) ? ' cambiar lado' : ' cambiar carril');
    const placement = (first ? 'A/D' : '←/→') + ' recorrer pista' + lateral +
      (first ? ' · U colocar · I volver' : ' · R colocar · T volver');
    this.text(owner < 0 ? 'Espera a que el bot coloque su pieza.' : placement, 24, 70, 16, 0xf2f5fb);
    this.modifier(p.x, p.y, kind, valid, { ...p, lane: m.lane }, this.ink, true);
    const help = kind === doorsKind ? 'Flechas: carril abierto · Barrera: carril cerrado' :
      kind === magnetKind ? 'Las flechas indican hacia dónde te arrastra.' :
      portal ? 'Entrada violeta · Salida celeste, más atrás en la pista' :
      kind === cannonKind ? 'El cañón se ilumina antes de disparar.' :
      kind === iceKind ? 'Afecta todo el ancho. Resbala menos que el aceite.' : modifiers[kind].detail;
    const warning = m.modifiers.length >= tuning.maxModifiers ? 'Pista llena. Vuelve para terminar.' :
      portal && !m.portalFits(p.s) ? 'Mueve ambos a un tramo entre dos controles.' : 'Busca un lugar libre, lejos de la salida.';
    this.center(help, 523, 16, modifiers[m.choice].color);
    this.center(valid ? 'Posición libre' : warning, 553, 17, valid ? 0xf2f5fb : 0xef6866);
    this.center('Fuera de la salida y separada de otras piezas. ' + m.modifiers.length + ' / ' + tuning.maxModifiers, 585, 14, 0x8c98af);
  }
  draftScreen() {
    const m = this.match, c = m.drafters[m.draft], assigned = c.slots.indexOf(m.choice);
    this.dim(0.96);
    this.center('PERDER TIENE SUS VENTAJAS', 49, 29, 0xff9a2e, true);
    this.center(c.name + ' · ELIGE UN PODER', 91, 21, c.color);
    this.center(c.human ? 'Mueve el joystick y presiona el botón con el que quieres dispararlo.' : c.name + ' está eligiendo una mejora.', 126, 16, 0xcbd4e4);
    for (const [i, kind] of m.offers.entries()) {
      const p = powers[kind], x = 39 + i * 244, y = 170, selected = m.choice === kind;
      this.choicePlate(x, y, 232, 109, selected);
      this.text(p.name, x + 17, y + 26, 21, p.color, false, true);
      this.text('NIVEL ' + c.levels[kind] + ' → ' + (c.levels[kind] + 1), x + 17, y + 60, 14, 0xcbd4e4);
      for (let level = 0; level < 3; level++) this.overlay.fillStyle(level < c.levels[kind] ? p.color : 0x4a5570).fillRect(x + 17 + level * 62, y + 86, 53, 5);
    }
    this.center(powers[m.choice].detail, 323, 18, 0xf2f5fb);
    if (!c.human) return;
    this.center(assigned < 0 ? 'Usa un botón libre. Los poderes asignados se conservan.' : 'Para mejorar, presiona su botón ' + (assigned + 1) + ' (' + powerKey(c.id, assigned) + ').', 390, 16, c.color);
    for (let i = 0; i < c.slots.length; i++) {
      const kind = c.slots[i], x = 38 + i % 3 * 244, y = 422 + Math.floor(i / 3) * 49;
      this.choicePlate(x, y, 234, 39, assigned === i);
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
          for (const kind of m.offers) {
            m.choice = kind;
            for (let i = 0; i < 24; i++) { m.placeS = m.track.length * wrap(m.round * 0.137 + i * 0.07, 1); m.lane = (i % 3 - 1) * 22; if (m.place()) { m.piecesLeft--; break; } }
            if (!m.piecesLeft) break;
          }
          m.startDraft(); clearInput();
        }
      } else if (m.workshopMode === 'choice') {
        if (move.y || move.x) m.selectOffer(move.y || move.x);
        if (tap('P' + (owner + 1) + '_2')) { m.startDraft(); clearInput(); }
        else if (this.confirm(owner)) {
          m.workshopMode = 'placement'; if (fullRoadTrap(m.choice)) m.lane = 0;
          clearInput();
        }
      } else {
        const prefix = 'P' + (owner + 1) + '_';
        m.placeS = wrap(m.placeS + (Number(!!held[prefix + 'R']) - Number(!!held[prefix + 'L'])) * 220 * dt, m.track.length);
        if (move.y && !fullRoadTrap(m.choice)) m.lane = sideTrap(m.choice) ? move.y * 22 : clamp(m.lane + move.y * 22, -22, 22);
        if (tap(prefix + '2')) { m.workshopMode = 'choice'; clearInput(); }
        else if (this.confirm(owner) && m.place()) {
          if (--m.piecesLeft > 0 && m.modifiers.length < tuning.maxModifiers) m.workshopMode = 'choice';
          else m.startDraft();
          clearInput();
        }
      }
    } else if (m.phase === 'draft') {
      const c = m.drafters[m.draft];
      if (owner < 0) {
        m.timer -= dt;
        if (m.timer < 14) {
          const assigned = c.slots.indexOf(m.choice);
          const slot = assigned < 0 ? c.slots.indexOf(-1) : assigned;
          if (m.upgrade(c, m.choice, slot)) { m.nextDraft(); clearInput(); }
        }
      } else {
        if (move.x || move.y) m.selectOffer(move.x || move.y);
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
      const title = m.phase === 'title';
      m.step(tuning.step, title);
      if (title && m.elapsed > 45) { m.beginRace(); m.phase = 'title'; }
      this.accumulator -= tuning.step;
    }
    this.frameWorld(dt); this.drawWorld();
    if (m.phase === 'title') this.title();
    else {
      if (m.phase === 'race' || m.phase === 'countdown') this.hud();
      if (m.phase === 'countdown') {
        this.plate(345, 117, 110, 67, 0x1a1f2e);
        this.center(m.timer > 0.5 ? String(Math.ceil(m.timer - 0.5)) : '¡YA!', 151, 45, 0xff9a2e, true);
      }
      if (m.phase === 'results' || m.phase === 'champion') this.results(m.phase === 'champion');
      if (m.phase === 'workshop') this.workshopScreen();
      if (m.phase === 'draft') this.draftScreen();
      if (m.phase === 'paused') {
        this.dim(0.9); this.center('EN EL GARAJE', 249, 42, 0xff9a2e, true);
        this.center('Pausa de P' + (this.pauseOwner + 1), 309, 22, palette[this.pauseOwner]);
        this.key('CONTINUAR', 235, 366, 330);
        this.center(this.menuHint(this.pauseOwner), 449, 16, palette[this.pauseOwner]);
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
const cabinetSamples = ['LkVicnNwb29xd3hpUTkoK1OX1PDx49LM09K2hVc4LDdTbHNwbm1tcXdxXEMtJDdvtOLw6djLzdTHn25HMjFGY3R1cXBwcXh5a1I6KCpPks/u8OLRyc/PtYZYOS03U2x1cW9vb3J4cl5ELyQ2bLDh8OrZy8zTyKJxSTMxRGFzdXFwcHF3eW1VPCopS4zK6+/i0cjO0LeJWzstNlBqdHNxcHBzeHRiSjMnNWis3vDr2svK0sikc0oy', 'PEBESU1TWWBnbnV7goeMkZaboKWprK6uraupqKempaOgnJiUkY+Ojo6OjYuKiIiKjI+Rk5OSkI+OkJKVl5iYlZKOi4qKi42NjYuIhYOCg4aKkJado6mvtbvCyc/V2dze3tzZ1tHNyMO+uLKrpJ2VjYV9dWxjW1JKQTkyKiQeGRUSERAREhMVFhgaHSAjJysvMzY6PkFGS1FXXmVscnh+g4iOlJmfo6epqamoqKenp6akoZ2YlZKQj4+PjoyLiYmKjI+Rk5SUk5GQkJKUl5mZl5WRjoyMjI6Pj46MiYaDgoOGio+Ump+lqrC3vcTL0dXZ2trY1tPPy8bBvLexqqSdlo+HgHhwZ19WTUQ8NCwlHhkUERAPDxAREhQWGRwfIycrLzI2Oj5CR0xTWWFob3V7gIaLkZedoqapqqurqqqqqqqopqKfm5eVlJOTkpGPjYuLjI6Qk5SVlJKRkZKTlpiZmZeUkY+NjI2Ojo2MiYaDgYCBg4aLj5SZn6Sqsbi/xszR1dfX1tXSzsrGwby2saqknZaPiIB4cGhfV05GPjYuJyEbFxQSERESExUXGRseISUpLDA0OA=='];
const displayFont = new FontFace('Scrapline', 'url(data:font/woff;base64,d09GRk9UVE8AAAtEAAkAAAAAE2gAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAABDRkYgAAAA6AAACGgAAA+xgSbo\x2fU9TLzIAAAoQAAAARQAAAGBpzGX2Y21hcAAACuQAAABRAAAAZgGpAh1oZWFkAAAJUAAAADYAAAA2MdoGIGhoZWEAAAn0AAAAGwAAACQDQAUWaG10eAAACYgAAABpAAAAtJjIAABtYXhwAAAA4AAAAAYAAAAGAC1QAG5hbWUAAApYAAAAigAAARYUOS6icG9zdAAACzgAAAAMAAAAIAADAAAAAFAAAC0AAHicvVd7cFRXGd9N9kd4hIVUboYysbZxasGGCC0FrE4KVpzSwVIqwSoIpQ01FApJCE1Dskn2kX3k7Oa1Cck2IA9pEUsjRex06BQLUyeISk2nMmKt044DKuM0ODI95+45i37nbngkd0H+cjLJ4Z57zvf4fd\x2fv912cDleWw+l05n3nmaq1FRvXb1r3xLofbt24tkpv3iWKHGJmlijOFlNdTC403y\x2fAK+CFk1jBpNdv40V5jilOZ1a2C2Nyxo4bPyF3onvS5LzbPl88b9bs++6f88DcefO\x2fWvzgXQ\x2fNvPcrK9ZVbVm\x2fedOds4pnX3V057CnqxsOh5N+HIW3O0OTHTMpLIfLkeNY5ix0Pu\x2f8R9acrIqss9n52fdn92V\x2f5BrnWu7qghNtYyaN+VnOwpznc06M\x2fdzYX4z9aFz+uMXj\x2fjU+f3z1+E8mTJ3QlpuTe2+umlgzMTLxpxNPuyvcfvd+91vin24x2Z3s38gMsc10YJBhdwSJEOJ+RJsQ9KCxFoxBfVsNQKwxHYZYl3JAvkFb6+j8bDXfMKczsHuQosWdrGLMYPTCfJ9hXxi7\x2fEh4EK9BaxWYqka4Cv4aeDyo8aMqjMtjyeJxur4SZpPaaCRi6GlDPI62HsQSYEOIJBDqgT+OxjZ4YlAVDJ4IGkPw+xFqRMSjXcc8aGvUIfeEkIhAPM0P2kwN2Ew9bTe1dLQpd3J10kUxpr7PIEtkCSUxWedCGVFelB3laB5jOlJ1iWmzZJxckCNyx\x2fhe8CyeBdGvsam\x2fgs1JhldDeNmLnbXorkTbBjK7BKEN8FaithaVXmwIIXX5GjZPEjbnzpG9N2xZbLNnIf9uT2Nu6VVrTP3eCoPX06MuZj29Mv+cLqJe5JcNc3v6US+y5Pq37mTh\x2fzJ1Mn1YL3KOYfrSjz6rPZJTNZqbboImNQ7jO6FWWNc4HWUbEGlEyAd\x2fQCfqaYEUN8H6hHYUvHGQYhUb8Zz6phhj0KZ2p2hx8zM3vuw2feZ0esvU0dHNrA4x1Mbg6YC3G80JRHZSUHPAXXRz0eiK8CaG0S0qqlHKhv0SVDcOwizTIG5XE\x2fC9IYiTfD9Uk1xkmH9SS6ECRM0V3EuRJm9WqCHD3J0uDC3uAtdnGQ670oc\x2f0bSfor4APijoz0vkYCBVitQ3zFIkd6ccIwHKCP2wpb\x2fp9ligHkexLMTlAvEXJGdcue+6cn\x2ffIDOqWlEThycB\x2fy6E9xE0S9LF1X1pk5UlkFkyCw8PGYODBPkpG0cIkkWLqBlPZaD3FU4esxuWAVuJzzBrWx6+xs2Nsv4WdGvVLejW\x2fzV1\x2fiF\x2fksRc5UFSA8hf8dj16n0yAxrfRaQGgXo0NaE+gJoI1JBG450RaLwgF9jQ+LktqmftaDxjU\x2fEnvAbfrKZB\x2foji2yym6WqZWhRT+xhmz9bChFgtOjzo9iLRjJ0Ri\x2ft0tceaX2QsptUwX9snL+RLqwfF\x2fanV+CaZsUR1r6YqEZZoS+QlCqsTdnk5oFOhhCgtSo5SFJ9qnXFf1+xvGeaRNKVo4YfUDoOJHWliqB2aGGxYOEZL3tfpeAknORQrIDUPVHG6rqrEHgiphDx8TSb28fWantPUESSq0fEiIlaFXmxGRURPbrmc6LqMaprsZ4Yar\x2f4IXyO8XjT60dAMTxh1LfrYXAbxRTrlLkCUryKLfJc6qIdT6wsI1qGhETWBKxYfpN9f01kxS71r8GPiOXxMsLegO4SOIKJ+RLwINFhHf6M84OfF6wbBsRY9W9Beg1CdFWAAm9PmvkW\x2fPWIezE7+A0MeUR8jSPf98DfDG4I3jCYrwvsIpHd1hMmXeLs1Zkgt1BRGg0Znd44ZKb0jH2PUvta5II\x2frRHrkcsg75GNQceFG8jzB8Kh8D4vPgf+Wb4VcQ\x2fOOqedIEwlSSkaLAt1LutIT4bSaD3Ha+vdllzXpxWkxn\x2fYZSoeuqXUm5q7EhQswt2Tg7UoUFaFkyBgYoP77IJNaLF1KrfuBjRR3838bapm6E9t\x2fBx\x2fNmD609qE7gUQX+mLoC0Pki1w0LkaXB7E6hOvg9cDjQ10Eda1wi6O9Yj0Vg+bS8RmQhyTNpwdUzigFf\x2fSAxjeaQQPy0dKEsBfNPl0hbzPULvkTiKPptr9owXOAWuk9fhzdHeiMo6MLrd2Ibgc7A3VBU2aBZd13K9+H+qNBA\x2f42Q28UXe3o7ER7F6K9hFoe1PL0W73QY0svgl0IdMLXjoYo1NvWB4f4JXlT06iIsogCu12X7ktqjGGeT8dMi3hKd8AIBBboDrA+7O4ZFv08K8sfWyH3Nlghb6HtblvI0XRQAxlDHh3jh9RE\x2fOzVLlqdqYuW4dIliM1WLFJDLHMhiHF7IuijvqDuqENsK21vGzEMLticPZyeBUWINqDdh84AuoLobdEFt9K9eLWK5l4iyUoSLUmDQKwUOyxS8L8ajD+iozHXZHBPVFowaIxO+k1bGKRpDS3wBREIIOhDCynF6tEhySo1w9gaQx1RgojRh8gewu8sLFLKgygs1OyxZl6WzcGzdgfybnvSq2msVhhSz1bGtyG2B\x2fE+9PSgL449MZj0xc81nEx1IpX+xBe6E85o0gV74etCQzvqYqi6Ed4Z4ijC4CL6wHwnGDR4hW7bCsgKlmGHnRl14BRvpRp9TQGyII5ynkJY\x2fcfgZfpMGSStbnPTm3oUPM7QH8bhBvRX4uVy9JahtRzsKYTL0VCGynKUV6KsAeVhPMTga0E0is42XbFYB1gIoWX0bd6NttPoeA19h7D\x2fVfTvxqHteK0Vf2CIRxGKaG1uJp0PIRoHewUtccRI\x2fP2IN6ON3lLyjxB8C1XpyAhJR\x2flFQ1TrIuZAVeutz6ytHcNbtPI19D8OLZ48h1lS6Tbv8NTQiDOng1NV1LTUdLj\x2fC\x2fklmPUAAQAAAAEAAEkLqj5fDzz1AAMD6AAAAADnB+E7AAAAAOcH4Tv\x2fZ\x2f9TBUwDdwAAAAMAAgAAAAAAAHicY4pgYGCsYWBgkWJgYL4HxKeA+AUQLwLiPqjYJ6AaJwYGpndQfhpQ\x2fTeIOIsARA+YhumvQsix9gBpNggfLAdUw6QGpLcB8RqonjVQuW1QGogZdaDYDKj+FhBbAXESEHcxMAAAEkIbRwAAAHicY2BkYGC2++\x2fEwMC6jAECGBlQgS4APnsCXQB4nGNgZuZm\x2fMLAysDA1MW0m4GBoQdCM95nMGRkYkAFjMicCCBgcGBQYIhitvvvxMDAXM6wFqaG8RpTDlBGgYEBADaNC4gAAAB4nIWOPQ6CQBCFP36U0FgYYr3xAARbSg9AIYmFHQFCSAga1Ct4Cg\x2fri7sVIaF4M9+bmX1ZIOJGgBfGgC9Z9tjLWfbZkTgOOHN0HIoaxxsOfBxvMXylkpqJigcDPSMtF6njLV9pU2j6Ur\x2frtlAdeWpva7743swS1i+ucpMS+3++ISPltPazH\x2famJvgAAHicRYw7CoAwAENfqaNDj6CLiB901UW8Rm\x2frdUTPEEMXE0LgQQIEogM1Fdmd7OhuGVnY2DnIkkljMrMWchZi6dGrW5c\x2fUln\x2fCvQMdEwfqgsPvgAAAHicY2BmwAsAAH0ABA==)');
displayFont.load().then(font => { document.fonts.add(font); bootCabinet(); }).catch(bootCabinet);
