<script setup lang="ts">
import { computed } from "vue"
import { HOURS, TEMPS, WEATHERS, skyFor, type Choice, type Hour, type Temp, type Weather } from "../../shared/fixtures"
import { degrees } from "../../shared/prefs"
import { paletteOf } from "../../shared/sea"
import { sceneOf, type Sky } from "../../shared/sky"
import WeatherIcon from "./WeatherIcon.vue"

// spelled out, as Vue's compiler can't follow an imported type into props
const props = defineProps<{ hour: Hour | ""; sky: Weather | ""; temp: Temp | ""; live: Sky; unit: "auto" | "c" | "f" }>()
const emit = defineEmits<{ choose: [choice: Choice] }>()

const css = (c: readonly number[]) => `rgb(${c.map(Math.round).join(" ")})`
const now = computed<Choice>(() => ({ hour: props.hour, sky: props.sky, temp: props.temp }))
const paint = (choice: Choice) => {
  const sky = skyFor(choice, props.live), scene = sceneOf(sky), p = paletteOf(scene)
  return { choice, sky, day: scene.sun, background: `linear-gradient(${css(p.top)}, ${css(p.haze)} 56%, ${css(p.sea)} 57%, ${css(p.deep)})` }
}
const title = (name: string) => name[0]!.toUpperCase() + name.slice(1)
const rows = computed(() => [
  { name: "Time of day", choices: (["", ...HOURS] as const).map((hour) => ({ ...paint({ ...now.value, hour }), on: props.hour === hour, label: hour ? title(hour) : "Live" })) },
  { name: "Weather", choices: (["", ...Object.keys(WEATHERS)] as (Weather | "")[]).map((sky) => ({ ...paint({ ...now.value, sky }), on: props.sky === sky, label: sky ? WEATHERS[sky].condition : "Live" })) },
  { name: "Temperature", choices: (["", ...Object.keys(TEMPS)] as (Temp | "")[]).map((temp) => ({ ...paint({ ...now.value, temp }), on: props.temp === temp, label: temp ? title(temp) : "Live" })) },
])
</script>

<template>
  <div class="picker">
    <div v-for="row in rows" :key="row.name" class="row" role="radiogroup" :aria-label="row.name">
      <button v-for="c in row.choices" :key="c.label" type="button" role="radio" :aria-checked="c.on" class="choice" @click="emit('choose', c.choice)">
        <i aria-hidden="true" :style="{ background: c.background }">
          <WeatherIcon v-if="row.name === 'Weather'" :condition="c.sky.condition" :day="c.day" />
          <template v-else-if="row.name === 'Temperature'">{{ degrees(c.sky.temp, unit) }}</template>
        </i>{{ c.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.picker { display: grid; gap: 16px; font: 400 13px / 1 var(--sans); }
.row { display: flex; gap: 14px; overflow-x: auto; scroll-snap-type: x proximity; scrollbar-width: none; padding: 6px 2px; margin: -6px -2px; }
.choice { display: grid; justify-items: center; gap: 8px; flex: none; min-width: 58px; scroll-snap-align: start; opacity: 0.72; transition: opacity 0.2s; white-space: nowrap; }
.choice:is(:hover, :focus-visible, [aria-checked="true"]) { opacity: 1; }
.choice i { display: grid; place-items: center; width: 58px; height: 40px; border-radius: 9px; color: var(--ivory); font-style: normal; font-variant-numeric: tabular-nums; text-shadow: 0 1px 2px rgb(0 0 0 / 0.35); box-shadow: inset 0 0 0 1px color-mix(in srgb, currentColor 22%, transparent); transition: box-shadow 0.2s, translate 0.2s; }
.choice[aria-checked="true"] i { box-shadow: inset 0 0 0 1px currentColor, 0 0 0 2px color-mix(in srgb, currentColor 35%, transparent); translate: 0 -2px; }
</style>
