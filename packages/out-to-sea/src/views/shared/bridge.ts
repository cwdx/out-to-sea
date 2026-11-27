import { Capacitor } from "@capacitor/core"
import { useColorMode, useLocalStorage } from "@vueuse/core"
import { Electroview } from "electrobun/view"
import { watchEffect } from "vue"
import type { LocationQuery } from "vue-router"
import type { BarRPC, Session, Status } from "../../rpc"
import { box, pattern, simple } from "../../shared/clock"
import { FIXTURES, type Fixture } from "../../shared/fixtures"
import { router } from "../router"
import { DEFAULTS, migrate, type City, type Prefs } from "../../shared/prefs"
import { SEED } from "../../shared/sea"
import type { SyncOffer } from "../../shared/sync-service"
import { nativeHost } from "./native-host"
import { webHost, type Send } from "./web-host"

export const useDeviceLocation = (on: boolean) => (native ? nativeHost().locate() : webHost().locate(on))
export const askToNotify = () => (native ? nativeHost() : webHost()).notify()

type Messages = BarRPC["bun"]["messages"]
type Ask = { session: () => Promise<Session>; prefs: () => Promise<Prefs>; status: () => Promise<Status>; place: (p: { name: string }) => Promise<City | null>; syncOffer: () => Promise<SyncOffer | undefined>; syncJoin: (p: { text: string }) => Promise<boolean> }

export const useTheme = (theme: () => Prefs["theme"] | undefined) => {
  const mode = useColorMode({ attribute: "data-theme", storageKey: null })
  watchEffect(() => {
    const t = theme()
    mode.value = t === "light" || t === "dark" ? t : "auto"
  })
}

export const native = Capacitor.isNativePlatform()

export const inApp = typeof window !== "undefined" && "__electrobunWebviewId" in window

const one = (v: LocationQuery[string] | undefined) => (Array.isArray(v) ? v[0] : v) ?? undefined

export const connect = ({ status, sample = {} }: { status?: (s: Status) => void; sample?: LocationQuery } = {}): { send: Send; ask: Ask } => {
  if (inApp) {
    const rpc = Electroview.defineRPC<BarRPC>({ handlers: { requests: {}, messages: { status: (s) => status?.(s) } } })
    new Electroview({ rpc })
    return {
      send: new Proxy({} as Send, { get: (_, k: keyof Messages) => (p: never) => (rpc.send[k] as (p: never) => void)(p) }),
      ask: { session: () => rpc.request.session({}), prefs: () => rpc.request.prefs({}), status: () => rpc.request.status({}), place: (p) => rpc.request.place(p), syncOffer: () => rpc.request.syncOffer({}), syncJoin: (p) => rpc.request.syncJoin(p) },
    }
  }
  if (native) {
    const host = nativeHost()
    if (status) host.subscribe(status)
    return { send: host.send, ask: host.ask }
  }
  const named = import.meta.env.DEV ? FIXTURES[one(sample.scene) as Fixture] : undefined
  if (!named) {
    const host = webHost()
    if (status) host.subscribe(status)
    return { send: host.send, ask: host.ask }
  }
  const stored = useLocalStorage<Prefs>("outtosea:prefs", DEFAULTS, { mergeDefaults: (saved) => migrate(saved) })
  const sky = { ...named }
  const kind = one(sample.pattern)
  return {
    send: new Proxy({} as Send, {
      get: (_, k: keyof Messages) => (p: unknown) => {
        if (k === "save") stored.value = p as Prefs
        const to = ({ breakNow: "break", finish: "home", settings: "settings" } as const)[k as "breakNow"]
        if (to) void router.push({ name: to, query: { ...sample, stage: (p as { start?: string }).start === "breathe" ? "breathing" : undefined } })
      },
    }),
    ask: {
      session: async () => ({
        seed: Number(one(sample.seed) ?? SEED),
        sky,
        start: one(sample.stage) === "breathing" ? "breathe" : "look",
        look: stored.value.look,
        pattern: kind === "box" ? box(4) : kind === "custom" ? pattern(4, 2, 6, 0) : simple(),
        sound: false,
        volume: stored.value.volume / 100,
        lead: true,
        windowed: false,
        shot: "",
      }),
      prefs: async () => stored.value,
      status: async () => ({ version: "", update: "", theme: stored.value.theme, windowed: false, clock: stored.value.clock, next: Date.now() + 12 * 60_000, paused: 0, quiet: 0, every: stored.value.every, look: stored.value.look, sound: stored.value.sound, volume: stored.value.volume / 100, sky, live: sky, extra: [], sync: { on: false, at: 0 } }),
      place: async () => null,
      syncOffer: async () => undefined,
      syncJoin: async () => false,
    },
  }
}
