<script setup lang="ts">
import { onKeyStroke, useDraggable, useEventListener, useLocalStorage, useTimeoutFn } from "@vueuse/core"
import { computed, ref, useTemplateRef } from "vue"
import { inApp } from "./bridge"
import { useRise } from "./motion"
import WaterLine from "./WaterLine.vue"

const dismissed = useLocalStorage("out-to-sea.mac-offer", false)
const ready = ref(false)
const rise = useRise()
const onMac = () => {
  const { userAgentData, userAgent, maxTouchPoints } = navigator as Navigator & { userAgentData?: { platform: string } }
  return userAgentData ? userAgentData.platform === "macOS" : userAgent.includes("Macintosh") && maxTouchPoints === 0
}
const eligible = !inApp && onMac() && window.top === window.self
useTimeoutFn(() => (ready.value = true), 4000, { immediate: eligible })
const shown = computed(() => eligible && ready.value && !dismissed.value)
const close = () => (dismissed.value = true)

// it rests at the corner by its CSS; the first drag hands it to left and top, and it never leaves the window
const offer = useTemplateRef("offer")
const placed = ref(false)
const keepInside = () => {
  const el = offer.value
  if (!el) return
  drag.x.value = Math.min(Math.max(0, drag.x.value), window.innerWidth - el.offsetWidth)
  drag.y.value = Math.min(Math.max(0, drag.y.value), window.innerHeight - el.offsetHeight)
}
const drag = useDraggable(offer, {
  onStart: () => {
    if (placed.value || !offer.value) return
    drag.x.value = offer.value.offsetLeft
    drag.y.value = offer.value.offsetTop
    placed.value = true
  },
  onMove: keepInside,
})
const dragStyle = computed(() => (placed.value ? `${drag.style.value} right: auto; bottom: auto;` : undefined))
useEventListener(window, "resize", () => placed.value && keepInside())
onKeyStroke("Escape", () => shown.value && close())
</script>

<template>
  <Transition :css="false" @enter="rise.enter" @leave="rise.leave">
    <section v-if="shown" ref="offer" class="offer" :style="dragStyle" aria-label="Out to Sea for Mac">
      <div class="copy">
        <p class="title">Out to Sea for Mac</p>
        <p class="sub">Breaks from the menu bar, even with the browser closed</p>
        <a class="word" href="https://github.com/cwdx/out-to-sea/releases/latest" target="_blank" rel="noopener" @click="close">Download<WaterLine /></a>
      </div>
      <button type="button" class="tool" aria-label="Close" @click="close">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </section>
  </Transition>
</template>

<style scoped>
.offer { position: absolute; z-index: 10; cursor: grab; touch-action: none; isolation: isolate; overflow: hidden; right: var(--foot-right); bottom: calc(var(--foot-bottom) + 44px + 22px); display: flex; align-items: flex-start; gap: 1.6em; padding: 1.7em 1.6em 2.1em 2em; border-radius: 28px; color: #fff; max-width: min(27rem, calc(100vw - var(--edge-left) - var(--foot-right)));
  background: linear-gradient(140deg, rgb(255 255 255 / 0.2), rgb(255 255 255 / 0.05) 55%, rgb(255 255 255 / 0));
  -webkit-backdrop-filter: blur(10px) saturate(1.4); backdrop-filter: blur(10px) saturate(1.4);
  box-shadow: inset 1.5px 1.5px 0 rgb(255 255 255 / 0.55), inset -1px -1px 0 rgb(255 255 255 / 0.14), inset 0 0 28px rgb(255 255 255 / 0.05), 0 18px 50px rgb(8 24 44 / 0.22); }
.offer::before { content: ""; position: absolute; z-index: -1; inset: 0; pointer-events: none; background: radial-gradient(120% 90% at 0% 0%, rgb(255 255 255 / 0.16), transparent 60%); }
.copy { display: flex; flex-direction: column; align-items: flex-start; gap: 0.4em; text-shadow: 0 1px 14px rgb(8 24 44 / 0.35); }
.title { font: 400 clamp(21px, 1.8vw, 31px) / 1.15 var(--serif); }
.sub { font: 400 clamp(14px, 1.1vw, 17px) / 1.35 var(--sans); opacity: 0.92; text-wrap: balance; }
.word { margin-top: 0.8em; font: 400 clamp(18px, 1.4vw, 24px) / 1.2 var(--serif); color: inherit; text-decoration: none; --draw: 0; }
.offer:active { cursor: grabbing; }
.word, .tool { cursor: pointer; }
.tool { flex: none; margin: -14px -14px 0 auto; color: inherit; opacity: 0.85; }
@media (max-width: 40rem) { .offer { left: var(--edge-left); max-width: none; } .copy { flex: 1; } }
</style>
