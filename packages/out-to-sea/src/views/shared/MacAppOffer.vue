<script setup lang="ts">
import { onKeyStroke, useLocalStorage, useTimeoutFn } from "@vueuse/core"
import { computed, ref } from "vue"
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
onKeyStroke("Escape", () => shown.value && close())
</script>

<template>
  <Transition :css="false" @enter="rise.enter" @leave="rise.leave">
    <section v-if="shown" class="offer wash" aria-label="Out to Sea for Mac">
      <div class="copy">
        <p class="title">Out to Sea for Mac</p>
        <p class="sub">Breaks from the menu bar, even with the browser closed</p>
        <a class="word" href="https://github.com/cwdx/out-to-sea/releases/latest" target="_blank" rel="noopener" @click="close">Download<WaterLine /></a>
      </div>
      <button type="button" class="tool" aria-label="Close" @click="close">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </section>
  </Transition>
</template>

<style scoped>
.offer { position: absolute; right: var(--foot-right); bottom: calc(var(--foot-bottom) + 44px + 22px); display: flex; align-items: flex-start; gap: 1.6em; color: var(--ivory); --wash: var(--wash-for-light-ink); max-width: min(30rem, calc(100vw - var(--edge-left) - var(--foot-right))); text-align: right; }
.copy { display: flex; flex-direction: column; align-items: flex-end; gap: 0.35em; }
.title { font: 400 clamp(20px, 1.75vw, 30px) / 1.15 var(--serif); }
.sub { font: 400 clamp(14px, 1.1vw, 17px) / 1.3 var(--sans); opacity: 0.88; }
.word { margin-top: 0.7em; font: 400 clamp(18px, 1.4vw, 24px) / 1.2 var(--serif); color: inherit; text-decoration: none; }
.tool { flex: none; margin: -10px -10px 0 0; }
@media (max-width: 40rem) { .offer { left: var(--edge-left); max-width: none; justify-content: space-between; text-align: left; } .copy { align-items: flex-start; } }
</style>
