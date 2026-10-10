import { CONFIG } from "../config";
import type { Body, BodyKind, World } from "../sim/world";
import type { Camera } from "./camera";

const TRAIL_COLORS: Record<BodyKind, string> = {
  satellite: "232, 241, 255",
  debris: "255, 154, 74",
  missile: "255, 77, 109",
};
// Segments are batched by age into a few alpha levels instead of one stroke per segment
const ALPHA_BUCKETS = [0.45, 0.25, 0.1];
const MAX_POINTS = 32;

// Ring buffer of recent world positions with their sim time
class Trail {
  readonly points = new Float64Array(MAX_POINTS * 3);
  start = 0;
  length = 0;

  push(x: number, y: number, time: number): void {
    const index = ((this.start + this.length) % MAX_POINTS) * 3;
    this.points[index] = x;
    this.points[index + 1] = y;
    this.points[index + 2] = time;
    if (this.length < MAX_POINTS) this.length++;
    else this.start = (this.start + 1) % MAX_POINTS;
  }

  lastTime(): number {
    return this.length ? this.points[((this.start + this.length - 1) % MAX_POINTS) * 3 + 2] : -Infinity;
  }
}

function trailDuration(kind: BodyKind): number {
  return kind === "debris" ? CONFIG.debrisTrailDuration : CONFIG.trailDuration;
}

export class Trails {
  // Trails die with their body, no cleanup needed
  private trails = new WeakMap<Body, Trail>();

  // Sim time scale is uneven between frames, so points are spaced by sim time instead of per frame
  record(world: World): void {
    for (const b of world.bodies) {
      let trail = this.trails.get(b);
      if (!trail) {
        trail = new Trail();
        this.trails.set(b, trail);
      }
      if (world.time - trail.lastTime() >= trailDuration(b.kind) / MAX_POINTS) trail.push(b.x, b.y, world.time);
    }
  }

  draw(ctx: CanvasRenderingContext2D, camera: Camera, world: World): void {
    const paths = new Map<string, Path2D[]>();
    for (const kind of Object.keys(TRAIL_COLORS) as BodyKind[]) {
      paths.set(kind, ALPHA_BUCKETS.map(() => new Path2D()));
    }

    for (const b of world.bodies) {
      const trail = this.trails.get(b);
      if (!trail || trail.length === 0) continue;
      const duration = trailDuration(b.kind);
      const buckets = paths.get(b.kind)!;

      // Walk from the body backwards in time
      let x = camera.toScreenX(b.x);
      let y = camera.toScreenY(b.y);
      for (let i = trail.length - 1; i >= 0; i--) {
        const index = ((trail.start + i) % MAX_POINTS) * 3;
        const age = world.time - trail.points[index + 2];
        if (age > duration) break;
        const px = camera.toScreenX(trail.points[index]);
        const py = camera.toScreenY(trail.points[index + 1]);
        const bucket = Math.min(Math.floor((age / duration) * ALPHA_BUCKETS.length), ALPHA_BUCKETS.length - 1);
        buckets[bucket].moveTo(x, y);
        buckets[bucket].lineTo(px, py);
        x = px;
        y = py;
      }
    }

    ctx.save();
    ctx.lineWidth = 1;
    for (const [kind, buckets] of paths) {
      buckets.forEach((path, i) => {
        ctx.strokeStyle = `rgba(${TRAIL_COLORS[kind as BodyKind]}, ${ALPHA_BUCKETS[i]})`;
        ctx.stroke(path);
      });
    }
    ctx.restore();
  }
}
