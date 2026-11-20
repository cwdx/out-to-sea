import { Params, Layer, fallAt, layerOf, rayOf } from "./scene.wgsl";

@group(0) @binding(0) var<uniform> p: Params;
@group(0) @binding(1) var shapeNoise: texture_3d<f32>;
@group(0) @binding(2) var noiseSampler: sampler;

const STEPS: i32 = 16;
// the eye's height above the water, in kilometres
const EYE: f32 = 0.0024;

fn pcg2(v: vec2u) -> u32 {
  var q = v * 1664525u + 1013904223u;
  q.x += q.y * 1664525u;
  q.y += q.x * 1664525u;
  q ^= q >> vec2u(16u);
  q.x += q.y * 1664525u;
  return q.x;
}

// x: kilometres of falling air along the ray; y: those within reach of the eye; z: how far off it lies on the whole;
// w: how hard it falls where the ray meets the water
@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let l = layerOf(p);
  if (l.wet < 0.02) { return vec4f(0.0); }
  let dir = rayOf(uv, p.view.w, p.view.x / p.view.y);
  let up = dir.y > 0.0;
  let reach = min(select(EYE / max(-dir.y, 1e-5), l.base / max(dir.y, 1e-3), up), 40.0);
  // a drop that has fallen this far left its cloud upwind of here
  let lean = vec2f(p.weather2.z * 0.5, 0.0);
  let way = vec2f(dir.x, dir.z);
  let jitter = f32(pcg2(vec2u(uv * p.view.xy))) / 4294967296.0;
  var all = 0.0;
  var near = 0.0;
  var far = 0.0;
  for (var i = 0; i < STEPS; i++) {
    let a = (f32(i) + jitter) / f32(STEPS);
    let along = reach * a * a;
    let span = reach * 2.0 * a / f32(STEPS);
    let fallen = l.base - max(dir.y, 0.0) * along;
    let rate = fallAt(p, l, shapeNoise, noiseSampler, way * along - lean * fallen) * span;
    all += rate;
    near += rate * (1.0 - smoothstep(0.03, 0.25, along));
    far += rate * along;
  }
  let landing = select(fallAt(p, l, shapeNoise, noiseSampler, way * reach - lean * l.base), 0.0, up);
  return vec4f(all, near, far / max(all, 1e-4), landing);
}
