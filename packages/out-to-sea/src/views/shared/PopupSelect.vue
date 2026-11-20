<script setup lang="ts" generic="T extends string | number">
import { Select, SelectContent, SelectItem, SelectItemIndicator, SelectTrigger, SelectValue } from "@ui-sdk/vue/select"

defineProps<{ options: readonly { value: T; label: string }[]; label: string }>()
const model = defineModel<T>({ required: true })
</script>

<template>
  <Select v-model:value="model">
    <SelectTrigger class="popup-trigger" :aria-label="label">
      <SelectValue class="popup-value" />
      <svg class="popup-chevron" viewBox="0 0 10 16" aria-hidden="true"><path d="M2 6l3-3 3 3M2 10l3 3 3-3" /></svg>
    </SelectTrigger>
    <SelectContent class="popup-list">
      <SelectItem v-for="o in options" :key="o.value" :value="o.value" class="popup-item">
        {{ o.label }}
        <SelectItemIndicator class="popup-check">✓</SelectItemIndicator>
      </SelectItem>
    </SelectContent>
  </Select>
</template>

<style>
.popup-trigger { display: inline-flex; align-items: center; justify-content: space-between; gap: 14px; min-width: 132px; padding: 6px 10px 6px 14px; border: 1px solid var(--paper-line); border-radius: 9px; background: var(--field); color: var(--sheet-ink); font: 400 15px/1.2 var(--sans); box-shadow: 0 1px 1px rgb(30 40 40 / 0.04); }
.popup-trigger:focus-visible { outline: 2px solid var(--teal); outline-offset: 2px; }
.popup-chevron { width: 9px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; opacity: 0.75; }
.popup-list { z-index: 60; min-width: var(--anchor-width); max-height: var(--available-height); overflow: auto; padding: 5px; border: 1px solid var(--paper-line); border-radius: 10px; background: #fffdf8; box-shadow: 0 10px 30px rgb(20 30 35 / 0.18); font: 400 14px/1.2 var(--sans); color: var(--ink-deep); }
.popup-item { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 7px 10px; border-radius: 6px; cursor: default; }
.popup-item[data-highlighted] { background: var(--teal); color: #fff; }
.popup-check { font-size: 12px; }
</style>
