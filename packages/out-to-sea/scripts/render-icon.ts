/** Renders the icon with the sea shaders: assets/icon.png, icon.iconset and the web app's icons, the Android launcher icons and the iOS app icon. Usage: bun scripts/render-icon.ts */
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

// the adaptive foreground is the full square: the launcher masks the outer third, and the moon and boat sit inside what stays
const res = at("android/app/src/main/res")
const DENSITY = { mdpi: [48, 108], hdpi: [72, 162], xhdpi: [96, 216], xxhdpi: [144, 324], xxxhdpi: [192, 432] }
for (const [density, [icon, foreground]] of Object.entries(DENSITY)) {
  const dir = join(res, `mipmap-${density}`)
  const out = `${icon}x${icon}`
  magick(square, "-resize", out, join(dir, "ic_launcher.png"))
  magick(square, "-resize", out, "(", "-size", out, "xc:black", "-fill", "white", "-draw", `circle ${icon / 2},${icon / 2} ${icon / 2},0`, ")", "-alpha", "off", "-compose", "CopyOpacity", "-composite", join(dir, "ic_launcher_round.png"))
  magick(square, "-resize", `${foreground}x${foreground}`, join(dir, "ic_launcher_foreground.png"))
}
// iOS rounds the app icon itself and rejects alpha
magick(square, "-resize", `${FULL}x${FULL}`, "-alpha", "off", at("ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"))
execFileSync("rm", [raw, square])
console.log(`icon drawn: assets/icon.png, icon.iconset, src/views/public, android mipmaps, ios AppIcon (tile inset ${margin}px)`)
