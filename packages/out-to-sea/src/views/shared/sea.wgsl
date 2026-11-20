import { fbmSimplex2d } from "@vgpu/wgsl-std/noise/simplex";
import { hash2 } from "@vgpu/wgsl-std/hash";
import { Params, Layer, layerOf, rayOf, uvOf, TAU, UP } from "./scene.wgsl";

@group(0) @binding(0) var<uniform> p: Params;
@group(0) @binding(1) var clouds: texture_2d<f32>;
@group(0) @binding(2) var cloudSampler: sampler;
@group(0) @binding(3) var fall: texture_2d<f32>;

// the eye's height above the water, in metres
const EYE: f32 = 2.4;

fn skyAt(y: f32) -> vec3f {
  let s = 1.0 - clamp(y / sin(UP), 0.0, 1.0);
  let c = mix(p.top.rgb, p.mid.rgb, smoothstep(0.0, 0.78, s));
  return mix(c, p.haze.rgb, smoothstep(0.62, 1.0, s));
}

fn cloudPaint(uv: vec2f, dir: vec3f, toLight: vec3f, l: Layer) -> vec4f {
  let c = textureSampleLevel(clouds, cloudSampler, uv, 0.0);
  let amount = 1.0 - c.a;
  if (amount < 0.004) { return vec4f(0.0); }
  let lit = c.r / amount;
  let height = c.g / amount;
  let far = c.b / amount;
  let day = p.orb.w;
  let body = mix(mix(p.mid.rgb, p.top.rgb, 0.55), p.dark.rgb, 0.1 + 0.3 * l.wet + 0.12 * l.storm) * (1.0 - 0.12 * l.storm);
  let flank = mix(mix(p.mid.rgb, p.haze.rgb, 0.45), mix(p.haze.rgb, p.light.rgb, 0.5), day * (1.0 - 0.6 * l.wet));
  let pale = smoothstep(0.7, 1.0, p.weather.x) * (1.0 - l.wet) * p.sky.x;
  var ink = mix(mix(body, mix(p.mid.rgb, p.haze.rgb, 0.55), pale * 0.7) * mix(0.84, 1.1, height), flank, smoothstep(0.05, 0.45, lit) * (0.5 + 0.5 * height));
  let toward = pow(max(dot(dir, toLight), 0.0), 5.0);
  let thin = amount * (1.0 - amount) * 4.0;
  ink = mix(ink, mix(p.haze.rgb, p.orbInk.rgb, 0.5), clamp(toward * thin * (0.5 + 0.5 * day), 0.0, 0.7) * (1.0 - 0.55 * l.wet));
  ink += vec3f(0.78, 0.83, 1.0) * p.lightning.x * (0.12 + 0.6 * lit) * (0.35 + 0.65 * exp(-pow((uv.x - p.lightning.y) / 0.22, 2.0)));
  ink = mix(ink, p.haze.rgb, smoothstep(0.15, 0.75, far) * 0.85);
  return vec4f(ink * amount, amount);
}

fn ridge(x: f32, seed: f32, scale: f32) -> f32 {
  return 0.5 + 0.5 * fbmSimplex2d(vec2f(x * scale, seed), 3, 2.0, 0.42);
}

// a long headland between `start` and `end` (shares of the width), its height a share of the screen height
fn headland(x: f32, start: f32, end: f32, height: f32, seed: f32) -> f32 {
  let u = (x - start) / (end - start);
  if (u <= 0.0 || u >= 1.0) { return 0.0; }
  let shape = pow(min(1.0, u * 4.0), 0.5) * pow(min(1.0, (1.0 - u) * 2.4), 0.9);
  return height * shape * (0.7 + 0.5 * ridge(x, seed, 4.0));
}

