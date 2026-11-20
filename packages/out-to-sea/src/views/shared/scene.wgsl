
export const TAU: f32 = 6.2831853;
// how much of the world the screen holds: radians of sky above the horizon, of sea below it, and across per unit of aspect
export const UP: f32 = 0.62;
export const DOWN: f32 = 0.5;
export const ACROSS: f32 = 0.62;

export struct Params {
  view: vec4f,     // width, height, seconds, horizon (share of the height)
  orb: vec4f,      // x, y (shares of width and height), radius (share of the shorter side), 1 for the sun
  sky: vec4f,      // light, warmth, moon age (0 new, 0.5 full), starlight
  weather: vec4f,  // cloud, rain, snow, fog
  motion: vec4f,   // wind, breath level (below 0: not breathing), pulse, fade
  extra: vec4f,    // seed, sail x, how warm the air is (-1 freezing to 1 hot), how much of the sun or moon shows (0 once the moon has set)
  ripples: vec4f,  // the ages in seconds of the last four rings released on the water; below 0, none
  weather2: vec4f, // thunder, gusts, drift of rain and snow across the view (-1 to 1), showers
  lightning: vec4f, // flash (0 to 1), where the bolt comes down (share of width), its seed, seconds since it struck
  // stones dropped in the water: where on the sea in metres (x, z), seconds ago (below 0: none), unused
  tapA: vec4f, tapB: vec4f, tapC: vec4f, tapD: vec4f,
  top: vec4f, mid: vec4f, haze: vec4f, far: vec4f, near: vec4f, sea: vec4f,
  deep: vec4f, dark: vec4f, light: vec4f, orbInk: vec4f, crest: vec4f,
}

/** The direction through a point on the screen: x to the right, y up, z out to sea. */
export fn rayOf(uv: vec2f, hz: f32, aspect: f32) -> vec3f {
  let across = (uv.x - 0.5) * aspect * ACROSS;
  let up = select(-(uv.y - hz) / (1.0 - hz) * DOWN, (hz - uv.y) / hz * UP, uv.y < hz);
  return normalize(vec3f(sin(across) * cos(up), sin(up), cos(across) * cos(up)));
}

/** Where on the screen a direction shows: the inverse of rayOf. */
export fn uvOf(dir: vec3f, hz: f32, aspect: f32) -> vec2f {
  let up = asin(clamp(dir.y, -1.0, 1.0));
  let across = atan2(dir.x, dir.z);
  return vec2f(across / (aspect * ACROSS) + 0.5, select(hz - up / DOWN * (1.0 - hz), hz - up / UP * hz, up >= 0.0));
}

/** The weather's cloud: a layer between two heights, in kilometres above the eye. */
export struct Layer {
  base: f32,
  top: f32,
  cover: f32,   // how much of the sky it takes, 0 to 1
  kind: f32,    // 0 for long flat strips, 1 for towering heaps
  wet: f32,     // rain, snow or thunder in it
  storm: f32,
  side: f32,    // the bearing fair-weather cloud gathers around: the sun's or moon's, pushed outward, as the words keep the other half of the sky
  gather: f32,  // how much it keeps to its side
  clear: f32,   // how far out fair-weather cloud begins: nearer than this the sky overhead is open, so its sides and tops show
  reach: f32,   // how far out it stands before the sky clears toward the horizon
  mass: vec3f,  // weather that rains is one mass: where its middle stands on the map (x, z) and how far it spreads
  fall: f32,    // how far from the middle of the mass rain or snow reaches the water; 0 when nothing falls
}

