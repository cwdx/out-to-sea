import { expect, test } from "bun:test"
import { strikeAt } from "../src/shared/storm"

test("no storm, no lightning", () => {
  for (let t = 0; t < 120; t += 0.5) expect(strikeAt(t, 0, 23).flash).toBe(0)
})

test("a storm strikes now and then, the same way every time, with thunder one to three seconds after", () => {
  const flashes = Array.from({ length: 2400 }, (_, i) => ({ t: i * 0.05, ...strikeAt(i * 0.05, 1, 23) })).filter((s) => s.flash > 0.8)
  expect(flashes.length).toBeGreaterThan(0)
  expect(strikeAt(14.55, 1, 23)).toEqual(strikeAt(14.55, 1, 23))
  for (const s of flashes) {
    const struck = s.t - s.since
    expect(s.thunderAt - struck).toBeGreaterThanOrEqual(1)
    expect(s.thunderAt - struck).toBeLessThanOrEqual(3)
    expect(s.x).toBeGreaterThanOrEqual(0.45)
    expect(s.x).toBeLessThanOrEqual(0.85)
  }
})
