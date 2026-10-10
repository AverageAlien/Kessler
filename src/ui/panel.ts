import { CONFIG } from "../config";
import type { OrbitMode } from "../render/orbits";
import type { Input } from "../input/input";
import type { Renderer } from "../render/renderer";
import { positionMoon } from "../sim/physics";
import { asatTest, counterRotatingRings, crowdedLeo } from "../sim/scenarios";
import { type ConstellationDirection, spawnConstellation, spawnRandomSatellite } from "../sim/spawn";
import type { World } from "../sim/world";

export interface Panel {
  update(lagging: boolean): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function section(parent: HTMLElement, title: string): HTMLElement {
  const container = el("div", "panel-section");
  container.append(el("div", "panel-section-title", title));
  parent.append(container);
  return container;
}

function row(parent: HTMLElement): HTMLElement {
  const container = el("div", "panel-row");
  parent.append(container);
  return container;
}

function button(parent: HTMLElement, label: string, onClick: () => void): HTMLButtonElement {
  const b = el("button", undefined, label);
  b.type = "button";
  b.addEventListener("click", () => {
    onClick();
    // Otherwise a focused button would also react to Space, which toggles pause
    b.blur();
  });
  parent.append(b);
  return b;
}

interface SliderOptions {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format: (value: number) => string;
  onInput: (value: number) => void;
}

// Double-click resets to the initial value. Returns a setter that moves the slider as if dragged.
function slider(parent: HTMLElement, options: SliderOptions): (value: number) => void {
  const container = el("label", "panel-slider");
  const header = el("div", "panel-slider-header");
  const valueText = el("span", "panel-slider-value", options.format(options.value));
  header.append(el("span", undefined, options.label), valueText);

  const input = el("input");
  input.type = "range";
  input.min = String(options.min);
  input.max = String(options.max);
  input.step = String(options.step);
  input.value = String(options.value);

  const apply = (value: number) => {
    valueText.textContent = options.format(value);
    options.onInput(value);
  };
  input.addEventListener("input", () => apply(Number(input.value)));
  input.addEventListener("dblclick", () => {
    input.value = String(options.value);
    apply(options.value);
  });

  container.append(header, input);
  parent.append(container);
  return (value) => {
    input.value = String(value);
    apply(value);
  };
}

function formatTimeScale(timeScale: number): string {
  return timeScale >= 1 ? `${timeScale}×` : `1/${Math.round(1 / timeScale)}×`;
}

export function buildPanel(root: HTMLElement, world: World, renderer: Renderer, input: Input): Panel {
  const settings = world.settings;
  root.append(el("h1", "panel-title", "Kessler"));

  const objects = section(root, "Objects");
  const objectsRow = row(objects);
  button(objectsRow, "Spawn satellite", () => spawnRandomSatellite(world));
  button(objectsRow, "Clear all", () => world.clear());

  const constellation = section(root, "Constellation");
  let constellationCount = CONFIG.constellationCountDefault;
  let constellationAltitude = CONFIG.constellationAltitudeDefault;
  let constellationDirection: ConstellationDirection = "ccw";
  slider(constellation, {
    label: "Satellites",
    min: CONFIG.constellationCountMin,
    max: CONFIG.constellationCountMax,
    step: 1,
    value: constellationCount,
    format: (v) => v.toFixed(0),
    onInput: (v) => (constellationCount = v),
  });
  slider(constellation, {
    label: "Altitude",
    min: CONFIG.constellationAltitudeMin,
    max: CONFIG.constellationAltitudeMax,
    step: 5,
    value: constellationAltitude,
    format: (v) => v.toFixed(0),
    onInput: (v) => (constellationAltitude = v),
  });
  const directionRow = row(constellation);
  const directions: [ConstellationDirection, string, string][] = [
    ["ccw", "CCW", "Counter-clockwise"],
    ["cw", "CW", "Clockwise"],
    ["both", "Both", "One ring each way: they meet head-on"],
  ];
  const directionButtons = directions.map(([direction, label, tooltip]) => {
    const b = button(directionRow, label, () => (constellationDirection = direction));
    b.title = tooltip;
    return { direction, button: b };
  });
  button(row(constellation), "Launch constellation", () =>
    spawnConstellation(world, constellationCount, constellationAltitude, constellationDirection),
  );

  const cleanup = section(root, "Debris cleanup");
  const cleanupButton = button(row(cleanup), "", () => input.toggleCleanup());
  cleanupButton.title = "Left-drag sweeps debris away; satellites are left alone";
  slider(cleanup, {
    label: "Brush size",
    min: CONFIG.cleanupBrushMinPx,
    max: CONFIG.cleanupBrushMaxPx,
    step: 5,
    value: input.cleanupBrushPx,
    format: (v) => `${v.toFixed(0)} px`,
    onInput: (v) => (input.cleanupBrushPx = v),
  });

  const presets = section(root, "Presets (replace everything)");
  const presetList: [string, string, (world: World) => void][] = [
    ["Crowded LEO", "100 satellites, all counter-clockwise: stable. Shift-click one clockwise into it.", crowdedLeo],
    ["ASAT test", "A missile from the ground destroys a satellite in a busy band", asatTest],
    ["Counter-rotating rings", "Two rings on the same orbit going opposite ways", counterRotatingRings],
  ];
  for (const [label, tooltip, run] of presetList) {
    const b = button(row(presets), label, () => run(world));
    b.title = tooltip;
  }

  const time = section(root, "Time");
  const timeStatus = el("div", "panel-status");
  time.append(timeStatus);
  const timeRow = row(time);
  const setTimeScale = (value: number) => {
    settings.timeScale = Math.min(Math.max(value, CONFIG.timeScaleMin), CONFIG.timeScaleMax);
  };
  button(timeRow, "÷2", () => setTimeScale(settings.timeScale / 2));
  button(timeRow, "1×", () => setTimeScale(1));
  button(timeRow, "×2", () => setTimeScale(settings.timeScale * 2));
  const pauseButton = button(row(time), "Pause (Space)", () => (settings.paused = !settings.paused));

  const view = section(root, "Orbits & view");
  const orbitsRow = row(view);
  const orbitModes: [OrbitMode, string][] = [
    ["off", "Off"],
    ["satellites", "Satellites"],
    ["all", "All"],
  ];
  const orbitButtons = orbitModes.map(([mode, label]) => {
    const b = button(orbitsRow, label, () => (renderer.orbitMode = mode));
    return { mode, button: b };
  });
  const viewRow = row(view);
  const trailsButton = button(viewRow, "", () => (renderer.showTrails = !renderer.showTrails));
  button(viewRow, "Reset view", () => renderer.resetView(world));

  const environment = section(root, "Environment");
  const atmosphereButton = button(row(environment), "", () => (settings.atmosphere = !settings.atmosphere));
  slider(environment, {
    label: "Atmosphere height",
    min: CONFIG.atmosphereHeightMin,
    max: CONFIG.atmosphereHeightMax,
    step: 5,
    value: settings.atmosphereHeight,
    format: (v) => v.toFixed(0),
    onInput: (v) => (settings.atmosphereHeight = v),
  });
  // Logarithmic: the slider moves the exponent, so 1x sits in the middle
  slider(environment, {
    label: "Atmosphere density",
    min: Math.log10(CONFIG.atmosphereDensityMin),
    max: Math.log10(CONFIG.atmosphereDensityMax),
    step: 0.05,
    value: Math.log10(settings.atmosphereDensity),
    format: (v) => `${(10 ** v).toFixed(10 ** v < 1 ? 2 : 1)}×`,
    onInput: (v) => (settings.atmosphereDensity = 10 ** v),
  });

  const moonButton = button(row(environment), "", () => {
    settings.moon = !settings.moon;
    if (!settings.moon) return;
    positionMoon(world);
    renderer.ensureVisible(world.moonOrbit.apoapsisRadius * CONFIG.moonViewMargin);
  });
  moonButton.title = "Moon on a fixed elliptical orbit; its gravity bends high orbits";
  const moonAltitude = {
    min: CONFIG.moonAltitudeMin,
    max: CONFIG.moonAltitudeMax,
    step: 25,
    format: (v: number) => v.toFixed(0),
  };
  // Pe can't pass Ap: dragging one past the other pushes the other along
  let setMoonApoapsis = (_: number) => {};
  const setMoonPeriapsis = slider(environment, {
    ...moonAltitude,
    label: "Moon Pe",
    value: settings.moonPeriapsis,
    onInput: (v) => {
      settings.moonPeriapsis = v;
      if (v > settings.moonApoapsis) setMoonApoapsis(v);
      positionMoon(world);
    },
  });
  setMoonApoapsis = slider(environment, {
    ...moonAltitude,
    label: "Moon Ap",
    value: settings.moonApoapsis,
    onInput: (v) => {
      settings.moonApoapsis = v;
      if (v < settings.moonPeriapsis) setMoonPeriapsis(v);
      positionMoon(world);
    },
  });

  slider(environment, {
    label: "Gravity (surface)",
    min: CONFIG.surfaceGravityMin,
    max: CONFIG.surfaceGravityMax,
    step: 5,
    value: settings.surfaceGravity,
    format: (v) => v.toFixed(0),
    onInput: (v) => (settings.surfaceGravity = v),
  });
  slider(environment, {
    label: "Earth radius",
    min: CONFIG.earthRadiusMin,
    max: CONFIG.earthRadiusMax,
    step: 5,
    value: settings.earthRadius,
    format: (v) => v.toFixed(0),
    onInput: (v) => {
      settings.earthRadius = v;
      positionMoon(world);
    },
  });
  slider(environment, {
    label: "Collision size",
    min: CONFIG.collisionScaleMin,
    max: CONFIG.collisionScaleMax,
    step: 0.25,
    value: settings.collisionScale,
    format: (v) => `${v.toFixed(2)}×`,
    onInput: (v) => (settings.collisionScale = v),
  });

  const help = section(root, "Mouse");
  help.append(
    el(
      "div",
      "panel-help",
      "Left-drag: launch, arrow = velocity\n" +
        "Left-click: circular orbit (Shift: clockwise)\n" +
        "Esc or right-click: cancel launch\n" +
        "Right/middle-drag: pan · Wheel: zoom\n" +
        "Hover object or orbit: Ap/Pe\n" +
        "C: cleanup tool (left-drag sweeps debris)",
    ),
  );

  window.addEventListener("keydown", (e) => {
    if (e.code !== "Space" || e.repeat) return;
    e.preventDefault();
    settings.paused = !settings.paused;
  });

  return {
    update(lagging) {
      const lagText = lagging ? " (lagging)" : "";
      timeStatus.textContent = `${formatTimeScale(settings.timeScale)}${lagText} · t = ${world.time.toFixed(0)} s`;
      timeStatus.classList.toggle("warning", lagging);
      pauseButton.textContent = settings.paused ? "Resume (Space)" : "Pause (Space)";
      pauseButton.classList.toggle("active", settings.paused);
      atmosphereButton.textContent = settings.atmosphere ? "Atmosphere: ON" : "Atmosphere: OFF";
      atmosphereButton.classList.toggle("active", settings.atmosphere);
      cleanupButton.textContent = input.cleanupMode ? "Cleanup tool: ON (C)" : "Cleanup tool: OFF (C)";
      cleanupButton.classList.toggle("active", input.cleanupMode);
      trailsButton.textContent = renderer.showTrails ? "Trails: ON" : "Trails: OFF";
      trailsButton.classList.toggle("active", renderer.showTrails);
      moonButton.textContent = settings.moon ? "Moon: ON" : "Moon: OFF";
      moonButton.classList.toggle("active", settings.moon);
      for (const { mode, button: b } of orbitButtons) b.classList.toggle("active", renderer.orbitMode === mode);
      for (const { direction, button: b } of directionButtons) {
        b.classList.toggle("active", constellationDirection === direction);
      }
    },
  };
}
