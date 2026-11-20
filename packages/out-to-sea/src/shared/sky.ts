import SunCalc from "suncalc"

export type Sky = {
  /** the moment the snapshot stands for, in ms */
  at: number
  /** today's sunrise and sunset in ms; 0 when unknown, and then the sky turns at seven */
  rise: number
  set: number
  /** where the moon really stands, when the place is known: its way across from rising to setting (0 to 1), and its height in radians, below 0 once it has set */
  moonAt?: { across: number; up: number }
  cloud: number
  rain: number
  snow: number
  fog: number
  wind: number
  storm: number
  gust: number
  /** which way the wind carries rain and snow across the view, -1 to the left to 1 to the right */
  drift: number
  showers: number
  /** the air's temperature in °C, when it is known: it tints the whole picture, colder or warmer */
  temp?: number
  place: string
  condition: string
}

export const CLEAR: Omit<Sky, "at"> = { rise: 0, set: 0, cloud: 0.1, rain: 0, snow: 0, fog: 0, wind: 0.2, storm: 0, gust: 0, drift: 0.3, showers: 0, place: "", condition: "" }

const clamp = (x: number) => Math.min(1, Math.max(0, x))

export const sceneOf = (sky: Sky) => {
  const at = sky.at / 1000, day = new Date(sky.at)
  const hour = (h: number) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), h).getTime() / 1000
  const rise = sky.rise ? sky.rise / 1000 : hour(7), set = sky.set ? sky.set / 1000 : hour(19)
  // light turns over forty minutes either side of sunrise and sunset; warm is the glow around them
  const light = clamp(Math.min((at - rise) / 2400 + 0.5, (set - at) / 2400 + 0.5))
  const warm = clamp(Math.exp(-(((at - rise) / 1500) ** 2)) + Math.exp(-(((at - set) / 1500) ** 2)))
  const sun = at > rise && at < set
  const arc = sun ? (at - rise) / (set - rise) : at >= set ? (at - set) / (rise + 86400 - set) : (at - set + 86400) / (rise - set + 86400)
  // by night the real moon, where the place is known: it may be low, or not up at all
  const moon = sun ? undefined : sky.moonAt
  return {
    light,
    warm,
    sun,
    orb: moon ? { x: 0.18 + 0.64 * moon.across, y: 0.42 - 0.3 * clamp(moon.up / 0.9) } : { x: 0.18 + 0.64 * arc, y: 0.12 + 0.3 * (1 - Math.sin(Math.PI * arc)) },
    up: moon ? clamp((moon.up + 0.01) / 0.06) : 1,
    /** the moon's age as a share of its month: 0 new, 0.5 full */
    moon: SunCalc.getMoonIllumination(day).phase,
    starlight: (1 - light) ** 2 * (1 - 0.8 * sky.cloud) * (1 - 0.6 * sky.fog),
    /** how warm the air is, from -1 (freezing) through 0 (mild, or unknown) to 1 (hot) */
    heat: sky.temp === undefined ? 0 : Math.max(-1, Math.min(1, (sky.temp - 20) / 18)),
    cloud: sky.cloud,
    rain: sky.rain,
    snow: sky.snow,
    fog: sky.fog,
    wind: sky.wind,
    storm: sky.storm ?? 0,
    gust: sky.gust ?? 0,
    drift: sky.drift ?? 0.3,
    showers: sky.showers ?? 0,
  }
}
export type Scene = ReturnType<typeof sceneOf>

export const blendScenes = (a: Scene, b: Scene, k: number): Scene => {
  const mix = (x: number, y: number) => x + (y - x) * k
  const numbers = Object.fromEntries(Object.entries(b).map(([key, v]) => [key, typeof v === "number" ? mix(a[key as "light"], v) : v])) as Scene
  const turn = a.sun === b.sun ? 1 : Math.abs(1 - 2 * k)
  return { ...numbers, sun: k < 0.5 ? a.sun : b.sun, orb: { x: mix(a.orb.x, b.orb.x), y: mix(a.orb.y, b.orb.y) }, up: mix(a.up, b.up) * turn }
}
