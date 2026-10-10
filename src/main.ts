import "./style.css";
import { CONFIG } from "./config";
import { Input } from "./input/input";
import { Renderer } from "./render/renderer";
import { detectCollisions } from "./sim/collisions";
import { step } from "./sim/physics";
import { World } from "./sim/world";
import { buildPanel } from "./ui/panel";
import { buildStats } from "./ui/stats";

const canvas = document.querySelector<HTMLCanvasElement>("#view")!;
const panelRoot = document.querySelector<HTMLElement>("#panel")!;
const statsRoot = document.querySelector<HTMLElement>("#stats")!;

const world = new World();
const renderer = new Renderer(canvas);
const input = new Input(canvas, world, renderer.camera);

renderer.resize();
renderer.resetView(world);
window.addEventListener("resize", () => renderer.resize());

const panel = buildPanel(panelRoot, world, renderer, input);
const stats = buildStats(statsRoot, world);

let accumulator = 0;
let lastFrame = performance.now();
let lastLag = -Infinity;
let stepsSinceCollisionCheck = 0;

function frame(now: number): void {
  const frameDt = Math.min((now - lastFrame) / 1000, CONFIG.maxFrameDt);
  lastFrame = now;

  if (!world.settings.paused) {
    accumulator += frameDt * world.settings.timeScale;
    let substeps = 0;
    while (accumulator >= CONFIG.fixedDt && substeps < CONFIG.maxSubstepsPerFrame) {
      step(world, CONFIG.fixedDt);
      if (++stepsSinceCollisionCheck === CONFIG.collisionCheckInterval) {
        detectCollisions(world, CONFIG.collisionCheckInterval * CONFIG.fixedDt);
        stepsSinceCollisionCheck = 0;
      }
      accumulator -= CONFIG.fixedDt;
      substeps++;
    }
    // Machine can't keep up with the timescale: drop the backlog instead of spiralling
    if (substeps === CONFIG.maxSubstepsPerFrame) {
      accumulator = 0;
      lastLag = now;
    }
  }

  input.update();
  renderer.draw(world, input.hoverPointer, input.spawnPreview, input.brush, world.settings.paused ? 0 : frameDt);
  panel.update(now - lastLag < CONFIG.lagIndicatorHoldMs);
  stats.update();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
