import { type Orbit, trueAnomalyAtRadius } from "../sim/orbit";
import type { BodyKind } from "../sim/world";

export type OrbitMode = "off" | "satellites" | "all";

const OPEN_ORBIT_SEGMENTS = 48;

export function isOrbitShown(kind: BodyKind, mode: OrbitMode): boolean {
  return mode === "all" || (mode === "satellites" && kind !== "debris");
}

export function orbitPoint(orbit: Orbit, nu: number): [number, number] {
  const r = orbit.p / (1 + orbit.eccentricity * Math.cos(nu));
  const angle = orbit.argumentOfPeriapsis + nu;
  return [r * Math.cos(angle), r * Math.sin(angle)];
}

function eccentricAnomaly(eccentricity: number, nu: number): number {
  return 2 * Math.atan(Math.sqrt((1 - eccentricity) / (1 + eccentricity)) * Math.tan(nu / 2));
}

function addPolyline(path: Path2D, orbit: Orbit, fromNu: number, toNu: number): void {
  for (let i = 0; i <= OPEN_ORBIT_SEGMENTS; i++) {
    const [x, y] = orbitPoint(orbit, fromNu + ((toNu - fromNu) * i) / OPEN_ORBIT_SEGMENTS);
    if (i === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  }
}

function addEllipseArc(path: Path2D, orbit: Orbit, fromNu: number, toNu: number): void {
  const e = orbit.eccentricity;
  const omega = orbit.argumentOfPeriapsis;
  const a = orbit.p / (1 - e * e);
  const b = a * Math.sqrt(1 - e * e);
  const fromE = eccentricAnomaly(e, fromNu);
  let toE = eccentricAnomaly(e, toNu);
  if (toE <= fromE) toE += Math.PI * 2;

  // Without moveTo the arc would connect to the previous orbit in the batch
  path.moveTo(...orbitPoint(orbit, fromNu));
  path.ellipse(-a * e * Math.cos(omega), -a * e * Math.sin(omega), a, b, omega, fromE, toE);
}

// Path coordinates are world units; the part below the surface goes into `inside`
export function addOrbitToPaths(
  outside: Path2D,
  inside: Path2D,
  orbit: Orbit,
  earthRadius: number,
  maxRadius: number,
): void {
  if (orbit.periapsis > maxRadius) return;
  const nuEarth = orbit.periapsis < earthRadius ? trueAnomalyAtRadius(orbit, earthRadius) : null;

  if (orbit.apoapsis <= maxRadius) {
    if (nuEarth === null) {
      addEllipseArc(outside, orbit, 0, Math.PI * 2);
    } else {
      addEllipseArc(outside, orbit, nuEarth, -nuEarth);
      addEllipseArc(inside, orbit, -nuEarth, nuEarth);
    }
    return;
  }

  const nuMax = trueAnomalyAtRadius(orbit, maxRadius) ?? Math.PI;
  if (nuEarth === null) {
    addPolyline(outside, orbit, -nuMax, nuMax);
  } else {
    addPolyline(outside, orbit, -nuMax, -nuEarth);
    addPolyline(outside, orbit, nuEarth, nuMax);
    addPolyline(inside, orbit, -nuEarth, nuEarth);
  }
}
