import { migrate, type Prefs } from "../prefs"

const SYNCED = ["every", "look", "start", "breathing", "sound", "volume", "weather", "clock", "quiet", "quietFrom", "quietTo", "theme", "unit"] as const satisfies readonly (keyof Prefs)[]
type SyncedKey = (typeof SYNCED)[number]

/** Each synced field with the time (ms) it last changed on any device. */
export type Entry = { id: string; name: string; kind: "mac" | "android" | "ios" | "web"; at: number }
export type Doc = { [K in SyncedKey]?: { v: Prefs[K]; t: number } } & { devices?: Record<string, Entry> }

const KINDS: readonly string[] = ["mac", "android", "ios", "web"]
const STALE = 90 * 24 * 3600_000

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** Newest change wins per field; a tie goes to the larger value so every device settles on the same one. */
export const merge = (a: Doc, b: Doc, now = Date.now()): Doc => {
  const pick = (x: { v: unknown; t: number } | undefined, y: typeof x) => (!x || !y ? (x ?? y) : x.t !== y.t ? (x.t > y.t ? x : y) : JSON.stringify(x.v) >= JSON.stringify(y.v) ? x : y)
  const fields = Object.fromEntries(SYNCED.flatMap((k) => { const w = pick(a[k], b[k]); return w ? [[k, w]] : [] })) as Doc
  const all = [...Object.values(a.devices ?? {}), ...Object.values(b.devices ?? {})]
  const newest = new Map<string, Entry>()
  for (const e of all) if (now - e.at < STALE && e.at > (newest.get(e.id)?.at ?? -Infinity)) newest.set(e.id, e)
  return newest.size ? { ...fields, devices: Object.fromEntries([...newest].sort(([x], [y]) => (x < y ? -1 : +(x > y)))) } : fields
}

/** Every synced field at time 1: beats a joining device's untouched time 0, loses to any edit. */
export const seed = (prefs: Prefs): Doc => Object.fromEntries(SYNCED.map((k) => [k, { v: prefs[k], t: 1 }])) as Doc

/** Stamps what changed in `prefs` since `doc` with `now`, never earlier than the value it replaces; a field never seen before gets time 0 so any remote edit beats it. */
export const track = (doc: Doc, prefs: Prefs, now: number): Doc =>
  Object.fromEntries(SYNCED.map((k) => [k, !doc[k] ? { v: prefs[k], t: 0 } : same(doc[k].v, prefs[k]) ? doc[k] : { v: prefs[k], t: Math.max(now, doc[k].t + 1) }])) as Doc

/** The preferences with the synced fields taken from `doc`, checked like any settings file. */
export const apply = (prefs: Prefs, doc: Doc): Prefs => migrate({ ...prefs, ...Object.fromEntries(SYNCED.flatMap((k) => (doc[k] ? [[k, doc[k].v]] : []))) })

export const equal = (a: Doc, b: Doc) => same([...SYNCED.map((k) => a[k]), a.devices ?? {}], [...SYNCED.map((k) => b[k]), b.devices ?? {}])

/** Reads a decrypted document, keeping only synced fields with a finite time. */
export const parse = (text: string): Doc => {
  const raw: Partial<Record<SyncedKey, { v?: unknown; t?: unknown }>> & { devices?: Record<string, Partial<Entry>> } = JSON.parse(text)
  const fields = Object.fromEntries(SYNCED.flatMap((k) => (typeof raw[k]?.t === "number" && Number.isFinite(raw[k].t) && raw[k].v !== undefined ? [[k, { v: raw[k].v, t: raw[k].t }]] : []))) as Doc
  const devices = Object.values(raw.devices ?? {}).filter((e): e is Entry => typeof e.id === "string" && typeof e.name === "string" && KINDS.includes(e.kind ?? "") && Number.isFinite(e.at))
  return devices.length ? { ...fields, devices: Object.fromEntries(devices.map((e) => [e.id, { id: e.id, name: e.name, kind: e.kind, at: e.at }])) } : fields
}
