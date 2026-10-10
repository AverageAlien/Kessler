import { CONFIG } from "../config";
import type { Brush, Pointer, SpawnPreview } from "../input/input";
import { computeOrbit, type Orbit, radiusAtTrueAnomaly } from "../sim/orbit";
import { atmosphereDensity } from "../sim/physics";
import type { Body, BodyKind, World } from "../sim/world";
import { Camera } from "./camera";
import { drawReentryGlow, Effects, reentryHeat } from "./effects";
import { addOrbitToPaths, isOrbitShown, type OrbitMode, orbitPoint } from "./orbits";
import { Trails } from "./trails";

const MIN_SATELLITE_PX = 2.5;
const MIN_DEBRIS_PX = 1.2;

const BODY_COLORS: Record<BodyKind, string> = {
  satellite: "#e8f1ff",
  debris: "#ff9a4a",
  missile: "#ff4d6d",
};

const HOVER_DISTANCE_PX = 8;
// Pointing at an object wins over pointing at an orbit line passing nearby
const HOVER_BODY_BONUS_PX = 4;

const SATELLITE_ORBIT_COLOR = "rgba(120, 190, 255, 0.28)";
const DEBRIS_ORBIT_COLOR = "rgba(255, 150, 80, 0.14)";
const INSIDE_EARTH_COLOR = "rgba(255, 80, 80, 0.45)";
const HOVER_ORBIT_COLOR = "rgba(160, 225, 255, 0.95)";
const HOVER_INSIDE_COLOR = "rgba(255, 90, 90, 0.95)";

interface Hovered {
  body: Body;
  orbit: Orbit | null;
}

