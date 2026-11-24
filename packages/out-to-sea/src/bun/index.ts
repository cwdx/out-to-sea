import { execFile } from "node:child_process"
import { appendFile, readFile, rm, writeFile } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { BrowserView, BrowserWindow, GlobalShortcut, Screen, Tray, Updater, Utils } from "electrobun/main"
import type { BarRPC, Session, Status } from "../rpc"
import { skyFor } from "../shared/fixtures"
import { breathingOf, DEFAULTS, intervalOf, migrate, type Prefs } from "../shared/prefs"
import type { Sky } from "../shared/sky"
import { anchorBelow } from "./anchor"
import { FLOATING, overFullScreenApps, SCREEN, windowLevel } from "./level"
import { pauseFor, Reminder, snoozeFor } from "../shared/reminder"
import { loadPrefs, savePrefs, type Stored } from "./store"
import { cityNamed, type Conditions } from "../shared/weather"
import { cityOfZone, getWeather, skyOf } from "./weather"

const run = promisify(execFile)
const SUPPORT = join(homedir(), "Library/Application Support/OutToSea")
const SETTINGS = join(SUPPORT, "settings.json")
const LEGACY = join(homedir(), "Library/Application Support/cw/bar.json")
const LOGIN = join(homedir(), "Library/LaunchAgents/com.chriswijnia.bar.plist")
const HEARTBEAT = 5_000

const loaded = await loadPrefs(SETTINGS, LEGACY)
let prefs: Stored = loaded.prefs
if (loaded.migrated) await savePrefs(SETTINGS, prefs).catch(() => undefined)

// CW_BAR_FOCUS_MS shortens the interval to test a break; CW_BAR_START opens one on breathing; CW_BAR_SKY fixes the sky;
// CW_BAR_SETTINGS, CW_BAR_POPOVER and CW_BAR_HOME open those at launch
const interval = () => Number(process.env.CW_BAR_FOCUS_MS ?? intervalOf(prefs.every))
const reminder = new Reminder(Date.now(), interval())
let pausedUntil = 0

let weather: Conditions | null = null
let skyRead = 0
let reading: Promise<void> | undefined
const fixedSky = process.env.CW_BAR_SKY ? (JSON.parse(process.env.CW_BAR_SKY) as Partial<Sky>) : undefined
const readSky = (force = false) => {
  if (reading || (!force && Date.now() - skyRead < 300_000)) return reading
  skyRead = Date.now()
  reading = (async () => {
    if (prefs.weather && !prefs.city) {
      const city = await cityOfZone()
      if (city) await apply({ ...prefs, city })
    }
    weather = prefs.weather && prefs.city ? (await getWeather(prefs.city, join(SUPPORT, "cache"))).conditions : null
    push()
  })().finally(() => (reading = undefined))
  return reading
}
const liveSky = (): Sky => ({ ...skyOf(Date.now(), prefs.city, prefs.weather ? weather : null), ...fixedSky, at: Date.now() })
const skyNow = (): Sky => skyFor(prefs, liveSky())

const place = async ({ name }: { name: string }) => {
  const city = await cityNamed(name)
  if (city) await apply({ ...prefs, city })
  return city ?? null
}

/** Extra menu lines from the file `menuPlugin` names: a module whose default export returns them. */
let extra: string[] = []
const readExtra = async () => {
  if (!prefs.menuPlugin) return void (extra = [])
  try {
    extra = await ((await import(prefs.menuPlugin.replace(/^~/, homedir()))) as { default: () => Promise<string[]> }).default()
  } catch {
    extra = []
  }
}

const status = (): Status => ({ version, update: updateLine, theme: prefs.theme, windowed: prefs.windowed, clock: prefs.clock, next: reminder.nextBreakAt, paused: pausedUntil > Date.now() ? pausedUntil : 0, every: prefs.every, look: prefs.look, sound: prefs.sound, volume: prefs.volume / 100, sky: skyNow(), live: liveSky(), extra })

const setLogin = async (on: boolean) => {
  const app = process.execPath.split(".app/")[0] + ".app"
  if (on && app.endsWith(".app"))
    await writeFile(LOGIN, `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>com.chriswijnia.bar</string><key>ProgramArguments</key><array><string>/usr/bin/open</string><string>${app}</string></array><key>RunAtLoad</key><true/></dict></plist>\n`)
  else await rm(LOGIN, { force: true })
}

