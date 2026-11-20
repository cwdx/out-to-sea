import { HORIZON, paletteOf, type Frame } from "./sea"
import type { Scene } from "./sky"
import { strikeAt } from "./storm"

const v4 = (c: readonly [number, number, number]) => [c[0] / 255, c[1] / 255, c[2] / 255, 1] as const

/** The shader's one uniform: the scene, this frame, and the palette, in the layout sea.wgsl's Params declares. */
export const seaParams = (s: Scene, f: { width: number; height: number; t: number; level?: number; pulse?: number; fade?: number; seed: number; ripples?: readonly number[]; taps?: Frame["taps"] }) => {
  const p = paletteOf(s)
  const strike = strikeAt(f.t, s.storm, f.seed % 997)
  return {
    view: [f.width, f.height, f.t, HORIZON],
    orb: [s.orb.x, Math.min(s.orb.y, HORIZON - 0.06), s.sun ? 0.042 : 0.038, s.sun ? 1 : 0],
    sky: [s.light, s.warm, s.moon, s.starlight],
    weather: [s.cloud, s.rain, s.snow, s.fog],
    motion: [s.wind, f.level ?? -1, f.pulse ?? 0.5, f.fade ?? 1],
    extra: [(f.seed % 997) + 0.5, 0.6 + ((f.seed % 89) / 89) * 0.12, s.heat, s.up],
    ripples: [0, 1, 2, 3].map((i) => f.ripples?.[i] ?? -1),
    weather2: [s.storm, s.gust, s.drift, s.showers],
    lightning: [strike.flash, strike.x, strike.bolt, strike.since],
    ...Object.fromEntries(["tapA", "tapB", "tapC", "tapD"].map((name, i) => [name, [f.taps?.[i]?.[0] ?? 0, f.taps?.[i]?.[1] ?? 0, f.taps?.[i]?.[2] ?? -1, 0]])),
    top: v4(p.top), mid: v4(p.mid), haze: v4(p.haze), far: v4(p.far), near: v4(p.near), sea: v4(p.sea),
    deep: v4(p.deep), dark: v4(p.dark), light: v4(p.light), orbInk: v4(p.orb), crest: v4(p.crest),
  }
}
