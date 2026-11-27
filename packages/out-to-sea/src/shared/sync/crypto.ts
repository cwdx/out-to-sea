import { hkdf } from "@noble/hashes/hkdf.js"
import { sha256 } from "@noble/hashes/sha2.js"
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js"

const aes = (key: Uint8Array) => crypto.subtle.importKey("raw", key.slice(), "AES-GCM", false, ["encrypt", "decrypt"])

/** The key that seals the settings, derived from the device secret so the secret itself never encrypts. */
export const contentKey = (secret: string) => hkdf(sha256, hexToBytes(secret), undefined, utf8ToBytes("outtosea-prefs"), 32)

export const encrypt = async (key: Uint8Array, text: string) => {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const body = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aes(key), utf8ToBytes(text)))
  return bytesToHex(iv) + bytesToHex(body)
}

/** Rejects when the key is wrong or the content was altered. */
export const decrypt = async (key: Uint8Array, hex: string) => {
  const bytes = hexToBytes(hex)
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, await aes(key), bytes.slice(12)))
}
