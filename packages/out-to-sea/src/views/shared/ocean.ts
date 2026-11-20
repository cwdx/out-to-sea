import { tryOnScopeDispose, useEventListener, useIntervalFn, useWindowFocus } from "@vueuse/core"
import { computed, ref, watch } from "vue"
import type { Phase } from "../../shared/clock"
import type { Scene } from "../../shared/sky"
import { inApp } from "./bridge"
import { oceanSynth, type OceanSynth } from "./synth"

/** `focus`: heard only while its window has the focus; a browser tab always, a Mac break never, as its windows are not activated. */
export const useOcean = (initial: boolean, onChange?: (on: boolean) => void, volume = 0.4, focus = !inApp) => {
  const on = ref(initial), focused = useWindowFocus()
  const heard = computed(() => on.value && (!focus || focused.value))
  let synth: OceanSynth | undefined
  try {
    synth = oceanSynth()
    synth.level(volume)
    synth.mute(!heard.value)
  } catch {
  }
  const wake = () => void synth?.wake()
  wake()
  useEventListener("pointerdown", wake, { once: true })
  useEventListener("keydown", wake, { once: true })
  watch(heard, (h) => synth?.mute(!h))
  tryOnScopeDispose(() => synth?.close())
  return {
    on,
    toggle: () => {
      on.value = !on.value
      wake()
      onChange?.(on.value)
    },
    follow: (swell: number, scene?: Scene) => synth?.follow(swell, scene),
    breath: (phase?: Phase) => synth?.breath(phase),
    chime: (kind?: "turn" | "end") => heard.value && synth?.chime(kind),
    thunder: (near: number) => heard.value && synth?.thunder(near),
    plop: () => heard.value && synth?.plop(),
    fade: () => synth?.fadeOut(),
    level: (v: number) => synth?.level(v),
  }
}

export const useSeaSound = (on: () => boolean, volume: () => number, scene: () => Scene | undefined) => {
  const ocean = useOcean(on(), undefined, volume(), true)
  watch(on, (v) => v !== ocean.on.value && ocean.toggle())
  watch(volume, (v) => ocean.level(v))
  useIntervalFn(() => ocean.follow(0.35 + 0.25 * Math.sin(performance.now() * 0.0006), scene()), 100)
}
