<script setup lang="ts">
import { TabsList, TabsTab } from "@ui-sdk/vue/tabs"
import { nextTick, onMounted, useTemplateRef, watch } from "vue"
import WaterLine from "./WaterLine.vue"

const { active } = defineProps<{ tabs: readonly { id: string; label: string; apart?: boolean }[]; active: string }>()
const list = useTemplateRef("list")
const reveal = () => nextTick(() => list.value?.$el.querySelector("[data-selected]")?.scrollIntoView({ inline: "center", block: "nearest" }))
onMounted(reveal)
watch(() => active, reveal)
</script>

<template>
  <TabsList ref="list" class="tabs wash" aria-label="Settings sections">
    <TabsTab v-for="t in tabs" :key="t.id" :value="t.id" class="word" :class="{ apart: t.apart }">{{ t.label }}<WaterLine /></TabsTab>
  </TabsList>
</template>

<style>
/* the section words rest in the open sky above the horizon, 54.5% down, as the main screen's words do, in the ink that sky asks for */
.tabs { position: absolute; z-index: 1; top: 92px; bottom: calc(45.5% + 12px); left: max(24px, env(safe-area-inset-left)); display: flex; flex-direction: column; align-items: flex-start; justify-content: safe center; gap: 0.85em; font: 400 clamp(20px, 1.7vw, 24px) / 1.2 var(--serif); animation: rise var(--dur-slow) var(--ease) both; }
.tabs::before { inset: -45% -110px; background: radial-gradient(closest-side, var(--wash) 35%, transparent); }
.tabs .word { flex: none; white-space: nowrap; opacity: 0.72; text-shadow: 0 0 4px var(--wash), 0 0 14px var(--wash); transition: opacity var(--dur) var(--ease); }
.tabs .word:is(:hover, :focus-visible) { opacity: 0.92; }
.tabs .word:focus-visible { outline-offset: 2px; border-radius: 8px; }
.tabs .word[data-selected] { --draw: 0; opacity: 1; }
.tabs .waterline { transition: opacity var(--dur) var(--ease); }
.tabs .word:not([data-selected]) .waterline { opacity: 0.5; }
.tabs .apart { margin-top: 0.25em; }
@media (pointer: coarse) { .tabs { gap: 0; } .tabs .apart { margin-top: 0.6em; } }
@media (max-height: 560px) and (min-width: 40.01rem) {
  .tabs { top: 68px; display: grid; grid-template-rows: repeat(3, auto); grid-auto-flow: column; align-content: safe center; justify-items: start; gap: 0 2em; }
  .tabs .word { display: inline-flex; align-items: center; min-height: 40px; margin-block: 0; padding-block: 0 0.2em; }
  .tabs .apart { margin-top: 0; }
}
@media (max-width: 40rem) {
  .tabs { top: auto; bottom: 0; left: 0; right: 0; height: 56px; padding-block: 6px; padding-inline: max(20px, env(safe-area-inset-left)) max(20px, env(safe-area-inset-right)); flex-direction: row; align-items: center; justify-content: space-between; gap: 14px; overflow: auto hidden; scrollbar-width: none; color: var(--ivory); font-size: 20px; mask-image: linear-gradient(to right, transparent, black 20px, black calc(100% - 20px), transparent); }
  .tabs::-webkit-scrollbar, .tabs::before { display: none; }
  .tabs .word { justify-content: center; text-shadow: none; }
  .tabs .apart { margin-top: 0; }
}
@media (max-width: 40rem) and (prefers-reduced-motion: no-preference) { .tabs { scroll-behavior: smooth; } }
</style>
