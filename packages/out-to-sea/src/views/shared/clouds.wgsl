import { Params, Layer, coverAt, layerOf, rayOf } from "./scene.wgsl";

@group(0) @binding(0) var<uniform> p: Params;
@group(0) @binding(1) var shapeNoise: texture_3d<f32>;
@group(0) @binding(2) var noiseSampler: sampler;

const STEPS: i32 = 56;
// how thick a kilometre of cloud is to the eye, and to the light crossing it
const THICK: f32 = 9.0;
const SHADE: f32 = 3.2;

fn pcg2(v: vec2u) -> u32 {
  var q = v * 1664525u + 1013904223u;
  q.x += q.y * 1664525u;
  q.y += q.x * 1664525u;
  q ^= q >> vec2u(16u);
  q.x += q.y * 1664525u;
  return q.x;
}

fn density(pos: vec3f, l: Layer, cheap: bool) -> f32 {
  let hf = (pos.y - l.base) / (l.top - l.base);
  if (hf <= 0.0 || hf >= 1.0) { return 0.0; }
  let t = p.view.z;
  let seed = p.extra.x;
  let drift = vec3f(t * 0.004 * (0.4 + p.motion.x) + seed * 0.37, 0.0, seed * 0.61);
  let cover = coverAt(p, l, shapeNoise, noiseSampler, pos.xz);
  if (cover <= 0.0) { return 0.0; }
  let q = pos / mix(3.2, 5.2, l.kind) + drift + vec3f(0.0, t * 0.0035, 0.0);
  let s = textureSampleLevel(shapeNoise, noiseSampler, q, 0.0);
  let low = s.g * 0.625 + s.b * 0.25 + s.a * 0.125;
  let strip = smoothstep(0.0, 0.1, hf) * (1.0 - smoothstep(0.3, 0.6, hf));
  let heap = smoothstep(0.0, 0.07, hf) * (1.0 - smoothstep(0.4, 1.0, hf / mix(0.65, 1.1, s.g)));
  var base = clamp((s.r - (low - 1.0)) / (2.0 - low), 0.0, 1.0) * mix(strip, heap, l.kind);
  base = clamp((base - (1.0 - cover)) / cover, 0.0, 1.0);
  if (cheap || base <= 0.0) { return clamp(base * 2.4, 0.0, 1.0); }
  let e = textureSampleLevel(shapeNoise, noiseSampler, q * 4.1 + vec3f(0.5, t * 0.004, 0.2), 0.0).gba;
  let fine = e.x * 0.625 + e.y * 0.25 + e.z * 0.125;
  let bite = mix(fine, 1.0 - fine, clamp(hf * 5.0, 0.0, 1.0)) * 0.42 * (1.0 - smoothstep(0.3, 0.7, base));
  return clamp((base - bite) / (1.0 - bite) * 2.4, 0.0, 1.0);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let hz = p.view.w;
  let aspect = p.view.x / p.view.y;
  let clear = vec4f(0.0, 0.0, 0.0, 1.0);
  if (uv.y >= hz) { return clear; }
  let dir = rayOf(uv, hz, aspect);
  let l = layerOf(p);
  if (l.cover < 0.03 || dir.y < 0.01) { return clear; }
  let start = max(l.base / dir.y, l.clear * 0.7 * (1.0 - l.wet));
  let end = min(l.top / dir.y, start + 24.0);
  if (start > 60.0) { return clear; }

  let toLight = rayOf(p.orb.xy, hz, aspect);
  let light = normalize(vec3f(toLight.x, max(toLight.y, 0.3), toLight.z));
  let pace = (end - start) / f32(STEPS);
  let jitter = f32(pcg2(vec2u(uv * p.view.xy))) / 4294967296.0;

  var through = 1.0;
  var lit = 0.0;
  var height = 0.0;
  var far = 0.0;
  for (var i = 0; i < STEPS; i++) {
    let along = start + (f32(i) + jitter) * pace;
    let pos = dir * along;
    let d = density(pos, l, false);
    if (d > 0.005) {
      // how much cloud stands between here and the light, sampled in doubling strides
      var depth = 0.0;
      var stride = 0.12;
      var gone = 0.0;
      for (var k = 0; k < 4; k++) {
        depth += density(pos + light * (gone + stride * 0.5), l, true) * stride;
        gone += stride;
        stride *= 2.0;
      }
      // light that has bounced about inside reaches deeper than a single ray would
      let sun = max(exp(-depth * SHADE), 0.55 * exp(-depth * SHADE * 0.22));
      let a = 1.0 - exp(-d * pace * THICK);
      let swell = textureSampleLevel(shapeNoise, noiseSampler, pos / 2.6 + vec3f(p.extra.x * 0.37, p.view.z * 0.003, 0.0), 0.0).g;
      lit += through * a * clamp(sun * mix(0.7, 1.3, swell) + 0.22 * (swell - 0.45), 0.0, 1.0);
      height += through * a * (pos.y - l.base) / (l.top - l.base);
      far += through * a * clamp(along / 40.0, 0.0, 1.0);
      through *= 1.0 - a;
      if (through < 0.02) { break; }
    }
  }
  return vec4f(lit, height, far, through);
}
