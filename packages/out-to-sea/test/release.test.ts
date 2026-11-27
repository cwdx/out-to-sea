import { expect, test } from "bun:test"
import { isNewer } from "../src/shared/release"

test("versions compare by number, not text", () => {
  expect(isNewer("v0.4.10", "0.4.9")).toBe(true)
  expect(isNewer("v1.0.0", "0.9.9")).toBe(true)
  expect(isNewer("0.4.2", "0.4.2")).toBe(false)
  expect(isNewer("v0.4.1", "0.4.2")).toBe(false)
  expect(isNewer("nightly", "0.4.2")).toBe(false)
  expect(isNewer("v0.4", "0.4.2")).toBe(false)
})
