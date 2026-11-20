<script setup lang="ts">
import { inApp } from "./bridge"
import FullscreenToggle from "./FullscreenToggle.vue"

defineProps<{ full: boolean }>()
const emit = defineEmits<{ full: [on: boolean]; close: [] }>()
</script>

<template>
  <span class="controls">
    <FullscreenToggle :full="inApp ? full : undefined" :act="inApp ? () => emit('full', !full) : undefined" />
    <button v-if="inApp" type="button" class="tool" aria-label="Close" @click="emit('close')">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
    </button>
  </span>
</template>

<style scoped>
.controls { display: inline-flex; align-items: center; gap: 22px; }
svg { width: 20px; height: 20px; }
</style>
