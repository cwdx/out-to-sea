import SunCalc from "suncalc"
import type { City } from "./prefs"
import { CLEAR, type Sky } from "./sky"

// Open-Meteo: free for non-commercial use, CC BY 4.0, no key. Only a city's rounded coordinates, or the time zone's city name, leave the machine.
export type Conditions = { observedAt: number; code: number; rainMm: number; cloudPercent: number; windKmh: number; gustKmh: number; windFrom: number; visibilityM: number; tempC?: number }
export type Weather = { source: "live" | "cache" | "stale" | "clock-only"; conditions: Conditions | null }

const HOUR = 3_600_000
const STALE = 6 * HOUR
const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object"
const within = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max

export const parseForecast = (value: unknown): Conditions => {
  if (!isRecord(value) || !isRecord(value.current)) throw new Error("Missing current weather")
  const { time, weather_code, rain, cloud_cover, wind_speed_10m, wind_gusts_10m, wind_direction_10m, visibility, temperature_2m } = value.current
  if (!within(time, 1, 1e10) || !within(weather_code, 0, 99) || !Number.isInteger(weather_code) || !within(rain, 0, 1000) || !within(cloud_cover, 0, 100) || !within(wind_speed_10m, 0, 600))
    throw new Error("Invalid current weather")
  // gusts, direction, visibility and temperature are extras: a cached reading from before they were asked for still reads
  return {
    observedAt: time * 1000,
    code: weather_code,
    rainMm: rain,
    cloudPercent: cloud_cover,
    windKmh: wind_speed_10m,
    gustKmh: within(wind_gusts_10m, 0, 600) ? wind_gusts_10m : wind_speed_10m,
    windFrom: within(wind_direction_10m, 0, 360) ? wind_direction_10m : 270,
    visibilityM: within(visibility, 0, 1e6) ? visibility : 24_000,
    tempC: within(temperature_2m, -90, 60) ? temperature_2m : undefined,
  }
}

export type WeatherCache = { read: (key: string) => Promise<unknown>; write: (key: string, value: unknown) => Promise<void> }

export const readWeather = async (city: City, cache: WeatherCache, { now = Date.now(), offline = false, request = fetch }: { now?: number; offline?: boolean; request?: typeof fetch } = {}): Promise<Weather> => {
  const lat = city.latitude.toFixed(2), lon = city.longitude.toFixed(2)
  const key = `weather-v2-${lat}_${lon}`
  let fallback: Weather = { source: "clock-only", conditions: null }
  try {
    const saved = await cache.read(key)
    if (isRecord(saved) && within(saved.fetchedAt, 1, now)) {
      const conditions = parseForecast(saved.forecast), age = now - conditions.observedAt
      if (age >= -60_000 && age < STALE) {
        if (now - saved.fetchedAt < HOUR) return { source: "cache", conditions }
        fallback = { source: "stale", conditions }
      }
    }
  } catch {
  }
  if (offline) return fallback
  const url = new URL("https://api.open-meteo.com/v1/forecast")
  url.search = new URLSearchParams({ latitude: lat, longitude: lon, current: "weather_code,rain,cloud_cover,wind_speed_10m,wind_gusts_10m,wind_direction_10m,visibility,temperature_2m", wind_speed_unit: "kmh", timeformat: "unixtime", timezone: "GMT" }).toString()
  let forecast: unknown, conditions: Conditions
  try {
    const response = await request(url, { signal: AbortSignal.timeout(4500) })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    forecast = await response.json()
    conditions = parseForecast(forecast)
    const age = now - conditions.observedAt
    if (age < -60_000 || age >= STALE) throw new Error("Weather outside its time range")
  } catch {
    return fallback
  }
  await cache.write(key, { fetchedAt: now, forecast }).catch(() => undefined)
  return { source: "live", conditions }
}

/** The name of the place at a position, from BigDataCloud's free lookup for browsers; the position is rounded to about a kilometre first. */
export const placeNameAt = async (latitude: number, longitude: number, request = fetch): Promise<string> => {
  try {
    const response = await request(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude.toFixed(2)}&longitude=${longitude.toFixed(2)}&localityLanguage=en`, { signal: AbortSignal.timeout(4500) })
    const place = (await response.json()) as { locality?: string; city?: string }
    return place.locality || place.city || ""
  } catch {
    return ""
  }
}

export const cityNamed = async (name: string, request = fetch): Promise<City | undefined> => {
  try {
    const response = await request(`https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(name)}`, { signal: AbortSignal.timeout(4500) })
    const place = ((await response.json()) as { results?: { name: string; latitude: number; longitude: number }[] }).results?.[0]
    return place && { name: place.name, latitude: place.latitude, longitude: place.longitude }
  } catch {
    return undefined
  }
}

export const cityOfZone = async (zone = Intl.DateTimeFormat().resolvedOptions().timeZone, request = fetch): Promise<City | undefined> => {
  const name = zone.split("/").at(-1)?.replaceAll("_", " ")
  if (!name) return undefined
  try {
    const response = await request(`https://geocoding-api.open-meteo.com/v1/search?count=10&name=${encodeURIComponent(name)}`, { signal: AbortSignal.timeout(4500) })
    const places = ((await response.json()) as { results?: { name: string; latitude: number; longitude: number; timezone: string }[] }).results ?? []
    const place = places.find((p) => p.timezone === zone) ?? places[0]
    return place && { name: place.name, latitude: place.latitude, longitude: place.longitude }
  } catch {
    return undefined
  }
}

