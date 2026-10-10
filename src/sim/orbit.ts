// Two-body conic around Earth, focus at the origin. Ignores drag and the Moon.
export interface Orbit {
  eccentricity: number;
  // Semi-latus rectum: r(nu) = p / (1 + e cos nu)
  p: number;
  // Direction of periapsis, radians
  argumentOfPeriapsis: number;
  periapsis: number;
  // Infinity for parabolic and hyperbolic orbits
  apoapsis: number;
}

const MIN_SEMI_LATUS_RECTUM = 1e-6;
const CIRCULAR_EPSILON = 1e-9;

// Returns null for purely radial motion, which has no drawable conic
export function computeOrbit(mu: number, x: number, y: number, vx: number, vy: number): Orbit | null {
  const r = Math.hypot(x, y);
  const v2 = vx * vx + vy * vy;
  const radialDot = x * vx + y * vy;
  const angularMomentum = x * vy - y * vx;

  const k = v2 - mu / r;
  const ex = (k * x - radialDot * vx) / mu;
  const ey = (k * y - radialDot * vy) / mu;
  const eccentricity = Math.hypot(ex, ey);
  const p = (angularMomentum * angularMomentum) / mu;
  if (p < MIN_SEMI_LATUS_RECTUM) return null;

  return {
    eccentricity,
    p,
    argumentOfPeriapsis: eccentricity > CIRCULAR_EPSILON ? Math.atan2(ey, ex) : 0,
    periapsis: p / (1 + eccentricity),
    apoapsis: eccentricity < 1 ? p / (1 - eccentricity) : Infinity,
  };
}

// Radius of the orbit at true anomaly nu; Infinity where an open orbit doesn't reach
export function radiusAtTrueAnomaly(orbit: Orbit, nu: number): number {
  const denominator = 1 + orbit.eccentricity * Math.cos(nu);
  return denominator > CIRCULAR_EPSILON ? orbit.p / denominator : Infinity;
}

// True anomaly in [0, pi] where the orbit crosses radius r, or null if it never does
export function trueAnomalyAtRadius(orbit: Orbit, r: number): number | null {
  if (orbit.eccentricity < CIRCULAR_EPSILON) return null;
  const cosNu = (orbit.p / r - 1) / orbit.eccentricity;
  return cosNu >= -1 && cosNu <= 1 ? Math.acos(cosNu) : null;
}
