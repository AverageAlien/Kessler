import { CONFIG } from "../config";
import { advanceBody, primeAcceleration } from "./physics";
import { type Direction, randomRange, spawnConstellation, spawnOrbiting } from "./spawn";
import type { Body, World } from "./world";

// Busy same-direction traffic on slightly elliptical orbits. Crossings are too slow to shatter
// anything, so it stays stable until something comes the other way.
function spawnPrograde(world: World, count: number): void {
  const earthRadius = world.settings.earthRadius;
  for (let i = 0; i < count; i++) {
    const r = earthRadius + randomRange(CONFIG.crowdedLeoAltitudeMin, CONFIG.crowdedLeoAltitudeMax);
    spawnOrbiting(world, r, Math.random() * Math.PI * 2, 1, CONFIG.crowdedLeoJitter);
  }
}

export function crowdedLeo(world: World): void {
  world.clear();
  spawnPrograde(world, CONFIG.crowdedLeoCount);
}

export function counterRotatingRings(world: World): void {
  world.clear();
  spawnConstellation(world, CONFIG.ringsCount, CONFIG.ringsAltitude, "both");
}

// Anti-satellite test: a missile launched from the ground destroys a satellite inside a busy band.
// The intercept is built backwards: start the missile at the meeting point with its velocity reversed,
// fly it until it reaches the ground, and launch it from there. Verlet without drag is time-reversible,
// so the real flight retraces that path and arrives exactly on time.
export function asatTest(world: World): void {
  world.clear();
  spawnPrograde(world, CONFIG.asatBystanderCount);

  const earthRadius = world.settings.earthRadius;
  const targetR = earthRadius + CONFIG.asatTargetAltitude;
  const direction: Direction = 1;
  const interceptAngle = Math.random() * Math.PI * 2;
  const ux = Math.cos(interceptAngle);
  const uy = Math.sin(interceptAngle);
  const targetSpeed = Math.sqrt(world.mu / targetR);

  // Climbing at the intercept and moving against the target, for a high-speed hit
  const climb = targetSpeed * CONFIG.asatClimbFraction;
  const against = -targetSpeed * CONFIG.asatAgainstFraction * direction;
  const missile: Body = {
    id: 0,
    kind: "missile",
    x: ux * targetR,
    y: uy * targetR,
    vx: -(ux * climb - uy * against),
    vy: -(uy * climb + ux * against),
    ax: 0,
    ay: 0,
    mass: CONFIG.missileMass,
    radius: CONFIG.missileRadius,
    dragFactor: 0,
    prevX: 0,
    prevY: 0,
    fragmentGroup: 0,
    graceUntil: 0,
    alive: true,
  };
  primeAcceleration(world, missile);

  let steps = 0;
  const maxSteps = Math.round(CONFIG.asatMaxFlightTime / CONFIG.fixedDt);
  while (steps < maxSteps) {
    const previous = { ...missile };
    advanceBody(world, missile, CONFIG.fixedDt);
    if (Math.hypot(missile.x, missile.y) < earthRadius) {
      // The step into the ground is not part of the flight; launch from the last point above it
      Object.assign(missile, previous);
      break;
    }
    steps++;
  }

  const flightTime = steps * CONFIG.fixedDt;
  const angularSpeed = (targetSpeed / targetR) * direction;
  spawnOrbiting(world, targetR, interceptAngle - angularSpeed * flightTime, direction);

  const launched = world.addBody({
    kind: "missile",
    x: missile.x,
    y: missile.y,
    vx: -missile.vx,
    vy: -missile.vy,
    mass: missile.mass,
    radius: missile.radius,
    dragFactor: 0,
  });
  primeAcceleration(world, launched);
}
