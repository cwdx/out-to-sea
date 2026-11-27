import { scryptAsync } from "@noble/hashes/scrypt.js"
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js"
import { wordlist } from "@scure/bip39/wordlists/english.js"
import { decrypt, encrypt } from "./crypto"
import { KIND, sign, verify } from "./nostr"
import type { Relay } from "./relay"

export const PAIR_TTL = 600
const WORDS = 6
const SECRET = /^[0-9a-f]{64}$/

/** The secret rides in the fragment, which browsers never send to a server. */
export const linkOf = (base: string, secret: string) => `${base}#${secret}`

export const secretOfLink = (link: string) => {
  const secret = new URL(link).hash.slice(1)
  return SECRET.test(secret) ? secret : undefined
}

/** The six words are the only shared secret: scrypt turns them into the rendezvous name, the key that locks the secret and the key that signs the event. */
const stretch = async (words: string) => {
  const key = await scryptAsync(utf8ToBytes(words.trim().toLowerCase().split(/\s+/).join(" ")), utf8ToBytes("outtosea-pair"), { N: 2 ** 15, r: 8, p: 1, dkLen: 80 })
  return { d: `outtosea-pair-${bytesToHex(key.slice(0, 16))}`, key: key.slice(16, 48), signer: bytesToHex(key.slice(48)) }
}

/** Publishes the secret under a fresh code, readable for ten minutes; returns the code to type on the new device. */
export const offer = async (relays: Relay[], secret: string, now = Date.now()) => {
  const words = Array.from(crypto.getRandomValues(new Uint16Array(WORDS)), (n) => wordlist[n % 2048]).join(" ")
  const { d, key, signer } = await stretch(words)
  const created_at = Math.floor(now / 1000)
  const event = sign(signer, { created_at, kind: KIND, tags: [["d", d], ["expiration", String(created_at + PAIR_TTL)]], content: await encrypt(key, secret) })
  await Promise.any(relays.map((r) => r.publish(event)))
  return words
}

/** The secret behind a typed code, or undefined when the code is wrong, expired or already used. The rendezvous is overwritten so the code works once. */
export const claim = async (relays: Relay[], words: string, now = Date.now()) => {
  const { d, key, signer } = await stretch(words)
  const at = Math.floor(now / 1000)
  const found = (await Promise.all(relays.map((r) => r.query({ "kinds": [KIND], "#d": [d] }).catch(() => [])))).flat().filter((e) => verify(e) && at - e.created_at <= PAIR_TTL)
  for (const e of found.sort((a, b) => b.created_at - a.created_at)) {
    const secret = await decrypt(key, e.content).catch(() => "")
    if (!SECRET.test(secret)) continue
    const spent = sign(signer, { created_at: Math.max(at, e.created_at + 1), kind: KIND, tags: [["d", d]], content: "" })
    await Promise.allSettled(relays.map((r) => r.publish(spent)))
    return secret
  }
}
