import { StorageSerializers, tryOnScopeDispose, until, useEventListener, useGeolocation, useLocalStorage, useWebNotification } from "@vueuse/core"
import type { BarRPC, Session, Status } from "../../rpc"
import { skyFor } from "../../shared/fixtures"
import { SEED } from "../../shared/sea"
import { breathingOf, DEFAULTS, intervalOf, migrate, type City, type Prefs } from "../../shared/prefs"
import { Core } from "../../shared/core"
import { syncService, type Saved } from "../../shared/sync-service"
import type { Sky } from "../../shared/sky"
import { cityNamed, cityOfZone, placeNameAt, readWeather, skyOf, type Conditions } from "../../shared/weather"
import { router } from "../router"
import { version } from "../../../package.json"

type Messages = BarRPC["bun"]["messages"]
export type Send = { [K in keyof Messages]: (p: Messages[K]) => void }

// cwdx.md/sea shares an origin with the console, so a device secret never lives there
export const webSync = import.meta.env.DEV || location.host === "sea.cwdx.md"

const BROWSERS: [string, RegExp][] = [["Edge", /Edg\//], ["Firefox", /Firefox|FxiOS/], ["Chrome", /Chrome|CriOS/], ["Safari", /Safari/]]
const SYSTEMS = ["Android", "iPhone", "iPad", "Windows", "Mac", "Linux"]

export const browserName = (ua: string) => `${BROWSERS.find(([, re]) => re.test(ua))?.[0] ?? "Browser"} on ${SYSTEMS.find((s) => ua.includes(s)) ?? "web"}`

const HEARTBEAT = 5_000
// a hidden tab's timers run about once a minute, so only a longer silence than that is a sleep
const SLEEP_GAP = 150_000

const create = () => {
  const stored = useLocalStorage<Prefs>("outtosea:prefs", DEFAULTS, { mergeDefaults: (saved) => migrate(saved) })
  const interval = () => intervalOf(stored.value.every)
  const watchers = new Set<(s: Status) => void>()
  let current: Session | undefined
  let opening: Session["start"] = "look"
  const position = useGeolocation({ immediate: false })
  const locate = async (): Promise<City | undefined> => {
    position.resume()
    await until(() => position.locatedAt.value ?? position.error.value).toBeTruthy({ timeout: 20_000 })
    position.pause()
    if (!position.locatedAt.value) return undefined
    const { latitude, longitude } = position.coords.value
    return { name: await placeNameAt(latitude, longitude), latitude, longitude }
  }
  const notification = useWebNotification({ title: "Out to Sea", body: "Look into the distance.", requestPermissions: false })
  notification.onClick(() => window.focus())
  // framed in another page, as on the Lab, a browser answers no to every permission; that no isn't the reader's, so nothing is asked or stored
  const framed = window.top !== window.self
  // notifications are asked for as the page opens; a browser that wants a gesture first is asked again at the first tap
  const allow = async () => {
    if (framed || !stored.value.notify || Notification.permission !== "default") return
    await notification.ensurePermissions()
    // read afresh: the answer has changed it since the check above
    if ((Notification.permission as NotificationPermission) === "denied") apply({ ...stored.value, notify: false })
  }
  if (typeof Notification !== "undefined") {
    void allow()
    useEventListener(window, "pointerdown", () => void allow(), { once: true })
  }

  let weather: Conditions | null = null
  let skyRead = 0
  let reading: Promise<void> | undefined
  const cache = {
    read: async (key: string) => JSON.parse(localStorage.getItem(`outtosea:${key}`) ?? "null"),
    write: async (key: string, value: unknown) => localStorage.setItem(`outtosea:${key}`, JSON.stringify(value)),
  }
  const liveSky = (): Sky => ({ ...skyOf(Date.now(), stored.value.city, stored.value.weather ? weather : null), at: Date.now() })
  const skyNow = (): Sky => skyFor(stored.value, liveSky())
  const status = (): Status => ({ version, update: "", theme: stored.value.theme, windowed: false, clock: stored.value.clock, ...core.state(), every: stored.value.every, look: stored.value.look, sound: stored.value.sound, volume: stored.value.volume / 100, sky: skyNow(), live: liveSky(), extra: [], sync: sync.state() })
  const push = () => {
    const s = status()
    for (const w of watchers) w(s)
  }

  const readSky = (force = false) => {
    if (reading || (!force && Date.now() - skyRead < 300_000)) return reading
    skyRead = Date.now()
    reading = (async () => {
      // a time zone's city can be far away, so the device's own position wins when it is asked for
      if (stored.value.weather) {
        const here = stored.value.locate && !framed ? await locate() : undefined
        // a browser that won't say where it is isn't asked again: the time zone's city stands in
        const city = here ?? stored.value.city ?? (await cityOfZone())
        if (city !== stored.value.city || (stored.value.locate && !here && !framed)) apply({ ...stored.value, city, locate: framed ? stored.value.locate : !!here })
      }
      const { city } = stored.value
      weather = stored.value.weather && city ? (await readWeather(city, cache)).conditions : null
      push()
    })().finally(() => (reading = undefined))
    return reading
  }

  const saved = useLocalStorage<Saved | null>("outtosea:sync", null, { serializer: StorageSerializers.object, writeDefaults: false })
  const sync = syncService({
    store: { get: async () => saved.value ?? undefined, set: async (s) => void (saved.value = s), clear: async () => void (saved.value = null) },
    prefs: () => stored.value,
    apply: (next) => apply(next, true),
    synced: push,
    device: { name: browserName(navigator.userAgent), kind: "web" },
    base: location.origin + location.pathname,
  })
  const synced = <T>(work: Promise<T>) => work.finally(push)
  if (webSync) {
    void sync.open()
    useEventListener(window, "focus", () => void sync.focus())
  }

  function apply(next: Prefs, fromSync = false) {
    const before = stored.value
    stored.value = { ...before, ...migrate({ ...before, ...next }) }
    if (stored.value.every !== before.every) core.retime()
    if (stored.value.weather !== before.weather || stored.value.city?.name !== before.city?.name) void readSky(true)
    if (!fromSync) sync.changed()
    push()
  }

  // a sample route (?scene=) is somebody inspecting a look, so the host never moves it
  const show = (name: "home" | "break" | "settings") => {
    if (!router.currentRoute.value.query.scene) void router.replace({ name })
  }
  const openBreak = (start = stored.value.start) => {
    current = undefined
    opening = start
    show("break")
    if (document.hidden && stored.value.notify) void notification.show()
  }
  const core = new Core({
    now: Date.now,
    interval,
    prefs: () => stored.value,
    open: openBreak,
    close: () => {
      current = undefined
      if (router.currentRoute.value.name === "break") show("home")
    },
    push,
  }, SLEEP_GAP)

  const heartbeat = setInterval(() => {
    core.tick()
    const { next } = core.state()
    if (next !== null && next - Date.now() < 120_000) void readSky()
  }, HEARTBEAT)
  const pulse = setInterval(push, 15_000)
  // a hot reload makes a new host; the old one must stop ticking
  import.meta.hot?.dispose(() => {
    clearInterval(heartbeat)
    clearInterval(pulse)
  })
  void readSky(true)

  const send: Send = {
    finish: core.finish.bind(core),
    snooze: core.snooze.bind(core),
    sound: ({ on }) => apply({ ...stored.value, sound: on }),
    syncOn: ({ on }) => void (webSync && synced(on ? sync.on() : sync.off())),
    save: apply,
    breakNow: ({ start }) => core.breakNow(start),
    pause: ({ for: ms }) => core.pause(ms),
    settings: () => {
      void readSky(true)
      show("settings")
    },
    quit: () => undefined,
    fit: () => undefined,
    close: () => show("home"),
    home: () => show("home"),
    update: () => undefined,
    full: () => undefined,
  }

  return {
    send,
    ask: {
      session: async () => (current ??= { seed: SEED, sky: skyNow(), start: opening, look: stored.value.look, pattern: breathingOf(stored.value), sound: stored.value.sound, volume: stored.value.volume / 100, lead: true, windowed: false, shot: "" }),
      prefs: async () => stored.value,
      status: async () => status(),
      syncOffer: async () => (webSync ? synced(sync.offer()) : undefined),
      syncJoin: async ({ text }: { text: string }) => webSync && synced(sync.join(text)),
      place: async ({ name }: { name: string }) => {
        const city = await cityNamed(name)
        if (city) apply({ ...stored.value, city, locate: false })
        return city ?? null
      },
    },
    subscribe: (watcher: (s: Status) => void) => {
      watchers.add(watcher)
      tryOnScopeDispose(() => watchers.delete(watcher))
    },
    locate: async (on: boolean) => {
      const city = on ? await locate() : await cityOfZone()
      apply({ ...stored.value, city, locate: on && !!city })
      void readSky(true)
      return city
    },
    notify: async () => {
      const allowed = (await notification.ensurePermissions()) === true
      apply({ ...stored.value, notify: allowed })
      return allowed
    },
  }
}

let host: ReturnType<typeof create> | undefined
export const webHost = () => (host ??= create())
