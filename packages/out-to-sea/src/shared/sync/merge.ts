import { migrate, type Prefs } from "../prefs"

const SYNCED = ["every", "look", "start", "breathing", "sound", "volume", "weather", "clock", "quiet", "quietFrom", "quietTo", "theme", "unit"] as const satisfies readonly (keyof Prefs)[]
type SyncedKey = (typeof SYNCED)[number]

/** Each synced field with the time (ms) it last changed on any device. */
export type Doc = { [K in SyncedKey]?: { v: Prefs[K]; t: number } }

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** Newest change wins per field; a tie goes to the larger value so every device settles on the same one. */
export const merge = (a: Doc, b: Doc): Doc => {
  const pick = (x: { v: unknown; t: number } | undefined, y: typeof x) => (!x || !y ? (x ?? y) : x.t !== y.t ? (x.t > y.t ? x : y) : JSON.stringify(x.v) >= JSON.stringify(y.v) ? x : y)
  return Object.fromEntries(SYNCED.flatMap((k) => { const w = pick(a[k], b[k]); return w ? [[k, w]] : [] })) as Doc
}

/** Every synced field at time 1: beats a joining device's untouched time 0, loses to any edit. */
export const seed = (prefs: Prefs): Doc => Object.fromEntries(SYNCED.map((k) => [k, { v: prefs[k], t: 1 }])) as Doc

/** Stamps what changed in `prefs` since `doc` with `now`, never earlier than the value it replaces; a field never seen before gets time 0 so any remote edit beats it. */
export const track = (doc: Doc, prefs: Prefs, now: number): Doc =>
  Object.fromEntries(SYNCED.map((k) => [k, !doc[k] ? { v: prefs[k], t: 0 } : same(doc[k].v, prefs[k]) ? doc[k] : { v: prefs[k], t: Math.max(now, doc[k].t + 1) }])) as Doc

/** The preferences with the synced fields taken from `doc`, checked like any settings file. */
export const apply = (prefs: Prefs, doc: Doc): Prefs => migrate({ ...prefs, ...Object.fromEntries(SYNCED.flatMap((k) => (doc[k] ? [[k, doc[k].v]] : []))) })

export const equal = (a: Doc, b: Doc) => same(SYNCED.map((k) => a[k]), SYNCED.map((k) => b[k]))

/** Reads a decrypted document, keeping only synced fields with a finite time. */
export const parse = (text: string): Doc => {
  const raw: Record<string, { v?: unknown; t?: unknown } | undefined> = JSON.parse(text)
  return Object.fromEntries(SYNCED.flatMap((k) => (typeof raw[k]?.t === "number" && Number.isFinite(raw[k].t) && raw[k].v !== undefined ? [[k, { v: raw[k].v, t: raw[k].t }]] : []))) as Doc
}
