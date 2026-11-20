import type { Scene } from "./sky"

type RGB = readonly [number, number, number]
type Palette = { top: RGB; mid: RGB; haze: RGB; far: RGB; near: RGB; sea: RGB; deep: RGB; dark: RGB; light: RGB; orb: RGB; crest: RGB }

const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
const palette = (p: Record<keyof Palette, string>) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, hex(v)])) as Palette
const NIGHT = palette({ top: "#0a1830", mid: "#1b2f50", haze: "#5a5372", far: "#28395a", near: "#1c2a46", sea: "#203858", deep: "#12233f", dark: "#08162b", light: "#f5c983", orb: "#ffd894", crest: "#5fb3a8" })
const DUSK = palette({ top: "#a988a8", mid: "#ec9f90", haze: "#ffc08c", far: "#8b7088", near: "#6a586f", sea: "#2c6676", deep: "#164c5e", dark: "#0a3244", light: "#ffc97f", orb: "#ffd683", crest: "#e7a796" })
const DAY = palette({ top: "#3c6c9b", mid: "#8db3cd", haze: "#d3e2e6", far: "#7491a6", near: "#58778c", sea: "#3f7189", deep: "#24506a", dark: "#143a52", light: "#fff4d8", orb: "#fff6dc", crest: "#cfe7ee" })
const RAIN = palette({ top: "#6b8f92", mid: "#a8c0ba", haze: "#d4d6bf", far: "#7b9797", near: "#5e8284", sea: "#4d7c80", deep: "#2e5f66", dark: "#1c4851", light: "#dcdcc0", orb: "#ecebd6", crest: "#d4dcc8" })
const SNOW = palette({ top: "#8a9db0", mid: "#bcc7d2", haze: "#e6eaeb", far: "#a2b0bc", near: "#8395a4", sea: "#6c8999", deep: "#476577", dark: "#2f4a5b", light: "#f3f4f0", orb: "#f5f3ea", crest: "#e3ecee" })

const mix = (a: RGB, b: RGB, x: number): RGB => [a[0] + (b[0] - a[0]) * x, a[1] + (b[1] - a[1]) * x, a[2] + (b[2] - a[2]) * x]
const mixPalette = (a: Palette, b: Palette, x: number) => Object.fromEntries((Object.keys(a) as (keyof Palette)[]).map((k) => [k, mix(a[k], b[k], x)])) as Palette
const clamp = (x: number) => Math.min(1, Math.max(0, x))

export const paletteOf = (s: Scene) => {
  let p = mixPalette(NIGHT, DAY, s.light)
  p = mixPalette(p, DUSK, s.warm * 0.85)
  const overcast = clamp(Math.max(s.rain, s.cloud * 0.55, s.fog * 0.7))
  const byNight = (grey: Palette) => mixPalette(mixPalette(NIGHT, grey, 0.35), grey, s.light)
  return temper(mixPalette(mixPalette(p, byNight(RAIN), overcast * 0.85), byNight(SNOW), clamp(s.snow * 1.15)), s)
}

const scale = (c: RGB, by: RGB, x: number): RGB => [c[0] * (1 + (by[0] - 1) * x), c[1] * (1 + (by[1] - 1) * x), c[2] * (1 + (by[2] - 1) * x)]
const temper = (p: Palette, s: Scene): Palette => {
  if (!s.heat) return p
  const hot = Math.max(s.heat, 0), cold = Math.max(-s.heat, 0)
  const open = 1 - clamp(Math.max(s.rain, s.snow, s.cloud * 0.7, s.fog)), day = s.light * (1 - s.warm), dusk = s.warm, shut = 1 - open
  const haze = mix(mix(mix(p.haze, [255, 238, 208], 0.4 * hot * day * open), [255, 148, 92], 0.32 * hot * dusk * open), [226, 236, 246], cold * open * (0.45 * day + 0.2 * dusk))
  return {
    ...p,
    top: scale(scale(p.top, [0.8, 0.9, 1.05], cold * day * open), [1.05, 1.02, 0.96], hot * shut * 0.6),
    mid: scale(mix(mix(p.mid, haze, 0.3 * hot * day * open), [250, 228, 196], 0.25 * cold * dusk * open), [0.94, 0.98, 1.04], cold * shut * 0.7),
    haze: scale(scale(haze, [1.04, 1.02, 0.95], hot * shut * 0.6), [0.95, 0.98, 1.04], cold * shut * 0.7),
    sea: scale(scale(p.sea, [0.82, 1.08, 1.04], hot * day * open), [0.84, 0.92, 1], cold * (0.5 + 0.5 * open)),
    deep: scale(scale(p.deep, [0.9, 1.05, 1.03], hot * day * open), [0.82, 0.9, 0.98], cold * (0.5 + 0.5 * open)),
    light: mix(mix(p.light, [255, 176, 112], 0.4 * hot * dusk), [244, 248, 255], 0.45 * cold),
    orb: mix(mix(p.orb, [255, 160, 100], 0.45 * hot * dusk), [250, 250, 252], 0.4 * cold * (1 - dusk * 0.5)),
  }
}

export const inkOf = (s: Scene): "dark" | "light" => {
  const [r, g, b] = mix(paletteOf(s).mid, paletteOf(s).top, 0.5)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 128 ? "dark" : "light"
}

export type Frame = {
  /** seconds since the scene began; everything moves from this alone */
  t: number
  /** the breath envelope, 0 to 1, for the breathing ripples; none when not breathing */
  level?: number
  pulse?: number
  fade?: number
  /** the ages in seconds of the rings released on the water, newest first */
  ripples?: readonly number[]
  /** stones dropped in the water, newest first: where on the sea in metres (across, out), and how long ago in seconds */
  taps?: readonly (readonly [x: number, z: number, age: number])[]
}

export const HORIZON = 0.545
export const SEED = 5

// the camera the shaders look through (scene.wgsl, sea.wgsl): radians of sea below the horizon and across per unit of aspect, and the eye's height in metres
const DOWN = 0.5, ACROSS = 0.62, EYE = 2.4
/** Where on the sea a point of the screen lies, in metres across and out from the eye; nothing above the horizon. */
export const seaPoint = (x: number, y: number, aspect: number): readonly [number, number] | undefined => {
  if (y <= HORIZON + 0.004) return undefined
  const across = (x - 0.5) * aspect * ACROSS, down = ((y - HORIZON) / (1 - HORIZON)) * DOWN
  const far = EYE / Math.tan(down)
  return [far * Math.sin(across), far * Math.cos(across)]
}
