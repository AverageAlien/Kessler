import { CONFIG } from "../config";

export type BodyKind = "satellite" | "debris" | "missile";

export interface Body {
  id: number;
  kind: BodyKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ax: number;
  ay: number;
  mass: number;
  radius: number;
  // Area-to-mass ratio relative to a satellite; light debris slows down faster
  dragFactor: number;
  // Position at the previous collision check, for swept collision tests
  prevX: number;
  prevY: number;
  // Fragments of the same collision ignore each other until graceUntil (sim time)
  fragmentGroup: number;
  graceUntil: number;
  alive: boolean;
}

export type NewBody = Pick<Body, "kind" | "x" | "y" | "vx" | "vy" | "mass" | "radius" | "dragFactor"> &
  Partial<Pick<Body, "fragmentGroup" | "graceUntil">>;

export interface Settings {
  earthRadius: number;
  surfaceGravity: number;
  timeScale: number;
  paused: boolean;
  atmosphere: boolean;
  atmosphereHeight: number;
  atmosphereDensity: number;
  moon: boolean;
  moonPeriapsis: number;
  moonApoapsis: number;
  // Multiplier on every object's radius for collision tests; real sizes would almost never collide
  collisionScale: number;
}

export interface Stats {
  collisions: number;
  reentered: number;
  escaped: number;
  hitMoon: number;
  cleanedUp: number;
}

function emptyStats(): Stats {
  return { collisions: 0, reentered: 0, escaped: 0, hitMoon: 0, cleanedUp: 0 };
}

// Things the renderer turns into visual effects; drained every frame
export type SimEvent =
  | { type: "collision"; x: number; y: number; mass: number; speed: number }
  | { type: "reentry"; x: number; y: number }
  | { type: "moonImpact"; x: number; y: number }
  | { type: "cleanup"; x: number; y: number };

export interface Moon {
  // Fraction of the orbit done, as an angle growing at a constant rate (Kepler's mean anomaly)
  meanAnomaly: number;
  x: number;
  y: number;
}

export class World {
  bodies: Body[] = [];
  time = 0;
  stats: Stats = emptyStats();
  // Moves on a fixed elliptical orbit; physics.step advances it
  moon: Moon = { meanAnomaly: 0, x: CONFIG.earthRadius + CONFIG.moonAltitudeDefault, y: 0 };
  // Bumped by clear(), so views holding history know to drop it
  epoch = 0;
  events: SimEvent[] = [];
  settings: Settings = {
    earthRadius: CONFIG.earthRadius,
    surfaceGravity: CONFIG.surfaceGravity,
    timeScale: 1,
    paused: false,
    atmosphere: true,
    atmosphereHeight: CONFIG.atmosphereHeightDefault,
    atmosphereDensity: 1,
    moon: false,
    moonPeriapsis: CONFIG.moonAltitudeDefault,
    moonApoapsis: CONFIG.moonAltitudeDefault,
    collisionScale: CONFIG.collisionScaleDefault,
  };

  private nextId = 1;
  private nextFragmentGroup = 1;

  get mu(): number {
    return this.settings.surfaceGravity * this.settings.earthRadius ** 2;
  }

  get moonMu(): number {
    return this.mu * CONFIG.moonMassRatio;
  }

  // Semi-major axis and eccentricity of the Moon's orbit, from the Ap/Pe altitudes
  get moonOrbit(): { a: number; e: number; apoapsisRadius: number } {
    const rp = this.settings.earthRadius + this.settings.moonPeriapsis;
    const ra = this.settings.earthRadius + this.settings.moonApoapsis;
    return { a: (rp + ra) / 2, e: (ra - rp) / (ra + rp), apoapsisRadius: ra };
  }

  isInsideMoon(x: number, y: number): boolean {
    return this.settings.moon && Math.hypot(x - this.moon.x, y - this.moon.y) < CONFIG.moonRadius;
  }

  addBody(init: NewBody): Body {
    const body: Body = {
      id: this.nextId++,
      ax: 0,
      ay: 0,
      prevX: init.x,
      prevY: init.y,
      fragmentGroup: 0,
      graceUntil: 0,
      alive: true,
      ...init,
    };
    this.bodies.push(body);
    return body;
  }

  // Capped, so a huge cascade at high time scale can't pile up thousands of effects in one frame
  emit(event: SimEvent): void {
    if (this.events.length < CONFIG.maxPendingEvents) this.events.push(event);
  }

  newFragmentGroup(): number {
    return this.nextFragmentGroup++;
  }

  // Removes debris (never satellites or missiles) within radius r of a point
  sweepDebris(x: number, y: number, r: number): void {
    let removed = 0;
    for (const b of this.bodies) {
      if (b.kind !== "debris" || Math.hypot(b.x - x, b.y - y) > r) continue;
      b.alive = false;
      removed++;
      this.emit({ type: "cleanup", x: b.x, y: b.y });
    }
    if (removed === 0) return;
    this.stats.cleanedUp += removed;
    this.removeDead();
  }

  removeDead(): void {
    this.bodies = this.bodies.filter((b) => b.alive);
  }

  clear(): void {
    this.bodies = [];
    this.time = 0;
    this.stats = emptyStats();
    this.epoch++;
    this.events = [];
  }
}
