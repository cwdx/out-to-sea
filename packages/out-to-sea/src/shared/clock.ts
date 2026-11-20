export type Pattern = readonly [inhale: number, holdFull: number, exhale: number, holdEmpty: number]
const PHASES = ["Breathe in.", "Hold.", "Breathe out.", "Hold."] as const

export const pattern = (inhale: number, holdFull: number, exhale: number, holdEmpty: number): Pattern => {
  const all = [inhale, holdFull, exhale, holdEmpty] as const
  if (all.some((s) => !Number.isFinite(s) || s < 0) || inhale <= 0 || exhale <= 0) throw new RangeError("Inhale and exhale must be positive, and holds zero or more.")
  return all
}
export const simple = (inhale = 4, exhale = 6) => pattern(inhale, 0, exhale, 0)
export const box = (seconds = 4) => pattern(seconds, seconds, seconds, seconds)

export type Phase = { index: 0 | 1 | 2 | 3; label: (typeof PHASES)[number]; progress: number; level: number; left: number }

export const phaseAt = (elapsed: number, p: Pattern): Phase => {
  if (!Number.isFinite(elapsed)) throw new RangeError("Time must be finite.")
  const cycle = p[0] + p[1] + p[2] + p[3]
  let u = Math.max(0, elapsed) % cycle
  for (const index of [0, 1, 2, 3] as const) {
    if (u < p[index]) {
      const progress = u / p[index], ease = (1 - Math.cos(Math.PI * progress)) / 2
      return { index, label: PHASES[index], progress, level: [ease, 1, 1 - ease, 0][index]!, left: p[index] - u }
    }
    u -= p[index]
  }
  // floating point at the very end of a cycle
  return { index: 0, label: PHASES[0], progress: 0, level: 0, left: p[0] }
}
