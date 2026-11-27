<script setup lang="ts">
import { TabsList, TabsTab } from "@ui-sdk/vue/tabs"
import { nextTick, onMounted, useTemplateRef, watch } from "vue"
import WaterLine from "./WaterLine.vue"

const { active } = defineProps<{ tabs: readonly { id: string; label: string }[]; active: string }>()
const list = useTemplateRef("list")
const reveal = () => nextTick(() => list.value?.$el.querySelector("[data-selected]")?.scrollIntoView({ inline: "nearest", block: "nearest" }))
onMounted(reveal)
watch(() => active, reveal)
</script>

<template>
  <TabsList ref="list" class="tabs" aria-label="Settings sections">
    <TabsTab v-for="t in tabs" :key="t.id" :value="t.id" class="word">{{ t.label }}<WaterLine /></TabsTab>
  </TabsList>
</template>

<style>
.tabs { position: absolute; top: 92px; bottom: 100px; left: max(24px, env(safe-area-inset-left)); right: 24px; display: flex; flex-direction: column; align-items: flex-start; justify-content: safe center; gap: 0.9em; overflow-y: auto; scrollbar-width: none; color: var(--ivory); font: 400 20px var(--serif); }
.tabs::-webkit-scrollbar { display: none; }
.tabs .word { opacity: 0.72; transition: opacity var(--dur); white-space: nowrap; flex: none; }
.tabs .word[data-selected] { --draw: 0; opacity: 1; }
@media (max-height: 480px) { .tabs { top: 68px; bottom: 120px; gap: 0; } .tabs .word { min-height: 40px; } }
@media (max-width: 40rem) {
  .tabs { top: auto; bottom: max(0px, env(safe-area-inset-bottom)); left: 0; right: 0; height: 44px; padding-inline: max(16px, env(safe-area-inset-left)); flex-direction: row; align-items: center; justify-content: flex-start; gap: clamp(0.6em, 3.5vw, 1.6em); overflow: auto hidden; }
}
</style>
