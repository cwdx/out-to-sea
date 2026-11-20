/** One PNG per sky, a labelled sheet and GPU timings. Usage: bun scripts/render-sea.ts [outDir] [width] [height]; STRIKE=<seconds> times the storm's strike */
import { execFileSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { FIXTURES, type Fixture } from "../src/shared/fixtures"
import { seaParams } from "../src/shared/sea-params"
import { sceneOf } from "../src/shared/sky"
import { headlessSea } from "./headless-sea"

const [out = "captures", width = "1586", height = "992"] = process.argv.slice(2)
const W = Number(width), H = Number(height)
mkdirSync(out, { recursive: true })
const sea = await headlessSea(W, H)
let params = seaParams(sceneOf(FIXTURES.night), { width: W, height: H, t: 12, seed: 23 })
const draw = () => sea.draw(params)
// waiting on a readback is the only sync vgpu/node offers, so its own cost is measured and taken off
const sync = () => sea.read()

const time = async () => {
  draw()
  await sync()
  let start = performance.now()
  await sync()
  const read = performance.now() - start
  start = performance.now()
  for (let i = 0; i < 10; i++) draw()
  await sync()
  return Math.max(0, (performance.now() - start - read) / 10)
}

const shots: [string, Fixture, { t?: number; level?: number; ripples?: number[] }][] = [
  ["night-gaze", "night", {}], ["sunset-choice", "sunset", {}], ["rain-breathing", "rain", { level: 0.35, ripples: [1.2, 6.2, 11.2] }], ["day", "day", {}],
  ["dawn", "dawn", {}], ["dusk", "dusk", {}], ["cloud", "cloud", {}], ["snow", "snow", {}], ["fog", "fog", {}], ["drizzle", "drizzle", {}], ["downpour", "downpour", {}],
  ["showers", "showers", {}], ["sleet", "sleet", {}], ["storm", "storm", {}], ["storm-strike", "storm", { t: Number(process.env.STRIKE ?? 14.55) }],
]
const tiles: string[] = []
for (const [name, fixture, extra] of shots) {
  params = seaParams(sceneOf(FIXTURES[fixture]), { width: W, height: H, t: 12, seed: 23, ...extra })
  const ms = await time()
  const pixels = await sea.read()
  const raw = join(out, `${name}.rgba`)
  writeFileSync(raw, pixels)
  execFileSync("magick", ["-size", `${W}x${H}`, "-depth", "8", `rgba:${raw}`, join(out, `${name}.png`)])
  execFileSync("rm", [raw])
  const tile = join(out, `.tile-${name}.png`)
  execFileSync("magick", [join(out, `${name}.png`), "-resize", "640x", "-font", "/System/Library/Fonts/Avenir Next.ttc", "-pointsize", "20", "-fill", "white", "-undercolor", "#0008", "-gravity", "northwest", "-annotate", "+10+8", ` ${name}  ${ms.toFixed(1)} ms `, tile])
  tiles.push(tile)
  console.log(`${name.padEnd(16)} ${ms.toFixed(2).padStart(6)} ms`)
}
const rows = Array.from({ length: Math.ceil(tiles.length / 3) }, (_, i) => ["(", ...tiles.slice(i * 3, i * 3 + 3), "+append", ")"]).flat()
execFileSync("magick", [...rows, "-background", "#111", "-append", join(out, "sheet.png")])
execFileSync("rm", tiles)
sea.dispose()
console.log(`${shots.length} captures and sheet.png in ${out} at ${W}×${H}`)