fn landAt(x: f32, rise: f32, seed: f32, mist: f32, air: vec3f) -> vec4f {
  if (rise > 0.11) { return vec4f(0.0); }
  let back = headland(x, 0.08, 0.72, 0.07, seed + 9.4);
  let far = max(headland(x, -0.05, 0.62, 0.085, seed + 3.1), headland(1.0 - x, -0.05, 0.3, 0.05, seed + 7.7));
  let near = headland(x, -0.05, 0.44, 0.06, seed + 5.3);
  let foot = exp(-max(rise, 0.0) / 0.02);
  let pale = mix(p.far.rgb, air, 0.3);
  let backInk = mix(mix(pale, air, 0.3 + 0.3 * mist), air, foot * 0.3);
  let farInk = mix(mix(pale, air, 0.3 * mist), air, foot * (0.22 + 0.2 * mist));
  let nearInk = mix(mix(p.near.rgb, pale, 0.12 + 0.3 * mist), air, foot * (0.12 + 0.18 * mist));
  let a = smoothstep(-0.0012, 0.0012, back - rise);
  let b = smoothstep(-0.0012, 0.0012, far - rise);
  let c = smoothstep(-0.0012, 0.0012, near - rise);
  return vec4f(mix(mix(backInk, farInk, b), nearInk, c), max(max(a, b), c));
}

fn hairlines(px: vec2f, slant: f32, gap: f32, reach: f32, speed: f32, t: f32, seed: f32, keep: f32) -> f32 {
  let x = (px.x + px.y * slant) / gap;
  let h = hash2(vec2f(floor(x), seed));
  let line = 1.0 - smoothstep(0.5, 1.1, abs(fract(x) - 0.25 - 0.5 * h.y) * gap);
  let along = 0.5 + 0.5 * sin((px.y / reach - t * speed) * 6.2831853 + h.x * 40.0);
  return step(keep, h.x) * line * along * along;
}


struct Sea { depth: f32, heading: f32, seed: f32, t: f32, chop: f32 }

// the swell: x is 0 in the troughs to 1 on the crests, yz its slope
fn swell(xz: vec2f, s: Sea, trains: i32) -> vec3f {
  var pos = xz;
  var freq = 0.32;
  var weight = 1.0;
  var sum = vec3f(0.0);
  var total = 0.0;
  for (var i = 0; i < trains; i++) {
    let fi = f32(i);
    let angle = s.heading + 0.62 * sin(fi * 2.4 + s.seed);
    let dir = vec2f(sin(angle), cos(angle));
    let sense = select(1.0, -0.75, i % 3 == 2);
    let x = dot(dir, pos) * freq + s.t * sense * 0.42 * sqrt(9.81 * freq) + fi * 1.7;
    let wave = exp(sin(x) - 1.0);
    let turn = wave * cos(x);
    pos += dir * turn * weight * s.chop;
    sum += vec3f(wave, dir * turn * freq) * weight;
    total += weight;
    weight *= 0.84;
    freq *= 1.22;
  }
  return sum / total;
}

fn flatten(xz: vec2f) -> f32 {
  return 1.0 / (1.0 + dot(xz, xz) / (120.0 * 120.0));
}

fn surface(xz: vec2f, s: Sea, trains: i32) -> f32 {
  return (swell(xz, s, trains).x - 0.45) * s.depth * flatten(xz);
}

fn rings(xz: vec2f, centre: vec2f) -> f32 {
  let away = length(xz - centre);
  var h = 0.0;
  for (var i = 0; i < 4; i++) {
    let age = p.ripples[i];
    if (age < 0.0) { continue; }
    let off = away - (0.5 + age * 1.5);
    h += 0.09 * exp(-age * 0.22) * exp(-off * off / 0.2) * cos(off * 5.0);
  }
  return h;
}

fn stone(xz: vec2f, tap: vec4f) -> f32 {
  let age = tap.z;
  if (age < 0.0 || age > 14.0) { return 0.0; }
  let r = max(length(xz - tap.xy), 0.02);
  // the wave number found at this distance after this long: g t² / 4 r²
  let k = 9.81 * age * age / (4.0 * r * r);
  // waves shorter than a hand's width die at once, and those longer than the splash could make never start
  let band = exp(-pow(k / 16.0, 2.0)) * (1.0 - exp(-pow(k / 0.55, 2.0)));
  return 0.085 * band * cos(k * r) * exp(-age * 0.3) / sqrt(0.4 + r);
}

fn stones(xz: vec2f) -> f32 {
  return stone(xz, p.tapA) + stone(xz, p.tapB) + stone(xz, p.tapC) + stone(xz, p.tapD);
}

