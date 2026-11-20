<script setup lang="ts">
import { inApp } from "./bridge"

const props = defineProps<{ picture: () => Promise<Blob | undefined> | undefined }>()
const save = async () => {
  const blob = await props.picture()
  if (!blob) return
  const link = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "out-to-sea.png" })
  link.click()
  URL.revokeObjectURL(link.href)
}
</script>

<template>
  <button v-if="!inApp" type="button" class="tool" aria-label="Save this sea as a picture" @click="save">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7.5 11 12 15.5 16.5 11M5 19.5h14" /></svg>
  </button>
</template>

<style scoped>
svg { width: 22px; height: 22px; }
</style>
