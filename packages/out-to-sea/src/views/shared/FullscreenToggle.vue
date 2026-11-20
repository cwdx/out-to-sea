<script setup lang="ts">
import { useFullscreen } from "@vueuse/core"
import { computed } from "vue"
import { inApp } from "./bridge"

const props = withDefaults(defineProps<{ full?: boolean; act?: () => void }>(), { full: undefined, act: undefined })
const { isSupported, isFullscreen, toggle } = useFullscreen()
const on = computed(() => props.full ?? isFullscreen.value)
</script>

<template>
  <button v-if="act || (isSupported && !inApp)" type="button" class="tool" :aria-pressed="on" aria-label="Full screen" @click="act ? act() : toggle()">
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path v-if="on" d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
      <path v-else d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </svg>
  </button>
</template>

<style scoped>
svg { width: 22px; height: 22px; }
</style>