type Kind = { name: string; rain?: number; snow?: number; fog?: number; storm?: number; showers?: number; cloud?: number }
const KINDS: Record<number, Kind> = {
  0: { name: "Clear" }, 1: { name: "Mainly clear" }, 2: { name: "Partly cloudy" }, 3: { name: "Overcast", cloud: 1 },
  45: { name: "Fog", fog: 1 }, 48: { name: "Freezing fog", fog: 1, snow: 0.1 },
  51: { name: "Light drizzle", rain: 0.25 }, 53: { name: "Drizzle", rain: 0.35 }, 55: { name: "Dense drizzle", rain: 0.5 },
  56: { name: "Freezing drizzle", rain: 0.25, snow: 0.2 }, 57: { name: "Freezing drizzle", rain: 0.4, snow: 0.3 },
  61: { name: "Light rain", rain: 0.5 }, 63: { name: "Rain", rain: 0.7 }, 65: { name: "Heavy rain", rain: 0.95 },
  66: { name: "Freezing rain", rain: 0.55, snow: 0.25 }, 67: { name: "Freezing rain", rain: 0.85, snow: 0.35 },
  71: { name: "Light snow", snow: 0.4 }, 73: { name: "Snow", snow: 0.65 }, 75: { name: "Heavy snow", snow: 0.95 }, 77: { name: "Snow grains", snow: 0.35 },
  80: { name: "Light showers", rain: 0.5, showers: 1 }, 81: { name: "Showers", rain: 0.75, showers: 1 }, 82: { name: "Violent showers", rain: 1, showers: 1 },
  85: { name: "Snow showers", snow: 0.55, showers: 1 }, 86: { name: "Heavy snow showers", snow: 0.85, showers: 1 },
  95: { name: "Thunderstorm", rain: 0.85, storm: 0.7, showers: 0.6, cloud: 1 },
  96: { name: "Thunderstorm with hail", rain: 0.9, storm: 1, showers: 0.6, cloud: 1 }, 99: { name: "Thunderstorm with hail", rain: 1, storm: 1, showers: 0.6, cloud: 1 },
}

export const skyOf = (now: number, city: City | undefined, weather: Conditions | null): Sky => {
  const times = city && SunCalc.getTimes(new Date(now), city.latitude, city.longitude)
  const valid = (d: Date | undefined) => (d && Number.isFinite(d.getTime()) ? d.getTime() : 0)
  // SunCalc measures the moon's bearing from south, west positive: its sine runs from -1 as it rises in the east to 1 as it sets
  const moon = city && SunCalc.getMoonPosition(new Date(now), city.latitude, city.longitude)
  const base = { ...CLEAR, at: now, rise: valid(times?.sunrise), set: valid(times?.sunset), moonAt: moon && { across: 0.5 + 0.5 * Math.sin(moon.azimuth), up: moon.altitude }, place: city?.name ?? "" }
  if (!weather) return base
  const kind = KINDS[weather.code] ?? { name: "" }
  const wind = Math.min(1, weather.windKmh / 40)
  return {
    ...base,
    cloud: Math.max(kind.cloud ?? 0, Math.min(1, weather.cloudPercent / 100)),
    wind,
    gust: Math.min(1, Math.max(0, weather.gustKmh - weather.windKmh) / 30 + Math.max(0, wind - 0.6)),
    // the wind blows from a compass bearing; across the view, an east or west wind carries rain sideways the most
    drift: -Math.sin((weather.windFrom * Math.PI) / 180) * (0.3 + 0.7 * wind),
    fog: Math.max(kind.fog ?? 0, Math.min(0.7, Math.max(0, 1 - weather.visibilityM / 8_000))),
    rain: Math.max(kind.rain ?? 0, Math.min(1, weather.rainMm / 4)),
    snow: kind.snow ?? 0,
    storm: kind.storm ?? 0,
    showers: kind.showers ?? 0,
    condition: kind.name,
    temp: weather.tempC,
  }
}