fn crown(xz: vec2f, tap: vec4f) -> f32 {
  if (tap.z < 0.0 || tap.z > 0.6) { return 0.0; }
  let r = length(xz - tap.xy);
  return exp(-pow((r - tap.z * 0.5) / 0.06, 2.0)) * (1.0 - tap.z / 0.6);
}

fn drops(xz: vec2f, falling: f32, hail: f32, snowy: f32, t: f32, seed: f32) -> vec2f {
  var out = vec2f(0.0);
  for (var j = 0; j < 2; j++) {
    let fj = f32(j);
    let g = xz * 0.6 + vec2f(fj * 0.5, fj * 0.37);
    let cell = floor(g);
    let h = hash2(cell + vec2f(seed, fj * 7.0));
    if (h.x > falling * 0.85) { continue; }
    let age = fract(t * (0.7 + 0.6 * h.y) + h.x * 7.0);
    let at = 0.25 + 0.5 * hash2(cell + vec2f(3.0, fj));
    let dd = length(fract(g) - at);
    let reach = mix(0.38, 0.16, snowy) * (1.0 + 0.6 * hail);
    let ring = exp(-pow((dd - age * reach) / 0.035, 2.0)) * (1.0 - age) * (1.0 - age);
    out += vec2f(ring * 0.03, ring) * (1.0 - 0.5 * hail);
  }
  return out;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let W = p.view.x;
  let H = p.view.y;
  let t = p.view.z;
  let hz = p.view.w;
  let aspect = W / H;
  let M = min(W, H);
  let px = vec2f(uv.x * W, uv.y * H);
  let orb = vec2f(p.orb.x * W, p.orb.y * H);
  let r = p.orb.z * M * (1.0 + 0.04 * p.motion.z);
  let warm = p.sky.y;
  let cloud = p.weather.x;
  let rain = p.weather.y;
  let snow = p.weather.z;
  let fog = p.weather.w;
  let wind = p.motion.x;
  let pulse = p.motion.z;
  let seed = p.extra.x;
  let storm = p.weather2.x;
  let gust = p.weather2.y;
  let drift = p.weather2.z;
  let showers = p.weather2.w;
  let flash = p.lightning.x;
  let strikeAge = p.lightning.w;
  let day = p.orb.w;
  let layer = layerOf(p);
  let moonlight = mix(0.5 - 0.5 * cos(TAU * p.sky.z), 1.0, day);
  let veil = 1.0 - 0.75 * max(max(cloud * 0.8, fog), max(rain, snow * 0.9));
  let icy = clamp(min(rain, snow) * 3.0, 0.0, 1.0);
  let heat = p.extra.z;
  let mist = clamp(0.15 + 0.6 * fog + 0.12 * max(rain, snow) + 0.28 * max(heat, 0.0) - 0.1 * max(-heat, 0.0), 0.0, 0.9);
  let murk = mix(mix(p.mid.rgb, p.top.rgb, 0.55), p.dark.rgb, 0.25 + 0.3 * storm);
  let air = mix(p.haze.rgb, murk, clamp(max(rain, storm) * 0.9, 0.0, 1.0));

  let landX = 0.5 + (uv.x - 0.5) * min(aspect / 1.6, 1.0);
  let dir = rayOf(uv, hz, aspect);
  let toLight = rayOf(p.orb.xy, hz, aspect);

  var col: vec3f;

  if (uv.y < hz) {
    let s = uv.y / hz;
    col = skyAt(dir.y);
    let below = length((px - vec2f(orb.x, hz * H)) / vec2f(M * 0.9, M * 0.35));
    col = mix(col, p.haze.rgb * 1.05, exp(-below * below) * (0.18 + 0.4 * warm + 0.14 * max(heat, 0.0)) * max(p.extra.w, warm));
    col = mix(col, p.haze.rgb, max(heat, 0.0) * p.sky.x * (1.0 - layer.cover) * exp(-(1.0 - s) / 0.2) * 0.45);

    if (p.sky.w > 0.02) {
      let cell = floor(px / 4.0);
      let h = hash2(cell + vec2f(seed, seed * 0.37));
      let dot = 1.0 - smoothstep(0.08, 0.32 + 0.12 * h.y, length(fract(px / 4.0) - 0.5));
      let bright = step(0.9965, h.x) * dot * (0.3 + 0.7 * (0.5 + 0.5 * sin(t * (0.8 + 1.6 * h.y) + h.y * 40.0))) * (0.85 + 0.25 * pulse);
      col += vec3f(0.92, 0.9, 0.85) * bright * (1.0 + 0.6 * max(-heat, 0.0) - 0.55 * max(heat, 0.0)) * p.sky.w * (1.0 - s * 0.6) * pow(textureSampleLevel(clouds, cloudSampler, uv, 0.0).a, 8.0);
    }

    if (p.sky.w > 0.25) {
      let slot = floor(t / 9.0);
      let r3 = hash2(vec2f(slot, seed + 3.0));
      let r4 = hash2(vec2f(slot + 17.0, seed));
      let life = (t - slot * 9.0 - 2.0 * r3.x) / 0.9;
      if (r4.x > 0.35 && life > 0.0 && life < 1.0) {
        let start = vec2f(W * (0.25 + 0.6 * r3.y), H * hz * (0.08 + 0.35 * r4.y));
        let way = normalize(vec2f(select(-1.0, 1.0, r4.y > 0.5), 0.45));
        let head = start + way * M * 0.32 * life;
        let along = dot(px - head, -way);
        let across = abs(dot(px - head, vec2f(-way.y, way.x)));
        let tail = M * 0.12 * sin(3.14159 * life);
        let streak = step(0.0, along) * (1.0 - smoothstep(0.0, tail, along)) * (1.0 - smoothstep(0.4, 1.4, across));
        col += vec3f(0.95, 0.93, 0.88) * streak * sin(3.14159 * life) * p.sky.w;
      }
    }

    let shown = (1.0 - smoothstep(0.05, 0.22, layer.wet * (1.0 - 0.85 * showers))) * p.extra.w;
    let d = length(px - orb);
    let spread = 1.0 + 0.55 * max(heat, 0.0) - 0.35 * max(-heat, 0.0);
    let halo = exp(-pow(d / (M * spread * mix(0.055 + 0.04 * pulse, 0.14 + 0.16 * pulse, day)), 1.6));
    let silver = mix(p.light.rgb, vec3f(0.78, 0.85, 1.0), 0.5);
    col = mix(col, mix(silver, p.orbInk.rgb, day), halo * mix((0.1 + 0.16 * pulse) * moonlight, 0.16 + 0.32 * pulse, day) * (1.0 + 0.3 * heat) * veil * p.extra.w);
    col += mix(silver * moonlight, p.orbInk.rgb, day) * exp(-pow(d / (r * mix(1.5 + 0.7 * pulse, 1.9 + 1.8 * pulse, day)), 2.0)) * (0.08 + 0.26 * pulse) * veil * shown;

    let q = (px - orb) / r;
    let disc = 1.0 - smoothstep(1.0 - 1.5 / r, 1.0 + 1.5 / r, length(q));
    if (disc > 0.0) {
      var lit = 1.0;
      if (day < 0.5) {
        let k = cos(TAU * p.sky.z);
        let edge = sqrt(max(0.0, 1.0 - q.y * q.y));
        lit = select(smoothstep(k * edge - 0.04, k * edge + 0.04, -q.x), smoothstep(k * edge - 0.04, k * edge + 0.04, q.x), p.sky.z < 0.5);
        lit = max(lit, 0.08);
      }
      let maria = 1.0 - select(0.05 * smoothstep(0.1, 0.6, fbmSimplex2d(q * 1.6 + seed, 3, 2.0, 0.5)), 0.0, day > 0.5);
      col = mix(col, mix(p.mid.rgb, p.orbInk.rgb * maria, lit), disc * mix(1.0, veil, 0.6) * shown);
    }

    let painted = cloudPaint(uv, dir, toLight, layer);
    col = col * (1.0 - painted.a) + painted.rgb;
    col += vec3f(0.75, 0.78, 0.9) * flash * 0.14;

    let shimmer = max(heat, 0.0) * day * 0.0012 * sin(uv.x * 260.0 + t * 2.3) * exp(-(hz - uv.y) / 0.02);
    let land = landAt(landX, hz - uv.y + shimmer, seed, mist, air);
    col = mix(col, land.rgb, land.a);

    let unit = M * 0.032;
    let sx = p.extra.y * W + t * 0.35 * (0.6 + wind) + sin(t / 60.0) * 6.0;
    var sp = (px - vec2f(sx, hz * H)) / unit;
    sp.y -= sin(t * 0.9 + seed) * (0.04 + 0.1 * storm);
    sp.x += sp.y * (0.04 + 0.14 * storm) * sin(t * 0.7 + seed);
    let aa = 1.2 / unit;
    let main = smoothstep(aa, -aa, max(max(sp.x + 0.03, -sp.x - 0.44 * (sp.y + 1.0)), max(sp.y + 0.1, -sp.y - 1.0)));
    let jib = smoothstep(aa, -aa, max(max(0.04 - sp.x, sp.x - 0.04 - 0.3 * (sp.y + 0.82)), max(sp.y + 0.1, -sp.y - 0.82)));
    let hull = smoothstep(aa, -aa, max(abs(sp.y + 0.04) - 0.05, abs(sp.x + 0.08) - 0.42 + 0.5 * (sp.y + 0.09)));
    col = mix(col, mix(p.orbInk.rgb, p.haze.rgb, 0.3), max(main, jib));
    col = mix(col, p.dark.rgb, hull);

    if (flash > 0.05 && strikeAge < 0.35) {
      let begin = 0.35;
      let fall = clamp((s - begin) / (1.0 - begin), 0.0, 1.0);
      let jag = 0.04 * fbmSimplex2d(vec2f(s * 6.0, p.lightning.z), 3, 2.3, 0.45) * (0.3 + fall);
      let fork = 0.03 * fbmSimplex2d(vec2f(s * 8.0, p.lightning.z + 9.0), 3, 2.0, 0.5) * fall;
      let bx = p.lightning.y + drift * 0.02 * fall + jag;
      let core = 1.0 - smoothstep(0.8, 2.4, abs(uv.x - bx) * W);
      let branch = (1.0 - smoothstep(0.4, 1.4, abs(uv.x - bx - fork - 0.03 * fall) * W)) * step(0.35, fall) * 0.6;
      let glow = exp(-abs(uv.x - bx) * W / 14.0) * 0.35;
      col += vec3f(0.92, 0.94, 1.0) * (core + branch + glow) * step(begin, s) * flash;
    }
  } else {
    let d = (uv.y - hz) / (1.0 - hz);
    let wild = max(gust * 0.6, storm);
    let sea = Sea(0.8 + 0.5 * wind + 1.3 * storm + 0.4 * gust, 0.5 * drift, seed, t, 0.3 + 0.3 * storm + 0.15 * gust);
    let down = max(-dir.y, 0.002);
    let way = vec2f(dir.x, dir.z);
    var a = (EYE - 0.55 * sea.depth) / down;
    var b = (EYE + 0.45 * sea.depth) / down;
    var ga = EYE + dir.y * a - surface(way * a, sea, 5);
    var gb = EYE + dir.y * b - surface(way * b, sea, 5);
    for (var i = 0; i < 6; i++) {
      let m = mix(a, b, clamp(ga / max(ga - gb, 1e-5), 0.0, 1.0));
      let gm = EYE + dir.y * m - surface(way * m, sea, 5);
      if (gm < 0.0) { b = m; gb = gm; } else { a = m; ga = gm; }
    }
    let dist = mix(a, b, clamp(ga / max(ga - gb, 1e-5), 0.0, 1.0));
    let point = way * dist;

    let centreRay = rayOf(vec2f(0.27, 0.74), hz, aspect);
    let centre = vec2f(centreRay.x, centreRay.z) * (EYE / max(-centreRay.y, 0.002));
    let landing = textureSampleLevel(fall, cloudSampler, uv, 0.0).w;
    let falling = max(rain, snow * 0.6) * smoothstep(0.0, 0.3, landing);
    let hail = step(0.99, storm);
    let snowy = snow * (1.0 - rain);
    let fine = swell(point, sea, 13);
    let near = flatten(point);
    let e2 = 0.06;
    let r0 = rings(point, centre) + stones(point) + drops(point, falling, hail, snowy, t, seed).x;
    let rx = rings(point + vec2f(e2, 0.0), centre) + stones(point + vec2f(e2, 0.0)) + drops(point + vec2f(e2, 0.0), falling, hail, snowy, t, seed).x;
    let rz = rings(point + vec2f(0.0, e2), centre) + stones(point + vec2f(0.0, e2)) + drops(point + vec2f(0.0, e2), falling, hail, snowy, t, seed).x;
    let slope = fine.yz * sea.depth * near + vec2f(rx - r0, rz - r0) / e2;
    let normal = normalize(vec3f(-slope.x, 1.0, -slope.y));
    let crest = clamp((fine.x - 0.3) / 0.42, 0.0, 1.0);

    var water = mix(p.sea.rgb, p.deep.rgb, smoothstep(0.0, 0.62, d));
    let low = normalize(vec3f(toLight.x, 0.5, toLight.z));
    let lean = dot(normal, low) - low.y;
    water = mix(water, mix(p.deep.rgb, p.dark.rgb, 0.7), (smoothstep(0.02, 0.1, -lean) * 0.5 + (1.0 - smoothstep(0.1, 0.5, crest)) * 0.3) * near);
    water = mix(water, mix(p.sea.rgb, p.crest.rgb, 0.45), smoothstep(0.03, 0.12, lean) * 0.45 * near * (1.0 - 0.7 * layer.wet));

    var bounced = reflect(dir, normal);
    bounced.y = max(bounced.y, 0.02);
    bounced = normalize(bounced);
    var mirrored = skyAt(bounced.y);
    let seen = cloudPaint(uvOf(bounced, hz, aspect), bounced, toLight, layer);
    mirrored = mirrored * (1.0 - seen.a) + seen.rgb;
    mirrored += vec3f(0.8, 0.84, 1.0) * flash * 0.5;
    let shore = landAt(landX + bounced.x * 0.03, bounced.y / sin(UP) * hz, seed, mist, air);
    mirrored = mix(mirrored, shore.rgb * 0.85, shore.a * 0.85 * (1.0 - smoothstep(0.04, 0.2, d)));
    let glance = 0.03 + 0.97 * pow(1.0 - max(dot(normal, -dir), 0.0), 5.0);
    col = mix(water, mirrored, glance * (0.5 + 0.3 * icy));

    let line = smoothstep(0.72, 0.84, crest) * (1.0 - smoothstep(0.84, 0.98, crest) * 0.7) * near;
    col = mix(col, mix(p.sea.rgb, p.crest.rgb, 0.8), line * (0.3 + 0.2 * wind) * (1.0 - 0.7 * storm));
    if (wild > 0.02) {
      let lace = fbmSimplex2d(point * vec2f(0.7, 1.9) + vec2f(t * 0.15, -t * 0.4), 3, 2.2, 0.55);
      let breaking = smoothstep(0.86 - 0.1 * wild, 0.93, crest) * smoothstep(-0.15, 0.2, lace);
      let streaks = smoothstep(0.7, 0.88, crest) * smoothstep(0.34, 0.44, lace) * 0.25;
      col = mix(col, mix(p.crest.rgb, vec3f(0.94), 0.5), clamp(max(breaking, streaks) * wild * near, 0.0, 0.85));
    }

    let roadOn = p.extra.w * (0.25 + 0.75 * moonlight) * veil * (1.0 - 0.75 * layer.cover * layer.wet);
    let offRoad = (atan2(bounced.x, bounced.z) - atan2(toLight.x, toLight.z)) / (0.035 + 0.13 * d);
    let column = exp(-offRoad * offRoad);
    let sliver = smoothstep(0.08, 0.3, fbmSimplex2d(point * vec2f(0.22, 1.5) + vec2f(t * 0.12, -t * 0.3), 2, 2.0, 0.5) + 0.9 * clamp(-slope.y, -0.3, 0.3));
    col = mix(col, p.light.rgb, column * sliver * smoothstep(0.1, 0.3, d) * (1.0 - 0.55 * smoothstep(0.55, 1.0, d)) * roadOn * 0.92);

    var strokes = vec2f(0.0);
    for (var k = 0; k < 2; k++) {
      let fk = f32(k);
      let rowAt = pow(d, 0.5) * (46.0 + 17.0 * fk) + fk * 0.5;
      let row = floor(rowAt);
      let rh = hash2(vec2f(row, seed + fk * 9.0));
      let u = uv.x * aspect * mix(15.0, 4.5, sqrt(d)) + rh.x * 31.0 + sin(t * (0.25 + 0.3 * rh.y) + rh.x * TAU) * 0.3;
      let ch = hash2(vec2f(floor(u), row + seed * 3.0 + fk * 5.0));
      let ch2 = hash2(vec2f(row + 7.0, floor(u) + fk * 3.0));
      let at = vec2f((fract(u) - 0.3 - 0.4 * ch2.x) / (0.16 + 0.3 * ch.y), (fract(rowAt) - 0.3 - 0.4 * ch2.y) / 0.2);
      let lens = 1.0 - smoothstep(0.55, 1.0, length(at));
      strokes += vec2f(lens * step(ch.x, 0.22 + 0.25 * wind), lens * step(ch.x, 0.62));
    }
    let farness = 1.0 - smoothstep(0.1, 0.45, d);
    let onRoad = exp(-pow((uv.x - p.orb.x) / (0.03 + 0.2 * d), 2.0));
    col = mix(col, mix(p.sea.rgb, p.crest.rgb, 0.6), clamp(strokes.x, 0.0, 1.0) * farness * 0.16);
    col = mix(col, p.light.rgb, clamp(strokes.y, 0.0, 1.0) * onRoad * farness * roadOn * 0.9);

    let thrown = crown(point, p.tapA) + crown(point, p.tapB) + crown(point, p.tapC) + crown(point, p.tapD);
    col = mix(col, mix(p.crest.rgb, vec3f(0.95), 0.5), clamp(thrown, 0.0, 1.0) * 0.8);
    let fromCentre = point - centre;
    let away = length(fromCentre);
    let lightWay = normalize(vec2f(toLight.x, toLight.z));
    for (var i = 0; i < 4; i++) {
      let age = p.ripples[i];
      if (age < 0.0) { continue; }
      let off = away - (0.5 + age * 1.5);
      let side = smoothstep(-0.2, 0.9, -dot(fromCentre / max(away, 0.01), lightWay));
      col = mix(col, mix(p.haze.rgb, p.light.rgb, 0.5), exp(-off * off / 0.012) * side * exp(-age * 0.22) * 0.7);
    }
    let landed = drops(point, falling, hail, snowy, t, seed).y * smoothstep(0.05, 0.3, d);
    col = mix(col, mix(p.haze.rgb, p.light.rgb, 0.3 + 0.5 * icy), clamp(landed, 0.0, 1.0) * (0.22 + 0.2 * rain + 0.3 * icy));
    col = mix(col, mix(p.haze.rgb, p.crest.rgb, 0.5), landing * max(rain, snow * 0.5) * (0.12 + 0.3 * (1.0 - smoothstep(0.0, 0.3, d))));
    let sx = p.extra.y * W + t * 0.35 * (0.6 + wind) + sin(t / 60.0) * 6.0;
    col = mix(col, mix(p.orbInk.rgb, p.haze.rgb, 0.4), exp(-pow((px.x - sx + M * 0.004) / (M * 0.004), 2.0)) * exp(-d * 55.0) * 0.5);
    col = mix(col, p.haze.rgb, (1.0 - exp(-dist * 0.0012)) * 0.8);
    col = mix(col, mix(p.haze.rgb, p.light.rgb, 0.3), exp(-d * 260.0) * 0.55);
  }

  col = mix(col, p.haze.rgb, fog * exp(-pow((uv.y - hz) / 0.14, 2.0)) * 0.75);
  if (max(rain, snow) > 0.02) {
    let f = textureSampleLevel(fall, cloudSampler, uv, 0.0);
    let farAir = 1.0 - exp(-max(f.x - f.y, 0.0) * 0.6);
    let nearAir = 1.0 - exp(-f.y * 400.0);
    let white = snow / (rain + snow);
    let low = smoothstep(0.35, 0.0, abs(uv.y - hz));
    let shaft = mix(mix(p.top.rgb, p.dark.rgb, 0.4), murk, 0.4);
    col = mix(col, mix(mix(shaft, p.haze.rgb, 0.08 + 0.3 * low), p.haze.rgb, white), (1.0 - exp(-f.x * 0.22 * (0.4 + 0.6 * max(rain, snow)))) * (0.55 + 0.2 * showers));
    let top = min(uv.y, hz);
    let lean = drift * 0.22 * (1.0 - 0.5 * icy) * H / W;
    var above = 0.0;
    for (var k = 0; k < 4; k++) {
      let y = top * (0.08 + 0.24 * f32(k));
      above = max(above, 1.0 - textureSampleLevel(clouds, cloudSampler, vec2f(uv.x + (uv.y - y) * lean, y), 0.0).a);
    }
    let here = 1.0 - textureSampleLevel(clouds, cloudSampler, uv, 0.0).a;
    let below = 1.0 - textureSampleLevel(clouds, cloudSampler, vec2f(uv.x - 0.07 * lean, min(uv.y + 0.07, hz)), 0.0).a;
    let hung = smoothstep(0.05, 0.55, above) * (1.0 - here * smoothstep(0.1, 0.6, below));
    if (rain > 0.02) {
      let slant = drift * 0.22 * (1.0 - 0.5 * icy);
      let ink = mix(mix(p.haze.rgb, mix(vec3f(0.84, 0.87, 0.93), p.light.rgb, day), 0.35), vec3f(0.96), 0.6 * icy);
      let fine = hairlines(px, slant, 7.0, H * 0.3, 1.6 + 0.8 * rain, t, seed, 0.75 - 0.45 * rain);
      let close = hairlines(px, slant, 29.0, H * 0.085, 9.0 + 4.0 * rain, t, seed + 4.0, 0.82 - 0.3 * rain);
      let foot = smoothstep(0.0, 0.09, hz - uv.y);
      col = mix(col, ink, clamp(fine * farAir * foot * hung * (0.2 + 0.16 * rain) + close * close * nearAir * (0.14 + 0.12 * rain), 0.0, 1.0) * (1.0 + 0.5 * icy) * mix(0.55, 1.0, p.sky.x));
    }
    col = mix(col, mix(p.haze.rgb, p.crest.rgb, 0.4), farAir * exp(-abs(uv.y - hz) / 0.035) * (0.28 + 0.3 * max(rain, snow)) * mix(0.6, 1.0, p.sky.x));
    if (snow > 0.02) {
      for (var l = 0; l < 4; l++) {
        let depth = f32(l) / 3.0;
        let cells = mix(58.0, 10.0, depth);
        let speed = mix(0.03, 0.2, depth * depth) * (1.0 + 2.0 * icy);
        var q = vec2f(uv.x * aspect, uv.y) * cells;
        q.y -= t * speed * cells;
        q.x -= t * speed * drift * 1.4 * cells;
        let cell = floor(q);
        let h = hash2(cell + vec2f(f32(l) * 31.0, seed));
        if (h.x < snow * mix(0.36, 0.18, depth) * (1.0 - 0.6 * icy)) {
          let h2 = hash2(cell + vec2f(5.0, f32(l) * 13.0));
          let wander = vec2f(0.14 * sin(t * (0.5 + 0.7 * h.y) + h2.x * TAU), 0.0);
          var v = fract(q) - (0.28 + 0.44 * h2) - wander;
          v.y /= 1.0 + 0.5 * depth + 1.5 * icy;
          let radius = mix(1.1, 5.2, pow(depth, 1.4)) * (0.65 + 0.7 * h.y) * cells / H * (1.0 - 0.4 * icy);
          let flake = exp(-dot(v, v) / (radius * radius));
          let seen = mix(1.0 - exp(-f.x * 0.6), nearAir, depth) * mix(0.5, 0.9, depth) * (1.0 - 0.45 * smoothstep(0.7, 1.0, depth));
          col = mix(col, mix(p.light.rgb, vec3f(1.0), 0.5), flake * seen * mix(hung, 1.0, step(0.5, depth)) * 0.85);
        }
      }
    }
  }

  col += (hash2(floor(px) + vec2f(13.0, 71.0)).x - 0.5) * 0.024;
  col *= 1.0 - 0.16 * smoothstep(0.45, 0.95, length((uv - 0.5) * vec2f(1.0, 1.2)));
  let fade = p.motion.w;
  return vec4f(max(col, vec3f(0.0)) * fade, fade);
}
