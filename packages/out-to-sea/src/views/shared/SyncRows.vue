<script setup lang="ts">
import { Switch, SwitchThumb } from "@ui-sdk/vue/switch"
import type { Device } from "../../shared/sync-service"

const { on, devices = [], busy = false, adding = false, linked = false, failed = false } = defineProps<{ on: boolean; at?: number; devices?: Device[]; busy?: boolean; adding?: boolean; linked?: boolean; failed?: boolean }>()
const emit = defineEmits<{ toggle: [on: boolean]; add: []; link: [] }>()
const KIND = { mac: "Mac", android: "Android", ios: "iPhone", web: "Browser" } as const
const ago = (at: number) => {
  const s = Math.round((Date.now() - at) / 1000)
  return s < 60 ? "Just now" : new Intl.RelativeTimeFormat([], { numeric: "auto" }).format(-Math.round(s / (s < 3600 ? 60 : s < 86400 ? 3600 : 86400)), s < 3600 ? "minute" : s < 86400 ? "hour" : "day")
}
</script>

<template>
  <label class="row">
    <span class="stack">Sync across devices<small v-if="busy" role="status">Turning on…</small><small v-else-if="failed" role="status">Couldn't turn on. Try again.</small></span>
    <Switch data-sync-switch :model-value="on" :disabled="busy" class="switch" @update:model-value="emit('toggle', $event)"><SwitchThumb class="thumb" /></Switch>
  </label>
  <div v-if="!on" class="row"><span>Link</span>
    <button type="button" class="link touch" @click="emit('link')">Enter</button>
  </div>
  <template v-else>
    <div class="row"><span>Add a device</span>
      <button type="button" class="link touch" :disabled="adding" @click="emit('add')">{{ adding ? "Making a code…" : "Show code" }}</button>
    </div>
    <div class="row"><span>Synced</span><span class="when" :class="{ linked }" :role="linked ? 'status' : undefined">{{ linked ? "Linked" : at ? ago(at) : "Never" }}</span></div>
    <template v-if="devices.length">
      <h3>Linked devices</h3>
      <div v-for="d in devices" :key="d.id" class="row">
        <span class="stack">{{ d.name }}<small>{{ d.self ? "This device" : `${KIND[d.kind]} · ${ago(d.at)}` }}</small></span>
      </div>
    </template>
  </template>
</template>

<style scoped>
.when { color: var(--muted); }
.when.linked { color: var(--teal); }
h3 { font: 500 12px/1 var(--sans); color: var(--muted); margin: 18px 0 4px; }
.link:disabled { opacity: 0.6; cursor: default; }
</style>
