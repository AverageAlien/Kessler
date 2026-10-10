# Kessler sandbox

A small 2D sandbox thing that runs in browser and demonstrates the Kessler syndrome (space debris and satellites in Earth orbit crashing into eachother and creating exponentially more space debris)

Play it at https://averagealien.github.io/Kessler/

## Running locally

Requires Node.js.

```
npm install
npm run dev
```

`npm run build` writes a static build to `dist/`, and `npm run preview` serves it.

## Controls

- Left-drag: launch a satellite, the arrow sets its velocity
- Left-click: launch on a circular counter-clockwise orbit (Shift: clockwise)
- Esc or right-click while dragging: cancel the launch
- Right/middle-drag: pan, mouse wheel: zoom
- Space: pause, C: cleanup tool

## Features

- Orbital physics around Earth, with adjustable gravity and radius
- Atmosphere with drag (height and density adjustable) and re-entry glow
- Collisions that shatter objects into debris clouds, which can cascade
- KSP-style orbit lines, with Ap/Pe shown on hover
- Constellations and presets: Crowded LEO, ASAT test, counter-rotating rings
- Optional Moon on an adjustable elliptical orbit
- Debris cleanup tool
- Live stats and a graph of satellites vs debris over time

