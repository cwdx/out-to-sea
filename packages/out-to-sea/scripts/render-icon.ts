/** Renders the icon with the sea shaders: assets/icon.png, icon.iconset and the web app's icons. Usage: bun scripts/render-icon.ts */
import { execFileSync } from "node:child_process"
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { FIXTURES } from "../src/shared/fixtures"
import { seaParams } from "../src/shared/sea-params"
import { sceneOf } from "../src/shared/sky"
import { headlessSea } from "./headless-sea"

// the tile macOS draws an icon in: 824 of the 1024 square, its corners rounded by 185
const FULL = 1024, TILE = 824, RADIUS = 185
const at = (p: string) => join(import.meta.dir, "..", p)
const magick = (...args: string[]) => execFileSync("magick", args)

const sea = await headlessSea(TILE, TILE)
const night = sceneOf({ ...FIXTURES.night, cloud: 0.12, wind: 0.15 })
sea.draw({ ...seaParams({ ...night, moon: 0.5, orb: { x: 0.5, y: 0.27 } }, { width: TILE, height: TILE, t: 12, seed: 23, pulse: 0.35 }), orb: [0.5, 0.27, 0.105, 0] })
const raw = at("assets/.icon.rgba"), square = at("assets/.icon-square.png")
writeFileSync(raw, await sea.read())
magick("-size", `${TILE}x${TILE}`, "-depth", "8", `rgba:${raw}`, "-alpha", "off", square)
sea.dispose()

const margin = (FULL - TILE) / 2
magick(square, "(", "-size", `${TILE}x${TILE}`, "xc:black", "-fill", "white", "-draw", `roundrectangle 0,0 ${TILE - 1},${TILE - 1} ${RADIUS},${RADIUS}`, ")", "-alpha", "off", "-compose", "CopyOpacity", "-composite", "-compose", "Over", "-background", "none", "-gravity", "center", "-extent", `${FULL}x${FULL}`, at("assets/icon.png"))
for (const size of [16, 32, 128, 256, 512]) {
  magick(at("assets/icon.png"), "-resize", `${size}x${size}`, at(`icon.iconset/icon_${size}x${size}.png`))
  magick(at("assets/icon.png"), "-resize", `${size * 2}x${size * 2}`, at(`icon.iconset/icon_${size}x${size}@2x.png`))
}
// a browser masks the icon itself, so the web app's are the full square
for (const [name, size] of [["icon-192", 192], ["icon-512", 512], ["apple-touch-icon", 180]] as const) magick(square, "-resize", `${size}x${size}`, at(`src/views/public/${name}.png`))
execFileSync("rm", [raw, square])
console.log(`icon drawn: assets/icon.png, icon.iconset, src/views/public (tile inset ${margin}px)`)
