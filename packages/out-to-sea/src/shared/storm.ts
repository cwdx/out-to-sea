const SLOT = 11
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

export type Strike = { flash: number; x: number; bolt: number; since: number; thunderAt: number }

export const strikeAt = (t: number, storm: number, seed: number): Strike => {
  const none = { flash: 0, x: 0, bolt: 0, since: -1, thunderAt: -1 }
  if (storm <= 0) return none
  const slot = Math.floor(t / SLOT)
  if (hash(slot * 3.1 + seed) > 0.35 + 0.6 * storm) return none
  const at = slot * SLOT + 1 + hash(slot * 7.7 + seed) * (SLOT - 3)
  const since = t - at
  if (since < 0) return none
  const flash = since < 0.6 ? Math.max(Math.exp(-since * 14), 0.8 * Math.exp(-Math.abs(since - 0.16) * 30)) + 0.35 * Math.exp(-since * 4) : 0
  return { flash: Math.min(1, flash), x: 0.45 + 0.4 * hash(slot * 1.9 + seed), bolt: hash(slot * 5.3 + seed) * 100, since, thunderAt: at + 1 + 2 * hash(slot * 2.3 + seed) }
}
