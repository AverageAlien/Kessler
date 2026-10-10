import { CONFIG } from "../config";
import { primeAcceleration } from "./physics";
import type { Body, World } from "./world";

export type Direction = 1 | -1;
export type ConstellationDirection = "ccw" | "cw" | "both";

export function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function randomDirection(): Direction {
  return Math.random() < 0.5 ? 1 : -1;
}

// Returns null once the object cap is reached
export function spawnSatellite(world: World, x: number, y: number, vx: number, vy: number): Body | null {
  if (world.bodies.length >= CONFIG.maxObjects) return null;
  const body = world.addBody({
    kind: "satellite",
    x,
    y,
    vx,
    vy,
    mass: CONFIG.satelliteMass,
    radius: CONFIG.satelliteRadius,
    dragFactor: CONFIG.satelliteDragFactor,
  });
  primeAcceleration(world, body);
  return body;
}

// Direction 1 is counter-clockwise. Jitter perturbs the speed and adds a radial component, both as
// fractions of the circular speed, which makes the orbit slightly elliptical.
export function spawnOrbiting(
  world: World,
  r: number,
  angle: number,
  direction: Direction,
  jitter = 0,
): Body | null {
  const circular = Math.sqrt(world.mu / r);
  const speed = circular * (1 + randomRange(-jitter, jitter));
  const radialSpeed = circular * randomRange(-jitter, jitter);
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const vx = -uy * speed * direction + ux * radialSpeed;
  const vy = ux * speed * direction + uy * radialSpeed;
  return spawnSatellite(world, ux * r, uy * r, vx, vy);
}

export function spawnRandomSatellite(world: World): Body | null {
  const r = world.settings.earthRadius * (1 + randomRange(CONFIG.randomSatAltitudeMin, CONFIG.randomSatAltitudeMax));
  return spawnOrbiting(world, r, Math.random() * Math.PI * 2, randomDirection(), CONFIG.randomSatSpeedJitter);
}

// Evenly spaced satellites on one circular orbit. "both" launches a full ring each way, the
// clockwise one shifted by half a gap, so the two rings meet head-on all around.
export function spawnConstellation(world: World, count: number, altitude: number, direction: ConstellationDirection): void {
  const r = world.settings.earthRadius + altitude;
  const phase = Math.random() * Math.PI * 2;
  const gap = (Math.PI * 2) / count;
  const rings: [Direction, number][] =
    direction === "both" ? [[1, 0], [-1, gap / 2]] : [[direction === "ccw" ? 1 : -1, 0]];

  for (const [ringDirection, offset] of rings) {
    for (let i = 0; i < count; i++) spawnOrbiting(world, r, phase + offset + i * gap, ringDirection);
  }
}
