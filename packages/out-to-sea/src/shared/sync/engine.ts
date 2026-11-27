import { contentKey, decrypt, encrypt } from "./crypto"
import { equal, merge, parse, type Doc } from "./merge"
import { KIND, pubkeyOf, sign, verify, type NostrEvent } from "./nostr"
import type { Relay } from "./relay"

const D = "outtosea-prefs"

const pack = async (secret: string, doc: Doc, created_at: number) =>
  sign(secret, { created_at, kind: KIND, tags: [["d", D]], content: await encrypt(contentKey(secret), JSON.stringify(doc)) })

/** The document in an event, or undefined when it is not ours, not validly signed or not sealed under our secret. */
const unpack = async (secret: string, e: NostrEvent) => {
  if (e.pubkey !== pubkeyOf(secret) || e.kind !== KIND || !verify(e)) return
  try {
    return parse(await decrypt(contentKey(secret), e.content))
  } catch {
    return
  }
}

/** Merges every relay's newest document with `local` and writes the result back where any relay is behind; a relay that is down or drops the write is healed by the next sync. */
export const sync = async (relays: Relay[], secret: string, local: Doc, now = Date.now()) => {
  const filter = { "kinds": [KIND], "authors": [pubkeyOf(secret)], "#d": [D] }
  const perRelay = await Promise.all(relays.map(async (r) => {
    const events = await r.query(filter).catch(() => null)
    if (!events) return null
    const valid = await Promise.all(events.map(async (e) => ({ at: e.created_at, doc: await unpack(secret, e) })))
    return valid.filter((v) => v.doc).sort((a, b) => b.at - a.at)[0]
  }))
  const merged = perRelay.reduce((acc, v) => (v?.doc ? merge(acc, v.doc) : acc), local)
  if (perRelay.some((v) => v !== null && (!v?.doc || !equal(v.doc, merged)))) {
    const event = await pack(secret, merged, Math.max(Math.floor(now / 1000), ...perRelay.map((v) => (v?.at ?? 0) + 1)))
    await Promise.allSettled(relays.map((r) => r.publish(event)))
  }
  return merged
}
