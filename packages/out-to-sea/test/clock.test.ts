import { describe, expect, test } from "bun:test"
import { box, pattern, phaseAt, simple } from "../src/shared/clock"

describe("the breathing clock", () => {
  test("box visits both holds in order and wraps without drift", () => {
    expect([0, 3.999, 4, 8, 12, 15.999, 16, 160].map((s) => phaseAt(s, box()).index)).toEqual([0, 0, 1, 2, 3, 3, 0, 0])
  })
  test("the envelope is full through the first hold and empty through the second", () => {
    expect(phaseAt(4.2, box()).level).toBe(1)
    expect(phaseAt(12.7, box()).level).toBe(0)
    expect(phaseAt(2, box()).level).toBeCloseTo(0.5)
  })
  test("simple and custom skip holds of zero", () => {
    expect(phaseAt(4, simple()).index).toBe(2)
    expect([0, 1.999, 2, 5, 6].map((s) => phaseAt(s, pattern(2, 0, 3, 1)).index)).toEqual([0, 0, 2, 3, 0])
  })
  test("time left in a phase counts down within it", () => {
    expect(phaseAt(1, simple(4, 6)).left).toBeCloseTo(3)
  })
  test("inhale and exhale must be positive; holds may be zero", () => {
    for (const bad of [0, -1, Number.NaN, Infinity]) expect(() => box(bad)).toThrow(RangeError)
    expect(() => pattern(4, -1, 4, 0)).toThrow(RangeError)
    expect(() => phaseAt(Number.NaN, simple())).toThrow(RangeError)
    expect(pattern(4, 0, 4, 0)).toEqual([4, 0, 4, 0])
  })
})
