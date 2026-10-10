import { CONFIG } from "../config";
import type { Body, World } from "./world";

export function atmosphereDensity(world: World, r: number): number {
  const { atmosphere, atmosphereHeight, atmosphereDensity: multiplier, earthRadius } = world.settings;
  const altitude = r - earthRadius;
  if (!atmosphere || altitude > atmosphereHeight) return 0;
  const scaleHeight = atmosphereHeight * CONFIG.atmosphereScaleHeightFraction;
  return multiplier * Math.exp(-Math.max(altitude, 0) / scaleHeight);
}

// Drag uses the half-kicked velocity, which is good enough for a non-conservative force
function updateAcceleration(world: World, body: Body): void {
  const r2 = body.x * body.x + body.y * body.y;
  const r = Math.sqrt(r2);
  const k = -world.mu / (r2 * r);
  body.ax = k * body.x;
  body.ay = k * body.y;

  if (world.settings.moon) {
    const { x: mx, y: my } = world.moon;
    const dx = body.x - mx;
    const dy = body.y - my;
    const d2 = dx * dx + dy * dy;
    const km = -world.moonMu / (d2 * Math.sqrt(d2));
    // The frame is centred on Earth, which the Moon also pulls; subtract Earth's own acceleration
    const m2 = mx * mx + my * my;
    const kEarth = -world.moonMu / (m2 * Math.sqrt(m2));
    body.ax += km * dx + kEarth * mx;
    body.ay += km * dy + kEarth * my;
  }

  const density = atmosphereDensity(world, r);
  if (density > 0) {
    const speed = Math.hypot(body.vx, body.vy);
    const drag = -CONFIG.dragCoefficient * body.dragFactor * density * speed;
    body.ax += drag * body.vx;
    body.ay += drag * body.vy;
  }
}

// Velocity Verlet: symplectic, so orbits don't drift over thousands of revolutions. Without drag it is
// also time-reversible, which the ASAT preset relies on.
export function advanceBody(world: World, b: Body, dt: number): void {
  const halfDt = dt / 2;
  b.vx += b.ax * halfDt;
  b.vy += b.ay * halfDt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  updateAcceleration(world, b);
  b.vx += b.ax * halfDt;
  b.vy += b.ay * halfDt;
}

// Solves Kepler's equation M = E - e sin E for the eccentric anomaly E (Newton's method)
function eccentricAnomaly(meanAnomaly: number, e: number): number {
  let E = e > 0.8 ? Math.PI : meanAnomaly;
  for (let i = 0; i < 8; i++) E -= (E - e * Math.sin(E) - meanAnomaly) / (1 - e * Math.cos(E));
  return E;
}

// Puts the Moon where its mean anomaly says on the current Ap/Pe ellipse; also used after slider changes
export function positionMoon(world: World): void {
  const moon = world.moon;
  const { a, e } = world.moonOrbit;
  const E = eccentricAnomaly(moon.meanAnomaly, e);
  moon.x = a * (Math.cos(E) - e);
  moon.y = a * Math.sqrt(1 - e * e) * Math.sin(E);
}

function advanceMoon(world: World, dt: number): void {
  const { a } = world.moonOrbit;
  const meanMotion = Math.sqrt((world.mu + world.moonMu) / a ** 3);
  world.moon.meanAnomaly = (world.moon.meanAnomaly + meanMotion * dt) % (Math.PI * 2);
  positionMoon(world);
}

export function step(world: World, dt: number): void {
  const earthRadius = world.settings.earthRadius;
  const escapeRadius = earthRadius * CONFIG.escapeRadiusFactor;
  let anyDead = false;
  // Verlet evaluates forces at the end of the step, so the Moon moves first
  if (world.settings.moon) advanceMoon(world, dt);

  for (const b of world.bodies) {
    advanceBody(world, b, dt);

    const r = Math.hypot(b.x, b.y);
    if (r < earthRadius) {
      b.alive = false;
      anyDead = true;
      world.stats.reentered++;
      world.emit({ type: "reentry", x: b.x, y: b.y });
    } else if (r > escapeRadius) {
      b.alive = false;
      anyDead = true;
      world.stats.escaped++;
    } else if (world.isInsideMoon(b.x, b.y)) {
      b.alive = false;
      anyDead = true;
      world.stats.hitMoon++;
      world.emit({ type: "moonImpact", x: b.x, y: b.y });
    }
  }

  if (anyDead) world.removeDead();
  world.time += dt;
}

export function primeAcceleration(world: World, body: Body): void {
  updateAcceleration(world, body);
}