export class Renderer {
  readonly camera = new Camera();
  orbitMode: OrbitMode = "satellites";
  showTrails = true;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly effects = new Effects();
  private readonly trails = new Trails();

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context not available");
    this.ctx = ctx;
  }

  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.camera.resize(width, height);
  }

  // Zooms out (keeping the view centred on Earth) when a circle of this world radius doesn't fit
  ensureVisible(radius: number): void {
    const { camera } = this;
    const farthest = radius + Math.hypot(camera.centerX, camera.centerY);
    if (farthest * camera.zoom > Math.min(camera.width, camera.height) / 2) camera.fit(radius);
  }

  resetView(world: World): void {
    this.camera.fit(world.settings.earthRadius * CONFIG.initialViewRadiusFactor);
  }

  // realDt is wall-clock seconds since the last frame (0 while paused) and drives the effects
  draw(
    world: World,
    pointer: Pointer | null,
    spawnPreview: SpawnPreview | null,
    brush: Brush | null,
    realDt: number,
  ): void {
    const { ctx, camera } = this;
    ctx.fillStyle = "#03050b";
    ctx.fillRect(0, 0, camera.width, camera.height);

    this.effects.consume(world.events);
    world.events.length = 0;
    this.effects.update(realDt);
    this.trails.record(world);

    const orbits = world.bodies.map((b) =>
      isOrbitShown(b.kind, this.orbitMode) ? computeOrbit(world.mu, b.x, b.y, b.vx, b.vy) : null,
    );
    const hovered = pointer ? this.pickHovered(world, orbits, pointer) : null;

    this.drawEarth(world);
    if (world.settings.moon) this.drawMoon(world);
    this.drawOrbits(world, orbits);
    if (hovered?.orbit) this.drawHighlightedOrbit(world, hovered.orbit);
    if (this.showTrails) this.trails.draw(ctx, camera, world);
    this.drawBodies(world);
    this.effects.draw(ctx, camera);
    if (hovered) this.drawHoveredBody(hovered.body);
    if (spawnPreview) this.drawSpawnPreview(world, spawnPreview);
    if (brush) this.drawBrush(brush);
  }

  private drawBrush(brush: Brush): void {
    const { ctx } = this;
    ctx.save();
    ctx.beginPath();
    ctx.arc(brush.x, brush.y, brush.radiusPx, 0, Math.PI * 2);
    ctx.fillStyle = brush.active ? "rgba(90, 230, 255, 0.12)" : "rgba(90, 230, 255, 0.05)";
    ctx.fill();
    ctx.strokeStyle = brush.active ? "rgba(90, 230, 255, 0.9)" : "rgba(90, 230, 255, 0.5)";
    ctx.lineWidth = 1.5;
    if (!brush.active) ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.restore();
  }

  private maxOrbitRadius(world: World): number {
    return world.settings.earthRadius * CONFIG.escapeRadiusFactor;
  }

  private pickHovered(world: World, orbits: (Orbit | null)[], pointer: Pointer): Hovered | null {
    const { camera } = this;
    const wx = camera.toWorldX(pointer.x);
    const wy = camera.toWorldY(pointer.y);
    const pointerRadius = Math.hypot(wx, wy);
    const pointerAngle = Math.atan2(wy, wx);
    const maxRadius = this.maxOrbitRadius(world);

    let best = -1;
    let bestScore = HOVER_DISTANCE_PX;
    world.bodies.forEach((b, i) => {
      const bodyDistance = Math.hypot(camera.toScreenX(b.x) - pointer.x, camera.toScreenY(b.y) - pointer.y);
      if (bodyDistance - HOVER_BODY_BONUS_PX < bestScore) {
        best = i;
        bestScore = bodyDistance - HOVER_BODY_BONUS_PX;
      }

      const orbit = orbits[i];
      if (!orbit) return;
      // Radial distance to the line is cheap and close enough to the true distance
      const r = radiusAtTrueAnomaly(orbit, pointerAngle - orbit.argumentOfPeriapsis);
      if (r > maxRadius) return;
      const lineDistance = Math.abs(pointerRadius - r) * camera.zoom;
      if (lineDistance < bestScore) {
        best = i;
        bestScore = lineDistance;
      }
    });

    if (best < 0) return null;
    const body = world.bodies[best];
    return { body, orbit: orbits[best] ?? computeOrbit(world.mu, body.x, body.y, body.vx, body.vy) };
  }

  // Strokes world-space paths with a line width given in screen pixels
  private strokeWorldPath(path: Path2D, color: string, widthPx: number, dashPx?: number[]): void {
    const { ctx, camera } = this;
    ctx.save();
    ctx.transform(camera.zoom, 0, 0, -camera.zoom, camera.toScreenX(0), camera.toScreenY(0));
    ctx.strokeStyle = color;
    ctx.lineWidth = widthPx / camera.zoom;
    if (dashPx) ctx.setLineDash(dashPx.map((d) => d / camera.zoom));
    ctx.stroke(path);
    ctx.restore();
  }

  private drawOrbits(world: World, orbits: (Orbit | null)[]): void {
    const earthRadius = world.settings.earthRadius;
    const maxRadius = this.maxOrbitRadius(world);
    const satellitePaths = new Path2D();
    const debrisPaths = new Path2D();
    const insidePaths = new Path2D();

    world.bodies.forEach((b, i) => {
      const orbit = orbits[i];
      if (!orbit) return;
      const outside = b.kind === "debris" ? debrisPaths : satellitePaths;
      addOrbitToPaths(outside, insidePaths, orbit, earthRadius, maxRadius);
    });

    this.strokeWorldPath(debrisPaths, DEBRIS_ORBIT_COLOR, 1);
    this.strokeWorldPath(satellitePaths, SATELLITE_ORBIT_COLOR, 1);
    this.strokeWorldPath(insidePaths, INSIDE_EARTH_COLOR, 1, [5, 4]);
  }

  private drawHighlightedOrbit(world: World, orbit: Orbit): void {
    const earthRadius = world.settings.earthRadius;
    const maxRadius = this.maxOrbitRadius(world);
    const outside = new Path2D();
    const inside = new Path2D();
    addOrbitToPaths(outside, inside, orbit, earthRadius, maxRadius);
    this.strokeWorldPath(outside, HOVER_ORBIT_COLOR, 2);
    this.strokeWorldPath(inside, HOVER_INSIDE_COLOR, 2, [6, 4]);

    this.drawApsisMarker("Pe", orbitPoint(orbit, 0), orbit.periapsis - earthRadius);
    if (orbit.apoapsis <= maxRadius) {
      this.drawApsisMarker("Ap", orbitPoint(orbit, Math.PI), orbit.apoapsis - earthRadius);
    }
  }

  private drawApsisMarker(label: string, [x, y]: [number, number], altitude: number): void {
    const { ctx, camera } = this;
    const sx = camera.toScreenX(x);
    const sy = camera.toScreenY(y);

    ctx.fillStyle = HOVER_ORBIT_COLOR;
    ctx.beginPath();
    ctx.arc(sx, sy, 3.5, 0, Math.PI * 2);
    ctx.fill();
    this.drawLabel(`${label} ${altitude.toFixed(0)}`, sx + 7, sy);
  }

  private drawLabel(text: string, sx: number, sy: number): void {
    const { ctx } = this;
    ctx.font = "12px system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(3, 5, 11, 0.85)";
    ctx.fillStyle = HOVER_ORBIT_COLOR;
    ctx.strokeText(text, sx, sy);
    ctx.fillText(text, sx, sy);
  }

  private drawSpawnPreview(world: World, preview: SpawnPreview): void {
    const { ctx, camera } = this;
    const orbit = computeOrbit(world.mu, preview.x, preview.y, preview.vx, preview.vy);
    if (orbit) this.drawHighlightedOrbit(world, orbit);

    const sx = camera.toScreenX(preview.x);
    const sy = camera.toScreenY(preview.y);
    const tipDistance = Math.hypot(preview.tip.x - sx, preview.tip.y - sy);
    if (tipDistance >= CONFIG.clickDragThresholdPx) {
      const angle = Math.atan2(preview.tip.y - sy, preview.tip.x - sx);
      ctx.strokeStyle = HOVER_ORBIT_COLOR;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(preview.tip.x, preview.tip.y);
      for (const side of [-1, 1]) {
        ctx.moveTo(preview.tip.x, preview.tip.y);
        ctx.lineTo(
          preview.tip.x - 9 * Math.cos(angle + side * 0.45),
          preview.tip.y - 9 * Math.sin(angle + side * 0.45),
        );
      }
      ctx.stroke();
    }

    ctx.fillStyle = "rgba(232, 241, 255, 0.7)";
    ctx.beginPath();
    ctx.arc(sx, sy, MIN_SATELLITE_PX + 1, 0, Math.PI * 2);
    ctx.fill();

    const speed = Math.hypot(preview.vx, preview.vy);
    const r = Math.hypot(preview.x, preview.y);
    const circular = Math.sqrt(world.mu / r);
    const escape = circular * Math.SQRT2;
    const labelX = Math.max(preview.tip.x, sx) + 12;
    const labelY = Math.min(preview.tip.y, sy) - 12;
    this.drawLabel(`v ${speed.toFixed(0)}  (circular ${circular.toFixed(0)}, escape ${escape.toFixed(0)})`, labelX, labelY);
  }

  private drawEarth(world: World): void {
    const { ctx, camera } = this;
    const sx = camera.toScreenX(0);
    const sy = camera.toScreenY(0);
    const r = world.settings.earthRadius * camera.zoom;

    if (world.settings.atmosphere) {
      const { atmosphereHeight, atmosphereDensity: multiplier } = world.settings;
      const top = (world.settings.earthRadius + atmosphereHeight) * camera.zoom;
      // Follows the exponential density falloff (softened by sqrt to stay visible), like the drag does
      const halo = ctx.createRadialGradient(sx, sy, r, sx, sy, top);
      for (let i = 0; i <= 6; i++) {
        const fraction = i / 6;
        const density = multiplier * Math.exp(-fraction / CONFIG.atmosphereScaleHeightFraction);
        // Capped, so a very dense atmosphere doesn't hide Earth
        const alpha = i === 6 ? 0 : Math.min(0.5 * Math.sqrt(density), 0.8);
        halo.addColorStop(fraction, `rgba(110, 180, 255, ${alpha.toFixed(3)})`);
      }
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(sx, sy, top, 0, Math.PI * 2);
      ctx.fill();
    }

    const gradient = ctx.createRadialGradient(sx - r * 0.35, sy - r * 0.35, r * 0.1, sx, sy, r);
    gradient.addColorStop(0, "#4f9dff");
    gradient.addColorStop(0.7, "#1f5fc4");
    gradient.addColorStop(1, "#0d2f6e");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();

    // Night side, with the light coming from the upper left like the highlight
    const shade = ctx.createLinearGradient(sx - r * 0.4, sy - r * 0.4, sx + r, sy + r);
    shade.addColorStop(0, "rgba(2, 6, 20, 0)");
    shade.addColorStop(0.55, "rgba(2, 6, 20, 0)");
    shade.addColorStop(1, "rgba(2, 6, 20, 0.6)");
    ctx.fillStyle = shade;
    ctx.fill();

    if (world.settings.atmosphere) {
      ctx.strokeStyle = "rgba(150, 210, 255, 0.55)";
      ctx.lineWidth = Math.max(1, Math.min(r * 0.015, 3));
      ctx.stroke();
    }
  }

  private drawMoon(world: World): void {
    const { ctx, camera } = this;
    const ox = camera.toScreenX(0);
    const oy = camera.toScreenY(0);
    ctx.strokeStyle = "rgba(200, 205, 215, 0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    const { a, e } = world.moonOrbit;
    // Earth sits at the focus, so the ellipse centre is a*e away from it, opposite periapsis (+x)
    ctx.ellipse(ox - a * e * camera.zoom, oy, a * camera.zoom, a * Math.sqrt(1 - e * e) * camera.zoom, 0, 0, Math.PI * 2);
    ctx.stroke();

    const sx = camera.toScreenX(world.moon.x);
    const sy = camera.toScreenY(world.moon.y);
    const r = Math.max(CONFIG.moonRadius * camera.zoom, 2);
    const gradient = ctx.createRadialGradient(sx - r * 0.35, sy - r * 0.35, r * 0.1, sx, sy, r);
    gradient.addColorStop(0, "#d8dbe2");
    gradient.addColorStop(1, "#6d717c");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  private bodyScreenRadius(b: Body): number {
    const minPx = b.kind === "debris" ? MIN_DEBRIS_PX : MIN_SATELLITE_PX;
    return Math.max(b.radius * this.camera.zoom, minPx);
  }

  private drawBodies(world: World): void {
    const { ctx, camera } = this;

    for (const b of world.bodies) {
      const sx = camera.toScreenX(b.x);
      const sy = camera.toScreenY(b.y);
      const density = atmosphereDensity(world, Math.hypot(b.x, b.y));
      if (density > 0) {
        const heat = reentryHeat(density, Math.hypot(b.vx, b.vy));
        if (heat > 0) drawReentryGlow(ctx, sx, sy, b.vx, b.vy, heat);
      }
      ctx.fillStyle = BODY_COLORS[b.kind];
      ctx.beginPath();
      ctx.arc(sx, sy, this.bodyScreenRadius(b), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawHoveredBody(b: Body): void {
    const { ctx, camera } = this;
    ctx.strokeStyle = HOVER_ORBIT_COLOR;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(camera.toScreenX(b.x), camera.toScreenY(b.y), this.bodyScreenRadius(b) + 4, 0, Math.PI * 2);
    ctx.stroke();
  }
}
