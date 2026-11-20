import { expect, test } from "bun:test"
import { Reminder } from "../src/shared/reminder"

test("one break at a time; the next counts from the end of this one", () => {
  const r = new Reminder(0, 20_000)
  expect(r.tick(19_999)).toBe("idle")
  expect(r.tick(20_000)).toBe("start")
  expect(r.nextBreakAt).toBeNull()
  expect(r.tick(40_001)).toBe("idle")
  r.finish(44_000)
  expect(r.nextBreakAt).toBe(64_000)
})

test("a tray click and the timer together open one break", () => {
  const r = new Reminder(0)
  expect(r.start(500)).toBe(true)
  expect(r.start(600)).toBe(false)
  r.setInterval(750, 30_000)
  expect(r.nextBreakAt).toBeNull()
  r.finish(900)
  expect(r.nextBreakAt).toBe(30_900)
})

test("a long sleep ends a break and never replays the missed ones", () => {
  const r = new Reminder(0, 20_000)
  r.start(500)
  expect(r.tick(300_000)).toBe("reset")
  expect(r.nextBreakAt).toBe(320_000)
  expect(r.tick(305_000)).toBe("idle")
  expect(r.tick(320_000)).toBe("start")
})

test("a clock set backwards resets; a steady heartbeat keeps a long interval", () => {
  const r = new Reminder(1_000, 120_000, 90_000)
  expect(r.tick(30_000)).toBe("idle")
  expect(r.tick(29_500)).toBe("reset")
  expect(r.tick(80_000)).toBe("idle")
  expect(r.tick(149_500)).toBe("start")
})

test("a pause pushes the next break back without changing the interval", () => {
  const r = new Reminder(0, 20_000)
  r.postpone(1_000, 3_600_000)
  expect(r.nextBreakAt).toBe(3_620_000)
})

test("an invalid interval keeps the deadline", () => {
  const r = new Reminder(0)
  expect(() => r.setInterval(600, Number.NaN)).toThrow(RangeError)
  expect(r.nextBreakAt).toBe(1_200_000)
})
