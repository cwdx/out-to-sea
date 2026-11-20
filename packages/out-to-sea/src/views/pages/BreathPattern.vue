<script setup lang="ts">
import { NumberInput, NumberInputControl, NumberInputDecrement, NumberInputGroup, NumberInputIncrement } from "@ui-sdk/vue/number-input"
import { computed } from "vue"
import type { Prefs } from "../../shared/prefs"

const model = defineModel<Prefs["breathing"]>({ required: true })
const PHASES = [
  { label: "In", name: "Breathe in", min: 1 },
  { label: "Hold", name: "Hold after breathing in", min: 0 },
  { label: "Out", name: "Breathe out", min: 1 },
  { label: "Hold", name: "Hold after breathing out", min: 0 },
] as const

const change = (i: number, value: number | null) => {
  if (value === null || !Number.isFinite(value)) return
  const next = [...model.value] as Prefs["breathing"]
  next[i] = Math.max(PHASES[i]!.min, value)
  model.value = next
}

const curve = computed(() => {
  const p = model.value, total = p[0] + p[1] + p[2] + p[3], W = 400, top = 8, low = 52
  const x = (s: number) => (s / total) * W
  const a = x(p[0]), b = a + x(p[1]), c = b + x(p[2])
  return `M0 ${low} C${a * 0.5} ${low} ${a * 0.5} ${top} ${a} ${top} L${b} ${top} C${b + (c - b) * 0.5} ${top} ${b + (c - b) * 0.5} ${low} ${c} ${low} L${W} ${low}`
})
</script>

<template>
  <div class="pattern">
    <svg class="curve" viewBox="0 0 400 60" preserveAspectRatio="none" aria-hidden="true">
      <path :d="`${curve} L400 60 L0 60 Z`" class="fill" />
      <path :d="curve" class="line" />
    </svg>
    <div class="phases">
      <div v-for="(phase, i) in PHASES" :key="phase.name" class="phase">
        <span aria-hidden="true">{{ phase.label }}</span>
        <NumberInput :value="model[i]" :min="phase.min" :max="30" :step="1" class="number" @value-change="(v: number | null) => change(i, v)">
          <NumberInputGroup class="group">
            <NumberInputControl :aria-label="`${phase.name}, in seconds`" class="control" />
            <span class="unit" aria-hidden="true">s</span>
            <span class="steps">
              <NumberInputIncrement :aria-label="`One second longer: ${phase.name}`" class="step">▴</NumberInputIncrement>
              <NumberInputDecrement :aria-label="`One second shorter: ${phase.name}`" class="step">▾</NumberInputDecrement>
            </span>
          </NumberInputGroup>
        </NumberInput>
      </div>
    </div>
  </div>
</template>

<style>
.pattern { display: grid; gap: 10px; }
.pattern {
  .curve { width: 100%; height: 44px; }
  .curve .fill { fill: color-mix(in srgb, var(--teal) 12%, transparent); }
  .curve .line { fill: none; stroke: var(--teal); stroke-width: 2; vector-effect: non-scaling-stroke; }
  .phases { display: grid; grid-template-columns: repeat(4, 1fr); }
  .phase { display: grid; justify-items: center; gap: 6px; padding: 0 6px; }
  .phase + .phase { border-left: 1px solid var(--paper-line); }
  .group { display: inline-flex; align-items: center; gap: 4px; padding: 3px 4px 3px 10px; border: 1px solid var(--paper-line); border-radius: 7px; background: var(--field); }
  .group input { width: 2.4ch; min-width: 0; padding: 0; border: 0; background: none; font: inherit; color: inherit; text-align: right; font-variant-numeric: tabular-nums; }
  .group input:focus-visible { outline: none; }
  .group:focus-within { outline: 2px solid var(--teal); outline-offset: 2px; }
  .unit { color: var(--muted); margin-right: 4px; }
  .steps { display: grid; line-height: 0.75; }
  .step { font-size: 10px; color: var(--muted); padding: 0 2px; }
}
</style>
