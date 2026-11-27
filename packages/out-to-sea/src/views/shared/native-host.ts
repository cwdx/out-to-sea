import { App } from "@capacitor/app"
import { Capacitor } from "@capacitor/core"
import { LocalNotifications } from "@capacitor/local-notifications"
import { Preferences } from "@capacitor/preferences"
import { tryOnScopeDispose } from "@vueuse/core"
import { ref } from "vue"
import type { Session, Status } from "../../rpc"
import { Core } from "../../shared/core"
import { skyFor } from "../../shared/fixtures"
import { breathingOf, DEFAULTS, intervalOf, migrate, type Prefs } from "../../shared/prefs"
import { isNewer } from "../../shared/release"
import { SEED } from "../../shared/sea"
import { syncService, type Saved } from "../../shared/sync-service"
import type { Sky } from "../../shared/sky"
import { cityNamed, cityOfZone, readWeather, skyOf, type Conditions } from "../../shared/weather"
import { version } from "../../../package.json"
import { router } from "../router"
import type { Send } from "./web-host"

const android = Capacitor.getPlatform() === "android"
// iOS keeps only the 64 soonest, so the plan stays well inside it
const AHEAD = 48
const KEY = "outtosea:prefs"
const SYNC_KEY = "outtosea:sync"
const UPDATE_KEY = "outtosea:update-check"
const SLEEP_GAP = 150_000
const RELEASES = "https://api.github.com/repos/cwdx/out-to-sea/releases/latest"
const APK = "https://github.com/cwdx/out-to-sea/releases/latest/download/OutToSea-android.apk"

export const plan = (core: Pick<Core, "upcoming">, notify: boolean) =>
  notify ? core.upcoming(AHEAD).map((at, i) => ({ id: i + 1, title: "Out to Sea", body: "Look into the distance.", schedule: { at: new Date(at), allowWhileIdle: true } })) : []