async function apply(next: Prefs) {
  const before = prefs
  prefs = { ...prefs, ...migrate({ ...prefs, ...next }) }
  if (prefs.every !== before.every) reminder.setInterval(Date.now(), interval())
  if (prefs.login !== before.login) await setLogin(prefs.login).catch(() => undefined)
  if (prefs.menuPlugin !== before.menuPlugin) await readExtra()
  if (prefs.weather !== before.weather || prefs.city?.name !== before.city?.name) void readSky(true)
  await savePrefs(SETTINGS, prefs).catch(() => undefined)
  push()
}

/** The main display as a 96px mosaic for the dissolve; empty when screen recording is refused, and the break then simply fades in. */
const shoot = async () => {
  const file = join(tmpdir(), `outtosea-${process.pid}.png`)
  try {
    await run("screencapture", ["-x", "-D", "1", "-t", "png", file])
    await run("sips", ["-Z", "96", file])
    return `data:image/png;base64,${(await readFile(file)).toString("base64")}`
  } catch {
    return ""
  } finally {
    await rm(file, { force: true })
  }
}

type Handlers = Partial<BarRPC["bun"]["messages"] extends infer M ? { [K in keyof M]: (p: M[K]) => void } : never>
const NONE = { close: () => undefined, finish: () => undefined, snooze: () => undefined, sound: () => undefined, save: () => undefined, breakNow: () => undefined, pause: () => undefined, settings: () => undefined, home: () => undefined, full: () => undefined, update: () => undefined, quit: () => undefined, fit: () => undefined }
const bridge = (messages: Handlers, session?: () => Session) =>
  BrowserView.defineRPC<BarRPC>({ handlers: { requests: { session: session ?? (() => ({}) as Session), prefs: () => prefs, status, place }, messages: { ...NONE, ...messages } } })

const frameScreen = (w: BrowserWindow, display: { bounds: { x: number; y: number; width: number; height: number } }, windowed: boolean, glide = true, onBreak = false) => {
  const b = display.bounds, k = windowed ? 0.8 : 1, width = Math.round(b.width * k), height = Math.round(b.height * k)
  const to = [b.x + Math.round((b.width - width) / 2), b.y + Math.round((b.height - height) / 2), width, height] as const
  // a break stays above other windows even when it is not full screen: it takes no focus, so it would otherwise open behind them and only be heard
  if (!windowed) windowLevel(w.ptr, SCREEN)
  else if (onBreak) windowLevel(w.ptr, FLOATING)
  const from = glide ? w.getFrame() : undefined, start = Date.now(), MS = 260
  const step = () => {
    const t = from ? Math.min(1, (Date.now() - start) / MS) : 1, e = 1 - (1 - t) ** 3
    const at = from ? [from.x, from.y, from.width, from.height].map((v, i) => Math.round(v + (to[i]! - v) * e)) : to
    w.setFrame(at[0]!, at[1]!, at[2]!, at[3]!)
    if (t < 1) setTimeout(step, 12)
    else if (windowed && !onBreak) windowLevel(w.ptr, 0)
  }
  step()
}
const setWindowed = (on: boolean) => void apply({ ...prefs, windowed: on })

const pointed = (displays = Screen.getAllDisplays()) => {
  const pointer = Screen.getCursorScreenPoint()
  return (displays.find(({ bounds: b }) => pointer.x >= b.x && pointer.x < b.x + b.width && pointer.y >= b.y && pointer.y < b.y + b.height) ?? displays.find((d) => d.isPrimary) ?? displays[0])!
}

