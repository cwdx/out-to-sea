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

  get running() {
    return this.active
  }

  get nextBreakAt(): number | null {
    return this.active ? null : this.deadline
  }
}
