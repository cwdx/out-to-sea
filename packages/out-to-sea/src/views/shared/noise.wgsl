// baked once into a tiling 3D texture. R: billowy Perlin swollen by cells; GBA: inverted cells at three sizes

@group(0) @binding(0) var shapeNoise: texture_storage_3d<rgba8unorm, write>;

const SIZE: f32 = 96.0;

fn pcg3(input: vec3u) -> vec3u {
  var v = input * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> vec3u(16u);
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}

// a point in [0, 1) for a lattice cell, the lattice wrapping every `period` cells
fn cellPoint(cell: vec3i, period: i32) -> vec3f {
  let wrapped = vec3u((cell % period + period) % period);
  return vec3f(pcg3(wrapped) >> vec3u(8u)) / 16777216.0;
}

fn gradientNoise(p: vec3f, period: i32) -> f32 {
  let cell = vec3i(floor(p));
  let f = fract(p);
  let w = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  var corner: array<f32, 8>;
  for (var i = 0; i < 8; i++) {
    let offset = vec3i(i & 1, (i >> 1) & 1, (i >> 2) & 1);
    corner[i] = dot(normalize(cellPoint(cell + offset, period) * 2.0 - 1.0), f - vec3f(offset));
  }
  let x = mix(vec4f(corner[0], corner[2], corner[4], corner[6]), vec4f(corner[1], corner[3], corner[5], corner[7]), w.x);
  return mix(mix(x.x, x.y, w.y), mix(x.z, x.w, w.y), w.z) * 1.4;
}

// distance to the nearest of the cells' points, 0 at a point
fn cellNoise(p: vec3f, period: i32) -> f32 {
  let cell = vec3i(floor(p));
  let f = fract(p);
  var nearest = 1e9;
  for (var z = -1; z <= 1; z++) {
    for (var y = -1; y <= 1; y++) {
      for (var x = -1; x <= 1; x++) {
        let offset = vec3i(x, y, z);
        let d = cellPoint(cell + offset, period) + vec3f(offset) - f;
        nearest = min(nearest, dot(d, d));
      }
    }
  }
  return min(sqrt(nearest), 1.0);
}

@compute @workgroup_size(4, 4, 4)
fn cs_main(@builtin(global_invocation_id) id: vec3u) {
  let p = (vec3f(id) + 0.5) / SIZE;
  var billow = 0.0;
  var weight = 0.5;
  var cells = 3;
  for (var i = 0; i < 4; i++) {
    billow += gradientNoise(p * f32(cells), cells) * weight;
    weight *= 0.5;
    cells *= 2;
  }
  let perlin = clamp(billow / 0.9375 * 0.5 + 0.5, 0.0, 1.0);
  let coarse = 1.0 - cellNoise(p * 4.0, 4);
  let middle = 1.0 - cellNoise(p * 8.0, 8);
  let fine = 1.0 - cellNoise(p * 16.0, 16);
  textureStore(shapeNoise, id, vec4f(coarse * 0.6 + perlin * (1.0 - coarse * 0.6), coarse, middle, fine));
}
