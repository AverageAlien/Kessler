import { CONFIG } from "../config";
import { primeAcceleration } from "./physics";
import type { Body, NewBody, World } from "./world";

// Spatial hash built with a counting sort into flat typed arrays, so a check allocates nothing per object
let cellStart = new Int32Array(0);
let cellEntries = new Int32Array(0);
let bodyCell = new Int32Array(0);

function hashCell(cx: number, cy: number, tableMask: number): number {
  return (Math.imul(cx, 92837111) ^ Math.imul(cy, 689287499)) & tableMask;
}

function buildGrid(bodies: Body[], cellSize: number, tableMask: number): void {
  const tableSize = tableMask + 1;
  if (cellStart.length < tableSize + 1) cellStart = new Int32Array(tableSize + 1);
  if (cellEntries.length < bodies.length) {
    cellEntries = new Int32Array(bodies.length * 2);
    bodyCell = new Int32Array(bodies.length * 2);
  }

  cellStart.fill(0, 0, tableSize + 1);
  for (let i = 0; i < bodies.length; i++) {
    const h = hashCell(Math.floor(bodies[i].x / cellSize), Math.floor(bodies[i].y / cellSize), tableMask);
    bodyCell[i] = h;
    cellStart[h]++;
  }
  for (let h = 1; h <= tableSize; h++) cellStart[h] += cellStart[h - 1];
  // Fills each cell from its end, leaving cellStart[h] at the cell's first entry
  for (let i = 0; i < bodies.length; i++) cellEntries[--cellStart[bodyCell[i]]] = i;
}

// Earliest time t in [0, 1] when two linearly moving circles touch, or -1 if they don't
function sweptContactTime(a: Body, b: Body, contactRadius: number): number {
  const px = a.prevX - b.prevX;
  const py = a.prevY - b.prevY;
  const dx = a.x - a.prevX - (b.x - b.prevX);
  const dy = a.y - a.prevY - (b.y - b.prevY);
  const dd = dx * dx + dy * dy;
  const t = dd > 0 ? Math.min(Math.max(-(px * dx + py * dy) / dd, 0), 1) : 0;
  const cx = px + dx * t;
  const cy = py + dy * t;
  return cx * cx + cy * cy <= contactRadius * contactRadius ? t : -1;
}

// Debris hits with a fraction of its drawn size, so a cloud's own pieces rarely meet each other
function collisionRadius(b: Body, scale: number): number {
  return b.radius * scale * (b.kind === "debris" ? CONFIG.debrisCollisionRadiusFactor : 1);
}

function canCollide(a: Body, b: Body, time: number): boolean {
  if (!a.alive || !b.alive) return false;
  // Slow bumps don't shatter anything; without this, pieces of one cloud grind each other to dust
  const dvx = a.vx - b.vx;
  const dvy = a.vy - b.vy;
  if (dvx * dvx + dvy * dvy < CONFIG.minShatterSpeed * CONFIG.minShatterSpeed) return false;
  return a.fragmentGroup === 0 || a.fragmentGroup !== b.fragmentGroup || time >= Math.max(a.graceUntil, b.graceUntil);
}

function randomFragmentMasses(totalMass: number, count: number): number[] {
  // Squared uniform weights give a few big pieces and many small ones
  const weights = Array.from({ length: count }, () => Math.random() ** 2 + 0.05);
  const sum = weights.reduce((acc, w) => acc + w, 0);
  return weights.map((w) => (totalMass * w) / sum);
}

interface FragmentCloud {
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  count: number;
}

function spawnCloud(
  world: World,
  cloud: FragmentCloud,
  baseKick: number,
  remaining: number,
  group: number,
  spawned: NewBody[],
): void {
  const masses = randomFragmentMasses(cloud.mass, cloud.count);
  const averageMass = cloud.mass / cloud.count;
  const kicks = masses.map((m) => {
    const angle = Math.random() * Math.PI * 2;
    // Small pieces fly off faster than big ones
    const speed = baseKick * (0.2 + 0.8 * Math.random()) * (averageMass / m) ** 0.25;
    return [Math.cos(angle) * speed, Math.sin(angle) * speed];
  });
  // Remove the net momentum of the random kicks, so the cloud keeps its parent's momentum
  let netX = 0;
  let netY = 0;
  masses.forEach((m, i) => {
    netX += kicks[i][0] * m;
    netY += kicks[i][1] * m;
  });
  netX /= cloud.mass;
  netY /= cloud.mass;

  masses.forEach((mass, i) => {
    const vx = cloud.vx + kicks[i][0] - netX;
    const vy = cloud.vy + kicks[i][1] - netY;
    const radius = Math.max(CONFIG.satelliteRadius * Math.cbrt(mass / CONFIG.satelliteMass), CONFIG.debrisMinRadius);
    const offsetAngle = Math.random() * Math.PI * 2;
    const offset = radius * Math.sqrt(Math.random());
    spawned.push({
      kind: "debris",
      // Catch up to the end of the check interval, like every other object
      x: cloud.x + Math.cos(offsetAngle) * offset + vx * remaining,
      y: cloud.y + Math.sin(offsetAngle) * offset + vy * remaining,
      vx,
      vy,
      mass,
      radius,
      // Area-to-mass ratio grows as mass^(-1/3)
      dragFactor: Math.min(Math.cbrt(CONFIG.satelliteMass / mass), CONFIG.debrisMaxDragFactor),
      fragmentGroup: group,
      graceUntil: world.time + CONFIG.fragmentGraceTime,
    });
  });
}

