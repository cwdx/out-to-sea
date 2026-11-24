import { pattern, type Pattern } from "./clock"
import { HOURS, TEMPS, WEATHERS, type Hour, type Temp, type Weather } from "./fixtures"

/** What the settings window edits. Unknown fields in the file are kept, so a menu plugin or a later version can store its own. */
export type City = { name: string; latitude: number; longitude: number }
export type Prefs = {
  /** minutes between breaks */
  every: number
  /** seconds of looking away */
  look: number
  start: "look" | "breathe"
  /** seconds to breathe in, hold, breathe out and hold; a hold of 0 is skipped */
  breathing: [number, number, number, number]
  sound: boolean
  /** how loud, 0 to 100 */
  volume: number
  weather: boolean
  dissolve: boolean
  login: boolean
  locate: boolean
  notify: boolean
  /** the time of day on the main screen */
  clock: boolean
  menuPlugin: string
  hour: Hour | ""
  sky: Weather | ""
  temp: Temp | ""
  unit: "auto" | "c" | "f"
  theme: "system" | "light" | "dark"
  windowed: boolean
  settingsWidth: number
  /** on the Mac, new versions install themselves */
  autoUpdate: boolean
  city?: City
}

export const DEFAULTS: Prefs = {
  every: 20,
  look: 20,
  start: "look",
  breathing: [5, 4, 8, 4],
  sound: true,
  volume: 40,
  weather: true,
  dissolve: false,
  login: false,
  locate: true,
  notify: true,
  clock: true,
  menuPlugin: "",
  hour: "",
  sky: "",
  temp: "",
  unit: "auto",
  theme: "system",
  windowed: false,
  settingsWidth: 880,
  autoUpdate: true,
}

const num = (v: unknown, min: number, max: number, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback)
const obj = (v: unknown): Record<string, unknown> => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

/** Any settings file, of any age, as valid settings. Fields this version doesn't know are passed through untouched. */
export const migrate = (raw: unknown): Prefs & Record<string, unknown> => {
  const r = obj(raw), b = obj(r.breathing), d = DEFAULTS.breathing
  const s = Array.isArray(b.simple) ? b.simple : [], c = Array.isArray(b.custom) ? b.custom : []
  const old = b.mode === "box" ? [b.box, b.box, b.box, b.box] : b.mode === "custom" ? c : Array.isArray(b.simple) ? [s[0], 0, s[1], 0] : d
  const p = Array.isArray(r.breathing) ? r.breathing : old
  const city = obj(r.city)
  return {
    ...r,
    every: num(r.every, 0, 120, DEFAULTS.every),
    look: num(r.look, 10, 120, DEFAULTS.look),
    start: r.start === "breathe" ? "breathe" : "look",
    breathing: [num(p[0], 1, 30, d[0]), num(p[1], 0, 30, d[1]), num(p[2], 1, 30, d[2]), num(p[3], 0, 30, d[3])],
    sound: r.sound !== false,
    volume: num(r.volume, 0, 100, DEFAULTS.volume),
    weather: r.weather !== false,
    dissolve: r.dissolve === true,
    login: r.login === true,
    locate: r.locate !== false,
    notify: r.notify !== false,
    clock: r.clock !== false,
    menuPlugin: typeof r.menuPlugin === "string" ? r.menuPlugin.trim() : "",
    hour: HOURS.find((h) => h === r.hour) ?? "",
    sky: typeof r.sky === "string" && r.sky in WEATHERS ? (r.sky as Weather) : "",
    temp: typeof r.temp === "string" && r.temp in TEMPS ? (r.temp as Temp) : "",
    unit: r.unit === "c" || r.unit === "f" ? r.unit : "auto",
    windowed: r.windowed === true,
    autoUpdate: r.autoUpdate !== false,
    settingsWidth: num(r.settingsWidth, 880, 2400, 880),
    theme: r.theme === "light" || r.theme === "dark" ? r.theme : "system",
    city: typeof city.latitude === "number" && typeof city.longitude === "number" && Math.abs(city.latitude) <= 90 && Math.abs(city.longitude) <= 180
      ? { name: typeof city.name === "string" ? city.name : "", latitude: city.latitude, longitude: city.longitude }
      : undefined,
  }
}

/** Minutes between breaks as milliseconds; 0 is never, kept as a year so the reminder's arithmetic stays the same. */
export const intervalOf = (every: number) => (every || 525_600) * 60_000

export const breathingOf = ({ breathing: b }: Prefs): Pattern => pattern(...b)

// where people count in Fahrenheit, by time zone: the US and the few countries that share its habit. The time zone,
// not the language, says where someone is: an English-speaking Mac set to US English is common far from the US.
const FAHRENHEIT = /^(America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Juneau|Sitka|Yakutat|Nome|Adak|Metlakatla|Boise|Detroit|Menominee|Indiana\/\w+|Kentucky\/\w+|North_Dakota\/\w+|Nassau|Belize|Cayman)|Pacific\/(Honolulu|Palau|Majuro|Kwajalein|Pohnpei|Chuuk|Kosrae)|Africa\/Monrovia|US\/\w+)$/

export const unitOf = (unit: Prefs["unit"] = "auto", zone = Intl.DateTimeFormat().resolvedOptions().timeZone): "c" | "f" =>
  unit === "auto" ? (FAHRENHEIT.test(zone) ? "f" : "c") : unit

export const degrees = (celsius: number | undefined, unit?: Prefs["unit"]) =>
  celsius === undefined ? "" : `${Math.round(unitOf(unit) === "f" ? celsius * 1.8 + 32 : celsius)}°`
