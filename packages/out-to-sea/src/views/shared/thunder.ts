import type { Scene } from "../../shared/sky"
import { strikeAt } from "../../shared/storm"

export const thunderFor = (rumble: (near: number) => void) => {
  let heard = -1
  return (t: number, scene: Scene | undefined, seed: number) => {
    if (!scene || scene.storm <= 0) return
    const s = strikeAt(t, scene.storm, seed % 997)
    if (s.thunderAt > 0 && t >= s.thunderAt && heard !== s.thunderAt) {
      heard = s.thunderAt
      rumble(1 - (s.thunderAt - (t - s.since) - 1) / 2)
    }
  }
}
