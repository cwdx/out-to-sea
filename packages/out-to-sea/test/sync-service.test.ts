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
  }
}

let clock = 1_000_000
const device = (relays: Relay[], loads = { n: 0 }, start?: Saved, name = "Chrome on Mac") => {
  const syncs = { n: 0 }
  let saved = start
  let prefs: Prefs = { ...DEFAULTS }
  const service = syncService({
    store: { get: async () => saved, set: async (s) => void (saved = s), clear: async () => void (saved = undefined) },
    prefs: () => prefs,
    apply: (p) => void (prefs = p),
    synced: () => void syncs.n++,
    device: { name, kind: "web" },
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
  expect(a.service.state()).toEqual({ on: false, at: 0, devices: [] })
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
  expect(offer.words?.split(" ")).toHaveLength(6)
  const b = device(relays)
  expect(await b.service.join(offer.link)).toBe(true)
  const c = device(relays)
  expect(await c.service.join((await a.service.offer())!.words!)).toBe(true)
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
  expect(a.store()?.secret).toBeFalsy()
  expect(a.service.state()).toEqual({ on: false, at: 0, devices: [] })
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
  expect(down.service.state()).toEqual({ on: true, at: 0, devices: expect.any(Array) })
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

test("joining keeps the existing device's customised values", async () => {
  const relays = [fake()]
  const a = device(relays)
  a.set({ every: 1, theme: "dark" })
  await a.service.on()
  const b = device(relays)
  expect(await b.service.join((await a.service.offer())!.link)).toBe(true)
  await b.service.open()
  await a.service.focus()
  expect(b.prefs().every).toBe(1)
  expect(b.prefs().theme).toBe("dark")
  expect(a.prefs().every).toBe(1)
})

test("offer still returns the link when no relay takes the pairing event", async () => {
  const relay = { ...fake(), publish: async () => { throw new Error("no") } }
  const a = device([relay])
  await a.service.on()
  const offer = await a.service.offer()
  expect(offer?.link).toContain("#")
  expect(offer?.words).toBeUndefined()
})

test("linked devices list each other and themselves, newest first with this device first", async () => {
  const relays = [fake()]
  const a = device(relays, { n: 0 }, undefined, "Mac app")
  await a.service.on()
  const b = device(relays, { n: 0 }, undefined, "Android app")
  await b.service.join((await a.service.offer())!.link)
  await b.service.open()
  await a.service.focus()
  expect(a.service.state().devices.map((d) => [d.name, d.self])).toEqual([["Mac app", true], ["Android app", false]])
  expect(b.service.state().devices.map((d) => [d.name, d.self])).toEqual([["Android app", true], ["Mac app", false]])
  expect(a.service.state().devices.map((d) => d.id)).toEqual(b.service.state().devices.map((d) => d.id).reverse())
})

test("a refresh within a few minutes does not republish; a later one does", async () => {
  const relay = fake()
  let published = 0
  const counted = { ...relay, publish: async (e: NostrEvent) => (published++, relay.publish(e)) }
  const a = device([counted])
  await a.service.on()
  const first = published
  await a.service.focus()
  expect(published).toBe(first)
  clock += 10 * 60_000
  await a.service.focus()
  expect(published).toBe(first + 1)
})

test("a device not seen for 90 days drops out of the list", async () => {
  const relays = [fake()]
  const a = device(relays, { n: 0 }, undefined, "Mac app")
  await a.service.on()
  const b = device(relays, { n: 0 }, undefined, "Old phone")
  await b.service.join((await a.service.offer())!.link)
  await b.service.open()
  await a.service.focus()
  expect(a.service.state().devices).toHaveLength(2)
  clock += 91 * 24 * 3600_000
  await a.service.focus()
  expect(a.service.state().devices.map((d) => d.name)).toEqual(["Mac app"])
})

test("the exposed state never holds the secret", async () => {
  const a = device([fake()])
  await a.service.on()
  expect(JSON.stringify(a.service.state())).not.toContain(a.store()!.secret)
})

test("two linked devices stay quiet: focusing and opening publish nothing", async () => {
  const relay = fake()
  let published = 0
  const counted = { ...relay, publish: async (e: NostrEvent) => (published++, relay.publish(e)) }
  const a = device([counted], { n: 0 }, undefined, "Mac app")
  await a.service.on()
  const b = device([counted], { n: 0 }, undefined, "Android app")
  await b.service.join((await a.service.offer())!.link)
  await b.service.focus()
  await a.service.focus()
  const settled = published
  for (let i = 0; i < 5; i++) {
    await a.service.focus()
    await b.service.open()
  }
  expect(published).toBe(settled)
})

test("a join answers once the secret is saved, even when no relay ever answers", async () => {
  const hung: Relay = { publish: () => new Promise(() => {}), query: () => new Promise(() => {}) }
  const a = device([fake()])
  await a.service.on()
  const link = (await a.service.offer())!.link
  const b = device([hung])
  expect(await b.service.join(link)).toBe(true)
  expect(b.service.state().on).toBe(true)
  const { secret } = b.store()!
  expect(await b.service.join(link)).toBe(true)
  expect(await b.service.join("not a code")).toBe(false)
  const other = device([fake()])
  await other.service.on()
  expect(await b.service.join((await other.service.offer())!.link)).toBe(false)
  expect(b.store()?.secret).toBe(secret)
})

test("a device that leaves and rejoins keeps its entry in the list", async () => {
  const relays = [fake()]
  const a = device(relays, { n: 0 }, undefined, "Mac app")
  await a.service.on()
  const link = (await a.service.offer())!.link
  const b = device(relays, { n: 0 }, undefined, "Android app")
  await b.service.join(link)
  await b.service.open()
  const id = b.store()!.id
  await b.service.off()
  expect(b.service.state().on).toBe(false)
  expect(b.store()?.secret).toBeFalsy()
  expect(await b.service.join(link)).toBe(true)
  await b.service.open()
  await a.service.focus()
  expect(b.store()!.id).toBe(id)
  expect(a.service.state().devices).toHaveLength(2)
})

test("after a reload sync shows on at once, not after the first sync has finished", async () => {
  const hung: Relay = { publish: () => new Promise(() => {}), query: () => new Promise(() => {}) }
  const a = device([fake()])
  await a.service.on()
  const b = device([hung], { n: 0 }, a.store())
  void b.service.open()
  await new Promise((r) => setTimeout(r, 20))
  expect(b.service.state().on).toBe(true)
  expect(b.syncs.n).toBeGreaterThan(0)
})
