import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { headlessSea } from "../scripts/headless-sea"
import { FIXTURES } from "../src/shared/fixtures"
import { seaParams } from "../src/shared/sea-params"
import { sceneOf } from "../src/shared/sky"

// skipped where there's no GPU, as on a CI runner
const W = 320, H = 200
let sea: Awaited<ReturnType<typeof headlessSea>> | undefined
const render = async (p: ReturnType<typeof seaParams>) => {
  sea!.draw(p)
  return sea!.read()
}
beforeAll(async () => {
  sea = await headlessSea(W, H).catch(() => undefined)
})
afterAll(() => sea?.dispose())

const night = sceneOf(FIXTURES.night)
const at = (t: number, extra: Partial<Parameters<typeof seaParams>[1]> = {}) => seaParams(night, { width: W, height: H, t, seed: 23, ...extra })
const changed = (a: Uint8Array, b: Uint8Array, from = 0, to = 1) => {
  let n = 0
  for (let y = Math.floor(from * H); y < Math.floor(to * H); y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      if (Math.abs(a[i]! - b[i]!) + Math.abs(a[i + 1]! - b[i + 1]!) + Math.abs(a[i + 2]! - b[i + 2]!) > 12) n++
    }
  return n
}

describe.skipIf(!process.env.CI ? false : true)("the sea on the GPU", () => {
  test("the same time and seed draw the same picture", async () => {
    if (!sea) return
    expect(changed(await render(at(12)), await render(at(12)))).toBe(0)
  })
  test("the water moves over half a second, and the sky stays nearly still", async () => {
    if (!sea) return
    const a = await render(at(12)), b = await render(at(12.5))
    expect(changed(a, b, 0.6, 1)).toBeGreaterThan(W * H * 0.01)
    expect(changed(a, b, 0, 0.3)).toBeLessThan(changed(a, b, 0.6, 1))
  })
  test("a ripple travels outward: its rings sit in different places a second apart", async () => {
    if (!sea) return
    const none = await render(at(12)), young = await render(at(12, { ripples: [0.5] })), older = await render(at(12, { ripples: [1.5] }))
    expect(changed(none, young, 0.6, 0.9)).toBeGreaterThan(50)
    expect(changed(young, older, 0.6, 0.9)).toBeGreaterThan(50)
  })
  test("the fade takes the whole scene to nothing", async () => {
    if (!sea) return
    const gone = await render(at(12, { fade: 0 }))
    expect(gone.every((v) => v === 0)).toBe(true)
  })
})