let breaks: BrowserWindow[] = []
let uncounted = false
let opening = false
const openBreak = async (start = prefs.start) => {
  if (breaks.length || opening) return
  opening = true
  popover.close()
  settings?.close()
  // the picture is taken before any window opens, or it would be of them; over the main screen the break just fades in
  const windowed = prefs.windowed, shot = prefs.dissolve && !home && !windowed ? await shoot() : ""
  const displays = Screen.getAllDisplays(), lead = pointed(displays)
  // the preferences and the sky are fixed for the session, so a change in settings or the weather never alters a break under way
  const base: Omit<Session, "lead"> = {
    seed: Math.floor(Math.random() * 2 ** 31),
    sky: skyNow(),
    start: process.env.CW_BAR_START === "breathe" ? "breathe" : start,
    look: prefs.look,
    pattern: breathingOf(prefs),
    sound: prefs.sound,
    volume: prefs.volume / 100,
    windowed,
    shot,
  }
  uncounted = false
  breaks = (windowed ? [lead!] : displays).map((display) => {
    const session: Session = { ...base, lead: display === lead, shot: display === lead ? shot : "" }
    const rpc = bridge({
      finish: finishBreak,
      snooze: snoozeBreak,
      sound: ({ on }) => void apply({ ...prefs, sound: on }),
      settings: () => openSettings("break"),
      full: ({ on }) => {
        setWindowed(!on)
        frameScreen(w, display, !on, true, true)
      },
    }, () => session)
    const w = new BrowserWindow({ title: "Out to Sea", url: "views://app/index.html#/break", frame: display.bounds, titleBarStyle: "hidden", transparent: true, rpc })
    frameScreen(w, display, windowed, false, true)
    w.setVisibleOnAllWorkspaces(true)
    overFullScreenApps(w.ptr)
    return w
  })
  GlobalShortcut.register("Escape", finishBreak)
  // the main screen goes once the break has faded in over it, so the desktop never shows between them
  setTimeout(() => home?.close(), 1500)
  opening = false
}
function finishBreak() {
  if (!breaks.length) return
  for (const w of breaks) w.close()
  breaks = []
  GlobalShortcut.unregister("Escape")
  // a break counts the next one from now, unless the reminder has already started over
  if (!uncounted) reminder.finish(Date.now())
  uncounted = false
}
function snoozeBreak() {
  finishBreak()
  snoozeFor(reminder, Date.now(), status(), interval())
  push()
}
/** Skipping the coming break leaves the one after it where it was: a whole interval later. */
const skip = () => {
  reminder.postpone(Date.now(), interval())
  push()
}
const takeBreak = ({ start }: { start?: Session["start"] } = {}) => {
  if (reminder.start(Date.now())) void openBreak(start)
}
const pause = ({ for: ms }: { for: number }) => {
  pausedUntil = pauseFor(reminder, Date.now(), ms, interval())
  push()
}

const tray = new Tray({ title: "", image: "views://tray/iconTemplate.png", template: true, width: 22, height: 22 })
let room = Screen.getPrimaryDisplay().workArea
const popoverRpc = bridge({
  breakNow: takeBreak,
  finish: skip,
  settings: () => {
    popover.close()
    openSettings("popover")
  },
  home: openHome,
  sound: ({ on }) => void apply({ ...prefs, sound: on }),
  save: (next) => void apply(next),
  pause,
  quit: () => Utils.quit(),
  close: () => popover.close(),
  fit: ({ height }) => panel.setSize(330, Math.min(height, room.height)),
})
const panel: BrowserWindow = new BrowserWindow({ title: "Out to Sea", url: "views://app/index.html#/popover", frame: { x: 0, y: 0, width: 330, height: 380 }, titleBarStyle: "hidden", transparent: true, hidden: true, rpc: popoverRpc })
panel.setAlwaysOnTop(true)
let hiddenAt = 0
const popover = {
  close: () => {
    if (!panel.isVisible()) return
    hiddenAt = Date.now()
    panel.hide()
  },
}
function push() {
  popoverRpc.send.status(status())
  homeRpc?.send.status(status())
  settingsRpc?.send.status(status())
}
panel.on("blur", () => popover.close())
const openPopover = () => {
  if (panel.isVisible()) return popover.close()
  // a click on the icon first takes the focus from the panel, which closes it: that click is the close, not a new open
  if (Date.now() - hiddenAt < 300) return
  settings?.close()
  const icon = tray.getBounds(), displays = Screen.getAllDisplays()
  room = (displays.find(({ bounds: b }) => icon.x >= b.x && icon.x < b.x + b.width) ?? displays[0]!).workArea
  const frame = anchorBelow(icon, room, panel.getSize())
  panel.setPosition(frame.x, frame.y)
  push()
  panel.show()
  panel.activate()
  void readExtra().then(push)
}
tray.on("tray-clicked", openPopover)

let home: BrowserWindow | undefined
let homeRpc: ReturnType<typeof bridge> | undefined
function openHome() {
  if (home) return home.activate()
  popover.close()
  settings?.close()
  const close = () => home?.close()
  homeRpc = bridge({
    breakNow: takeBreak,
    finish: skip,
    settings: () => {
      close()
      openSettings("home")
    },
    sound: ({ on }) => void apply({ ...prefs, sound: on }),
    save: (next) => void apply(next),
    close,
    full: ({ on }) => {
      setWindowed(!on)
      frameScreen(home!, pointed(), !on)
    },
  })
  home = new BrowserWindow({ title: "Out to Sea", url: "views://app/index.html#/", frame: pointed().bounds, titleBarStyle: "hidden", transparent: true, rpc: homeRpc })
  frameScreen(home, pointed(), prefs.windowed, false)
  home.activate()
  home.on("close", () => (home = homeRpc = undefined))
}

