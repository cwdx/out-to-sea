<script setup lang="ts">
import { computed } from "vue"

const props = defineProps<{ condition: string; day: boolean }>()
const kind = computed(() => {
  const c = props.condition.toLowerCase()
  if (/snow/.test(c)) return "snow"
  if (/rain|drizzle|shower|thunder/.test(c)) return "rain"
  if (/fog/.test(c)) return "fog"
  if (/cloud|overcast/.test(c)) return "cloud"
  return props.day ? "sun" : "moon"
})
</script>

<template>
  <svg class="weather-icon" viewBox="0 0 24 24" aria-hidden="true">
    <template v-if="kind === 'sun'"><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.3 5.3l1.7 1.7M17 17l1.7 1.7M5.3 18.7L7 17M17 7l1.7-1.7" /></template>
    <path v-else-if="kind === 'moon'" d="M19 14.5A7.5 7.5 0 1 1 9.5 5a6 6 0 0 0 9.5 9.5Z" />
    <template v-else>
      <path d="M7 17.5h10.5a3.8 3.8 0 0 0 .4-7.6A5.6 5.6 0 0 0 7.2 9.1 4.3 4.3 0 0 0 7 17.5Z" />
      <path v-if="kind === 'rain'" d="M9 20l-1 2M13 20l-1 2M17 20l-1 2" />
      <path v-else-if="kind === 'snow'" d="M9 20.5h.01M13 21.5h.01M17 20.5h.01" />
      <path v-else-if="kind === 'fog'" d="M4 20.5h16" />
    </template>
  </svg>
</template>

<style scoped>
.weather-icon { width: 1.25em; height: 1.25em; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
</style>
