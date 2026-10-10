import type { World } from "../sim/world";

export interface StatsView {
  update(): void;
}

interface Sample {
  time: number;
  satellites: number;
  debris: number;
}

const MAX_SAMPLES = 300;
const INITIAL_SAMPLE_INTERVAL = 0.5;
const GRAPH_WIDTH = 240;
const GRAPH_HEIGHT = 110;
const SATELLITE_COLOR = "#e8f1ff";
const DEBRIS_COLOR = "#ff9a4a";

// Keeps the whole run in a fixed number of samples: when full, every other sample is dropped
// and the sampling interval doubles
class History {
  samples: Sample[] = [];
  private interval = INITIAL_SAMPLE_INTERVAL;
  private nextSampleTime = 0;

  reset(): void {
    this.samples = [];
    this.interval = INITIAL_SAMPLE_INTERVAL;
    this.nextSampleTime = 0;
  }

  record(time: number, satellites: number, debris: number): void {
    if (time < this.nextSampleTime) return;
    this.samples.push({ time, satellites, debris });
    this.nextSampleTime = time + this.interval;
    if (this.samples.length >= MAX_SAMPLES) {
      this.samples = this.samples.filter((_, i) => i % 2 === 0);
      this.interval *= 2;
    }
  }
}

// 1, 2, 5, 10, 20, 50, ... at or above value
function niceCeiling(value: number): number {
  if (value <= 1) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 5, 10]) {
    if (value <= step * magnitude) return step * magnitude;
  }
  return 10 * magnitude;
}

function formatDuration(seconds: number): string {
  if (seconds < 120) return `${seconds.toFixed(0)} s`;
  if (seconds < 7200) return `${(seconds / 60).toFixed(0)} min`;
  return `${(seconds / 3600).toFixed(1)} h`;
}

function drawGraph(ctx: CanvasRenderingContext2D, samples: Sample[], now: number): void {
  ctx.clearRect(0, 0, GRAPH_WIDTH, GRAPH_HEIGHT);
  const top = 6;
  const bottom = GRAPH_HEIGHT - 16;
  const left = 2;
  const right = GRAPH_WIDTH - 2;

  const peak = samples.reduce((max, s) => Math.max(max, s.satellites, s.debris), 0);
  const yMax = niceCeiling(peak);
  const xMax = Math.max(now, 1);
  const toX = (time: number) => left + (time / xMax) * (right - left);
  const toY = (value: number) => bottom - (value / yMax) * (bottom - top);

  ctx.strokeStyle = "rgba(120, 150, 210, 0.25)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const fraction of [0, 0.5, 1]) {
    const y = Math.round(toY(yMax * fraction)) + 0.5;
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
  }
  ctx.stroke();

  for (const [key, color] of [
    ["debris", DEBRIS_COLOR],
    ["satellites", SATELLITE_COLOR],
  ] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    samples.forEach((s, i) => {
      if (i === 0) ctx.moveTo(toX(s.time), toY(s[key]));
      else ctx.lineTo(toX(s.time), toY(s[key]));
    });
    ctx.stroke();
  }

  ctx.fillStyle = "#8a96b0";
  ctx.font = "11px system-ui, sans-serif";
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillText(String(yMax), left + 2, top + 1);
  ctx.fillText("0", left + 2, bottom + 3);
  ctx.textAlign = "right";
  ctx.fillText(formatDuration(xMax), right, bottom + 3);
}

export function buildStats(root: HTMLElement, world: World): StatsView {
  const list = document.createElement("dl");
  list.className = "stats-list";
  const labels = ["Satellites", "Debris", "Collisions", "Re-entered", "Escaped", "Hit Moon", "Cleaned up"];
  const fields = labels.map((label) => {
    const term = document.createElement("dt");
    term.textContent = label;
    const value = document.createElement("dd");
    list.append(term, value);
    return value;
  });
  const [satellitesField, debrisField, collisionsField, reenteredField, escapedField, hitMoonField, cleanedUpField] =
    fields;
  satellitesField.style.color = SATELLITE_COLOR;
  debrisField.style.color = DEBRIS_COLOR;

  const canvas = document.createElement("canvas");
  canvas.className = "stats-graph";
  const dpr = window.devicePixelRatio || 1;
  canvas.width = GRAPH_WIDTH * dpr;
  canvas.height = GRAPH_HEIGHT * dpr;
  canvas.style.width = `${GRAPH_WIDTH}px`;
  canvas.style.height = `${GRAPH_HEIGHT}px`;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);

  root.append(list, canvas);

  const history = new History();
  let epoch = world.epoch;

  return {
    update() {
      if (world.epoch !== epoch) {
        epoch = world.epoch;
        history.reset();
      }

      let satellites = 0;
      let debris = 0;
      for (const b of world.bodies) {
        if (b.kind === "satellite") satellites++;
        else if (b.kind === "debris") debris++;
      }
      history.record(world.time, satellites, debris);

      satellitesField.textContent = String(satellites);
      debrisField.textContent = String(debris);
      collisionsField.textContent = String(world.stats.collisions);
      reenteredField.textContent = String(world.stats.reentered);
      escapedField.textContent = String(world.stats.escaped);
      hitMoonField.textContent = String(world.stats.hitMoon);
      cleanedUpField.textContent = String(world.stats.cleanedUp);
      // The live point keeps the line reaching "now" between samples
      drawGraph(ctx, [...history.samples, { time: world.time, satellites, debris }], world.time);
    },
  };
}
