/** The one reminder. The main process ticks it with the wall clock, so sleep and clock corrections show up as gaps. */
export type ReminderEvent = "idle" | "start" | "reset"

const positive = (ms: number) => {
  if (!Number.isFinite(ms) || ms <= 0) throw new RangeError("Expected a positive duration in ms")
  return ms
}

export class Reminder {
  private interval: number
  private last: number
  private deadline: number
  private active = false

  /** `gap` is how long between two ticks counts as a sleep: anything longer, or a clock that went backwards, starts over. */
  constructor(now: number, interval = 20 * 60_000, private readonly gap = 90_000) {
    this.interval = positive(interval)
    positive(gap)
    this.last = now
    this.deadline = now + this.interval
  }

  tick(now: number): ReminderEvent {
    const elapsed = now - this.last
    this.last = now
    if (elapsed < 0 || elapsed >= this.gap) {
      this.finish(now)
      return "reset"
    }
    if (this.active || now < this.deadline) return "idle"
    this.start(now)
    return "start"
  }

  start(now: number) {
    if (this.active) return false
    this.active = true
    this.last = now
    return true
  }

  finish(now: number) {
    this.active = false
    this.last = now
    this.deadline = now + this.interval
  }

  setInterval(now: number, interval: number) {
    this.interval = positive(interval)
    if (!this.active) this.finish(now)
  }

  postpone(now: number, ms: number) {
    if (!this.active) this.deadline = Math.max(this.deadline, now) + positive(ms)
  }

  /** Ends the break and brings the next one back after `ms`, not a whole interval on. */
  snooze(now: number, ms: number) {
    this.active = false
    this.last = now
    this.deadline = now + positive(ms)
  }

  get running() {
    return this.active
  }

  get nextBreakAt(): number | null {
    return this.active ? null : this.deadline
  }
}

/** When quiet hours end if `at` falls inside them, else 0. They may run past midnight; the same hour twice is no quiet at all. */
export const quietEnd = (at: number, from: number, to: number) => {
  const d = new Date(at), h = d.getHours() + d.getMinutes() / 60
  if (from === to || !(from < to ? h >= from && h < to : h >= from || h < to)) return 0
  const end = new Date(at)
  end.setHours(to, 0, 0, 0)
  if (end.getTime() <= at) end.setDate(end.getDate() + 1)
  return end.getTime()
}

/** A break that comes due in quiet hours waits for their end. Returns that end, or 0 when the break may go ahead. */
export const holdQuiet = (r: Reminder, now: number, p: { quiet: boolean; quietFrom: number; quietTo: number }) => {
  const end = p.quiet ? quietEnd(now, p.quietFrom, p.quietTo) : 0
  if (end) r.snooze(now, end - now)
  return end
}

const SNOOZE = 5 * 60_000
const HOUR = 3_600_000
/** How long "Skip 2h" on a break keeps the reminders away. */
export const SKIP = 2 * HOUR
/** As a messaging app mutes a chat: for a while, or until undone. "Always" is ten years, so the arithmetic stays finite. */
export const PAUSES = [["1 hour", HOUR], ["8 hours", 8 * HOUR], ["1 week", 168 * HOUR], ["Always", 87_600 * HOUR]] as const

/** Pauses for `ms` and returns when the pause ends; 0 resumes. Either way the next break is a whole interval after it. */
export const pauseFor = (r: Reminder, now: number, ms: number, interval: number) => {
  r.setInterval(now, interval)
  if (ms) r.postpone(now, ms)
  return ms ? now + ms : 0
}

/** Ends a break and brings the next back soon, unless reminders are off or paused: then it only ends the break. */
export const snoozeFor = (r: Reminder, now: number, s: { every: number; paused: number }, interval: number) => {
  if (s.every && !s.paused) r.snooze(now, Math.min(SNOOZE, interval))
}

const clock = (at: number, now: number) => {
  const time = new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
  return at - now < 86_400_000 && new Date(at).getDate() === new Date(now).getDate() ? time : `${new Date(at).toLocaleDateString([], { weekday: "short" })} ${time}`
}

/** What the main screen and the menu say about the next break. */
export const nextLine = (s: { next: number | null; paused: number; quiet: number; every: number }, now: number) => {
  if (!s.every) return "No reminders"
  if (s.paused) return s.paused - now > 8_760 * HOUR ? "Paused" : `Paused until ${clock(s.paused, now)}`
  if (s.quiet) return `Quiet until ${clock(s.quiet, now)}`
  if (s.next === null) return "On a break"
  return `Next break in ${Math.max(1, Math.ceil((s.next - now) / 60_000))} min`
}