let settings: BrowserWindow | undefined
let settingsRpc: ReturnType<typeof bridge> | undefined
/** Settings that open unasked are rare and left no trace, so each opening names what asked for it and what was on screen. */
function openSettings(from: string) {
  void appendFile(join(homedir(), "Library/Logs/out-to-sea.log"), `${new Date().toISOString()} settings from ${from}; break ${breaks.length}, home ${!!home}, popover ${panel.isVisible()}, open ${!!settings}\n`).catch(() => undefined)
  if (settings) return settings.activate()
  void readSky(true)
  const area = Screen.getPrimaryDisplay().workArea
  const rpc = bridge({
    save: (next) => void apply(next),
    breakNow: takeBreak,
    update: () => void update(true),
    home: () => {
      settings?.close()
      openHome()
    },
    close: () => settings?.close(),
    fit: ({ height }) => settings?.setSize(settings.getSize().width, Math.min(height + 28, area.height - 60)),
  })
  const width = Math.min(prefs.settingsWidth, area.width)
  settings = new BrowserWindow({ title: "Out to Sea Settings", url: "views://app/index.html#/settings", frame: { x: area.x + (area.width - width) / 2, y: area.y + 80, width, height: 620 }, rpc })
  settingsRpc = rpc
  settings.on("close", () => (settings = settingsRpc = undefined))
  let settle: ReturnType<typeof setTimeout> | undefined
  settings.on("resize", () => {
    const size = settings?.getSize()
    if (!size) return
    if (size.width < DEFAULTS.settingsWidth) return settings!.setSize(DEFAULTS.settingsWidth, size.height)
    clearTimeout(settle)
    settle = setTimeout(() => size.width !== prefs.settingsWidth && void apply({ ...prefs, settingsWidth: size.width }), 400)
  })
}

Utils.setDockIconVisible(false)
// the login item names this copy of the app, so a move or a reinstall keeps it pointing at the one that runs
if (prefs.login) void setLogin(true).catch(() => undefined)
void readSky(true)
void readExtra()
if (process.env.CW_BAR_SETTINGS) openSettings("env")
if (process.env.CW_BAR_HOME) openHome()
// the tray's bounds are only known once the menu bar has laid it out
if (process.env.CW_BAR_POPOVER) setTimeout(openPopover, Number(process.env.CW_BAR_POPOVER) > 1 ? Number(process.env.CW_BAR_POPOVER) : 1500)

let version = "", updateLine = ""
void Updater.localInfo.version().then((v) => {
  version = v
  push()
})
const showUpdate = (line: string) => {
  updateLine = line
  push()
}
/** Fetches and installs a newer release, which restarts the app; never in the middle of a break. Quiet unless asked for. */
const update = async (asked = false) => {
  if (breaks.length) return
  try {
    if (asked) showUpdate("Checking…")
    const found = await Updater.checkForUpdate()
    if (found.error || !found.updateAvailable) return showUpdate(asked ? (found.error ? "Can't check right now" : "Up to date") : "")
    showUpdate("Downloading the update…")
    await Updater.downloadUpdate()
    if (!Updater.updateInfo().updateReady || breaks.length) return showUpdate("")
    showUpdate("Restarting to update…")
    await Updater.applyUpdate()
  } catch {
    showUpdate(asked ? "Can't update right now" : "")
  }
}
setTimeout(() => prefs.autoUpdate && void update(), 60_000)
setInterval(() => prefs.autoUpdate && void update(), 6 * 3_600_000)

setInterval(() => {
  const now = Date.now()
  if (pausedUntil && now >= pausedUntil) pausedUntil = 0
  const event = reminder.tick(now)
  if (event === "start") void openBreak()
  // after a long sleep the reminder has already started a fresh interval; a break still showing just closes
  if (event === "reset") {
    uncounted = true
    finishBreak()
  }
  const next = reminder.nextBreakAt
  if (next !== null && next - now < 120_000) void readSky()
  const title = next === null || !prefs.every ? "" : `${Math.max(1, Math.ceil((next - now) / 60_000))}m`
  if (title !== tray.title) tray.setTitle(title)
}, HEARTBEAT)
setInterval(() => void readExtra(), 60_000)
