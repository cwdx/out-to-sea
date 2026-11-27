import type { Prefs } from "./prefs"
import type { Doc, Entry, Relay } from "./sync"

export type Device = Entry & { self: boolean }
export type SyncState = { on: boolean; at: number; devices: Device[] }
export type SyncOffer = { link: string; words?: string }
export type Saved = { secret: string; doc: Doc; id?: string }

/** Where a host keeps the device secret and the synced fields with their times, apart from Prefs. */
export type SecretStore = { get: () => Promise<Saved | undefined>; set: (saved: Saved) => Promise<void>; clear: () => Promise<void> }

export type SyncPorts = {
  store: SecretStore
  prefs: () => Prefs
  apply: (prefs: Prefs) => void
  /** How this device appears in the list. */
  device: Pick<Entry, "name" | "kind">
  /** The page address a pairing link points at. */
  base: string
  /** After every sync attempt, so the host can show the new time. */
  synced?: () => void
  now?: () => number
  relays?: Relay[]
  delay?: number
  /** The engine loads here, the first time it is needed. */
  load?: () => Promise<typeof import("./sync")>
}

const REFRESH = 5 * 60_000

export const syncService = ({ store, prefs, apply, synced, device, base, now = Date.now, relays, delay = 2000, load = () => import("./sync") }: SyncPorts) => {
  let saved: Saved | undefined
  let at = 0
  let kept: string | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let engine: ReturnType<typeof load> | undefined
  let read: Promise<void> | undefined
  let queue: Promise<unknown> = Promise.resolve()

  const ready = () => (read ??= store.get().then((s) => void ([saved, kept] = [s?.secret ? s : undefined, s?.id])))
  const lib = () => (engine ??= load())
  const live = async () => {
    const { RELAYS, wsRelay } = await lib()
    return relays ?? RELAYS.map((url) => wsRelay(url))
  }

  const pull = async () => {
    if (!saved) return
    const { sync, track, apply: merge } = await lib()
    let reached = false
    const all = (await live()).map((r): Relay => ({ ...r, query: async (f) => {
      const events = await r.query(f)
      reached = true
      return events
    },
    }))
    const { secret } = saved
    const id = (saved.id ??= crypto.randomUUID())
    const t = now()
    const mine = saved.doc.devices?.[id]
    const devices = mine && t - mine.at < REFRESH ? saved.doc.devices : { ...saved.doc.devices, [id]: { id, ...device, at: t } }
    const doc = await sync(all, secret, { ...track(saved.doc, prefs(), t), devices }, t)
    if (saved?.secret !== secret) return
    saved = { secret, doc, id }
    await store.set(saved)
    const before = prefs()
    const next = merge(before, doc)
    if (JSON.stringify(next) !== JSON.stringify(before)) apply(next)
    if (reached) at = now()
  }

  const run = () => (queue = queue.then(() => pull().catch(() => {}).finally(synced)))

  const start = async (secret: string, doc: Doc = {}) => {
    saved = { secret, doc, id: kept }
    await store.set(saved)
  }

  const on = async () => {
    await ready()
    if (!saved) {
      const { newSecret, seed } = await lib()
      await start(newSecret(), seed(prefs()))
      await run()
    }
  }

  return {
    // the devices share one secret, so a lost one cannot be revoked
    state: (): SyncState => ({
      on: !!saved,
      at,
      devices: Object.values(saved?.doc.devices ?? {}).map((e) => ({ ...e, self: e.id === saved?.id })).sort((a, b) => +b.self - +a.self || b.at - a.at),
    }),
    open: async () => {
      await ready()
      synced?.()
      await run()
    },
    focus: () => (saved ? run() : undefined),
    changed: () => {
      if (!saved) return
      clearTimeout(timer)
      timer = setTimeout(() => void run(), delay)
    },
    on: () => on().catch(() => {}),
    offer: async (): Promise<SyncOffer | undefined> => {
      try {
        await on()
        const { offer, linkOf } = await lib()
        if (!saved) return
        const { secret } = saved
        const words = await offer(await live(), secret, now()).catch(() => undefined)
        return { link: linkOf(base, secret), words }
      } catch {}
    },
    join: async (text: string) => {
      try {
        await ready()
        const { claim, secretOfLink } = await lib()
        const t = text.trim()
        if (saved) return !/\s/.test(t) && secretOfLink(t) === saved.secret
        const secret = /\s/.test(t) ? await claim(await live(), t, now()) : secretOfLink(t)
        if (!secret) return false
        await start(secret)
        void run()
        return true
      } catch {
        return false
      }
    },
    off: async () => {
      clearTimeout(timer)
      await ready()
      kept = saved?.id ?? kept
      saved = undefined
      at = 0
      await (kept ? store.set({ secret: "", doc: {}, id: kept }) : store.clear())
    },
  }
}
