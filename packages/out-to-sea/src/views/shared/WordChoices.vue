<script lang="ts">
import type { Send } from "./web-host"
import WaterLine from "./WaterLine.vue"

export type Choice = { label: string; act: () => void; aria?: string }
export const mainChoices = (send: Send, skip = true): Choice[] => [
  { label: "Take a break now", act: () => send.breakNow({}) },
  { label: "Breathe", act: () => send.breakNow({ start: "breathe" }) },
  ...(skip ? [{ label: "Skip next", act: () => send.finish({}) }] : []),
]
</script>

<script setup lang="ts">
defineProps<{ choices: Choice[]; quiet?: boolean }>()
</script>

<template>
  <div class="choices swell" :class="{ quiet }">
    <button v-for="c in choices" :key="c.label" type="button" class="word" :aria-label="c.aria" @click="c.act">{{ c.label }}<WaterLine /></button>
  </div>
</template>

<style>
.choices:not(.quiet) .word:first-child { --draw: 0; }
.choices:not(.quiet):has(.word:hover, .word:focus-visible) .word:first-child:not(:hover, :focus-visible) { --draw: 1; }
</style>
