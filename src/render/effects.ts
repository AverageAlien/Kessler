import type { SimEvent } from "../sim/world";
import type { Camera } from "./camera";

// Effects run on real time, not sim time, so they stay visible at any time scale.
// Sizes and spark speeds are in screen pixels, so they read the same at any zoom.

interface Flash {
  x: number;
  y: number;
  age: number;
  life: number;
  radiusPx: number;
  color: string;
}

interface Spark {
  // World anchor; the spark flies away from it in screen space
  x: number;
  y: number;
  dx: number;
  dy: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
}

const MAX_FLASHES = 120;
const MAX_SPARKS = 1500;
const SPARKS_PER_COLLISION = 10;

export class Effects {
  private flashes: Flash[] = [];
  private sparks: Spark[] = [];

  consume(events: SimEvent[]): void {
    for (const e of events) {
      if (e.type === "collision") this.addCollision(e.x, e.y, e.mass, e.speed);
      else if (e.type === "reentry") this.addFlash(e.x, e.y, 0.5, 7, "255, 140, 60");
      else if (e.type === "moonImpact") this.addFlash(e.x, e.y, 0.6, 9, "220, 220, 230");
      else this.addFlash(e.x, e.y, 0.35, 6, "90, 230, 255");
    }
  }

  clear(): void {
    this.flashes = [];
    this.sparks = [];
  }

  update(realDt: number): void {
    for (const f of this.flashes) f.age += realDt;
    for (const s of this.sparks) {
      s.age += realDt;
      s.dx += s.vx * realDt;
      s.dy += s.vy * realDt;
      s.vx *= 1 - 2.5 * realDt;
      s.vy *= 1 - 2.5 * realDt;
    }
    this.flashes = this.flashes.filter((f) => f.age < f.life);
    this.sparks = this.sparks.filter((s) => s.age < s.life);
  }

  draw(ctx: CanvasRenderingContext2D, camera: Camera): void {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    for (const f of this.flashes) {
      const progress = f.age / f.life;
      const sx = camera.toScreenX(f.x);
      const sy = camera.toScreenY(f.y);
      const r = f.radiusPx * (0.4 + 1.2 * progress);
      const alpha = (1 - progress) ** 2;
      const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
      glow.addColorStop(0, `rgba(${f.color}, ${alpha})`);
      glow.addColorStop(0.4, `rgba(${f.color}, ${alpha * 0.4})`);
      glow.addColorStop(1, `rgba(${f.color}, 0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.lineCap = "round";
    ctx.lineWidth = 1.2;
    for (const s of this.sparks) {
      const alpha = 1 - s.age / s.life;
      const sx = camera.toScreenX(s.x) + s.dx;
      const sy = camera.toScreenY(s.y) + s.dy;
      ctx.strokeStyle = `rgba(255, ${190 + Math.round(60 * alpha)}, 120, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      // Streak length follows speed
      ctx.lineTo(sx - s.vx * 0.04, sy - s.vy * 0.04);
      ctx.stroke();
    }
    ctx.restore();
  }

  private addFlash(x: number, y: number, life: number, radiusPx: number, color: string): void {
    if (this.flashes.length >= MAX_FLASHES) return;
    this.flashes.push({ x, y, age: 0, life, radiusPx, color });
  }

  private addCollision(x: number, y: number, mass: number, speed: number): void {
    const size = Math.sqrt(mass);
    this.addFlash(x, y, 0.7, 10 + 14 * size, "255, 225, 170");

    const count = Math.min(SPARKS_PER_COLLISION, MAX_SPARKS - this.sparks.length);
    const sparkSpeed = 60 + Math.min(speed, 200) * 0.8;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const v = sparkSpeed * (0.3 + 0.7 * Math.random()) * size;
      this.sparks.push({
        x,
        y,
        dx: 0,
        dy: 0,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v,
        age: 0,
        life: 0.4 + 0.5 * Math.random(),
      });
    }
  }
}

// Heating grows with air density and the square of speed; 0 = cold, 1 = burning brightly
export function reentryHeat(density: number, speed: number): number {
  return Math.min(Math.max((density * speed * speed - 300) / 2500, 0), 1);
}

// Orange glow plus a plasma tail pointing away from the direction of flight
export function drawReentryGlow(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  vx: number,
  vy: number,
  heat: number,
): void {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  const r = 3 + 9 * heat;
  const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
  glow.addColorStop(0, `rgba(255, 200, 120, ${0.9 * heat})`);
  glow.addColorStop(1, "rgba(255, 90, 30, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.fill();

  // Screen y points down, so the world velocity's y flips
  const speed = Math.hypot(vx, vy) || 1;
  const tailLength = 6 + 22 * heat;
  const tx = sx - (vx / speed) * tailLength;
  const ty = sy + (vy / speed) * tailLength;
  const tail = ctx.createLinearGradient(sx, sy, tx, ty);
  tail.addColorStop(0, `rgba(255, 150, 60, ${0.8 * heat})`);
  tail.addColorStop(1, "rgba(255, 60, 20, 0)");
  ctx.strokeStyle = tail;
  ctx.lineWidth = 1 + 2.5 * heat;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(tx, ty);
  ctx.stroke();

  ctx.restore();
}
