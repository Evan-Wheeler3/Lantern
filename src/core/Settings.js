// Central, serialisable style state. Every look-dev knob lives here so the
// debug panel, the renderer and "copy settings as JSON" all agree.
// Renderer code READS this every frame; nothing caches derived values
// except where noted (quality changes go through Pipeline.setQuality).

export const DEFAULTS = {
  quality: 'High',

  palette: {
    ink: '#07060A',
    oil: '#1A1210',
    ember: '#FF8A1F',
    cream: '#FFE2B0',
  },

  light: {
    intensity: 1.55,     // wide-glow multiplier on N.L
    range: 10.0,         // metres, hard window
    focusIntensity: 3.2, // focused-beam multiplier
    focusRange: 22.0,
    focusAngle: 17,      // degrees, outer half-angle
    focusLeak: 0.07,     // light that escapes the shutters
    flicker: 0.55,       // 0 = steady, 1 = guttering
    flickerSpeed: 1.0,
    jitter: 0.018,       // metres of flame wander (moves shadows)
    shadowBias: 0.045,
    cageShadows: true,   // lantern posts cast shadow stripes
  },

  bands: {
    low: 0.085,          // below: pure ink
    high: 0.36,          // above: lit ember
    hot: 0.95,           // above: hot cream
    softness: 0.012,     // band edge width (in light units)
    noise: 0.35,         // hand-carved irregularity of band edges
    midTone: 0.32,       // oil -> ember mix in the mid band
    specThreshold: 0.55, // wet highlight cut
    specPower: 60,
  },

  hatch: {
    enabled: true,
    density: 26,         // lines per metre at LOD 0
    thickness: 0.42,     // fraction of line period
    wobble: 0.22,        // along-stroke waviness (periods)
    angle: 38,           // degrees, primary stroke direction
    angleVar: 11,        // degrees, extra rotation of denser layers
    crossStart: 0.45,    // 0..1 darkness in mid band where cross layer begins
    lodDistance: 3.5,    // metres before density halves
    litStrokes: 0.35,    // sparse gouge strokes in the lit band
    breakup: 0.35,       // gaps along strokes
  },

  outline: {
    width: 1.4,          // px
    depthThreshold: 0.035,
    normalThreshold: 0.35,
    wobble: 1.3,         // px
    wobbleFreq: 9.0,
    boilFps: 4,          // 0 = frozen line wobble
    darkVisibility: 0.06,// outline strength where no light reaches
    darkGlow: 0.014,     // faint ember "white line" edges in darkness
  },

  water: {
    reflectivity: 1.35,
    distortion: 0.035,
    stretch: 0.10,
    ripple: 1.0,
    sheen: 0.4,
    sheenScale: 1.0,
    sheenSpeed: 1.0,
    glint: 1.4,
    bands: 4,
    hatch: 0.5,
  },

  fog: {
    density: 0.02,
    intensity: 0.9,
    noiseScale: 0.55,
    noise: 0.75,
    heightFalloff: 0.35,
    anisotropy: 0.35,
    extinction: 0.6,
  },

  creatures: {
    rimPower: 3.0,
    rimThreshold: 0.42,
    rimBase: 0.18,
  },

  particles: {
    embers: 1.0,
    emberSize: 1.4,
    dripRate: 1.0,
  },

  post: {
    exposure: 1.0,
    contrast: 1.15,
    bloom: 0.85,
    bloomThreshold: 1.6,
    bloomRadius: 1.0,
    grain: 0.07,
    paper: 0.55,
    vignette: 0.75,
    paletteStrength: 1.0,
    posterize: 0,        // 0 = continuous ramp, else N tone steps
  },

  player: {
    sensitivity: 1.0,
    walkSpeed: 2.1,
    sprintMultiplier: 1.85,
    bob: 1.0,
    sway: 1.0,
    fov: 72,
  },

  audio: {
    master: 0.8,
    drone: 0.55,
    drips: 0.8,
    crackle: 0.6,
    footsteps: 0.8,
    reverb: 0.55,
  },
};

export const QUALITY_PRESETS = {
  High: {
    pixelRatioCap: 1.25,
    shadowSize: 512,
    shadowTaps: 5,
    reflectionScale: 0.5,
    reflectionTaps: 8,
    fogScale: 0.5,
    fogSteps: 28,
    bloomLevels: 5,
    emberCount: 420,
  },
  Low: {
    pixelRatioCap: 0.8,
    shadowSize: 256,
    shadowTaps: 1,
    reflectionScale: 0.3,
    reflectionTaps: 4,
    fogScale: 0.33,
    fogSteps: 12,
    bloomLevels: 3,
    emberCount: 160,
  },
};

function deepClone(o) {
  return JSON.parse(JSON.stringify(o));
}

// Merge `src` into `dst` only for keys that already exist (keeps schema stable).
function mergeKnown(dst, src) {
  for (const k of Object.keys(src || {})) {
    if (!(k in dst)) continue;
    if (dst[k] && typeof dst[k] === 'object' && !Array.isArray(dst[k])) mergeKnown(dst[k], src[k]);
    else if (typeof src[k] === typeof dst[k]) dst[k] = src[k];
  }
}

export const settings = deepClone(DEFAULTS);

export function resetSettings() {
  mergeKnown(settings, deepClone(DEFAULTS));
}

export function loadSettings(json) {
  const obj = typeof json === 'string' ? JSON.parse(json) : json;
  mergeKnown(settings, obj);
}

export function settingsToJSON() {
  return JSON.stringify(settings, null, 2);
}

export function qualityPreset() {
  return QUALITY_PRESETS[settings.quality] || QUALITY_PRESETS.High;
}