export fn layerOf(p: Params) -> Layer {
  let cloud = p.weather.x;
  let wet = max(max(p.weather.y, p.weather.z * 0.8), p.weather2.x);
  let storm = p.weather2.x;
  let showers = p.weather2.w;
  let heavy = max(p.weather.y, p.weather.z);
  let kind = clamp(0.08 + 0.5 * smoothstep(0.3, 0.9, cloud) + 0.6 * wet + 0.4 * showers + 0.3 * p.extra.z * (1.0 - wet), 0.0, 1.0);
  let closed = smoothstep(0.75, 1.0, cloud) * (1.0 - showers) * (1.0 - wet);
  let base = mix(2.9, 1.25, kind);
  let aspect = p.view.x / p.view.y;
  let hand = clamp((p.orb.x - 0.5) * 12.0, -1.0, 1.0);
  let apart = showers * (1.0 - storm);
  let middle = vec2f(hand * mix(1.6, 4.2, apart), mix(2.4, 11.0, apart));
  let spread = mix(6.5 + 1.2 * heavy + 1.5 * storm, 4.6 + 1.2 * heavy, apart);
  let inside = max(max(smoothstep(0.85, 1.0, p.weather.y), storm), smoothstep(0.05, 0.3, p.weather.z));
  return Layer(
    base,
    base + mix(0.3, 3.8, kind) + 1.2 * storm,
    mix(clamp(0.02 + 0.82 * cloud, 0.0, 0.96) * smoothstep(0.1, 0.25, cloud), 0.8 + 0.15 * heavy, smoothstep(0.02, 0.2, wet)),
    kind,
    wet,
    storm,
    (p.orb.x - 0.5 + 0.13 * hand) * aspect * ACROSS,
    clamp(0.55 + 0.3 * wet - 0.2 * closed, 0.0, 1.0),
    (7.5 - 2.5 * smoothstep(0.3, 0.9, cloud)) * (1.0 - 0.3 * closed),
    mix(24.0, 36.0, kind),
    vec3f(middle, spread),
    select(0.0, mix(mix(length(middle) - 0.03, length(middle) + 0.6, inside), 0.7 * spread, apart), wet > 0.02),
  );
}

/** How much cloud the weather lets stand over a point of the map, 0 to 1. */
export fn coverAt(p: Params, l: Layer, noise: texture_3d<f32>, noiseSampler: sampler, xz: vec2f) -> f32 {
  let t = p.view.z;
  let seed = p.extra.x;
  let drift = vec2f(t * 0.004 * (0.4 + p.motion.x) + seed * 0.37, seed * 0.61);
  let lie = mix(vec2f(0.3, 1.0), vec2f(1.0), l.kind);
  let weather = textureSampleLevel(noise, noiseSampler, vec3f(xz * lie / 13.0 + drift, 0.3 + t * 0.0012), 0.0).r;
  let range = length(xz);
  let bearing = atan2(xz.x, xz.y);
  let away = (xz - l.mass.xy) / l.mass.z;
  let falls = smoothstep(0.02, 0.2, l.wet);
  let gathered = mix(exp(-pow((bearing - l.side) / 0.46, 2.0)), exp(-dot(away, away)), falls);
  let stand = mix(smoothstep(l.clear * 0.7, l.clear * 1.3, range), 1.0, falls) * (1.0 - smoothstep(l.reach * 0.6, l.reach, range));
  return clamp(((weather - 0.45) / 0.28 * mix(1.0, 0.22, falls) + (l.cover - 0.5) * 1.3 - (1.0 - gathered) * l.gather * mix(1.25, 2.3, falls)) * stand, 0.0, 1.0);
}

/** How hard it falls on a point of the map, 0 to 1: inside the mass's footprint, in sheets that drift. */
export fn fallAt(p: Params, l: Layer, noise: texture_3d<f32>, noiseSampler: sampler, xz: vec2f) -> f32 {
  if (l.fall <= 0.0) { return 0.0; }
  let sheets = textureSampleLevel(noise, noiseSampler, vec3f(xz / 2.4 + vec2f(p.view.z * 0.008, 0.0), 0.7), 0.0).g;
  let thick = smoothstep(0.08, 0.4, coverAt(p, l, noise, noiseSampler, xz));
  return (1.0 - smoothstep(l.fall - 0.07, l.fall, length(xz - l.mass.xy))) * thick * mix(0.55, 1.0, sheets);
}
