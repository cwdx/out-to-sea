import { expect, test } from "bun:test"
import { DEFAULTS, type Prefs } from "../src/shared/prefs"
import { syncService, type Saved } from "../src/shared/sync-service"
import type { Filter, NostrEvent } from "../src/shared/sync/nostr"
import type { Relay } from "../src/shared/sync/relay"

const fake = (down = false): Relay => {
  const events: NostrEvent[] = []
  const key = (e: NostrEvent) => e.pubkey + e.kind + e.tags.find((t) => t[0] === "d")?.[1]
  return {
    publish: async (e) => {
      const i = events.findIndex((o) => key(o) === key(e))
      if (i < 0) events.push(e)
      else if (events[i]!.created_at <= e.created_at) events[i] = e
    },
    query: async (f: Filter) => {
      if (down) throw new Error("down")
      return events.filter((e) => f.authors?.includes(e.pubkey) !== false && e.kind === f.kinds?.[0] && e.tags.some((t) => t[0] === "d" && f["#d"]?.includes(t[1]!)))
    },
    subscribe: () => () => {},
  }
}

let clock = 1_000_000
const device = (relays: Relay[], loads = { n: 0 }, start?: Saved) => {
  const syncs = { n: 0 }
  let saved = start
  let prefs: Prefs = { ...DEFAULTS }
  const service = syncService({
    store: { get: async () => saved, set: async (s) => void (saved = s), clear: async () => void (saved = undefined) },
    prefs: () => prefs,
    apply: (p) => void (prefs = p),
    synced: () => void syncs.n++,
    base: "https://sea.example/",
    now: () => (clock += 1000),
    relays,
    delay: 5,
    load: () => (loads.n++, import("../src/shared/sync")),
  })
  return { service, loads, syncs, store: () => saved, prefs: () => prefs, set: (p: Partial<Prefs>) => void (prefs = { ...prefs, ...p }) }
}

test("sync stays off and loads nothing until switched on", async () => {
  const a = device([fake()])
  await a.service.open()
  a.service.focus()
  a.service.changed()
  expect(a.service.state()).toEqual({ on: false, at: 0 })
  expect(a.loads.n).toBe(0)
  await a.service.on()
  expect(a.loads.n).toBe(1)
  expect(a.service.state().on).toBe(true)
})

test("a stored secret loads the engine on open", async () => {
  const a = device([fake()])
  await a.service.on()
  const b = device([fake()], { n: 0 }, a.store())
  await b.service.open()
  expect(b.loads.n).toBe(1)
  expect(b.service.state().on).toBe(true)
})

test("two devices converge on a changed field, joined by link and by words", async () => {
  const relays = [fake(), fake()]
  const a = device(relays)
  await a.service.on()
  const offer = (await a.service.offer())!
  expect(offer.words.split(" ")).toHaveLength(6)
  const b = device(relays)
  expect(await b.service.join(offer.link)).toBe(true)
  const c = device(relays)
  expect(await c.service.join((await a.service.offer())!.words)).toBe(true)
  expect(await device(relays).service.join("not a code")).toBe(false)
  a.set({ every: 7 })
  a.service.changed()
  await new Promise((r) => setTimeout(r, 30))
  await b.service.focus()
  await c.service.open()
  expect(b.prefs().every).toBe(7)
  expect(c.prefs().every).toBe(7)
  expect(b.service.state().at).toBeGreaterThan(0)
})

test("off forgets the secret", async () => {
  const a = device([fake()])
  await a.service.on()
  await a.service.off()
  expect(a.store()).toBeUndefined()
  expect(a.service.state()).toEqual({ on: false, at: 0 })
})

test("a relay that is down leaves the last sync time and throws nothing", async () => {
  const relay = fake()
  const a = device([relay])
  await a.service.on()
  const at = a.service.state().at
  expect(at).toBeGreaterThan(0)
  const down = device([fake(true)])
  await down.service.on()
  await down.service.focus()
  expect(down.service.state()).toEqual({ on: true, at: 0 })
})

test("the host hears after every sync attempt, including a debounced change and a failing relay", async () => {
  const a = device([fake()])
  await a.service.on()
  const after = a.syncs.n
  a.service.changed()
  await new Promise((r) => setTimeout(r, 30))
  expect(a.syncs.n).toBe(after + 1)
  const down = device([fake(true)])
  await down.service.on()
  expect(down.syncs.n).toBe(1)
})
