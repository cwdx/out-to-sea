import { tryOnScopeDispose, useEventListener, useIntervalFn, useWindowFocus } from "@vueuse/core"
import { computed, ref, watch } from "vue"
import type { Phase } from "../../shared/clock"
import type { Scene } from "../../shared/sky"
import { oceanSynth, type OceanSynth } from "./synth"

export const useOcean = (initial: boolean, onChange?: (on: boolean) => void, volume = 0.4) => {
  const on = ref(initial)
  let synth: OceanSynth | undefined
  try {
    synth = oceanSynth()
    synth.level(volume)
    synth.mute(!initial)
  } catch {
  }
  const wake = () => void synth?.wake()
  wake()
  useEventListener("pointerdown", wake, { once: true })
  useEventListener("keydown", wake, { once: true })
  tryOnScopeDispose(() => synth?.close())
  return {
    on,
    toggle: () => {
      on.value = !on.value
      wake()
      synth?.mute(!on.value)
      onChange?.(on.value)
    },
    follow: (swell: number, scene?: Scene) => synth?.follow(swell, scene),
    breath: (phase?: Phase) => synth?.breath(phase),
    chime: (kind?: "turn" | "end") => on.value && synth?.chime(kind),
    thunder: (near: number) => on.value && synth?.thunder(near),
    plop: () => on.value && synth?.plop(),
    fade: () => synth?.fadeOut(),
    level: (v: number) => synth?.level(v),
  }
}

export const useSeaSound = (on: () => boolean, volume: () => number, scene: () => Scene | undefined) => {
  const focused = useWindowFocus(), heard = computed(() => on() && focused.value)
  const ocean = useOcean(heard.value, undefined, volume())
  watch(heard, (v) => v !== ocean.on.value && ocean.toggle())
  watch(volume, (v) => ocean.level(v))
  useIntervalFn(() => ocean.follow(0.35 + 0.25 * Math.sin(performance.now() * 0.0006), scene()), 100)
}
