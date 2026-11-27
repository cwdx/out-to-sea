import { expect, test } from "bun:test"
import { schnorr } from "@noble/curves/secp256k1.js"
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js"
import { DEFAULTS } from "../src/shared/prefs"
import { apply, track, type Doc } from "../src/shared/sync"
import { contentKey, decrypt, encrypt } from "../src/shared/sync/crypto"
import { sync } from "../src/shared/sync/engine"
import { idOf, KIND, newSecret, pubkeyOf, sign, verify, type Filter, type NostrEvent } from "../src/shared/sync/nostr"
import { claim, linkOf, offer, PAIR_TTL, secretOfLink } from "../src/shared/sync/pair"
import { wsRelay, type Relay } from "../src/shared/sync/relay"

/** In-memory relay with NIP-33 replacement; `drop` makes it acknowledge writes it never keeps. */
const fake = (drop = false): Relay & { events: NostrEvent[] } => {
  const events: NostrEvent[] = []
  const key = (e: NostrEvent) => e.pubkey + e.kind + e.tags.find((t) => t[0] === "d")?.[1]
  return {
    events,
    publish: async (e) => {
      if (drop) return
      const i = events.findIndex((o) => key(o) === key(e))
      if (i < 0) events.push(e)
      else if (events[i]!.created_at <= e.created_at) events[i] = e
    },
    query: async (f: Filter) => events.filter((e) => f.authors?.includes(e.pubkey) !== false && e.kind === f.kinds?.[0] && e.tags.some((t) => t[0] === "d" && f["#d"]?.includes(t[1]!))),
  }
}

const secret = newSecret()
const doc = (t: number, over: Doc = {}): Doc => ({ every: { v: 20, t }, look: { v: 20, t }, ...over })

test("event id is sha256 of the NIP-01 array", () => {
  const e = { pubkey: "a", created_at: 1, kind: 1, tags: [], content: "x" }
  expect(idOf(e)).toBe("a9c366fe651827a7e7cf1f2386f12e2d05712e984b4f35497ef2ed7677d25c90")
})

test("BIP-340 vectors", () => {
  const sk = "0000000000000000000000000000000000000000000000000000000000000003"
  const pk = "f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9"
  const msg = hexToBytes("0000000000000000000000000000000000000000000000000000000000000000")
  const sig = "e907831f80848d1069a5371b402410364bdf1c5f8307b0084c55f1ce2dca821525f66a4a85ea8b71e482a74f382d2ce5ebeee8fdb2172f477df4900d310536c0"
  expect(pubkeyOf(sk)).toBe(pk)
  expect(bytesToHex(schnorr.sign(msg, hexToBytes(sk), new Uint8Array(32)))).toBe(sig)
  expect(schnorr.verify(hexToBytes(sig), msg, hexToBytes(pk))).toBe(true)
  const m4 = hexToBytes("4df3c3f68fcc83b27e9d42c90431a72499f17875c81a599b566c9889b9696703")
  const s4 = "00000000000000000000003b78ce563f89a0ed9414f5aa28ad0d96d6795f9c6376afb1548af603b3eb45c9f8207dee1060cb71c04e80f593060b07d28308d7f4"
  expect(schnorr.verify(hexToBytes(s4), m4, hexToBytes("d69c3509bb99e412e68b0fe8544e72837dfa30746d8be2aa65975f29d22dc7b9"))).toBe(true)
  const s7 = "6cff5c3ba86c69ea4b7376f31a9bcb4f74c1976089b2d9963da2e5543e177769961764b3aa9b2ffcb6ef947b6887a226e8d7c93e00c5ed0c1834ff0d0c2e6da6"
  expect(schnorr.verify(hexToBytes(s7), hexToBytes("243f6a8885a308d313198a2e03707344a4093822299f31d0082efa98ec4e6c89"), hexToBytes("dff1d77f2a671c5f36183726db2341be58feae1da2deced843240f7b502ba659"))).toBe(false)
})

test("signed events verify and tampering is rejected", () => {
  const e = sign(secret, { created_at: 5, kind: KIND, tags: [], content: "hi" })
  expect(verify(e)).toBe(true)
  expect(verify({ ...e, content: "ho" })).toBe(false)
  expect(verify({ ...e, sig: sign(newSecret(), e).sig })).toBe(false)
  expect(verify({ ...e, sig: "zz" })).toBe(false)
})

test("a wrong secret cannot decrypt", async () => {
  const sealed = await encrypt(contentKey(secret), "hello")
  expect(await decrypt(contentKey(secret), sealed)).toBe("hello")
  expect(decrypt(contentKey(newSecret()), sealed)).rejects.toThrow()
})

test("newest change wins per field and different fields both survive", async () => {
  const relays = [fake(), fake()]
  const a = doc(100, { volume: { v: 10, t: 300 }, theme: { v: "dark", t: 100 } })
  const b = doc(100, { volume: { v: 90, t: 200 }, unit: { v: "f", t: 250 } })
  await sync(relays, secret, a, 1000)
  const got = await sync(relays, secret, b, 2000)
  expect(got.volume?.v).toBe(10)
  expect(got.theme?.v).toBe("dark")
  expect(got.unit?.v).toBe("f")
  expect((await sync(relays, secret, a, 3000)).unit?.v).toBe("f")
})