const create = () => {
  const stored = ref<Prefs>(DEFAULTS)
  const watchers = new Set<(s: Status) => void>()
  let current: Session | undefined
  let opening: Session["start"] = "look"
  let weather: Conditions | null = null
  let skyRead = 0
  let update = ""
  const cache = {
    read: async (key: string) => JSON.parse((await Preferences.get({ key: `outtosea:${key}` })).value ?? "null"),
    write: async (key: string, value: unknown) => Preferences.set({ key: `outtosea:${key}`, value: JSON.stringify(value) }),
  }
  const liveSky = (): Sky => ({ ...skyOf(Date.now(), stored.value.city, stored.value.weather ? weather : null), at: Date.now() })
  const status = (): Status => ({ version, update, theme: stored.value.theme, windowed: false, clock: stored.value.clock, ...core.state(), every: stored.value.every, look: stored.value.look, sound: stored.value.sound, volume: stored.value.volume / 100, sky: skyFor(stored.value, liveSky()), live: liveSky(), extra: [], sync: sync.state() })
  const push = () => {
    replan()
    const s = status()
    for (const w of watchers) w(s)
  }

  let queue: Promise<unknown> = Promise.resolve()
  let planned = ""
  let breaking = false
  const replan = () => (queue = queue.then(async () => {
    if (breaking) return
    const list = plan(core, stored.value.notify && !!stored.value.every && !core.state().paused)
    const key = JSON.stringify(list)
    if (key === planned) return
    planned = key
    const { notifications } = await LocalNotifications.getPending()
    if (notifications.length) await LocalNotifications.cancel({ notifications })
    if (list.length && (await allowed())) await LocalNotifications.schedule({ notifications: list })
  }).catch(() => undefined))

  const allowed = async () => {
    if ((await LocalNotifications.checkPermissions()).display === "granted") return true
    if ((await LocalNotifications.requestPermissions()).display !== "granted") {
      stored.value = { ...stored.value, notify: false }
      void Preferences.set({ key: KEY, value: JSON.stringify(stored.value) })
      return false
    }
    return true
  }

  const readSky = async (force = false) => {
    if (!force && Date.now() - skyRead < 300_000) return
    skyRead = Date.now()
    if (stored.value.weather) {
      const city = stored.value.city ?? (await cityOfZone())
      if (city !== stored.value.city) apply({ ...stored.value, city })
    }
    const { city } = stored.value
    weather = stored.value.weather && city ? (await readWeather(city, cache)).conditions : null
    push()
  }

  const checkUpdate = async () => {
    if (!android) return
    const { at = 0, tag = "" } = JSON.parse((await Preferences.get({ key: UPDATE_KEY })).value ?? "{}")
    const note = (latest: string) => {
      update = isNewer(latest, version) ? `Version ${latest.replace(/^v/, "")} is out` : ""
      push()
    }
    note(tag)
    if (Date.now() - at < 12 * 3_600_000) return
    const { tag_name } = await (await fetch(RELEASES)).json()
    await Preferences.set({ key: UPDATE_KEY, value: JSON.stringify({ at: Date.now(), tag: tag_name }) })
    note(String(tag_name))
  }

  const sync = syncService({
    store: {
      get: async () => JSON.parse((await Preferences.get({ key: SYNC_KEY })).value ?? "null") ?? undefined,
      set: async (saved: Saved) => Preferences.set({ key: SYNC_KEY, value: JSON.stringify(saved) }),
      clear: async () => Preferences.remove({ key: SYNC_KEY }),
    },
    prefs: () => stored.value,
    apply: (next) => apply(next, true),
    synced: () => push(),
    device: Capacitor.getPlatform() === "ios" ? { name: "iPhone app", kind: "ios" } : { name: "Android app", kind: "android" },
    base: "https://sea.cwdx.md/",
  })
  const synced = <T>(work: Promise<T>) => work.finally(push)

  function apply(next: Prefs, fromSync = false) {
    const before = stored.value
    stored.value = { ...before, ...migrate({ ...before, ...next }) }
    void Preferences.set({ key: KEY, value: JSON.stringify(stored.value) })
    if (stored.value.every !== before.every) core.retime()
    if (stored.value.weather !== before.weather || stored.value.city?.name !== before.city?.name) void readSky(true)
    if (!fromSync) sync.changed()
    push()
  }

  const show = (name: "home" | "break" | "settings") => {
    if (!router.currentRoute.value.query.scene) void router.replace({ name })
  }
  const core = new Core({
    now: Date.now,
    interval: () => intervalOf(stored.value.every),
    prefs: () => stored.value,
    open: (start = stored.value.start) => {
      current = undefined
      opening = start
      breaking = true
      show("break")
      void LocalNotifications.removeAllDeliveredNotifications()
    },
    close: () => {
      current = undefined
      breaking = false
      if (router.currentRoute.value.name === "break") show("home")
    },
    push,
  }, SLEEP_GAP)

  const ready = Preferences.get({ key: KEY }).then(({ value }) => {
    if (value) stored.value = migrate(JSON.parse(value))
    core.retime()
    void readSky(true)
    void sync.open()
    void checkUpdate().catch(() => undefined)
  })
  queue = ready
  void LocalNotifications.addListener("localNotificationActionPerformed", () => core.breakNow())
  void App.addListener("resume", () => {
    core.tick()
    void readSky()
    void sync.focus()
    void checkUpdate().catch(() => undefined)
    push()
  })
  setInterval(() => core.tick(), 5_000)
  setInterval(push, 15_000)

  const send: Send = {
    finish: core.finish.bind(core),
    snooze: core.snooze.bind(core),
    sound: ({ on }) => apply({ ...stored.value, sound: on }),
    syncOn: ({ on }) => void synced(on ? sync.on() : sync.off()),
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
    update: () => android && void window.open(APK, "_blank"),
    full: () => undefined,
  }

  return {
    send,
    ask: {
      session: async () => (await ready, current ??= { seed: SEED, sky: skyFor(stored.value, liveSky()), start: opening, look: stored.value.look, pattern: breathingOf(stored.value), sound: stored.value.sound, volume: stored.value.volume / 100, lead: true, windowed: false, shot: "" }),
      prefs: async () => (await ready, stored.value),
      status: async () => (await ready, status()),
      syncOffer: async () => synced(sync.offer()),
      syncJoin: async ({ text }: { text: string }) => synced(sync.join(text)),
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
    // the phone's place stays the time zone's city
    locate: async () => {
      const city = await cityOfZone()
      apply({ ...stored.value, city, locate: false })
      void readSky(true)
      return city
    },
    notify: async () => {
      const ok = await allowed()
      // Android 12+ lets people revoke exact alarms; without them reminders are scheduled inexact, so this is asked once, here
      if (ok && android && (await LocalNotifications.checkExactNotificationSetting()).exact_alarm !== "granted") void LocalNotifications.changeExactNotificationSetting()
      apply({ ...stored.value, notify: ok })
      return ok
    },
  }
}

let host: ReturnType<typeof create> | undefined
export const nativeHost = () => (host ??= create())
