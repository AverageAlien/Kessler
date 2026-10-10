export const CONFIG = {
  earthRadius: 100,
  // mu = g * R^2; with these defaults a 20-unit-high orbit takes about 8 s
  surfaceGravity: 100,

  fixedDt: 1 / 120,
  maxFrameDt: 0.1,
  maxSubstepsPerFrame: 512,
  // Keeps the "lagging" label from flickering
  lagIndicatorHoldMs: 500,

  // Objects farther than this many Earth radii are treated as escaped
  escapeRadiusFactor: 40,

  // Altitudes are measured from the surface, in world units
  atmosphereHeightMin: 10,
  atmosphereHeightMax: 150,
  atmosphereHeightDefault: 30,
  // Density falls by e every (height * this); the whole profile stretches with the height
  atmosphereScaleHeightFraction: 0.2,
  // Multiplier on drag; the slider is logarithmic
  atmosphereDensityMin: 0.1,
  atmosphereDensityMax: 10,
  dragCoefficient: 1e-5,

  timeScaleMin: 1 / 8,
  timeScaleMax: 128,

  earthRadiusMin: 40,
  earthRadiusMax: 200,
  surfaceGravityMin: 20,
  surfaceGravityMax: 300,

  // Pulled in close for viewing; the real Moon is 60 Earth radii away
  // Ap/Pe are altitudes above Earth's surface; Pe points along +x
  moonAltitudeMin: 100,
  moonAltitudeMax: 2500,
  moonAltitudeDefault: 600,
  moonRadius: 27,
  // Real value: 1/81 of Earth's mass
  moonMassRatio: 1 / 81,
  // Turning the Moon on zooms out this far past its apoapsis if it would be off-screen
  moonViewMargin: 1.15,

  satelliteMass: 1,
  satelliteRadius: 1.5,
  satelliteDragFactor: 1,

  maxPendingEvents: 200,

  // Hard cap; collisions make fewer fragments once it's reached
  maxObjects: 4000,

  // Collisions are tested every N physics steps, sweeping each object along a straight line
  collisionCheckInterval: 4,
  collisionScaleMin: 0.5,
  collisionScaleMax: 5,
  collisionScaleDefault: 1,
  // Pairs passing slower than this (units/s) go through each other; circular speed is about 70-90
  minShatterSpeed: 3,
  debrisCollisionRadiusFactor: 0.1,

  // Two satellites (mass 2) make about 24 fragments
  fragmentsPerSqrtMass: 17,
  maxFragmentsPerCollision: 30,
  // Pieces lighter than this turn to dust: no object is created
  minFragmentMass: 0.02,
  // Fragment kick speed as a fraction of the collision's relative speed
  fragmentKickFactor: 0.02,
  fragmentMinKick: 3,
  fragmentGraceTime: 0.5,
  debrisMinRadius: 0.3,
  debrisMaxDragFactor: 6,

  missileMass: 1,
  missileRadius: 1,

  constellationCountMin: 2,
  constellationCountMax: 60,
  constellationCountDefault: 12,
  constellationAltitudeMin: 10,
  constellationAltitudeMax: 300,
  constellationAltitudeDefault: 60,

  crowdedLeoCount: 100,
  crowdedLeoAltitudeMin: 35,
  crowdedLeoAltitudeMax: 120,
  crowdedLeoJitter: 0.004,

  ringsCount: 20,
  ringsAltitude: 60,

  asatBystanderCount: 40,
  asatTargetAltitude: 60,
  // Missile velocity at the intercept, as fractions of the target's speed
  asatClimbFraction: 0.3,
  asatAgainstFraction: 0.4,
  asatMaxFlightTime: 60,

  randomSatAltitudeMin: 0.1,
  randomSatAltitudeMax: 1.2,
  randomSatSpeedJitter: 0.05,

  // Sim seconds of trail behind each object
  trailDuration: 1.5,
  debrisTrailDuration: 0.8,

  initialViewRadiusFactor: 3.5,
  // Screen pixels per world unit
  zoomMin: 0.02,
  zoomMax: 40,
  wheelZoomSpeed: 0.0015,

  cleanupBrushMinPx: 10,
  cleanupBrushMaxPx: 120,
  cleanupBrushDefaultPx: 35,

  // A left press that moves less than this spawns a circular orbit instead of aiming
  clickDragThresholdPx: 5,
  // Spawn speed in world units/s per screen pixel dragged
  dragVelocityPerPx: 1,
};
