import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { City } from "../shared/prefs"
import { readWeather, type Weather } from "../shared/weather"

export { cityOfZone, parseForecast, skyOf, type Weather } from "../shared/weather"

export const getWeather = (city: City, cacheDir: string, options?: { now?: number; offline?: boolean; request?: typeof fetch }): Promise<Weather> =>
  readWeather(
    city,
    {
      read: async (key) => JSON.parse(await readFile(join(cacheDir, `${key}.json`), "utf8")),
      write: async (key, value) => {
        const path = join(cacheDir, `${key}.json`), temporary = `${path}.${crypto.randomUUID()}.tmp`
        try {
          await mkdir(cacheDir, { recursive: true })
          await writeFile(temporary, JSON.stringify(value), { flag: "wx" })
          await rename(temporary, path)
        } finally {
          await rm(temporary, { force: true }).catch(() => undefined)
        }
      },
    },
    options,
  )
