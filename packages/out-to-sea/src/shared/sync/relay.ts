import { verify, type Filter, type NostrEvent } from "./nostr"

/** A relay as the engine sees it; tests use a fake. */
export type Relay = {
  publish: (event: NostrEvent) => Promise<void>
  query: (filter: Filter) => Promise<NostrEvent[]>
  subscribe: (filter: Filter, onEvent: (event: NostrEvent) => void) => () => void
}

export const RELAYS = ["wss://relay.damus.io", "wss://nos.lol", "wss://relay.primal.net", "wss://relay.nostr.band"]

/** One request/response over a fresh socket: `frame` goes out on open, `onMessage` settles it; every path closes the socket. */
const exchange = <T>(url: string, timeout: number, frame: unknown[], onMessage: (msg: unknown[], end: (r: T | Error) => void) => void) =>
  new Promise<T>((resolve, reject) => {
    const ws = new WebSocket(url)
    const end = (r: T | Error) => {
      clearTimeout(timer)
      ws.close()
      if (r instanceof Error) reject(r)
      else resolve(r)
    }
    const timer = setTimeout(() => end(new Error(`${url}: no answer`)), timeout)
    ws.onopen = () => ws.send(JSON.stringify(frame))
    ws.onerror = () => end(new Error(`${url}: unreachable`))
    ws.onmessage = ({ data }) => onMessage(JSON.parse(String(data)), end)
  })

export const wsRelay = (url: string, timeout = 8000): Relay => ({
  publish: (event) =>
    exchange<undefined>(url, timeout, ["EVENT", event], ([type, , ok, why], end) => {
      if (type === "OK") end(ok ? undefined : new Error(`${url}: ${String(why)}`))
    }),
  query: (filter) => {
    const found: NostrEvent[] = []
    return exchange<NostrEvent[]>(url, timeout, ["REQ", "q", filter], ([type, , event], end) => {
      if (type === "EVENT") found.push(event as NostrEvent)
      else if (type === "EOSE") end(found.filter(verify))
    })
  },
  subscribe: (filter, onEvent) => {
    const ws = new WebSocket(url)
    ws.onopen = () => ws.send(JSON.stringify(["REQ", "s", filter]))
    ws.onmessage = ({ data }) => {
      const [type, , event] = JSON.parse(String(data)) as unknown[]
      if (type === "EVENT" && verify(event as NostrEvent)) onEvent(event as NostrEvent)
    }
    return () => ws.close()
  },
})
