import { mock, expect, test } from "bun:test"

mock.module("../src/views/router", () => ({ router: {} }))
const { plan } = await import("../src/views/shared/native-host")

const times = Array.from({ length: 48 }, (_, i) => 1_000_000 + i * 60_000)

test("the plan is the next 48 break times, numbered from 1", () => {
  const list = plan({ upcoming: (n) => times.slice(0, n) }, true)
  expect(list).toHaveLength(48)
  expect(list[0]).toMatchObject({ id: 1, schedule: { at: new Date(times[0]!) } })
  expect(list.at(-1)!.id).toBe(48)
})

test("nothing is planned with notifications off", () => {
  expect(plan({ upcoming: () => times }, false)).toEqual([])
})
