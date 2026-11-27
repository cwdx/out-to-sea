import type { RPCSchema } from "electrobun/main"
import type { Pattern } from "./shared/clock"
import type { City, Prefs } from "./shared/prefs"
import type { Sky } from "./shared/sky"
import type { SyncOffer, SyncState } from "./shared/sync-service"

export type Session = {
  seed: number
  sky: Sky
  start: "look" | "breathe"
  /** seconds of looking away */
  look: number
  pattern: Pattern
  sound: boolean
  /** how loud, 0 to 1 */
  volume: number
  lead: boolean
  windowed: boolean
  /** the screen as a small mosaic for the dissolve, or empty for a plain fade */
  shot: string
}

export type Status = { version: string; /** what the Mac's updater is doing, for the settings to show; empty when idle */ update: string; theme: Prefs["theme"]; windowed: boolean; clock: boolean; next: number | null; /** when the pause ends, or 0 */ paused: number; /** when quiet hours end, or 0 outside them */ quiet: number; every: number; look: number; sound: boolean; volume: number; sky: Sky; /** the sky outside, before any hour, weather or temperature chosen to keep */ live: Sky; extra: string[]; sync: SyncState }

export type BarRPC = {
  bun: RPCSchema<{
    requests: {
      session: { params: Record<never, never>; response: Session }
      prefs: { params: Record<never, never>; response: Prefs }
      status: { params: Record<never, never>; response: Status }
      place: { params: { name: string }; response: City | null }
      syncOffer: { params: Record<never, never>; response: SyncOffer | undefined }
      syncJoin: { params: { text: string }; response: boolean }
    }
    messages: {
      close: Record<never, never>
      /** ends the break, and the next is counted from now; from the main screen it skips the coming one, a whole interval on */
      finish: Record<never, never>
      /** ends the break and brings the next one back in five minutes */
      snooze: Record<never, never>
      sound: { on: boolean }
      syncOn: { on: boolean }
      save: Prefs
      breakNow: { start?: Session["start"] }
      /** pauses for this many milliseconds; 0 resumes */
      pause: { for: number }
      /** checks for a new version now, and installs it */
      update: Record<never, never>
      settings: Record<never, never>
      home: Record<never, never>
      full: { on: boolean }
      quit: Record<never, never>
      fit: { height: number }
    }
  }>
  webview: RPCSchema<{ requests: Record<never, never>; messages: { status: Status } }>
}
