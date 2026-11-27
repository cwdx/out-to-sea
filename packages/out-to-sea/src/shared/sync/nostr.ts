import { schnorr } from "@noble/curves/secp256k1.js"
import { sha256 } from "@noble/hashes/sha2.js"
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js"

export type NostrEvent = { id: string; pubkey: string; created_at: number; kind: number; tags: string[][]; content: string; sig: string }
export type Filter = { "kinds"?: number[]; "authors"?: string[]; "#d"?: string[]; "limit"?: number }

export const KIND = 30078

export const newSecret = () => bytesToHex(schnorr.utils.randomSecretKey())
export const pubkeyOf = (secret: string) => bytesToHex(schnorr.getPublicKey(hexToBytes(secret)))

export const idOf = (e: Pick<NostrEvent, "pubkey" | "created_at" | "kind" | "tags" | "content">) =>
  bytesToHex(sha256(utf8ToBytes(JSON.stringify([0, e.pubkey, e.created_at, e.kind, e.tags, e.content]))))

export const sign = (secret: string, e: Pick<NostrEvent, "created_at" | "kind" | "tags" | "content">): NostrEvent => {
  const body = { ...e, pubkey: pubkeyOf(secret) }
  const id = idOf(body)
  return { ...body, id, sig: bytesToHex(schnorr.sign(hexToBytes(id), hexToBytes(secret))) }
}

/** Relays are untrusted: any malformed event is simply not valid. */
export const verify = (e: NostrEvent) => {
  try {
    return e.id === idOf(e) && schnorr.verify(hexToBytes(e.sig), hexToBytes(e.id), hexToBytes(e.pubkey))
  } catch {
    return false
  }
}
