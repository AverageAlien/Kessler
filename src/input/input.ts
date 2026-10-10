import { CONFIG } from "../config";
import type { Camera } from "../render/camera";
import { spawnSatellite } from "../sim/spawn";
import type { World } from "../sim/world";

export interface Pointer {
  x: number;
  y: number;
}

// World position and velocity of the satellite that a left-drag would launch
export interface SpawnPreview {
  x: number;
  y: number;
  vx: number;
  vy: number;
  // Screen point the velocity arrow points at
  tip: Pointer;
}

export interface Brush {
  x: number;
  y: number;
  radiusPx: number;
  active: boolean;
}

const LEFT_BUTTON = 0;
const MIDDLE_BUTTON = 1;
const RIGHT_BUTTON = 2;
// Bit for the right button in PointerEvent.buttons
const RIGHT_BUTTON_MASK = 2;
// Firefox reports wheel steps in lines, other browsers in pixels
const PX_PER_WHEEL_LINE = 16;

export class Input {
  // null while the mouse is outside the canvas (including over the panel)
  pointer: Pointer | null = null;
  spawnPreview: SpawnPreview | null = null;
  // In cleanup mode the left button sweeps debris instead of launching
  cleanupMode = false;
  cleanupBrushPx = CONFIG.cleanupBrushDefaultPx;
  sweeping = false;

  // World point where the left button went down; stays put if the view zooms mid-drag
  private spawnStart: { x: number; y: number } | null = null;
  private panLast: Pointer | null = null;
  private clockwise = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly world: World,
    private readonly camera: Camera,
  ) {
    canvas.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    canvas.addEventListener("pointermove", (e) => this.onPointerMove(e));
    canvas.addEventListener("pointerup", (e) => this.onPointerUp(e));
    canvas.addEventListener("pointerleave", () => (this.pointer = null));
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    // Stops the browser's middle-click autoscroll
    canvas.addEventListener("mousedown", (e) => {
      if (e.button === MIDDLE_BUTTON) e.preventDefault();
    });
    canvas.addEventListener("wheel", (e) => this.onWheel(e), { passive: false });
    window.addEventListener("keydown", (e) => {
      if (e.code === "Escape") this.cancelSpawn();
      if (e.code === "KeyC" && !e.ctrlKey && !e.metaKey && !e.altKey) this.toggleCleanup();
    });
  }

  // Hover highlighting is off while dragging or cleaning, so it doesn't fight the preview or brush
  get hoverPointer(): Pointer | null {
    return this.spawnStart || this.panLast || this.cleanupMode ? null : this.pointer;
  }

  get brush(): Brush | null {
    if (!this.cleanupMode || !this.pointer) return null;
    return { ...this.pointer, radiusPx: this.cleanupBrushPx, active: this.sweeping };
  }

  toggleCleanup(): void {
    this.cleanupMode = !this.cleanupMode;
    this.cancelSpawn();
    this.sweeping = false;
  }

  // Called every frame, so debris drifting into a still brush gets swept too
  update(): void {
    if (!this.sweeping || !this.pointer) return;
    const { camera } = this;
    this.world.sweepDebris(
      camera.toWorldX(this.pointer.x),
      camera.toWorldY(this.pointer.y),
      this.cleanupBrushPx / camera.zoom,
    );
  }

  private onPointerDown(e: PointerEvent): void {
    const p = { x: e.offsetX, y: e.offsetY };
    if (e.button === LEFT_BUTTON && this.cleanupMode) {
      this.pointer = p;
      this.sweeping = true;
    } else if (e.button === LEFT_BUTTON) {
      const x = this.camera.toWorldX(p.x);
      const y = this.camera.toWorldY(p.y);
      if (Math.hypot(x, y) <= this.world.settings.earthRadius || this.world.isInsideMoon(x, y)) return;
      this.spawnStart = { x, y };
      this.clockwise = e.shiftKey;
      this.spawnPreview = this.computePreview(p);
    } else if (e.button === MIDDLE_BUTTON || e.button === RIGHT_BUTTON) {
      e.preventDefault();
      this.panLast = p;
    } else {
      return;
    }
    this.canvas.setPointerCapture(e.pointerId);
  }

  private onPointerMove(e: PointerEvent): void {
    const p = { x: e.offsetX, y: e.offsetY };
    this.pointer = p;

    if (this.panLast) {
      this.camera.centerX -= (p.x - this.panLast.x) / this.camera.zoom;
      this.camera.centerY += (p.y - this.panLast.y) / this.camera.zoom;
      this.panLast = p;
    }
    // A second button pressed mid-drag arrives as a pointermove, not a pointerdown
    if (this.spawnStart && e.buttons & RIGHT_BUTTON_MASK) {
      this.cancelSpawn();
    }
    if (this.spawnStart) {
      this.clockwise = e.shiftKey;
      this.spawnPreview = this.computePreview(p);
    }
  }

  private onPointerUp(e: PointerEvent): void {
    if (e.button === LEFT_BUTTON && this.sweeping) {
      this.sweeping = false;
    } else if (e.button === LEFT_BUTTON && this.spawnStart) {
      this.clockwise = e.shiftKey;
      const preview = this.computePreview({ x: e.offsetX, y: e.offsetY });
      spawnSatellite(this.world, preview.x, preview.y, preview.vx, preview.vy);
      this.cancelSpawn();
    } else if (e.button === MIDDLE_BUTTON || e.button === RIGHT_BUTTON) {
      this.panLast = null;
    }
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
  }

  private cancelSpawn(): void {
    this.spawnStart = null;
    this.spawnPreview = null;
  }

  // A press without dragging gives a circular orbit (Shift for clockwise); dragging aims the velocity
  private computePreview(tip: Pointer): SpawnPreview {
    const { x, y } = this.spawnStart!;
    const dx = tip.x - this.camera.toScreenX(x);
    const dy = tip.y - this.camera.toScreenY(y);

    if (Math.hypot(dx, dy) < CONFIG.clickDragThresholdPx) {
      const r = Math.hypot(x, y);
      const speed = Math.sqrt(this.world.mu / r) * (this.clockwise ? -1 : 1);
      return { x, y, vx: (-y / r) * speed, vy: (x / r) * speed, tip };
    }
    // Screen y points down, world y points up
    return { x, y, vx: dx * CONFIG.dragVelocityPerPx, vy: -dy * CONFIG.dragVelocityPerPx, tip };
  }

  // Zooms around the cursor, so the world point under it stays put
  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const { camera } = this;
    const wx = camera.toWorldX(e.offsetX);
    const wy = camera.toWorldY(e.offsetY);
    const deltaPx = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? e.deltaY * PX_PER_WHEEL_LINE : e.deltaY;
    const zoom = camera.zoom * Math.exp(-deltaPx * CONFIG.wheelZoomSpeed);
    camera.zoom = Math.min(Math.max(zoom, CONFIG.zoomMin), CONFIG.zoomMax);
    camera.centerX = wx - (e.offsetX - camera.width / 2) / camera.zoom;
    camera.centerY = wy + (e.offsetY - camera.height / 2) / camera.zoom;
  }
}
