import type { Sky } from "./sky"

const day = (h: number, m = 0) => new Date(2026, 10, 19, h, m).getTime()
const base = { rise: day(6, 30), set: day(18), cloud: 0.1, rain: 0, snow: 0, fog: 0, wind: 0.25, storm: 0, gust: 0, drift: 0.3, showers: 0, place: "Lisbon", condition: "Clear" }

export const FIXTURES = {
  night: { ...base, at: day(22), cloud: 0.25, condition: "Partly cloudy" },
  dawn: { ...base, at: day(6, 35), condition: "Clear" },
  day: { ...base, at: day(11), condition: "Clear" },
  cloud: { ...base, at: day(14), cloud: 0.85, condition: "Overcast" },
  sunset: { ...base, at: day(17, 55), cloud: 0.3, condition: "Partly cloudy" },
  dusk: { ...base, at: day(18, 30), cloud: 0.2, condition: "Clear" },
  drizzle: { ...base, at: day(10), cloud: 0.7, rain: 0.25, drift: 0.2, condition: "Drizzle" },
  rain: { ...base, at: day(13), cloud: 0.9, rain: 0.8, wind: 0.45, drift: 0.5, condition: "Rain" },
  downpour: { ...base, at: day(15), cloud: 1, rain: 1, wind: 0.6, drift: 0.6, condition: "Heavy rain" },
  showers: { ...base, at: day(16), cloud: 0.6, rain: 0.75, showers: 1, wind: 0.4, drift: 0.6, condition: "Showers" },
  storm: { ...base, at: day(19, 30), cloud: 1, rain: 0.9, storm: 1, showers: 0.6, wind: 0.8, gust: 0.8, drift: 0.7, condition: "Thunderstorm" },
  snow: { ...base, at: day(15), temp: -3, cloud: 0.7, snow: 0.8, wind: 0.3, drift: 0.4, condition: "Snow" },
  sleet: { ...base, at: day(9), temp: 0, cloud: 0.85, rain: 0.5, snow: 0.3, wind: 0.5, drift: -0.5, condition: "Freezing rain" },
  fog: { ...base, at: day(8), cloud: 0.4, fog: 0.9, condition: "Fog" },
} satisfies Record<string, Sky>
export type Fixture = keyof typeof FIXTURES

export const WEATHERS = {
  clear: { cloud: 0.05, condition: "Clear" },
  cloud: { cloud: 0.3, condition: "Partly cloudy" },
  overcast: { cloud: 1, condition: "Overcast" },
  fog: { cloud: 0.4, fog: 0.9, condition: "Fog" },
  drizzle: { cloud: 0.7, rain: 0.25, drift: 0.2, condition: "Drizzle" },
  rain: { cloud: 0.9, rain: 0.8, wind: 0.45, drift: 0.5, condition: "Rain" },
  downpour: { cloud: 1, rain: 1, wind: 0.6, drift: 0.6, condition: "Heavy rain" },
  showers: { cloud: 0.6, rain: 0.75, showers: 1, wind: 0.4, drift: 0.6, condition: "Showers" },
  thunder: { cloud: 1, rain: 0.9, storm: 1, showers: 0.6, wind: 0.8, gust: 0.8, drift: 0.7, condition: "Thunderstorm" },
  // snow and ice bring their own cold, whatever it is outside
  snow: { cloud: 0.7, snow: 0.8, wind: 0.3, drift: 0.4, temp: -3, condition: "Snow" },
  sleet: { cloud: 0.85, rain: 0.5, snow: 0.3, wind: 0.5, drift: -0.5, temp: 0, condition: "Freezing rain" },
} satisfies Record<string, Partial<Sky>>
export type Weather = keyof typeof WEATHERS
export const HOURS = ["dawn", "day", "sunset", "dusk", "night"] as const
export type Hour = (typeof HOURS)[number]

export const TEMPS = { freezing: -4, cold: 5, mild: 20, warm: 28, hot: 36 } as const
export type Temp = keyof typeof TEMPS
export type Choice = { hour: Hour | ""; sky: Weather | ""; temp: Temp | "" }

const STILL = { cloud: 0, rain: 0, snow: 0, fog: 0, wind: 0.25, storm: 0, gust: 0, drift: 0.3, showers: 0 }

export const skyFor = ({ hour, sky: weather, temp }: Choice, live: Sky): Sky => {
  const chosen = weather ? { ...live, ...STILL, ...WEATHERS[weather] } : live
  const sky = temp ? { ...chosen, temp: TEMPS[temp] } : chosen
  if (!hour) return sky
  const at = new Date(live.at), clock = (h: number) => new Date(at.getFullYear(), at.getMonth(), at.getDate(), h).getTime()
  const rise = live.rise || clock(7), set = live.set || clock(19), minute = 60_000
  // the real moon is where it is now, not at the hour chosen, so that hour gets the drawn arc
  return { ...sky, rise, set, moonAt: undefined, at: { dawn: rise + 5 * minute, day: (rise + set) / 2, sunset: set - 5 * minute, dusk: set + 30 * minute, night: set + 240 * minute }[hour] }
}