test("a relay that drops events is healed by another and by the next sync", async () => {
  const bad = fake(true), good = fake()
  await sync([bad, good], secret, doc(100, { volume: { v: 5, t: 100 } }), 1000)
  expect(bad.events).toHaveLength(0)
  expect((await sync([bad, good], secret, doc(0), 2000)).volume?.v).toBe(5)
  const fresh = fake()
  expect((await sync([bad, good, fresh], secret, doc(0), 3000)).volume?.v).toBe(5)
  expect(fresh.events).toHaveLength(1)
})

test("a forged event is ignored and replaced", async () => {
  const relay = fake()
  const forged = sign(newSecret(), { created_at: 1, kind: KIND, tags: [["d", "outtosea-prefs"]], content: "00" })
  relay.events.push({ ...forged, pubkey: pubkeyOf(secret) })
  const good = await sync([relay], secret, doc(100), 1000)
  expect(good.every?.v).toBe(20)
  expect(relay.events.map((e) => e.pubkey)).toEqual([pubkeyOf(secret)])
})

test("track stamps only what changed and apply writes synced fields back", () => {
  const d = track({}, DEFAULTS, 50)
  expect(d.every?.t).toBe(0)
  const next = { ...DEFAULTS, volume: 7, breathing: [4, 0, 4, 0] as [number, number, number, number], windowed: true }
  const t = track(d, next, 99)
  expect(t.volume?.t).toBe(99)
  expect(t.breathing?.t).toBe(99)
  expect(t.every?.t).toBe(0)
  expect(t).not.toHaveProperty("windowed")
  expect(apply(DEFAULTS, t).volume).toBe(7)
  expect(apply({ ...DEFAULTS, windowed: true }, t).windowed).toBe(true)
})

test("pairing by code gives the secret once, within ten minutes", async () => {
  const relays = [fake(), fake(true)]
  const words = await offer(relays, secret, 1_000_000)
  expect(words.split(" ")).toHaveLength(6)
  expect(await claim(relays, words, 1_000_000 + 60_000)).toBe(secret)
  expect(await claim(relays, words, 1_000_000 + 61_000)).toBeUndefined()
})

test("an expired or wrong code gives nothing", async () => {
  const relays = [fake()]
  const words = await offer(relays, secret, 0)
  expect(await claim(relays, words, (PAIR_TTL + 1) * 1000)).toBeUndefined()
  expect(await claim(relays, "abandon ability able about above absent", 1000)).toBeUndefined()
})

test("the link carries the secret in the fragment", () => {
  expect(secretOfLink(linkOf("https://sea.cwdx.md/", secret))).toBe(secret)
  expect(secretOfLink("https://sea.cwdx.md/#nope")).toBeUndefined()
})

test("a changed field is stamped after the value it replaces even when the clock is behind", () => {
  const t = track({ every: { v: DEFAULTS.every, t: 1000 } }, { ...DEFAULTS, every: DEFAULTS.every + 1 }, 500)
  expect(t.every?.t).toBe(1001)
})

test("a replayed pairing event signed by another key is not trusted", async () => {
  const relay = fake()
  const words = await offer([relay], secret, 1_000_000)
  const replay = sign(newSecret(), { created_at: relay.events[0]!.created_at, kind: KIND, tags: relay.events[0]!.tags, content: relay.events[0]!.content })
  const seen: Filter[] = []
  const hostile: Relay = { publish: async () => {}, query: async (f) => (seen.push(f), [replay]) }
  expect(await claim([hostile], words, 1_000_000)).toBeUndefined()
  expect(seen[0]?.authors).toHaveLength(1)
})

test("a relay that is down is not written to", async () => {
  const good = fake()
  let writes = 0
  const down: Relay = { publish: async () => void writes++, query: async () => { throw new Error("down") } }
  await sync([good], secret, doc(100), 1000)
  await sync([down, good], secret, doc(100), 2000)
  expect(writes).toBe(0)
})

test("a relay answering garbage frames still answers the query, one event at most", async () => {
  const real = globalThis.WebSocket
  const sent: string[] = []
  globalThis.WebSocket = class {
    onopen?: () => void
    onmessage?: (m: { data: string }) => void
    constructor() { queueMicrotask(() => { this.onopen?.() }) }
    send(f: string) { sent.push(f); this.onmessage?.({ data: "not json" }); this.onmessage?.({ data: "[\"EOSE\",\"q\"]" }) }
    close() {}
  } as unknown as typeof WebSocket
  try {
    expect(await wsRelay("wss://x").query({ kinds: [KIND] })).toEqual([])
    expect(JSON.parse(sent[0]!)[2].limit).toBe(1)
  } finally {
    globalThis.WebSocket = real
  }
})
