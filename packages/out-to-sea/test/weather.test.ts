import { afterEach, expect, test } from "bun:test"
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { getWeather, parseForecast, skyOf } from "../src/bun/weather"
import { sceneOf } from "../src/shared/sky"

const now = Date.UTC(2026, 10, 19, 5)
const reading = { current: { time: now / 1000 - 600, weather_code: 61, rain: 1.2, cloud_cover: 88, wind_speed_10m: 18 } }
const city = { name: "Canggu", latitude: -8.65, longitude: 115.14 }
const HOUR = 3_600_000
let dir = ""
afterEach(() => rm(dir, { recursive: true, force: true }))

test("a reading is cached for an hour, kept as stale for six, and then the clock alone is used", async () => {
  dir = await mkdtemp(join(tmpdir(), "outtosea-weather-"))
  const ok: typeof fetch = Object.assign(async () => Response.json(reading), { preconnect: () => undefined })
  const down: typeof fetch = Object.assign(async () => new Response(null, { status: 503 }), { preconnect: () => undefined })
  expect((await getWeather(city, dir, { now, request: ok })).source).toBe("live")
  expect((await getWeather(city, dir, { now: now + HOUR - 1, request: down })).source).toBe("cache")
  expect((await getWeather(city, dir, { now: now + HOUR, request: down })).source).toBe("stale")
  expect((await getWeather(city, dir, { now: now + 6 * HOUR, offline: true })).source).toBe("clock-only")
  const [file] = await readdir(dir)
  await writeFile(join(dir, file!), "broken")
  expect((await getWeather(city, dir, { now, offline: true })).source).toBe("clock-only")
})

test("malformed, old or future readings are refused", () => {
  expect(() => parseForecast({})).toThrow()
  expect(() => parseForecast({ current: { ...reading.current, cloud_cover: 140 } })).toThrow()
})

test("rain reads as rain and cloud, with the sun and moon from the city's own sunrise", () => {
  const sky = skyOf(now, city, parseForecast(reading))
  expect(sky.rain).toBe(0.5)
  expect(sky.cloud).toBeCloseTo(0.88)
  expect(sky.condition).toBe("Light rain")
  expect(sky.rise).toBeGreaterThan(0)
  expect(sceneOf(sky).starlight).toBeLessThan(0.2)
})

test("with no city and no weather the sky turns at seven, from the clock alone", () => {
  const night = new Date(2026, 10, 19, 23).getTime(), noon = new Date(2026, 10, 19, 12).getTime()
  expect(sceneOf(skyOf(night, undefined, null)).light).toBe(0)
  expect(sceneOf(skyOf(noon, undefined, null)).light).toBe(1)
})

test("every kind of weather Open-Meteo reports has a name and a look", () => {
  const read = (code: number, extra: Partial<typeof reading.current> = {}) => skyOf(now, city, parseForecast({ current: { ...reading.current, weather_code: code, ...extra } }))
  expect(read(95)).toMatchObject({ condition: "Thunderstorm", storm: 0.7 })
  expect(read(99).storm).toBe(1)
  expect(read(86)).toMatchObject({ condition: "Heavy snow showers", showers: 1 })
  expect(read(67).snow).toBeGreaterThan(0)
  expect(read(65).rain).toBeGreaterThan(read(61).rain)
  for (const code of [0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99]) expect(read(code).condition).not.toBe("")
})

test("gusts make whitecaps, a west wind carries rain to the right, and poor visibility is haze", () => {
  const sky = skyOf(now, city, parseForecast({ current: { ...reading.current, wind_speed_10m: 30, wind_gusts_10m: 60, wind_direction_10m: 270, visibility: 2000 } }))
  expect(sky.gust).toBeGreaterThan(0.5)
  expect(sky.drift).toBeGreaterThan(0.5)
  expect(sky.fog).toBeGreaterThan(0.5)
})