// Each collider breaks into its own debris cloud that keeps the collider's momentum, like real
// collisions (Iridium-Cosmos left two clouds along the two original orbits). A full inelastic merge
// would stop a head-on pair dead and drop all the debris straight down.
function fragment(world: World, a: Body, b: Body, t: number, interval: number, spawned: NewBody[]): void {
  const totalMass = a.mass + b.mass;
  const room = Math.max(CONFIG.maxObjects - world.bodies.length - spawned.length, 0);
  const count = Math.min(
    CONFIG.maxFragmentsPerCollision,
    Math.floor(totalMass / CONFIG.minFragmentMass),
    // sqrt keeps small debris-on-debris hits productive, which is what drives the runaway cascade
    Math.round(Math.sqrt(totalMass) * CONFIG.fragmentsPerSqrtMass),
    room,
  );
  if (count < 2) return;

  const countA = Math.min(Math.max(Math.round((count * a.mass) / totalMass), 1), count - 1);
  const relativeSpeed = Math.hypot(a.vx - b.vx, a.vy - b.vy);
  const baseKick = Math.max(relativeSpeed * CONFIG.fragmentKickFactor, CONFIG.fragmentMinKick);
  const group = world.newFragmentGroup();
  const remaining = (1 - t) * interval;

  for (const [parent, n] of [
    [a, countA],
    [b, count - countA],
  ] as const) {
    const cloud: FragmentCloud = {
      x: parent.prevX + (parent.x - parent.prevX) * t,
      y: parent.prevY + (parent.y - parent.prevY) * t,
      vx: parent.vx,
      vy: parent.vy,
      mass: parent.mass,
      count: n,
    };
    spawnCloud(world, cloud, baseKick, remaining, group, spawned);
  }
}

// Tests every pair that moved close since the last check; `interval` is the sim time since then
export function detectCollisions(world: World, interval: number): void {
  const bodies = world.bodies;
  const scale = world.settings.collisionScale;
  if (bodies.length < 2) {
    for (const b of bodies) {
      b.prevX = b.x;
      b.prevY = b.y;
    }
    return;
  }

  let maxRadius = 0;
  let maxDisplacement = 0;
  for (const b of bodies) {
    maxRadius = Math.max(maxRadius, collisionRadius(b, scale));
    maxDisplacement = Math.max(maxDisplacement, Math.hypot(b.x - b.prevX, b.y - b.prevY));
  }
  // Any touching pair then sits in neighbouring cells, measured at the end positions
  const cellSize = 2 * maxRadius + 2 * maxDisplacement;
  const tableMask = (1 << Math.ceil(Math.log2(bodies.length * 2))) - 1;
  buildGrid(bodies, cellSize, tableMask);

  const spawned: NewBody[] = [];
  let anyCollision = false;
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i];
    if (!a.alive) continue;
    const cx = Math.floor(a.x / cellSize);
    const cy = Math.floor(a.y / cellSize);

    for (let ox = -1; ox <= 1 && a.alive; ox++) {
      for (let oy = -1; oy <= 1 && a.alive; oy++) {
        const h = hashCell(cx + ox, cy + oy, tableMask);
        for (let k = cellStart[h]; k < cellStart[h + 1]; k++) {
          const j = cellEntries[k];
          if (j <= i) continue;
          const b = bodies[j];
          if (!canCollide(a, b, world.time)) continue;
          const t = sweptContactTime(a, b, collisionRadius(a, scale) + collisionRadius(b, scale));
          if (t < 0) continue;
          a.alive = false;
          b.alive = false;
          anyCollision = true;
          world.stats.collisions++;
          world.emit({
            type: "collision",
            x: a.prevX + (a.x - a.prevX) * t,
            y: a.prevY + (a.y - a.prevY) * t,
            mass: a.mass + b.mass,
            speed: Math.hypot(a.vx - b.vx, a.vy - b.vy),
          });
          fragment(world, a, b, t, interval, spawned);
          break;
        }
      }
    }
  }

  if (anyCollision) world.removeDead();
  for (const b of world.bodies) {
    b.prevX = b.x;
    b.prevY = b.y;
  }
  for (const init of spawned) primeAcceleration(world, world.addBody(init));
}
