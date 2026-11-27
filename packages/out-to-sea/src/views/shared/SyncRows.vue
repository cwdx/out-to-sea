<script setup lang="ts">
import { Switch, SwitchThumb } from "@ui-sdk/vue/switch"
import { computed } from "vue"

const { on, at } = defineProps<{ on: boolean; at?: number }>()
const emit = defineEmits<{ toggle: [on: boolean]; add: [] }>()
const synced = computed(() => {
  if (!at) return "Never"
  const s = Math.round((Date.now() - at) / 1000)
  return s < 60 ? "Just now" : new Intl.RelativeTimeFormat([], { numeric: "auto" }).format(-Math.round(s / (s < 3600 ? 60 : s < 86400 ? 3600 : 86400)), s < 3600 ? "minute" : s < 86400 ? "hour" : "day")
})
</script>

<template>
  <label class="row">Sync across devices
    <Switch :model-value="on" class="switch" @update:model-value="emit('toggle', $event)"><SwitchThumb class="thumb" /></Switch>
  </label>
  <template v-if="on">
    <div class="row"><span>Add a device</span>
      <button type="button" class="link touch" @click="emit('add')">Show code</button>
    </div>
    <div class="row"><span>Synced</span><span class="when">{{ synced }}</span></div>
  </template>
</template>

<style scoped>
.when { color: var(--muted); }
</style>
