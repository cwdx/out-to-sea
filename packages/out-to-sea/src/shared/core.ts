import type { Prefs } from "./prefs"
import { holdQuiet, pauseFor, quietEnd, Reminder, snoozeFor } from "./reminder"

export type Ports = {
  now: () => number
  interval: () => number
  prefs: () => Pick<Prefs, "every" | "quiet" | "quietFrom" | "quietTo">
  open: (start?: Prefs["start"]) => void
  /** Ends whatever break is on screen; called whether or not there is one. */
  close: () => void
  push: () => void
}

export class Core {
  private readonly reminder: Reminder
  private pausedUntil = 0

  constructor(private readonly p: Ports, gap?: number) {
    this.reminder = new Reminder(p.now(), p.interval(), gap)
  }

  state() {
    const now = this.p.now(), { quiet, quietFrom, quietTo } = this.p.prefs()
    return { next: this.reminder.nextBreakAt, quiet: quiet ? quietEnd(now, quietFrom, quietTo) : 0, paused: this.pausedUntil > now ? this.pausedUntil : 0 }
  }

  tick() {
    const now = this.p.now()
    if (this.pausedUntil && now >= this.pausedUntil) this.pausedUntil = 0
    const event = this.reminder.tick(now)
    if (event === "start" && !holdQuiet(this.reminder, now, this.p.prefs())) this.p.open()
    // after a sleep the reminder has begun a fresh interval; a break still showing just closes
    if (event === "reset") this.p.close()
  }

  retime() {
    this.reminder.setInterval(this.p.now(), this.p.interval())
  }

  breakNow(start?: Prefs["start"]) {
    if (this.reminder.start(this.p.now())) this.p.open(start)
  }

  /** On a break it ends and the next counts from now; otherwise the coming one is skipped and the one after keeps its time. */
  finish() {
    if (this.reminder.running) {
      this.reminder.finish(this.p.now())
      this.p.close()
      this.p.push()
    } else this.skip()
  }

  skip() {
    this.reminder.postpone(this.p.now(), this.p.interval())
    this.p.push()
  }

  snooze() {
    this.finish()
    snoozeFor(this.reminder, this.p.now(), { every: this.p.prefs().every, paused: this.state().paused }, this.p.interval())
    this.p.push()
  }

  pause(ms: number) {
    if (this.reminder.running) this.finish()
    this.pausedUntil = pauseFor(this.reminder, this.p.now(), ms, this.p.interval())
    this.p.push()
  }

  /** The next `n` break times, each held to the end of quiet hours when it falls inside them. */
  upcoming(n: number) {
    const { quiet, quietFrom, quietTo } = this.p.prefs(), every = this.p.interval()
    let at = this.reminder.nextBreakAt ?? this.p.now() + every
    return Array.from({ length: n }, () => {
      const t = (quiet && quietEnd(at, quietFrom, quietTo)) || at
      at = t + every
      return t
    })
  }
}
