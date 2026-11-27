import { describe, expect, test } from "bun:test"
import { Core } from "../src/shared/core"

const MIN = 60_000
const make = (quiet?: { from: number; to: number }, start = new Date(2026, 0, 1, 12).getTime()) => {
  const t = { now: start }
  const log: string[] = []
  const core = new Core({
    now: () => t.now,
    interval: () => 20 * MIN,
    prefs: () => ({ every: 20, quiet: !!quiet, quietFrom: quiet?.from ?? 22, quietTo: quiet?.to ?? 7 }),
    open: () => void log.push("open"),
    close: () => void log.push("close"),
    push: () => void log.push("push"),
  })
  const run = (ms: number) => {
    const end = t.now + ms
    while (t.now < end) {
      t.now += 5_000
      core.tick()
    }
  }
  return { t, log, core, run }
}

describe("core", () => {
  test("opens a break when the interval is up", () => {
    const { core, log, run } = make()
    run(19 * MIN)
    expect(log).toEqual([])
    run(2 * MIN)
    expect(log).toEqual(["open"])
    expect(core.state().next).toBeNull()
  })

  test("snooze brings the break back in five minutes", () => {
    const { t, core, run } = make()
    run(21 * MIN)
    core.snooze()
    expect(core.state().next).toBe(t.now + 5 * MIN)
  })

  test("skip moves the coming break a whole interval on", () => {
    const { t, core } = make()
    const at = core.state().next!
    core.skip()
    expect(core.state().next).toBe(at + 20 * MIN)
    expect(t.now).toBeLessThan(at)
  })

  test("pause holds breaks until it ends, resume restores the interval", () => {
    const { t, core, log, run } = make()
    core.pause(60 * MIN)
    expect(core.state().paused).toBe(t.now + 60 * MIN)
    run(59 * MIN)
    expect(log).not.toContain("open")
    run(22 * MIN)
    expect(log).toContain("open")
    expect(core.state().paused).toBe(0)
    core.finish()
    core.pause(0)
    expect(core.state().next).toBe(t.now + 20 * MIN)
  })

  test("a break due in quiet hours waits for their end, across midnight", () => {
    const { t, core, log, run } = make({ from: 22, to: 7 }, new Date(2026, 0, 1, 21, 50).getTime())
    run(25 * MIN)
    expect(log).toEqual([])
    expect(core.state().quiet).toBe(new Date(2026, 0, 2, 7).getTime())
    expect(core.state().next).toBe(new Date(2026, 0, 2, 7).getTime())
    run(new Date(2026, 0, 2, 7, 1).getTime() - t.now)
    expect(log).toEqual(["open"])
  })

  test("a long gap closes the break and starts over", () => {
    const { t, core, log } = make()
    t.now += 3 * 60 * MIN
    core.tick()
    expect(log).toEqual(["close"])
    expect(core.state().next).toBe(t.now + 20 * MIN)
  })

  test("upcoming lists break times and holds those in quiet hours", () => {
    const { t, core } = make({ from: 22, to: 7 }, new Date(2026, 0, 1, 21, 0).getTime())
    const first = t.now + 20 * MIN
    expect(core.upcoming(2)).toEqual([first, first + 20 * MIN])
    const [a, b, c, d] = core.upcoming(4)
    expect([a, b]).toEqual([first, first + 20 * MIN])
    expect(c).toBe(new Date(2026, 0, 2, 7).getTime())
    expect(d).toBe(c! + 20 * MIN)
  })
})
